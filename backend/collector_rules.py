from __future__ import annotations

import copy
import re
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.models import SearchResult
from backend.opportunity_signals import (
    ACTION_KEYWORDS,
    CRYPTO_CONTEXT_KEYWORDS,
    TRADE_GATE_KEYWORDS,
    TRUSTED_AUTHORS,
)

DEFAULT_LEVELS = [
    {"id": "S", "label": "强信号", "min_score": 90, "color": "#dc2626"},
    {"id": "A", "label": "高优先级", "min_score": 60, "color": "#ea580c"},
    {"id": "B", "label": "观察", "min_score": 30, "color": "#2563eb"},
]

DEFAULT_RULES = [
    {
        "id": "exclude-trade-gated",
        "name": "排除交易门槛",
        "enabled": True,
        "operator": "AND",
        "conditions": [
            {"type": "text_contains_any", "values": list(TRADE_GATE_KEYWORDS)},
        ],
        "effect": {"action": "exclude", "score": 0, "level": ""},
    },
    {
        "id": "trusted-author-action",
        "name": "官方账号 + 行动词",
        "enabled": True,
        "operator": "AND",
        "conditions": [
            {"type": "author_in", "values": sorted(TRUSTED_AUTHORS)},
            {"type": "text_contains_any", "values": list(ACTION_KEYWORDS)},
        ],
        "effect": {"action": "score", "score": 65, "level": "A"},
    },
    {
        "id": "action-keywords",
        "name": "命中行动词",
        "enabled": True,
        "operator": "AND",
        "conditions": [
            {"type": "text_contains_any", "values": list(ACTION_KEYWORDS)},
        ],
        "effect": {"action": "score", "score": 35, "level": "B"},
    },
    {
        "id": "crypto-context",
        "name": "命中加密上下文",
        "enabled": True,
        "operator": "AND",
        "conditions": [
            {"type": "text_contains_any", "values": list(CRYPTO_CONTEXT_KEYWORDS)},
        ],
        "effect": {"action": "score", "score": 20, "level": "B"},
    },
    {
        "id": "high-engagement",
        "name": "高互动增强",
        "enabled": True,
        "operator": "AND",
        "conditions": [
            {"type": "metric_at_least", "metric": "views", "value": 500},
            {"type": "metric_at_least", "metric": "replies", "value": 3},
            {"type": "text_contains_any", "values": list(ACTION_KEYWORDS)},
        ],
        "effect": {"action": "score", "score": 20, "level": "A"},
    },
]

EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")
HASHTAG_RE = re.compile(r"(^|\s)#\w+")
CASHTAG_RE = re.compile(r"(^|\s)\$[A-Za-z][A-Za-z0-9_]{1,9}")
URL_RE = re.compile(r"https?://", re.IGNORECASE)

LANGUAGE_MODES = {"zh", "en", "zh_en"}
RANGE_MODES = {"any", "gte", "lte", "between"}


def default_range_filter(mode: str = "any", *, minimum: int | None = None, maximum: int | None = None) -> dict[str, Any]:
    return {"mode": mode, "min": minimum, "max": maximum}


def default_metric_filters() -> dict[str, dict[str, Any]]:
    return {
        "views": default_range_filter("gte", minimum=200),
        "likes": default_range_filter(),
        "replies": default_range_filter("gte", minimum=1),
        "retweets": default_range_filter(),
    }


def default_search_spec() -> dict[str, Any]:
    return {
        "all_keywords": ["BTC"],
        "exact_phrases": [],
        "any_keywords": [],
        "exclude_keywords": [],
        "authors_include": [],
        "authors_exclude": [],
        "language_mode": "zh_en",
        "days_filter": default_range_filter("lte", maximum=20),
        "metric_filters": default_metric_filters(),
        "metric_filters_explicit": True,
        "language": "",
        "days": 20,
        "max_results": 40,
        "metric_mode": "OR",
        "min_metrics": {"views": 200, "likes": 0, "replies": 1, "retweets": 0},
        "include_retweets": False,
        "include_replies": True,
        "require_media": False,
        "require_links": False,
        "raw_query": "",
    }


