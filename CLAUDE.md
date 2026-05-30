# XData Collector Agent Handbook

## 1. 项目定位与边界

`XData Collector` 是一个本地运行的 `X / Twitter` 数据采集、规则筛选和结果浏览工作台。它负责：

- 构造搜索查询并调用本机 CLI
- 拉取、补全、规范化搜索结果
- 应用搜索条件过滤和规则评估
- 写入 `SQLite` 的 raw / curated 结果表
- 管理本地 task pack、自动任务、运行历史和健康快照
- 提供本地 `HTTP API`、Scheduler 和 Web UI

它不负责远端服务端化部署、下游投递链路、外部业务编排平台或多用户权限体系。改代码时不要把这些职责写回主仓。

先抓住三件事：

1. 真相分散在 `config/`、`runtime/` 和 `data/app.db`，不是全在数据库里。
2. `backend/collector_service.py` 是公共 import / patch 入口和服务组合入口，具体职责拆在 `backend/collector_service_parts/*`。
3. 默认搜索入口是 `twitter-cli`；`xreach` 只是 fallback 和二次补全工具。

## 2. 60 秒建立脑图

### 主目录

| 路径 | 作用 |
| --- | --- |
| `run/` | 本地 API、Scheduler、静态预览等运行入口 |
| `backend/` | 核心编排、规则、存储、CLI 适配、服务 mixin |
| `web-ui/` | React 前端工作台 |
| `config/` | workspace 基线、本地 task pack |
| `runtime/` | 运行历史、健康快照、PID、日志、临时文件 |
| `data/` | 正式数据目录，核心是 `data/app.db` |
| `tests/` | 后端、API、服务和集成测试 |

