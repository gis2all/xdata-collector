import json
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_generate_coverage_badge_endpoint_json(tmp_path: Path) -> None:
    coverage_path = tmp_path / "coverage.json"
    output_path = tmp_path / "coverage-badge.json"

    coverage_path.write_text(
        json.dumps(
            {
                "totals": {
                    "percent_covered": 77.64575849682232,
                }
            }
        ),
        encoding="utf-8",
    )

    subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / ".github" / "scripts" / "generate_coverage_badge.py"),
            str(coverage_path),
            str(output_path),
        ],
        check=True,
        cwd=PROJECT_ROOT,
    )

    badge = json.loads(output_path.read_text(encoding="utf-8"))
    assert badge == {
        "schemaVersion": 1,
        "label": "backend coverage",
        "message": "77.65%",
        "color": "yellowgreen",
    }


def test_coverage_artifacts_are_configured_outside_repo_root() -> None:
    workflow = (PROJECT_ROOT / ".github" / "workflows" / "coverage-badge.yml").read_text(encoding="utf-8")
    ci_workflow = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    pyproject = (PROJECT_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    gitignore = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8")

    assert "runtime/tmp/coverage/coverage.json" in workflow
    assert "psutil" in workflow
    assert "publish-coverage-badge" not in ci_workflow
    assert 'data_file = "runtime/tmp/coverage/.coverage"' in pyproject
    assert ".coverage" in gitignore
    assert "coverage.json" in gitignore
