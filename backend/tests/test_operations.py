import json
import sqlite3
import unittest
from contextlib import closing
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
        with transaction(self.source, write=True) as db:
            db.execute(
                "UPDATE settings SET cement_price_per_ton = '100.123456789' WHERE id = 1"
            )
            db.execute("""
                INSERT INTO projects (id, name, requested_start_at, full_quantity, half_quantity, mix_id)
                VALUES (1, 'Restore order', '2026-11-18T09:00:00+03:00', 1, 0, 1)
            """)
            db.execute(
                "INSERT INTO estimate_revisions VALUES (1, 1, ?, ?, '2026-11-18T06:00:00Z')",
                (json.dumps({"price": "100.123456789"}), json.dumps({"cost": "5.01"})),
            )
            db.execute("""
                INSERT INTO audit_events (project_id, event_type, actor_id, event_key, details_json)
                VALUES (1, 'test.event', 'local-user', 'once', '{}')
            """)
        backup = self.directory / "daily.sqlite3"
        copy_database(self.source, backup)
        with transaction(self.source, write=True) as db:
            db.execute("UPDATE settings SET cement_price_per_ton = '120' WHERE id = 1")
        restored = self.directory / "restored.sqlite3"
        copy_database(backup, restored, upgrade=True)
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
