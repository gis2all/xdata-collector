# XData Collector Agent Handbook

这是给 AI 接手项目用的最小真相集。详细启动和用户说明看 `README.md`；运行脚本看 `run/README.md`；前端看 `web-ui/README.md`；配置语义看 `config/README.md`；API 契约看 `docs/api/README.md`。

## 1. 项目定位

`XData Collector` 是本地运行的 `X / Twitter` 数据采集、规则筛选、结果浏览和调度工作台。

它负责：

- 构造查询，调用本机 `twitter-cli`，必要时用 `xreach` fallback / 补全
- 按搜索条件和规则筛选结果，写入本地 `SQLite`
- 管理 task pack、自动任务、运行历史、健康快照和 Web UI
- 提供本地 Flask HTTP API、scheduler、开发态 UI 和 Docker 运行方式

它不负责：

- 多用户权限系统
- 云端任务中心
- 下游投递平台
- 远程服务化部署平台

当前支持：Windows / Linux / macOS，本机运行和 Docker 运行。

文档契约固定字串，不要删除：`Windows / Linux / macOS`、`python doctor.py`、`DOCKER_PROXY_URL`。

## 2. 快速脑图

四个事实先记住：

1. `config/`、`runtime/`、`data/app.db` 一起构成系统真相，不是所有状态都在数据库里。
2. `backend/collector_service.py` 是公共 import 入口和组合层，真实职责拆在 `backend/collector_service_parts/*`。
3. 默认搜索入口是 `twitter-cli`；`xreach` 只是 fallback 和二次补全工具。
4. 标准启动顺序是 `python doctor.py` -> `python install.py` -> `python services.py start`。

默认端口：

- API: `127.0.0.1:8765`
- Dev UI: `127.0.0.1:5177`
- Static UI: `127.0.0.1:5178`

## 3. 目录地图

| 路径 | 作用 |
| --- | --- |
| `backend/` | 核心业务编排、规则、存储、CLI 适配 |
| `backend/collector_service_parts/` | `DesktopService` mixin 拆分后的业务模块 |
| `run/` | API、scheduler、静态预览、bootstrap 入口 |
| `web-ui/` | React 前端工作台 |
| `config/` | workspace 和 task pack 配置 |
| `runtime/` | 日志、PID、运行历史、健康快照、临时文件 |
| `data/` | 本地 SQLite 数据目录，核心是 `data/app.db` |
| `tests/` | 后端、服务、API、集成测试 |
| `docs/api/` | OpenAPI 和 API 文档 |

常用入口：

- `doctor.py`：环境自检
- `install.py`：安装本机依赖和前端依赖
- `services.py`：启动 / 停止 / 重启开发主链路
- `run/api.py`：本地 Flask HTTP API
- `run/scheduler.py`：后台调度器

## 4. Source of Truth

### `config/workspace.json`

本地 workspace 注册表，只承载：`version`、`meta`、`environment`、`jobs[]`。

约束：

- `jobs[]` 只保存自动任务注册信息。
- job 正文不在 workspace，正文来自绑定的 task pack。
- 不要把 run history、health snapshot、结果数据写回 workspace。

### `config/packs/*.json`

task pack 是手动页和自动任务页的搜索 / 规则正文真相。

固定语义：

- task pack = 搜索条件 + 规则 + tags。
- `tags` 会 `trim + lowercase + dedupe`。
- 手动 run 和自动 run 都继承当前 pack 的 tags。
- 结果表保存的是当次运行的 tags 快照；后续修改 pack 不回改历史结果。

Git 基线只保留 `config/README.md` 和 `config/packs/default-rule-set.json`。本地动态 pack、workspace 默认不提交。

### `runtime/`

运行态主真相在文件系统：

- `runtime/history/search_runs.jsonl`：run history 主存储
- `runtime/state/runtime_health_snapshot.json`：健康快照
- `runtime/state/sequences.json`：本地递增序列
- `runtime/logs/`、`runtime/pids/`、`runtime/tmp/`

前后端都必须容忍运行中断带来的短暂 stale 状态。

### `data/app.db`

当前数据库主表：

- `x_items_raw`
- `x_items_curated`

语义：

- `raw` 保存通过搜索条件后的原始结果。
- `curated` 保存规则评估命中的结果。
- 两张表都保留 `fetched_at` 和 `tags_json`；API 序列化为 `tags: string[]`。
- `author` 是 handle；`author_name` 是展示名。
- 不要把 jobs、task packs、run history、health snapshot 重新塞回 SQLite。

## 5. 后端架构

`backend/collector_service.py` 是公共 import 入口。测试 patch 路径统一使用 `backend.collector_service`，例如：

```python
patch("backend.collector_service.run_twitter_search")
```

`DesktopService` 当前组合关系：

```python
DesktopService(RuleTaskPackMixin, JobMixin, RunMixin, ItemMixin, HealthMixin)
```

mixin 职责：

