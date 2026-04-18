# X数据采集器

这是一个本地运行的 X 数据采集、规则筛选、结果沉淀与运行工作台。主仓当前只负责 X 搜索、任务调度、规则评估、本地 API、SQLite 结果库和 Web UI，不再承载 Notion 同步或其他下游系统集成。

当前主链路：

```text
任务包
  = 搜索条件 + 规则

手动执行任务:
  task pack 草稿 -> X 搜索 -> x_items_raw -> 规则评估 -> x_items_curated

自动任务:
  workspace jobs registry -> pack_path -> task pack -> run_manual(..., trigger_type="auto")
```

## 项目定位

当前版本已经收口为“本地 API + Scheduler + Web UI + SQLite”的单机工作台，核心目标是：

- 用任务包表达“搜什么 + 怎么筛”
- 调用 `twitter-cli` 拉取 X 原始结果
- 将原始结果写入 `x_items_raw`
- 将规则命中结果写入 `x_items_curated`
- 通过自动任务注册表调度定时执行
- 通过运行总览、结果浏览、运行日志页面排障和回看

## 核心能力

### 1. 手动执行任务

- 页面主语义已经切到“任务包草稿”
- `任务包 = 搜索条件 + 规则`
- 可以直接执行当前草稿，不需要先保存成任务包
- 支持这些任务包操作：
  - 载入任务包
  - 从文件导入
  - 导入并保存为新任务包
  - 另存为新任务包
  - 保存到当前任务包
  - 删除当前任务包
- 导入或载入只会替换当前草稿；继续编辑不会自动回写原文件

### 2. 自动任务

- 自动任务是“调度壳 + 绑定任务包”的模型
- 调度字段保存在 `config/workspace.json` 的 `jobs[]` 注册表里
- 任务正文来自 `config/packs/*.json`
- 支持新建、编辑、立即运行、启用、停用、删除、恢复、彻底删除
- 已支持批量操作：
  - 批量启用
  - 批量停用
  - 批量立即运行
  - 批量删除
  - 批量恢复
  - 批量彻底删除
- 批量选择使用“两段式全选”：
  - 先全选当前页
  - 再升级为“选择全部匹配结果”

### 3. 结果浏览

- 单页双表浏览：
  - `x_items_curated`
  - `x_items_raw`
- 当前表作用域下支持：
  - 关键词查询
  - 分页
  - 服务端排序
  - 列显隐
  - 单条删除
  - 批量删除
  - 全表去重
- 列宽支持表头拖拽
- `curated` 和 `raw` 的列宽、可见列等视图状态分别在浏览器本地记忆

### 4. 运行总览与运行日志

- `运行总览` 页面采用“刷新冻结”语义：
  - 浏览器刷新页面时，不会自动重新探测 DB / X
  - 首屏只恢复浏览器本地上次展示状态
  - 只有点击 `重新加载` 才会主动调用 `GET /health`
- `GET /health/snapshot` 是后端只读快照接口，但不是 Dashboard 首屏默认数据源
- `运行日志` 页面读取：
  - `runtime/history/search_runs.jsonl`
  - `runtime/logs/*.current.out.log`
  - `runtime/logs/*.current.err.log`

### 5. 设置页

- Settings 页现在只维护轻量 `config/workspace.json`
- 当前重点是：
  - `environment`
  - `jobs[]` registry
- 搜索条件和规则正文已经收口到 `config/packs/*.json`

## 快速开始

### 1. 准备本机依赖

```bash
python run/bootstrap.py
```

`run/bootstrap.py` 是当前唯一推荐的依赖准备入口。它默认准备 `pipx`、`twitter-cli` 和 `agent-browser`，不接受额外参数。

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

排障原则：如果手动执行、自动任务或健康检查失败，先检查 `.env` 中的 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 和 `/health`，不要先怀疑前端页面或 API 路由。

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

预览地址默认是 `http://127.0.0.1:5178/`。

说明：`run/services.py` 默认只管理 API、Scheduler 和 Dev UI，不包含 `run/static_web_server.py`。

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

