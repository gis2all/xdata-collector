import unittest
from datetime import datetime, timezone

from backend.collector_rules import (
    build_query_from_search_spec,
    build_query_plan_from_search_spec,
    build_result_summary,
    build_result_title,
    evaluate_rule_set,
    normalize_rule_set_definition,
    normalize_search_spec,
    passes_days_filter,
    passes_metric_gate,
    passes_search_filters,
    resolve_level,
)
from backend.models import SearchResult


def make_result(
    *,
    tweet_id: str = "1001",
    text: str = "Claim the faucet now https://example.com",
    author: str = "galxe",
    created_at: str = "2026-04-12T00:00:00+00:00",
    metrics: dict | None = None,
    lang: str = "en",
) -> SearchResult:
    return SearchResult(
        query_name="manual:test",
        query="faucet",
        tweet_id=tweet_id,
        url=f"https://x.com/{author}/status/{tweet_id}",
        text=text,
        author=author,
        created_at=created_at,
        raw={
            "lang": lang,
            "metrics": metrics or {"views": 1000, "likes": 10, "replies": 5, "retweets": 2},
        },
    )


class CollectorRulesTests(unittest.TestCase):
    def test_normalize_search_spec_maps_legacy_fields_and_defaults_language_to_zh_en(self) -> None:
        spec = normalize_search_spec(
            {
                "keywords": "BTC\uFF0C ETH\nSOL",
                "authors_include": "@Alice, bob",
                "authors_exclude": ["@spam", ""],
                "language": "",
                "days": 150,
                "max_results": 500,
                "thresholds": {"mode": "and", "views": "12", "replies": "3"},
                "require_links": 1,
                "raw_query": "  is:verified  ",
            }
        )

        self.assertEqual(spec["all_keywords"], ["BTC", "ETH", "SOL"])
        self.assertEqual(spec["authors_include"], ["Alice", "bob"])
        self.assertEqual(spec["authors_exclude"], ["spam"])
        self.assertEqual(spec["language_mode"], "zh_en")
        self.assertEqual(spec["language"], "")
        self.assertEqual(spec["days_filter"], {"mode": "lte", "min": None, "max": 100})
        self.assertEqual(spec["days"], 100)
        self.assertEqual(spec["max_results"], 100)
        self.assertEqual(spec["metric_mode"], "AND")
        self.assertFalse(spec["metric_filters_explicit"])
        self.assertEqual(spec["min_metrics"]["views"], 12)
        self.assertEqual(spec["min_metrics"]["replies"], 3)
        self.assertTrue(spec["require_links"])
        self.assertEqual(spec["raw_query"], "is:verified")

    def test_normalize_search_spec_supports_explicit_range_filters(self) -> None:
        spec = normalize_search_spec(
            {
                "language_mode": "zh+en",
                "days_filter": {"mode": "between", "min": 80, "max": 120},
                "metric_filters": {
                    "views": {"mode": "between", "min": 300, "max": 100},
                    "likes": {"mode": "lte", "max": 5},
                    "replies": {"mode": "gte", "min": 2},
                    "retweets": {"mode": "any"},
                },
                "metric_filters_explicit": True,
            }
        )

        self.assertEqual(spec["language_mode"], "zh_en")
        self.assertEqual(spec["days_filter"], {"mode": "between", "min": 80, "max": 100})
        self.assertTrue(spec["metric_filters_explicit"])
        self.assertEqual(spec["metric_filters"]["views"], {"mode": "between", "min": 100, "max": 300})
        self.assertEqual(spec["metric_filters"]["likes"], {"mode": "lte", "min": None, "max": 5})
        self.assertEqual(spec["metric_filters"]["replies"], {"mode": "gte", "min": 2, "max": None})
        self.assertEqual(spec["min_metrics"]["views"], 100)
        self.assertEqual(spec["min_metrics"]["likes"], 0)

    def test_normalize_rule_set_definition_falls_back_on_invalid_numeric_values(self) -> None:
        definition = normalize_rule_set_definition(
            {
                "levels": [{"id": "A", "label": "A", "min_score": "oops", "color": ""}],
                "rules": [
                    {
                        "name": "invalid score",
                        "conditions": [{"type": "metric_at_least", "metric": "views", "value": "bad"}],
                        "effect": {"action": "wat", "score": "boom", "level": "missing"},
                    }
                ],
            }
        )

        self.assertEqual(definition["levels"][0]["min_score"], 0)
        self.assertEqual(definition["levels"][0]["color"], "#2563eb")
        self.assertEqual(definition["rules"][0]["effect"]["action"], "score")
        self.assertEqual(definition["rules"][0]["effect"]["score"], 0)
        self.assertEqual(definition["rules"][0]["effect"]["level"], "")
        self.assertEqual(definition["rules"][0]["conditions"][0]["value"], 0)

    def test_build_query_plan_from_search_spec_generates_language_specific_queries(self) -> None:
        spec = normalize_search_spec(
            {
                "all_keywords": ["BTC", "airdrop"],
                "exact_phrases": ["zero cost"],
                "any_keywords": ["claim", "quest"],
                "exclude_keywords": ["trade"],
                "authors_include": ["galxe", "binance"],
                "authors_exclude": ["spam"],
                "language_mode": "zh_en",
                "include_retweets": False,
                "include_replies": False,
                "require_media": True,
                "require_links": True,
                "raw_query": "min_faves:10",
            }
        )

        queries = build_query_plan_from_search_spec(spec)
        self.assertEqual(len(queries), 2)
        self.assertIn("lang:zh", queries[0])
        self.assertIn("lang:en", queries[1])
        self.assertIn("BTC", queries[0])
        self.assertIn('"zero cost"', queries[0])
        self.assertIn("(claim OR quest)", queries[0])
        self.assertIn("-trade", queries[0])
        self.assertIn("(from:galxe OR from:binance)", queries[0])
        self.assertIn("-from:spam", queries[0])
        self.assertIn("-is:retweet", queries[0])
        self.assertIn("-is:reply", queries[0])
        self.assertIn("filter:media", queries[0])
        self.assertIn("filter:links", queries[0])
        self.assertIn("min_faves:10", queries[0])
        self.assertIn("lang:zh", build_query_from_search_spec(spec, language_override="zh"))

    def test_passes_metric_gate_supports_new_ranges_and_legacy_modes(self) -> None:
        item = make_result(metrics={"views": 150, "likes": 3, "replies": 1, "retweets": 0})

        explicit_spec = normalize_search_spec(
            {
                "metric_filters": {
                    "views": {"mode": "between", "min": 100, "max": 200},
                    "likes": {"mode": "lte", "max": 5},
                    "replies": {"mode": "gte", "min": 1},
                    "retweets": {"mode": "any"},
                },
                "metric_filters_explicit": True,
            }
        )
        self.assertTrue(passes_metric_gate(item, explicit_spec))

        legacy_or = normalize_search_spec({"min_metrics": {"views": 100, "replies": 2}, "metric_mode": "OR"})
        legacy_and = normalize_search_spec({"min_metrics": {"views": 100, "replies": 2}, "metric_mode": "AND"})
        self.assertTrue(passes_metric_gate(item, legacy_or))
        self.assertFalse(passes_metric_gate(item, legacy_and))

    def test_passes_days_filter_and_language_gate_with_inclusive_bounds(self) -> None:
        now_utc = datetime(2026, 4, 13, tzinfo=timezone.utc)
        recent_zh = make_result(tweet_id="1", created_at="2026-04-12T12:00:00+00:00", lang="zh")
        older_en = make_result(tweet_id="2", created_at="2026-04-08T12:00:00+00:00", lang="en")

        lte_spec = normalize_search_spec({"language_mode": "zh", "days_filter": {"mode": "lte", "max": 1}})
        between_spec = normalize_search_spec({"language_mode": "en", "days_filter": {"mode": "between", "min": 4, "max": 5}})

        self.assertTrue(passes_days_filter(recent_zh, lte_spec, now_utc))
        self.assertTrue(passes_search_filters(recent_zh, lte_spec, now_utc))
        self.assertTrue(passes_days_filter(older_en, between_spec, now_utc))
        self.assertTrue(passes_search_filters(older_en, between_spec, now_utc))
        self.assertFalse(passes_search_filters(older_en, lte_spec, now_utc))

    def test_evaluate_rule_set_applies_exclude_and_level_hint(self) -> None:
        definition = {
            "levels": [
                {"id": "A", "label": "A", "min_score": 60, "color": "#f97316"},
                {"id": "B", "label": "B", "min_score": 30, "color": "#2563eb"},
            ],
            "rules": [
                {
                    "id": "exclude-paid",
                    "name": "Exclude Paid",
                    "enabled": True,
                    "operator": "AND",
                    "conditions": [{"type": "text_contains_any", "values": ["paid"]}],
                    "effect": {"action": "exclude", "score": 0, "level": ""},
                },
                {
                    "id": "claim-link",
                    "name": "Claim Link",
                    "enabled": True,
                    "operator": "AND",
                    "conditions": [
                        {"type": "text_contains_any", "values": ["claim"]},
                        {"type": "has_link"},
                    ],
                    "effect": {"action": "score", "score": 35, "level": "B"},
                },
            ],
        }

        matched, stats = evaluate_rule_set(
            [
                make_result(tweet_id="1", text="Claim this faucet https://example.com"),
                make_result(tweet_id="2", text="paid quest with claim https://example.com"),
            ],
            definition,
            now_utc=datetime(2026, 4, 13, tzinfo=timezone.utc),
            fallback_days=20,
        )

        self.assertEqual(len(matched), 1)
        self.assertEqual(matched[0]["tweet_id"], "1")
        self.assertEqual(matched[0]["level"], "B")
        self.assertEqual(stats["matched"], 1)
        self.assertEqual(stats["excluded"], 1)
        self.assertEqual(stats["B"], 1)

    def test_resolve_level_title_and_summary_are_stable(self) -> None:
        item = make_result(tweet_id="654321", text="Claim reward now")
        title = build_result_title(item, "A")
        summary = build_result_summary(
            [{"rule_name": "Claim Link"}, {"rule_name": "Trusted Author"}],
            score=70,
            level="A",
        )

        self.assertEqual(resolve_level(70, [{"id": "A", "min_score": 60}, {"id": "B", "min_score": 30}], ""), "A")
        self.assertIn("[A]", title)
        self.assertIn("#654321", title)
        self.assertIn("Claim Link / Trusted Author", summary)
        self.assertIn("\u603b\u5206 70", summary)


if __name__ == "__main__":
    unittest.main()