### 默认运行常量

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`
- 常用入口：
  - `python install.py`
  - `python services.py start`
  - `python services.py restart`
  - `python services.py status`

默认调试环境是 Windows 本机服务，不是 Docker。`services.py` 默认管理 API、Scheduler、Dev UI；`run/static_web_server.py` 是构建产物预览入口。

## 3. Source of Truth

### `config/workspace.json`

这是本地 workspace 底座，不是全量业务快照。它只应该承载：

- `version`
- `meta`
- `environment`
- `jobs[]`

`jobs[]` 是自动任务注册表，保存任务注册信息，不保存任务正文。当前应关注字段：

- `id`
- `name`
- `enabled`
- `interval_minutes`
- `pack_name`
- `pack_path`
- `group_name`
- `next_run_at`
- `created_at`
- `updated_at`
- `deleted_at`

注意：

- `group_name` 是 job 级单值分组。
- job 的 `tags` 真相不在 `workspace.json`，而是来自绑定的 task pack。
- 不要把 run history、health snapshot 或结果数据写回这里。

### `config/packs/*.json`

task pack 是手动搜索页和自动任务页的正文真相。每个 pack 当前应包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `tags`
- `search_spec`
- `rule_set`

当前语义：

- `任务包 = 搜索条件 + 规则 + tags`
- `tags` 是任务包级标签，规范化为 `trim + lowercase + dedupe`
- `rule_set` 当前以内嵌正文保存在 task pack 里
- 手动 run 和自动 run 都会继承当前 pack 的 `tags`
- 结果表保存的是当次运行的 tags 快照
- 之后再修改 pack，不会回改历史结果
- Git 基线默认只保留 `config/packs/default-rule-set.json`
- 其他 job pack、manual preset、manual rule-set 都属于本地动态配置

### `runtime/`

运行态主要落文件系统，不落 `SQLite`：

- `runtime/history/search_runs.jsonl`
- `runtime/state/runtime_health_snapshot.json`
- `runtime/state/sequences.json`
- `runtime/logs/`
- `runtime/pids/`
- `runtime/tmp/`

`search_runs.jsonl` 是 run 历史主存储。`sequences.json` 保存本地递增序列。两者可能因为进程中断或本地文件波动出现短暂不一致，前端轮询必须容忍 stale run id。

### `data/app.db`

当前业务真相只有两张结果表：

- `x_items_raw`
- `x_items_curated`

不要把 jobs、rule sets、health snapshot 或 run history 再写回 `SQLite` 作为主真相。

结果表当前语义：

- `raw` 和 `curated` 都保留 `fetched_at`
- `raw` 和 `curated` 都保留 `tags_json`，API 出口序列化成 `tags: string[]`
- `author` 表示作者 handle / screenName
- `author_name` 表示作者展示名
- `raw` 只保存通过搜索条件过滤后的原始结果
- `curated` 只保存规则评估后命中的结果

## 4. 后端架构

### 服务入口

- `backend/collector_service.py` 是后端公共入口，也是 `DesktopService` 的组合入口。
- 外部 import 和测试 patch 路径使用 `backend.collector_service`，例如 `patch("backend.collector_service.run_twitter_search")`。
- 业务职责不要重新堆回这个文件；新增主流程优先放到对应 `collector_service_parts/*` mixin。

`collector_service.py` 只应保留少量组合逻辑：

- `DesktopService.__init__`
- workspace facade：`get_workspace` / `update_workspace` / `import_workspace` / `export_workspace`
- 环境变量加载和内置 rule set 保底
- mixin 组合：`DesktopService(RuleTaskPackMixin, JobMixin, RunMixin, ItemMixin, HealthMixin)`

### `collector_service_parts/*`

| 文件 | 职责 |
| --- | --- |
| `common.py` | 共享常量、类型别名、row 转换、排序/筛选 helper、搜索结果去重、`MAX_BACKGROUND_RUNS`、`MAX_FILTER_TREE_ROWS` |
| `rules_taskpacks.py` | rule set 兼容目录、task pack catalog / create / update / delete / clone |
| `jobs.py` | job CRUD、批量操作、启停、调度字段、job 序列化 |
| `runs.py` | 手动/自动 run、后台 worker、取消、run slot、raw/curated 写入 |
| `items.py` | raw/curated 列表查询、条件树过滤、删除、批量删除、全表去重 |
| `health.py` | DB / X 健康探测、健康快照、X probe 缓存 |

重要约束：

- mixin 方法通过 `self.workspace_store`、`self.runtime_store`、`self.db_path` 访问共享状态。
- 不要绕过 `DesktopService` 新增另一套业务入口。
- 共享算法优先放在 `common.py` 或更底层 helper，不要重新塞回 `collector_service.py`。

### 其他后端核心文件

- `backend/collector_rules.py`：搜索规格规范化、查询生成、规则评估。
- `backend/collector_store.py`：`x_items_raw` / `x_items_curated` schema 和数据库连接。
- `backend/workspace_store.py`：workspace、task pack、runtime run history、health snapshot 的文件化存储。
- `backend/source_identity.py`：source URL 规范化、primary dedupe key、fallback dedupe key。
- `backend/twitter_cli.py`：`twitter-cli` / `xreach` 适配、fallback、二次补全。

## 5. Search / Run Pipeline

### CLI 与认证

- 默认搜索入口是 `twitter-cli`。
- `xreach search` 只作为 `twitter-cli search` 失败后的 fallback。
- `xreach tweet <tweet_id> --json` 只在核心字段缺失时触发二次补全。
- `twitter-cli` 内部需要 `auth_token` / `ct0`：优先读取 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 环境变量；如果没有环境变量，会尝试从本机浏览器 Cookie 中提取。
- `xreach` 不会自己读浏览器 Cookie；项目代码会把 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 显式传给 `xreach search` 和 `xreach tweet`。
- 本机环境可能依赖浏览器登录态兜底；Docker 环境通常没有浏览器 Cookie，因此 `.env` 更关键。

安装口径：

- Dockerfile 已固定：
  - `twitter-cli`：`git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7`
  - `xreach-cli@0.3.0`
- `run/bootstrap.py` 本机安装的 `twitter-cli` 和 `xreach-cli` 必须与 Dockerfile 固定到同一版本；改版本时要同步 Dockerfile、bootstrap 和测试。
- Docker Compose 默认把容器代理指向 `http://host.docker.internal:7897`。无代理环境要移除 `docker-compose.yml` 中的代理环境变量；其他代理环境要把 `DOCKER_PROXY_URL` 改成可用地址。

### 查询构造规则

- 语言模式 `zh_en` 会生成单条 `(lang:zh OR lang:en)` 查询。
- 默认 `days_filter` 是最近 `1` 天。
- 默认 `time_slice_minutes` 是 `60`。
- 可选时间切片：`15 / 30 / 60 / 120 / 240`。
- 默认 `max_results` 是 `100`。

重要细节：

- `max_results` 是每个时间切片 query 的传参上限。
- `twitter-cli search` 实测单个 query 通常仍只会返回约 `40` 条。
- 高频词即使 `max_results=100`，也仍可能需要更细切片补历史数据。

### 时间切片规则

- 只有有界 `days_filter` 才会自动切片。
- 自动切片会追加 `since_time:<秒> until_time:<秒>`。
- 如果 `raw_query` 已显式包含 `since:`、`until:`、`since_time:`、`until_time:`，则不再叠加自动切片。
- 时间切片 query 总上限是 `10000`。

### 二次补全规则

只在核心字段缺失时触发 `xreach tweet` 补全。当前核心字段：

- `author`
- `author_name`
- `text`
- `created_at_x`
- `views`
- `likes`
- `replies`
- `retweets`

不要因为这些字段缺失而触发补全：

- `urls`
- `media`

这里的 `urls` 指推文正文里的外部链接，不是推文自身的 canonical URL。

### 手动搜索

1. `ManualSearchPage` 维护当前草稿，可绑定已有 task pack，也可从本地导入。
2. 默认内部草稿标识为 `__default_draft__`，不可删除。
3. 草稿正文由 `search_spec + rule_set + tags` 组成。
4. 列表型输入采用“编辑期保留原始文本，失焦后规范化”的策略。
5. 前端默认调用 `POST /manual/run/start` 启动后台 run，再轮询 `GET /runs/{id}`。
6. 同步入口 `POST /manual/run` 仍保留，但前端主路径不是它。
7. 主链路：生成查询 -> 拉取搜索结果 -> run 内去重 -> 搜索条件过滤 -> 写 raw -> 规则评估 -> 写 curated -> curated 自动去重。

### 自动任务

1. `JobsPage` 管理 `workspace.json.jobs[]` 注册信息。
2. 每个 job 通过 `pack_path` 指向 task pack。
3. `group_name` 是 job 自身字段，`tags` 来自绑定 pack。
4. scheduler 按固定 tick 扫描“已启用且到期”的 job。
5. `run_job_now()` 会先创建后台 run，再返回 `{ run_id, status }`。
6. 定时触发和“立即运行”走同一套后台 run 模型。
7. 运行中的 job 可以在 `JobsPage` 右侧工作区或 `LogsPage` 停止，对应 `POST /runs/{id}/cancel`。

自动任务页的 stale run 规则：

- `JobsPage` 会用 job 的 active run id 轮询 `GET /runs/{id}`。
- 如果后端返回 `{"error":"not found"}`，前端应把它当成过期 run id，清掉 active run 并静默刷新 job。
- 这个 `not found` 不应展示为任务失败，也不应导致 run 被标记为 cancelled。

## 6. 数据与去重语义

### Source identity

`backend/source_identity.py` 是 dedupe key 的共享来源：

- `build_source_dedupe_key(...)`：优先 tweet id / URL / text identity。
- `build_source_dedupe_key_with_fallback(...)`：先用 primary key；都没有时用 `author | created_at | text[:120]` 的稳定 fallback。

当前统一使用 fallback helper 的路径：

- run 内搜索结果去重
- raw 表全表 dedupe
- curated 写入 dedupe key 生成

### raw 与 curated

- run 内会先对搜索结果做内存去重。
- `raw` 保存通过搜索条件过滤后的原始结果。
- `curated` 保存规则评估命中的结果。
- 成功写入 curated 后会自动执行 curated 全表去重。
- raw 全表去重不会自动跑，只能从结果页或 `POST /items/dedupe` 手动触发。
- filter tree 查询会在后端做内存过滤，并受 `MAX_FILTER_TREE_ROWS = 50000` 保护。

## 7. 前端架构

### 页面入口

当前有效页面：

- `#/dashboard`
- `#/manual`
- `#/jobs`
- `#/results`
- `#/logs`
- `#/settings`

导航采用 hash 深链。非法 hash 回到 `dashboard`。`localStorage` 只是兜底，不覆盖 hash。

### Results 页面

- `web-ui/src/pages/ResultsPage.tsx` 是 thin re-export。
- 页面级状态、数据加载、批量操作和布局拼装在 `ResultsPageImpl.tsx`。
- 结果页子模块：
  - `pages/results/resultsTableConfig.tsx`：列定义、列宽、单元格渲染 helper。
  - `pages/results/resultsFilterState.ts`：filter tree 类型辅助、读写、normalize / sanitize。
  - `pages/results/ResultsFilterBuilder.tsx`：高级筛选 UI。
  - `pages/results/ResultsDataTable.tsx`：表格、列 resize、行选择。
  - `pages/results/ResultsTableManager.tsx`：表格工具栏。
  - `pages/results/ResultsDetailRail.tsx`：右侧详情栏。
  - `pages/results/ResultsPageHeader.tsx`：页头。

结果页主路径：

- 前端调用 `POST /items/query`。
- `GET /items` 仍保留，更接近兼容入口。
- 支持关键词、高级筛选条件树、排序、列显隐、列宽拖拽、详情栏、单条删除、批量删除、全表去重。

### Jobs 页面

- `web-ui/src/pages/JobsPage.tsx` 是 thin re-export。
- 页面级状态、API orchestration、drawer/open/save/run handlers 在 `JobsPageImpl.tsx`。
- 自动任务页子模块：
  - `pages/jobs/jobsTableConfig.tsx`：列定义、列宽、选择态、批量操作文案和 job 状态 helper。
  - `pages/jobs/jobDraft.ts`：表单 state、task pack payload、draft compare / import helper。
  - `pages/jobs/JobsTable.tsx`：任务表格、列 resize、选择。
  - `pages/jobs/JobWorkspace.tsx`：右侧工作区、任务包操作、运行控制。

### API 类型

`web-ui/src/api.ts` 是前端 wire type 和 fetch wrapper 的主文件。接口 shape 改动必须先看这里，再看页面组件。不要在页面里复制一套不一致的 API 类型。

## 8. UI / API Reality

### 结果页默认字段

`raw` 默认首屏字段：

- `author_name`
- `tags`
- `text`
- `created_at_x`
- `views`
- `likes`
- `replies`
- `fetched_at`

`curated` 默认首屏字段：

- `level`
- `score`
- `title`
- `source_url`
- `author_name`
- `tags`
- `created_at_x`
- `views`
- `likes`
- `replies`
- `fetched_at`

补充说明：

- `canonical_url`、`summary_zh`、`author` 仍可显示，但不再是默认首屏字段。
- `canonical_url` 和 `source_url` 在表格里都应渲染为可点击链接。
- 结果页列宽本地记忆键是 `results.columnWidths.v1`。
- 自动任务表列宽本地记忆键是 `jobs.columnWidths.v1`。

### 本地 HTTP API

`run/api.py` 仍是裸 `BaseHTTPRequestHandler` + 手写路由。优点是轻量，代价是扩展和参数校验要格外小心。

配置与 task pack：

- `GET /workspace`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /workspace/export`
- `GET /task-packs`
- `GET /task-packs/{pack_name}`
- `POST /task-packs`
- `PUT /task-packs/{pack_name}`
- `POST /task-packs/{pack_name}/delete`

运行态：

- `GET /health`
- `GET /health/snapshot`
- `GET /runs`
- `GET /runs/{id}`
- `POST /runs/{id}/cancel`
- `GET /logs/runtime`

手动与自动执行：

- `POST /manual/run`
- `POST /manual/run/start`
- `GET /jobs`
- `GET /jobs/{id}`
- `POST /jobs`
- `POST /jobs/{id}/update`
- `POST /jobs/{id}/toggle`
- `POST /jobs/{id}/run-now`
- `POST /jobs/{id}/run`
- `POST /jobs/{id}/delete`
- `POST /jobs/{id}/restore`
- `POST /jobs/{id}/purge`
- `POST /jobs/batch`
- `POST /scheduler/tick`

规则与结果：

- `rule-sets` 仍保留，但更接近从 builtin + task packs 派生出来的兼容目录。
- `GET /rule-sets`
- `GET /rule-sets/{id}`
- `POST /rule-sets`
- `POST /rule-sets/{id}/update`
- `POST /rule-sets/{id}/delete`
- `POST /rule-sets/{id}/clone`
- `GET /items`
- `POST /items/query`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

## 9. 先读哪里

理解后端主链路：

1. `run/api.py`
2. `backend/collector_service.py`
3. 对应的 `backend/collector_service_parts/*.py`
4. `backend/workspace_store.py`
5. `backend/collector_rules.py`

改搜索链路：

1. `backend/twitter_cli.py`
2. `backend/collector_rules.py`
3. `backend/collector_service_parts/runs.py`
4. `backend/collector_service_parts/common.py`
5. `tests/test_twitter_cli.py`
6. `tests/test_collector_service.py`

改自动任务：

1. `web-ui/src/pages/JobsPageImpl.tsx`
2. `web-ui/src/pages/jobs/`
3. `backend/collector_service_parts/jobs.py`
4. `backend/collector_service_parts/runs.py`
5. `backend/workspace_store.py`
6. `run/scheduler.py`

改结果页：

1. `web-ui/src/pages/ResultsPageImpl.tsx`
2. `web-ui/src/pages/results/`
3. `web-ui/src/api.ts`
4. `backend/collector_service_parts/items.py`
5. `backend/collector_service_parts/common.py`

改 task pack / rule set：

1. `backend/collector_service_parts/rules_taskpacks.py`
2. `backend/workspace_store.py`
3. `web-ui/src/pages/ManualSearchPage.tsx`
4. `web-ui/src/pages/jobs/JobWorkspace.tsx`

## 10. 常见坑与协作边界

### Do

- 把 `backend.collector_service` 当成公共入口，把 `collector_service.py + collector_service_parts/*` 当成真实实现。
- 把 task pack 当成搜索与规则正文真相。
- 把 `raw` 理解为“通过搜索条件后的原始结果”。
- 把 `author` 理解为作者 handle，而不是数字 user id。
- 排查搜索异常时分别看 `twitter-cli`、`xreach`、`.env`、`/health` 和 `runtime/history/search_runs.jsonl`。
- 认证异常先确认 `.env`、本机浏览器登录态、Cookie 是否过期，以及 Docker 是否拿得到 `.env`。
- 前端页面改 API shape 前先改 `web-ui/src/api.ts` 类型。
- Windows 下写中文 Markdown / TSX / JSON 时用 `apply_patch` 或 Python UTF-8 写入。

### Don't

- 不要把 jobs、runs、health snapshot 回写进 `SQLite`。
- 不要把 `xreach` 当默认搜索入口。
- 不要因为 `urls` 或 `media` 缺失就触发二次补全。
- 不要把 `config/` 回退成“业务任务快照仓库”。
- 不要把被搜索条件排除的中间结果写进 `x_items_raw`。
- 不要把 `collector_service.py` 重新堆回 god object。
- 不要假设 `GET /runs/{id}` 的 `not found` 一定代表任务失败；自动任务页可能只是 stale run id。
- 不要把 `runtime/`、`data/*.db`、本地动态 packs 提交进 Git。

### Git 边界

- 没有用户明确允许时，不要主动提交 commit。
- 没有用户明确允许时，不要主动 push 远端。
- 如果用户只说“提交至本地”，只做本地 commit。
- `docs/` 和 `docs/review-issues.md` 如果被本地忽略，不要强制加入 Git。

默认应提交的改动通常在：

- `backend/`
- `run/`
- `tests/`
- `web-ui/src/`
- `config/README.md`
- `config/packs/default-rule-set.json`
- `.env.example`
- `.learnings/`

默认不应提交的内容通常包括：

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

## 11. 默认验证

后端：

```powershell
python -m pytest -c tests/pytest.ini tests
```

前端：

```powershell
cd web-ui; npm.cmd test -- --run
cd web-ui; npm.cmd run build
```

Python 编译检查：

```powershell
python -c "import py_compile, tempfile; from pathlib import Path; files=[Path('install.py'),Path('services.py'),Path('run/api.py'),Path('run/bootstrap.py'),Path('run/scheduler.py'),Path('run/static_web_server.py')]+sorted(Path('backend').glob('*.py'))+sorted(Path('backend/collector_service_parts').glob('*.py')); td=tempfile.TemporaryDirectory(); root=Path(td.name); [py_compile.compile(str(f), cfile=str(root / (str(i)+'_'+f.name+'.pyc')), doraise=True) for i,f in enumerate(files)]; print(f'compiled {len(files)} files to temp pyc')"
```

运行入口、端口、服务编排或健康相关逻辑变更后，额外检查：

```powershell
python services.py status
python -c "import json, urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=10)), ensure_ascii=False, indent=2))"
```

如果只是更新 `CLAUDE.md` 这类文档，不需要跑后端或前端测试；但要至少做 UTF-8 读取和内容关键字检查。
