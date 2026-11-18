import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from blockcalc.db import migrate, transaction


class MigrationTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(TemporaryDirectory())
        self.path = Path(directory) / "data" / "test.sqlite3"

    def test_migration_can_be_reapplied_without_resetting_data(self):
        migrate(self.path)
        with transaction(self.path, write=True) as db:
            db.execute("UPDATE settings SET full_molds = 20 WHERE id = 1")
            db.execute("UPDATE mixes SET full_yield = 35 WHERE id = 2")

        migrate(self.path)

        with transaction(self.path) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 2)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(db.execute("SELECT full_molds FROM settings").fetchone()[0], 20)
            self.assertEqual(db.execute("SELECT full_yield FROM mixes WHERE id = 2").fetchone()[0], 35)
            self.assertEqual(db.execute("SELECT count(*) FROM mixes").fetchone()[0], 4)

    def test_failed_migration_rolls_back_schema_and_version(self):
        directory = Path(self.enterContext(TemporaryDirectory()))
        (directory / "001_broken.sql").write_text(
            "CREATE TABLE example (id INTEGER PRIMARY KEY);\n"
            "INSERT INTO missing_table VALUES (1);\n",
            encoding="utf-8",
        )

        with patch("blockcalc.db.MIGRATIONS", directory), self.assertRaises(sqlite3.OperationalError):
            migrate(self.path)

        with transaction(self.path) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT name FROM sqlite_schema").fetchall(), [])

    def test_estimate_revisions_keep_their_saved_inputs(self):
        migrate(self.path)
        with transaction(self.path, write=True) as db:
            db.execute("""
                INSERT INTO projects (id, name, requested_start_at, full_quantity, half_quantity, mix_id)
                VALUES (1, 'Test project', '2026-11-17T18:00:00+03:00', 1, 0, 1)
            """)
            db.executemany(
                "INSERT INTO estimate_revisions (project_id, revision, inputs_json, results_json) VALUES (1, ?, ?, ?)",
                [
                    (1, '{"cement_price_per_ton":"100","full_yield":35}', '{"total_cost":"5.00"}'),
                    (2, '{"cement_price_per_ton":"120","full_yield":35}', '{"total_cost":"6.00"}'),
                ],
            )
            db.execute("UPDATE settings SET cement_price_per_ton = '120' WHERE id = 1")
            db.execute("UPDATE mixes SET full_yield = 40 WHERE id = 1")

            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute("UPDATE estimate_revisions SET inputs_json = '{}' WHERE revision = 1")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute("DELETE FROM estimate_revisions WHERE revision = 1")
            self.assertEqual(tuple(db.execute("""
                SELECT json_extract(inputs_json, '$.cement_price_per_ton'),
                       json_extract(inputs_json, '$.full_yield'),
                       json_extract(results_json, '$.total_cost')
                FROM estimate_revisions WHERE project_id = 1 AND revision = 1
            """).fetchone()), ("100", 35, "5.00"))

    def test_runs_reference_a_revision_and_fit_their_saved_mold_capacity(self):
        migrate(self.path)
        with transaction(self.path, write=True) as db:
            db.execute("""
                INSERT INTO projects (id, name, requested_start_at, full_quantity, half_quantity, mix_id)
                VALUES (1, 'Test project', '2026-11-17T18:00:00+03:00', 5, 0, 1)
            """)
            insert_run = """
                INSERT INTO production_runs
                    (project_id, estimate_revision, block_size, quantity, mold_capacity, planned_start_at)
                VALUES (1, 1, 'full', ?, 2, '2026-11-17T18:00:00+03:00')
            """
            with self.assertRaisesRegex(sqlite3.IntegrityError, "FOREIGN KEY"):
                db.execute(insert_run, (2,))
            db.execute("INSERT INTO estimate_revisions VALUES (1, 1, '{}', '{}', '2026-11-17T15:00:00Z')")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "CHECK"):
                db.execute(insert_run, (3,))
            db.execute(insert_run, (2,))
