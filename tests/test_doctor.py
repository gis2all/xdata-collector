import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import doctor


class DoctorHelpersTests(unittest.TestCase):
    def test_collect_checks_reports_missing_env_file(self) -> None:
        with TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            with patch("doctor.PROJECT_ROOT", project_root):
                checks = doctor.collect_checks()

        env_check = next(check for check in checks if check.name == ".env")
        self.assertFalse(env_check.ok)
        self.assertIn("missing", env_check.detail.lower())

    def test_collect_checks_reports_missing_tokens_in_existing_env_file(self) -> None:
        with TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            (project_root / ".env").write_text("TWITTER_AUTH_TOKEN=\n", encoding="utf-8")
            with patch("doctor.PROJECT_ROOT", project_root):
                checks = doctor.collect_checks()

        env_check = next(check for check in checks if check.name == ".env")
        self.assertFalse(env_check.ok)
        self.assertIn("TWITTER_CT0", env_check.detail)

    def test_render_json_emits_machine_readable_payload(self) -> None:
        rendered = doctor.render_json([doctor.CheckResult(name="python", ok=True, detail="3.13")])
        payload = json.loads(rendered)
        self.assertEqual(payload["checks"][0]["name"], "python")
        self.assertTrue(payload["checks"][0]["ok"])


if __name__ == "__main__":
    unittest.main()
