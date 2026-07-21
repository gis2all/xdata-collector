from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    root = Path("runtime/logs")
    if not root.exists():
        print("[logs] runtime/logs missing")
        return 0
    for path in sorted(root.glob("*.log")):
        content = path.read_text(encoding="utf-8", errors="replace")
        print(f"===== {path} =====")
        print(content, end="" if content.endswith("\n") else "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
