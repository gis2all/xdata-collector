import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch
from urllib.error import URLError

import services


class ServicesHelpersTests(unittest.TestCase):
    def test_parse_args_accepts_supported_commands(self) -> None:
        args = services.parse_args(["start"])
        self.assertEqual(args.command, "start")

    def test_env_float_uses_default_for_missing_invalid_or_non_positive_values(self) -> None:
        with patch.dict("services.os.environ", {}, clear=False):
            self.assertEqual(services._env_float("XDATA_SERVICE_WAIT_SECONDS", 20.0), 20.0)

        with patch.dict("services.os.environ", {"XDATA_SERVICE_WAIT_SECONDS": "bad"}, clear=False):
            self.assertEqual(services._env_float("XDATA_SERVICE_WAIT_SECONDS", 20.0), 20.0)

        with patch.dict("services.os.environ", {"XDATA_SERVICE_WAIT_SECONDS": "0"}, clear=False):
            self.assertEqual(services._env_float("XDATA_SERVICE_WAIT_SECONDS", 20.0), 20.0)

    def test_env_float_accepts_positive_override(self) -> None:
        with patch.dict("services.os.environ", {"XDATA_SERVICE_WAIT_SECONDS": "45"}, clear=False):
            self.assertEqual(services._env_float("XDATA_SERVICE_WAIT_SECONDS", 20.0), 45.0)

    def test_warn_if_env_missing_prints_warning(self) -> None:
        env_file = Mock()
        env_file.exists.return_value = False
        with patch("services.ENV_FILE", env_file), patch("builtins.print") as mock_print:
            services.warn_if_env_missing()

        mock_print.assert_called_once()

    def test_ensure_npm_for_dev_ui_exits_when_npm_missing(self) -> None:
        with patch("services.resolve_npm", return_value=None):
            with self.assertRaisesRegex(SystemExit, "npm not found"):
                services.ensure_npm_for_dev_ui()

    def test_resolve_npm_checks_windows_candidates(self) -> None:
        with patch("services.os.name", "nt"), patch("services.shutil.which", side_effect=[None, "C:/node/npm.exe"]) as mock_which:
            self.assertEqual(services.resolve_npm(), "C:/node/npm.exe")

        self.assertEqual([call.args[0] for call in mock_which.call_args_list], ["npm.cmd", "npm"])

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

    def test_start_all_rolls_back_started_services_on_failure(self) -> None:
        first = services.SERVICES[0]
        second = services.SERVICES[1]
        with (
            patch("services.SERVICES", (first, second)),
            patch(
                "services.resolve_status",
                side_effect=[
                    services.ServiceStatus(service=first, state="stopped", pid=None, port_ok=False),
                    services.ServiceStatus(service=second, state="stopped", pid=None, port_ok=None),
                ],
            ),
            patch("services.start_service", side_effect=[services.ServiceStatus(service=first, state="running", pid=1, port_ok=True), RuntimeError("boom")]),
            patch("services.stop_service") as mock_stop_service,
        ):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                services.start_all()

        mock_stop_service.assert_called_once_with(first)

    def test_stop_all_stops_services_in_reverse_order_but_returns_original_order(self) -> None:
        first = services.SERVICES[0]
        second = services.SERVICES[1]

        def _stop(service: services.ManagedService) -> services.ServiceStatus:
            return services.ServiceStatus(service=service, state="stopped", pid=None, port_ok=None)

        with patch("services.SERVICES", (first, second)), patch("services.stop_service", side_effect=_stop) as mock_stop:
            statuses = services.stop_all()

        self.assertEqual([call.args[0] for call in mock_stop.call_args_list], [second, first])
        self.assertEqual([status.service for status in statuses], [first, second])

    def test_start_service_writes_pid_and_waits_for_port(self) -> None:
        with TemporaryDirectory() as tmp:
            service = services.ManagedService(
                key="api",
                label="API",
                pid_file=Path(tmp) / "api.pid",
                out_log=Path(tmp) / "api.out.log",
                err_log=Path(tmp) / "api.err.log",
                cwd=Path(tmp),
                command=("python", "run/api.py"),
                port=8765,
                health_url="http://127.0.0.1:8765/health",
                process_markers=("run/api.py",),
            )
            process = Mock(pid=2468)
            with (
                patch("services.subprocess.Popen", return_value=process) as mock_popen,
                patch("services.wait_for_port") as mock_wait_for_port,
                patch("services.port_state", return_value=True),
            ):
                status = services.start_service(service)

            self.assertEqual(status.state, "running")
            self.assertEqual(status.pid, 2468)
            self.assertEqual(services.read_pid(service.pid_file), 2468)
            mock_popen.assert_called_once()
            mock_wait_for_port.assert_called_once_with(services.DEFAULT_HOST, 8765, services.WAIT_SECONDS)

    def test_start_service_without_port_waits_for_pid(self) -> None:
        with TemporaryDirectory() as tmp:
            service = services.ManagedService(
                key="scheduler",
                label="Scheduler",
                pid_file=Path(tmp) / "scheduler.pid",
                out_log=Path(tmp) / "scheduler.out.log",
                err_log=Path(tmp) / "scheduler.err.log",
                cwd=Path(tmp),
                command=("python", "run/scheduler.py"),
                process_markers=("run/scheduler.py",),
            )
            process = Mock(pid=1357)
            with (
                patch("services.subprocess.Popen", return_value=process),
                patch("services.wait_for_pid") as mock_wait_for_pid,
                patch("services.port_state", return_value=None),
            ):
                status = services.start_service(service)

            self.assertEqual(status.pid, 1357)
            mock_wait_for_pid.assert_called_once_with(1357, services.WAIT_SECONDS)

    def test_find_pids_by_port_prefers_psutil_connections(self) -> None:
        listener = Mock()
        listener.status = "LISTEN"
        listener.laddr = Mock(port=8765)
        listener.pid = 4321
        with patch("services.psutil.net_connections", return_value=[listener]):
            self.assertEqual(services.find_pids_by_port(8765), [4321])

    def test_find_pids_by_port_falls_back_to_netstat_on_windows(self) -> None:
        output = "\n".join(
            [
                "  TCP    127.0.0.1:8765    0.0.0.0:0    LISTENING    111",
                "  TCP    127.0.0.1:9999    0.0.0.0:0    LISTENING    222",
            ]
        )
        completed = Mock(stdout=output)
        with (
            patch("services.psutil.net_connections", return_value=[]),
            patch("services.os.name", "nt"),
            patch("services.subprocess.run", return_value=completed),
        ):
            self.assertEqual(services.find_pids_by_port(8765), [111])

    def test_discover_process_pids_matches_command_markers(self) -> None:
        service = services.ManagedService(
            key="scheduler",
            label="Scheduler",
            pid_file=Path("scheduler.pid"),
            out_log=Path("scheduler.out.log"),
            err_log=Path("scheduler.err.log"),
            cwd=Path("."),
            command=("python", "run/scheduler.py"),
            process_markers=("run/scheduler.py",),
        )
        with patch(
            "services.list_processes",
            return_value=[(1, "python run/scheduler.py"), (2, "python other.py"), (1, "python run/scheduler.py")],
        ):
            self.assertEqual(services.discover_process_pids(service), [1])

    def test_wait_helpers_return_on_success_and_raise_on_timeout(self) -> None:
        with patch("services.is_port_open", return_value=True):
            services.wait_for_port("127.0.0.1", 8765, 0.01)

        with patch("services.is_port_open", return_value=False), patch("services.time.sleep"):
            with self.assertRaisesRegex(SystemExit, "Timed out waiting"):
                services.wait_for_port("127.0.0.1", 8765, 0.01)

        with patch("services.pid_exists", return_value=True):
            services.wait_for_pid(123, 0.01)

        with patch("services.pid_exists", return_value=False), patch("services.time.sleep"):
            with self.assertRaisesRegex(SystemExit, "Timed out waiting for pid"):
                services.wait_for_pid(123, 0.01)

    def test_wait_for_http_handles_success_and_timeout(self) -> None:
        response = Mock()
        response.__enter__ = Mock(return_value=Mock(status=204))
        response.__exit__ = Mock(return_value=False)
        with patch("services.urlopen", return_value=response):
            services.wait_for_http("http://127.0.0.1:8765/health", 0.01)

        with patch("services.urlopen", side_effect=URLError("down")), patch("services.time.sleep"):
            with self.assertRaisesRegex(SystemExit, "Timed out waiting"):
                services.wait_for_http("http://127.0.0.1:8765/health", 0.01)

    def test_pid_exists_rejects_non_positive_pid(self) -> None:
        self.assertFalse(services.pid_exists(0))
        self.assertFalse(services.pid_exists(-1))

    def test_read_pid_ignores_invalid_content_and_remove_pid_file_ignores_missing_file(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.pid"
            path.write_text("not-a-pid\n", encoding="utf-8")
            self.assertIsNone(services.read_pid(path))
            path.unlink()
            services.remove_pid_file(path)

    def test_unique_ints_preserves_first_seen_order(self) -> None:
        self.assertEqual(services.unique_ints([3, 1, 3, 2, 1]), [3, 1, 2])

    def test_print_statuses_includes_pid_port_and_note(self) -> None:
        status = services.ServiceStatus(service=services.SERVICES[0], state="running", pid=123, port_ok=True, note="started")
        with patch("builtins.print") as mock_print:
            services.print_statuses([status])

        mock_print.assert_called_once_with("[api] running (pid=123, port=up, started)")

    def test_terminate_pid_tree_uses_psutil_process_tree(self) -> None:
        child = Mock()
        parent = Mock()
        parent.children.return_value = [child]
        with patch("services.psutil.Process", return_value=parent), patch("services.psutil.wait_procs", return_value=([], [])):
            services.terminate_pid_tree(1234)

        child.terminate.assert_called_once_with()
        parent.terminate.assert_called_once_with()

    def test_terminate_pid_tree_kills_alive_processes_after_timeout(self) -> None:
        child = Mock()
        parent = Mock()
        parent.children.return_value = [child]
        with patch("services.psutil.Process", return_value=parent), patch(
            "services.psutil.wait_procs",
            side_effect=[([], [child]), ([child], [])],
        ):
            services.terminate_pid_tree(1234)

        child.kill.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