def default_rule_set_definition() -> dict[str, Any]:
    return {
        "levels": copy.deepcopy(DEFAULT_LEVELS),
        "rules": copy.deepcopy(DEFAULT_RULES),
    }


def normalize_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [segment.strip() for segment in re.split("[\uFF0C,\n]+", value) if segment.strip()]
    return []

def coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def clamp_non_negative(value: Any, default: int = 0, *, maximum: int | None = None) -> int:
    normalized = max(0, coerce_int(value, default))
    if maximum is not None:
        return min(maximum, normalized)
    return normalized


def normalize_language_mode(value: Any) -> str:
    cleaned = str(value or "").strip().lower().replace(" ", "")
    cleaned = cleaned.replace("+", "_").replace(",", "_")
    if cleaned in {"", "zh_en", "en_zh"}:
        return "zh_en"
    if cleaned in LANGUAGE_MODES:
        return cleaned
    return "zh_en"


def resolve_language_codes(language_mode: str) -> list[str]:
    if language_mode == "zh":
        return ["zh"]
    if language_mode == "en":
        return ["en"]
    return ["zh", "en"]


def normalize_range_filter(
    payload: Any,
    *,
    fallback: dict[str, Any],
    maximum: int | None = None,
    legacy_value: Any | None = None,
    legacy_mode: str = "gte",
) -> dict[str, Any]:
    if isinstance(payload, dict):
        mode = str(payload.get("mode") or fallback.get("mode") or "any").strip().lower()
        if mode not in RANGE_MODES:
            mode = str(fallback.get("mode") or "any")
        minimum = None
        maximum_value = None
        if mode == "gte":
            minimum = clamp_non_negative(payload.get("min", payload.get("value", fallback.get("min", 0))), fallback.get("min") or 0, maximum=maximum)
        elif mode == "lte":
            maximum_value = clamp_non_negative(payload.get("max", payload.get("value", fallback.get("max", 0))), fallback.get("max") or 0, maximum=maximum)
        elif mode == "between":
            minimum = clamp_non_negative(payload.get("min", fallback.get("min", 0)), fallback.get("min") or 0, maximum=maximum)
            maximum_value = clamp_non_negative(payload.get("max", fallback.get("max", minimum)), fallback.get("max") or minimum, maximum=maximum)
            if minimum > maximum_value:
                minimum, maximum_value = maximum_value, minimum
        return default_range_filter(mode, minimum=minimum, maximum=maximum_value)

    if legacy_value is not None:
        numeric = clamp_non_negative(legacy_value, 0, maximum=maximum)
        if numeric > 0:
            if legacy_mode == "lte":
                return default_range_filter("lte", maximum=numeric)
            return default_range_filter("gte", minimum=numeric)

    return default_range_filter(
        str(fallback.get("mode") or "any"),
        minimum=fallback.get("min"),
        maximum=fallback.get("max"),
    )


def derive_legacy_days_value(days_filter: dict[str, Any]) -> int:
    mode = str(days_filter.get("mode") or "any").lower()
    if mode == "gte":
        return int(days_filter.get("min") or 0)
    if mode in {"lte", "between"}:
        return int(days_filter.get("max") or 0)
    return 20


def derive_legacy_min_metrics(metric_filters: dict[str, dict[str, Any]]) -> dict[str, int]:
    minimums: dict[str, int] = {}
    for key in ("views", "likes", "replies", "retweets"):
        current = metric_filters.get(key, {})
        mode = str(current.get("mode") or "any").lower()
        minimums[key] = int(current.get("min") or 0) if mode in {"gte", "between"} else 0
    return minimums


