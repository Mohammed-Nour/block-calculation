import json
import sqlite3
import unittest
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from blockcalc.app import create_app
from blockcalc.backup import copy_database
from blockcalc.db import MIGRATIONS, migrate, transaction
from fastapi.testclient import TestClient


class OperationTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(self.enterContext(TemporaryDirectory()))
        self.source = self.directory / "live.sqlite3"
        self.client = self.enterContext(TestClient(create_app(self.source)))

    def test_health_checks_database_and_returns_service_unavailable_on_failure(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "schema_version": 2})
        with patch(
            "blockcalc.app.transaction",
            side_effect=sqlite3.OperationalError("unavailable"),
        ):
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)

    def test_documented_openapi_matches_the_application(self):
        snapshot = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"
        self.assertEqual(
            json.loads(snapshot.read_text()), self.client.get("/openapi.json").json()
        )

    def test_backup_restore_preserves_complete_records_and_original_prices(self):
        self.client.put(
            "/api/settings",
            json={
                "version": 1,
                "currency": "RUB",
                "full_molds": 10,
                "half_molds": 0,
                "sand_price_per_ton": "10",
                "stone_price_per_ton": "20",
                "cement_price_per_ton": "100.123456789",
                "sand_kg_per_wheelbarrow": "100",
                "stone_kg_per_wheelbarrow": "120",
                "mix_yields": [
                    {"id": mix_id, "full_yield": 35, "half_yield": 60}
                    for mix_id in range(1, 5)
                ],
            },
        ).raise_for_status()
        start = datetime.now(UTC) - timedelta(hours=72)
        project = self.client.post(
            "/api/projects",
            json={
                "name": "Restore order",
                "requested_start_at": start.isoformat(),
                "full_quantity": 10,
                "half_quantity": 0,
                "mix_id": 1,
            },
        ).json()
        base = f"/api/projects/{project['id']}"
        preview = self.client.post(
            base + "/calculate", json={"version": project["version"]}
        ).json()
        saved = self.client.post(
            base + "/estimates",
            json={
                "version": project["version"],
                "settings_version": preview["settings_version"],
            },
        ).json()
        plan = self.client.post(
            base + "/plan", json={"project_version": saved["version"]}
        ).json()
        run_id = plan["runs"][0]["id"]
        self.client.post(
            base + f"/runs/{run_id}/start",
            json={
                "event_key": "start",
                "started_at": start.isoformat(),
            },
        ).raise_for_status()
        self.client.post(
            base + f"/runs/{run_id}/ready",
            json={
                "event_key": "ready",
                "ready_at": (start + timedelta(hours=48)).isoformat(),
                "physically_checked": True,
            },
        ).raise_for_status()
        collection_payload = {
            "event_key": "collect",
            "full_quantity": 4,
            "half_quantity": 0,
            "collected_at": datetime.now(UTC).isoformat(),
        }
        response = self.client.post(base + "/collections", json=collection_payload)
        response.raise_for_status()
        original_detail = response.json()
        backup = self.directory / "daily.sqlite3"
        copy_database(self.source, backup)
        with transaction(self.source, write=True) as db:
            db.execute("UPDATE settings SET cement_price_per_ton = '120' WHERE id = 1")
        restored = self.directory / "restored.sqlite3"
        copy_database(backup, restored, upgrade=True)
        with TestClient(create_app(restored)) as client:
            self.assertEqual(client.get(base + "/production").json(), original_detail)
            replay = client.post(base + "/collections", json=collection_payload)
            self.assertEqual(replay.status_code, 200)
            self.assertEqual(replay.json(), original_detail)
        with transaction(restored) as db, transaction(backup) as snapshot:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            for table in (
                "settings",
                "mixes",
                "projects",
                "estimate_revisions",
                "production_runs",
                "collections",
                "audit_events",
            ):
                self.assertEqual(
                    [tuple(row) for row in db.execute(f"SELECT * FROM {table}")],
                    [tuple(row) for row in snapshot.execute(f"SELECT * FROM {table}")],
                )
            self.assertEqual(
                db.execute("SELECT cement_price_per_ton FROM settings").fetchone()[0],
                "100.123456789",
            )

    def test_restore_failure_retains_destination_and_rejects_same_path(self):
        target = self.directory / "existing.sqlite3"
        copy_database(self.source, target)
        before = target.read_bytes()
        corrupted = self.directory / "corrupted.sqlite3"
        corrupted.write_text("broken database")
        with self.assertRaises(sqlite3.DatabaseError):
            copy_database(corrupted, target, upgrade=True)
        self.assertEqual(target.read_bytes(), before)
        with self.assertRaises(ValueError):
            copy_database(self.source, self.source)

    def test_upgrade_from_initial_schema_preserves_existing_projects(self):
        old_migrations = self.directory / "migrations"
        old_migrations.mkdir()
        initial = MIGRATIONS / "001_initial.sql"
        (old_migrations / initial.name).write_bytes(initial.read_bytes())
        legacy = self.directory / "legacy.sqlite3"
        with patch("blockcalc.db.MIGRATIONS", old_migrations):
            migrate(legacy)
        with transaction(legacy, write=True) as db:
            db.execute("""
                INSERT INTO projects (name, requested_start_at, full_quantity, half_quantity, mix_id)
                VALUES ('Legacy draft', '2026-11-17T09:00:00+03:00', 10, 0, 1)
            """)
        migrate(legacy)
        with TestClient(create_app(legacy)) as client:
            response = client.get("/api/projects/1")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "Legacy draft")

    def test_online_backup_includes_committed_wal_data(self):
        with closing(sqlite3.connect(self.source)) as writer:
            writer.execute("PRAGMA journal_mode = WAL")
            writer.execute(
                "UPDATE settings SET cement_price_per_ton = '123.456' WHERE id = 1"
            )
            writer.commit()
            target = self.directory / "wal-backup.sqlite3"
            copy_database(self.source, target)
            with transaction(target) as db:
                self.assertEqual(
                    db.execute("SELECT cement_price_per_ton FROM settings").fetchone()[
                        0
                    ],
                    "123.456",
                )

    def test_restore_rejects_a_destination_with_an_active_journal(self):
        target = self.directory / "destination.sqlite3"
        copy_database(self.source, target)
        before = target.read_bytes()
        Path(str(target) + "-wal").touch()
        with self.assertRaisesRegex(ValueError, "checkpoint"):
            copy_database(self.source, target, upgrade=True)
        self.assertEqual(target.read_bytes(), before)
