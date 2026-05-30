import unittest

from backend.source_identity import build_source_dedupe_key, build_source_dedupe_key_with_fallback, canonicalize_source_url


class SourceIdentityTests(unittest.TestCase):
    def test_canonicalizes_x_variants_to_same_status_url(self) -> None:
        canonical = canonicalize_source_url("https://twitter.com/BinanceWallet/status/111?s=20")
        self.assertEqual(canonical, "https://x.com/i/status/111")

    def test_prefers_tweet_id_when_provided(self) -> None:
        key = build_source_dedupe_key(
            tweet_id="111",
            url="https://x.com/BinanceWallet/status/111",
        )
        self.assertEqual(key, "tweet:111")

    def test_uses_text_fingerprint_when_id_and_url_are_missing(self) -> None:
        key_a = build_source_dedupe_key(text=" Alpha claim is live ", author="BinanceWallet")
        key_b = build_source_dedupe_key(text="Alpha   claim is live", author="binancewallet")
        self.assertEqual(key_a, key_b)
        self.assertTrue(key_a.startswith("text:"))

    def test_fallback_uses_author_created_at_and_text_when_primary_identity_is_missing(self) -> None:
        key_a = build_source_dedupe_key_with_fallback(
            tweet_id="",
            url="",
            text="",
            author="demo",
            created_at="2026-04-10T00:00:00+00:00",
        )
        key_b = build_source_dedupe_key_with_fallback(
            tweet_id=None,
            url=None,
            text=None,
            author="demo",
            created_at="2026-04-10T00:00:00+00:00",
        )
        self.assertEqual(key_a, key_b)
        self.assertEqual(key_a, "fallback:demo|2026-04-10T00:00:00+00:00|")


if __name__ == "__main__":
    unittest.main()

