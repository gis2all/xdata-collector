# XData Collector 项目踩坑记录

这个文件是 `xdata-collector-guardrails` 的事实来源。

规则：
- 默认使用中文记录新增学习项，方便项目协作者直接审阅。
- 只记录会影响实现、排障、启动、验证或文档的可复用踩坑点。
- 先在这里写下学习项，再判断是否应该提升到全局 skill。
- 不要存放真实 cookie、token 或其他敏感信息。
- 每一条都要包含：场景、错误做法、正确做法、影响和相关路径。

## 模板

新增踩坑记录时，默认使用以下结构：

```md
## PIT-XXX 标题

**场景**：
**错误做法**：
**正确做法**：
**影响**：
**相关路径**：
```

默认应该记录：
- 会长期影响功能的踩坑点
- 会导致启动或验证出错的踩坑点
- 会让后续协作者误判目录、入口、端口或产品边界的踩坑点

默认不需要记录：
- 一次性日志
- 私有 cookie、token、账号或其他数据
- 临时性网络失败
- 与项目长期边界无关的偶发问题

## PIT-001 主目录已经收口

**场景**：编辑目录结构、文档或启动命令时。
**错误做法**：把 `desktop-ui/`、`src/` 或 `scripts/` 当成当前仍在使用的主目录。
**正确做法**：当前主目录只看 `web-ui/`、`backend/` 和 `run/`。
**影响**：目录调整、文档编写、排障方向和入口选择。
**相关路径**：`web-ui/`、`backend/`、`run/`

## PIT-002 运行入口必须从 run 下取

**场景**：启动服务或更新 `run/` 相关文档时。
**错误做法**：先猜测旧脚本名或把历史 shim 当成真实入口。
**正确做法**：优先使用 `run/api.py`、`run/scheduler.py` 和 `run/static_web_server.py`。
**影响**：启动命令、文档、协作和排障。
**相关路径**：`run/api.py`、`run/scheduler.py`、`run/static_web_server.py`

## PIT-003 服务角色和端口必须写清楚

**场景**：重启服务或解释运行布局时。
**错误做法**：假设每个进程都有 HTTP 端口，或以为 scheduler 也会对外监听。
**正确做法**：API 是 `127.0.0.1:8765`，Dev UI 是 `127.0.0.1:5177`，Static UI 是 `127.0.0.1:5178`，scheduler 没有端口，默认 `tick-seconds=30`。
**影响**：启动、停止、健康检查、文档和排障。
**相关路径**：`run/api.py`、`run/scheduler.py`、`run/static_web_server.py`、`web-ui/vite.config.*`

## PIT-004 先检查 X cookie，再怀疑 UI

**场景**：采集失败、健康检查降级或结果为空时。
**错误做法**：还没检查 `.env` cookie 就先怪前端或 API。
**正确做法**：先检查 `.env` 里的 `TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`，然后再看 `/health`；`TWITTER_BROWSER` 和 `TWITTER_CHROME_PROFILE` 只是辅助字段。
**影响**：手动搜索、自动任务、健康检查和排障。
**相关路径**：`.env`、`.env.example`、`backend/collector_service.py`、`backend/twitter_cli.py`

## PIT-005 Windows 下 dev server 会留子进程

**场景**：重启前端或排查 `5177` 端口占用时。
**错误做法**：只关掉外层 `npm` / PowerShell 窗口，就认为 Vite 已经退出。
**正确做法**：检查 `node` / `vite` 子进程，并确认 `5177` 端口真的空出来了。
**影响**：前端重启、端口冲突、手动测试。
**相关路径**：`web-ui/`、`runtime/logs/`

## PIT-006 日志和临时文件不能漂回仓库根目录

**场景**：新增 run 脚本、重定向日志或做 smoke check 时。
**错误做法**：把日志或临时输出写回仓库根目录。
**正确做法**：日志放 `runtime/logs/`，临时文件放 `runtime/tmp/`。
**影响**：仓库整洁度、协作和排障。
**相关路径**：`runtime/logs/`、`runtime/tmp/`

## PIT-007 主仓的边界只是 X 采集

