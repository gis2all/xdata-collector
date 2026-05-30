from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_ci_workflow_preserves_required_jobs_and_adds_cross_platform_smoke() -> None:
    workflow = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "backend:" in workflow
    assert "web-ui:" in workflow
    assert "native-smoke:" in workflow
    assert "strategy:" in workflow
    assert "matrix:" in workflow
    assert "windows-2022" in workflow
    assert "ubuntu-latest" in workflow
    assert "macos-latest" in workflow
    assert "python doctor.py --skip-docker" in workflow
    assert "Reset smoke state" in workflow
    assert "Path('data/app.db').unlink(missing_ok=True)" in workflow
    assert "shutil.rmtree('runtime', ignore_errors=True)" in workflow
    assert "python install.py" in workflow


def test_readme_documents_doctor_first_and_proxy_opt_in() -> None:
    readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")

    assert "python doctor.py" in readme
    assert "python install.py" in readme
    assert "python services.py start" in readme
    assert "DOCKER_PROXY_URL" in readme
    assert "未设置 `DOCKER_PROXY_URL` 时，不注入代理环境变量" in readme


def test_run_readme_and_claude_match_cross_platform_runtime_story() -> None:
    run_readme = (PROJECT_ROOT / "run" / "README.md").read_text(encoding="utf-8")
    claude = (PROJECT_ROOT / "CLAUDE.md").read_text(encoding="utf-8")

    assert "doctor.py" in run_readme
    assert "psutil" in run_readme
    assert "Windows / Linux / macOS" in claude
    assert "python doctor.py" in claude
    assert "DOCKER_PROXY_URL" in claude
