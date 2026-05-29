# XData Collector Agent Handbook

## 1. 项目定位

`XData Collector` 是一个本地运行的 `X` 数据采集与规则筛选工作台。它负责：

- `X` 搜索
- 搜索结果补全
- 搜索条件过滤
- 规则评估
- `SQLite` 结果沉淀
- 本地 `HTTP API`
- 定时调度
- `Web UI`

它**不负责**下游投递链路、外部业务编排平台或远端服务端化部署。改代码时，不要把这些职责写回主仓。

如果只想先抓住项目主线，先记住三件事：

1. 真相分散在 `config/`、`runtime/` 和 `data/app.db`，不是全在数据库里。
2. 后端编排中枢是 `backend/collector_service.py`。
3. 默认搜索入口是 `twitter-cli 0.8.6`，`xreach` 只是 fallback 和二次补全工具。

## 2. 60 秒建立脑图

### 主目录

| 路径 | 作用 |
| --- | --- |
| `run/` | 运行入口和轻量服务门面 |
| `backend/` | 核心编排、规则、存储、搜索适配 |
| `web-ui/` | 前端工作台 |
| `config/` | 基线配置、本地 workspace、task pack |
| `runtime/` | 运行态日志、历史、快照、PID、临时文件 |
| `data/` | 正式数据目录，核心是 `data/app.db` |

### 默认运行常量

- API：`127.0.0.1:8765`
- Dev UI：`127.0.0.1:5177`
- Static UI：`127.0.0.1:5178`
- Scheduler：无端口，默认 `tick-seconds=30`
- 常用入口：
  - `python install.py`
  - `python services.py start`
  - `python services.py restart`

默认调试环境是 **Windows 本机服务**，不是 Docker。`services.py` 默认只管 API、Scheduler、Dev UI，不包含 `run/static_web_server.py`。

## 3. Source of Truth

### `config/workspace.json`

这是本地 workspace 底座，不是全量业务快照。它只应该承载：

- `version`
- `meta`
- `environment`
- `jobs[]`

`jobs[]` 是自动任务注册表，保存的是任务注册信息而不是任务正文。当前应关注的字段包括：

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
- job 的 `tags` 真相不在 `workspace.json`，而是来自任务绑定的 task pack。

### `config/packs/*.json`

task pack 是手动搜索页和自动任务页的正文真相。每个 pack 当前都应包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `tags`
- `search_spec`
- `rule_set`

当前语义：

- `任务包 = 搜索条件 + 规则 + tags`
- `tags` 是任务包级标签，规范化为 `trim + lowercase + dedupe`
- `rule_set` 当前以内嵌正文形式保存在 task pack 里
- 手动运行和自动运行都会继承当前 pack 的 `tags`
- 结果表保存的是**当次运行的 tags 快照**
- 之后再修改 pack，不会回改历史结果
- Git 基线里默认只保留 `config/packs/default-rule-set.json`
- 其他 job pack、manual preset、manual rule-set 都属于本地动态配置

### `runtime/`

运行态主要落文件系统，不落 `SQLite`。关键路径：

- `runtime/history/search_runs.jsonl`
- `runtime/state/runtime_health_snapshot.json`
- `runtime/state/sequences.json`
- `runtime/logs/`
- `runtime/pids/`
- `runtime/tmp/`

### `data/app.db`

当前业务真相只有两张结果表：

- `x_items_raw`
- `x_items_curated`

不要把 jobs、rule sets、health snapshot 或 run history 再写回 `SQLite` 作为主真相。

结果表当前语义：

- `raw` 和 `curated` 都保留 `fetched_at`
- `raw` 和 `curated` 都保留 `tags_json`，API 出口序列化成 `tags: string[]`
- `author` 表示作者 `handle / screenName`
- `author_name` 表示作者展示名
- `raw` 只保存**通过搜索条件过滤后的原始结果**
- `raw` 只做单次 run 内存去重，不做成功后的全表自动去重
- `curated` 每次成功写入后会自动执行一次全表去重
- `raw` 全表去重只能通过结果页或 `POST /items/dedupe` 手动触发

## 4. System Map

### 入口层

- `install.py`：首次安装入口
- `services.py`：本机开发主入口
- `run/bootstrap.py`：依赖准备
- `run/api.py`：本地 `HTTP API`
- `run/scheduler.py`：固定 tick 调度器
- `run/static_web_server.py`：前端构建产物预览

### `backend/`

- `backend/collector_service.py`：后端编排中枢，所有主流程入口都汇到这里
- `backend/collector_rules.py`：搜索规格规范化、查询生成、规则评估
- `backend/collector_store.py`：`x_items_raw` / `x_items_curated` schema 与数据库连接
- `backend/workspace_store.py`：workspace、task pack、runtime state 的文件化存储
- `backend/twitter_cli.py`：`twitter-cli` / `xreach` 搜索适配与补全

### `web-ui/`

