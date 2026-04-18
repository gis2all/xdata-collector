# XData Collector 协作说明

## 一句话定位

这个仓库是一个本地运行的 X 采集与规则筛选工作台。当前结构已收口为 `run/ + backend/ + web-ui/ + config/ + runtime/ + data/` 这几个主目录。

## 当前真相

### 1. 产品边界

- 主仓只处理 X 搜索、规则评估、SQLite 结果沉淀、本地 API、Scheduler 和前端工作台
- Notion 同步已经迁出主仓，不要再把 Notion 链路重新回灌到这个项目

### 2. 主目录

- `web-ui/`：前端单页工作台
- `backend/`：核心业务编排、规则系统、X 搜索适配与存储
- `run/`：运行入口和开发主链路服务总控
- `config/`：通用基线配置 + 本地动态配置目录
- `runtime/`：运行态文件、快照、日志、PID 与临时产物
- `data/`：正式只保留 `app.db` 和 `data/README.md`

### 3. 默认运行常量

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`
- `run/services.py` 默认只管 API、Scheduler、Dev UI，不包含 `run/static_web_server.py`

### 4. X 认证依赖

- `TWITTER_AUTH_TOKEN`
- `TWITTER_CT0`
- `TWITTER_BROWSER` 和 `TWITTER_CHROME_PROFILE` 只是辅助提示，不能代替 cookie

## 配置与存储模型

### 1. `config/workspace.json`

它是本地轻量 workspace 底座，只保留这些类型的信息：

- `version`
- `meta`
- `environment`
- `jobs[]` 自动任务注册表

`jobs[]` 里的每条任务至少包括：

- `id`
- `name`
- `enabled`
- `interval_minutes`
- `pack_name`
- `pack_path`
- `next_run_at`
- `created_at`
- `updated_at`
- `deleted_at`

### 2. `config/packs/*.json`

任务包是当前手动搜索和自动任务的正文真相。每个 pack 都必须同时包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `search_spec`
- `rule_set`

重要：

- 手动搜索页和自动任务页导入 pack 后，只替换当前表单
- 继续编辑不会自动回写原 pack
- 只有显式“导出为任务包 / 覆盖当前任务包”才会落盘
- Git 中默认只保留 `default-rule-set.json` 这个通用基线 pack
- 具体 job pack、manual preset pack、manual rule-set pack 都是本地动态配置，不应继续纳管

### 3. `runtime/`

运行态主要在文件系统而不在 SQLite 里：

- `runtime/history/search_runs.jsonl`：运行记录
- `runtime/state/runtime_health_snapshot.json`：健康快照
- `runtime/state/sequences.json`：运行态序号
- `runtime/logs/`：服务当前日志
- `runtime/pids/`：服务 PID
- `runtime/tmp/`：临时产物

### 4. `data/app.db`

当前 SQLite 只保留两张业务表：

- `x_items_raw`
- `x_items_curated`

不要再把 jobs、rule sets、health snapshot 或 search runs 写回 SQLite 当为主真相。

## 核心架构

### `run/` 层

- `run/bootstrap.py`：本机依赖准备
- `run/services.py`：开发主链路总控
- `run/api.py`：HTTP API 门面
- `run/scheduler.py`：固定 tick 调度器
- `run/static_web_server.py`：构建产物预览

### `backend/` 层

- `backend/collector_service.py` 是后端编排中枢
- `backend/collector_rules.py` 负责搜索规范化、查询生成、规则评估
- `backend/collector_store.py` 只维护 `x_items_raw` / `x_items_curated` schema 与连接
- `backend/workspace_store.py` 负责 workspace、task pack 和 runtime state 的文件化存储
- `backend/twitter_cli.py` 负责 X 搜索适配

### `web-ui/` 层

- `DashboardPage`：健康总览
- `ManualSearchPage`：手动采集 + pack 管理
- `JobsPage`：自动任务注册表 + pack 引入
- `ResultsPage`：raw/curated 双表浏览与数据管理
- `LogsPage`：运行记录 + 服务日志快照
- `SettingsPage`：轻量 workspace 编辑

## 当前 API 口径

### 配置相关

- `GET /workspace`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /workspace/export`
- `GET /task-packs`
- `GET /task-packs/{pack_name}`
- `POST /task-packs`
- `PUT /task-packs/{pack_name}`

### 自动任务与规则

- `/jobs` 系列路由仍然保留，但底层已改为 workspace + pack 文件后端
- `/rule-sets` 路由仍然保留，但 rule set 目录是从 builtin + task packs 派生出来的
- `POST /scheduler/tick` 仍可用于手动触发 scheduler 逻辑

### 手动执行与结果

- `POST /manual/run`
- `GET /runs`
- `GET /runs/{id}`
- `GET /logs/runtime`
- `GET /items?table=curated|raw`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

## 典型工作流

### 1. 手动搜索

1. `ManualSearchPage` 编辑 `SearchSpec` 和规则草稿
2. 可以从 `config/packs/*.json` 导入任务包到当前表单
3. 前端调用 `POST /manual/run`
4. `DesktopService.run_manual()` 组装查询、拉取 X 结果、写 raw、评估 rule set、写 curated
5. 成功 run 后会自动对 `x_items_curated` 执行全表去重

### 2. 自动任务

1. `JobsPage` 维护本地 `workspace.json.jobs[]` 的注册信息
2. 每条 job 通过 `pack_path` 指向一个 task pack
3. `scheduler.tick()` 筛出已启用且到期的 job
4. `run_job_now()` 读取 pack 正文后调用 `run_manual(..., trigger_type="auto")`

### 3. 结果浏览

1. `ResultsPage` 以 `table=curated|raw` 切换数据源
2. 排序、删除、去重都作用于当前选中的表
3. `created_at_x` 排序按真实时间解析，而不是字符串直排

## 编辑时的约束

- 文档、路径、启动命令默认以 `run/` 下主入口为准
- 不要把 `workspace.json` 重新做成“搜索草稿 + presets + rule sets + jobs 全内联快照”
- 不要把 `config/` 默认绑定到具体业务任务；仓库基线只保留通用配置
- 不要让 `data/` 回流日志、导出、测试临时文件
- 不要让 `run/services.py` 默认管到 `run/static_web_server.py`
- 改 X 采集链路时，先检查 `.env` 和 `/health`
- 写中文 Markdown / TSX / JSON 时，注意 Windows PowerShell 的 mojibake 和 BOM 问题

## Git 与提交边界

- ????`backend/`?`run/`?`tests/`?`web-ui/src/`?`config/README.md`?`config/packs/default-rule-set.json`?`artifacts/legacy/README.md`??????`.env.example`?`.learnings/`
- ????`.env`?`data/*.db`?`runtime/history/`?`runtime/state/`?`runtime/logs/`?`runtime/pids/`?`runtime/tmp/`?`web-ui/node_modules/`?`web-ui/dist/`?`config/workspace.json`?`config/packs/job-*.json`?`config/packs/manual-preset-*.json`?`config/packs/manual-rule-set-*.json`?`artifacts/legacy/*.json`
- `.learnings/` 应提交，但不能写入真实 cookie、token 或一次性调试噪音

## 默认验证

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```

如果改了运行入口、services、端口说明或健康相关逻辑，额外检查：

- `python run/services.py status`
- `http://127.0.0.1:8765/health`
- `http://127.0.0.1:5177/`

## 推荐阅读顺序

1. `run/api.py`
2. `backend/collector_service.py`
3. `backend/workspace_store.py`
4. `backend/collector_rules.py`
5. `web-ui/src/pages/ManualSearchPage.tsx`
6. `web-ui/src/pages/JobsPage.tsx`
7. `web-ui/src/pages/ResultsPage.tsx`
