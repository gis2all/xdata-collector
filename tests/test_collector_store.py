import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.collector_store import connect, ensure_schema_columns, row_to_dict


class CollectorStoreTests(unittest.TestCase):
    def test_connect_creates_parent_directory_and_result_schema(self) -> None:
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
            self.assertIn("x_items_raw", tables)
            self.assertIn("x_items_curated", tables)
            self.assertNotIn("search_jobs", tables)
            self.assertNotIn("search_runs", tables)
            self.assertNotIn("rule_sets", tables)
            self.assertNotIn("runtime_health_snapshot", tables)

    def test_ensure_schema_columns_upgrades_legacy_result_tables(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy.db"
            conn = sqlite3.connect(db_path)
            conn.execute(
                """
                CREATE TABLE x_items_raw (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    tweet_id TEXT,
                    canonical_url TEXT,
                    author TEXT,
                    text TEXT,
                    created_at_x TEXT,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    query_name TEXT,
                    fetched_at TEXT NOT NULL
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
                    author_name TEXT,
                    created_at_x TEXT,
                    state TEXT NOT NULL DEFAULT 'new'
                )
                """
            )
            ensure_schema_columns(conn)
            raw_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_raw)").fetchall()}
            curated_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_curated)").fetchall()}
            conn.close()

            self.assertIn("author_name", raw_columns)
            self.assertIn("score", curated_columns)
            self.assertIn("reasons_json", curated_columns)
            self.assertIn("rule_set_id", curated_columns)
            self.assertIn("author_name", curated_columns)
            self.assertIn("fetched_at", curated_columns)
            self.assertIn("views", curated_columns)
            self.assertIn("likes", curated_columns)
            self.assertIn("replies", curated_columns)
            self.assertIn("retweets", curated_columns)

    def test_ensure_schema_columns_backfills_curated_metrics_from_raw(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "legacy.db"
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            conn.execute(
                """
                CREATE TABLE x_items_raw (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    tweet_id TEXT,
                    canonical_url TEXT,
                    author TEXT,
                    text TEXT,
                    created_at_x TEXT,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    query_name TEXT,
                    fetched_at TEXT NOT NULL
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
            conn.execute(
                """
                INSERT INTO x_items_raw
                (run_id, tweet_id, canonical_url, author, text, created_at_x, metrics_json, query_name, fetched_at)
                VALUES (1, '1001', 'https://x.com/i/status/1001', 'demo', 'hello', '2026-04-14T00:00:00+00:00', '{"views": 12, "likes": 3, "replies": 2, "retweets": 1}', 'manual:1', '2026-04-14T00:00:01+00:00')
                """
            )
            conn.execute(
                """
                INSERT INTO x_items_curated
                (run_id, dedupe_key, level, title, summary_zh, excerpt, is_zero_cost, source_url, author, created_at_x, state)
                VALUES (1, 'tweet:1001', 'A', 'hello', 'summary', 'hello', 1, 'https://x.com/demo/status/1001', 'demo', '2026-04-14T00:00:00+00:00', 'new')
                """
            )

            ensure_schema_columns(conn)
            row = conn.execute("SELECT views, likes, replies, retweets FROM x_items_curated WHERE dedupe_key = 'tweet:1001'").fetchone()
            conn.close()

            self.assertEqual(dict(row), {"views": 12, "likes": 3, "replies": 2, "retweets": 1})

    def test_connect_is_idempotent_for_existing_database(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "collector.db"
            with connect(db_path) as conn:
                conn.execute(
                    "INSERT INTO x_items_raw (run_id, tweet_id, canonical_url, author_name, author, text, created_at_x, metrics_json, query_name, fetched_at) VALUES (1, '1001', 'https://x.com/i/status/1001', 'Demo Name', 'demo', 'hello', '2026-04-14T00:00:00+00:00', '{}', 'manual:1', '2026-04-14T00:00:01+00:00')"
                )

            with connect(db_path) as conn:
                count = conn.execute("SELECT COUNT(1) FROM x_items_raw").fetchone()[0]

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
