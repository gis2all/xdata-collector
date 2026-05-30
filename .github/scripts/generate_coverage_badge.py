from __future__ import annotations

import json
import sys
from pathlib import Path


def badge_color(percent: float) -> str:
    if percent >= 90:
        return "brightgreen"
    if percent >= 80:
        return "green"
    if percent >= 70:
        return "yellowgreen"
    if percent >= 60:
        return "yellow"
    if percent >= 50:
        return "orange"
    return "red"


def build_badge_payload(percent: float) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "label": "backend coverage",
        "message": f"{percent:.2f}%",
        "color": badge_color(percent),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: python .github/scripts/generate_coverage_badge.py <coverage.json> <output.json>", file=sys.stderr)
        return 2

    coverage_path = Path(argv[1])
    output_path = Path(argv[2])

    coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
    percent = float(coverage["totals"]["percent_covered"])
    payload = build_badge_payload(percent)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
