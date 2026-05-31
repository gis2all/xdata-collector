import json
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

    assert set(API_ROUTES).issubset(documented)


def test_api_runtime_uses_flask_instead_of_stdlib_route_handler() -> None:
    source = (PROJECT_ROOT / "run" / "api.py").read_text(encoding="utf-8")

    assert "from flask import" in source
    assert "BaseHTTPRequestHandler" not in source
    assert "ThreadingHTTPServer" not in source
