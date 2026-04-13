from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector_service import DesktopService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fixed-interval scheduler for X collector")
    parser.add_argument("--db-path", default=str(Path("data") / "app.db"))
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--tick-seconds", type=int, default=30)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    service = DesktopService(db_path=args.db_path, env_file=args.env_file)
    print(f"[scheduler] start tick={args.tick_seconds}s")
    while True:
        result = service.tick()
        print(f"[scheduler] triggered={result['triggered']} failed={result['failed']}")
        time.sleep(max(1, args.tick_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