| 文件 | 职责 |
| --- | --- |
| `common.py` | 共享 helper、过滤、排序、去重、并发限制 |
| `rules_taskpacks.py` | task pack / rule set CRUD |
| `jobs.py` | job CRUD、批量操作、启停、调度字段 |
| `runs.py` | 手动 / 自动 run、后台 worker、取消、结果写入 |
| `items.py` | raw / curated 查询、删除、批量删除、去重 |
| `health.py` | DB / X 健康探测、快照、缓存 |

规则：

- 新业务逻辑优先放进对应 mixin，不要堆回 `collector_service.py`。
- 共享算法放 `common.py` 或更底层 helper。
- workspace / runtime 文件状态通过 `backend/workspace_store.py` 管理。
- workspace 与 task pack 的检查和写入共享同一个可重入跨进程配置锁；涉及二者的复合操作必须放在同一事务中，不能先读后单独覆盖。
- 数据库 schema 和连接逻辑在 `backend/collector_store.py`。
- mixin 只允许显式导入依赖；不要恢复 `from .common import *`。`backend.collector_service` 继续显式重导出测试和集成使用的 patch 名称。

## 6. 搜索与运行语义

CLI：

- 默认搜索：`twitter-cli`
- fallback：`xreach search`
- 二次补全：`xreach tweet <tweet_id> --json`

认证：

- 正式入口是 `.env` 的 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0`。
- 浏览器 Cookie 自动提取只是本机便利兜底，不是跨平台承诺。

查询构造：

- `language_mode: "zh_en"` 生成单条 `(lang:zh OR lang:en)` query。
- 有界 `days_filter` 会按时间切片生成 `since_time` / `until_time` 查询。
- `raw_query` 已显式写时间操作符时，不叠加自动时间切片。
- 只有 `author`、`author_name`、`text`、`created_at_x` 或核心 metrics 缺失时才触发二次补全；不要因为 `urls` / `media` 缺失就补全。

运行：

- 手动页维护当前 task pack 草稿，执行时创建后台 run。
- 自动任务页管理 `workspace.json.jobs[]`，job 通过 `pack_path` 指向 task pack。
- “立即运行”和定时触发走同一套后台 run 模型。
- 前端轮询 `GET /runs/{id}` 收到 `not found` 时，把它当 stale run id，清掉 active run 并刷新，不要直接当任务失败。

## 7. 去重与结果语义

去重 key 的权威逻辑在 `backend/source_identity.py`。

当前策略：

1. 优先 tweet id。
2. 其次 canonical url / source url。
3. 再次稳定文本 identity。
4. 都没有时，用 `author | created_at | text[:120]` fallback。

`raw` 表保存搜索条件通过后的结果；`curated` 表保存规则命中后的结果。被搜索条件排除的中间结果不要写进 `x_items_raw`。

## 8. HTTP API

当前本地 HTTP API 使用 Flask，入口是 `run/api.py`。

保留的边界：

- 显式路由清单：`API_ROUTES`
- 统一 JSON 错误格式
- 本地 origin CORS 允许
- 可选 token 鉴权：`XDATA_API_TOKEN`
- Web UI token 只存当前浏览器会话的 `sessionStorage`，以 Bearer header 发送，不进入 workspace、URL、日志或构建变量
- 10MB body 大小限制

API 文档看 `docs/api/README.md` 和 `docs/api/openapi.json`。改 API shape 前先改 `web-ui/src/api.ts`，再改调用方和测试。

## 9. 前端架构

路由入口在 `web-ui/src/App.tsx`，有效页面：`dashboard`、`manual`、`jobs`、`results`、`logs`、`settings`。

当前页面入口文件：

- `web-ui/src/pages/DashboardPage.tsx`
- `web-ui/src/pages/ManualSearchPage.tsx`
- `web-ui/src/pages/JobsPage.tsx`
- `web-ui/src/pages/ResultsPage.tsx`
- `web-ui/src/pages/LogsPage.tsx`
- `web-ui/src/pages/SettingsPage.tsx`

复杂页面采用薄入口 + page-local 模块：

- Manual：`web-ui/src/pages/manual/`
- Jobs：`web-ui/src/pages/jobs/`
- Results：`web-ui/src/pages/results/`

页面职责：

- Manual：task pack 草稿、预览、执行、导入导出。
- Jobs：自动任务列表、调度状态、绑定 task pack、批量操作。
- Results：raw / curated 切换、筛选、排序、分页、列宽记忆、详情栏。
- Settings：只维护 `config/workspace.json`；搜索条件和规则正文不在这里编辑。

### 前端 UI 约束

- `DESIGN.md` 是 UI 视觉规范的唯一来源；改 UI 前先读它，不按单页临时判断。
- 全站只使用一种字体族：西文 `Inter`、中文 `Noto Sans SC`，回退系统无衬线字体；不引入 monospace 混排。
- 界面文案统一中文：不新增英文页面标题、英文 eyebrow 或重复描述性说明。
- 控件焦点态必须使用贴合边缘的绿色 2px outline（`outline-offset: 0`）。
- 品牌色是荧光绿 `#d9ff3f`；浏览器 favicon 是绿色 X（`web-ui/public/favicon.svg`）。
- 新增或修改前端页面后检查：中文文案、字号 / 字重 / 颜色层级、间距和控件边界、favicon 和品牌名称。

