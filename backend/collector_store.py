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

        CREATE TABLE IF NOT EXISTS x_items_raw (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            tweet_id TEXT,
            canonical_url TEXT,
            author_name TEXT,
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
            views INTEGER NOT NULL DEFAULT 0,
            likes INTEGER NOT NULL DEFAULT 0,
            replies INTEGER NOT NULL DEFAULT 0,
            retweets INTEGER NOT NULL DEFAULT 0,
            fetched_at TEXT,
            reasons_json TEXT NOT NULL DEFAULT '[]',
            rule_set_id INTEGER NULL,
            author_name TEXT,
            state TEXT NOT NULL DEFAULT 'new'
        );
        """
    )


def ensure_schema_columns(conn: sqlite3.Connection) -> None:
    raw_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_raw)").fetchall()}
    if "author_name" not in raw_columns:
        conn.execute("ALTER TABLE x_items_raw ADD COLUMN author_name TEXT NULL")

    curated_columns = {row[1] for row in conn.execute("PRAGMA table_info(x_items_curated)").fetchall()}
    if "score" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN score INTEGER NOT NULL DEFAULT 0")
    if "reasons_json" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]'")
    if "rule_set_id" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN rule_set_id INTEGER NULL")
    if "author_name" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN author_name TEXT NULL")
    if "fetched_at" not in curated_columns:
        conn.execute("ALTER TABLE x_items_curated ADD COLUMN fetched_at TEXT NULL")
    for metric in ("views", "likes", "replies", "retweets"):
        if metric not in curated_columns:
            conn.execute(f"ALTER TABLE x_items_curated ADD COLUMN {metric} INTEGER NOT NULL DEFAULT 0")
    _backfill_curated_metrics_from_raw(conn)


def _coerce_metric(payload: Any, key: str) -> int:
    if not isinstance(payload, dict):
        return 0
    try:
        return int(payload.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _backfill_curated_metrics_from_raw(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        """
        SELECT id, dedupe_key
        FROM x_items_curated
        WHERE COALESCE(views, 0) = 0
          AND COALESCE(likes, 0) = 0
          AND COALESCE(replies, 0) = 0
          AND COALESCE(retweets, 0) = 0
          AND dedupe_key LIKE 'tweet:%'
        """
    ).fetchall()
    for row in rows:
        tweet_id = str(row["dedupe_key"] or "").split(":", 1)[-1].strip()
        if not tweet_id:
            continue
        raw = conn.execute(
            """
            SELECT metrics_json
            FROM x_items_raw
            WHERE tweet_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (tweet_id,),
        ).fetchone()
        if raw is None:
            continue
        try:
            metrics = json.loads(raw["metrics_json"] or "{}")
        except json.JSONDecodeError:
            continue
        values = tuple(_coerce_metric(metrics, key) for key in ("views", "likes", "replies", "retweets"))
        if not any(values):
            continue
        conn.execute(
            """
            UPDATE x_items_curated
            SET views = ?, likes = ?, replies = ?, retweets = ?
            WHERE id = ?
            """,
            (*values, int(row["id"])),
        )


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
