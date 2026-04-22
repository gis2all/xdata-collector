import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import services


class ServicesHelpersTests(unittest.TestCase):
    def test_parse_args_accepts_supported_commands(self) -> None:
        args = services.parse_args(["start"])
        self.assertEqual(args.command, "start")

    def test_read_and_write_pid_roundtrip(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "api.pid"
            services.write_pid(path, 12345)
            self.assertEqual(services.read_pid(path), 12345)

    def test_resolve_status_reports_stale_pid_and_removes_file(self) -> None:
        with TemporaryDirectory() as tmp:
            pid_file = Path(tmp) / "scheduler.pid"
            pid_file.write_text("99999\n", encoding="utf-8")
            service = services.ManagedService(
                key="scheduler",
                label="Scheduler",
                pid_file=pid_file,
                out_log=Path(tmp) / "scheduler.out.log",
                err_log=Path(tmp) / "scheduler.err.log",
                cwd=Path(tmp),
                command=("python", "run/scheduler.py"),
                process_markers=("run/scheduler.py",),
            )
            with patch("services.pid_exists", return_value=False), patch(
                "services.discover_process_pids", return_value=[]
            ):
                status = services.resolve_status(service)

            self.assertEqual(status.state, "stale pid")
            self.assertFalse(pid_file.exists())

    def test_resolve_status_adopts_running_pid_from_port(self) -> None:
        with TemporaryDirectory() as tmp:
            pid_file = Path(tmp) / "api.pid"
            service = services.ManagedService(
                key="api",
                label="API",
                pid_file=pid_file,
                out_log=Path(tmp) / "api.out.log",
                err_log=Path(tmp) / "api.err.log",
                cwd=Path(tmp),
                command=("python", "run/api.py"),
                port=8765,
                health_url="http://127.0.0.1:8765/health",
                process_markers=("run/api.py",),
            )
            with patch("services.find_pids_by_port", return_value=[43210]), patch(
                "services.pid_exists", return_value=True
            ), patch("services.discover_process_pids", return_value=[]), patch(
                "services.port_state", return_value=True
            ):
                status = services.resolve_status(service)

            self.assertEqual(status.state, "running")
            self.assertEqual(status.pid, 43210)
            self.assertEqual(services.read_pid(pid_file), 43210)

    def test_stop_service_cleans_extra_port_pid(self) -> None:
        with TemporaryDirectory() as tmp:
            pid_file = Path(tmp) / "api.pid"
            pid_file.write_text("123\n", encoding="utf-8")
            service = services.ManagedService(
                key="api",
                label="API",
                pid_file=pid_file,
                out_log=Path(tmp) / "api.out.log",
                err_log=Path(tmp) / "api.err.log",
                cwd=Path(tmp),
                command=("python", "run/api.py"),
                port=8765,
                health_url="http://127.0.0.1:8765/health",
                process_markers=("run/api.py",),
            )
            killed = []

            def _kill(pid: int) -> None:
                killed.append(pid)

            with patch("services.pid_exists", side_effect=lambda pid: pid in {123, 456}), patch(
                "services.find_pids_by_port", return_value=[123, 456]
            ), patch("services.terminate_pid_tree", side_effect=_kill), patch(
                "services.resolve_status",
                return_value=services.ServiceStatus(service=service, state="stopped", pid=None, port_ok=False),
            ):
                status = services.stop_service(service)

            self.assertEqual(status.state, "stopped")
            self.assertEqual(killed, [123, 456])
            self.assertFalse(pid_file.exists())


if __name__ == "__main__":
    unittest.main()
