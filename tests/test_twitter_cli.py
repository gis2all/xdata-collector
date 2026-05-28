import subprocess
import unittest
from pathlib import PureWindowsPath
from unittest.mock import patch

from backend.twitter_cli import (
    find_twitter_cli,
    find_xreach_cli,
    get_twitter_cli_version,
    normalize_search_payload,
    run_twitter_search,
    run_xreach_search,
)


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
        self.assertEqual(results[0].author_name, "")
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
        self.assertEqual(results[0].author_name, "")
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
        self.assertEqual(results[0].author_name, "")
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
        self.assertEqual(results[0].author_name, "")
        self.assertEqual(results[0].author, "QuestOps")
        self.assertEqual(results[0].url, "https://x.com/QuestOps/status/555")
        self.assertEqual(results[0].raw["metrics"]["views"], 1200)
        self.assertEqual(results[0].raw["metrics"]["replies"], 2)
        self.assertEqual(results[0].raw["metrics"]["retweets"], 5)


class TwitterCliRuntimeTests(unittest.TestCase):
    CREATE_NO_WINDOW_FLAG = 0x08000000

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

    def test_xreach_missing_message_names_npm_package(self) -> None:
        with patch("backend.twitter_cli.shutil.which", return_value=None), patch(
            "backend.twitter_cli.Path.exists",
            return_value=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "npm i -g xreach-cli"):
                find_xreach_cli()

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

    def test_reads_twitter_cli_version_from_command_output(self) -> None:
        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.return_value.returncode = 0
            run_mock.return_value.stdout = "twitter.EXE, version 0.8.6\n"
            run_mock.return_value.stderr = ""

            version = get_twitter_cli_version()

        self.assertEqual(version, "0.8.6")

    def test_windows_twitter_cli_run_uses_create_no_window(self) -> None:
        with patch("backend.twitter_cli.os.name", "nt"), patch(
            "backend.twitter_cli.find_twitter_cli",
            return_value="twitter.exe",
        ), patch(
            "backend.twitter_cli.subprocess.CREATE_NO_WINDOW",
            self.CREATE_NO_WINDOW_FLAG,
            create=True,
        ), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.return_value.returncode = 0
            run_mock.return_value.stdout = "[]"
            run_mock.return_value.stderr = ""

            run_twitter_search("Binance Alpha", 5)

        _, kwargs = run_mock.call_args
        self.assertEqual(kwargs["creationflags"], self.CREATE_NO_WINDOW_FLAG)

    def test_search_uses_twitter_cli_first_without_calling_xreach(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.find_xreach_cli", side_effect=AssertionError("xreach should not be called")
        ), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.side_effect = [
                _Completed(
                    0,
                    (
                        '{"items":[{"id":"999","text":"claim now",'
                        '"createdAt":"2026-04-12T00:00:00Z",'
                        '"user":{"screenName":"Alpha","name":"Alpha Ops"},'
                        '"viewCount":1,"replyCount":0,"retweetCount":0,"likeCount":0,'
                        '"media":[{"type":"photo","url":"https://pbs.twimg.com/media/a.jpg"}],'
                        '"urls":[{"expanded_url":"https://example.com"}]}]}'
                    ),
                    "",
                ),
            ]

            payload = run_twitter_search("airdrop", 5)

        self.assertIsInstance(payload, dict)
        self.assertIn("items", payload)
        self.assertEqual(payload["items"][0]["id"], "999")
        self.assertEqual(run_mock.call_count, 1)
        self.assertEqual(run_mock.call_args.args[0][:2], ["twitter.exe", "search"])

    def test_search_falls_back_to_xreach_when_twitter_cli_fails(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.find_xreach_cli", return_value="xreach.cmd"
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
                    (
                        '{"items":[{"id":"999","text":"claim now",'
                        '"createdAt":"2026-04-12T00:00:00Z",'
                        '"user":{"screenName":"Alpha","name":"Alpha Ops"},'
                        '"viewCount":1,"replyCount":0,"retweetCount":0,"likeCount":0}]}'
                    ),
                    "",
                ),
            ]

            payload = run_twitter_search("airdrop", 5)

        self.assertIsInstance(payload, dict)
        self.assertEqual(payload["items"][0]["id"], "999")
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(run_mock.call_args_list[0].args[0][:2], ["twitter.exe", "search"])
        self.assertEqual(run_mock.call_args_list[1].args[0][:2], ["xreach.cmd", "search"])

    def test_xreach_fallback_enriches_sparse_search_items_with_tweet_detail(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.find_twitter_cli", return_value="twitter.exe"), patch(
            "backend.twitter_cli.find_xreach_cli", return_value="xreach.cmd"
        ), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.side_effect = [
                _Completed(
                    0,
                    (
                        '{"items":[{"id":"999","text":"claim now",'
                        '"createdAt":"2026-04-12T00:00:00Z",'
                        '"user":{"restId":"42"},'
                        '"viewCount":10}]}'
                    ),
                    "",
                ),
                _Completed(
                    0,
                    (
                        '{"id":"999","text":"claim now with media",'
                        '"createdAt":"2026-04-12T00:00:00Z",'
                        '"user":{"restId":"42","screenName":"Alpha","name":"Alpha Ops"},'
                        '"viewCount":1200,"replyCount":2,"retweetCount":5,"likeCount":8,'
                        '"media":[{"type":"photo","url":"https://pbs.twimg.com/media/a.jpg"}],'
                        '"lang":"en"}'
                    ),
                    "",
                ),
            ]

            payload = run_xreach_search("airdrop", 5)

        self.assertEqual(run_mock.call_count, 2)
        detail_command = run_mock.call_args_list[1].args[0]
        self.assertEqual(detail_command[:3], ["xreach.cmd", "tweet", "999"])
        item = payload["items"][0]
        self.assertEqual(item["text"], "claim now with media")
        self.assertEqual(item["user"]["screenName"], "Alpha")
        self.assertEqual(item["viewCount"], 1200)
        self.assertEqual(item["replyCount"], 2)
        self.assertEqual(item["retweetCount"], 5)
        self.assertEqual(item["likeCount"], 8)
        self.assertEqual(item["media"][0]["url"], "https://pbs.twimg.com/media/a.jpg")

    def test_xreach_fallback_keeps_sparse_item_when_detail_enrichment_fails(self) -> None:
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
                    '{"items":[{"id":"999","text":"claim now","createdAt":"2026-04-12T00:00:00Z","user":{"restId":"42"}}]}',
                    "",
                ),
                _Completed(1, "", "detail failed"),
            ]

            payload = run_twitter_search("airdrop", 5)

        self.assertEqual(run_mock.call_count, 3)
        self.assertEqual(payload["items"][0]["id"], "999")
        self.assertEqual(payload["items"][0]["text"], "claim now")

    def test_xreach_does_not_enrich_when_only_media_and_urls_are_missing(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.find_xreach_cli", return_value="xreach.cmd"), patch(
            "backend.twitter_cli.subprocess.run"
        ) as run_mock:
            run_mock.return_value = _Completed(
                0,
                (
                    '{"items":[{"id":"999","text":"claim now",'
                    '"createdAt":"2026-04-12T00:00:00Z",'
                    '"user":{"screenName":"Alpha","name":"Alpha Ops"},'
                    '"viewCount":1,"replyCount":0,"retweetCount":0,"likeCount":0}]}'
                ),
                "",
            )

            payload = run_twitter_search("airdrop", 5)

        self.assertEqual(run_mock.call_count, 1)
        self.assertEqual(payload["items"][0]["id"], "999")

    def test_windows_xreach_fallback_also_uses_create_no_window(self) -> None:
        class _Completed:
            def __init__(self, returncode: int, stdout: str, stderr: str = "") -> None:
                self.returncode = returncode
                self.stdout = stdout
                self.stderr = stderr

        with patch("backend.twitter_cli.os.name", "nt"), patch(
            "backend.twitter_cli.find_twitter_cli",
            return_value="twitter.exe",
        ), patch(
            "backend.twitter_cli.find_xreach_cli",
            return_value="xreach.cmd",
        ), patch(
            "backend.twitter_cli.subprocess.CREATE_NO_WINDOW",
            self.CREATE_NO_WINDOW_FLAG,
            create=True,
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
                    (
                        '{"items":[{"id":"999","text":"claim now",'
                        '"createdAt":"2026-04-12T00:00:00Z",'
                        '"user":{"screenName":"Alpha","name":"Alpha Ops"},'
                        '"viewCount":1,"replyCount":0,"retweetCount":0,"likeCount":0,'
                        '"media":[{"type":"photo","url":"https://pbs.twimg.com/media/a.jpg"}]}]}'
                    ),
                    "",
                ),
            ]

            run_twitter_search("airdrop", 5)

        self.assertEqual(run_mock.call_count, 2)
        first_kwargs = run_mock.call_args_list[0].kwargs
        second_kwargs = run_mock.call_args_list[1].kwargs
        self.assertEqual(first_kwargs["creationflags"], self.CREATE_NO_WINDOW_FLAG)
        self.assertEqual(second_kwargs["creationflags"], self.CREATE_NO_WINDOW_FLAG)


if __name__ == "__main__":
    unittest.main()
