# Local API

The local desktop API is served by `run/api.py` on `http://127.0.0.1:8765`.

- OpenAPI: [`openapi.json`](./openapi.json)
- Optional auth: set `XDATA_API_TOKEN`, then send either `Authorization: Bearer <token>` or `X-XData-API-Token: <token>`.
- CORS: browser origins are limited to loopback origins such as `localhost`, `127.0.0.1`, and `*.localhost`.

The API now runs on Flask, but route inventory, integer query validation, structured errors, CORS, and optional token auth remain explicit so the contract stays stable.
