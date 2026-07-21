import json
import re
from pathlib import Path

from run.api import API_ROUTES


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_openapi_document_covers_declared_api_routes() -> None:
    payload = json.loads((PROJECT_ROOT / "docs" / "api" / "openapi.json").read_text(encoding="utf-8"))

    assert payload["openapi"].startswith("3.")
    assert payload["components"]["schemas"]["ApiError"]["properties"]["error"]
    assert "LocalBearerToken" in payload["components"]["securitySchemes"]
    documented = {
        (method.upper(), path)
        for path, methods in payload["paths"].items()
        for method in methods
    }

    assert set(API_ROUTES) == documented


def test_manual_run_routes_are_declared_in_api_routes() -> None:
    assert ("POST", "/manual/run") not in API_ROUTES
    assert ("POST", "/manual/run/start") in API_ROUTES


def test_api_runtime_uses_flask_instead_of_stdlib_route_handler() -> None:
    source = (PROJECT_ROOT / "run" / "api.py").read_text(encoding="utf-8")

    assert "from flask import" in source
    assert "BaseHTTPRequestHandler" not in source
    assert "ThreadingHTTPServer" not in source


def test_setup_and_review_docs_match_current_local_workbench_contract() -> None:
    readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
    review = (PROJECT_ROOT / "docs" / "review-issues.md").read_text(encoding="utf-8")
    setup_docs = [
        readme,
        (PROJECT_ROOT / "run" / "README.md").read_text(encoding="utf-8"),
        (PROJECT_ROOT / "web-ui" / "README.md").read_text(encoding="utf-8"),
        (PROJECT_ROOT / "docs" / "api" / "README.md").read_text(encoding="utf-8"),
    ]
    handbook = (PROJECT_ROOT / "CLAUDE.md").read_text(encoding="utf-8")

    assert len(re.findall(r"^- `python install\.py`", readme, flags=re.MULTILINE)) == 1
    assert "collector_service_impl.py" not in review
    assert "152 passed" not in review
    assert "collector_service_parts" in review
    for content in setup_docs:
        assert "XDATA_API_TOKEN" in content
        assert "127.0.0.1" in content
    for fixed_text in ("Windows / Linux / macOS", "python doctor.py", "DOCKER_PROXY_URL"):
        assert fixed_text in handbook
