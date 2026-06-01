import json
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import doctor


class DoctorHelpersTests(unittest.TestCase):
    def test_collect_checks_includes_docker_checks_by_default(self) -> None:
        with (
            patch("doctor.check_python", return_value=doctor.CheckResult("python", True, "ok")) as mock_python,
            patch("doctor.check_node", return_value=doctor.CheckResult("node", True, "ok")),
            patch("doctor.check_npm", return_value=doctor.CheckResult("npm", True, "ok")),
            patch("doctor.check_pipx", return_value=doctor.CheckResult("pipx", True, "ok")),
            patch("doctor.check_twitter_cli", return_value=doctor.CheckResult("twitter-cli", True, "ok")),
            patch("doctor.check_xreach_cli", return_value=doctor.CheckResult("xreach-cli", True, "ok")),
            patch("doctor.check_env_file", return_value=doctor.CheckResult(".env", True, "ok")),
            patch("doctor.check_docker_cli", return_value=doctor.CheckResult("docker-cli", True, "ok")),
            patch("doctor.check_docker_daemon", return_value=doctor.CheckResult("docker-daemon", True, "ok")),
            patch("doctor.check_ports", return_value=doctor.CheckResult("ports", True, "ok")),
        ):
            checks = doctor.collect_checks()

        self.assertEqual(
            [check.name for check in checks],
            ["python", "node", "npm", "pipx", "twitter-cli", "xreach-cli", ".env", "docker-cli", "docker-daemon", "ports"],
        )
        mock_python.assert_called_once_with()

    def test_collect_checks_reports_missing_env_file(self) -> None:
        with TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            with patch("doctor.PROJECT_ROOT", project_root):
                checks = doctor.collect_checks(skip_docker=True)

        env_check = next(check for check in checks if check.name == ".env")
        self.assertFalse(env_check.ok)
        self.assertIn("missing", env_check.detail.lower())

    def test_collect_checks_reports_missing_tokens_in_existing_env_file(self) -> None:
        with TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            (project_root / ".env").write_text("TWITTER_AUTH_TOKEN=\n", encoding="utf-8")
            with patch("doctor.PROJECT_ROOT", project_root):
                checks = doctor.collect_checks(skip_docker=True)

        env_check = next(check for check in checks if check.name == ".env")
        self.assertFalse(env_check.ok)
        self.assertIn("TWITTER_CT0", env_check.detail)

    def test_check_env_file_accepts_required_tokens_and_ignores_comments(self) -> None:
        with TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            (project_root / ".env").write_text(
                "# ignored\nTWITTER_AUTH_TOKEN=token\nMALFORMED\nTWITTER_CT0=ct0\n",
                encoding="utf-8",
            )
            with patch("doctor.PROJECT_ROOT", project_root):
                result = doctor.check_env_file()

        self.assertTrue(result.ok)
        self.assertIn("present", result.detail)

    def test_cli_checks_report_missing_commands(self) -> None:
        with patch("doctor._resolve_command", return_value=None):
            self.assertEqual(doctor.check_npm().detail, "missing from PATH")
            self.assertEqual(doctor.check_twitter_cli().detail, "missing from PATH")
            self.assertEqual(doctor.check_xreach_cli().detail, "missing from PATH")
            self.assertEqual(doctor.check_docker_daemon().detail, "docker CLI missing")

    def test_check_docker_daemon_handles_timeout(self) -> None:
        timeout = subprocess.TimeoutExpired(["docker", "info"], timeout=10)
        with patch("doctor._resolve_command", return_value="docker"), patch(
            "doctor.subprocess.run",
            side_effect=timeout,
        ):
            result = doctor.check_docker_daemon()

        self.assertFalse(result.ok)
        self.assertIn("timed out", result.detail)

    def test_check_docker_daemon_reports_os_error_failed_status_and_success(self) -> None:
        with patch("doctor._resolve_command", return_value="docker"), patch(
            "doctor.subprocess.run",
            side_effect=OSError("denied"),
        ):
            self.assertEqual(doctor.check_docker_daemon().detail, "denied")

        failed = Mock(returncode=1, stdout="", stderr="daemon down")
        with patch("doctor._resolve_command", return_value="docker"), patch("doctor.subprocess.run", return_value=failed):
            result = doctor.check_docker_daemon()
        self.assertFalse(result.ok)
        self.assertEqual(result.detail, "daemon down")

        succeeded = Mock(returncode=0, stdout="25.0.0\n", stderr="")
        with patch("doctor._resolve_command", return_value="docker"), patch("doctor.subprocess.run", return_value=succeeded):
            result = doctor.check_docker_daemon()
        self.assertTrue(result.ok)
        self.assertEqual(result.detail, "25.0.0")

    def test_check_ports_reports_busy_and_available_ports(self) -> None:
        with patch("doctor._is_port_open", side_effect=[True, False]):
            result = doctor.check_ports()
        self.assertFalse(result.ok)
        self.assertIn(str(doctor.API_PORT), result.detail)

        with patch("doctor._is_port_open", side_effect=[False, False]):
            result = doctor.check_ports()
        self.assertTrue(result.ok)

    def test_render_json_emits_machine_readable_payload(self) -> None:
        rendered = doctor.render_json([doctor.CheckResult(name="python", ok=True, detail="3.13")])
        payload = json.loads(rendered)
        self.assertEqual(payload["checks"][0]["name"], "python")
        self.assertTrue(payload["checks"][0]["ok"])

    def test_render_text_marks_success_and_failure(self) -> None:
        rendered = doctor.render_text(
            [
                doctor.CheckResult(name="python", ok=True, detail="3.13"),
                doctor.CheckResult(name="docker", ok=False, detail="missing"),
            ]
        )

        self.assertIn("[OK] python: 3.13", rendered)
        self.assertIn("[FAIL] docker: missing", rendered)

    def test_check_command_version_handles_missing_timeout_error_failure_and_success(self) -> None:
        with patch("doctor._resolve_command", return_value=None):
            result = doctor._check_command_version("tool", ["tool", "--version"], candidates=("tool",))
        self.assertFalse(result.ok)
        self.assertEqual(result.detail, "missing from PATH")

        with patch("doctor.subprocess.run", side_effect=subprocess.TimeoutExpired(["tool"], timeout=10)):
            result = doctor._check_command_version("tool", ["tool"])
        self.assertEqual(result.detail, "command timed out")

        with patch("doctor.subprocess.run", side_effect=OSError("boom")):
            result = doctor._check_command_version("tool", ["tool"])
        self.assertEqual(result.detail, "boom")

        failed = Mock(returncode=1, stdout="", stderr="bad version")
        with patch("doctor.subprocess.run", return_value=failed):
            result = doctor._check_command_version("tool", ["tool"])
        self.assertFalse(result.ok)
        self.assertEqual(result.detail, "bad version")

        succeeded = Mock(returncode=0, stdout="1.2.3\n", stderr="")
        with patch("doctor.subprocess.run", return_value=succeeded):
            result = doctor._check_command_version("tool", ["tool"])
        self.assertTrue(result.ok)
        self.assertEqual(result.detail, "1.2.3")

    def test_resolve_command_supports_empty_absolute_and_path_candidates(self) -> None:
        with TemporaryDirectory() as tmp:
            executable = Path(tmp) / "tool.exe"
            executable.write_text("", encoding="utf-8")
            self.assertEqual(doctor._resolve_command("", str(executable)), str(executable))

        with patch("doctor.shutil.which", side_effect=[None, "C:/bin/tool.exe"]):
            self.assertEqual(doctor._resolve_command("missing", "tool"), "C:/bin/tool.exe")

        with patch("doctor.shutil.which", return_value=None):
            self.assertIsNone(doctor._resolve_command("missing"))

    def test_read_env_values_trims_keys_values_and_skips_non_assignments(self) -> None:
        with TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text("\n# comment\nBAD_LINE\n KEY = value with spaces \n", encoding="utf-8")

            values = doctor._read_env_values(env_file)

        self.assertEqual(values, {"KEY": "value with spaces"})


if __name__ == "__main__":
    unittest.main()
