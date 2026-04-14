import json
import shutil
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from backend.collector_service import DesktopService
from backend.models import SearchResult
from backend.collector_store import connect
from backend.source_identity import build_source_dedupe_key


class DesktopServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_dir = Path("runtime") / "tmp" / "tests" / f"collector_service_{id(self)}"
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)
        self.test_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.test_dir / "collector.db"
        self.service = DesktopService(db_path=self.db_path, env_file=".env")

    def tearDown(self) -> None:
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)

    def _seed_curated_items(self, rows: list[dict[str, object]]) -> list[int]:
        inserted: list[int] = []
        with connect(self.db_path) as conn:
            for index, row in enumerate(rows, start=1):
                cur = conn.execute(
                    """
                    INSERT INTO x_items_curated
                    (run_id, dedupe_key, level, score, title, summary_zh, excerpt, is_zero_cost, source_url, author, created_at_x, reasons_json, rule_set_id, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(row.get("run_id", 1) or 1),
                        str(row.get("dedupe_key", "") or ""),
                        str(row.get("level", "A") or "A"),
                        int(row.get("score", 0) or 0),
                        str(row.get("title", f"item-{index}") or ""),
                        str(row.get("summary_zh", "") or ""),
                        str(row.get("excerpt", "") or ""),
                        1 if bool(row.get("is_zero_cost", True)) else 0,
                        str(row.get("source_url", f"https://example.com/{index}") or ""),
                        str(row.get("author", "") or ""),
                        row.get("created_at_x"),
                        json.dumps(row.get("reasons_json", []), ensure_ascii=False),
                        row.get("rule_set_id"),
                        str(row.get("state", "new") or "new"),
                    ),
                )
                inserted.append(int(cur.lastrowid))
        return inserted

    def _seed_raw_items(self, rows: list[dict[str, object]]) -> list[int]:
        inserted: list[int] = []
        with connect(self.db_path) as conn:
            for index, row in enumerate(rows, start=1):
                cur = conn.execute(
                    """
                    INSERT INTO x_items_raw
                    (run_id, tweet_id, canonical_url, author, text, created_at_x, metrics_json, query_name, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(row.get("run_id", index) or index),
                        str(row.get("tweet_id", f"{index}") or ""),
                        str(row.get("canonical_url", f"https://x.com/i/status/{index}") or ""),
                        str(row.get("author", f"author-{index}") or ""),
                        str(row.get("text", f"text-{index}") or ""),
                        row.get("created_at_x", "2026-04-10T00:00:00+00:00"),
                        json.dumps(row.get("metrics_json", {"views": 0, "likes": 0, "replies": 0, "retweets": 0}), ensure_ascii=False),
                        str(row.get("query_name", f"manual:{index}") or ""),
                        str(row.get("fetched_at", "2026-04-10T00:10:00+00:00") or ""),
                    ),
                )
                inserted.append(int(cur.lastrowid))
        return inserted

    def _make_search_result(
        self,
        *,
        tweet_id: str = "1001",
        url: str = "https://x.com/demo/status/1001",
        text: str = "Alpha drop is live https://example.com",
        author: str = "demo",
        created_at: str = "2026-04-12T00:00:00+00:00",
        query: str = "Alpha lang:en",
    ) -> SearchResult:
        return SearchResult(
            query_name="manual:1",
            query=query,
            tweet_id=tweet_id,
            url=url,
            text=text,
            author=author,
            created_at=created_at,
            raw={"lang": "en", "metrics": {"views": 300, "likes": 10, "replies": 2, "retweets": 1}},
        )

    def _make_curated_match(
        self,
        *,
        tweet_id: str = "1001",
        url: str = "https://x.com/demo/status/1001",
        text: str = "Alpha drop is live https://example.com",
        author: str = "demo",
        created_at: str = "2026-04-12T00:00:00+00:00",
    ) -> dict[str, object]:
        return {
            "tweet_id": tweet_id,
            "url": url,
            "text": text,
            "author": author,
            "created_at": created_at,
            "level": "A",
            "score": 88,
            "title": "Alpha",
            "summary": "summary alpha",
            "reasons": [{"rule": "alpha"}],
        }

    def _manual_payload(self, *, rule_set_id: int) -> dict[str, object]:
        return {
            "search_spec": {
                "all_keywords": ["Alpha"],
                "language_mode": "en",
                "days_filter": {"mode": "lte", "max": 100},
                "metric_filters": {
                    "views": {"mode": "any"},
                    "likes": {"mode": "any"},
                    "replies": {"mode": "any"},
                    "retweets": {"mode": "any"},
                },
                "metric_filters_explicit": True,
            },
            "rule_set_id": rule_set_id,
        }

    def test_default_rule_set_exists_and_can_clone(self) -> None:
        rule_sets = self.service.list_rule_sets()["items"]
        self.assertGreaterEqual(len(rule_sets), 1)
        builtin = rule_sets[0]
        self.assertTrue(builtin["is_builtin"])

        cloned = self.service.clone_rule_set(int(builtin["id"]))
        self.assertFalse(cloned["is_builtin"])
        self.assertIn("\u526f\u672c", cloned["name"])

    def test_create_and_toggle_job_with_new_search_spec(self) -> None:
        default_rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        job = self.service.create_job(
            {
                "name": "mining-watch",
                "interval_minutes": 60,
                "enabled": True,
                "rule_set_id": default_rule_set_id,
                "search_spec": {
                    "all_keywords": ["\u6316\u77ff", "\u79ef\u5206"],
                    "language_mode": "zh_en",
                    "days_filter": {"mode": "between", "min": 1, "max": 10},
                    "metric_filters": {
                        "views": {"mode": "gte", "min": 100},
                        "likes": {"mode": "any"},
                        "replies": {"mode": "gte", "min": 10},
                        "retweets": {"mode": "lte", "max": 5},
                    },
                    "metric_filters_explicit": True,
                },
            }
        )
        self.assertEqual(job["name"], "mining-watch")
        self.assertEqual(job["rule_set_id"], default_rule_set_id)
        self.assertEqual(job["search_spec_json"]["all_keywords"], ["\u6316\u77ff", "\u79ef\u5206"])
        self.assertEqual(job["search_spec_json"]["language_mode"], "zh_en")
        self.assertEqual(job["search_spec_json"]["days_filter"], {"mode": "between", "min": 1, "max": 10})
        self.assertTrue(job["search_spec_json"]["metric_filters_explicit"])
        toggled = self.service.toggle_job(int(job["id"]), False)
        self.assertEqual(toggled["enabled"], 0)

    def test_list_update_delete_restore_and_purge_job(self) -> None:
        default_rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        job = self.service.create_job(
            {
                "name": "quest-watch",
                "interval_minutes": 30,
                "enabled": True,
                "rule_set_id": default_rule_set_id,
                "search_spec": {
                    "all_keywords": ["quest"],
                    "language_mode": "en",
                    "days_filter": {"mode": "lte", "max": 20},
                },
            }
        )
        job_id = int(job["id"])

        jobs = self.service.list_jobs()
        self.assertEqual(jobs["total"], 1)
        self.assertEqual(jobs["items"][0]["id"], job_id)
        self.assertEqual(jobs["items"][0]["rule_set_summary"]["id"], default_rule_set_id)

        filtered = self.service.list_jobs(query="quest")
        self.assertEqual(filtered["total"], 1)

        updated = self.service.update_job(
            job_id,
            {
                "name": "quest-watch-v2",
                "interval_minutes": 45,
                "rule_set_id": default_rule_set_id,
                "search_spec": {
                    "all_keywords": ["quest", "airdrop"],
                    "language_mode": "zh",
                    "days_filter": {"mode": "gte", "min": 3},
                    "metric_filters": {
                        "views": {"mode": "between", "min": 20, "max": 200},
                        "likes": {"mode": "any"},
                        "replies": {"mode": "gte", "min": 2},
                        "retweets": {"mode": "gte", "min": 1},
                    },
                    "metric_filters_explicit": True,
                },
                "enabled": False,
            },
        )
        self.assertEqual(updated["name"], "quest-watch-v2")
        self.assertEqual(updated["enabled"], 0)
        self.assertIsNone(updated["next_run_at"])
        self.assertEqual(updated["search_spec_json"]["all_keywords"], ["quest", "airdrop"])
        self.assertEqual(updated["search_spec_json"]["language_mode"], "zh")
        self.assertEqual(updated["search_spec_json"]["days_filter"], {"mode": "gte", "min": 3, "max": None})

        deleted = self.service.delete_job(job_id)
        self.assertIsNotNone(deleted["deleted_at"])
        self.assertEqual(deleted["enabled"], 0)

        active_jobs = self.service.list_jobs()
        self.assertEqual(active_jobs["total"], 0)
        deleted_jobs = self.service.list_jobs(status="deleted")
        self.assertEqual(deleted_jobs["total"], 1)

        restored = self.service.restore_job(job_id)
        self.assertIsNone(restored["deleted_at"])
        self.assertEqual(restored["enabled"], 0)

        after_restore = self.service.list_jobs()
        self.assertEqual(after_restore["total"], 1)

        purged = self.service.purge_job(job_id)
        self.assertEqual(purged["id"], job_id)
        self.assertEqual(self.service.list_jobs(status="all")["total"], 0)

    @patch("backend.collector_service.find_twitter_cli")
    @patch("backend.collector_service.run_twitter_search")
    def test_health_returns_snapshot_with_details(self, mock_search, mock_find_cli) -> None:
        mock_find_cli.return_value = "twitter"
        mock_search.return_value = []

        default_rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        self.service.create_job(
            {
                "name": "health-job",
                "interval_minutes": 60,
                "enabled": True,
                "rule_set_id": default_rule_set_id,
                "search_spec": {"all_keywords": ["btc"], "language_mode": "zh_en"},
            }
        )
        self.service.run_manual(
            {
                "search_spec": {
                    "all_keywords": ["testnet", "faucet"],
                    "language_mode": "zh_en",
                    "days_filter": {"mode": "lte", "max": 20},
                    "metric_filters": {
                        "views": {"mode": "any"},
                        "likes": {"mode": "any"},
                        "replies": {"mode": "any"},
                        "retweets": {"mode": "any"},
                    },
                    "metric_filters_explicit": True,
                },
                "rule_set_id": default_rule_set_id,
            }
        )

        health = self.service.health()

        self.assertEqual(health["summary"]["source"], "backend_snapshot")
        self.assertIn("updated_at", health["summary"])
        self.assertTrue(health["db"]["configured"])
        self.assertTrue(health["db"]["connected"])
        self.assertTrue(health["db"]["db_exists"])
        self.assertEqual(health["db"]["job_count"], 1)
        self.assertEqual(health["db"]["run_count"], 1)
        self.assertIn(str(self.db_path), health["db"]["db_path"])

        self.assertTrue(health["x"]["configured"])
        self.assertTrue(health["x"]["connected"])
        self.assertEqual(health["x"]["auth_source"], "twitter-cli")
        self.assertEqual(health["x"]["account_hint"], "unknown")
        self.assertEqual(health["x"]["last_error"], "")
        self.assertNotIn("notion", health)

    @patch("backend.collector_service.find_twitter_cli")
    @patch("backend.collector_service.run_twitter_search")
    def test_health_keeps_last_successful_x_snapshot_when_probe_fails(self, mock_search, mock_find_cli) -> None:
        mock_find_cli.return_value = "twitter"
        mock_search.return_value = []

        first = self.service.health()
        self.assertTrue(first["x"]["connected"])
        self.assertEqual(first["x"]["last_error"], "")

        mock_search.side_effect = RuntimeError("x probe failed")

        second = self.service.health()
        self.assertTrue(second["x"]["configured"])
        self.assertTrue(second["x"]["connected"])
        self.assertEqual(second["x"]["auth_source"], "twitter-cli")
        self.assertEqual(second["x"]["last_error"], "x probe failed")
        self.assertIn("last_checked_at", second["x"])

    @patch("backend.collector_service.run_twitter_search")
    def test_manual_run_uses_multi_language_queries_dedupes_and_filters_results(self, mock_search) -> None:
        recent_created_at = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
        old_created_at = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()

        def fake_search(query: str, _max_results: int):
            if "lang:zh" in query:
                return [
                    {
                        "id": "1001",
                        "text": "Claim faucet on testnet now https://example.com",
                        "author": {"screenName": "galxe"},
                        "createdAtISO": recent_created_at,
                        "metrics": {"views": 200, "likes": 10, "replies": 2, "retweets": 0},
                        "lang": "zh",
                        "url": "https://x.com/galxe/status/1001",
                    }
                ]
            return [
                {
                    "id": "1001",
                    "text": "Claim faucet on testnet now https://example.com",
                    "author": {"screenName": "galxe"},
                    "createdAtISO": recent_created_at,
                    "metrics": {"views": 200, "likes": 10, "replies": 2, "retweets": 0},
                    "lang": "en",
                    "url": "https://x.com/galxe/status/1001",
                },
                {
                    "id": "1002",
                    "text": "Old post about faucet https://example.com/old",
                    "author": {"screenName": "tester2"},
                    "createdAtISO": old_created_at,
                    "metrics": {"views": 300, "likes": 8, "replies": 1, "retweets": 0},
                    "lang": "en",
                    "url": "https://x.com/tester2/status/1002",
                },
                {
                    "id": "1003",
                    "text": "Recent but low views https://example.com/low",
                    "author": {"screenName": "tester3"},
                    "createdAtISO": recent_created_at,
                    "metrics": {"views": 20, "likes": 1, "replies": 0, "retweets": 0},
                    "lang": "en",
                    "url": "https://x.com/tester3/status/1003",
                },
            ]

        mock_search.side_effect = fake_search
        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        report = self.service.run_manual(
            {
                "search_spec": {
                    "all_keywords": ["testnet", "faucet"],
                    "language_mode": "zh_en",
                    "days_filter": {"mode": "lte", "max": 1},
                    "metric_filters": {
                        "views": {"mode": "gte", "min": 100},
                        "likes": {"mode": "any"},
                        "replies": {"mode": "any"},
                        "retweets": {"mode": "any"},
                    },
                    "metric_filters_explicit": True,
                },
                "rule_set_id": rule_set_id,
            }
        )
        self.assertEqual(report["status"], "success")
        self.assertEqual(len(report["final_queries"]), 2)
        self.assertIn("lang:zh", report["final_queries"][0])
        self.assertIn("lang:en", report["final_queries"][1])
        self.assertEqual(report["raw_total"], 1)
        self.assertEqual(len(report["raw_items"]), 1)
        self.assertEqual(report["matched_total"], 1)
        self.assertEqual(report["matched_items"][0]["author"], "galxe")
        self.assertGreater(report["matched_items"][0]["score"], 0)
        self.assertTrue(report["matched_items"][0]["reasons"])
        self.assertEqual(report["rule_set_summary"]["id"], rule_set_id)
        self.assertEqual(report["stats"]["queries"], 2)
        self.assertEqual(report["stats"]["fetched_raw"], 4)
        self.assertEqual(report["stats"]["raw_deduped"], 3)
        self.assertEqual(report["stats"]["search_filter_passed"], 1)
        self.assertEqual(mock_search.call_count, 2)

    @patch("backend.collector_service.evaluate_rule_set")
    @patch("backend.collector_service.normalize_search_payload")
    @patch("backend.collector_service.run_twitter_search")
    def test_manual_run_auto_dedupes_after_successful_store(
        self,
        mock_search,
        mock_normalize_payload,
        mock_evaluate_rule_set,
    ) -> None:
        existing_key = build_source_dedupe_key(
            tweet_id="1001",
            url="https://x.com/demo/status/1001",
            text="Alpha drop is live https://example.com",
            author="demo",
        )
        kept_id = self._seed_curated_items(
            [
                {
                    "dedupe_key": existing_key,
                    "title": "kept alpha",
                    "author": "demo",
                    "source_url": "https://x.com/demo/status/1001",
                    "created_at_x": "2026-04-10T00:00:00+00:00",
                }
            ]
        )[0]

        mock_search.return_value = []
        mock_normalize_payload.return_value = [self._make_search_result()]
        mock_evaluate_rule_set.return_value = ([self._make_curated_match()], {"matched": 1, "excluded": 0})

        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        report = self.service.run_manual(self._manual_payload(rule_set_id=rule_set_id))
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["stats"]["dedupe_groups"], 1)
        self.assertEqual(report["stats"]["dedupe_deleted"], 1)
        self.assertEqual(report["stats"]["dedupe_kept"], 1)
        self.assertEqual(report["stats"]["dedupe_rows_after"], 1)
        self.assertEqual(report["errors"], [])
        self.assertEqual(page["total"], 1)
        self.assertEqual([item["id"] for item in page["items"]], [kept_id])

    @patch("backend.collector_service.evaluate_rule_set")
    @patch("backend.collector_service.normalize_search_payload")
    @patch("backend.collector_service.run_twitter_search")
    def test_manual_run_skips_auto_dedupe_when_no_curated_items(
        self,
        mock_search,
        mock_normalize_payload,
        mock_evaluate_rule_set,
    ) -> None:
        mock_search.return_value = []
        mock_normalize_payload.return_value = [self._make_search_result()]
        mock_evaluate_rule_set.return_value = ([], {"matched": 0, "excluded": 0})

        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        with patch.object(self.service, "dedupe_items", wraps=self.service.dedupe_items) as mock_dedupe:
            report = self.service.run_manual(self._manual_payload(rule_set_id=rule_set_id))

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["matched_total"], 0)
        self.assertNotIn("dedupe_groups", report["stats"])
        self.assertEqual(report["errors"], [])
        mock_dedupe.assert_not_called()

    @patch("backend.collector_service.evaluate_rule_set")
    @patch("backend.collector_service.normalize_search_payload")
    @patch("backend.collector_service.run_twitter_search")
    def test_manual_run_records_dedupe_failure_but_stays_successful(
        self,
        mock_search,
        mock_normalize_payload,
        mock_evaluate_rule_set,
    ) -> None:
        mock_search.return_value = []
        mock_normalize_payload.return_value = [self._make_search_result()]
        mock_evaluate_rule_set.return_value = ([self._make_curated_match()], {"matched": 1, "excluded": 0})

        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        with patch.object(self.service, "dedupe_items", side_effect=RuntimeError("dedupe boom")):
            report = self.service.run_manual(self._manual_payload(rule_set_id=rule_set_id))

        stored_run = self.service.get_run(int(report["run_id"]))
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["stats"]["dedupe_failed"], 1)
        self.assertIn("dedupe boom", report["errors"][0])
        self.assertEqual(stored_run["status"], "success")
        self.assertEqual(stored_run["stats_json"]["dedupe_failed"], 1)
        self.assertEqual(page["total"], 1)

    @patch("backend.collector_service.evaluate_rule_set")
    @patch("backend.collector_service.normalize_search_payload")
    @patch("backend.collector_service.run_twitter_search")
    def test_run_job_now_triggers_auto_dedupe_after_successful_store(
        self,
        mock_search,
        mock_normalize_payload,
        mock_evaluate_rule_set,
    ) -> None:
        mock_search.return_value = []
        mock_normalize_payload.return_value = [self._make_search_result()]
        mock_evaluate_rule_set.return_value = ([self._make_curated_match()], {"matched": 1, "excluded": 0})

        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        job = self.service.create_job(
            {
                "name": "alpha-auto",
                "interval_minutes": 30,
                "enabled": True,
                "rule_set_id": rule_set_id,
                "search_spec": self._manual_payload(rule_set_id=rule_set_id)["search_spec"],
            }
        )

        with patch.object(self.service, "dedupe_items", wraps=self.service.dedupe_items) as mock_dedupe:
            report = self.service.run_job_now(int(job["id"]))

        self.assertEqual(report["status"], "success")
        self.assertIn("dedupe_groups", report["stats"])
        mock_dedupe.assert_called_once()

    def test_list_runs_returns_recent_records_with_pagination(self) -> None:
        first = self.service._create_run(job_id=None, trigger_type="manual")
        self.service._finish_run(first, "failed", {}, "boom")
        second = self.service._create_run(job_id=123, trigger_type="auto")
        self.service._finish_run(second, "success", {"matched": 2}, "")

        page = self.service.list_runs(page=1, page_size=1)

        self.assertEqual(page["total"], 2)
        self.assertEqual(page["page"], 1)
        self.assertEqual(page["page_size"], 1)
        self.assertEqual(len(page["items"]), 1)
        self.assertEqual(page["items"][0]["id"], second)
        self.assertEqual(page["items"][0]["status"], "success")
        self.assertEqual(page["items"][0]["job_id"], 123)
        self.assertEqual(page["items"][0]["stats_json"]["matched"], 2)
        self.assertNotEqual(first, second)

    def test_get_runtime_logs_reads_current_log_snapshots(self) -> None:
        from backend import collector_service as collector_service_module

        runtime_dir = self.test_dir / "runtime_logs"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        expected_files = {
            "api.current.out.log": "api ok\nline2",
            "api.current.err.log": "",
            "scheduler.current.out.log": "scheduler tick",
            "scheduler.current.err.log": "scheduler warning",
            "web-ui.current.out.log": "vite ready",
            "web-ui.current.err.log": "",
        }
        for name, content in expected_files.items():
            (runtime_dir / name).write_text(content, encoding="utf-8")

        with patch.object(collector_service_module, "RUNTIME_LOG_DIR", runtime_dir):
            payload = self.service.get_runtime_logs()

        self.assertEqual(len(payload["items"]), 6)
        by_name = {item["name"]: item for item in payload["items"]}
        self.assertEqual(by_name["api.current.out.log"]["content"], "api ok\nline2")
        self.assertEqual(by_name["scheduler.current.err.log"]["content"], "scheduler warning")
        self.assertEqual(by_name["web-ui.current.err.log"]["content"], "")
        self.assertTrue(by_name["api.current.out.log"]["exists"])
        self.assertGreaterEqual(by_name["api.current.out.log"]["size"], len("api ok\nline2"))
        self.assertTrue(by_name["api.current.out.log"]["updated_at"])


    def test_list_items_supports_whitelisted_sorting_and_full_fields(self) -> None:
        ids = self._seed_curated_items(
            [
                {
                    "run_id": 11,
                    "dedupe_key": "dedupe-a",
                    "level": "A",
                    "score": 20,
                    "title": "Alpha",
                    "summary_zh": "summary alpha",
                    "excerpt": "excerpt alpha",
                    "is_zero_cost": True,
                    "source_url": "https://x.com/a/status/1",
                    "author": "alice",
                    "created_at_x": "2026-04-12T00:00:00+00:00",
                    "reasons_json": [{"rule": "alpha"}],
                    "rule_set_id": 3,
                    "state": "new",
                },
                {
                    "run_id": 12,
                    "dedupe_key": "dedupe-b",
                    "level": "B",
                    "score": 5,
                    "title": "Beta",
                    "summary_zh": "summary beta",
                    "excerpt": "excerpt beta",
                    "is_zero_cost": False,
                    "source_url": "https://x.com/b/status/2",
                    "author": "bob",
                    "created_at_x": "2026-04-11T00:00:00+00:00",
                    "reasons_json": [{"rule": "beta"}],
                    "rule_set_id": 4,
                    "state": "archived",
                },
                {
                    "run_id": 13,
                    "dedupe_key": "dedupe-c",
                    "level": "S",
                    "score": 35,
                    "title": "Gamma",
                    "summary_zh": "summary gamma",
                    "excerpt": "excerpt gamma",
                    "is_zero_cost": True,
                    "source_url": "https://x.com/c/status/3",
                    "author": "carol",
                    "created_at_x": "2026-04-10T00:00:00+00:00",
                    "reasons_json": [{"rule": "gamma"}],
                    "rule_set_id": 5,
                    "state": "new",
                },
            ]
        )

        page = self.service.list_items(page=1, page_size=10, sort_by="score", sort_dir="asc")

        self.assertEqual(page["page"], 1)
        self.assertEqual(page["page_size"], 10)
        self.assertEqual(page["total"], 3)
        self.assertEqual([item["id"] for item in page["items"]], [ids[1], ids[0], ids[2]])
        first = page["items"][0]
        self.assertEqual(first["dedupe_key"], "dedupe-b")
        self.assertEqual(first["summary_zh"], "summary beta")
        self.assertEqual(first["excerpt"], "excerpt beta")
        self.assertEqual(first["is_zero_cost"], 0)
        self.assertEqual(first["rule_set_id"], 4)
        self.assertEqual(first["reasons_json"], [{"rule": "beta"}])

    def test_list_items_invalid_sort_field_falls_back_to_default_id_desc(self) -> None:
        ids = self._seed_curated_items(
            [
                {"title": "first", "dedupe_key": "one"},
                {"title": "second", "dedupe_key": "two"},
            ]
        )

        page = self.service.list_items(page=1, page_size=10, sort_by="drop table x_items_curated", sort_dir="asc")

        self.assertEqual([item["id"] for item in page["items"]], [ids[1], ids[0]])

    def test_list_items_respects_page_and_page_size(self) -> None:
        ids = self._seed_curated_items(
            [
                {"title": "item-1", "dedupe_key": "one"},
                {"title": "item-2", "dedupe_key": "two"},
                {"title": "item-3", "dedupe_key": "three"},
                {"title": "item-4", "dedupe_key": "four"},
                {"title": "item-5", "dedupe_key": "five"},
            ]
        )

        page = self.service.list_items(page=2, page_size=2, sort_by="id", sort_dir="asc")

        self.assertEqual(page["page"], 2)
        self.assertEqual(page["page_size"], 2)
        self.assertEqual(page["total"], 5)
        self.assertEqual([item["id"] for item in page["items"]], [ids[2], ids[3]])

    def test_list_items_sorts_created_at_x_by_real_x_timestamp(self) -> None:
        ids = self._seed_curated_items(
            [
                {
                    "title": "late",
                    "dedupe_key": "late",
                    "created_at_x": "Mon Mar 30 21:00:00 +0000 2026",
                },
                {
                    "title": "early",
                    "dedupe_key": "early",
                    "created_at_x": "Mon Feb 23 11:58:17 +0000 2026",
                },
                {
                    "title": "middle",
                    "dedupe_key": "middle",
                    "created_at_x": "Wed Mar 25 12:09:02 +0000 2026",
                },
                {
                    "title": "missing",
                    "dedupe_key": "missing",
                    "created_at_x": None,
                },
            ]
        )

        asc_page = self.service.list_items(page=1, page_size=10, sort_by="created_at_x", sort_dir="asc")
        desc_page = self.service.list_items(page=1, page_size=10, sort_by="created_at_x", sort_dir="desc")

        self.assertEqual([item["id"] for item in asc_page["items"]], [ids[1], ids[2], ids[0], ids[3]])
        self.assertEqual([item["id"] for item in desc_page["items"]], [ids[0], ids[2], ids[1], ids[3]])

    def test_delete_item_hard_deletes_the_target_row(self) -> None:
        ids = self._seed_curated_items(
            [
                {"title": "keep", "dedupe_key": "keep"},
                {"title": "delete", "dedupe_key": "delete"},
            ]
        )

        result = self.service.delete_item(ids[1])
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(result, {"id": ids[1], "deleted": 1})
        self.assertEqual(page["total"], 1)
        self.assertEqual([item["id"] for item in page["items"]], [ids[0]])

    def test_delete_items_hard_deletes_selected_rows(self) -> None:
        ids = self._seed_curated_items(
            [
                {"title": "keep", "dedupe_key": "keep"},
                {"title": "delete-a", "dedupe_key": "delete-a"},
                {"title": "delete-b", "dedupe_key": "delete-b"},
            ]
        )

        result = self.service.delete_items([ids[1], ids[2]])
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(result, {"ids": [ids[1], ids[2]], "deleted": 2})
        self.assertEqual(page["total"], 1)
        self.assertEqual([item["id"] for item in page["items"]], [ids[0]])

    def test_delete_items_matching_hard_deletes_current_filter_only(self) -> None:
        ids = self._seed_curated_items(
            [
                {"title": "alpha keep", "dedupe_key": "keep-a", "level": "B"},
                {"title": "alpha delete", "dedupe_key": "delete-a", "level": "A"},
                {"title": "beta keep", "dedupe_key": "keep-b", "level": "A"},
                {"excerpt": "alpha excerpt", "dedupe_key": "delete-b", "level": "A"},
            ]
        )

        result = self.service.delete_items_matching(keyword="alpha", level="A")
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(result["deleted"], 2)
        self.assertEqual(result["ids"], [])
        self.assertEqual([item["id"] for item in page["items"]], [ids[0], ids[2]])

    def test_dedupe_items_keeps_earliest_created_at_then_smallest_id(self) -> None:
        ids = self._seed_curated_items(
            [
                {
                    "title": "dup-early",
                    "dedupe_key": "dup-a",
                    "created_at_x": "2026-04-10T00:00:00+00:00",
                },
                {
                    "title": "dup-late",
                    "dedupe_key": "dup-a",
                    "created_at_x": "2026-04-11T00:00:00+00:00",
                },
                {
                    "title": "dup-missing-a",
                    "dedupe_key": "dup-b",
                    "created_at_x": None,
                },
                {
                    "title": "dup-missing-b",
                    "dedupe_key": "dup-b",
                    "created_at_x": None,
                },
                {
                    "title": "blank-key",
                    "dedupe_key": "",
                    "created_at_x": "2026-04-12T00:00:00+00:00",
                },
            ]
        )

        summary = self.service.dedupe_items()
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(summary["groups"], 2)
        self.assertEqual(summary["deleted"], 2)
        self.assertEqual(summary["kept"], 2)
        self.assertEqual(summary["rows_before"], 5)
        self.assertEqual(summary["rows_after"], 3)
        self.assertEqual([item["id"] for item in page["items"]], [ids[0], ids[2], ids[4]])

    def test_dedupe_items_keeps_earliest_real_x_created_at(self) -> None:
        ids = self._seed_curated_items(
            [
                {
                    "title": "dup-late",
                    "dedupe_key": "dup-x",
                    "created_at_x": "Mon Mar 30 21:00:00 +0000 2026",
                },
                {
                    "title": "dup-early",
                    "dedupe_key": "dup-x",
                    "created_at_x": "Mon Feb 23 11:58:17 +0000 2026",
                },
            ]
        )

        summary = self.service.dedupe_items()
        page = self.service.list_items(page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(summary["groups"], 1)
        self.assertEqual(summary["deleted"], 1)
        self.assertEqual([item["id"] for item in page["items"]], [ids[1]])


    def test_list_items_raw_supports_keyword_metrics_and_sorting(self) -> None:
        ids = self._seed_raw_items(
            [
                {
                    "tweet_id": "9001",
                    "canonical_url": "https://x.com/i/status/9001",
                    "author": "alice",
                    "text": "alpha launch update",
                    "metrics_json": {"views": 20, "likes": 3, "replies": 1, "retweets": 0},
                },
                {
                    "tweet_id": "9002",
                    "canonical_url": "https://x.com/i/status/9002",
                    "author": "alpha-team",
                    "text": "fresh post",
                    "metrics_json": {"views": 120, "likes": 9, "replies": 2, "retweets": 1},
                },
                {
                    "tweet_id": "9003",
                    "canonical_url": "https://x.com/alpha/status/9003",
                    "author": "carol",
                    "text": "other post",
                    "metrics_json": {"views": 50, "likes": 5, "replies": 0, "retweets": 0},
                },
            ]
        )

        page = self.service.list_items(table="raw", page=1, page_size=10, keyword="alpha", sort_by="views", sort_dir="desc")

        self.assertEqual(page["total"], 3)
        self.assertEqual([item["id"] for item in page["items"]], [ids[1], ids[2], ids[0]])
        self.assertEqual(page["items"][0]["views"], 120)
        self.assertEqual(page["items"][0]["likes"], 9)
        self.assertEqual(page["items"][0]["query_name"], "manual:2")

    def test_list_items_raw_sorts_created_at_x_by_real_x_timestamp(self) -> None:
        ids = self._seed_raw_items(
            [
                {"tweet_id": "9101", "created_at_x": "Mon Mar 30 21:00:00 +0000 2026"},
                {"tweet_id": "9102", "created_at_x": "Mon Feb 23 11:58:17 +0000 2026"},
                {"tweet_id": "9103", "created_at_x": "Wed Mar 25 12:09:02 +0000 2026"},
                {"tweet_id": "9104", "created_at_x": None},
            ]
        )

        asc_page = self.service.list_items(table="raw", page=1, page_size=10, sort_by="created_at_x", sort_dir="asc")
        desc_page = self.service.list_items(table="raw", page=1, page_size=10, sort_by="created_at_x", sort_dir="desc")

        self.assertEqual([item["id"] for item in asc_page["items"]], [ids[1], ids[2], ids[0], ids[3]])
        self.assertEqual([item["id"] for item in desc_page["items"]], [ids[0], ids[2], ids[1], ids[3]])

    def test_delete_raw_rows_support_single_selected_and_matching_filters(self) -> None:
        ids = self._seed_raw_items(
            [
                {"tweet_id": "9201", "text": "keep beta", "author": "beta", "canonical_url": "https://x.com/i/status/9201"},
                {"tweet_id": "9202", "text": "alpha delete", "author": "demo", "canonical_url": "https://x.com/i/status/9202"},
                {"tweet_id": "9203", "text": "keep gamma", "author": "alpha-author", "canonical_url": "https://x.com/i/status/9203"},
                {"tweet_id": "9204", "text": "keep url", "author": "demo", "canonical_url": "https://x.com/alpha/status/9204"},
            ]
        )

        delete_one = self.service.delete_item(ids[0], table="raw")
        delete_selected = self.service.delete_items([ids[2]], table="raw")
        delete_matching = self.service.delete_items_matching(keyword="alpha", table="raw")
        page = self.service.list_items(table="raw", page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(delete_one, {"id": ids[0], "deleted": 1})
        self.assertEqual(delete_selected, {"ids": [ids[2]], "deleted": 1})
        self.assertEqual(delete_matching, {"ids": [], "deleted": 2})
        self.assertEqual(page["total"], 0)

    def test_dedupe_raw_items_reuses_source_identity_and_keeps_earliest_rows(self) -> None:
        ids = self._seed_raw_items(
            [
                {
                    "tweet_id": "9301",
                    "canonical_url": "https://x.com/demo/status/9301",
                    "author": "demo",
                    "text": "tweet duplicate early",
                    "created_at_x": "2026-04-10T00:00:00+00:00",
                },
                {
                    "tweet_id": "9301",
                    "canonical_url": "https://x.com/i/status/9301",
                    "author": "demo",
                    "text": "tweet duplicate late",
                    "created_at_x": "2026-04-11T00:00:00+00:00",
                },
                {
                    "tweet_id": "",
                    "canonical_url": "https://x.com/demo/status/9302",
                    "author": "demo",
                    "text": "url duplicate early",
                    "created_at_x": "2026-04-09T00:00:00+00:00",
                },
                {
                    "tweet_id": "",
                    "canonical_url": "https://x.com/i/status/9302",
                    "author": "demo",
                    "text": "url duplicate late",
                    "created_at_x": "2026-04-12T00:00:00+00:00",
                },
                {
                    "tweet_id": "",
                    "canonical_url": "",
                    "author": "same-author",
                    "text": "same text fallback",
                    "created_at_x": None,
                },
                {
                    "tweet_id": "",
                    "canonical_url": "",
                    "author": "same-author",
                    "text": "same text fallback",
                    "created_at_x": None,
                },
                {
                    "tweet_id": "",
                    "canonical_url": "",
                    "author": "",
                    "text": "",
                    "created_at_x": "2026-04-13T00:00:00+00:00",
                },
            ]
        )

        summary = self.service.dedupe_items(table="raw")
        page = self.service.list_items(table="raw", page=1, page_size=10, sort_by="id", sort_dir="asc")

        self.assertEqual(summary["groups"], 3)
        self.assertEqual(summary["deleted"], 3)
        self.assertEqual(summary["kept"], 3)
        self.assertEqual(summary["rows_before"], 7)
        self.assertEqual(summary["rows_after"], 4)
        self.assertEqual([item["id"] for item in page["items"]], [ids[0], ids[2], ids[4], ids[6]])


if __name__ == "__main__":
    unittest.main()