- `DashboardPage`：运行总览
- `ManualSearchPage`：手动搜索、草稿、task pack 保存与导入
- `JobsPage`：自动任务列表、绑定 pack、实时进度、停止运行
- `ResultsPage`：`raw / curated` 双表浏览、筛选、删除、去重
- `LogsPage`：run 历史、运行日志、running run 轮询、停止运行
- `SettingsPage`：workspace 级轻量设置

## 5. Search Pipeline

### 认证依赖

- `TWITTER_AUTH_TOKEN`：只给 `xreach search` / `xreach tweet` 用
- `TWITTER_CT0`：只给 `xreach search` / `xreach tweet` 用

它们**不会**直接影响默认的 `twitter-cli search`。

### 默认搜索链路

- 默认入口是 `twitter-cli 0.8.6`
- 安装来源应是 `git+https://github.com/public-clis/twitter-cli.git`
- 本机安装和 Docker 安装都应保持这个口径
- `xreach search` 只作为 `twitter-cli search` 失败后的 fallback

### 查询构造规则

- 语言模式 `zh_en` 会生成单条 `(lang:zh OR lang:en)` 查询
- 默认 `days_filter` 是最近 `1` 天
- 默认 `time_slice_minutes` 是 `60`
- 可选时间切片：`15 / 30 / 60 / 120 / 240`
- 默认 `max_results` 是 `100`

重要细节：

- `max_results` 是**每个时间切片 query 的传参上限**
- `twitter-cli search` 实测单个 query 通常仍只会返回约 `40` 条
- 高频词即使 `max_results=100`，也仍然可能靠更细切片来补历史数据

### 时间切片规则

- 只有**有界** `days_filter` 才会自动切片
- 自动切片会追加 `since_time:<秒> until_time:<秒>`
- 如果 `raw_query` 已显式包含 `since:`、`until:`、`since_time:`、`until_time:`，则不再叠加自动切片
- 时间切片 query 总上限是 `10000`

### 二次补全规则

`xreach tweet <tweet_id> --json` 只在核心字段缺失时触发补全。当前核心字段是：

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

补充说明：

- 这里的 `urls` 指推文正文里的外部链接
- 它不是推文自身的 `canonical_url`

## 6. Main Workflows

### 手动搜索

1. `ManualSearchPage` 维护一个当前草稿，可绑定已有 task pack，也可从本地导入。
2. 默认会有一个内部标识为 `__default_draft__` 的 `默认草稿`，它不可删除。
3. 草稿正文由 `search_spec + rule_set + tags` 组成。
4. 列表型输入当前采用“编辑期保留原始文本，失焦后再规范化”的策略：
   - 逗号、中文逗号、换行才是分隔符
   - 普通空格保留在条目内部
5. 前端默认调用 `POST /manual/run/start` 启动后台 run，再轮询 `GET /runs/{id}`。
6. 同步入口 `POST /manual/run` 仍保留，但前端主路径已不是它。
7. `run_manual()` 的主链路是：生成查询 -> 拉取搜索结果 -> 单次 run 去重 -> 应用搜索条件过滤 -> 写 `raw` -> 评估规则 -> 写 `curated`。

### 自动任务

1. `JobsPage` 维护 `workspace.json.jobs[]` 的注册信息。
2. 每个 job 通过 `pack_path` 指向一个 task pack。
3. `group_name` 是 job 自身字段，`tags` 来自绑定 pack。
4. scheduler 按固定 tick 扫描“已启用且到期”的 job。
5. `run_job_now()` 会先创建后台 run，再返回 `{ run_id, status }`。
6. 定时触发和“立即运行”走同一套后台 run 模型。
7. 运行中的 job 可以在 `JobsPage` 右侧工作区或 `LogsPage` 中停止，对应 `POST /runs/{id}/cancel`。

### 结果浏览

1. `ResultsPage` 默认打开 `raw` 表。
2. 当前筛选模型是“关键词 + 高级筛选条件树”：
   - 关键词始终可见
   - 高级筛选默认折叠
   - 条件树支持 `AND / OR`
   - 支持文本、数字、时间、布尔、标签等条件
3. 前端当前主路径是 `POST /items/query`，由后端先整表过滤，再分页返回结果。
4. `GET /items` 仍保留，但更接近兼容入口。
5. 结果表支持：
   - 排序
   - 列显隐
   - 本地视图记忆
   - 列宽拖拽
   - 单条删除
   - 批量删除
   - 去重
6. 表格已经隐藏 `操作` 列；单条操作放在右侧详情栏。

### 运行总览与日志

1. `DashboardPage` 刷新页面时不会自动调用 `/health`。
2. 首屏只恢复浏览器本地缓存状态。
3. 只有显式点击“重新加载”才会调用 `GET /health`。
4. `GET /health/snapshot` 是后端只读快照接口，不是 Dashboard 首屏默认来源。
5. `LogsPage` 会在存在 `running` run 时静默轮询 run 列表，并允许停止当前运行。
6. Windows 下 `twitter-cli` 和 `xreach` 子进程统一走无窗口方式，避免校验或刷新时弹黑窗。

