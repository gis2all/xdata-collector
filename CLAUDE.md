# XData Collector Agent Handbook

## 1. 项目定位

`XData Collector` 是一个本地运行的 `X / Twitter` 数据采集、规则筛选、结果浏览与调度工作台。

它当前负责：

- 构造查询并调用本机 CLI
- 采集与补全 `X` 搜索结果
- 应用搜索条件与规则评估
- 写入本地 `SQLite`
- 管理 task pack、自动任务、运行历史、健康快照
- 提供本地 `HTTP API`、Scheduler 和 Web UI

它当前不负责：

- 多用户权限体系
- 远端服务化部署平台
- 下游投递编排
- 云端任务中心

改代码时不要把这些非目标职责重新写回主仓。

---

## 2. 先建立脑图

先抓住四个事实：

1. `config/`、`runtime/`、`data/app.db` 一起构成系统真相，不是所有东西都在数据库里。
2. `backend/collector_service.py` 是公共入口和组合层，真实职责拆在 `backend/collector_service_parts/*`。
3. 默认搜索入口是 `twitter-cli`；`xreach` 是 fallback 和补全工具，不是主入口。
4. 标准启动顺序是：
   - `python doctor.py`
   - `python install.py`
   - `python services.py start`

当前正式支持：

- Windows 本机运行
- Linux 本机运行
- macOS 本机运行
- Docker 运行