def normalize_metric_filters(
    metric_filters: Any,
    *,
    fallback: dict[str, dict[str, Any]],
    legacy_min_metrics: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    normalized: dict[str, dict[str, Any]] = {}
    for key in ("views", "likes", "replies", "retweets"):
        payload = metric_filters.get(key) if isinstance(metric_filters, dict) else None
        legacy_value = legacy_min_metrics.get(key) if isinstance(legacy_min_metrics, dict) else None
        normalized[key] = normalize_range_filter(payload, fallback=fallback[key], legacy_value=legacy_value, legacy_mode="gte")
    return normalized



def normalize_search_spec(payload: dict[str, Any] | None) -> dict[str, Any]:
    base = default_search_spec()
    incoming = payload or {}
    base["all_keywords"] = normalize_list(incoming.get("all_keywords") or incoming.get("keywords")) or base["all_keywords"]
    base["exact_phrases"] = normalize_list(incoming.get("exact_phrases"))
    base["any_keywords"] = normalize_list(incoming.get("any_keywords"))
    base["exclude_keywords"] = normalize_list(incoming.get("exclude_keywords"))
    base["authors_include"] = [item.lstrip("@") for item in normalize_list(incoming.get("authors_include"))]
    base["authors_exclude"] = [item.lstrip("@") for item in normalize_list(incoming.get("authors_exclude"))]
    base["language_mode"] = normalize_language_mode(incoming.get("language_mode") or incoming.get("language"))
    base["days_filter"] = normalize_range_filter(
        incoming.get("days_filter"),
        fallback=base["days_filter"],
        maximum=100,
        legacy_value=incoming.get("days"),
        legacy_mode="lte",
    )
    base["max_results"] = max(1, min(100, coerce_int(incoming.get("max_results", base["max_results"]), base["max_results"])))
    metric_mode = str(incoming.get("metric_mode") or incoming.get("thresholds", {}).get("mode") or base["metric_mode"]).upper()
    base["metric_mode"] = "AND" if metric_mode == "AND" else "OR"
    min_metrics = incoming.get("min_metrics") if isinstance(incoming.get("min_metrics"), dict) else {}
    thresholds = incoming.get("thresholds") if isinstance(incoming.get("thresholds"), dict) else {}
    legacy_min_metrics = {
        "views": coerce_int(min_metrics.get("views", thresholds.get("views", base["min_metrics"]["views"])), base["min_metrics"]["views"]),
        "likes": coerce_int(min_metrics.get("likes", thresholds.get("likes", base["min_metrics"]["likes"])), base["min_metrics"]["likes"]),
        "replies": coerce_int(min_metrics.get("replies", thresholds.get("replies", base["min_metrics"]["replies"])), base["min_metrics"]["replies"]),
        "retweets": coerce_int(min_metrics.get("retweets", thresholds.get("retweets", base["min_metrics"]["retweets"])), base["min_metrics"]["retweets"]),
    }
    explicit_metric_filters = bool(incoming.get("metric_filters_explicit")) or isinstance(incoming.get("metric_filters"), dict)
    base["metric_filters_explicit"] = explicit_metric_filters
    base["metric_filters"] = normalize_metric_filters(
        incoming.get("metric_filters"),
        fallback=base["metric_filters"],
        legacy_min_metrics=legacy_min_metrics,
    )
    base["min_metrics"] = derive_legacy_min_metrics(base["metric_filters"])
    base["language"] = "" if base["language_mode"] == "zh_en" else base["language_mode"]
    base["days"] = derive_legacy_days_value(base["days_filter"])
    base["include_retweets"] = bool(incoming.get("include_retweets", base["include_retweets"]))
    base["include_replies"] = bool(incoming.get("include_replies", base["include_replies"]))
    base["require_media"] = bool(incoming.get("require_media", False))
    base["require_links"] = bool(incoming.get("require_links", False))
    base["raw_query"] = str(incoming.get("raw_query") or "").strip()
    return base


def normalize_rule_set_definition(payload: dict[str, Any] | None) -> dict[str, Any]:
    incoming = payload or {}
    levels = incoming.get("levels") if isinstance(incoming.get("levels"), list) and incoming.get("levels") else copy.deepcopy(DEFAULT_LEVELS)
    normalized_levels: list[dict[str, Any]] = []
    for level in levels:
        if not isinstance(level, dict):
            continue
        level_id = str(level.get("id") or level.get("label") or "").strip() or "L"
        normalized_levels.append(
            {
                "id": level_id,
                "label": str(level.get("label") or level_id).strip(),
                "min_score": coerce_int(level.get("min_score", 0), 0),
                "color": str(level.get("color") or "#2563eb").strip(),
            }
        )
    if not normalized_levels:
        normalized_levels = copy.deepcopy(DEFAULT_LEVELS)

    rules = incoming.get("rules") if isinstance(incoming.get("rules"), list) and incoming.get("rules") else copy.deepcopy(DEFAULT_RULES)
    normalized_rules: list[dict[str, Any]] = []
    level_ids = {level["id"] for level in normalized_levels}
    for index, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict):
            continue
        effect = rule.get("effect") if isinstance(rule.get("effect"), dict) else {}
        conditions = rule.get("conditions") if isinstance(rule.get("conditions"), list) else []
        normalized_conditions = [normalize_condition(condition) for condition in conditions if isinstance(condition, dict)]
        if not normalized_conditions:
            continue
        target_level = str(effect.get("level") or "").strip()
        normalized_rules.append(
            {
                "id": str(rule.get("id") or f"rule-{index}").strip(),
                "name": str(rule.get("name") or f"规则 {index}").strip(),
                "enabled": bool(rule.get("enabled", True)),
                "operator": "OR" if str(rule.get("operator") or "AND").upper() == "OR" else "AND",
                "conditions": normalized_conditions,
                "effect": {
                    "action": normalize_action(effect.get("action")),
                    "score": coerce_int(effect.get("score", 0), 0),
                    "level": target_level if target_level in level_ids else "",
                },
            }
        )
    if not normalized_rules:
        normalized_rules = copy.deepcopy(DEFAULT_RULES)
    return {"levels": normalized_levels, "rules": normalized_rules}


