from __future__ import annotations

import copy
import json
import os
import threading
import time
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from backend.collector_rules import (
    build_query_from_search_spec,
    build_execution_query_plan_from_search_spec,
    build_query_plan_from_search_spec,
    default_rule_set_definition,
    default_search_spec,
    evaluate_rule_set,
    normalize_rule_set_definition,
    normalize_search_spec,
    parse_created_at,
    passes_search_filters,
    serialize_search_result,
)
from backend.config import load_env_file
from backend.collector_store import connect, row_to_dict, utc_now_iso
from backend.models import RunCancelled, SearchResult
from backend.source_identity import (
    build_source_dedupe_key,
    canonicalize_source_url,
)
from backend.twitter_cli import find_twitter_cli, get_twitter_cli_version, normalize_search_payload, run_twitter_search
from backend.workspace_store import RuntimeStateStore, WorkspaceStore, default_builtin_rule_set, normalize_group_name, normalize_tags

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SQLITE_DEFAULT = Path("data") / "app.db"
RUNTIME_LOG_DIR = PROJECT_ROOT / "runtime" / "logs"
MAX_BACKGROUND_RUNS = 4
RUNTIME_LOG_FILES = (
    "api.current.out.log",
    "api.current.err.log",
    "scheduler.current.out.log",
    "scheduler.current.err.log",
    "web-ui.current.out.log",
    "web-ui.current.err.log",
)

CURATED_ITEM_FIELDS = (
    "id",
    "run_id",
    "dedupe_key",
    "level",
    "score",
    "title",
    "summary_zh",
    "excerpt",
    "is_zero_cost",
    "source_url",
    "author_name",
    "author",
    "created_at_x",
    "views",
    "likes",
    "replies",
    "retweets",
    "fetched_at",
    "tags",
    "reasons_json",
    "rule_set_id",
    "state",
)
CURATED_ITEM_DB_FIELDS = tuple("tags_json" if field == "tags" else field for field in CURATED_ITEM_FIELDS)
CURATED_ITEM_SORT_FIELDS = {field: field for field in CURATED_ITEM_FIELDS}
CURATED_ITEM_SORT_FIELDS["tags"] = "tags_json"
RAW_ITEM_FIELDS = (
    "id",
    "run_id",
    "tweet_id",
    "canonical_url",
    "author_name",
    "author",
    "text",
    "created_at_x",
    "views",
    "likes",
    "replies",
    "retweets",
    "query_name",
    "fetched_at",
    "tags",
)
RAW_ITEM_SORT_FIELDS = {field: field for field in RAW_ITEM_FIELDS}
RAW_ITEM_SORT_FIELDS["tags"] = "tags_json"
RAW_ITEM_DB_FIELDS = (
    "id",
    "run_id",
    "tweet_id",
    "canonical_url",
    "author_name",
    "author",
    "text",
    "created_at_x",
    "metrics_json",
    "tags_json",
    "query_name",
    "fetched_at",
)
RAW_ITEM_PYTHON_SORT_FIELDS = {"created_at_x", "views", "likes", "replies", "retweets"}
MAX_ITEM_PAGE_SIZE = 200
RESULTS_FILTER_RELATIONS = {"AND", "OR"}
RESULTS_FIELD_KINDS_BY_TABLE: dict[str, dict[str, str]] = {
    "curated": {
        "id": "number",
        "run_id": "number",
        "dedupe_key": "text",
        "level": "text",
        "score": "number",
        "title": "text",
        "summary_zh": "text",
        "excerpt": "text",
        "is_zero_cost": "boolean",
        "source_url": "text",
        "author_name": "text",
        "author": "text",
        "created_at_x": "datetime",
        "views": "number",
        "likes": "number",
        "replies": "number",
        "retweets": "number",
        "fetched_at": "datetime",
        "tags": "tags",
        "reasons_json": "text",
        "rule_set_id": "number",
        "state": "text",
    },
    "raw": {
        "id": "number",
        "run_id": "number",
        "tweet_id": "text",
        "canonical_url": "text",
        "author_name": "text",
        "author": "text",
        "text": "text",
        "created_at_x": "datetime",
        "views": "number",
        "likes": "number",
        "replies": "number",
        "retweets": "number",
        "query_name": "text",
        "fetched_at": "datetime",
        "tags": "tags",
    },
}
TEXT_FILTER_OPERATORS = {
    "contains",
    "not_contains",
    "equals",
    "not_equals",
    "starts_with",
    "ends_with",
    "is_empty",
    "is_not_empty",
    "length_gt",
    "length_gte",
    "length_lt",
    "length_lte",
    "length_between",
}
NUMBER_FILTER_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"}
DATETIME_FILTER_OPERATORS = {"on_or_after", "on_or_before", "between", "is_empty", "is_not_empty"}
BOOLEAN_FILTER_OPERATORS = {"is_true", "is_false"}
MAX_FILTER_TREE_ROWS = 50000
TAG_FILTER_OPERATORS = {"has_any", "has_all", "is_empty", "is_not_empty"}


