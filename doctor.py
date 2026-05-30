from __future__ import annotations

import argparse
import json
import shutil
import socket
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
API_PORT = 8765
DEV_UI_PORT = 5177


@dataclass(frozen=True)
class CheckResult:
    name: str
    ok: bool
    detail: str


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check local runtime prerequisites for XData Collector")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--skip-docker", action="store_true", help="skip docker CLI and daemon checks")
    return parser.parse_args(argv)


def collect_checks(*, skip_docker: bool = False) -> list[CheckResult]:
    checks = [
        check_python(),
        check_node(),
        check_npm(),
        check_pipx(),
        check_twitter_cli(),
        check_xreach_cli(),
        check_env_file(),
        check_ports(),
    ]
    if not skip_docker:
        checks.insert(-1, check_docker_cli())
        checks.insert(-1, check_docker_daemon())
    return checks


def check_python() -> CheckResult:
    version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    ok = sys.version_info >= (3, 13)
    detail = version if ok else f"{version} (need >= 3.13)"
    return CheckResult(name="python", ok=ok, detail=detail)


def check_node() -> CheckResult:
    return _check_command_version("node", ["node", "--version"])


def check_npm() -> CheckResult:
    npm = _resolve_command("npm.cmd", "npm")
    if npm is None:
        return CheckResult(name="npm", ok=False, detail="missing from PATH")
    return _check_command_version("npm", [npm, "--version"])


def check_pipx() -> CheckResult:
    return _check_command_version("pipx", [sys.executable, "-m", "pipx", "--version"])


def check_twitter_cli() -> CheckResult:
    candidates = (
        "twitter",
        "twitter.exe",
        str(Path.home() / ".local" / "bin" / "twitter"),
        str(Path.home() / ".local" / "bin" / "twitter.exe"),
    )
    path = _resolve_command(*candidates)
    if path is None:
        return CheckResult(name="twitter-cli", ok=False, detail="missing from PATH")
    return _check_command_version("twitter-cli", [path, "--version"])


def check_xreach_cli() -> CheckResult:
    candidates = (
        "xreach",
        "xreach.cmd",
        "xreach.ps1",
        str(Path.home() / "AppData" / "Roaming" / "npm" / "xreach.cmd"),
        str(Path.home() / ".npm-global" / "bin" / "xreach"),
        str(Path.home() / ".local" / "bin" / "xreach"),
    )
    path = _resolve_command(*candidates)
    if path is None:
        return CheckResult(name="xreach-cli", ok=False, detail="missing from PATH")
    return _check_command_version("xreach-cli", [path, "--version"])


def check_env_file() -> CheckResult:
    env_file = PROJECT_ROOT / ".env"
    if not env_file.exists():
        return CheckResult(name=".env", ok=False, detail="missing .env file")
    values = _read_env_values(env_file)
    missing: list[str] = []
    for key in ("TWITTER_AUTH_TOKEN", "TWITTER_CT0"):
        if not values.get(key, "").strip():
            missing.append(key)
    if missing:
        return CheckResult(name=".env", ok=False, detail=f"missing required values: {', '.join(missing)}")
    return CheckResult(name=".env", ok=True, detail="TWITTER_AUTH_TOKEN and TWITTER_CT0 present")


def check_docker_cli() -> CheckResult:
    return _check_command_version("docker-cli", ["docker", "--version"], candidates=("docker", "docker.exe"))


def check_docker_daemon() -> CheckResult:
    docker = _resolve_command("docker", "docker.exe")
    if docker is None:
        return CheckResult(name="docker-daemon", ok=False, detail="docker CLI missing")
    try:
        completed = subprocess.run(
            [docker, "info", "--format", "{{.ServerVersion}}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
    except OSError as exc:
        return CheckResult(name="docker-daemon", ok=False, detail=str(exc))
    output = (completed.stdout or completed.stderr).strip()
    if completed.returncode != 0:
        return CheckResult(name="docker-daemon", ok=False, detail=output or "docker daemon unavailable")
    return CheckResult(name="docker-daemon", ok=True, detail=output or "available")


def check_ports() -> CheckResult:
    busy: list[str] = []
    for port in (API_PORT, DEV_UI_PORT):
        if _is_port_open(DEFAULT_HOST, port):
            busy.append(str(port))
    if busy:
        return CheckResult(name="ports", ok=False, detail=f"in use: {', '.join(busy)}")
    return CheckResult(name="ports", ok=True, detail="8765 and 5177 available")


def render_json(checks: list[CheckResult]) -> str:
    payload = {
        "ok": all(check.ok for check in checks),
        "checks": [asdict(check) for check in checks],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def render_text(checks: list[CheckResult]) -> str:
    lines = []
    for check in checks:
        status = "OK" if check.ok else "FAIL"
        lines.append(f"[{status}] {check.name}: {check.detail}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    checks = collect_checks(skip_docker=args.skip_docker)
    rendered = render_json(checks) if args.json else render_text(checks)
    print(rendered)
    return 0 if all(check.ok for check in checks) else 1


def _check_command_version(
    name: str,
    command: list[str],
    *,
    candidates: tuple[str, ...] | None = None,
) -> CheckResult:
    if candidates is not None and _resolve_command(*candidates) is None:
        return CheckResult(name=name, ok=False, detail="missing from PATH")
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
    except OSError as exc:
        return CheckResult(name=name, ok=False, detail=str(exc))
    output = (completed.stdout or completed.stderr).strip()
    if completed.returncode != 0:
        return CheckResult(name=name, ok=False, detail=output or "command failed")
    return CheckResult(name=name, ok=True, detail=output or "available")


def _resolve_command(*candidates: str) -> str | None:
    for candidate in candidates:
        if not candidate:
            continue
        if Path(candidate).is_absolute() and Path(candidate).exists():
            return candidate
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def _read_env_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) == 0


if __name__ == "__main__":
    raise SystemExit(main())