def normalize_action(value: Any) -> str:
    action = str(value or "score").strip().lower()
    return action if action in {"score", "exclude"} else "score"


def normalize_condition(condition: dict[str, Any]) -> dict[str, Any]:
    condition_type = str(condition.get("type") or "text_contains_any").strip()
    normalized = {"type": condition_type}
    if condition_type in {"text_contains_any", "text_not_contains_any", "author_in", "author_not_in", "author_contains_any"}:
        normalized["values"] = normalize_list(condition.get("values"))
    elif condition_type == "metric_at_least":
        normalized["metric"] = str(condition.get("metric") or "views").strip().lower()
        normalized["value"] = coerce_int(condition.get("value", 0), 0)
    elif condition_type == "age_within_days":
        normalized["value"] = coerce_int(condition.get("value", 20), 20)
    elif condition_type == "language_is":
        normalized["value"] = str(condition.get("value") or "").strip().lower()
    else:
        normalized.update({key: value for key, value in condition.items() if key != "type"})
    return normalized


def build_query_from_search_spec(spec: dict[str, Any], language_override: str | None = None) -> str:
    parts: list[str] = []
    parts.extend(spec.get("all_keywords", []))
    parts.extend([f'"{phrase}"' for phrase in spec.get("exact_phrases", [])])
    any_keywords = spec.get("any_keywords", [])
    if any_keywords:
        parts.append("(" + " OR ".join(any_keywords) + ")")
    parts.extend([f"-{word}" for word in spec.get("exclude_keywords", [])])
    include_authors = spec.get("authors_include", [])
    if include_authors:
        parts.append("(" + " OR ".join([f"from:{author}" for author in include_authors]) + ")")
    parts.extend([f"-from:{author}" for author in spec.get("authors_exclude", [])])
    language_code = language_override or spec.get("language")
    if language_code:
        parts.append(f"lang:{language_code}")
    if not spec.get("include_retweets", True):
        parts.append("-is:retweet")
    if not spec.get("include_replies", True):
        parts.append("-is:reply")
    if spec.get("require_media"):
        parts.append("filter:media")
    if spec.get("require_links"):
        parts.append("filter:links")
    if spec.get("raw_query"):
        parts.append(spec["raw_query"])
    return " ".join(segment for segment in parts if segment).strip()


