# 项目背景与代码结构

## 一句话定位

这是一个本地运行的 X数据采集器，当前主链路是：`X 搜索 -> 规则筛选 -> SQLite 落库 -> 结果浏览 / 自动任务调度`。

说明边界：
- 以下内容只基于当前仓库代码与一次本地运行页面观察整理
- 已从代码确认的内容会直接陈述
- 带“判断”字样的内容表示基于代码结构做出的合理推断
- Notion 能力已迁出主仓；后续如需同步，默认由独立仓库 `D:\Code\xdata-to-notion` 直接读取 `data/app.db`

## 项目专用 Skill

在这个仓库工作时，涉及以下主题必须先使用 `xdata-collector-guardrails`：
- 启动或停止服务
- 目录命名、路径选择、兼容 shim 判断
- `web-ui` / `backend` / `run` 相关改动
- `.env`、X cookie、健康检查排障
- 文档更新、端口说明、验证命令选择

更新闭环要求：
- 如果这次工作暴露出新的 recurring gotcha、用户纠正、路径误判、端口误判、编码坑、残留进程坑、兼容层误用，先写入 `.learnings/project-pitfalls.md`
- 只有当该学习项已经稳定、可复用时，才同步回全局 skill `xdata-collector-guardrails`
- 不要把一次性日志、真实 cookie/token、私有配置值或临时调试结论直接写进 skill

## 项目目标与主流程

已确认的事实：
- 前端 `web-ui` 提供单页工作台，用来配置搜索参数、编辑规则集、手动执行采集、管理自动任务和浏览结果
- 后端通过本地 HTTP API 与 scheduler 驱动采集任务
- 核心搜索结果先落入 `x_items_raw`，再经规则评估进入 `x_items_curated`
- 当前系统不再承担 Notion 同步、Notion 去重或 Notion 健康检查
- 当前仓库默认要求在 `.env` 中提供 `TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`

一次手动采集的主流程：
1. 前端在 `web-ui/src/pages/ManualSearchPage.tsx` 收集 `SearchSpec` 和 `RuleSet`
2. 前端调用 `POST /manual/run`
3. `run/api.py` 转发给 `DesktopService.run_manual()`
4. `backend/collector_service.py` 规范化搜索配置并生成最终 X 查询语句
5. `backend/twitter_cli.py` 执行搜索，并把结果归一化成 `SearchResult`
6. 原始结果写入 `x_items_raw`
7. `backend/collector_rules.py` 做规则评估和互动门槛过滤
8. 命中结果写入 `x_items_curated`
9. 前端展示原始结果、命中结果、分数、等级和命中原因

判断：
- 当前产品目标更偏向“机会线索采集与本地沉淀”，而不是完整投研中台
- 项目已经从早期 CLI 工具阶段演进到“本地 API + scheduler + 单页工作台”的网页应用形态

## 架构分层

### 1. `web-ui`

职责：操作台与可视化层。

页面结构：
- `DashboardPage.tsx`：运行总览
- `ManualSearchPage.tsx`：手动搜索
- `JobsPage.tsx`：自动任务
- `ResultsPage.tsx`：结果浏览
- `LogsPage.tsx`：运行日志占位页
- `SettingsPage.tsx`：设置占位页

页面实测结论：
- 应用标题和浏览器标签页都是 `X数据采集器`
- 左侧导航是单页工作台模式，不是多路由站点
- 当前真实主线页面是：运行总览、手动搜索、自动任务、结果浏览
- 运行日志、设置仍然偏说明性占位

### 2. `run`

职责：主运行入口层。

当前结构：
- `run/api.py`：本地 HTTP API 主入口
- `run/scheduler.py`：调度器主入口
- `run/static_web_server.py`：构建后前端静态文件服务
- `run/bootstrap.py`：跨平台本机依赖准备脚本
- `run/services.py`：开发主链路服务总控脚本

已确认的事实：
- 旧 Notion 脚本 `sync_notion.py`、`dedupe_notion.py`、`ingest_x_latest_curated.py` 已从主仓移除
- 当前主产品相关运行入口已经统一收口到 `run/`
- `bootstrap.py` 是唯一的依赖准备入口，默认安装 `pipx`、`twitter-cli` 和 `agent-browser`
- `services.py` 默认只管理开发主链路（API、Scheduler、Dev UI），不包含 `run/static_web_server.py`

运行项说明：
- `run/api.py`：本地后端 API，默认监听 `127.0.0.1:8765`
- `web-ui` dev server：开发态前端，默认监听 `127.0.0.1:5177`
- `run/static_web_server.py`：构建后前端静态服务，默认监听 `127.0.0.1:5178`
- `run/scheduler.py`：后台轮询进程，不监听端口，默认每 30 秒执行一次 `tick()`
- `run/services.py`：开发主链路服务总控脚本，用于统一启动、停止、查看状态和重启