def _parse_item_created_at(value: Any) -> datetime | None:
    return parse_created_at("" if value is None else str(value))


def _dedupe_sort_key(payload: dict[str, Any]) -> tuple[int, datetime, int]:
    created_at = _parse_item_created_at(payload.get("created_at_x"))
    fallback = datetime.max.replace(tzinfo=timezone.utc)
    return (1 if created_at is None else 0, created_at or fallback, int(payload["id"]))


def _item_created_at_sort_key(payload: dict[str, Any], direction: str) -> tuple[int, float, int]:
    created_at = _parse_item_created_at(payload.get("created_at_x"))
    item_id = int(payload["id"])
    if created_at is None:
        return (1, 0.0, item_id)
    timestamp = created_at.timestamp()
    return (0, timestamp if direction == "ASC" else -timestamp, item_id)


def _number_sort_key(payload: dict[str, Any], field: str, direction: str) -> tuple[int, int]:
    item_id = int(payload["id"])
    value = payload.get(field, 0)
    try:
        numeric = int(value or 0)
    except (TypeError, ValueError):
        numeric = 0
    return (numeric if direction == "ASC" else -numeric, item_id)


def _raw_metrics(payload: dict[str, Any]) -> dict[str, int]:
    raw_metrics = payload.get("metrics_json", {})
    if not isinstance(raw_metrics, dict):
        raw_metrics = {}
    normalized: dict[str, int] = {}
    for key in ("views", "likes", "replies", "retweets"):
        value = raw_metrics.get(key, 0)
        try:
            normalized[key] = int(value or 0)
        except (TypeError, ValueError):
            normalized[key] = 0
    return normalized


def _row_tags(payload: dict[str, Any]) -> list[str]:
    return normalize_tags(payload.get("tags") if "tags" in payload else payload.get("tags_json"))


def _curated_row_to_item(row: Any) -> dict[str, Any]:
    payload = row_to_dict(row)
    payload["tags"] = _row_tags(payload)
    payload.pop("tags_json", None)
    return payload


def _raw_row_to_item(row: Any) -> dict[str, Any]:
    payload = row_to_dict(row)
    metrics = _raw_metrics(payload)
    return {
        "id": int(payload["id"]),
        "run_id": int(payload["run_id"]),
        "tweet_id": str(payload.get("tweet_id") or ""),
        "canonical_url": str(payload.get("canonical_url") or ""),
        "author_name": str(payload.get("author_name") or ""),
        "author": str(payload.get("author") or ""),
        "text": str(payload.get("text") or ""),
        "created_at_x": payload.get("created_at_x"),
        "views": metrics["views"],
        "likes": metrics["likes"],
        "replies": metrics["replies"],
        "retweets": metrics["retweets"],
        "query_name": str(payload.get("query_name") or ""),
        "fetched_at": payload.get("fetched_at"),
        "tags": _row_tags(payload),
    }


def _empty_results_filter_tree() -> dict[str, Any]:
    return {"type": "group", "relation": "AND", "children": []}


def _normalize_results_filter_relation(value: Any) -> str:
    relation = str(value or "AND").strip().upper()
    return relation if relation in RESULTS_FILTER_RELATIONS else "AND"


