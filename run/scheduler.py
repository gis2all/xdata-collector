from __future__ import annotations

import argparse
import signal
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

    shutdown = False

    def _handle_shutdown(signum, frame):
        nonlocal shutdown
        print(f"[scheduler] received signal {signum}, shutting down after current tick...")
        shutdown = True

    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    try:
        while not shutdown:
            result = service.tick()
            print(f"[scheduler] triggered={result['triggered']} failed={result['failed']}")
            if shutdown:
                break
            time.sleep(max(1, args.tick_seconds))
    except KeyboardInterrupt:
        pass
    finally:
        print("[scheduler] stopped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
