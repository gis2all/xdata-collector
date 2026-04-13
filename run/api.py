from __future__ import annotations

import argparse
import json
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.collector_service import DesktopService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Web API facade for X collector")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db-path", default=str(Path("data") / "app.db"))
    parser.add_argument("--env-file", default=".env")
    return parser.parse_args()


class ApiHandler(BaseHTTPRequestHandler):
    service: DesktopService

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT.value)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                self._json(HTTPStatus.OK, self.service.health())
                return
            if parsed.path == "/jobs":
                q = parse_qs(parsed.query)
                page = int(q.get("page", ["1"])[0])
                page_size = int(q.get("page_size", ["20"])[0])
                query = q.get("query", [None])[0]
                status = q.get("status", ["active"])[0]
                self._json(
                    HTTPStatus.OK,
                    self.service.list_jobs(page=page, page_size=page_size, query=query, status=status),
                )
                return
            if parsed.path == "/rule-sets":
                self._json(HTTPStatus.OK, self.service.list_rule_sets())
                return
            if parsed.path.startswith("/rule-sets/"):
                rule_set_id = int(parsed.path.split("/")[-1])
                self._json(HTTPStatus.OK, self.service.get_rule_set(rule_set_id))
                return
            if parsed.path.startswith("/jobs/"):
                job_id = int(parsed.path.split("/")[-1])
                self._json(HTTPStatus.OK, self.service.get_job(job_id))
                return
            if parsed.path == "/runs":
                q = parse_qs(parsed.query)
                page = int(q.get("page", ["1"])[0])
                page_size = int(q.get("page_size", ["50"])[0])
                self._json(HTTPStatus.OK, self.service.list_runs(page=page, page_size=page_size))
                return
            if parsed.path.startswith("/runs/"):
                run_id = int(parsed.path.split("/")[-1])
                self._json(HTTPStatus.OK, self.service.get_run(run_id))
                return
            if parsed.path == "/logs/runtime":
                self._json(HTTPStatus.OK, self.service.get_runtime_logs())
                return
            if parsed.path == "/items":
                q = parse_qs(parsed.query)
                page = int(q.get("page", ["1"])[0])
                page_size = int(q.get("page_size", ["50"])[0])
                level = q.get("level", [None])[0]
                keyword = q.get("keyword", [None])[0]
                self._json(
                    HTTPStatus.OK,
                    self.service.list_items(page=page, page_size=page_size, level=level, keyword=keyword),
                )
                return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self._read_json()
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/manual/run":
                self._json(HTTPStatus.OK, self.service.run_manual(payload))
                return
            if path in {"/jobs", "/jobs/create"}:
                self._json(HTTPStatus.OK, self.service.create_job(payload))
                return
            if path == "/rule-sets":
                self._json(HTTPStatus.OK, self.service.create_rule_set(payload))
                return
            if path.startswith("/rule-sets/") and path.endswith("/clone"):
                rule_set_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.clone_rule_set(rule_set_id))
                return
            if path.startswith("/rule-sets/") and path.endswith("/update"):
                rule_set_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.update_rule_set(rule_set_id, payload))
                return
            if path.startswith("/rule-sets/") and path.endswith("/delete"):
                rule_set_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.delete_rule_set(rule_set_id))
                return
            if path.startswith("/jobs/") and path.endswith("/update"):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.update_job(job_id, payload))
                return
            if path.startswith("/jobs/") and path.endswith("/toggle"):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.toggle_job(job_id, bool(payload.get("enabled", False))))
                return
            if path.startswith("/jobs/") and (path.endswith("/run-now") or path.endswith("/run")):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.run_job_now(job_id))
                return
            if path.startswith("/jobs/") and path.endswith("/delete"):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.delete_job(job_id))
                return
            if path.startswith("/jobs/") and path.endswith("/restore"):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.restore_job(job_id))
                return
            if path.startswith("/jobs/") and path.endswith("/purge"):
                job_id = int(path.split("/")[2])
                self._json(HTTPStatus.OK, self.service.purge_job(job_id))
                return
            if path == "/scheduler/tick":
                self._json(HTTPStatus.OK, self.service.tick())
                return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _set_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def main() -> int:
    args = parse_args()
    service = DesktopService(db_path=args.db_path, env_file=args.env_file)
    ApiHandler.service = service
    server = ThreadingHTTPServer((args.host, args.port), ApiHandler)
    print(f"[api] listening on http://{args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
