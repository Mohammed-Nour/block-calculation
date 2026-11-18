import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from blockcalc.app import create_app
from blockcalc.db import transaction


def draft_update(project: dict, **changes) -> dict:
    fields = ("name", "requested_start_at", "full_quantity", "half_quantity", "mix_id", "version")
    return {field: project[field] for field in fields} | changes


class ProjectTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(TemporaryDirectory())
        self.path = Path(directory) / "projects.sqlite3"
        self.client = self.enterContext(TestClient(create_app(self.path), raise_server_exceptions=False))
        self.settings = self.configure_settings()

    def configure_settings(self, **changes) -> dict:
        current = self.client.get("/api/settings").json()
        update = {
            key: value for key, value in current.items() if key not in {"mixes", "updated_at"}
        }
        update.update(
            sand_price_per_ton="10",
            stone_price_per_ton="20",
            cement_price_per_ton="100",
            sand_kg_per_wheelbarrow="100",
            stone_kg_per_wheelbarrow="120",
            full_molds=50,
            half_molds=15,
            mix_yields=[
                {"id": mix_id, "full_yield": 35, "half_yield": 60} for mix_id in range(1, 5)
            ],
        )
        response = self.client.put("/api/settings", json=update | changes)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_project(self, **changes) -> dict:
        response = self.client.post("/api/projects", json={
            "name": "Block order",
            "requested_start_at": "2026-11-18T09:00:00+03:00",
            "full_quantity": 1700,
            "half_quantity": 300,
            "mix_id": 2,
        } | changes)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def save_estimate(self, project: dict, **options) -> dict:
        request = {"version": project["version"]} | options
        preview = self.client.post(f"/api/projects/{project['id']}/calculate", json=request)
        self.assertEqual(preview.status_code, 200, preview.text)
        response = self.client.post(f"/api/projects/{project['id']}/estimates", json={
            **request, "settings_version": preview.json()["settings_version"],
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def add_run(self, project: dict, *, started_at: str | None = None, ready_at: str | None = None):
        with transaction(self.path, write=True) as db:
            db.execute("""
                INSERT INTO production_runs (
                    project_id, estimate_revision, block_size, quantity, mold_capacity,
                    planned_start_at, started_at, ready_at
                ) VALUES (?, ?, 'full', 50, 50, '2026-11-18T09:00:00+03:00', ?, ?)
            """, (project["id"], project["latest_estimate_revision"], started_at, ready_at))

    def test_create_draft_without_a_mix_preserves_timezone_and_records_actor(self):
        project = self.create_project(name="  Order A  ", mix_id=None)
        self.assertEqual(project["name"], "Order A")
        self.assertEqual(project["requested_start_at"], "2026-11-18T09:00:00+03:00")
        self.assertEqual(project["status"], "draft")
        self.assertIsNone(project["estimate"])
        self.assertIsNone(project["latest_estimate_revision"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        with transaction(self.path) as db:
            event = db.execute("""
                SELECT event_type, actor_id, occurred_at, details_json FROM audit_events WHERE project_id = ?
            """, (project["id"],)).fetchone()
        self.assertEqual((event["event_type"], event["actor_id"]), ("project.created", "local-user"))
        self.assertTrue(event["occurred_at"].endswith("Z"))
        self.assertEqual(json.loads(event["details_json"])["name"], "Order A")

    def test_invalid_drafts_and_unexpected_fields_are_rejected(self):
        valid = draft_update(self.create_project())
        valid.pop("version")
        invalid = [
            {"name": " "}, {"name": "x" * 101}, {"full_quantity": -1}, {"half_quantity": 1.5},
            {"full_quantity": True}, {"full_quantity": 0, "half_quantity": 0},
            {"requested_start_at": "2026-11-18T09:00:00"}, {"mix_id": 5},
            {"status": "planned"}, {"estimate": {"total_cost": "1"}},
        ]
        for change in invalid:
            with self.subTest(change=change):
                response = self.client.post("/api/projects", json=valid | change)
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(len(self.client.get("/api/projects").json()), 1)

    def test_edit_draft_and_filter_and_paginate_project_list(self):
        first = self.create_project(name="First", mix_id=None)
        second = self.save_estimate(self.create_project(name="Second"))
        update = draft_update(first, name="Renamed", full_quantity=35, half_quantity=0, mix_id=1)
        response = self.client.put(f"/api/projects/{first['id']}", json=update)
        self.assertEqual(response.status_code, 200, response.text)
        changed = response.json()
        self.assertEqual((changed["name"], changed["mix_id"], changed["full_quantity"]), ("Renamed", 1, 35))
        self.assertEqual(changed["version"], first["version"] + 1)
        self.assertEqual(self.client.get("/api/projects?status=planned").json(), [second])
        self.assertEqual(self.client.get("/api/projects?status=draft").json(), [changed])
        self.assertEqual(self.client.get("/api/projects?limit=1&offset=1").json(), [changed])
        for query in ("status=unknown", "limit=0", "limit=101", "offset=-1"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/projects?{query}").status_code, 422)

    def test_preview_uses_calculation_service_and_does_not_save_a_revision(self):
        project = self.create_project()
        response = self.client.post(f"/api/projects/{project['id']}/calculate", json={"version": project["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        preview = response.json()
        self.assertEqual(preview["price_source"], "current")
        self.assertEqual(preview["settings_version"], self.settings["version"])
        self.assertEqual(preview["result"]["total_cost"], "691.20")
        self.assertEqual((preview["result"]["full_batches"], preview["result"]["half_batches"]), (49, 5))
        self.assertEqual(preview["result"]["full_surplus"], 15)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates").json(), [])

    def test_missing_mix_prices_yields_and_conversions_block_preview_and_save(self):
        project = self.create_project(mix_id=None)
        for endpoint in ("calculate", "estimates"):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f"/api/projects/{project['id']}/{endpoint}", json={
                    "version": project["version"],
                    **({"settings_version": self.settings["version"]} if endpoint == "estimates" else {}),
                })
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["detail"][0]["loc"], ["project", "mix_id"])

        self.settings = self.configure_settings(
            sand_price_per_ton=None, stone_kg_per_wheelbarrow=None,
            mix_yields=[{"id": mix_id, "full_yield": None, "half_yield": None} for mix_id in range(1, 5)],
        )
        project = self.create_project()
        for endpoint in ("calculate", "estimates"):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f"/api/projects/{project['id']}/{endpoint}", json={
                    "version": project["version"],
                    **({"settings_version": self.settings["version"]} if endpoint == "estimates" else {}),
                })
                self.assertEqual(response.status_code, 422, response.text)
                self.assertCountEqual(
                    [error["loc"] for error in response.json()["detail"]],
                    [
                        ["settings", "sand_price_per_ton"], ["settings", "stone_kg_per_wheelbarrow"],
                        ["settings", "full_yield"], ["settings", "half_yield"],
                    ],
                )
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates").json(), [])

    def test_mix_1_skips_stone_and_unused_yields_and_does_not_require_molds(self):
        self.settings = self.configure_settings(
            stone_price_per_ton=None, stone_kg_per_wheelbarrow=None, full_molds=0, half_molds=0,
            mix_yields=[{"id": mix_id, "full_yield": None, "half_yield": 40} for mix_id in range(1, 5)],
        )
        project = self.save_estimate(self.create_project(full_quantity=0, half_quantity=40, mix_id=1))
        self.assertEqual(project["estimate"]["result"]["total_cost"], "8.00")
        self.assertEqual(project["estimate"]["result"]["stone"]["tons"], "0")

    def test_saved_estimate_has_complete_snapshot_and_revision_history(self):
        original = self.create_project()
        project = self.save_estimate(original)
        self.assertEqual(project["status"], "planned")
        self.assertEqual(project["version"], original["version"] + 1)
        self.assertEqual(project["latest_estimate_revision"], 1)
        estimate = project["estimate"]
        self.assertEqual(estimate["result"]["total_cost"], "691.20")
        self.assertEqual(estimate["inputs"]["settings"], self.settings)
        self.assertEqual(estimate["inputs"]["project"]["requested_start_at"], original["requested_start_at"])
        self.assertEqual(estimate["inputs"]["project"]["full_quantity"], 1700)
        self.assertEqual(estimate["inputs"]["cement_bag_kilograms"], "50")
        self.assertEqual(estimate["inputs"]["kilograms_per_ton"], "1000")
        self.assertEqual(estimate["inputs"]["cost_rounding"], "ROUND_HALF_UP")
        base = f"/api/projects/{project['id']}/estimates"
        self.assertEqual(self.client.get(base).json(), [estimate])
        self.assertEqual(self.client.get(f"{base}/1").json(), estimate)
        with transaction(self.path) as db:
            events = db.execute("""
                SELECT event_type, actor_id FROM audit_events WHERE project_id = ? ORDER BY id
            """, (project["id"],)).fetchall()
        self.assertEqual([tuple(event) for event in events], [
            ("project.created", "local-user"), ("estimate.saved", "local-user"),
        ])

    def test_settings_changes_preserve_saved_estimate_and_default_revision_inputs(self):
        project = self.save_estimate(self.create_project())
        original = project["estimate"]
        self.configure_settings(
            currency="USD", cement_price_per_ton="120", sand_kg_per_wheelbarrow="200",
            mix_yields=[{"id": mix_id, "full_yield": 20, "half_yield": 40} for mix_id in range(1, 5)],
        )
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        preview = self.client.post(f"/api/projects/{project['id']}/calculate", json={
            "version": project["version"],
        }).json()
        self.assertEqual(preview["price_source"], "saved")
        self.assertEqual(preview["result"]["total_cost"], "691.20")
        revised = self.save_estimate(project)
        self.assertEqual(revised["estimate"]["revision"], 2)
        self.assertEqual(revised["estimate"]["inputs"]["settings"], original["inputs"]["settings"])
        self.assertEqual(revised["estimate"]["result"], original["result"])
        history = self.client.get(f"/api/projects/{project['id']}/estimates").json()
        self.assertEqual(history, [original, revised["estimate"]])

    def test_current_prices_require_explicit_confirmation_and_create_a_new_revision(self):
        project = self.save_estimate(self.create_project())
        original = project["estimate"]
        current = self.configure_settings(cement_price_per_ton="120", currency="USD")
        request = {"version": project["version"], "use_current_prices": True}
        for endpoint in ("calculate", "estimates"):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f"/api/projects/{project['id']}/{endpoint}", json={
                    **request,
                    **({"settings_version": current["version"]} if endpoint == "estimates" else {}),
                })
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["detail"][0]["loc"], ["body", "confirm_recalculation"])
        revised = self.save_estimate(project, use_current_prices=True, confirm_recalculation=True)
        self.assertEqual(revised["estimate"]["result"]["total_cost"], "745.20")
        self.assertEqual(revised["estimate"]["result"]["currency"], "USD")
        self.assertEqual(revised["estimate"]["inputs"]["settings"], current)
        self.assertEqual(
            self.client.get(f"/api/projects/{project['id']}/estimates/1").json(), original,
        )
        fresh = self.save_estimate(self.create_project())
        self.assertEqual(fresh["estimate"]["result"]["total_cost"], "745.20")

    def test_settings_change_between_preview_and_save_requires_another_preview(self):
        project = self.create_project()
        preview = self.client.post(f"/api/projects/{project['id']}/calculate", json={
            "version": project["version"],
        })
        self.assertEqual(preview.status_code, 200, preview.text)
        current = self.configure_settings(cement_price_per_ton="120")
        response = self.client.post(f"/api/projects/{project['id']}/estimates", json={
            "version": preview.json()["version"], "settings_version": preview.json()["settings_version"],
        })
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["current_settings_version"], current["version"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates").json(), [])
        saved = self.save_estimate(project)
        self.assertEqual(saved["estimate"]["result"]["total_cost"], "745.20")

    def test_stale_project_edit_preview_and_save_are_rejected(self):
        project = self.create_project()
        changed = self.client.put(f"/api/projects/{project['id']}", json=draft_update(
            project, full_quantity=1800,
        )).json()
        actions = [
            ("put", "", draft_update(project, name="Stale name")),
            ("post", "/calculate", {"version": project["version"]}),
            ("post", "/estimates", {
                "version": project["version"], "settings_version": self.settings["version"],
            }),
        ]
        for method, suffix, payload in actions:
            with self.subTest(suffix=suffix):
                response = getattr(self.client, method)(f"/api/projects/{project['id']}{suffix}", json=payload)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(response.json()["detail"]["current_version"], changed["version"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), changed)

    def test_quantity_and_mix_edit_invalidates_estimate_and_cancels_waiting_runs(self):
        project = self.save_estimate(self.create_project())
        original = project["estimate"]
        self.add_run(project)
        response = self.client.put(f"/api/projects/{project['id']}", json=draft_update(
            project, full_quantity=35, half_quantity=0, mix_id=3,
        ))
        self.assertEqual(response.status_code, 200, response.text)
        changed = response.json()
        self.assertEqual(changed["status"], "draft")
        self.assertIsNone(changed["estimate"])
        self.assertEqual(changed["latest_estimate_revision"], 1)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates/1").json(), original)
        with transaction(self.path) as db:
            run = db.execute("SELECT * FROM production_runs WHERE project_id = ?", (project["id"],)).fetchone()
        self.assertIsNotNone(run["cancelled_at"])
        self.assertIsNone(run["started_at"])
        revised = self.save_estimate(changed)
        self.assertEqual(revised["estimate"]["revision"], 2)
        self.assertEqual(revised["estimate"]["result"]["total_cost"], "13.50")
        self.assertEqual(revised["estimate"]["inputs"]["project"]["mix_id"], 3)

    def test_clearing_the_mix_invalidates_the_estimate_and_blocks_calculation(self):
        project = self.save_estimate(self.create_project())
        response = self.client.put(
            f"/api/projects/{project['id']}", json=draft_update(project, mix_id=None),
        )
        self.assertEqual(response.status_code, 200, response.text)
        changed = response.json()
        self.assertEqual(changed["status"], "draft")
        self.assertIsNone(changed["estimate"])
        self.assertEqual(changed["latest_estimate_revision"], 1)
        preview = self.client.post(
            f"/api/projects/{project['id']}/calculate", json={"version": changed["version"]},
        )
        self.assertEqual(preview.status_code, 422, preview.text)
        self.assertEqual(preview.json()["detail"][0]["loc"], ["project", "mix_id"])

    def test_start_time_change_cancels_waiting_runs_and_retains_material_estimate(self):
        project = self.save_estimate(self.create_project())
        self.add_run(project)
        # A different offset for the same instant preserves the existing plan.
        response = self.client.put(f"/api/projects/{project['id']}", json=draft_update(
            project, requested_start_at="2026-11-18T10:00:00+04:00",
        ))
        self.assertEqual(response.status_code, 200, response.text)
        changed = response.json()
        self.assertEqual(changed["requested_start_at"], "2026-11-18T10:00:00+04:00")
        with transaction(self.path) as db:
            self.assertIsNone(db.execute("SELECT cancelled_at FROM production_runs").fetchone()[0])
        response = self.client.put(f"/api/projects/{project['id']}", json=draft_update(
            changed, requested_start_at="2026-11-19T10:00:00+04:00",
        ))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["estimate"], project["estimate"])
        with transaction(self.path) as db:
            self.assertIsNotNone(db.execute("SELECT cancelled_at FROM production_runs").fetchone()[0])

    def test_active_and_completed_runs_lock_quantities_and_mix(self):
        for ready_at in (None, "2026-11-20T09:00:00+03:00"):
            with self.subTest(ready_at=ready_at):
                project = self.save_estimate(self.create_project())
                self.add_run(project, started_at="2026-11-18T09:00:00+03:00", ready_at=ready_at)
                for change in ({"full_quantity": 1701}, {"half_quantity": 301}, {"mix_id": 3}):
                    response = self.client.put(
                        f"/api/projects/{project['id']}", json=draft_update(project, **change),
                    )
                    self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
                rename = self.client.put(
                    f"/api/projects/{project['id']}", json=draft_update(project, name="Renamed"),
                )
                self.assertEqual(rename.status_code, 200, rename.text)
                self.assertEqual(rename.json()["estimate"], project["estimate"])

    def test_production_status_is_retained_when_saving_another_estimate(self):
        project = self.save_estimate(self.create_project())
        with transaction(self.path, write=True) as db:
            db.execute("UPDATE projects SET status = 'in_production' WHERE id = ?", (project["id"],))
        project = self.client.get(f"/api/projects/{project['id']}").json()
        response = self.client.put(
            f"/api/projects/{project['id']}", json=draft_update(project, full_quantity=1701),
        )
        self.assertEqual(response.status_code, 409, response.text)
        revised = self.save_estimate(project)
        self.assertEqual(revised["status"], "in_production")
        self.assertEqual(revised["estimate"]["revision"], 2)

    def test_audit_failure_rolls_back_revision_status_and_version_and_allows_retry(self):
        project = self.create_project()
        with transaction(self.path, write=True) as db:
            db.execute("""
                CREATE TRIGGER fail_estimate_audit BEFORE INSERT ON audit_events
                WHEN NEW.event_type = 'estimate.saved'
                BEGIN
                    SELECT RAISE(ABORT, 'simulated audit failure');
                END
            """)
        payload = {"version": project["version"], "settings_version": self.settings["version"]}
        response = self.client.post(f"/api/projects/{project['id']}/estimates", json=payload)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates").json(), [])
        with transaction(self.path, write=True) as db:
            db.execute("DROP TRIGGER fail_estimate_audit")
        retry = self.client.post(f"/api/projects/{project['id']}/estimates", json=payload)
        self.assertEqual(retry.status_code, 201, retry.text)
        self.assertEqual(retry.json()["estimate"]["revision"], 1)

    def test_failed_project_edit_retains_estimate_and_waiting_plan(self):
        project = self.save_estimate(self.create_project())
        self.add_run(project)
        with transaction(self.path, write=True) as db:
            db.execute("""
                CREATE TRIGGER fail_project_audit BEFORE INSERT ON audit_events
                WHEN NEW.event_type = 'project.updated'
                BEGIN
                    SELECT RAISE(ABORT, 'simulated audit failure');
                END
            """)
        response = self.client.put(
            f"/api/projects/{project['id']}", json=draft_update(project, full_quantity=1800),
        )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)
        with transaction(self.path) as db:
            run = db.execute("SELECT cancelled_at FROM production_runs WHERE project_id = ?", (project["id"],)).fetchone()
        self.assertIsNone(run["cancelled_at"])

    def test_concurrent_and_repeated_saves_create_one_revision(self):
        project = self.create_project()
        payload = {"version": project["version"], "settings_version": self.settings["version"]}
        endpoint = f"/api/projects/{project['id']}/estimates"
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.client.post(endpoint, json=payload), range(2)))
        self.assertEqual(sorted(response.status_code for response in responses), [201, 409])
        self.assertEqual(self.client.post(endpoint, json=payload).status_code, 409)
        self.assertEqual(len(self.client.get(endpoint).json()), 1)
        with transaction(self.path) as db:
            count = db.execute("""
                SELECT count(*) FROM audit_events WHERE project_id = ? AND event_type = 'estimate.saved'
            """, (project["id"],)).fetchone()[0]
        self.assertEqual(count, 1)

    def test_unknown_projects_and_revisions_and_out_of_range_ids(self):
        project = self.create_project()
        for method, suffix, payload in [
            ("get", "", None),
            ("put", "", draft_update(project)),
            ("post", "/calculate", {"version": 1}),
            ("post", "/estimates", {"version": 1, "settings_version": self.settings["version"]}),
            ("get", "/estimates", None),
        ]:
            with self.subTest(method=method, suffix=suffix):
                endpoint = f"/api/projects/999{suffix}"
                response = getattr(self.client, method)(endpoint, **({"json": payload} if payload else {}))
                self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates/1").status_code, 404)
        self.assertEqual(self.client.get(f"/api/projects/{2**63}").status_code, 422)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}/estimates/{2**63}").status_code, 422)

    def test_client_cannot_override_calculated_results_or_use_truthy_confirmation_flags(self):
        project = self.create_project()
        payload = {"version": project["version"], "settings_version": self.settings["version"]}
        for change in (
            {"result": {"total_cost": "0.01"}},
            {"inputs": {"settings": {}}},
            {"use_current_prices": "false"},
            {"confirm_recalculation": 1},
        ):
            with self.subTest(change=change):
                response = self.client.post(
                    f"/api/projects/{project['id']}/estimates", json=payload | change,
                )
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").json(), project)

    def test_project_post_is_available_to_configured_frontend_origin(self):
        response = self.client.options("/api/projects", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("POST", response.headers["Access-Control-Allow-Methods"])
