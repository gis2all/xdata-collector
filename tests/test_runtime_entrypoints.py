import argparse
import io
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import doctor
import install
from run import bootstrap, scheduler, static_web_server


class BootstrapTests(unittest.TestCase):
    def test_ensure_no_args_rejects_extra_arguments(self) -> None:
        with patch.object(sys, "argv", ["bootstrap.py", "--bad"]):
            with self.assertRaisesRegex(SystemExit, "does not accept arguments"):
                bootstrap.ensure_no_args()

    def test_resolve_command_returns_first_match(self) -> None:
        with patch("run.bootstrap.shutil.which", side_effect=[None, "C:/node/npm.cmd"]) as mock_which:
            resolved = bootstrap._resolve_command("missing", "npm.cmd", "npm")

        self.assertEqual(resolved, "C:/node/npm.cmd")
        self.assertEqual(mock_which.call_count, 2)

    def test_install_xreach_cli_requires_npm(self) -> None:
        with patch("run.bootstrap._resolve_command", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "npm not found"):
                bootstrap.install_xreach_cli()

    def test_main_runs_pinned_bootstrap_steps(self) -> None:
        with (
            patch.object(sys, "argv", ["bootstrap.py"]),
            patch("run.bootstrap.ensure_pipx") as mock_ensure_pipx,
            patch("run.bootstrap.install_python_runtime_dependencies") as mock_install_python_runtime_dependencies,
            patch("run.bootstrap.install_twitter_cli") as mock_install_twitter_cli,
            patch("run.bootstrap.install_xreach_cli") as mock_install_xreach_cli,
            patch("run.bootstrap._print_step") as mock_print_step,
        ):
            result = bootstrap.main()

        self.assertEqual(result, 0)
        mock_ensure_pipx.assert_called_once_with()
        mock_install_python_runtime_dependencies.assert_called_once_with()
        mock_install_twitter_cli.assert_called_once_with()
        mock_install_xreach_cli.assert_called_once_with()
        self.assertGreaterEqual(mock_print_step.call_count, 2)


class InstallTests(unittest.TestCase):
    def test_ensure_no_args_rejects_extra_arguments(self) -> None:
        with patch.object(sys, "argv", ["install.py", "doctor"]):
            with self.assertRaisesRegex(SystemExit, "does not accept arguments"):
                install.ensure_no_args()

    def test_install_frontend_dependencies_prefers_npm_ci(self) -> None:
        with patch("install._resolve_command", return_value="C:/node/npm.cmd"), patch("install._run") as mock_run:
            install.install_frontend_dependencies()

        mock_run.assert_called_once_with(["C:/node/npm.cmd", "ci"], cwd=install.WEB_UI_DIR)


class DoctorTests(unittest.TestCase):
    def test_parse_args_supports_json_flag(self) -> None:
        args = doctor.parse_args([])
        self.assertFalse(args.json)
        args = doctor.parse_args(["--json"])
        self.assertTrue(args.json)

    def test_main_returns_zero_when_all_checks_pass(self) -> None:
        checks = [doctor.CheckResult(name="python", ok=True, detail="ok")]
        with patch("doctor.collect_checks", return_value=checks), patch("builtins.print"):
            self.assertEqual(doctor.main([]), 0)

    def test_main_returns_one_when_any_check_fails(self) -> None:
        checks = [
            doctor.CheckResult(name="python", ok=True, detail="ok"),
            doctor.CheckResult(name="docker", ok=False, detail="missing"),
        ]
        with patch("doctor.collect_checks", return_value=checks), patch("builtins.print"):
            self.assertEqual(doctor.main([]), 1)


class SchedulerTests(unittest.TestCase):
    def test_parse_args_honors_cli_flags(self) -> None:
        with patch.object(sys, "argv", ["scheduler.py", "--db-path", "tmp.db", "--env-file", "local.env", "--tick-seconds", "12"]):
            args = scheduler.parse_args()

        self.assertEqual(args.db_path, "tmp.db")
        self.assertEqual(args.env_file, "local.env")
        self.assertEqual(args.tick_seconds, 12)

    def test_main_runs_ticks_until_keyboard_interrupt(self) -> None:
        fake_service = Mock()
        fake_service.tick.side_effect = [{"triggered": 2, "failed": 1}, KeyboardInterrupt()]
        fake_signal = Mock()

        with (
            patch("run.scheduler.parse_args", return_value=argparse.Namespace(db_path="data/app.db", env_file=".env", tick_seconds=3)),
            patch("run.scheduler.DesktopService", return_value=fake_service) as mock_service_cls,
            patch("run.scheduler.signal.signal", fake_signal),
            patch("builtins.print") as mock_print,
            patch("run.scheduler.time.sleep") as mock_sleep,
        ):
            result = scheduler.main()

        self.assertEqual(result, 0)
        mock_service_cls.assert_called_once_with(db_path="data/app.db", env_file=".env")
        self.assertEqual(fake_service.tick.call_count, 2)
        mock_sleep.assert_called_once_with(3)
        self.assertEqual(fake_signal.call_count, 2)
        self.assertGreaterEqual(mock_print.call_count, 2)


class StaticWebServerTests(unittest.TestCase):
    def test_parse_args_honors_host_port_and_root(self) -> None:
        with patch.object(sys, "argv", ["static_web_server.py", "--host", "0.0.0.0", "--port", "6000", "--root", "web-ui/dist"]):
            args = static_web_server.parse_args()

        self.assertEqual(args.host, "0.0.0.0")
        self.assertEqual(args.port, 6000)
        self.assertEqual(args.root, "web-ui/dist")

    def test_main_rejects_missing_root_directory(self) -> None:
        with patch(
            "run.static_web_server.parse_args",
            return_value=argparse.Namespace(host="127.0.0.1", port=5178, root="missing-dist"),
        ):
            with self.assertRaisesRegex(RuntimeError, "root directory does not exist"):
                static_web_server.main()

    def test_main_binds_root_and_starts_server(self) -> None:
        server = Mock()
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text("<h1>ok</h1>", encoding="utf-8")
            with (
                patch(
                    "run.static_web_server.parse_args",
                    return_value=argparse.Namespace(host="127.0.0.1", port=5178, root=str(root)),
                ),
                patch("run.static_web_server.ThreadingHTTPServer", return_value=server) as mock_http_server,
                patch("builtins.print") as mock_print,
            ):
                result = static_web_server.main()

        self.assertEqual(result, 0)
        mock_http_server.assert_called_once_with(("127.0.0.1", 5178), static_web_server.StaticHandler)
        self.assertEqual(static_web_server.StaticHandler.root, root)
        server.serve_forever.assert_called_once_with()
        mock_print.assert_called_once()

    def test_static_handler_send_text_writes_utf8_response(self) -> None:
        handler = static_web_server.StaticHandler.__new__(static_web_server.StaticHandler)
        handler.wfile = io.BytesIO()
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()

        handler._send_text(static_web_server.HTTPStatus.NOT_FOUND, "not found")

        handler.send_response.assert_called_once_with(static_web_server.HTTPStatus.NOT_FOUND.value)
        handler.end_headers.assert_called_once_with()
        self.assertEqual(handler.wfile.getvalue(), b"not found")


if __name__ == "__main__":
    unittest.main()