def _normalize_results_filter_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_results_filter_number(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_results_filter_scalar(value: Any, kind: str) -> str | int | bool | None:
    if kind == "number":
        return _normalize_results_filter_number(value)
    if kind == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value or "").strip().lower()
        if text in {"1", "true", "yes"}:
            return True
        if text in {"0", "false", "no"}:
            return False
        return None
    return _normalize_results_filter_text(value)


def _normalize_results_filter_node(node: Any, table: str) -> dict[str, Any] | None:
    if not isinstance(node, dict):
        return None
    node_type = str(node.get("type") or "condition").strip().lower()
    field_kinds = RESULTS_FIELD_KINDS_BY_TABLE[table]
    if node_type == "group":
        children = [
            child
            for child in (_normalize_results_filter_node(item, table) for item in node.get("children", []))
            if child is not None
        ]
        return {
            "type": "group",
            "relation": _normalize_results_filter_relation(node.get("relation")),
            "children": children,
        }

    field = str(node.get("field") or "").strip()
    if field not in field_kinds:
        return None
    kind = field_kinds[field]
    if kind == "text":
        operator = str(node.get("operator") or "contains").strip().lower()
        if operator not in TEXT_FILTER_OPERATORS:
            operator = "contains"
        normalized: dict[str, Any] = {"type": "condition", "field": field, "operator": operator}
        if operator == "length_between":
            minimum = _normalize_results_filter_number(node.get("min"))
            maximum = _normalize_results_filter_number(node.get("max"))
            if minimum is None or maximum is None:
                return None
            if minimum > maximum:
                minimum, maximum = maximum, minimum
            normalized["min"] = minimum
            normalized["max"] = maximum
            return normalized
        if operator not in {"is_empty", "is_not_empty"}:
            value = _normalize_results_filter_text(node.get("value"))
            if not value and not operator.startswith("length_"):
                return None
            if operator.startswith("length_"):
                numeric = _normalize_results_filter_number(node.get("value"))
                if numeric is None:
                    return None
                normalized["value"] = numeric
            else:
                normalized["value"] = value
        return normalized
    if kind == "number":
        operator = str(node.get("operator") or "gte").strip().lower()
        if operator not in NUMBER_FILTER_OPERATORS:
            operator = "gte"
        normalized = {"type": "condition", "field": field, "operator": operator}
        if operator == "between":
            minimum = _normalize_results_filter_number(node.get("min"))
            maximum = _normalize_results_filter_number(node.get("max"))
            if minimum is None or maximum is None:
                return None
            if minimum > maximum:
                minimum, maximum = maximum, minimum
            normalized["min"] = minimum
            normalized["max"] = maximum
            return normalized
        if operator not in {"is_empty", "is_not_empty"}:
            value = _normalize_results_filter_number(node.get("value"))
            if value is None:
                return None
            normalized["value"] = value
        return normalized
    if kind == "datetime":
        operator = str(node.get("operator") or "on_or_after").strip().lower()
        if operator not in DATETIME_FILTER_OPERATORS:
            operator = "on_or_after"
        normalized = {"type": "condition", "field": field, "operator": operator}
        if operator == "between":
            minimum = _normalize_results_filter_text(node.get("min"))
            maximum = _normalize_results_filter_text(node.get("max"))
            if not minimum or not maximum:
                return None
            normalized["min"] = minimum
            normalized["max"] = maximum
            return normalized
        if operator not in {"is_empty", "is_not_empty"}:
            value = _normalize_results_filter_text(node.get("value"))
            if not value:
                return None
            normalized["value"] = value
        return normalized
    if kind == "boolean":
        operator = str(node.get("operator") or "is_true").strip().lower()
        if operator not in BOOLEAN_FILTER_OPERATORS:
            operator = "is_true"
        return {"type": "condition", "field": field, "operator": operator}
    if kind == "tags":
        operator = str(node.get("operator") or "has_any").strip().lower()
        if operator not in TAG_FILTER_OPERATORS:
            operator = "has_any"
        normalized = {"type": "condition", "field": field, "operator": operator}
        if operator not in {"is_empty", "is_not_empty"}:
            values = normalize_tags(node.get("values") if "values" in node else node.get("value"))
            if not values:
                return None
            normalized["values"] = values
        return normalized
    return None


