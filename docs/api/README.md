# Local API

The local desktop API is served by `run/api.py` on `http://127.0.0.1:8765`. Native services and Docker Compose are host-only; Compose publishes the API and Web UI on `127.0.0.1`, not on LAN interfaces.

- OpenAPI: [`openapi.json`](./openapi.json)
- Optional auth: set `XDATA_API_TOKEN`, then send either `Authorization: Bearer <token>` or `X-XData-API-Token: <token>`. The Web UI accepts this value in Settings, stores it only in the current browser session's `sessionStorage`, and sends it as Bearer auth.
- CORS: browser origins are limited to loopback origins such as `localhost`, `127.0.0.1`, and `*.localhost`.

The API now runs on Flask, but route inventory, integer query validation, structured errors, CORS, and optional token auth remain explicit so the contract stays stable.
