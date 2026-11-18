import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from blockcalc.app import create_app
from blockcalc.db import transaction


def update_from(settings: dict) -> dict:
    payload = {key: value for key, value in settings.items() if key not in {"mixes", "updated_at"}}
    payload["mix_yields"] = [
        {key: mix[key] for key in ("id", "full_yield", "half_yield")} for mix in settings["mixes"]
    ]
    return payload


class SettingsTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(TemporaryDirectory())
        self.path = Path(directory) / "test.sqlite3"
        self.client = self.enterContext(TestClient(create_app(self.path), raise_server_exceptions=False))
        response = self.client.get("/api/settings")
        self.assertEqual(response.status_code, 200, response.text)
        self.settings = response.json()
        self.update = update_from(self.settings)

    def test_defaults_and_seeded_mix_recipes(self):
        self.assertEqual(self.settings["currency"], "RUB")
        self.assertIsNone(self.settings["sand_price_per_ton"])
        self.assertEqual((self.settings["full_molds"], self.settings["half_molds"]), (0, 0))
        self.assertEqual(
            [(mix["sand_wheelbarrows"], mix["stone_wheelbarrows"], mix["cement_bags"])
             for mix in self.settings["mixes"]],
            [("3", "0", "1"), ("3", "2", "1"), ("2.5", "2.5", "1"), ("2", "2", "1")],
        )
        for mix in self.settings["mixes"]:
            self.assertIsNone(mix["full_yield"])
            self.assertIsNone(mix["half_yield"])

    def test_update_persists_exact_decimals_yields_and_audit_event(self):
        self.update.update(
            currency=" usd ",
            sand_price_per_ton="0.00000001",
            cement_price_per_ton="100.25",
            sand_kg_per_wheelbarrow="100.125",
            full_molds=50,
            half_molds=15,
        )
        self.update["mix_yields"][1].update(full_yield=35, half_yield=60)
        response = self.client.put("/api/settings", json=self.update)
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        self.assertEqual(saved["currency"], "USD")
        self.assertEqual(saved["sand_price_per_ton"], "0.00000001")
        self.assertEqual(saved["cement_price_per_ton"], "100.25")
        self.assertEqual(saved["sand_kg_per_wheelbarrow"], "100.125")
        self.assertEqual((saved["full_molds"], saved["half_molds"]), (50, 15))
        self.assertEqual((saved["mixes"][1]["full_yield"], saved["mixes"][1]["half_yield"]), (35, 60))
        self.assertEqual(saved["version"], self.settings["version"] + 1)
        self.assertEqual(self.client.get("/api/settings").json(), saved)
        with transaction(self.path) as db:
            event, = db.execute("SELECT event_type, actor_id, details_json FROM audit_events").fetchall()
        self.assertEqual((event["event_type"], event["actor_id"]), ("settings.updated", "local-user"))
        self.assertEqual(json.loads(event["details_json"])["settings"], saved)

    def test_rejects_invalid_values_with_field_errors(self):
        invalid = [
            ("currency", "RUBLES"),
            ("full_molds", -1),
            ("half_molds", 1.5),
            ("full_molds", True),
            ("sand_price_per_ton", "-1"),
            ("cement_price_per_ton", "NaN"),
            ("sand_kg_per_wheelbarrow", "0"),
            ("stone_kg_per_wheelbarrow", "-2"),
        ]
        for field, value in invalid:
            with self.subTest(field=field, value=value):
                response = self.client.put("/api/settings", json=self.update | {field: value})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["detail"][0]["loc"], ["body", field])
        self.update["mix_yields"][0]["full_yield"] = 0
        response = self.client.put("/api/settings", json=self.update)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"][0]["loc"], ["body", "mix_yields", 0, "full_yield"])
        self.assertEqual(self.client.get("/api/settings").json(), self.settings)

    def test_requires_one_yield_entry_per_mix(self):
        self.update["mix_yields"][2]["id"] = 4
        response = self.client.put("/api/settings", json=self.update)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"][0]["loc"], ["body", "mix_yields"])

    def test_new_zero_prices_require_confirmation(self):
        self.update.update(sand_price_per_ton="0.00", stone_price_per_ton="0")
        response = self.client.put("/api/settings", json=self.update | {"confirmed_zero_prices": ["sand"]})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"][0]["loc"], ["body", "stone_price_per_ton"])
        self.assertEqual(self.client.get("/api/settings").json(), self.settings)

        response = self.client.put("/api/settings", json=self.update | {"confirmed_zero_prices": ["sand", "stone"]})
        self.assertEqual(response.status_code, 200, response.text)
        subsequent = update_from(response.json()) | {"full_molds": 10}
        self.assertEqual(self.client.put("/api/settings", json=subsequent).status_code, 200)

    def test_stale_save_cannot_overwrite_a_newer_update(self):
        first = self.client.put("/api/settings", json=self.update | {"full_molds": 50})
        self.assertEqual(first.status_code, 200, first.text)
        stale = self.client.put("/api/settings", json=self.update | {"full_molds": 100})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["detail"]["current_version"], first.json()["version"])
        self.assertEqual(self.client.get("/api/settings").json(), first.json())

    def test_audit_write_failure_rolls_back_settings_and_yields(self):
        with transaction(self.path, write=True) as db:
            db.execute("""
                CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events
                BEGIN
                    SELECT RAISE(ABORT, 'simulated audit failure');
                END
            """)
        self.update["mix_yields"][0]["half_yield"] = 40
        response = self.client.put("/api/settings", json=self.update | {"full_molds": 50})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.client.get("/api/settings").json(), self.settings)