def _normalize_results_filter_tree(payload: Any, table: str) -> dict[str, Any]:
    normalized = _normalize_results_filter_node(payload, table)
    if not isinstance(normalized, dict) or normalized.get("type") != "group":
        return _empty_results_filter_tree()
    return normalized


def _results_filter_tree_has_conditions(node: dict[str, Any] | None) -> bool:
    if not isinstance(node, dict):
        return False
    if node.get("type") == "condition":
        return True
    return any(_results_filter_tree_has_conditions(child) for child in node.get("children", []))


def _stringify_results_filter_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def _item_results_filter_value(item: dict[str, Any], field: str, kind: str) -> Any:
    value = item.get(field)
    if kind == "tags":
        return normalize_tags(value)
    if kind == "number":
        return _normalize_results_filter_number(value)
    if kind == "boolean":
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        try:
            return bool(int(value))
        except (TypeError, ValueError):
            return bool(value)
    if kind == "datetime":
        return parse_created_at(str(value or ""))
    return _stringify_results_filter_value(value)


def _evaluate_results_filter_condition(condition: dict[str, Any], item: dict[str, Any], table: str) -> bool:
    field = str(condition.get("field") or "").strip()
    kind = RESULTS_FIELD_KINDS_BY_TABLE[table].get(field)
    if not kind:
        return False
    operator = str(condition.get("operator") or "").strip().lower()
    current = _item_results_filter_value(item, field, kind)
    if kind == "tags":
        tags = [value.lower() for value in current or []]
        if operator == "is_empty":
            return not tags
        if operator == "is_not_empty":
            return bool(tags)
        values = [value.lower() for value in condition.get("values", [])]
        if operator == "has_all":
            return all(value in tags for value in values)
        return any(value in tags for value in values)
    if kind == "boolean":
        if operator == "is_true":
            return bool(current) is True
        if operator == "is_false":
            return bool(current) is False
        return False
    if kind == "datetime":
        if operator == "is_empty":
            return current is None
        if operator == "is_not_empty":
            return current is not None
        if current is None:
            return False
        if operator == "between":
            minimum = parse_created_at(str(condition.get("min") or ""))
            maximum = parse_created_at(str(condition.get("max") or ""))
            if minimum is None or maximum is None:
                return False
            if minimum > maximum:
                minimum, maximum = maximum, minimum
            return minimum <= current <= maximum
        value = parse_created_at(str(condition.get("value") or ""))
        if value is None:
            return False
        if operator == "on_or_after":
            return current >= value
        if operator == "on_or_before":
            return current <= value
        return False
    if kind == "number":
        if operator == "is_empty":
            return current is None
        if operator == "is_not_empty":
            return current is not None
        if current is None:
            return False
        target = _normalize_results_filter_number(condition.get("value"))
        if operator == "between":
            minimum = _normalize_results_filter_number(condition.get("min"))
            maximum = _normalize_results_filter_number(condition.get("max"))
            if minimum is None or maximum is None:
                return False
            return minimum <= current <= maximum
        if target is None:
            return False
        if operator == "eq":
            return current == target
        if operator == "neq":
            return current != target
        if operator == "gt":
            return current > target
        if operator == "gte":
            return current >= target
        if operator == "lt":
            return current < target
        if operator == "lte":
            return current <= target
        return False

    text_value = str(current or "")
    lowered = text_value.lower()
    if operator == "is_empty":
        return not text_value.strip()
    if operator == "is_not_empty":
        return bool(text_value.strip())
    if operator == "length_between":
        minimum = _normalize_results_filter_number(condition.get("min"))
        maximum = _normalize_results_filter_number(condition.get("max"))
        if minimum is None or maximum is None:
            return False
        return minimum <= len(text_value) <= maximum
    if operator.startswith("length_"):
        target = _normalize_results_filter_number(condition.get("value"))
        if target is None:
            return False
        if operator == "length_gt":
            return len(text_value) > target
        if operator == "length_gte":
            return len(text_value) >= target
        if operator == "length_lt":
            return len(text_value) < target
        if operator == "length_lte":
            return len(text_value) <= target
        return False
    target_text = str(condition.get("value") or "")
    target_lower = target_text.lower()
    if operator == "contains":
        return target_lower in lowered
    if operator == "not_contains":
        return target_lower not in lowered
    if operator == "equals":
        return lowered == target_lower
    if operator == "not_equals":
        return lowered != target_lower
    if operator == "starts_with":
        return lowered.startswith(target_lower)
    if operator == "ends_with":
        return lowered.endswith(target_lower)
    return False


