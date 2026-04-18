# X数据采集器

这是一个本地运行的 X 数据采集、规则筛选、结果入库与 UI 浏览工具。

当前主链路：
`X 搜索 -> x_items_raw -> 规则评估 -> x_items_curated -> 结果浏览 / 自动任务`

## 快速开始

### 1. 准备本机依赖

```bash
python run/bootstrap.py
```

`run/bootstrap.py` 是唯一推荐的跨平台本机依赖准备脚本，默认安装 `pipx`、`twitter-cli` 和 `agent-browser`。

### 2. 准备环境变量

```bash
cp .env.example .env
```

必填 X Cookie：
- `TWITTER_AUTH_TOKEN`
- `TWITTER_CT0`

辅助字段：
- `TWITTER_BROWSER`
- `TWITTER_CHROME_PROFILE`

### 3. 安装前端依赖

```bash
cd web-ui
npm install
cd ..
```

### 启动开发主链路

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

## 当前边界

- `config/workspace.json` 是轻量工作区底座，只保存 `environment + jobs registry`
- `config/packs/*.json` 保存任务包，每个 pack 同时包含 `search_spec + rule_set`
- `runtime/history/search_runs.jsonl` 保存手动搜索和自动任务的运行记录
- `runtime/state/runtime_health_snapshot.json` 保存最近一次 DB / X 健康快照
- `runtime/state/sequences.json` 保存运行态序号
- `data/app.db` 只保留结果表 `x_items_raw` 和 `x_items_curated`
- `runtime/logs/` 保存 API、Scheduler、Web UI 的当前日志

## 主目录

- `web-ui/`：前端单页工作台
- `backend/`：采集、规则、存储、workspace/runtime 读写
- `run/`：运行入口、bootstrap 与服务总控
- `config/`：可版本化配置，包含轻量 `workspace.json` 与 `packs/`
- `runtime/`：运行态文件、日志、PID、临时产物
- `data/`：SQLite 数据库目录，正式保留 `app.db` 和 `README.md`
- `tests/`：自动化测试

## 数据与配置说明

- `workspace.json` 只保留环境配置和自动任务注册表
- `config/packs/*.json` 承载手动搜索与自动任务复用的 `search_spec + rule_set`
- 手动搜索页和自动任务页导入 pack 后，只替换当前表单；继续编辑不会自动回写原 pack
- 运行日志页读取 `runtime/history/search_runs.jsonl` 和 `runtime/logs/*.current.*.log`
- 运行总览读取 `runtime/state/runtime_health_snapshot.json`
- 结果浏览页可以切换查看 `x_items_raw` 与 `x_items_curated`
- 手动搜索的原始结果会进入 `x_items_raw`，只有命中规则的结果会进入 `x_items_curated`

## Git 边界

建议提交：
- `backend/`、`run/`、`tests/`、`web-ui/src/`
- `config/`、`artifacts/`
- `README.md`、`CLAUDE.md`、`data/README.md`、`runtime/README.md`、`.env.example`、`.learnings/`

不应提交：
- `.env`
- `data/*.db`
- `runtime/history/`、`runtime/state/`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/`
- `web-ui/node_modules/`、`web-ui/dist/`、`web-ui/.tmp-esbuild/`

## 验证命令

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm test
cd web-ui && npm run build
```
