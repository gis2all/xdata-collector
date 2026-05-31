from __future__ import annotations

import argparse
import json
import os
import sys
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from flask import Flask, Response, request

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector_service import DesktopService
from backend.models import RequestTooLarge

MAX_BODY_SIZE = 10 * 1024 * 1024

API_ROUTES: tuple[tuple[str, str], ...] = (
    ("GET", "/workspace"),
    ("GET", "/workspace/export"),
    ("PUT", "/workspace"),
    ("POST", "/workspace/import"),
    ("GET", "/task-packs"),
    ("POST", "/task-packs"),
    ("GET", "/task-packs/{pack_name}"),
    ("PUT", "/task-packs/{pack_name}"),
    ("POST", "/task-packs/{pack_name}/delete"),
    ("GET", "/health"),
    ("GET", "/health/snapshot"),
    ("GET", "/jobs"),
    ("POST", "/jobs"),
    ("POST", "/jobs/create"),
    ("POST", "/jobs/batch"),
    ("GET", "/jobs/{job_id}"),
    ("POST", "/jobs/{job_id}/update"),
    ("POST", "/jobs/{job_id}/toggle"),
    ("POST", "/jobs/{job_id}/run-now"),
    ("POST", "/jobs/{job_id}/run"),
    ("POST", "/jobs/{job_id}/delete"),
    ("POST", "/jobs/{job_id}/restore"),
    ("POST", "/jobs/{job_id}/purge"),
    ("GET", "/rule-sets"),
    ("POST", "/rule-sets"),
    ("GET", "/rule-sets/{rule_set_id}"),
    ("POST", "/rule-sets/{rule_set_id}/clone"),
    ("POST", "/rule-sets/{rule_set_id}/update"),
    ("POST", "/rule-sets/{rule_set_id}/delete"),
    ("GET", "/runs"),
    ("GET", "/runs/{run_id}"),
    ("POST", "/runs/{run_id}/cancel"),
    ("GET", "/logs/runtime"),
    ("GET", "/items"),
    ("POST", "/items/query"),
    ("POST", "/items/delete"),
    ("POST", "/items/dedupe"),
    ("POST", "/items/{item_id}/delete"),
    ("POST", "/scheduler/tick"),
)


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Web API facade for X collector")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db-path", default=str(Path("data") / "app.db"))
    parser.add_argument("--env-file", default=".env")
    return parser.parse_args()


def _path_segments(path: str) -> list[str]:
    return [segment for segment in path.split("/") if segment]


def _path_segment(path: str, index: int) -> str:
    return _path_segments(path)[index]


def _path_int_segment(path: str, index: int) -> int:
    return int(_path_segment(path, index))


def _query_int(query: dict[str, list[str]], name: str, default: int) -> int:
    raw = query.get(name, [str(default)])[0]
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_request", f"{name} must be an integer") from exc


def _is_allowed_origin(origin: str) -> bool:
    parsed = urlparse(origin)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"}:
        return False
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    return host.endswith(".localhost")


def _query_args() -> dict[str, list[str]]:
    return {key: request.args.getlist(key) for key in request.args.keys()}


