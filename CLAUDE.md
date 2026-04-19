# XData Collector 协作说明

## 一句话定位

这个仓库是一个本地运行的 X 数据采集与规则筛选工作台。当前结构已经收口为：

```text
run/ + backend/ + web-ui/ + config/ + runtime/ + data/
```

## 当前真相

### 1. 产品边界

- 主仓只处理：
  - X 搜索
  - 规则评估
  - SQLite 结果沉淀
  - 本地 API
  - Scheduler
  - Web UI
- 这个仓库只负责 X 搜索、本地 API、任务调度、SQLite 结果存储和 Web UI，不要把下游投递链路写回主仓

### 2. 主目录

- `web-ui/`：前端单页工作台
- `backend/`：核心业务编排、规则系统、X 搜索适配与存储
- `run/`：运行入口和开发主链路总控
- `config/`：通用基线配置 + 本地动态配置
- `runtime/`：运行态文件、快照、日志、PID 与临时产物
- `data/`：正式只保留 `app.db` 和 `data/README.md`

### 3. 默认运行常量

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`
- `run/services.py` 默认只管理 API、Scheduler、Dev UI，不包含 `run/static_web_server.py`

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
- `jobs[]`

`jobs[]` 是自动任务注册表。每条任务至少包含：

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

任务包是当前手动执行页和自动任务页的正文真相。每个 pack 都必须同时包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `search_spec`
- `rule_set`

当前口径：

- `任务包 = 搜索条件 + 规则`
- 导入或载入任务包后，只替换当前表单草稿
- 继续编辑不会自动回写原 pack
- 只有显式“另存为新任务包 / 保存到当前任务包 / 导入并保存为新任务包”才会落盘
- Git 中默认只保留 `default-rule-set.json` 这个通用基线 pack
- 具体 job pack、manual preset pack、manual rule-set pack 都属于本地动态配置，不应继续纳管

### 3. `runtime/`

运行态主要在文件系统而不在 SQLite：

- `runtime/history/search_runs.jsonl`：运行记录
- `runtime/state/runtime_health_snapshot.json`：后端健康快照
- `runtime/state/sequences.json`：运行态序号
- `runtime/logs/`：当前服务日志
- `runtime/pids/`：服务 PID
- `runtime/tmp/`：临时产物

### 4. `data/app.db`

当前 SQLite 只保留两张业务表：

- `x_items_raw`
- `x_items_curated`

不要再把 jobs、rule sets、health snapshot 或 search runs 写回 SQLite 当主真相。

## 核心架构

### `run/` 层

- `run/bootstrap.py`：本机依赖准备
- `run/services.py`：开发主链路总控
- `run/api.py`：HTTP API 门面
- `run/scheduler.py`：固定 tick 调度器
- `run/static_web_server.py`：构建产物预览

### `backend/` 层

- `backend/collector_service.py`：后端编排中枢
- `backend/collector_rules.py`：搜索规范化、查询生成、规则评估
- `backend/collector_store.py`：只维护 `x_items_raw` / `x_items_curated` schema 与连接
- `backend/workspace_store.py`：workspace、task pack 和 runtime state 的文件化存储
- `backend/twitter_cli.py`：X 搜索适配

### `web-ui/` 层

- `DashboardPage`：运行总览
- `ManualSearchPage`：手动执行任务 + 任务包草稿管理
- `JobsPage`：调度任务列表 + 绑定任务包
- `ResultsPage`：`raw/curated` 双表结果浏览
- `LogsPage`：运行记录 + 服务日志快照
- `SettingsPage`：轻量 workspace 编辑

## 当前 API 口径

### 配置与任务包

- `GET /workspace`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /workspace/export`
- `GET /task-packs`
- `GET /task-packs/{pack_name}`
- `POST /task-packs`
- `PUT /task-packs/{pack_name}`
- `POST /task-packs/{pack_name}/delete`

### 健康与运行态

- `GET /health`
- `GET /health/snapshot`
- `GET /runs`
- `GET /runs/{id}`
- `GET /logs/runtime`