前端 API 类型源头是 `web-ui/src/api.ts`。`web-ui/src/collector.ts` 保留 UI 默认值、normalize、preview 和 rule builder helper。

## 10. 改动前先读哪里

- 后端主链路：`run/api.py` -> `backend/collector_service.py` -> `backend/collector_service_parts/*` -> `backend/workspace_store.py`
- 搜索链路：`backend/twitter_cli.py`、`backend/collector_rules.py`、`backend/collector_service_parts/runs.py`
- 自动任务：`web-ui/src/pages/jobs/`、`backend/collector_service_parts/jobs.py`、`run/scheduler.py`
- 结果页：`web-ui/src/pages/results/`、`web-ui/src/api.ts`、`backend/collector_service_parts/items.py`
- task pack / rule set：`backend/collector_service_parts/rules_taskpacks.py`、`backend/workspace_store.py`、`web-ui/src/pages/manual/`

## 11. Do / Don't

Do：

- 把 `backend.collector_service` 当公共入口。
- 把 task pack 当搜索与规则正文真相。
- 把 `raw` 理解为“通过搜索条件后的原始结果”。
- 把 `author` 理解为 handle，不是数字 user id。
- Windows 下写中文 `Markdown / TSX / JSON` 时优先用 `apply_patch` 或 Python UTF-8 写入。

Don't：

- 不要把 jobs、runs、health snapshot 写进 SQLite。
- 不要把 `xreach` 当默认搜索入口。
- 不要因为 `urls` 或 `media` 缺失就触发补全。
- 不要把 `collector_service.py` 重新堆回 god object。
- 不要把 stale run id 的 `not found` 当任务失败。

采集异常优先分别看：`.env`、浏览器登录态、`twitter-cli`、`xreach`、`/health`、`runtime/history/search_runs.jsonl`。

## 12. Git 边界

- 没有明确允许时，不要主动 commit。
- 没有明确允许时，不要 push 远端。
- 用户只说“提交至本地”时，只做本地 commit。

通常应提交：`backend/`、`run/`、`tests/`、`web-ui/src/`、`config/README.md`、`config/packs/default-rule-set.json`、`.env.example`。

通常不应提交：`.env`、`data/*.db`、`runtime/history/`、`runtime/state/`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/`、`web-ui/node_modules/`、`web-ui/dist/`、`.learnings/`、`docs/` 下除 `docs/api/` 以外的本地文档、本地动态 task pack。

## 13. 默认验证

后端：

```powershell
python -m pytest -c tests/pytest.ini tests
```

前端：

```powershell
cd web-ui; npm.cmd test
cd web-ui; npm.cmd run build
```

Python 编译检查按 CI 覆盖 `doctor.py`、`install.py`、`services.py`、`run/*.py`、`backend/*.py`、`backend/collector_service_parts/*.py`。

运行入口、服务编排、端口、健康相关逻辑变更后，额外检查：

```powershell
python services.py status
python -c "import json, urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=10)), ensure_ascii=False, indent=2))"
```

只改 `CLAUDE.md` 这类文档时，不需要跑全量后端或前端测试，但要做 UTF-8 读取和关键字检查。

## 14. CI 经验

CI 的第一判断单位是 job，不是整条 workflow。

排查顺序：

1. 先看失败 job 的第一条报错，不先猜。
2. 先复现最小失败，再跑对应 job 的同名命令。
3. 最后才跑全量验证，避免把一个回归扩成联动问题。

当前 CI 对齐：

- 后端：`py_compile`、`ruff check`、`pre_commit validate-config`、`pytest --cov`
- 前端：`npm ci`、`tsc --noEmit`、`eslint`、`vitest`、`playwright`、`build`
- Docker smoke 和 native smoke 分开看，不要混成一个根因。

高频坑：

- 前端测试异步加载后，断言必须等到真实数据回填；只等元素出现不够。
- `CLAUDE.md` / `README.md` 的契约字串是测试输入，不要删固定字串。
- 本地 `pip check` 里的既有环境冲突不自动等于本次改动回归；先以 CI 失败命令和日志为准。

常用复现：

```powershell
python -m pytest -c tests/pytest.ini tests --cov=backend --cov=run --cov=services --cov=doctor --cov-report=term-missing --cov-fail-under=75
cd web-ui; npm.cmd exec tsc -- -p tsconfig.app.json --noEmit
cd web-ui; npm.cmd run lint
cd web-ui; npm.cmd test
cd web-ui; npm.cmd run test:e2e
cd web-ui; npm.cmd run build
python -m pytest -c tests/pytest.ini tests/test_cross_platform_support.py -q
```