def _evaluate_results_filter_tree(node: dict[str, Any], item: dict[str, Any], table: str) -> bool:
    if node.get("type") == "condition":
        return _evaluate_results_filter_condition(node, item, table)
    children = [child for child in node.get("children", []) if isinstance(child, dict)]
    if not children:
        return True
    if str(node.get("relation") or "AND").upper() == "OR":
        return any(_evaluate_results_filter_tree(child, item, table) for child in children)
    return all(_evaluate_results_filter_tree(child, item, table) for child in children)


def _filter_items_in_memory(items: list[dict[str, Any]], table: str, filter_tree: dict[str, Any] | None) -> list[dict[str, Any]]:
    normalized_tree = _normalize_results_filter_tree(filter_tree, table)
    if not _results_filter_tree_has_conditions(normalized_tree):
        return items
    return [item for item in items if _evaluate_results_filter_tree(normalized_tree, item, table)]


def _sort_items_in_memory(items: list[dict[str, Any]], table: str, sort_by: str | None, sort_dir: str | None) -> list[dict[str, Any]]:
    requested = str(sort_by or "").strip()
    allowed = RAW_ITEM_SORT_FIELDS if table == "raw" else CURATED_ITEM_SORT_FIELDS
    field = requested if requested in allowed else "id"
    direction = "ASC" if str(sort_dir or "").strip().lower() == "asc" else "DESC"
    kind = RESULTS_FIELD_KINDS_BY_TABLE[table].get(field, "text")
    if kind == "datetime":
        return sorted(items, key=lambda item: _item_created_at_sort_key({"id": item["id"], "created_at_x": item.get(field)}, direction))
    if kind in {"number", "boolean"}:
        return sorted(items, key=lambda item: _number_sort_key({"id": item["id"], field: item.get(field)}, field, direction))
    return sorted(
        items,
        key=lambda item: (_stringify_results_filter_value(item.get(field)).lower(), int(item["id"])),
        reverse=direction == "DESC",
    )


def _metric(item: SearchResult, key: str) -> int:
    metrics = item.raw.get("metrics", {}) if isinstance(item.raw, dict) else {}
    value = metrics.get(key, 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _item_metric(payload: dict[str, Any], key: str) -> int:
    metrics = payload.get("metrics", {})
    value = metrics.get(key, payload.get(key, 0)) if isinstance(metrics, dict) else payload.get(key, 0)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _threshold_pass(item: SearchResult, thresholds: dict[str, Any]) -> bool:
    mode = str(thresholds.get("mode", "OR")).upper()
    views = int(thresholds.get("views", 0) or 0)
    replies = int(thresholds.get("replies", 0) or 0)
    retweets = int(thresholds.get("retweets", 0) or 0)

    checks = []
    if views > 0:
        checks.append(_metric(item, "views") >= views)
    if replies > 0:
        checks.append(_metric(item, "replies") >= replies)
    if retweets > 0:
        checks.append(_metric(item, "retweets") >= retweets)

    if not checks:
        return True
    if mode == "AND":
        return all(checks)
    return any(checks)


def _search_result_to_raw(item: SearchResult) -> dict[str, Any]:
    return asdict(item)


def _dedupe_search_results(items: list[SearchResult]) -> list[SearchResult]:
    deduped: list[SearchResult] = []
    seen: set[str] = set()
    for item in items:
        key = build_source_dedupe_key(
            tweet_id=item.tweet_id,
            url=item.url,
            text=item.text,
            author=item.author,
        ) or canonicalize_source_url(item.url)
        if not key:
            key = f"{item.author}|{item.created_at}|{item.text[:120]}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped

__all__ = [name for name in globals() if not name.startswith("__")]
