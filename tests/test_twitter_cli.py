import unittest
from pathlib import PureWindowsPath
from unittest.mock import patch

from backend.twitter_cli import find_twitter_cli, normalize_search_payload, run_twitter_search


class NormalizeSearchPayloadTests(unittest.TestCase):
    def test_normalizes_common_twitter_cli_shape(self) -> None:
        payload = {
            "results": [
                {
                    "id": "111",
                    "url": "https://x.com/BinanceWallet/status/111",
                    "text": "Alpha claim is live",
                    "username": "BinanceWallet",
                    "created_at": "2026-04-11T12:00:00Z",
                }
            ]
        }

        results = normalize_search_payload("binance_alpha", payload)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].tweet_id, "111")
        self.assertEqual(results[0].url, "https://x.com/BinanceWallet/status/111")
        self.assertEqual(results[0].text, "Alpha claim is live")
        self.assertEqual(results[0].author, "BinanceWallet")

    def test_normalizes_current_twitter_cli_shape(self) -> None:
        payload = {
            "results": [
                {
                    "id": "333",
                    "text": "Alpha box is now live",
                    "author": {
                        "screenName": "BinanceWallet",
                    },
                    "createdAtISO": "2026-04-10T09:00:30+00:00",
                }
            ]
        }

        results = normalize_search_payload("binance_alpha", payload)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].tweet_id, "333")
        self.assertEqual(results[0].author, "BinanceWallet")
        self.assertEqual(results[0].created_at, "2026-04-10T09:00:30+00:00")
        self.assertEqual(results[0].url, "https://x.com/BinanceWallet/status/333")

    def test_normalizes_legacy_nested_shape(self) -> None:
        payload = [
            {
                "rest_id": "222",
                "legacy": {
                    "full_text": "Quest rewards live",
                    "created_at": "Fri Apr 11 12:00:00 +0000 2026",
                },
                "core": {
                    "user_results": {
                        "result": {
                            "legacy": {
                                "screen_name": "Galxe",
                            }
                        }
                    }
                },
            }
        ]

        results = normalize_search_payload("galxe", payload)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].tweet_id, "222")
        self.assertEqual(results[0].author, "Galxe")
        self.assertEqual(results[0].text, "Quest rewards live")
        self.assertEqual(results[0].url, "https://x.com/Galxe/status/222")

    def test_deduplicates_same_tweet_id_in_one_payload(self) -> None:
        payload = {
            "results": [
                {
                    "id": "444",
                    "url": "https://x.com/a/status/444",
                    "text": "First copy",
                    "username": "a",
                    "created_at": "2026-04-11T12:00:00Z",
                },
                {
                    "id": "444",
                    "url": "https://twitter.com/a/status/444?s=20",
                    "text": "Second copy",
                    "username": "a",
                    "created_at": "2026-04-11T12:01:00Z",
                },
            ]
        }

        results = normalize_search_payload("dup_test", payload)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].tweet_id, "444")
        self.assertEqual(results[0].text, "First copy")

    def test_normalizes_xreach_items_shape(self) -> None:
        payload = {
            "items": [
                {
                    "id": "555",
                    "text": "Zero-cost faucet task",
                    "createdAt": "2026-04-12T10:20:30Z",
                    "user": {"screenName": "QuestOps"},
                    "replyCount": 2,
                    "retweetCount": 5,
                    "viewCount": 1200,
                }
            ]
        }

        results = normalize_search_payload("xreach", payload)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].tweet_id, "555")
        self.assertEqual(results[0].author, "QuestOps")
        self.assertEqual(results[0].url, "https://x.com/QuestOps/status/555")
        self.assertEqual(results[0].raw["metrics"]["views"], 1200)
        self.assertEqual(results[0].raw["metrics"]["replies"], 2)
        self.assertEqual(results[0].raw["metrics"]["retweets"], 5)


class TwitterCliRuntimeTests(unittest.TestCase):
    def test_finds_twitter_cli_in_default_pipx_location(self) -> None:
        with patch("backend.twitter_cli.shutil.which", return_value=None), patch(
            "backend.twitter_cli.Path.home",
            return_value=__import__("pathlib").Path("C:/Users/tester"),
        ), patch(
            "backend.twitter_cli.Path.exists",
            return_value=True,
        ):
            cli = find_twitter_cli()

        self.assertEqual(PureWindowsPath(cli), PureWindowsPath("C:/Users/tester/.local/bin/twitter.exe"))

    def test_search_runs_with_utf8_environment(self) -> None:
        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.return_value.returncode = 0
            run_mock.return_value.stdout = "[]"
            run_mock.return_value.stderr = ""

            run_twitter_search("Binance Alpha", 5)

        _, kwargs = run_mock.call_args
        self.assertEqual(kwargs["env"]["PYTHONIOENCODING"], "utf-8")
        self.assertEqual(kwargs["env"]["NO_COLOR"], "1")

    def test_search_falls_back_to_xreach_when_twitter_cli_fails(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.find_xreach_cli",
            return_value="xreach.cmd",
        ), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.side_effect = [
                _Completed(
                    1,
                    '{"ok": false, "error": {"code": "not_found", "message": "404"}}',
                    "",
                ),
                _Completed(
                    0,
                    '{"items":[{"id":"999","text":"claim now","createdAt":"2026-04-12T00:00:00Z","user":{"screenName":"Alpha"}}]}',
                    "",
                ),
            ]

            payload = run_twitter_search("airdrop", 5)

        self.assertIsInstance(payload, dict)
        self.assertIn("items", payload)
        self.assertEqual(payload["items"][0]["id"], "999")
        self.assertEqual(run_mock.call_count, 2)


if __name__ == "__main__":
    unittest.main()

