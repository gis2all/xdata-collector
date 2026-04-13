import unittest
from pathlib import Path
from unittest.mock import patch

from backend.collector_service import DesktopService


class DesktopServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db_path = Path("data") / f"test_collector_service_{id(self)}.db"
        if self.db_path.exists():
            self.db_path.unlink()
        self.service = DesktopService(db_path=self.db_path, env_file=".env")

    def tearDown(self) -> None:
        if self.db_path.exists():
            self.db_path.unlink()

    def test_default_rule_set_exists_and_can_clone(self) -> None:
        rule_sets = self.service.list_rule_sets()["items"]
        self.assertGreaterEqual(len(rule_sets), 1)
        builtin = rule_sets[0]
        self.assertTrue(builtin["is_builtin"])

        cloned = self.service.clone_rule_set(int(builtin["id"]))
        self.assertFalse(cloned["is_builtin"])
        self.assertIn("副本", cloned["name"])

    def test_create_and_toggle_job_with_search_spec(self) -> None:
        default_rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        job = self.service.create_job(
            {
                "name": "mining-watch",
                "interval_minutes": 60,
                "enabled": True,
                "rule_set_id": default_rule_set_id,
                "search_spec": {
                    "all_keywords": ["挖矿", "积分"],
                    "days": 20,
                    "min_metrics": {"views": 100, "likes": 0, "replies": 10, "retweets": 5},
                    "metric_mode": "OR",
                },
            }
        )
        self.assertEqual(job["name"], "mining-watch")
        self.assertEqual(job["rule_set_id"], default_rule_set_id)
        self.assertEqual(job["search_spec_json"]["all_keywords"], ["挖矿", "积分"])
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
                    "days": 20,
                    "min_metrics": {"views": 10, "likes": 0, "replies": 1, "retweets": 0},
                    "metric_mode": "OR",
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
                    "days": 15,
                    "min_metrics": {"views": 20, "likes": 0, "replies": 2, "retweets": 1},
                    "metric_mode": "AND",
                },
                "enabled": False,
            },
        )
        self.assertEqual(updated["name"], "quest-watch-v2")
        self.assertEqual(updated["enabled"], 0)
        self.assertIsNone(updated["next_run_at"])
        self.assertEqual(updated["search_spec_json"]["all_keywords"], ["quest", "airdrop"])

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
                "search_spec": {"all_keywords": ["btc"], "days": 20},
            }
        )
        self.service.run_manual(
            {
                "search_spec": {
                    "all_keywords": ["testnet", "faucet"],
                    "days": 20,
                    "min_metrics": {"views": 0, "likes": 0, "replies": 0, "retweets": 0},
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
    def test_manual_run_returns_raw_and_matched_results(self, mock_search) -> None:
        mock_search.return_value = [
            {
                "id": "1001",
                "text": "Claim faucet on testnet now https://example.com",
                "author": {"screenName": "galxe"},
                "createdAtISO": "2026-04-12T00:00:00+00:00",
                "metrics": {"views": 200, "likes": 10, "replies": 2, "retweets": 0},
                "url": "https://x.com/galxe/status/1001",
            },
            {
                "id": "1002",
                "text": "Just chatting about markets",
                "author": {"screenName": "tester2"},
                "createdAtISO": "2026-04-12T00:00:00+00:00",
                "metrics": {"views": 10, "likes": 0, "replies": 0, "retweets": 0},
                "url": "https://x.com/tester2/status/1002",
            },
        ]
        rule_set_id = self.service.list_rule_sets()["items"][0]["id"]
        report = self.service.run_manual(
            {
                "search_spec": {
                    "all_keywords": ["testnet", "faucet"],
                    "days": 20,
                    "min_metrics": {"views": 0, "likes": 0, "replies": 0, "retweets": 0},
                    "metric_mode": "OR",
                },
                "rule_set_id": rule_set_id,
            }
        )
        self.assertEqual(report["status"], "success")
        self.assertEqual(report["raw_total"], 2)
        self.assertEqual(len(report["raw_items"]), 2)
        self.assertEqual(report["matched_total"], 1)
        self.assertEqual(report["matched_items"][0]["author"], "galxe")
        self.assertGreater(report["matched_items"][0]["score"], 0)
        self.assertTrue(report["matched_items"][0]["reasons"])
        self.assertEqual(report["rule_set_summary"]["id"], rule_set_id)


if __name__ == "__main__":
    unittest.main()



