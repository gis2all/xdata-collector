# X数据采集器

这是一个本地运行的 X 数据采集、规则筛选、结果沉淀与运行工作台。当前主仓只负责 X 采集主链路，不再承担 Notion 同步或下游系统集成。

当前主链路：
`X 搜索 -> x_items_raw -> 规则评估 -> x_items_curated -> 结果浏览 / 自动任务 / 运行日志`

## 项目定位

当前版本已经从早期的单机 CLI 工具，收口成“本地 API + Scheduler + Web UI + SQLite”的工作台结构。它的核心任务是：

- 组装 X 搜索条件
- 调用 `twitter-cli` 拉取结果
- 将原始结果写入 `x_items_raw`
- 将规则命中结果写入 `x_items_curated`
- 使用任务包和自动任务注册表管理采集逻辑
- 通过 Dashboard、Results、Logs 页面进行健康检查和排障

## 核心能力

### 1. 手动搜索

- 支持 `SearchSpec` 的完整编辑
- 支持语言、天数、浏览量、点赞、回复、转推等区间筛选
- 支持任务包导入、导出、覆盖
- 执行后同时展示原始结果、命中结果、实际查询语句与规则评估结果

### 2. 自动任务

- 自动任务已改为“轻量 workspace 注册表 + task pack 正文”模式
- 支持新建、编辑、立即运行、启停、删除、恢复、彻底删除
- 任务表单可以导入 task pack 作为当前搜索 + 规则正文，但不会自动回写原 pack
- Scheduler 默认每 30 秒 tick 一次，按 `next_run_at` 触发已启用任务
- 仓库默认不再预置具体业务任务；clone 后应从空白状态新建或导入本地 pack

### 3. 结果浏览

- “结果查询”页已支持单页双表浏览：`x_items_curated` 与 `x_items_raw`
- 支持分页、服务端排序、列显隐、单条删除、批量删除、全表去重
- 去重作用于当前选中的表，`raw` 与 `curated` 的去重规则分开实现

### 4. 运行总览与运行日志

- Dashboard 读取 `/health`，展示数据库和 X 会话健康快照
- Logs 页读取 `runtime/history/search_runs.jsonl` 和 `runtime/logs/*.current.{out,err}.log` 快照
- 页面显示时间已统一为 `YYYY-MM-DD HH:mm:ss UTC+8`

### 5. 设置页

- Settings 页已从“全量 workspace 快照编辑器”改成“轻量 workspace 管理页”
- 当前只维护本地 `config/workspace.json`，重点是 environment 与 jobs registry

## 快速开始

### 1. 准备本机依赖

```bash
python run/bootstrap.py
```

`run/bootstrap.py` 是当前唯一推荐的本地依赖准备入口。它默认准备 `pipx`、`twitter-cli` 和 `agent-browser`，不接受额外参数。

### 2. 准备 `.env`

```bash
cp .env.example .env
```

当前 X 采集必填的 cookie 只有两项：

- `TWITTER_AUTH_TOKEN`
- `TWITTER_CT0`

辅助字段：

- `TWITTER_BROWSER`
- `TWITTER_CHROME_PROFILE`

排障原则：如果手动搜索、健康检查或自动任务失败，先检查 `.env` 中的 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 和 `/health`，不要先怀疑前端页面或 API 路由。

### 3. 安装前端依赖

```bash
cd web-ui
npm install
cd ..
```

### 4. 启动开发主链路

```bash
python run/services.py start
```

常用命令：

```bash
python run/services.py status
python run/services.py stop
python run/services.py restart
```

打开 `http://127.0.0.1:5177/`。

### 5. 如果要预览构建产物

```bash
cd web-ui && npm run build
python run/static_web_server.py --root web-ui/dist
```

说明：`run/services.py` 默认只管 API、Scheduler 和 Dev UI，不包含 `run/static_web_server.py`。

## 运行入口与端口

### 主入口

- `run/bootstrap.py`：依赖准备
- `run/services.py`：开发主链路总控
- `run/api.py`：本地 HTTP API
- `run/scheduler.py`：调度器
- `run/static_web_server.py`：构建产物静态预览