def _json_response(payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> Response:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    response = Response(body, status=status.value, content_type="application/json; charset=utf-8")
    response.headers["Content-Length"] = str(len(body))
    return response


def _json_error(status: HTTPStatus, code: str, message: str) -> Response:
    return _json_response({"error": {"code": code, "message": message}}, status=status)


def _apply_cors_headers(response: Response) -> Response:
    origin = request.headers.get("Origin")
    if origin is None:
        return response
    if _is_allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-XData-API-Token"
    return response


def _read_json_body() -> dict[str, Any]:
    length = request.content_length or 0
    if length > MAX_BODY_SIZE:
        raise RequestTooLarge("request body too large")
    raw = request.get_data(cache=False) if length > 0 else b"{}"
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def _require_auth(api_token: str | None) -> None:
    if not api_token:
        return
    authorization = request.headers.get("Authorization", "")
    header_token = request.headers.get("X-XData-API-Token", "")
    if authorization == f"Bearer {api_token}" or header_token == api_token:
        return
    raise ApiError(HTTPStatus.UNAUTHORIZED, "unauthorized", "unauthorized")


def _dispatch_get(service: DesktopService, path: str) -> Response:
    if path == "/workspace":
        return _json_response(service.get_workspace())
    if path == "/workspace/export":
        return _json_response(service.export_workspace())
    if path == "/task-packs":
        return _json_response(service.list_task_packs())
    if path.startswith("/task-packs/"):
        pack_name = _path_segment(path, 1)
        return _json_response(service.get_task_pack(pack_name))
    if path == "/health":
        return _json_response(service.health())
    if path == "/health/snapshot":
        return _json_response(service.health_snapshot())
    if path == "/jobs":
        q = _query_args()
        page = _query_int(q, "page", 1)
        page_size = _query_int(q, "page_size", 20)
        query = q.get("query", [None])[0]
        status = q.get("status", ["active"])[0]
        return _json_response(service.list_jobs(page=page, page_size=page_size, query=query, status=status))
    if path == "/rule-sets":
        return _json_response(service.list_rule_sets())
    if path.startswith("/rule-sets/"):
        rule_set_id = _path_int_segment(path, 1)
        return _json_response(service.get_rule_set(rule_set_id))
    if path.startswith("/jobs/"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.get_job(job_id))
    if path == "/runs":
        q = _query_args()
        page = _query_int(q, "page", 1)
        page_size = _query_int(q, "page_size", 50)
        return _json_response(service.list_runs(page=page, page_size=page_size))
    if path.startswith("/runs/"):
        run_id = _path_int_segment(path, 1)
        return _json_response(service.get_run(run_id))
    if path == "/logs/runtime":
        return _json_response(service.get_runtime_logs())
    if path == "/items":
        q = _query_args()
        page = _query_int(q, "page", 1)
        page_size = _query_int(q, "page_size", 50)
        level = q.get("level", [None])[0]
        keyword = q.get("keyword", [None])[0]
        sort_by = q.get("sort_by", [None])[0]
        sort_dir = q.get("sort_dir", [None])[0]
        table = q.get("table", ["curated"])[0]
        return _json_response(
            service.list_items(
                page=page,
                page_size=page_size,
                level=level,
                keyword=keyword,
                sort_by=sort_by,
                sort_dir=sort_dir,
                table=table,
            )
        )
    return _json_error(HTTPStatus.NOT_FOUND, "not_found", "not found")


def _dispatch_put(service: DesktopService, path: str, payload: dict[str, Any]) -> Response:
    if path == "/workspace":
        return _json_response(service.update_workspace(payload))
    if path.startswith("/task-packs/"):
        pack_name = _path_segment(path, 1)
        return _json_response(service.update_task_pack(pack_name, payload))
    return _json_error(HTTPStatus.NOT_FOUND, "not_found", "not found")


def _dispatch_post(service: DesktopService, path: str, payload: dict[str, Any]) -> Response:
    if path == "/workspace/import":
        return _json_response(service.import_workspace(payload))
    if path == "/task-packs":
        return _json_response(service.create_task_pack(payload))
    if path.startswith("/task-packs/") and path.endswith("/delete"):
        pack_name = _path_segment(path, 1)
        return _json_response(service.delete_task_pack(pack_name))
    if path == "/manual/run":
        return _json_response(service.run_manual(payload))
    if path == "/manual/run/start":
        return _json_response(service.start_manual_run(payload))
    if path in {"/jobs", "/jobs/create"}:
        return _json_response(service.create_job(payload))
    if path == "/jobs/batch":
        return _json_response(service.batch_jobs(payload))
    if path == "/rule-sets":
        return _json_response(service.create_rule_set(payload))
    if path.startswith("/rule-sets/") and path.endswith("/clone"):
        rule_set_id = _path_int_segment(path, 1)
        return _json_response(service.clone_rule_set(rule_set_id))
    if path.startswith("/rule-sets/") and path.endswith("/update"):
        rule_set_id = _path_int_segment(path, 1)
        return _json_response(service.update_rule_set(rule_set_id, payload))
    if path.startswith("/rule-sets/") and path.endswith("/delete"):
        rule_set_id = _path_int_segment(path, 1)
        return _json_response(service.delete_rule_set(rule_set_id))
    if path.startswith("/jobs/") and path.endswith("/update"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.update_job(job_id, payload))
    if path.startswith("/jobs/") and path.endswith("/toggle"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.toggle_job(job_id, bool(payload.get("enabled", False))))
    if path.startswith("/jobs/") and (path.endswith("/run-now") or path.endswith("/run")):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.run_job_now(job_id))
    if path.startswith("/runs/") and path.endswith("/cancel"):
        run_id = _path_int_segment(path, 1)
        return _json_response(service.cancel_run(run_id))
    if path.startswith("/jobs/") and path.endswith("/delete"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.delete_job(job_id))
    if path.startswith("/jobs/") and path.endswith("/restore"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.restore_job(job_id))
    if path.startswith("/jobs/") and path.endswith("/purge"):
        job_id = _path_int_segment(path, 1)
        return _json_response(service.purge_job(job_id))
    if path == "/items/delete":
        table = payload.get("table", "curated")
        if payload.get("mode") == "all_matching":
            return _json_response(
                service.delete_items_matching(
                    keyword=payload.get("keyword"),
                    level=payload.get("level"),
                    table=table,
                    filter_tree=payload.get("filter_tree"),
                )
            )
        return _json_response(service.delete_items(payload.get("ids", []), table=table))
    if path == "/items/dedupe":
        return _json_response(service.dedupe_items(table=payload.get("table", "curated")))
    if path == "/items/query":
        return _json_response(
            service.list_items(
                page=int(payload.get("page", 1) or 1),
                page_size=int(payload.get("page_size", 50) or 50),
                level=payload.get("level"),
                keyword=payload.get("keyword"),
                sort_by=payload.get("sort_by"),
                sort_dir=payload.get("sort_dir"),
                table=str(payload.get("table", "curated")),
                filter_tree=payload.get("filter_tree"),
            )
        )
    if path.startswith("/items/") and path.endswith("/delete"):
        item_id = _path_int_segment(path, 1)
        return _json_response(service.delete_item(item_id, table=payload.get("table", "curated")))
    if path == "/scheduler/tick":
        return _json_response(service.tick())
    return _json_error(HTTPStatus.NOT_FOUND, "not_found", "not found")