### 手动执行与自动任务

- `POST /manual/run`
- `/jobs` 系列路由仍然保留，但底层已经改为 workspace + task pack 文件后端
- `POST /jobs/batch` 已支持批量启用、停用、立即运行、删除、恢复、彻底删除
- `POST /scheduler/tick` 仍可用于手动触发 scheduler 逻辑

### 规则与结果浏览

- `/rule-sets` 路由仍然保留，但 rule set 目录是从 builtin + task packs 派生出来的兼容视图
- `GET /items?table=curated|raw`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

## 典型工作流

### 1. 手动执行任务

1. `ManualSearchPage` 编辑任务包草稿
2. 草稿正文由两部分组成：
   - 搜索条件
   - 规则
3. 可以载入已有任务包，也可以从本地 JSON 文件导入到当前草稿
4. 前端调用 `POST /manual/run`
5. `run_manual()` 组装查询、拉取 X 结果、写 raw、评估规则、写 curated
6. 成功 run 后会自动对 `x_items_curated` 执行全表去重

### 2. 自动任务

1. `JobsPage` 维护 `workspace.json.jobs[]` 的注册信息
2. 每条 job 通过 `pack_path` 指向一个 task pack
3. scheduler 按固定 tick 扫描已启用且到期的 job
4. `run_job_now()` 读取任务包正文后调用 `run_manual(..., trigger_type="auto")`
5. Jobs 页支持两段式全选和批量操作

### 3. 结果浏览

1. `ResultsPage` 以 `table=curated|raw` 切换数据源
2. 排序、删除、批量删除、去重都作用于当前选中的表
3. 结果页支持列显隐、本地视图记忆和列宽拖拽

### 4. 运行总览

1. 浏览器刷新页面时，不会自动调用健康接口
2. 首屏只恢复浏览器本地上次展示状态
3. 只有点击 `重新加载` 才会调用 `GET /health`
4. `GET /health/snapshot` 是后端只读快照接口，不是 Dashboard 首屏默认来源

## 编辑时的约束

- 当前端设计、样式调整、页面布局重构或组件视觉变更发生时，优先遵循根目录 `DESIGN.md`；如果规范与现有实现冲突，先保证信息清晰、操作顺手和工作台效率。
- 文档、路径、启动命令默认以 `run/` 下主入口为准
- 临时 spec / plan / design 文档统一落在 `artifacts/design/{specs,plans}`；根目录 `docs/` 不再作为方案文档入口
- 不要把 `workspace.json` 重新做成“搜索草稿 + presets + rule sets + jobs 全内联快照”
- 不要把 `config/` 默认绑定到具体业务任务；仓库基线只保留通用配置
- 不要让 `data/` 回流日志、导出、测试临时文件
- 不要让 `run/services.py` 默认管到 `run/static_web_server.py`
- 改 X 采集链路时，先检查 `.env` 和 `/health`
- 默认只在当前主工作区工作，不使用 `git worktree`；若未来需要恢复，必须由用户明确放开
- 写中文 Markdown / TSX / JSON 时，注意 Windows PowerShell 的乱码和 BOM 风险

## Git 与提交边界

默认应该提交：

- `backend/`
- `run/`
- `tests/`
- `web-ui/src/`
- `config/README.md`
- `config/packs/default-rule-set.json`
- `.env.example`
- `.learnings/`

默认不应该提交：

- `.env`
- `data/*.db`
- `runtime/history/`
- `runtime/state/`
- `runtime/logs/`
- `runtime/pids/`
- `runtime/tmp/`
- `web-ui/node_modules/`
- `web-ui/dist/`
- `config/workspace.json`
- `config/packs/job-*.json`
- `config/packs/manual-preset-*.json`
- `config/packs/manual-rule-set-*.json`
- `artifacts/design/`
- `artifacts/legacy/*.json`

`.learnings/` 应提交，但不能写入真实 cookie、token 或一次性调试噪音。

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
8. `web-ui/src/pages/DashboardPage.tsx`
