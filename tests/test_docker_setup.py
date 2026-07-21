import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _workflow_run_command_after_step(step_name: str) -> str:
    lines = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if line.strip() == f"- name: {step_name}":
            for candidate in lines[index + 1 :]:
                stripped = candidate.strip()
                if stripped.startswith("run: "):
                    return stripped.removeprefix("run: ").strip()
                if stripped.startswith("- name: "):
                    break
    raise AssertionError(f"run command for step {step_name!r} not found")


def test_docker_compose_declares_local_workbench_services() -> None:
    compose_path = PROJECT_ROOT / "docker-compose.yml"
    env_example_path = PROJECT_ROOT / ".env.example"

    assert compose_path.exists()
    assert env_example_path.exists()

    content = compose_path.read_text(encoding="utf-8")
    env_example = env_example_path.read_text(encoding="utf-8")
    for service_name in ("api:", "scheduler:", "web-ui:"):
        assert service_name in content
    assert '"127.0.0.1:8765:8765"' in content
    assert '"127.0.0.1:5177:5177"' in content
    assert '"8765:8765"' not in content
    assert '"5177:5177"' not in content
    assert "./data:/app/data" in content
    assert "./runtime:/app/runtime" in content
    assert "./config:/app/config" in content
    assert "./.env:/app/.env:ro" in content
    assert "working_dir: /app/web-ui" in content
    assert "DOCKER_PROXY_URL" in content
    assert "${DOCKER_PROXY_URL:+${DOCKER_PROXY_URL}}" in content
    assert "host.docker.internal:7897" not in content
    assert "NO_PROXY: localhost,127.0.0.1,api,scheduler,web-ui" in content
    assert "XDATA_API_TOKEN" in env_example
    assert "host-only" in env_example


def test_dockerfile_installs_backend_and_frontend_runtime_dependencies() -> None:
    dockerfile_path = PROJECT_ROOT / "Dockerfile"

    assert dockerfile_path.exists()

    content = dockerfile_path.read_text(encoding="utf-8")
    assert "AS web-builder" in content
    assert "AS runtime" in content
    assert "COPY --from=web-builder /build/web-ui/node_modules ./web-ui/node_modules" in content
    assert "COPY --from=web-builder /build/web-ui/dist ./web-ui/dist" in content
    assert "python:3.13-slim" in content
    assert "nodejs" in content
    assert " git " in content or " git \\" in content
    assert "-r requirements.txt" in content
    assert "npm ci" in content
    assert "git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7" in content
    assert "xreach-cli@0.3.0" in content
    assert "pipx install git+https://github.com/public-clis/twitter-cli.git\n" not in content
    assert "npm install -g xreach-cli\n" not in content
    assert "EXPOSE 8765 5177" in content


def test_native_smoke_failure_log_dump_command_executes() -> None:
    command = _workflow_run_command_after_step("Dump service logs on failure")
    assert command == "python .github/scripts/dump_service_logs.py"

    result = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=15,
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_bootstrap_installs_cli_tools_from_same_pinned_refs_as_dockerfile() -> None:
    bootstrap_path = PROJECT_ROOT / "run" / "bootstrap.py"

    assert bootstrap_path.exists()

    content = bootstrap_path.read_text(encoding="utf-8")
    assert "git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7" in content
    assert "git+https://github.com/public-clis/twitter-cli.git\"]" not in content
    assert "xreach-cli@0.3.0" in content
    assert "npm install -g xreach-cli\"]" not in content
