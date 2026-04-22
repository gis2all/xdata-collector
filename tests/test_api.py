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

    def get_workspace(self) -> dict:
        self.calls.append(("get_workspace", None))
        return {
            "version": 2,
            "meta": {"updated_at": "2026-04-14T00:00:00+00:00", "next_job_id": 2},
            "environment": {"db_path": "data/app.db", "runtime_dir": "runtime", "env_file": ".env"},
            "jobs": [],
        }

    def update_workspace(self, payload: dict) -> dict:
        self.calls.append(("update_workspace", payload))
        return payload

    def import_workspace(self, payload: dict) -> dict:
        self.calls.append(("import_workspace", payload))
        return payload

    def export_workspace(self) -> dict:
        self.calls.append(("export_workspace", None))
        return {
            "version": 2,
            "meta": {"updated_at": "2026-04-14T00:00:00+00:00", "next_job_id": 2},
            "environment": {"db_path": "data/app.db", "runtime_dir": "runtime", "env_file": ".env"},
            "jobs": [],
        }

    def list_task_packs(self) -> dict:
        self.calls.append(("list_task_packs", None))
        return {"items": [{"pack_name": "alpha-watch", "pack_path": "config/packs/alpha-watch.json", "name": "Alpha Watch", "description": "watch alpha", "updated_at": "2026-04-14T00:00:00+00:00"}]}

    def get_task_pack(self, pack_name: str) -> dict:
        self.calls.append(("get_task_pack", pack_name))
        return {"pack_name": pack_name, "pack_path": f"config/packs/{pack_name}.json", "version": 1, "kind": "task_pack", "meta": {"name": "Alpha Watch", "description": "watch alpha", "updated_at": "2026-04-14T00:00:00+00:00"}, "search_spec": {"all_keywords": ["alpha"]}, "rule_set": {"id": 1, "name": "Default Rule Set", "description": "", "version": 1, "definition": {"levels": [], "rules": []}}}

    def create_task_pack(self, payload: dict) -> dict:
        self.calls.append(("create_task_pack", payload))
        return {"pack_name": "alpha-watch", **payload}

    def update_task_pack(self, pack_name: str, payload: dict) -> dict:
        self.calls.append(("update_task_pack", {"pack_name": pack_name, "payload": payload}))
        return {"pack_name": pack_name, **payload}

    def delete_task_pack(self, pack_name: str) -> dict:
        self.calls.append(("delete_task_pack", pack_name))
        return {"pack_name": pack_name, "deleted": 1}

    def list_runs(self, **kwargs) -> dict:
        self.calls.append(("list_runs", kwargs))
        return {"page": kwargs["page"], "page_size": kwargs["page_size"], "total": 1, "items": [{"id": 8, "status": "failed", "trigger_type": "manual", "job_id": None, "started_at": "2026-04-13T00:00:00+00:00", "ended_at": "2026-04-13T00:01:00+00:00", "error_text": "boom", "stats_json": {}}]}

    def get_runtime_logs(self) -> dict:
        self.calls.append(("get_runtime_logs", None))
        return {"items": [{"name": "api.current.out.log", "exists": True, "size": 7, "updated_at": "2026-04-13T00:00:00+00:00", "content": "api ok"}]}

    def health(self) -> dict:
        self.calls.append(("health", None))
        return {
            "summary": {"updated_at": "2026-04-13T00:00:00+00:00", "source": "backend_snapshot"},
            "db": {"configured": True, "connected": True, "db_path": "data/app.db", "db_exists": True, "job_count": 1, "run_count": 2, "last_checked_at": "", "last_error": ""},
            "x": {"configured": True, "connected": True, "auth_source": "twitter-cli", "account_hint": "unknown", "last_checked_at": "", "last_error": ""},
        }

    def health_snapshot(self) -> dict:
        self.calls.append(("health_snapshot", None))
        return {
            "summary": {"updated_at": "2026-04-12T00:00:00+00:00", "source": "runtime_snapshot"},
            "db": {"configured": True, "connected": True, "db_path": "data/app.db", "db_exists": True, "job_count": 1, "run_count": 2, "last_checked_at": "", "last_error": ""},
            "x": {"configured": True, "connected": True, "auth_source": "twitter-cli", "account_hint": "unknown", "last_checked_at": "", "last_error": ""},
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

    def batch_jobs(self, payload: dict) -> dict:
        self.calls.append(("batch_jobs", payload))
        total_targeted = len(payload.get("ids", [])) if "ids" in payload else 12
        return {
            "action": payload["action"],
            "mode": payload.get("mode", "ids"),
            "total_targeted": total_targeted,
            "succeeded": total_targeted,
            "failed": 0,
            "succeeded_ids": payload.get("ids", []),
            "failed_items": [],
        }

    def list_items(self, **kwargs) -> dict:
        self.calls.append(("list_items", kwargs))
        if kwargs.get("table") == "raw":
            return {
                "page": kwargs["page"],
                "page_size": kwargs["page_size"],
                "total": 1,
                "items": [
                    {
                        "id": 19,
                        "run_id": 8,
                        "tweet_id": "1900",
                        "canonical_url": "https://x.com/i/status/1900",
                        "author": "raw-demo",
                        "text": "raw alpha text",
                        "created_at_x": "2026-04-13T00:49:06+00:00",
                        "views": 100,
                        "likes": 10,
                        "replies": 2,
                        "retweets": 1,
                        "query_name": "manual:1",
                        "fetched_at": "2026-04-13T00:50:00+00:00",
                    }
                ],
            }
        return {
            "page": kwargs["page"],
            "page_size": kwargs["page_size"],
            "total": 1,
            "items": [
                {
                    "id": 9,
                    "run_id": 4,
                    "dedupe_key": "dup-9",
                    "level": "A",
                    "score": 88,
                    "title": "alpha",
                    "summary_zh": "summary",
                    "excerpt": "excerpt",
                    "is_zero_cost": 1,
                    "source_url": "https://x.com/demo/status/9",
                    "author": "demo",
                    "created_at_x": "2026-04-13T00:49:06+00:00",
                    "reasons_json": [],
                    "rule_set_id": 2,
                    "state": "new",
                }
            ],
        }

    def delete_item(self, item_id: int, table: str = "curated") -> dict:
        self.calls.append(("delete_item", {"id": item_id, "table": table}))
        return {"id": item_id, "deleted": 1}

    def delete_items(self, ids: list[int], table: str = "curated") -> dict:
        self.calls.append(("delete_items", {"ids": ids, "table": table}))
        return {"ids": ids, "deleted": len(ids)}

    def delete_items_matching(self, keyword: str | None = None, level: str | None = None, table: str = "curated") -> dict:
        self.calls.append(("delete_items_matching", {"keyword": keyword, "level": level, "table": table}))
        return {"ids": [], "deleted": 12}

    def dedupe_items(self, table: str = "curated") -> dict:
        self.calls.append(("dedupe_items", table))
        return {"groups": 2, "deleted": 3, "kept": 2, "rows_before": 10, "rows_after": 7}


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

    def test_get_health_snapshot_returns_json_and_cors_headers(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, headers, body = self.request(server, "GET", "/health/snapshot")

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertEqual(json.loads(body.decode("utf-8"))["summary"]["source"], "runtime_snapshot")
        self.assertEqual(service.calls[0][0], "health_snapshot")

    def test_options_allows_put_for_workspace_save(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, headers, _ = self.request(server, "OPTIONS", "/workspace")

        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        self.assertIn("PUT", headers["Access-Control-Allow-Methods"])

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

    def test_post_jobs_batch_dispatches_explicit_ids(self) -> None:
        service = FakeService()
        payload = {"action": "delete", "ids": [1, 2, 3]}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/jobs/batch",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        parsed = json.loads(body.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertEqual(parsed["action"], "delete")
        self.assertEqual(parsed["mode"], "ids")
        self.assertEqual(service.calls[0], ("batch_jobs", payload))

    def test_post_jobs_batch_dispatches_all_matching(self) -> None:
        service = FakeService()
        payload = {"action": "restore", "mode": "all_matching", "query": "alpha", "status": "deleted"}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/jobs/batch",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        parsed = json.loads(body.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertEqual(parsed["mode"], "all_matching")
        self.assertEqual(service.calls[0], ("batch_jobs", payload))

    def test_get_runs_returns_run_page(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/runs?page=2&page_size=10")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["page"], 2)
        self.assertEqual(payload["items"][0]["id"], 8)
        self.assertEqual(service.calls[0], ("list_runs", {"page": 2, "page_size": 10}))

    def test_get_runtime_logs_returns_snapshot_payload(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/logs/runtime")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["items"][0]["name"], "api.current.out.log")
        self.assertEqual(service.calls[0], ("get_runtime_logs", None))

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


    def test_get_workspace_returns_workspace_payload(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/workspace")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["environment"]["db_path"], "data/app.db")
        self.assertEqual(service.calls[0], ("get_workspace", None))

    def test_put_workspace_updates_workspace_payload(self) -> None:
        service = FakeService()
        payload = {"version": 2, "meta": {"updated_at": "2026-04-14T00:00:00+00:00", "next_job_id": 2}, "environment": {"db_path": "data/app.db", "runtime_dir": "runtime", "env_file": ".env"}, "jobs": []}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "PUT",
                "/workspace",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["environment"]["runtime_dir"], "runtime")
        self.assertEqual(service.calls[0], ("update_workspace", payload))

    def test_post_workspace_import_dispatches_payload(self) -> None:
        service = FakeService()
        payload = {"version": 2, "meta": {"updated_at": "2026-04-14T00:00:00+00:00", "next_job_id": 3}, "environment": {"db_path": "data/alt.db", "runtime_dir": "runtime", "env_file": ".env"}, "jobs": []}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/workspace/import",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["environment"]["db_path"], "data/alt.db")
        self.assertEqual(service.calls[0], ("import_workspace", payload))

    def test_get_workspace_export_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/workspace/export")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["version"], 2)
        self.assertEqual(service.calls[0], ("export_workspace", None))

    def test_get_task_packs_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/task-packs")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["items"][0]["pack_name"], "alpha-watch")
        self.assertEqual(service.calls[0], ("list_task_packs", None))

    def test_get_task_pack_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(server, "GET", "/task-packs/alpha-watch")

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["pack_name"], "alpha-watch")
        self.assertEqual(service.calls[0], ("get_task_pack", "alpha-watch"))

    def test_post_task_pack_dispatches_payload(self) -> None:
        service = FakeService()
        payload = {"meta": {"name": "Alpha Watch"}, "search_spec": {"all_keywords": ["alpha"]}, "rule_set": {"name": "Default Rule Set", "definition": {"levels": [], "rules": []}}}
        with serve(service) as server:
            status, _, body = self.request(server, "POST", "/task-packs", body=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["pack_name"], "alpha-watch")
        self.assertEqual(service.calls[0], ("create_task_pack", payload))

    def test_put_task_pack_dispatches_payload(self) -> None:
        service = FakeService()
        payload = {"meta": {"name": "Alpha Watch v2"}, "search_spec": {"all_keywords": ["alpha", "beta"]}, "rule_set": {"name": "Default Rule Set", "definition": {"levels": [], "rules": []}}}
        with serve(service) as server:
            status, _, body = self.request(server, "PUT", "/task-packs/alpha-watch", body=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["pack_name"], "alpha-watch")
        self.assertEqual(service.calls[0], ("update_task_pack", {"pack_name": "alpha-watch", "payload": payload}))

    def test_post_task_pack_delete_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/task-packs/alpha-watch/delete",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8")), {"pack_name": "alpha-watch", "deleted": 1})
        self.assertEqual(service.calls[0], ("delete_task_pack", "alpha-watch"))

    def test_get_items_supports_sorting_query_params(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "GET",
                "/items?page=2&page_size=15&keyword=airdrop&level=A&sort_by=score&sort_dir=asc",
            )

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["items"][0]["dedupe_key"], "dup-9")
        self.assertEqual(
            service.calls[0],
            (
                "list_items",
                {"page": 2, "page_size": 15, "level": "A", "keyword": "airdrop", "sort_by": "score", "sort_dir": "asc", "table": "curated"},
            ),
        )

    def test_get_items_supports_raw_table_query_param(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "GET",
                "/items?page=1&page_size=20&keyword=alpha&sort_by=views&sort_dir=desc&table=raw",
            )

        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload["items"][0]["tweet_id"], "1900")
        self.assertEqual(
            service.calls[0],
            (
                "list_items",
                {"page": 1, "page_size": 20, "level": None, "keyword": "alpha", "sort_by": "views", "sort_dir": "desc", "table": "raw"},
            ),
        )

    def test_post_item_delete_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/123/delete",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8")), {"id": 123, "deleted": 1})
        self.assertEqual(service.calls[0], ("delete_item", {"id": 123, "table": "curated"}))

    def test_post_item_delete_supports_raw_table(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/321/delete",
                body=json.dumps({"table": "raw"}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8")), {"id": 321, "deleted": 1})
        self.assertEqual(service.calls[0], ("delete_item", {"id": 321, "table": "raw"}))

    def test_post_items_delete_dispatches_selected_ids(self) -> None:
        service = FakeService()
        payload = {"ids": [3, 4, 5]}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/delete",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["deleted"], 3)
        self.assertEqual(service.calls[0], ("delete_items", {"ids": [3, 4, 5], "table": "curated"}))

    def test_post_items_delete_dispatches_all_matching_filter(self) -> None:
        service = FakeService()
        payload = {"mode": "all_matching", "keyword": "airdrop", "level": "A"}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/delete",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["deleted"], 12)
        self.assertEqual(
            service.calls[0],
            ("delete_items_matching", {"keyword": "airdrop", "level": "A", "table": "curated"}),
        )

    def test_post_items_delete_dispatches_raw_table(self) -> None:
        service = FakeService()
        payload = {"ids": [8, 9], "table": "raw"}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/delete",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["deleted"], 2)
        self.assertEqual(service.calls[0], ("delete_items", {"ids": [8, 9], "table": "raw"}))

    def test_post_items_delete_dispatches_raw_all_matching_filter(self) -> None:
        service = FakeService()
        payload = {"mode": "all_matching", "keyword": "alpha", "table": "raw"}
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/delete",
                body=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["deleted"], 12)
        self.assertEqual(
            service.calls[0],
            ("delete_items_matching", {"keyword": "alpha", "level": None, "table": "raw"}),
        )

    def test_post_items_dedupe_dispatches_to_service(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/dedupe",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["rows_after"], 7)
        self.assertEqual(service.calls[0], ("dedupe_items", "curated"))

    def test_post_items_dedupe_dispatches_raw_table(self) -> None:
        service = FakeService()
        with serve(service) as server:
            status, _, body = self.request(
                server,
                "POST",
                "/items/dedupe",
                body=json.dumps({"table": "raw"}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body.decode("utf-8"))["rows_after"], 7)
        self.assertEqual(service.calls[0], ("dedupe_items", "raw"))


if __name__ == "__main__":
    unittest.main()