def build_query_plan_from_search_spec(spec: dict[str, Any]) -> list[str]:
    codes = resolve_language_codes(str(spec.get("language_mode") or "zh_en"))
    queries = [build_query_from_search_spec(spec, language_override=code) for code in codes]
    return [query for query in queries if query]


def extract_metrics(item: SearchResult) -> dict[str, int]:
    raw_metrics = item.raw.get("metrics", {}) if isinstance(item.raw, dict) else {}
    metrics: dict[str, int] = {"views": 0, "likes": 0, "replies": 0, "retweets": 0}
    for key in metrics:
        try:
            metrics[key] = int(raw_metrics.get(key, 0) or 0)
        except (TypeError, ValueError):
            metrics[key] = 0
    return metrics


def infer_features(item: SearchResult) -> dict[str, Any]:
    text = item.text or ""
    lowered = text.lower()
    raw = item.raw if isinstance(item.raw, dict) else {}
    created_at = parse_created_at(item.created_at)
    language = str(raw.get("lang") or raw.get("language") or "").strip().lower()
    media_candidates = [raw.get("media"), raw.get("photos"), raw.get("videos"), raw.get("images")]
    has_media = any(bool(candidate) for candidate in media_candidates) or "pic.twitter.com/" in lowered
    has_link = bool(URL_RE.search(text))
    is_retweet = lowered.startswith("rt @") or bool(raw.get("retweeted"))
    is_reply = lowered.startswith("@") or bool(raw.get("in_reply_to_status_id"))
    return {
        "text": text,
        "text_lower": lowered,
        "author": (item.author or "").strip().lower().lstrip("@"),
        "created_at": created_at,
        "language": language,
        "metrics": extract_metrics(item),
        "has_media": has_media,
        "has_link": has_link,
        "has_hashtag": bool(HASHTAG_RE.search(text)),
        "has_cashtag": bool(CASHTAG_RE.search(text)),
        "has_emoji": bool(EMOJI_RE.search(text)),
        "is_retweet": is_retweet,
        "is_reply": is_reply,
    }


def parse_created_at(value: str) -> datetime | None:
    if not value:
        return None
    candidate = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        try:
            parsed = datetime.strptime(value.strip(), "%a %b %d %H:%M:%S %z %Y")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _passes_range_filter(value: int, current: dict[str, Any]) -> bool:
    mode = str(current.get("mode") or "any").lower()
    if mode == "any":
        return True
    if mode == "gte":
        return value >= int(current.get("min") or 0)
    if mode == "lte":
        return value <= int(current.get("max") or 0)
    if mode == "between":
        minimum = int(current.get("min") or 0)
        maximum = int(current.get("max") or minimum)
        if minimum > maximum:
            minimum, maximum = maximum, minimum
        return minimum <= value <= maximum
    return True


def passes_metric_gate(item: SearchResult, spec: dict[str, Any], features: dict[str, Any] | None = None) -> bool:
    metrics = (features or infer_features(item)).get("metrics", {})
    if spec.get("metric_filters_explicit"):
        filters = spec.get("metric_filters", {}) if isinstance(spec.get("metric_filters"), dict) else {}
        checks = [_passes_range_filter(int(metrics.get(key, 0) or 0), filters.get(key, {})) for key in ("views", "likes", "replies", "retweets")]
        return all(checks) if checks else True

    thresholds = spec.get("min_metrics", {}) if isinstance(spec.get("min_metrics"), dict) else {}
    checks: list[bool] = []
    for key in ("views", "likes", "replies", "retweets"):
        threshold = int(thresholds.get(key, 0) or 0)
        if threshold > 0:
            checks.append(int(metrics.get(key, 0) or 0) >= threshold)
    if not checks:
        return True
    return all(checks) if str(spec.get("metric_mode") or "OR").upper() == "AND" else any(checks)


