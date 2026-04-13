from __future__ import annotations

import argparse
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the built web UI dist directory")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5178)
    parser.add_argument("--root", required=True)
    return parser.parse_args()


class StaticHandler(BaseHTTPRequestHandler):
    root: Path

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            rel = unquote(parsed.path.lstrip("/"))
            if not rel:
                rel = "index.html"
            target = (self.root / rel).resolve()
            root = self.root.resolve()
            if root not in target.parents and target != root:
                self._send_text(HTTPStatus.FORBIDDEN, "forbidden")
                return
            if target.is_dir():
                target = target / "index.html"
            if not target.exists() or not target.is_file():
                self._send_text(HTTPStatus.NOT_FOUND, "not found")
                return
            body = target.read_bytes()
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self.send_response(HTTPStatus.OK.value)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001
            self._send_text(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _send_text(self, status: HTTPStatus, text: str) -> None:
        body = text.encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    args = parse_args()
    root = Path(args.root)
    if not root.exists():
        raise RuntimeError(f"root directory does not exist: {root}")
    StaticHandler.root = root
    server = ThreadingHTTPServer((args.host, args.port), StaticHandler)
    print(f"[static_web_server] listening on http://{args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