def create_app(*, service: DesktopService | None = None, api_token: str | None = None) -> Flask:
    resolved_service = service or DesktopService()
    resolved_api_token = api_token if api_token is not None else os.environ.get("XDATA_API_TOKEN") or None

    app = Flask(__name__)

    @app.after_request
    def _after_request(response: Response) -> Response:
        return _apply_cors_headers(response)

    @app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "OPTIONS"])
    @app.route("/<path:path>", methods=["GET", "POST", "PUT", "OPTIONS"])
    def dispatch(path: str) -> Response:
        full_path = f"/{path}" if path else "/"
        if request.method == "OPTIONS":
            response = Response(status=HTTPStatus.NO_CONTENT.value)
            response.headers["Content-Length"] = "0"
            return _apply_cors_headers(response)
        try:
            _require_auth(resolved_api_token)
            if request.method == "GET":
                return _dispatch_get(resolved_service, full_path)
            if request.method == "PUT":
                return _dispatch_put(resolved_service, full_path, _read_json_body())
            if request.method == "POST":
                return _dispatch_post(resolved_service, full_path, _read_json_body())
            return _json_error(HTTPStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "method not allowed")
        except ApiError as exc:
            return _json_error(exc.status, exc.code, exc.message)
        except json.JSONDecodeError:
            return _json_error(HTTPStatus.BAD_REQUEST, "invalid_json", "invalid json")
        except (IndexError, ValueError):
            return _json_error(HTTPStatus.NOT_FOUND, "not_found", "not found")
        except FileNotFoundError as exc:
            return _json_error(HTTPStatus.NOT_FOUND, "not_found", str(exc))
        except RequestTooLarge as exc:
            return _json_error(HTTPStatus.CONTENT_TOO_LARGE, "request_too_large", str(exc))
        except Exception:  # noqa: BLE001
            return _json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "internal_server_error", "internal server error")

    return app


def main() -> int:
    args = parse_args()
    service = DesktopService(db_path=args.db_path, env_file=args.env_file)
    app = create_app(service=service, api_token=os.environ.get("XDATA_API_TOKEN") or None)
    print(f"[api] listening on http://{args.host}:{args.port}")
    try:
        app.run(host=args.host, port=args.port, threaded=True, use_reloader=False)
    finally:
        service.request_background_shutdown()
        service.join_background_runs(timeout=10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
