import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.collector_store import connect, ensure_schema_columns, row_to_dict


class CollectorStoreTests(unittest.TestCase):
    def test_connect_creates_parent_directory_and_schema(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "nested" / "collector.db"
            with connect(db_path) as conn:
                tables = {
                    row[0]
                    for row in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                    ).fetchall()
                }

            self.assertTrue(db_path.parent.exists())
            self.assertIn("search_jobs", tables)
            self.assertIn("search_runs", tables)
            self.assertIn("x_items_raw", tables)
            self.assertIn("x_items_curated", tables)
            self.assertIn("rule_sets", tables)
            self.assertIn("runtime_health_snapshot", tables)

    def test_ensure_schema_columns_upgrades_legacy_database(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy.db"
            conn = sqlite3.connect(db_path)
            conn.execute(
                """
                CREATE TABLE search_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    keywords_json TEXT NOT NULL,
                    interval_minutes INTEGER NOT NULL,
                    days INTEGER NOT NULL,
                    thresholds_json TEXT NOT NULL,
                    levels_json TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    next_run_at TEXT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE x_items_curated (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    dedupe_key TEXT NOT NULL,
                    level TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary_zh TEXT NOT NULL,
                    excerpt TEXT NOT NULL,
                    is_zero_cost INTEGER NOT NULL,
                    source_url TEXT NOT NULL,
                    author TEXT,
                    created_at_x TEXT,
                    state TEXT NOT NULL DEFAULT 'new'
                )
                """
            )
            ensure_schema_columns(conn)
            search_job_columns = {row[1] for row in conn.execute("PRAGMA table_info(search_jobs)").fetchall()}
            curated_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_curated)").fetchall()}
            conn.close()

            self.assertIn("deleted_at", search_job_columns)
            self.assertIn("search_spec_json", search_job_columns)
            self.assertIn("rule_set_id", search_job_columns)
            self.assertIn("score", curated_columns)
            self.assertIn("reasons_json", curated_columns)
            self.assertIn("rule_set_id", curated_columns)

    def test_connect_is_idempotent_for_existing_database(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "collector.db"
            with connect(db_path) as conn:
                conn.execute("INSERT INTO runtime_health_snapshot (target, detail_json) VALUES ('db', '{}')")

            with connect(db_path) as conn:
                count = conn.execute("SELECT COUNT(1) FROM runtime_health_snapshot").fetchone()[0]

            self.assertEqual(count, 1)

    def test_row_to_dict_decodes_json_fields_and_keeps_invalid_json_as_string(self) -> None:
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT
                '{"views": 12}' AS metrics_json,
                '["a", "b"]' AS reasons_json,
                'not-json' AS definition_json
            """
        ).fetchone()

        payload = row_to_dict(row)

        self.assertEqual(payload["metrics_json"]["views"], 12)
        self.assertEqual(payload["reasons_json"], ["a", "b"])
        self.assertEqual(payload["definition_json"], "not-json")
        conn.close()


if __name__ == "__main__":
    unittest.main()
