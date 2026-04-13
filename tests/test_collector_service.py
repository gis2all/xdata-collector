import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.collector_service import DesktopService


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
        def fake_search(query: str, _max_results: int):
            if "lang:zh" in query:
                return [
                    {
                        "id": "1001",
                        "text": "Claim faucet on testnet now https://example.com",
                        "author": {"screenName": "galxe"},
                        "createdAtISO": "2026-04-12T00:00:00+00:00",
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
                    "createdAtISO": "2026-04-12T00:00:00+00:00",
                    "metrics": {"views": 200, "likes": 10, "replies": 2, "retweets": 0},
                    "lang": "en",
                    "url": "https://x.com/galxe/status/1001",
                },
                {
                    "id": "1002",
                    "text": "Old post about faucet https://example.com/old",
                    "author": {"screenName": "tester2"},
                    "createdAtISO": "2026-04-01T00:00:00+00:00",
                    "metrics": {"views": 300, "likes": 8, "replies": 1, "retweets": 0},
                    "lang": "en",
                    "url": "https://x.com/tester2/status/1002",
                },
                {
                    "id": "1003",
                    "text": "Recent but low views https://example.com/low",
                    "author": {"screenName": "tester3"},
                    "createdAtISO": "2026-04-12T00:00:00+00:00",
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


if __name__ == "__main__":
    unittest.main()