## 7. UI / API Reality

### 页面与导航

- 当前有效页面：
  - `#/dashboard`
  - `#/manual`
  - `#/jobs`
  - `#/results`
  - `#/logs`
  - `#/settings`
- 导航采用 hash 深链
- 非法 hash 会回到 `dashboard`
- `localStorage` 只是兜底，不覆盖 hash

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

- `canonical_url`、`summary_zh`、`author` 仍可显示，但不再是默认首屏字段
- `canonical_url` 和 `source_url` 在表格里都应渲染为可点击链接
- 结果页列宽本地记忆键是 `results.columnWidths.v1`
- 自动任务表列宽本地记忆键是 `jobs.columnWidths.v1`

### 右侧详情栏

`raw` 右侧“采集信息”当前包含：

- `作者名称`
- `作者ID`
- `任务TAGS`
- `查询名称`
- `运行 ID`
- `推文 ID`
- `推文链接`
- `发推时间`
- `采集时间`

`curated` 右侧“记录信息”当前包含：

- `状态`
- `等级`
- `任务TAGS`
- `作者名称`
- `作者ID`
- `发推时间`
- `采集时间`
- `来源链接`
- `去重键`

显示语义：

- 作者展示遵循 `author_name + @author`，缺少展示名时只显示 `@author`
- `任务TAGS` 使用彩色 tag pill
- `发推时间` 对应 `created_at_x`
- `推文链接` 和 `来源链接` 都应是可点击链接

### 关键接口

配置与任务包：

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

- `rule-sets` 仍保留，但更接近从 builtin + task packs 派生出来的兼容目录
- `GET /rule-sets`
- `GET /rule-sets/{id}`
- `GET /items`
- `POST /items/query`
- `POST /items/{id}/delete`
- `POST /items/delete`
- `POST /items/dedupe`

## 8. 常见坑

### Do

- 把 `collector_service` 当成后端主入口来读
- 把 task pack 当成搜索与规则正文真相
- 把 `raw` 理解为“通过搜索条件后的原始结果”
- 把 `author` 理解为作者 handle，而不是数字 user id
- 排查搜索异常时分别看 `twitter-cli`、`xreach`、`.env` 和 `/health`

### Don't

- 不要把 jobs、runs、health snapshot 回写进 `SQLite`
- 不要把 `xreach` 当默认搜索入口
- 不要因为 `urls` 或 `media` 缺失就触发二次补全
- 不要把 `config/` 回退成“业务任务快照仓库”
- 不要把被搜索条件排除的中间结果再写进 `x_items_raw`
- 不要假设刷新 Dashboard 会自动调 `/health`
- 不要把 `runtime/`、`data/*.db`、本地动态 packs 提交进 Git

## 9. 先读哪里

如果你要理解后端主链路，按这个顺序读：

1. `run/api.py`
2. `backend/collector_service.py`
3. `backend/workspace_store.py`
4. `backend/collector_rules.py`

如果你要改搜索链路，优先看：

1. `backend/twitter_cli.py`
2. `backend/collector_rules.py`
3. `backend/collector_service.py`
4. `tests/test_twitter_cli.py`
5. `tests/test_collector_service.py`

如果你要改结果页，优先看：

1. `web-ui/src/pages/ResultsPage.tsx`
2. `web-ui/src/pages/results/ResultsDetailRail.tsx`
3. `web-ui/src/api.ts`
4. `backend/collector_service.py`

如果你要改自动任务，优先看：

1. `web-ui/src/pages/JobsPage.tsx`
2. `backend/collector_service.py`
3. `backend/workspace_store.py`
4. `run/scheduler.py`

## 附录 A：协作约束

- 做前端视觉、布局或交互调整时，优先遵循 `DESIGN.md`
- 如果当前实现已经变了，应在同一轮同步更新 `DESIGN.md`
- 启动、端口、健康检查口径默认以 `install.py` / `services.py` 为准
- 后续 UI 联调默认走 Windows 本机服务，不默认切回 Docker
- 方案与计划文档当前真实路径是：
  - `docs/superpowers/specs/`
  - `docs/superpowers/plans/`
- 默认只在当前主工作区工作；除非用户明确要求，否则不要启用 `git worktree`
- 在 Windows 上改中文 `Markdown`、`TSX`、`JSON` 时，注意 PowerShell 乱码和 BOM 风险

## 附录 B：Git 边界

- 没有用户明确允许时，不要主动提交 commit
- 没有用户明确允许时，不要主动 push 远端
- 如果用户只说“提交至本地”，只做本地 commit

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

## 附录 C：默认验证

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```

如果改了运行入口、端口说明、服务编排或健康相关逻辑，额外检查：

- `python services.py status`
- `http://127.0.0.1:8765/health`
- `http://127.0.0.1:5177/`
