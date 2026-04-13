from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_parent(path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def connect(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    ensure_parent(db_path)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        init_schema(conn)
        ensure_schema_columns(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS dedupe_events;
        DROP TABLE IF EXISTS sync_events;

        CREATE TABLE IF NOT EXISTS search_jobs (
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
        );

        CREATE TABLE IF NOT EXISTS search_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NULL,
            trigger_type TEXT NOT NULL,
            status TEXT NOT NULL,
            stats_json TEXT NOT NULL DEFAULT '{}',
            started_at TEXT NOT NULL,
            ended_at TEXT NULL,
            error_text TEXT NULL
        );

        CREATE TABLE IF NOT EXISTS x_items_raw (
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
        );

        CREATE TABLE IF NOT EXISTS x_items_curated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            dedupe_key TEXT NOT NULL,
            level TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            summary_zh TEXT NOT NULL,
            excerpt TEXT NOT NULL,
            is_zero_cost INTEGER NOT NULL,
            source_url TEXT NOT NULL,
            author TEXT,
            created_at_x TEXT,
            reasons_json TEXT NOT NULL DEFAULT '[]',
            rule_set_id INTEGER NULL,
            state TEXT NOT NULL DEFAULT 'new'
        );

        CREATE TABLE IF NOT EXISTS rule_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            is_enabled INTEGER NOT NULL DEFAULT 1,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runtime_health_snapshot (
            target TEXT PRIMARY KEY,
            configured INTEGER NOT NULL DEFAULT 0,
            connected INTEGER NOT NULL DEFAULT 0,
            detail_json TEXT NOT NULL DEFAULT '{}',
            last_checked_at TEXT NULL,
            last_error TEXT NULL
        );
        """
    )


def ensure_schema_columns(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(search_jobs)").fetchall()}
    if "deleted_at" not in columns:
        conn.execute("ALTER TABLE search_jobs ADD COLUMN deleted_at TEXT NULL")
    if "search_spec_json" not in columns:
        conn.execute("ALTER TABLE search_jobs ADD COLUMN search_spec_json TEXT NULL")
    if "rule_set_id" not in columns:
        conn.execute("ALTER TABLE search_jobs ADD COLUMN rule_set_id INTEGER NULL")

    curated_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_curated)").fetchall()}
    if "score" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN score INTEGER NOT NULL DEFAULT 0")
    if "reasons_json" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]'")
    if "rule_set_id" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN rule_set_id INTEGER NULL")


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    payload = dict(row)
    for key in (
        "keywords_json",
        "thresholds_json",
        "levels_json",
        "stats_json",
        "metrics_json",
        "detail_json",
        "search_spec_json",
        "definition_json",
        "reasons_json",
    ):
        value = payload.get(key)
        if isinstance(value, str):
            try:
                payload[key] = json.loads(value)
            except json.JSONDecodeError:
                pass
    return payload
