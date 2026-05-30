from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import shutil

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TWITTER_CLI_SOURCE = "git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7"
XREACH_CLI_PACKAGE = "xreach-cli@0.3.0"


def _print_step(message: str) -> None:
    print(f"[bootstrap] {message}")


def _run(command: list[str]) -> None:
    printable = " ".join(command)
    _print_step(f"run: {printable}")
    subprocess.run(command, check=True, cwd=str(PROJECT_ROOT))


def _resolve_command(*candidates: str) -> str | None:
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


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


def install_python_runtime_dependencies() -> None:
    _print_step("Installing shared Python runtime dependencies...")
    _run([sys.executable, "-m", "pip", "install", "--upgrade", "psutil"])


def install_twitter_cli() -> None:
    _print_step("Installing twitter-cli via pipx...")
    # Keep this pinned ref in sync with Dockerfile to avoid local/container CLI drift.
    _run([sys.executable, "-m", "pipx", "install", "--force", TWITTER_CLI_SOURCE])


def install_xreach_cli() -> None:
    npm = _resolve_command("npm.cmd", "npm")
    if npm is None:
        raise RuntimeError("npm not found. Install Node.js before running bootstrap.py.")
    _print_step("Installing xreach-cli via npm...")
    # Keep this pinned package in sync with Dockerfile to avoid local/container CLI drift.
    _run([npm, "install", "-g", XREACH_CLI_PACKAGE])


def main() -> int:
    ensure_no_args()
    _print_step(f"platform={sys.platform} python={sys.executable}")
    ensure_pipx()
    install_python_runtime_dependencies()
    install_twitter_cli()
    install_xreach_cli()
    _print_step("Bootstrap finished.")
    _print_step("If PATH changed during setup, reopen your terminal before using twitter-cli or xreach.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
