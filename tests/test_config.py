import json
import unittest
from pathlib import Path

from backend.config import SearchPreset, load_search_presets


class LoadSearchPresetsTests(unittest.TestCase):
    def test_loads_presets_from_json_file(self) -> None:
        path = Path("tests") / "_search_presets_test.json"
        try:
            path.write_text(
                json.dumps(
                    [
                        {
                            "name": "binance_alpha",
                            "query": 'from:BinanceWallet ("Alpha Points" OR claim) -is:retweet',
                            "max_results": 15,
                            "project_page_id": "page-123",
                            "opportunity_types": ["积分", "Claim"],
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            presets = load_search_presets(path)
        finally:
            if path.exists():
                path.unlink()

        self.assertEqual(
            presets,
            [
                SearchPreset(
                    name="binance_alpha",
                    query='from:BinanceWallet ("Alpha Points" OR claim) -is:retweet',
                    max_results=15,
                    project_page_id="page-123",
                    opportunity_types=["积分", "Claim"],
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()