## 前端页面说明

### `Dashboard`

- 浏览器刷新后停留当前页面，不会自动重跑健康检查
- 首屏恢复本地上次展示的 DB / X 状态
- 只有点击 `重新加载` 才会调用 `GET /health`
- `/health/snapshot` 是后端只读快照接口，不是首屏默认来源

### `ManualSearchPage`

- 编辑并执行当前任务包草稿
- 围绕“当前任务包”做载入、从文件导入、导入并保存、另存为、覆盖保存、删除
- 任务正文固定由两部分组成：
  - 搜索条件
  - 规则

### `JobsPage`

- 展示调度任务列表，而不是任务正文列表
- 每个 job 通过 `pack_path` 绑定一个任务包
- 详情工作区同时展示：
  - 调度设置
  - 当前绑定任务包
  - 任务正文
- 支持批量管理与两段式全选

### `ResultsPage`

- 在 `x_items_curated` 和 `x_items_raw` 之间切换
- 排序、删除、批删、去重都只作用于当前表
- 列宽支持拖拽，且两张表分别记忆

### `LogsPage`

- 展示运行记录与当前服务日志快照
- 运行记录来源是 `runtime/history/search_runs.jsonl`

### `SettingsPage`

- 编辑轻量 `config/workspace.json`
- 支持 load / save / import / export
- 不再承载搜索草稿、预设或规则正文

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
- 仓库默认不再预置具体业务 pack

### `runtime/`

- `runtime/history/search_runs.jsonl`：手动执行和自动任务运行记录
- `runtime/state/runtime_health_snapshot.json`：后端健康快照
- `runtime/state/sequences.json`：运行态序号
- `runtime/logs/`：服务日志
- `runtime/pids/`：PID 文件
- `runtime/tmp/`：临时产物

### `data/`

- `data/app.db` 是唯一运行 SQLite 主库
- SQLite 只保留两张业务表：
  - `x_items_raw`
  - `x_items_curated`
- 不再把 jobs、rule sets、search runs、health snapshot 作为数据库主真相

## API 概览

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

### 健康、运行日志与手动执行

- `GET /health`
- `GET /health/snapshot`
- `POST /manual/run`
- `GET /runs`
- `GET /runs/{id}`
- `GET /logs/runtime`

### 自动任务与规则

- `GET /jobs`
- `GET /jobs/{id}`
- `POST /jobs`
- `POST /jobs/create`
- `POST /jobs/{id}/update`
- `POST /jobs/{id}/toggle`
- `POST /jobs/{id}/run-now`
- `POST /jobs/{id}/delete`
- `POST /jobs/{id}/restore`
- `POST /jobs/{id}/purge`
- `POST /jobs/batch`
- `GET /rule-sets`
- `GET /rule-sets/{id}`
- `POST /rule-sets`
- `POST /rule-sets/{id}/clone`
- `POST /rule-sets/{id}/update`
- `POST /rule-sets/{id}/delete`
- `POST /scheduler/tick`

### 结果浏览与数据管理

- `GET /items?table=curated|raw`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

结果管理说明：

- `POST /items/{id}/delete` 请求体带 `table`
- `POST /items/delete` 支持：
  - `ids`
  - `mode=all_matching`
  - `table`
- `POST /items/dedupe` 请求体带 `table`

## 目录基线

Git 中默认保留：

- `backend/`
- `run/`
- `tests/`
- `web-ui/src/`
- `config/README.md`
- `config/packs/default-rule-set.json`
- `artifacts/legacy/README.md`
- `.env.example`
- `.learnings/`

Git 中默认忽略：

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
- `artifacts/legacy/*.json`

## 默认验证

改代码时，默认验证命令仍然是：

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```

如果改了运行入口、服务控制、端口说明或健康相关逻辑，额外检查：

- `python run/services.py status`
- `http://127.0.0.1:8765/health`
- `http://127.0.0.1:5177/`
- `http://127.0.0.1:5178/`
