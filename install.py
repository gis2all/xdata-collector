from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
BOOTSTRAP_SCRIPT = PROJECT_ROOT / "run" / "bootstrap.py"
WEB_UI_DIR = PROJECT_ROOT / "web-ui"


def _print_step(message: str) -> None:
    print(f"[install] {message}")


def _resolve_command(*candidates: str) -> str | None:
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def _run(command: list[str], cwd: Path = PROJECT_ROOT) -> None:
    printable = " ".join(command)
    _print_step(f"run: {printable}")
    subprocess.run(command, check=True, cwd=str(cwd))


def ensure_no_args() -> None:
    if len(sys.argv) > 1:
        joined = " ".join(sys.argv[1:])
        raise SystemExit(
            "install.py does not accept arguments. "
            f"Received: {joined}. Run `python install.py` directly."
        )


def run_bootstrap() -> None:
    _print_step("Preparing machine dependencies via run/bootstrap.py...")
    _run([sys.executable, str(BOOTSTRAP_SCRIPT)])


def install_frontend_dependencies() -> None:
    npm = _resolve_command("npm.cmd", "npm")
    if npm is None:
        raise RuntimeError("npm not found. Install Node.js before running install.py.")
    _print_step("Installing frontend dependencies in web-ui...")
    _run([npm, "install"], cwd=WEB_UI_DIR)


def main() -> int:
    ensure_no_args()
    _print_step(f"platform={sys.platform} python={sys.executable}")
    run_bootstrap()
    install_frontend_dependencies()
    _print_step("Install finished.")
    _print_step("Next: python services.py start")
    _print_step("Open: http://127.0.0.1:5177")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