**场景**：描述产品范围、健康检查或 Dashboard 语义时。
**错误做法**：又把下游同步、投递或外部集成逻辑写回主仓叙事。
**正确做法**：这个仓库只负责 X 搜索、规则筛选、SQLite 存储、本地 API、Scheduler 和结果浏览；健康检查主要看 `summary`、`db` 和 `x`。
**影响**：README、CLAUDE、Dashboard、backend API 和排障。
**相关路径**：`backend/collector_service.py`、`web-ui/src/pages/DashboardPage.tsx`、`README.md`、`CLAUDE.md`

## PIT-008 PowerShell 显示乱码不一定代表文件已坏

**场景**：在 PowerShell 里查看中文 README、HTML 或 JSON 时。
**错误做法**：只因为终端里看起来是乱码，就认定文件本身被写坏了。
**正确做法**：先用 Python 按 UTF-8 读取文件确认，区分“显示链路出问题”和“文件真损坏”。
**影响**：文档修复、页面标题检查和 static file 排障。
**相关路径**：`README.md`、`CLAUDE.md`、`web-ui/index.html`、`web-ui/dist/index.html`

## PIT-009 声称改完之前先验证

**场景**：改了入口、命名、文档或启动流程后。
**错误做法**：只看 diff 或心里觉得没问题，就直接宣称“已完成”。
**正确做法**：先跑 `python -m pytest -c tests/pytest.ini tests` 和 `cd web-ui && npm run build`；如果涉及运行态变更，还要检查 `/health`、`5177` 和 `5178` 的实际响应。
**影响**：回归安全、协作信任和排障成本。
**相关路径**：`tests/pytest.ini`、`web-ui/package.json`、`run/api.py`、`run/static_web_server.py`

## PIT-010 停止服务要同时看进程和端口

**场景**：重启 API、Scheduler、Dev UI 或 Static UI 之前。
**错误做法**：只 kill 外层 wrapper，或者觉得窗口关了就等于服务停了。
**正确做法**：同时确认 `8765`、`5177`、`5178` 对应的进程状态和端口状态；Windows 下要额外留意 `node` / `vite` 子进程。
**影响**：重命名、重启和端口冲突排障。
**相关路径**：`run/api.py`、`run/scheduler.py`、`run/static_web_server.py`、`web-ui/`、`runtime/logs/`

## PIT-011 依赖准备入口已移到 bootstrap.py

**场景**：准备本机依赖、修缺 `twitter-cli` 或更新安装文档时。
**错误做法**：把旧的平台脚本当成主入口，或忘记在文档里写清楚依赖准备方式。
**正确做法**：直接使用 `python run/bootstrap.py`；它默认安装 `twitter-cli` 和 `agent-browser`，而且不接受额外参数。
**影响**：机器准备、README 和运行排障。
**相关路径**：`run/bootstrap.py`、`backend/twitter_cli.py`、`README.md`

## PIT-012 PowerShell 会给 JSON 文件带 UTF-8 BOM

**场景**：在 Windows 下用 PowerShell 编辑 `package.json`、lockfile 或其他 JSON 配置时。
**错误做法**：用 `Set-Content -Encoding UTF8` 写入，并且默认它会生成 BOM-free UTF-8 文件。
**正确做法**：处理 JSON 这类严格配置文件时，优先用 Python `utf-8` 或其他 BOM-free 写入方式；如果文件在小改后突然无效，先检查 BOM。
**影响**：前端 build、配置解析、npm 和 Vite 行为。
**相关路径**：`web-ui/package.json`、`web-ui/package-lock.json`

## PIT-013 services.py 只管理开发主链路

**场景**：通过运行控制脚本启动或停止全部服务时。
**错误做法**：以为 `run/services.py` 会默认管到 `run/static_web_server.py` 或其他 build-preview 进程。
**正确做法**：把 `run/services.py` 当成 API、Scheduler 和 Dev UI 的控制器；`run/static_web_server.py` 仍然是单独的预览工具。
**影响**：启动预期、文档、排障和端口检查。
**相关路径**：`run/services.py`、`run/static_web_server.py`、`run/README.md`、`README.md`

## 文档编码踩坑

- 场景：在 Windows PowerShell 里用 here-string 写中文 Markdown。
- 错误做法：把中文原文直接通过 PowerShell here-string 管道喂给 `python -`，或者直接用 PowerShell 写文件。
- 正确做法：优先用 Python 直接以 UTF-8 写文件；如果终端编码不稳，则使用 ASCII 或 Unicode 转义的方式插入中文。
- 影响：`README.md`、`CLAUDE.md`、JSON / config 模板和其他仓库文档都可能被写成 `?`。
- 相关路径：`README.md`、`CLAUDE.md`、`.learnings/project-pitfalls.md`