def passes_days_filter(item: SearchResult, spec: dict[str, Any], now_utc: datetime, features: dict[str, Any] | None = None) -> bool:
    days_filter = spec.get("days_filter", {}) if isinstance(spec.get("days_filter"), dict) else {}
    mode = str(days_filter.get("mode") or "any").lower()
    if mode == "any":
        return True
    created_at = (features or infer_features(item)).get("created_at")
    if not created_at:
        return False
    age_days = max(0, int((now_utc - created_at).total_seconds() // 86400))
    return _passes_range_filter(age_days, days_filter)


def passes_language_gate(item: SearchResult, spec: dict[str, Any], features: dict[str, Any] | None = None) -> bool:
    language = str((features or infer_features(item)).get("language") or "").lower()
    if not language:
        return True
    return language in set(resolve_language_codes(str(spec.get("language_mode") or "zh_en")))


def passes_search_filters(item: SearchResult, spec: dict[str, Any], now_utc: datetime) -> bool:
    features = infer_features(item)
    if not passes_language_gate(item, spec, features):
        return False
    if not passes_days_filter(item, spec, now_utc, features):
        return False
    if not passes_metric_gate(item, spec, features):
        return False
    if not spec.get("include_retweets", True) and features["is_retweet"]:
        return False
    if not spec.get("include_replies", True) and features["is_reply"]:
        return False
    if spec.get("require_media") and not features["has_media"]:
        return False
    if spec.get("require_links") and not features["has_link"]:
        return False
    return True


def serialize_search_result(item: SearchResult) -> dict[str, Any]:
    features = infer_features(item)
    return {
        **asdict(item),
        "metrics": features["metrics"],
        "flags": {
            "has_media": features["has_media"],
            "has_link": features["has_link"],
            "has_hashtag": features["has_hashtag"],
            "has_cashtag": features["has_cashtag"],
            "has_emoji": features["has_emoji"],
            "is_retweet": features["is_retweet"],
            "is_reply": features["is_reply"],
        },
        "language": features["language"],
    }


def evaluate_rule_set(
    items: list[SearchResult],
    rule_definition: dict[str, Any],
    now_utc: datetime,
    fallback_days: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    definition = normalize_rule_set_definition(rule_definition)
    levels = sorted(definition["levels"], key=lambda level: int(level.get("min_score", 0)), reverse=True)
    stats = {"evaluated": len(items), "matched": 0, "excluded": 0}
    level_counts: dict[str, int] = {level["id"]: 0 for level in levels}
    matched_items: list[dict[str, Any]] = []

    for item in items:
        features = infer_features(item)
        score = 0
        reasons: list[dict[str, Any]] = []
        level_hint = ""
        excluded = False
        for rule in definition["rules"]:
            if not rule.get("enabled", True):
                continue
            matched_conditions = [condition for condition in rule["conditions"] if evaluate_condition(condition, features, now_utc, fallback_days)]
            operator = rule.get("operator", "AND")
            matched = bool(matched_conditions) and (
                len(matched_conditions) == len(rule["conditions"]) if operator == "AND" else True
            )
            if not matched:
                continue
            effect = rule.get("effect", {})
            action = effect.get("action", "score")
            reason = {
                "rule_id": rule["id"],
                "rule_name": rule["name"],
                "action": action,
                "score": int(effect.get("score", 0) or 0),
                "level": str(effect.get("level") or "").strip(),
                "matched_conditions": [describe_condition(condition) for condition in matched_conditions],
            }
            reasons.append(reason)
            if action == "exclude":
                excluded = True
                break
            score += int(effect.get("score", 0) or 0)
            if effect.get("level"):
                level_hint = str(effect["level"])
        if excluded:
            stats["excluded"] += 1
            continue
        resolved_level = resolve_level(score, levels, level_hint)
        if score <= 0 or not resolved_level:
            continue
        serialized = serialize_search_result(item)
        matched_item = {
            **serialized,
            "score": score,
            "level": resolved_level,
            "reasons": reasons,
            "title": build_result_title(item, resolved_level),
            "summary": build_result_summary(reasons, score, resolved_level),
        }
        matched_items.append(matched_item)
        stats["matched"] += 1
        level_counts[resolved_level] = level_counts.get(resolved_level, 0) + 1

    stats.update(level_counts)
    return matched_items, stats


def evaluate_condition(condition: dict[str, Any], features: dict[str, Any], now_utc: datetime, fallback_days: int) -> bool:
    condition_type = condition.get("type")
    text_lower = features["text_lower"]
    author = features["author"]
    if condition_type == "text_contains_any":
        return any(str(value).lower() in text_lower for value in condition.get("values", []))
    if condition_type == "text_not_contains_any":
        values = [str(value).lower() for value in condition.get("values", [])]
        return bool(values) and not any(value in text_lower for value in values)
    if condition_type == "author_in":
        values = {str(value).lower().lstrip("@") for value in condition.get("values", [])}
        return author in values if values else False
    if condition_type == "author_not_in":
        values = {str(value).lower().lstrip("@") for value in condition.get("values", [])}
        return author not in values if values else False
    if condition_type == "author_contains_any":
        return any(str(value).lower() in author for value in condition.get("values", []))
    if condition_type == "metric_at_least":
        metric = str(condition.get("metric") or "views").lower()
        threshold = int(condition.get("value", 0) or 0)
        return features["metrics"].get(metric, 0) >= threshold
    if condition_type == "has_link":
        return bool(features["has_link"])
    if condition_type == "has_media":
        return bool(features["has_media"])
    if condition_type == "has_hashtag":
        return bool(features["has_hashtag"])
    if condition_type == "has_cashtag":
        return bool(features["has_cashtag"])
    if condition_type == "has_emoji":
        return bool(features["has_emoji"])
    if condition_type == "is_retweet":
        return bool(features["is_retweet"])
    if condition_type == "is_reply":
        return bool(features["is_reply"])
    if condition_type == "language_is":
        return features.get("language", "") == str(condition.get("value") or "").lower()
    if condition_type == "age_within_days":
        created_at = features.get("created_at")
        if not created_at:
            return False
        window = max(1, int(condition.get("value", fallback_days) or fallback_days))
        return created_at >= (now_utc - timedelta(days=window))
    return False


def resolve_level(score: int, levels: list[dict[str, Any]], level_hint: str) -> str:
    if level_hint and any(level["id"] == level_hint for level in levels):
        return level_hint
    for level in levels:
        if score >= int(level.get("min_score", 0) or 0):
            return str(level["id"])
    return ""


def describe_condition(condition: dict[str, Any]) -> str:
    condition_type = condition.get("type")
    if condition_type in {"text_contains_any", "text_not_contains_any", "author_in", "author_not_in", "author_contains_any"}:
        values = ", ".join(condition.get("values", []))
        return f"{condition_type}:{values}"
    if condition_type == "metric_at_least":
        return f"{condition.get('metric', 'views')} >= {condition.get('value', 0)}"
    if condition_type in {"age_within_days", "language_is"}:
        return f"{condition_type}:{condition.get('value', '')}"
    return str(condition_type)


def build_result_title(item: SearchResult, level: str) -> str:
    snippet = " ".join((item.text or "").split())[:80] or "new clue"
    author = item.author or "unknown"
    suffix = f" #{str(item.tweet_id)[-6:]}" if item.tweet_id else ""
    return f"[{level}] {author}{suffix}: {snippet}"


def build_result_summary(reasons: list[dict[str, Any]], score: int, level: str) -> str:
    names = " / ".join(reason["rule_name"] for reason in reasons[:3]) or "未命中规则"
    return f"命中 {names}，总分 {score}，等级 {level}。"