默认端口：

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`

---

## 3. 目录地图

| 路径 | 作用 |
| --- | --- |
| `backend/` | 核心业务编排、规则、存储、CLI 适配 |
| `run/` | API、Scheduler、静态预览等运行入口 |
| `web-ui/` | React 前端工作台 |
| `config/` | workspace 与 task pack 配置 |
| `runtime/` | 日志、PID、运行历史、健康快照、临时文件 |
| `data/` | 本地数据目录，核心是 `data/app.db` |
| `tests/` | 后端、服务、API、集成测试 |

当前常用入口：

- `doctor.py`：环境自检
- `install.py`：安装本机依赖和前端依赖
- `services.py`：启动/停止/重启开发主链路
- `run/api.py`：本地 HTTP API
- `run/scheduler.py`：后台调度器
- `run/static_web_server.py`：构建产物静态预览

---

## 4. Source of Truth

### 4.1 `config/workspace.json`

这是本地 workspace 的轻量注册表，不是业务全量快照。

它当前只应该承载：

- `version`
- `meta`
- `environment`
- `jobs[]`

`jobs[]` 当前只保存自动任务注册信息，例如：

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

重要约束：

- `group_name` 是 job 级单值字段。
- job 的正文不在这里，正文来自绑定的 task pack。
- 不要把 run history、health snapshot 或结果数据写回这里。

### 4.2 `config/packs/*.json`

task pack 是手动搜索页和自动任务页的正文真相。

每个 pack 当前固定包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `tags`
- `search_spec`
- `rule_set`

当前语义：

- `任务包 = 搜索条件 + 规则 + tags`
- `tags` 会做 `trim + lowercase + dedupe`
- 手动 run 和自动 run 都继承当前 pack 的 `tags`
- 结果表保存的是当次运行的 tags 快照
- 后续修改 pack，不会回改历史结果

Git 基线当前只保留：

- `config/README.md`
- `config/packs/default-rule-set.json`

默认不提交的本地动态配置包括：

- `config/workspace.json`
- `config/packs/job-*.json`
- `config/packs/manual-preset-*.json`
- `config/packs/manual-rule-set-*.json`

### 4.3 `runtime/`

运行态主真相在文件系统，不在数据库：

- `runtime/history/search_runs.jsonl`
- `runtime/state/runtime_health_snapshot.json`
- `runtime/state/sequences.json`
- `runtime/logs/`
- `runtime/pids/`
- `runtime/tmp/`

关键语义：

- `search_runs.jsonl` 是 run 历史主存储
- `sequences.json` 保存本地递增序列
- `runtime/state/runtime_health_snapshot.json` 保存健康快照

前端与后端都必须容忍运行中断带来的短暂 stale 状态。

### 4.4 `data/app.db`

当前数据库真相只有两张结果表：

- `x_items_raw`
- `x_items_curated`

当前不要把以下内容再写回 `SQLite` 作为主真相：

- jobs
- task packs
- run history
- health snapshot

结果表语义：

- `raw` 保存通过搜索条件过滤后的原始结果
- `curated` 保存规则评估命中的结果
- 两张表都保留 `fetched_at`
- 两张表都保留 `tags_json`，API 序列化为 `tags: string[]`
- `author` 是作者 handle
- `author_name` 是作者展示名

---

## 5. 后端架构

### 5.1 服务入口

`backend/collector_service.py` 是后端公共 import 入口和服务组合入口。

外部 patch / import 路径统一使用：

- `backend.collector_service`

例如：

```python
patch("backend.collector_service.run_twitter_search")
```

`collector_service.py` 当前应保持轻量，主要保留：

- `DesktopService.__init__`
- workspace facade：`get_workspace` / `update_workspace` / `import_workspace` / `export_workspace`
- 环境变量加载
- store 初始化
- mixin 组合

当前组合关系：

- `DesktopService(RuleTaskPackMixin, JobMixin, RunMixin, ItemMixin, HealthMixin)`

### 5.2 `backend/collector_service_parts/*`

| 文件 | 职责 |
| --- | --- |
| `common.py` | 共享常量、helper、过滤、排序、去重、并发限制 |
| `rules_taskpacks.py` | task pack / rule set 兼容目录与 CRUD |
| `jobs.py` | job CRUD、批量操作、启停、调度字段 |
| `runs.py` | 手动/自动 run、后台 worker、取消、结果写入 |
| `items.py` | raw/curated 查询、删除、批量删除、去重 |
| `health.py` | DB / X 健康探测、快照、缓存 |

重要约束：

- 新业务逻辑优先放进对应 mixin，不要重新堆回 `collector_service.py`
- 共享算法优先放 `common.py` 或更底层 helper
- mixin 共享状态统一经由：
  - `self.workspace_store`
  - `self.runtime_store`
  - `self.db_path`

### 5.3 其他关键文件

- `backend/collector_rules.py`：搜索规格规范化、查询生成、规则评估
- `backend/collector_store.py`：数据库 schema、连接、时间工具
- `backend/workspace_store.py`：workspace、task pack、runtime 状态的文件化存储
- `backend/source_identity.py`：去重 key 规则
- `backend/twitter_cli.py`：`twitter-cli` / `xreach` 适配与 fallback

---

## 6. 运行链路与搜索语义

### 6.1 CLI 与认证

当前默认搜索入口是：

- `twitter-cli`

当前辅助工具是：

- `xreach search`：当 `twitter-cli search` 失败时 fallback
- `xreach tweet <tweet_id> --json`：核心字段缺失时二次补全

认证来源：

- 正式入口：`.env` 中的 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0`
- 本机便利兜底：浏览器 Cookie 自动提取

注意：

- `xreach` 不会自己读浏览器 Cookie
- 项目代码会显式把 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 传给 `xreach`
- Docker 环境通常没有浏览器 Cookie，因此 `.env` 更关键

本机 / Docker 当前固定安装版本必须同步：

- `twitter-cli`：`git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7`
- `xreach-cli@0.3.0`

### 6.2 查询构造

当前默认约定：

- `language_mode: "zh_en"` 生成单条 `(lang:zh OR lang:en)` 查询
- 默认 `days_filter` 是最近 `1` 天
- 默认 `time_slice_minutes` 是 `60`
- 可选切片：`15 / 30 / 60 / 120 / 240`
- 默认 `max_results` 是 `100`

注意：

- `max_results` 是每个切片 query 的传参上限
- 实测单 query 仍常常只能拿到约 `40` 条
- 高频词要靠更细切片补历史数据

### 6.3 时间切片规则

- 只有有界 `days_filter` 才自动切片
- 自动切片会追加 `since_time:<秒> until_time:<秒>`
- `raw_query` 已带 `since:` / `until:` / `since_time:` / `until_time:` 时，不再叠加自动切片
- 总切片 query 上限是 `10000`

### 6.4 二次补全规则

只有以下核心字段缺失时才触发 `xreach tweet`：

- `author`
- `author_name`
- `text`
- `created_at_x`
- `views`
- `likes`
- `replies`
- `retweets`

以下字段缺失**不应**触发补全：

- `urls`
- `media`

### 6.5 手动运行

主链路：

1. `ManualSearchPage` 维护当前草稿
2. 前端调用 `POST /manual/run/start`
3. 后端创建后台 run
4. 前端轮询 `GET /runs/{id}`
5. 生成查询
6. 拉取搜索结果
7. run 内去重
8. 搜索条件过滤
9. 写 raw
10. 规则评估
11. 写 curated
12. curated 自动去重

### 6.6 自动任务

当前语义：

- `JobsPage` 管理 `workspace.json.jobs[]`
- job 通过 `pack_path` 指向 task pack
- `group_name` 属于 job，自身 tags 仍来自 pack
- scheduler 按固定 tick 扫描“已启用且到期”的任务
- `run_job_now()` 返回后台 run 的 `{ run_id, status }`
- “立即运行”和定时触发走同一套后台 run 模型

stale run 规则：

- 前端如果轮询 `GET /runs/{id}` 收到 `not found`
- 应把它当作过期 run id，而不是任务失败
- 应清掉 active run 并静默刷新 job

---

## 7. 去重与结果语义

### 7.1 去重 key

统一入口是：

- `backend/source_identity.py`

主要函数：

- `build_source_dedupe_key(...)`
- `build_source_dedupe_key_with_fallback(...)`

当前统一依赖 fallback helper 的路径：

- run 内结果去重
- raw 全表 dedupe
- curated 写入 dedupe key 生成

### 7.2 raw / curated

- run 内先做内存去重
- `raw` 保存通过搜索条件过滤后的原始结果
- `curated` 保存规则评估命中的结果
- `curated` 写入成功后自动执行全表去重
- `raw` 全表去重不会自动跑，只能手动触发

高级筛选当前在后端做内存过滤，并受行数保护常量约束。改动 filter tree 逻辑前先看：

- `backend/collector_service_parts/common.py`
- `web-ui/src/pages/results/resultsFilterState.ts`

---

## 8. HTTP API Reality

### 8.1 API 宿主

当前本地 HTTP API 使用 Flask 承载，入口是：

- `run/api.py`

它当前提供：

- 显式路由分发
- 统一 JSON 错误格式
- 本地 origin CORS 允许
- 可选 token 鉴权：`XDATA_API_TOKEN`
- 10MB body 大小限制

当前允许的本地 origin 规则：

- `localhost`
- `127.0.0.1`
- `::1`
- `*.localhost`

### 8.2 当前路由

配置与 task pack：

- `GET /workspace`
- `GET /workspace/export`
- `PUT /workspace`
- `POST /workspace/import`
- `GET /task-packs`
- `POST /task-packs`
- `GET /task-packs/{pack_name}`
- `PUT /task-packs/{pack_name}`
- `POST /task-packs/{pack_name}/delete`

健康与运行态：

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
- `POST /jobs`
- `POST /jobs/create`
- `POST /jobs/batch`
- `GET /jobs/{id}`
- `POST /jobs/{id}/update`
- `POST /jobs/{id}/toggle`
- `POST /jobs/{id}/run-now`
- `POST /jobs/{id}/run`
- `POST /jobs/{id}/delete`
- `POST /jobs/{id}/restore`
- `POST /jobs/{id}/purge`
- `POST /scheduler/tick`

规则与结果：

- `GET /rule-sets`
- `POST /rule-sets`
- `GET /rule-sets/{id}`
- `POST /rule-sets/{id}/clone`
- `POST /rule-sets/{id}/update`
- `POST /rule-sets/{id}/delete`
- `GET /items`
- `POST /items/query`
- `POST /items/delete`
- `POST /items/dedupe`
- `POST /items/{id}/delete`

补充说明：

- `rule-sets` API 仍保留，但更接近兼容目录
- 真实正文中心仍是 task pack，而不是独立 rule set 仓库

---

## 9. 前端架构

### 9.1 页面入口

当前有效页面：

- `#/dashboard`
- `#/manual`
- `#/jobs`
- `#/results`
- `#/logs`
- `#/settings`

页面导航采用 hash 深链：

- 非法 hash 回到 `dashboard`
- `localStorage` 只做兜底，不覆盖 hash

### 9.2 页面结构

当前页面入口文件：

- `web-ui/src/pages/DashboardPage.tsx`
- `web-ui/src/pages/ManualSearchPage.tsx`
- `web-ui/src/pages/JobsPage.tsx`
- `web-ui/src/pages/ResultsPage.tsx`
- `web-ui/src/pages/LogsPage.tsx`
- `web-ui/src/pages/SettingsPage.tsx`

#### Manual 页面

入口：

- `web-ui/src/pages/ManualSearchPage.tsx`

page-local 模块：

- `pages/manual/ManualSearchPageContent.tsx`
- `pages/manual/useManualSearchPageState.tsx`
- `pages/manual/ManualSearchPageHeader.tsx`
- `pages/manual/ManualDraftWorkspace.tsx`
- `pages/manual/ManualExecutionRail.tsx`
- `pages/manual/ManualResultsSection.tsx`

当前语义：

- 当前页面围绕“任务草稿”工作
- 草稿可绑定已有 pack，也可从文件导入
- 默认内部草稿标识是 `__default_draft__`

#### Jobs 页面

入口：

- `web-ui/src/pages/JobsPage.tsx`

page-local 模块：

- `pages/jobs/JobsPageContent.tsx`
- `pages/jobs/JobsListPane.tsx`
- `pages/jobs/JobWorkspace.tsx`
- `pages/jobs/JobsTable.tsx`
- `pages/jobs/useJobsRunState.ts`
- `pages/jobs/useJobsSelection.ts`
- `pages/jobs/jobDraft.ts`
- `pages/jobs/jobsTableConfig.tsx`

当前语义：

- 左侧是任务列表
- 右侧是任务工作区
- 自动任务负责调度，任务正文来自绑定 task pack

#### Results 页面

入口：

- `web-ui/src/pages/ResultsPage.tsx`

page-local 模块：

- `pages/results/ResultsPageContent.tsx`
- `pages/results/useResultsPageState.tsx`
- `pages/results/ResultsControlLayer.tsx`
- `pages/results/ResultsWorkspace.tsx`
- `pages/results/ResultsDataTable.tsx`
- `pages/results/ResultsDetailRail.tsx`
- `pages/results/ResultsFilterBuilder.tsx`
- `pages/results/ResultsTableManager.tsx`
- `pages/results/resultsFilterState.ts`
- `pages/results/resultsTableConfig.tsx`

当前语义：

- 支持 `raw` / `curated` 切换
- 支持关键词、高级筛选、排序、分页
- 支持列显隐、列宽拖拽、右侧详情、删除、去重

### 9.3 前端 API 类型

`web-ui/src/api.ts` 是前端 wire type 和 fetch wrapper 主文件。

接口 shape 改动前必须先看这里，不要在页面里复制一套不一致的类型。

### 9.4 结果页默认字段

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

补充：

- `canonical_url`、`summary_zh`、`author` 仍可显示，但不是默认首屏
- `canonical_url` 和 `source_url` 都应渲染为可点击链接
- 结果页列宽本地记忆键：`results.columnWidths.v1`
- 自动任务页列宽本地记忆键：`jobs.columnWidths.v1`

---

## 10. 先读哪里

理解后端主链路：

1. `run/api.py`
2. `backend/collector_service.py`
3. `backend/collector_service_parts/*.py`
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

1. `web-ui/src/pages/JobsPage.tsx`
2. `web-ui/src/pages/jobs/`
3. `backend/collector_service_parts/jobs.py`
4. `backend/collector_service_parts/runs.py`
5. `backend/workspace_store.py`
6. `run/scheduler.py`

改结果页：

1. `web-ui/src/pages/ResultsPage.tsx`
2. `web-ui/src/pages/results/`
3. `web-ui/src/api.ts`
4. `backend/collector_service_parts/items.py`
5. `backend/collector_service_parts/common.py`

改 task pack / rule set：

1. `backend/collector_service_parts/rules_taskpacks.py`
2. `backend/workspace_store.py`
3. `web-ui/src/pages/ManualSearchPage.tsx`
4. `web-ui/src/pages/manual/`

---

## 11. 常见坑与边界

### 11.1 Do

- 把 `backend.collector_service` 当公共入口
- 把 task pack 当搜索与规则正文真相
- 把 `raw` 理解为“通过搜索条件后的原始结果”
- 把 `author` 理解为 handle，而不是数字 user id
- 改 API shape 之前先改 `web-ui/src/api.ts`
- Windows 下写中文 `Markdown / TSX / JSON` 时优先用 `apply_patch` 或 Python UTF-8 写入

排查采集异常时优先分别看：

- `.env`
- 本机浏览器登录态
- `twitter-cli`
- `xreach`
- `/health`
- `runtime/history/search_runs.jsonl`

### 11.2 Don't

- 不要把 jobs、runs、health snapshot 回写进 `SQLite`
- 不要把 `xreach` 当默认搜索入口
- 不要因为 `urls` 或 `media` 缺失就触发补全
- 不要把 `collector_service.py` 重新堆回 god object
- 不要把被搜索条件排除的中间结果写进 `x_items_raw`
- 不要把 stale run id 的 `not found` 直接当失败

### 11.3 Git 边界

- 没有明确允许时，不要主动提交 commit
- 没有明确允许时，不要主动 push 远端
- 用户只说“提交至本地”时，只做本地 commit

默认通常应提交：

- `backend/`
- `run/`
- `tests/`
- `web-ui/src/`
- `config/README.md`
- `config/packs/default-rule-set.json`
- `.env.example`
- `.learnings/`

默认通常不应提交：

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

---

## 12. 默认验证

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

运行入口、服务编排、端口、健康相关逻辑变更后，额外检查：

```powershell
python services.py status
python -c "import json, urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=10)), ensure_ascii=False, indent=2))"
```

如果只是更新 `CLAUDE.md` 这类文档：

- 不需要跑后端或前端测试
- 但要至少做 UTF-8 读取和关键字检查