## PIT-014 PowerShell 可能把 TSX 里的中文写成问号

**场景**：在 Windows shell 里生成或重写 `web-ui/src/pages/*.tsx` 这类前端文件时。
**错误做法**：用 PowerShell here-string 直接写中文 JSX 字面量，并且假设文件会继续保持 UTF-8 正常。
**正确做法**：对脚本生成的中文 UI 文本，优先用 ASCII-safe 编辑方式，例如 Python 写入 BOM-free UTF-8 配合 `\u` 转义。
**影响**：React 页面和测试文件可能在逻辑没错的情况下，视觉文案却变成 `?`。
**相关路径**：`web-ui/src/pages/LogsPage.tsx`、`web-ui/src/pages/*.test.tsx`

## PIT-015 data 目录只能留 `app.db`

**场景**：新增测试、临时导出或 debug 产物时。
**错误做法**：把 `data/` 当成通用工作目录，随手往里面丢测试 DB、日志快照、JSON 导出或说明垃圾。
**正确做法**：`data/` 只保留运行 DB `app.db` 和官方说明 `data/README.md`；服务日志放 `runtime/logs/`，PID 放 `runtime/pids/`，test 临时文件放 `runtime/tmp/tests/`。
**影响**：仓库结构、清理安全、文档和测试隔离。
**相关路径**：`data/app.db`、`data/README.md`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/tests/`、`tests/test_collector_service.py`

## PIT-016 workspace.json 必须保持轻量，packs 承载搜索 / 规则正文

**场景**：调整手动搜索导入、rule set、preset、job 定义或 import/export 行为时。
**错误做法**：又把 `search_spec` 和 `rule_set` 正文塞回 `workspace.json`、localStorage、SQLite 配置表，或者到处散落 preset 文件。
**正确做法**：`config/workspace.json` 只保留轻量 environment 和 jobs registry；可复用的 `search_spec + rule_set` 正文放到 `config/packs/*.json`；runtime state 放 `runtime/history/` 和 `runtime/state/`；SQLite 只保留 `x_items_raw` 和 `x_items_curated`。
**影响**：Settings 页、Manual Search 页、Jobs 页、迁移行为、Git 边界和文档。
**相关路径**：`config/workspace.json`、`config/packs/`、`backend/workspace_store.py`、`runtime/history/search_runs.jsonl`、`runtime/state/runtime_health_snapshot.json`、`runtime/state/sequences.json`、`data/app.db`

## PIT-017 config 目录不应默认绑定具体任务

**场景**：设计仓库默认配置、整理 `.gitignore` 或清理 `config/` 边界时。
**错误做法**：把 `config/workspace.json`、`config/packs/job-*.json`、`config/packs/manual-preset-*.json` 这类本地动态或具体业务配置继续作为 Git 基线长期跟踪。
**正确做法**：仓库里的 `config/` 只保留通用基线，例如 `config/README.md` 和 `config/packs/default-rule-set.json`；具体 job pack、manual preset pack 和本地 workspace 应作为本地动态配置忽略；旧的 `search_presets*.json` 不再作为仓库默认配置，也不再进入 bootstrap 主链路。
**影响**：Git 噪音、clone 后默认状态、配置通用性、文档和 bootstrap 行为。
**相关路径**：`.gitignore`、`config/README.md`、`config/workspace.json`、`config/packs/`、`backend/workspace_store.py`

## PIT-018 临时方案文档和 Worktree 不要漂出默认边界

**场景**：记录设计草稿、实现计划、临时 spec，或准备隔离一个短期前端/文档任务时。
**错误做法**：把临时方案文档重新散落到根目录 `docs/`，或继续默认使用 `git worktree` 维护第二套本地工作副本。
**正确做法**：临时 spec / plan / design 文档统一落在 `artifacts/design/{specs,plans}`，根目录 `docs/` 不再使用；默认只在当前主工作区工作，不再新建 `git worktree`，避免状态漂移和额外同步成本。
**影响**：主目录结构稳定性、Git 边界清晰度、本地状态同步成本、临时资料查找效率。
**相关路径**：`artifacts/README.md`、`artifacts/design/`、`CLAUDE.md`、`.gitignore`