补充说明：
- 三个有端口的服务是 `8765`、`5177`、`5178`
- 日常开发最常用的三个进程通常是 API、Dev UI、Scheduler
- scheduler 没有端口，因为它不是 HTTP 服务，而是后台定时执行任务的进程

### 3. `backend`

职责：核心业务与适配层。

当前关键模块：
- `backend/collector_service.py`：后端编排核心
- `backend/collector_rules.py`：规则系统、查询构造、结果评估
- `backend/collector_store.py`：SQLite schema 与连接辅助
- `backend/twitter_cli.py`：X 搜索适配
- `backend/source_identity.py`：来源 URL 归一化与去重 key 生成
- `backend/opportunity_signals.py`：X 域内关键字与可信作者常量
- `backend/config.py`：`.env` 与搜索预设加载
- `backend/models.py`：数据模型

重点说明：
- `backend/collector_service.py` 是当前后端编排中枢，任务、规则、健康检查、运行和落库都从这里收口
- `backend/` 不再反向依赖 `run/` 或旧脚本入口
- `backend/twitter_cli.py` / `xreach` 链路默认依赖 `.env` 中提供的 X cookie；`TWITTER_BROWSER`、`TWITTER_CHROME_PROFILE` 只作为辅助排障提示

## SQLite 数据模型与职责

当前核心表：
- `search_jobs`：自动任务定义
- `search_runs`：采集运行记录
- `x_items_raw`：原始搜索结果池
- `x_items_curated`：规则命中结果池
- `rule_sets`：规则集定义
- `runtime_health_snapshot`：最近一次健康状态快照

一次手动采集的落库顺序：
1. 记录一次 `search_runs`
2. 原始结果写入 `x_items_raw`
3. 规则评估后的结果写入 `x_items_curated`
4. 刷新 `runtime_health_snapshot`

## 规则系统说明

当前规则系统分两层：
- `SearchSpec`：决定“搜什么”
- `RuleSetDefinition`：决定“如何筛选、如何打分、如何分级”

规则能力包括：
- 关键词、作者、语言、时间窗、互动阈值
- 是否要求媒体、是否要求外链
- 条件关系、动作、分数、等级提示

## 关键 API / 交互链路

当前主要 API：
- `GET /health`
- `GET /jobs`
- `GET /rule-sets`
- `GET /items`
- `POST /manual/run`
- `POST /jobs/create`
- `POST /jobs/{id}/update`
- `POST /jobs/{id}/toggle`
- `POST /jobs/{id}/run-now`
- `POST /jobs/{id}/delete`
- `POST /jobs/{id}/restore`
- `POST /jobs/{id}/purge`
- `POST /rule-sets`
- `POST /rule-sets/{id}/clone`
- `POST /rule-sets/{id}/update`
- `POST /rule-sets/{id}/delete`
- `POST /scheduler/tick`

前后端主交互链路：
- 手动搜索页发起采集请求
- API 调用 `DesktopService`
- 结果落库后回传前端
- 自动任务页通过 API 读写任务并触发 scheduler 相关动作
- 结果浏览页读取 `x_items_curated`

## 当前实现状态

成熟部分：
- `运行总览`：已经接上真实 DB / X 健康信息
- `手动搜索`：当前最重、最核心的操作页
- `自动任务`：具备查看、编辑、立即执行、启停、删除等完整工作流
- `结果浏览`：已接入真实结果池

较轻量部分：
- `结果浏览` 目前更像 curated 结果浏览器，交互深度有限
- `运行日志`、`设置` 仍偏占位

维护判断：
- 当前项目已经收口为纯 X 采集主仓
- 后续如果要做下游同步、归档或外部系统集成，建议在独立仓库完成，不再回灌到本仓

## Git 边界

版本控制边界约定：
- 应提交：`backend/`、`run/`、`tests/`、`web-ui/src/`、`config/`、`artifacts/`、文档、`.env.example`、`.learnings/`
- ?????`.env`?`data/*.db`?`runtime/logs/`?`runtime/pids/`?`runtime/tmp/`?`web-ui/node_modules/`?`web-ui/dist/`?????
- `.learnings/` 属于项目级协作知识，应纳入版本控制，但不能写入真实 cookie、token、账号或一次性调试噪音

## 维护建议与推荐阅读顺序

推荐阅读顺序：
1. `web-ui/src/pages/ManualSearchPage.tsx`
2. `run/api.py`
3. `backend/collector_service.py`
4. `backend/collector_rules.py`
5. `backend/collector_store.py`

维护建议：
- 改启动链路前，先确认 `run/` 下的主入口是否受影响
- 改认证或采集链路前，先检查 `.env` 和 `/health`
- 改文档时，优先避免 PowerShell 直接读写无 BOM UTF-8 中文文件
- 宣称完成前，至少跑 `python -m pytest -c tests/pytest.ini tests` 和 `cd web-ui && npm run build`
