from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import urlopen

PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = PROJECT_ROOT / "runtime"
LOG_DIR = RUNTIME_DIR / "logs"
PID_DIR = RUNTIME_DIR / "pids"
ENV_FILE = PROJECT_ROOT / ".env"
PYTHON = sys.executable
DEFAULT_HOST = "127.0.0.1"
API_PORT = 8765
DEV_UI_PORT = 5177
SCHEDULER_TICK_SECONDS = 30
WAIT_SECONDS = 20.0
POLL_SECONDS = 0.5


@dataclass(frozen=True)
class ManagedService:
    key: str
    label: str
    pid_file: Path
    out_log: Path
    err_log: Path
    cwd: Path
    command: tuple[str, ...]
    port: int | None = None
    health_url: str | None = None
    process_markers: tuple[str, ...] = ()


SERVICES: tuple[ManagedService, ...] = (
    ManagedService(
        key="api",
        label="API",
        pid_file=PID_DIR / "api.pid",
        out_log=LOG_DIR / "api.current.out.log",
        err_log=LOG_DIR / "api.current.err.log",
        cwd=PROJECT_ROOT,
        command=(PYTHON, "run/api.py", "--port", str(API_PORT)),
        port=API_PORT,
        health_url=f"http://{DEFAULT_HOST}:{API_PORT}/health",
        process_markers=("run/api.py", "run\\api.py"),
    ),
    ManagedService(
        key="scheduler",
        label="Scheduler",
        pid_file=PID_DIR / "scheduler.pid",
        out_log=LOG_DIR / "scheduler.current.out.log",
        err_log=LOG_DIR / "scheduler.current.err.log",
        cwd=PROJECT_ROOT,
        command=(PYTHON, "run/scheduler.py", "--tick-seconds", str(SCHEDULER_TICK_SECONDS)),
        process_markers=("run/scheduler.py", "run\\scheduler.py"),
    ),
    ManagedService(
        key="web-ui",
        label="Dev UI",
        pid_file=PID_DIR / "web-ui.pid",
        out_log=LOG_DIR / "web-ui.current.out.log",
        err_log=LOG_DIR / "web-ui.current.err.log",
        cwd=PROJECT_ROOT / "web-ui",
        command=("npm.cmd" if os.name == "nt" else "npm", "run", "dev"),
        port=DEV_UI_PORT,
        process_markers=("vite", "npm run dev"),
    ),
)


