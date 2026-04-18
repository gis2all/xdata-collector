# XData Collector 协作说明

## 一句话定位

这个仓库是一个本地运行的 X 数据采集与规则筛选工作台。

## 当前事实

- 主目录是 `web-ui/`、`backend/`、`run/`
- 配置分两层：`config/workspace.json` + `config/packs/*.json`
- `workspace.json` 只保留 `environment` 和 `jobs registry`
- `search_spec` / `rule_set` 正文放在 `config/packs/*.json`
- 运行态改为文件持久化：
  - `runtime/history/search_runs.jsonl`
  - `runtime/state/runtime_health_snapshot.json`
  - `runtime/state/sequences.json`
- SQLite 只保留搜索结果表：`x_items_raw` 和 `x_items_curated`
- `data/` 目录正式保留 `app.db` 和 `data/README.md`
- X 采集仍然依赖 `.env` 中的 `TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`

## 主链路

1. 前端编辑轻量 `workspace.json` 或导入 `config/packs/*.json`
2. 自动任务通过 `workspace.json.jobs[].pack_path` 引用任务包
3. `run/api.py` 转发到 `backend/collector_service.py`
4. 查询 X 后将原始结果写入 `x_items_raw`
5. 规则评估后将命中结果写入 `x_items_curated`
6. 运行记录追加到 `runtime/history/search_runs.jsonl`
7. 健康快照写入 `runtime/state/runtime_health_snapshot.json`

## 运行入口

- `python run/bootstrap.py`
- `python run/services.py start|stop|status|restart`
- `python run/api.py`
- `python run/scheduler.py`
- `python run/static_web_server.py`

默认端口：
- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`

## API 口径

配置相关：
- `GET /workspace`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /workspace/export`
- `GET /task-packs`
- `GET /task-packs/{pack_name}`
- `POST /task-packs`
- `PUT /task-packs/{pack_name}`

既有业务路由仍保留，但底层已改为文件后端：
- `/jobs`
- `/rule-sets`
- `/manual/run`
- `/runs`
- `/logs/runtime`
- `/items`

## 工作规则

- 不要再把搜索配置或规则正文长期内联回 `workspace.json`、localStorage 或 SQLite 配置表
- 不要再把运行记录或健康快照写回 SQLite
- 服务日志只放 `runtime/logs/`
- PID 只放 `runtime/pids/`
- 测试临时产物只放 `runtime/tmp/tests/`
- `data/app.db` 只用于原始结果和筛选结果存储

## Git 边界

- 应提交：`backend/`、`run/`、`tests/`、`web-ui/src/`、`config/`、`artifacts/`、文档、`data/README.md`、`.env.example`、`.learnings/`
- 应忽略：`.env`、`data/*.db`、`runtime/history/`、`runtime/state/`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/`、`web-ui/node_modules/`、`web-ui/dist/`

## 默认验证

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```

## 编码注意

- Windows PowerShell 显示中文 Markdown 可能会出现 mojibake，先区分是终端显示问题还是文件真损坏
- 编辑 JSON / TSX / Markdown 时，优先使用 BOM-free UTF-8 写入方式
