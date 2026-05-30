from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_ci_workflow_uses_os_matrix_and_cross_platform_smoke_steps() -> None:
    workflow = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "strategy:" in workflow
    assert "matrix:" in workflow
    assert "windows-latest" in workflow
    assert "ubuntu-latest" in workflow
    assert "macos-latest" in workflow
    assert "python doctor.py" in workflow
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