@dataclass
class ServiceStatus:
    service: ManagedService
    state: str
    pid: int | None
    port_ok: bool | None
    note: str = ""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Control local XData Collector development services")
    parser.add_argument("command", choices=("start", "stop", "status", "restart"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    ensure_runtime_dirs()
    warn_if_env_missing()

    if args.command == "start":
        ensure_npm_for_dev_ui()
        statuses = start_all()
        print_statuses(statuses)
        return 0
    if args.command == "stop":
        statuses = stop_all()
        print_statuses(statuses)
        return 0
    if args.command == "status":
        statuses = [resolve_status(service) for service in SERVICES]
        print_statuses(statuses)
        return 0
    if args.command == "restart":
        ensure_npm_for_dev_ui()
        stop_all()
        statuses = start_all()
        print_statuses(statuses)
        return 0
    raise AssertionError("unreachable")


def ensure_runtime_dirs() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    PID_DIR.mkdir(parents=True, exist_ok=True)


def warn_if_env_missing() -> None:
    if not ENV_FILE.exists():
        print("[services] warning: .env not found; X auth and health checks may fail.")


def ensure_npm_for_dev_ui() -> None:
    npm = resolve_npm()
    if npm is None:
        raise SystemExit("npm not found. Install Node.js before using services.py.")


def resolve_npm() -> str | None:
    candidates = ("npm.cmd", "npm") if os.name == "nt" else ("npm",)
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def start_all() -> list[ServiceStatus]:
    statuses: list[ServiceStatus] = []
    started: list[ManagedService] = []
    try:
        for service in SERVICES:
            status = resolve_status(service)
            if status.state == "running":
                status.note = status.note or "already running; skipped"
                statuses.append(status)
                continue
            started_status = start_service(service)
            statuses.append(started_status)
            started.append(service)
        return statuses
    except Exception:
        for service in reversed(started):
            stop_service(service)
        raise


def stop_all() -> list[ServiceStatus]:
    statuses: list[ServiceStatus] = []
    for service in reversed(SERVICES):
        statuses.append(stop_service(service))
    statuses.reverse()
    return statuses


def start_service(service: ManagedService) -> ServiceStatus:
    service.out_log.parent.mkdir(parents=True, exist_ok=True)
    with service.out_log.open("w", encoding="utf-8") as stdout, service.err_log.open("w", encoding="utf-8") as stderr:
        kwargs: dict[str, object] = {
            "cwd": str(service.cwd),
            "stdout": stdout,
            "stderr": stderr,
            "stdin": subprocess.DEVNULL,
            "close_fds": True,
        }
        if os.name == "nt":
            creationflags = 0
            creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
            kwargs["creationflags"] = creationflags
        else:
            kwargs["start_new_session"] = True
        process = subprocess.Popen(service.command, **kwargs)  # noqa: S603
    write_pid(service.pid_file, process.pid)

    if service.port is not None:
        wait_for_port(DEFAULT_HOST, service.port, WAIT_SECONDS)
    else:
        wait_for_pid(process.pid, WAIT_SECONDS)

    return ServiceStatus(service=service, state="running", pid=process.pid, port_ok=port_state(service), note="started")


def stop_service(service: ManagedService) -> ServiceStatus:
    pid = read_pid(service.pid_file)
    stale = False
    note_parts: list[str] = []

    if pid is not None:
        if pid_exists(pid):
            terminate_pid_tree(pid)
            note_parts.append(f"stopped pid {pid}")
        else:
            stale = True
            note_parts.append(f"stale pid {pid}")

    if service.port is not None:
        extra_pids = [candidate for candidate in find_pids_by_port(service.port) if candidate != pid]
        if extra_pids:
            for extra_pid in extra_pids:
                terminate_pid_tree(extra_pid)
            note_parts.append(f"cleaned port {service.port}")

    if service.key == "scheduler":
        for candidate in discover_process_pids(service):
            if candidate != pid and pid_exists(candidate):
                terminate_pid_tree(candidate)
                note_parts.append(f"cleaned scheduler pid {candidate}")

    remove_pid_file(service.pid_file)
    status = resolve_status(service)
    if status.state == "running":
        status.note = "; ".join(note_parts) or "stop attempted"
        return status
    if stale and not note_parts:
        note_parts.append("stale pid file removed")
    return ServiceStatus(service=service, state="stopped", pid=None, port_ok=port_state(service), note="; ".join(note_parts) or "stopped")


def resolve_status(service: ManagedService) -> ServiceStatus:
    pid = read_pid(service.pid_file)
    port_ok = port_state(service)

    if pid is not None and pid_exists(pid):
        return ServiceStatus(service=service, state="running", pid=pid, port_ok=port_ok)

    adopted_pid = adopt_running_pid(service)
    if adopted_pid is not None:
        write_pid(service.pid_file, adopted_pid)
        return ServiceStatus(service=service, state="running", pid=adopted_pid, port_ok=port_state(service), note="adopted running process")

    if pid is not None:
        remove_pid_file(service.pid_file)
        return ServiceStatus(service=service, state="stale pid", pid=pid, port_ok=port_ok, note="removed stale pid file")

    return ServiceStatus(service=service, state="stopped", pid=None, port_ok=port_ok)


def adopt_running_pid(service: ManagedService) -> int | None:
    if service.port is not None:
        pids = find_pids_by_port(service.port)
        if len(pids) == 1 and pid_exists(pids[0]):
            return pids[0]
    process_pids = discover_process_pids(service)
    if len(process_pids) == 1 and pid_exists(process_pids[0]):
        return process_pids[0]
    return None


def discover_process_pids(service: ManagedService) -> list[int]:
    markers = tuple(marker.lower() for marker in service.process_markers)
    if not markers:
        return []
    matches: list[int] = []
    for pid, command in list_processes():
        lowered = command.lower()
        if any(marker in lowered for marker in markers):
            matches.append(pid)
    return unique_ints(matches)


def list_processes() -> list[tuple[int, str]]:
    if os.name == "nt":
        command = [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)  # noqa: S603
        raw = completed.stdout.strip()
        if not raw:
            return []
        payload = json.loads(raw)
        if isinstance(payload, dict):
            payload = [payload]
        return [
            (int(item.get("ProcessId")), str(item.get("CommandLine") or ""))
            for item in payload
            if item.get("ProcessId") is not None
        ]
    completed = subprocess.run(["ps", "-ax", "-o", "pid=,command="], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)  # noqa: S603
    processes: list[tuple[int, str]] = []
    for line in completed.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split(None, 1)
        if len(parts) == 2 and parts[0].isdigit():
            processes.append((int(parts[0]), parts[1]))
    return processes


def port_state(service: ManagedService) -> bool | None:
    if service.port is None:
        return None
    return is_port_open(DEFAULT_HOST, service.port)


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def wait_for_port(host: str, port: int, timeout_seconds: float) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if is_port_open(host, port):
            return
        time.sleep(POLL_SECONDS)
    raise SystemExit(f"Timed out waiting for {host}:{port}")


def wait_for_http(url: str, timeout_seconds: float) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=1.0) as response:  # noqa: S310
                if response.status < 500:
                    return
        except URLError:
            pass
        time.sleep(POLL_SECONDS)
    raise SystemExit(f"Timed out waiting for {url}")


def wait_for_pid(pid: int, timeout_seconds: float) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if pid_exists(pid):
            return
        time.sleep(POLL_SECONDS)
    raise SystemExit(f"Timed out waiting for pid {pid}")


def find_pids_by_port(port: int) -> list[int]:
    if os.name == "nt":
        completed = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)  # noqa: S603
        pids: list[int] = []
        needle = f":{port}"
        for line in completed.stdout.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            local_addr, state, pid = parts[1], parts[3], parts[4]
            if needle in local_addr and state.upper() == "LISTENING" and pid.isdigit():
                pids.append(int(pid))
        return unique_ints(pids)

    pids: list[int] = []
    for candidate in (["lsof", "-tiTCP:%d" % port, "-sTCP:LISTEN"], ["fuser", "-n", "tcp", str(port)]):
        if shutil.which(candidate[0]) is None:
            continue
        completed = subprocess.run(candidate, capture_output=True, text=True, encoding="utf-8", errors="replace")  # noqa: S603
        if completed.returncode != 0 and not completed.stdout.strip():
            continue
        for token in completed.stdout.replace("\n", " ").split():
            if token.isdigit():
                pids.append(int(token))
        if pids:
            break
    return unique_ints(pids)