### 默认端口

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`

### `run/services.py` 做的事

- 控制 API、Scheduler、Dev UI 的 start / stop / status / restart
- 将 PID 写入 `runtime/pids/`
- 将当前服务日志写入 `runtime/logs/*.current.out.log` 和 `runtime/logs/*.current.err.log`
- 启动时对 API 与 Dev UI 做最小健康确认

## 前端页面说明

### `Dashboard`

- 读取 `/health` 展示 DB 连接状态和 X 会话检查结果
- 显示数据库路径、任务数、最近校验时间、X 账号摘要等信息

### `ManualSearchPage`

- 编辑 `SearchSpec`
- 编辑当前规则集草稿
- 从 `config/packs/*.json` 导入 task pack 到当前表单
- 将当前表单显式导出为 task pack 或覆盖当前 pack
- 手动执行 `run_manual()`并展示 raw / matched 结果

### `JobsPage`

- 列出自动任务注册表
- 在 drawer 中编辑任务名、间隔、启停状态
- 导入 task pack 以替换当前 search_spec + rule_set 正文
- 支持立即运行、soft delete、restore、purge

### `ResultsPage`

- 在 `x_items_curated` 和 `x_items_raw` 之间切换
- 支持 keyword 查询、page/page_size 分页
- 支持服务端排序、列显隐、本地记忆
- 支持单条删除、批量删除、当前匹配结果全选后批删、全表去重

### `LogsPage`

- 上半区展示 `search_runs` 等价运行记录（当前来自 `runtime/history/search_runs.jsonl`）
- 下半区展示 API、Scheduler、Web UI 的 current 日志快照

### `SettingsPage`

- 编辑轻量 `config/workspace.json`
- 支持 workspace 的 load / save / export / import
- 不再承载搜索草稿、preset 或规则正文

## 配置、运行态与数据边界

### `config/`

- Git 中只保留通用基线：
  - `config/README.md`
  - `config/packs/default-rule-set.json`
- 本地动态配置：
  - `config/workspace.json`
  - `config/packs/job-*.json`
  - `config/packs/manual-preset-*.json`
  - `config/packs/manual-rule-set-*.json`
- `config/workspace.json` 缺失时，系统会自动 bootstrap 一个空白但可运行的默认 workspace
- 旧 `search_presets*.json` 不再保留在仓库基线中；`artifacts/legacy/` 只保留说明文件，不再提交具体历史预设 JSON

### `runtime/`

- `runtime/history/search_runs.jsonl`：手动搜索与自动任务运行记录
- `runtime/state/runtime_health_snapshot.json`：健康快照
- `runtime/state/sequences.json`：运行态序号
- `runtime/logs/`：服务日志
- `runtime/pids/`：`run/services.py` 管理的 PID 文件
- `runtime/tmp/`：临时产物，包括 test 临时文件

### `data/`

- `data/app.db` 是当前唯一运行 SQLite 主库
- SQLite 现在只保留 `x_items_raw` 和 `x_items_curated` 两张业务表
- 不再将 jobs、rule sets、search runs、health snapshot 作为 DB 主真相

## API 概览

### 配置与 task pack

- `GET /workspace`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /workspace/export`
- `GET /task-packs`
- `GET /task-packs/{pack_name}`
- `POST /task-packs`
- `PUT /task-packs/{pack_name}`

### 手动执行与健康

- `GET /health`
- `POST /manual/run`
- `GET /runs`
- `GET /runs/{id}`
- `GET /logs/runtime`

### 自动任务与规则

- `GET /jobs`
- `GET /jobs/{id}`
- `POST /jobs` 和 `POST /jobs/create`
- `POST /jobs/{id}/update`
- `POST /jobs/{id}/toggle`
- `POST /jobs/{id}/run-now`
- `POST /jobs/{id}/delete`
- `POST /jobs/{id}/restore`
- `POST /jobs/{id}/purge`
- `GET /rule-sets`
- `GET /rule-sets/{id}`
- `POST /rule-sets`
- `POST /rule-sets/{id}/clone`
- `POST /rule-sets/{id}/update`
- `POST /rule-sets/{id}/delete`

### 结果浏览与数据管理

- `GET /items?table=curated|raw`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

## Git 边界

建议提交的内容：

- `backend/`、`run/`、`tests/`、`web-ui/src/`
- `config/README.md`
- `config/packs/default-rule-set.json`
- `README.md`、`CLAUDE.md`、`data/README.md`、`config/README.md`、`runtime/README.md`
- `.env.example`、`.learnings/`、`artifacts/`

不应提交的内容：

- `.env`
- `data/*.db`
- `runtime/history/`、`runtime/state/`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/`
- `config/workspace.json`
- `config/packs/job-*.json`
- `config/packs/manual-preset-*.json`
- `config/packs/manual-rule-set-*.json`
- `web-ui/node_modules/`、`web-ui/dist/`、`web-ui/.tmp-esbuild/`
- Python 缓存与 test cache

## 验证命令

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```

如果改了运行入口、服务控制、文档或端口说明，建议额外检查：

- `http://127.0.0.1:8765/health`
- `http://127.0.0.1:5177/`
- 必要时检查 `run/services.py status`
