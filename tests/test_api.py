import http.client
import json
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer

from run.api import ApiHandler


class FakeService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def health(self) -> dict:
        self.calls.append(("health", None))
        return {
            "summary": {"updated_at": "2026-04-13T00:00:00+00:00", "source": "backend_snapshot"},
            "db": {"configured": True, "connected": True, "db_path": "data/app.db", "db_exists": True, "job_count": 1, "run_count": 2, "last_checked_at": "", "last_error": ""},
            "x": {"configured": True, "connected": True, "auth_source": "twitter-cli", "browser_hint": "default", "account_hint": "unknown", "last_checked_at": "", "last_error": ""},
        }

    def list_jobs(self, **kwargs) -> dict:
        self.calls.append(("list_jobs", kwargs))
        return {"page": kwargs["page"], "page_size": kwargs["page_size"], "total": 0, "items": []}

    def create_job(self, payload: dict) -> dict:
        self.calls.append(("create_job", payload))
        return {"id": 10, "name": payload.get("name", "")}

    def run_manual(self, payload: dict) -> dict:
        self.calls.append(("run_manual", payload))
        return {"status": "success", "payload": payload}

    def run_job_now(self, job_id: int) -> dict:
        self.calls.append(("run_job_now", job_id))
        return {"status": "success", "job_id": job_id}


@contextmanager
def serve(service: FakeService):
    ApiHandler.service = service
    server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


class ApiHandlerTests(unittest.TestCase):
    def request(
        self,
        server: ThreadingHTTPServer,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        conn = http.client.HTTPConnection(server.server_address[0], server.server_address[1], timeout=5)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            data = response.read()
            return response.status, dict(response.getheaders()), data
        finally:
            conn.close()

    def test_get_health_returns_json_and_cors_headers(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, headers, body = self.request(server, "GET", "/health")

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual(json.loads(body.decode("utf-8"))["summary"]["source"], "backend_snapshot")
        self.assertEqual(service.calls[0][0], "health")

    def test_get_jobs_passes_query_params_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/jobs?page=2&page_size=5&query=alpha&status=deleted")

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["page"], 2)
        self.assertEqual(
            service.calls[0],
            ("list_jobs", {"page": 2, "page_size": 5, "query": "alpha", "status": "deleted"}),
        )

    def test_post_manual_run_dispatches_payload(self) -> None:
        service = FakeService()
        payload = {"search_spec": {"all_keywords": ["btc"]}}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/manual/run",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["status"], "success")
        self.assertEqual(service.calls[0], ("run_manual", payload))

    def test_post_jobs_alias_dispatches_to_create_job(self) -> None:
        service = FakeService()
        payload = {"name": "alpha-watch", "interval_minutes": 30, "enabled": True}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/jobs",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["id"], 10)
        self.assertEqual(service.calls[0], ("create_job", payload))

    def test_post_job_run_alias_dispatches_to_run_job_now(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/jobs/42/run",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["job_id"], 42)
        self.assertEqual(service.calls[0], ("run_job_now", 42))

    def test_invalid_json_returns_bad_request(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/manual/run",
                body=b"{bad",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(body.decode("utf-8")))

    def test_unknown_route_returns_not_found(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/missing")

        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body.decode("utf-8"))["error"], "not found")


if __name__ == "__main__":
    unittest.main()