def pid_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        completed = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )  # noqa: S603
        output = completed.stdout.strip()
        if not output or output.startswith("INFO:"):
            return False
        return f'"{pid}"' in output or output.endswith(f",{pid}")
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def terminate_pid_tree(pid: int) -> None:
    if not pid_exists(pid):
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T"], capture_output=True, text=True)  # noqa: S603
        if pid_exists(pid):
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True)  # noqa: S603
        return
    try:
        os.killpg(pid, signal.SIGTERM)
    except OSError:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return
    deadline = time.time() + 5.0
    while time.time() < deadline and pid_exists(pid):
        time.sleep(0.2)
    if pid_exists(pid):
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                return


def read_pid(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if raw.isdigit():
        return int(raw)
    return None


def write_pid(path: Path, pid: int) -> None:
    path.write_text(f"{pid}\n", encoding="utf-8")


def remove_pid_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def unique_ints(values: Iterable[int]) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def print_statuses(statuses: Iterable[ServiceStatus]) -> None:
    for status in statuses:
        details: list[str] = []
        if status.pid is not None:
            details.append(f"pid={status.pid}")
        if status.port_ok is not None:
            details.append(f"port={'up' if status.port_ok else 'down'}")
        if status.note:
            details.append(status.note)
        suffix = f" ({', '.join(details)})" if details else ""
        print(f"[{status.service.key}] {status.state}{suffix}")


if __name__ == "__main__":
    raise SystemExit(main())
