import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from blockcalc.app import create_app
from blockcalc.db import transaction
from blockcalc.production import forecast_order
from fastapi import HTTPException
from fastapi.testclient import TestClient


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime.fromisoformat("2026-11-18T09:00:00+03:00")
        self.now = self.start
        self.enterContext(
            patch("blockcalc.production.utc_now", side_effect=lambda: self.now)
        )
        directory = self.enterContext(TemporaryDirectory())
        self.path = Path(directory) / "production.sqlite3"
        self.client = self.enterContext(
            TestClient(create_app(self.path), raise_server_exceptions=False)
        )
        self.settings()

    def settings(self, **changes):
        current = self.client.get("/api/settings").json()
        payload = {
            key: value
            for key, value in current.items()
            if key not in {"mixes", "updated_at"}
        }
        payload.update(
            sand_price_per_ton="10",
            stone_price_per_ton="20",
            cement_price_per_ton="100",
            sand_kg_per_wheelbarrow="100",
            stone_kg_per_wheelbarrow="120",
            full_molds=50,
            half_molds=15,
            mix_yields=[
                {"id": mix_id, "full_yield": 35, "half_yield": 60}
                for mix_id in range(1, 5)
            ],
        )
        response = self.client.put("/api/settings", json=payload | changes)
        self.assertEqual(response.status_code, 200, response.text)

    def prepare(self, full=10, half=0, *, plan=True):
        response = self.client.post(
            "/api/projects",
            json={
                "name": "Production order",
                "requested_start_at": self.start.isoformat(),
                "full_quantity": full,
                "half_quantity": half,
                "mix_id": 2,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        project = response.json()
        self.base = f"/api/projects/{project['id']}"
        preview = self.client.post(
            self.base + "/calculate", json={"version": project["version"]}
        ).json()
        response = self.client.post(
            self.base + "/estimates",
            json={
                "version": project["version"],
                "settings_version": preview["settings_version"],
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        project = response.json()
        if plan:
            response = self.client.post(
                self.base + "/plan", json={"project_version": project["version"]}
            )
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        return self.client.get(self.base + "/production").json()

    def post(self, suffix, payload, expected=200):
        response = self.client.post(self.base + suffix, json=payload)
        self.assertEqual(response.status_code, expected, response.text)
        if expected == 500:
            return None
        return response.json()

    def start_run(self, run_id, key="start", hours=0):
        return self.post(
            f"/runs/{run_id}/start",
            {
                "event_key": key,
                "started_at": (self.start + timedelta(hours=hours)).isoformat(),
            },
        )

    def ready_run(self, run_id, key="ready", hours=48):
        self.now = max(self.now, self.start + timedelta(hours=hours))
        return self.post(
            f"/runs/{run_id}/ready",
            {
                "event_key": key,
                "ready_at": (self.start + timedelta(hours=hours)).isoformat(),
                "physically_checked": True,
            },
        )

    def collect(self, full, half=0, key="collect", expected=200):
        return self.post(
            "/collections",
            {
                "event_key": key,
                "full_quantity": full,
                "half_quantity": half,
                "collected_at": self.now.isoformat(),
            },
            expected,
        )

    def test_worked_forecast_and_plan_split_full_and_half_independently(self):
        detail = self.prepare(1700, 300, plan=False)
        forecast = detail["forecast"]
        self.assertEqual(
            (forecast["full"]["cycles"], forecast["half"]["cycles"]), (34, 20)
        )
        self.assertEqual(forecast["duration_hours"], 1632)
        self.assertEqual(
            datetime.fromisoformat(forecast["expected_ready_at"]),
            self.start + timedelta(days=68),
        )
        planned = self.post("/plan", {"project_version": detail["project"]["version"]})
        self.assertEqual(len(planned["runs"]), 54)
        for size, quantity, capacity in (("full", 1700, 50), ("half", 300, 15)):
            runs = [run for run in planned["runs"] if run["block_size"] == size]
            self.assertEqual(sum(run["quantity"] for run in runs), quantity)
            self.assertTrue(all(run["quantity"] <= capacity for run in runs))
        self.assertEqual(planned["estimates"][-1]["results"]["total_cost"], "691.20")

    def test_zero_capacity_and_zero_demand(self):
        self.settings(full_molds=0)
        detail = self.prepare(51, 0, plan=False)
        self.assertEqual(detail["forecast"]["untimed_sizes"], ["full"])
        self.assertIsNone(detail["forecast"]["duration_hours"])
        self.post("/plan", {"project_version": detail["project"]["version"]}, 422)
        self.assertEqual(self.client.get(self.base + "/production").json()["runs"], [])
        detail = self.prepare(0, 30)
        self.assertEqual(detail["forecast"]["full"]["cycles"], 0)
        self.assertEqual(detail["forecast"]["duration_hours"], 96)

    def test_planning_needs_current_estimate_and_rejects_duplicate_plan(self):
        detail = self.prepare()
        self.post("/plan", {"project_version": detail["project"]["version"]}, 409)
        project = self.client.get(self.base).json()
        update = {
            key: project[key]
            for key in (
                "name",
                "requested_start_at",
                "full_quantity",
                "half_quantity",
                "mix_id",
                "version",
            )
        }
        update["full_quantity"] = 11
        changed = self.client.put(self.base, json=update).json()
        self.post("/plan", {"project_version": project["version"]}, 409)
        self.post("/plan", {"project_version": changed["version"]}, 422)
        preview = self.client.post(
            self.base + "/calculate", json={"version": changed["version"]}
        ).json()
        saved = self.client.post(
            self.base + "/estimates",
            json={
                "version": changed["version"],
                "settings_version": preview["settings_version"],
            },
        ).json()
        planned = self.post("/plan", {"project_version": saved["version"]})
        self.assertEqual(
            [run["quantity"] for run in planned["runs"] if not run["cancelled_at"]],
            [11],
        )
        self.assertTrue(any(run["cancelled_at"] for run in planned["runs"]))

    def test_saved_capacity_survives_settings_change_and_legacy_plan(self):
        detail = self.prepare(51, 16)
        self.settings(full_molds=1, half_molds=1)
        reread = self.client.get(self.base + "/production").json()
        self.assertEqual(reread["forecast"]["full"]["molds"], 50)
        self.assertEqual(reread["forecast"]["half"]["molds"], 15)
        self.assertEqual(reread["runs"], detail["runs"])
        with transaction(self.path, write=True) as db:
            db.execute("UPDATE projects SET production_plan_json = NULL")
        legacy = self.client.get(self.base + "/production").json()
        self.assertEqual(legacy["forecast"]["full"]["molds"], 50)
        self.assertEqual(legacy["forecast"]["half"]["molds"], 15)

    def test_mold_pools_can_run_in_parallel_and_each_size_obeys_its_queue(self):
        detail = self.prepare(51, 16)
        full = [run for run in detail["runs"] if run["block_size"] == "full"]
        half = [run for run in detail["runs"] if run["block_size"] == "half"]
        self.post(
            f"/runs/{full[1]['id']}/start",
            {"event_key": "out-of-order", "started_at": self.start.isoformat()},
            409,
        )
        self.start_run(full[0]["id"])
        started = self.start_run(half[0]["id"], "start-half")
        self.assertEqual(started["project"]["status"], "in_production")
        self.post(
            f"/runs/{full[1]['id']}/start",
            {"event_key": "busy", "started_at": self.start.isoformat()},
            409,
        )
        self.assertEqual(started["balance"]["full"]["ready"], 0)

    def test_readiness_requires_real_elapsed_time_and_physical_confirmation(self):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        self.start_run(run_id)
        payload = {
            "event_key": "ready",
            "ready_at": (self.start + timedelta(hours=48)).isoformat(),
            "physically_checked": True,
        }
        self.post(f"/runs/{run_id}/ready", payload, 422)
        self.now = self.start + timedelta(hours=48)
        self.post(f"/runs/{run_id}/ready", payload | {"physically_checked": False}, 422)
        self.post(
            f"/runs/{run_id}/ready",
            payload | {"ready_at": (self.now - timedelta(seconds=1)).isoformat()},
            422,
        )
        self.assertEqual(
            self.client.get(self.base + "/production").json()["balance"]["full"][
                "ready"
            ],
            0,
        )
        ready = self.post(f"/runs/{run_id}/ready", payload)
        self.assertEqual(ready["balance"]["full"]["ready"], 10)
        self.assertEqual(ready["project"]["status"], "ready")

    def test_manual_delay_changes_only_its_project_and_no_clock_auto_readiness(self):
        first = self.prepare(51, 0)
        first_base = self.base
        other = self.prepare(1, 0)
        other_base = self.base
        self.base = first_base
        first_run, next_run = first["runs"]
        self.start_run(first_run["id"])
        self.now = self.start + timedelta(hours=60)
        delayed = self.client.get(self.base + "/production").json()
        self.assertEqual(delayed["balance"]["full"]["ready"], 0)
        self.assertEqual(
            datetime.fromisoformat(delayed["forecast"]["expected_ready_at"]),
            self.start + timedelta(hours=108),
        )
        ready = self.ready_run(first_run["id"], hours=60)
        self.assertEqual(ready["project"]["status"], "partially_ready")
        self.assertEqual(
            self.client.get(other_base + "/production").json()["forecast"],
            other["forecast"],
        )
        self.post(
            f"/runs/{next_run['id']}/start",
            {
                "event_key": "early-next",
                "started_at": (self.start + timedelta(hours=59)).isoformat(),
            },
            409,
        )
        following = self.start_run(next_run["id"], "next", hours=60)
        self.assertEqual(
            datetime.fromisoformat(following["runs"][1]["expected_ready_at"]),
            self.start + timedelta(hours=108),
        )
        self.assertEqual(following["estimates"], first["estimates"])

    def test_two_project_forecasts_assume_capacity_independently(self):
        self.settings(full_molds=1)
        first = self.prepare(1, 0)
        second = self.prepare(1, 0)
        self.assertEqual(first["forecast"]["duration_hours"], 48)
        self.assertEqual(first["forecast"], second["forecast"])

    def test_partial_collection_limits_and_completion(self):
        detail = self.prepare(10, 2)
        for index, run in enumerate(detail["runs"]):
            self.start_run(run["id"], f"start-{index}")
        for index, run in enumerate(detail["runs"]):
            self.ready_run(run["id"], f"ready-{index}")
        self.collect(4, key="four")
        self.collect(7, key="too-many", expected=422)
        self.collect(1, 3, key="half-over", expected=422)
        current = self.client.get(self.base + "/production").json()
        self.assertEqual(
            (
                current["balance"]["full"]["collected"],
                current["balance"]["half"]["collected"],
            ),
            (4, 0),
        )
        done = self.collect(6, 2, key="remaining")
        self.assertEqual(done["project"]["status"], "collected")
        self.post(
            "/cancel",
            {"project_version": done["project"]["version"], "reason": "Too late"},
            409,
        )

    def test_collection_before_ready_time_or_from_batch_surplus_is_rejected(self):
        detail = self.prepare(1, 0)
        run_id = detail["runs"][0]["id"]
        self.start_run(run_id)
        self.collect(1, expected=422)
        self.ready_run(run_id)
        self.post(
            "/collections",
            {
                "event_key": "backdated",
                "full_quantity": 1,
                "half_quantity": 0,
                "collected_at": self.start.isoformat(),
            },
            422,
        )
        self.collect(2, key="surplus", expected=422)
        self.collect(1)

    def test_duplicate_events_replay_once_and_changed_payload_is_rejected(self):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        started = self.start_run(run_id)
        self.assertEqual(self.start_run(run_id), started)
        self.post(
            f"/runs/{run_id}/start",
            {
                "event_key": "start",
                "started_at": (self.start - timedelta(seconds=1)).isoformat(),
            },
            409,
        )
        ready = self.ready_run(run_id)
        self.assertEqual(self.ready_run(run_id), ready)
        collected = self.collect(4)
        self.assertEqual(self.collect(4), collected)
        self.collect(5, expected=409)
        self.collect(1, key="start", expected=409)
        self.assertEqual(len(collected["collections"]), 1)
        self.assertEqual(
            len(
                [
                    event
                    for event in collected["history"]
                    if event["event_type"] == "collection.recorded"
                ]
            ),
            1,
        )

    def test_concurrent_collections_cannot_exceed_ready_balance(self):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        self.start_run(run_id)
        self.ready_run(run_id)

        def collect(index):
            return self.client.post(
                self.base + "/collections",
                json={
                    "event_key": f"concurrent-{index}",
                    "full_quantity": 6,
                    "half_quantity": 0,
                    "collected_at": self.now.isoformat(),
                },
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(collect, range(2)))
        self.assertEqual(
            sorted(response.status_code for response in responses), [200, 422]
        )
        self.assertEqual(
            self.client.get(self.base + "/production").json()["balance"]["full"][
                "collected"
            ],
            6,
        )

    def test_concurrent_duplicate_readiness_confirms_once(self):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        self.start_run(run_id)
        self.now = self.start + timedelta(hours=48)
        payload = {
            "event_key": "same",
            "ready_at": self.now.isoformat(),
            "physically_checked": True,
        }
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(
                    lambda _: self.client.post(
                        self.base + f"/runs/{run_id}/ready", json=payload
                    ),
                    range(2),
                )
            )
        self.assertEqual([response.status_code for response in responses], [200, 200])
        final = self.client.get(self.base + "/production").json()
        self.assertEqual(final["balance"]["full"]["ready"], 10)
        self.assertEqual(
            len(
                [
                    event
                    for event in final["history"]
                    if event["event_type"] == "run.ready"
                ]
            ),
            1,
        )

    def test_cancel_keeps_active_runs_history_estimates_and_allows_ready_collection(
        self,
    ):
        detail = self.prepare(51, 1)
        self.start_run(detail["runs"][0]["id"])
        current = self.client.get(self.base + "/production").json()
        cancelled = self.post(
            "/cancel",
            {
                "project_version": current["project"]["version"],
                "reason": "Customer cancelled",
            },
        )
        self.assertEqual(cancelled["project"]["status"], "cancelled")
        self.assertEqual(cancelled["project"]["cancel_reason"], "Customer cancelled")
        self.assertEqual(cancelled["estimates"], detail["estimates"])
        self.assertIsNone(cancelled["runs"][0]["cancelled_at"])
        self.assertTrue(all(run["cancelled_at"] for run in cancelled["runs"][1:]))
        self.assertIsNone(cancelled["forecast"])
        self.post(
            f"/runs/{cancelled['runs'][1]['id']}/start",
            {"event_key": "cancelled-run", "started_at": self.start.isoformat()},
            409,
        )
        ready = self.ready_run(detail["runs"][0]["id"])
        self.assertEqual(ready["project"]["status"], "cancelled")
        collected = self.collect(50)
        self.assertEqual(collected["project"]["status"], "cancelled")
        self.assertEqual(collected["balance"]["full"]["collected"], 50)
        self.assertTrue(
            any(
                event["event_type"] == "project.cancelled"
                for event in collected["history"]
            )
        )

    def test_failed_collection_rolls_back_balance_version_and_event_key_then_retries(
        self,
    ):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        self.start_run(run_id)
        before = self.ready_run(run_id)
        with transaction(self.path, write=True) as db:
            db.execute("""
                CREATE TRIGGER fail_collection BEFORE INSERT ON audit_events
                WHEN NEW.event_type = 'collection.recorded'
                BEGIN SELECT RAISE(ABORT, 'simulated failure'); END
            """)
        self.collect(4, expected=500)
        self.assertEqual(self.client.get(self.base + "/production").json(), before)
        with transaction(self.path, write=True) as db:
            db.execute("DROP TRIGGER fail_collection")
        self.assertEqual(self.collect(4)["balance"]["full"]["collected"], 4)

    def test_timezones_count_elapsed_hours_and_invalid_future_or_naive_times_fail(self):
        detail = self.prepare()
        run_id = detail["runs"][0]["id"]
        self.post(
            f"/runs/{run_id}/start",
            {
                "event_key": "future",
                "started_at": (self.start + timedelta(seconds=1)).isoformat(),
            },
            422,
        )
        self.post(
            f"/runs/{run_id}/start",
            {"event_key": "naive", "started_at": "2026-11-18T09:00:00"},
            422,
        )
        self.start_run(run_id)
        self.now = self.start + timedelta(hours=48)
        ready = self.post(
            f"/runs/{run_id}/ready",
            {
                "event_key": "offset",
                "ready_at": "2026-11-20T08:00:00+02:00",
                "physically_checked": True,
            },
        )
        self.assertEqual(ready["balance"]["full"]["ready"], 10)
        self.assertEqual(ready["runs"][0]["ready_at"], "2026-11-20T08:00:00+02:00")

    def test_invalid_collection_and_unknown_run_leave_records_unchanged(self):
        detail = self.prepare()
        for full, half in ((0, 0), (-1, 0), (1.5, 0), (True, 0)):
            self.post(
                "/collections",
                {
                    "event_key": "bad",
                    "full_quantity": full,
                    "half_quantity": half,
                    "collected_at": self.now.isoformat(),
                },
                422,
            )
        self.post(
            "/runs/999/start",
            {"event_key": "unknown", "started_at": self.start.isoformat()},
            404,
        )
        self.assertEqual(self.client.get(self.base + "/production").json(), detail)

    def test_forecast_calendar_overflow_returns_validation_error(self):
        forecast = forecast_order(
            self.start, {"full": 51, "half": 0}, {"full": 50, "half": 0}
        )
        self.assertEqual(forecast.duration_hours, 96)
        # The forecast service rejects an unrepresentable date before allocating any runs.
        with self.assertRaises(HTTPException) as error:
            forecast_order(
                self.start, {"full": 2**63 - 1, "half": 0}, {"full": 1, "half": 0}
            )
        self.assertEqual(error.exception.status_code, 422)
