from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_docker_compose_declares_local_workbench_services() -> None:
    compose_path = PROJECT_ROOT / "docker-compose.yml"

    assert compose_path.exists()

    content = compose_path.read_text(encoding="utf-8")
    for service_name in ("api:", "scheduler:", "web-ui:"):
        assert service_name in content
    assert '"8765:8765"' in content
    assert '"5177:5177"' in content
    assert "./data:/app/data" in content
    assert "./runtime:/app/runtime" in content
    assert "./config:/app/config" in content
    assert "./.env:/app/.env:ro" in content
    assert "working_dir: /app/web-ui" in content
    assert "host.docker.internal:7897" in content
    assert "DOCKER_PROXY_URL" in content
    assert "HTTP_PROXY: ${DOCKER_PROXY_URL:-http://host.docker.internal:7897}" in content
    assert "HTTPS_PROXY: ${DOCKER_PROXY_URL:-http://host.docker.internal:7897}" in content
    assert "ALL_PROXY: ${DOCKER_PROXY_URL:-http://host.docker.internal:7897}" in content
    assert "NO_PROXY: localhost,127.0.0.1,api,scheduler,web-ui" in content


def test_dockerfile_installs_backend_and_frontend_runtime_dependencies() -> None:
    dockerfile_path = PROJECT_ROOT / "Dockerfile"

    assert dockerfile_path.exists()

    content = dockerfile_path.read_text(encoding="utf-8")
    assert "python:3.13-slim" in content
    assert "nodejs" in content
    assert "npm ci" in content
    assert "git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7" in content
    assert "xreach-cli@0.3.0" in content
    assert "pipx install git+https://github.com/public-clis/twitter-cli.git\n" not in content
    assert "npm install -g xreach-cli\n" not in content
    assert "EXPOSE 8765 5177" in content


def test_bootstrap_installs_twitter_cli_from_github_main() -> None:
    bootstrap_path = PROJECT_ROOT / "run" / "bootstrap.py"

    assert bootstrap_path.exists()

    content = bootstrap_path.read_text(encoding="utf-8")
    assert "git+https://github.com/public-clis/twitter-cli.git" in content
