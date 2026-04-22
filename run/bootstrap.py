from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _print_step(message: str) -> None:
    print(f"[bootstrap] {message}")


def _run(command: list[str]) -> None:
    printable = " ".join(command)
    _print_step(f"run: {printable}")
    subprocess.run(command, check=True, cwd=str(PROJECT_ROOT))


def ensure_no_args() -> None:
    if len(sys.argv) > 1:
        joined = " ".join(sys.argv[1:])
        raise SystemExit(
            "bootstrap.py does not accept arguments. "
            f"Received: {joined}. Run `python run/bootstrap.py` directly."
        )


def ensure_pipx() -> None:
    _print_step("Installing or upgrading pipx...")
    _run([sys.executable, "-m", "pip", "install", "--upgrade", "pipx"])
    _print_step("Refreshing pipx PATH integration...")
    _run([sys.executable, "-m", "pipx", "ensurepath"])


def install_twitter_cli() -> None:
    _print_step("Installing twitter-cli via pipx...")
    _run([sys.executable, "-m", "pipx", "install", "--force", "twitter-cli"])

def main() -> int:
    ensure_no_args()
    _print_step(f"platform={sys.platform} python={sys.executable}")
    ensure_pipx()
    install_twitter_cli()
    _print_step("Bootstrap finished.")
    _print_step("If PATH changed during setup, reopen your terminal before using twitter-cli.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
