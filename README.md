# X数据采集器

这是一个本地运行的 X 数据收集网页应用，主链路是：
`X 搜索 -> 规则筛选 -> SQLite 落库 -> 结果浏览 / 自动任务调度`

当前主仓只负责 X 采集、规则评估、本地 API、调度器和 SQLite 数据沉淀。
Notion 能力已迁出主仓；后续如需同步，可由独立仓库 `D:\Code\xdata-to-notion` 直接读取 `data/app.db` 实现。

## 快速启动

### 1. 准备本机依赖

先执行跨平台引导脚本：

```bash
python ./run/bootstrap.py
```

说明：
- `run/bootstrap.py` 会准备本机运行依赖，包括 `pipx`、`twitter-cli` 和 `agent-browser`
- 脚本不接受额外参数，直接运行即可
- 前端依赖仍由 `web-ui/package.json` 管理

### 2. 准备环境变量

```bash
cp .env.example .env
```

当前 `.env` 只保留 X 认证相关配置：
- `TWITTER_AUTH_TOKEN`
- `TWITTER_CT0`
- `TWITTER_BROWSER`
- `TWITTER_CHROME_PROFILE`

运行采集前，必须先填写 `TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`。

#### 如何获取 Cookie

1. 在浏览器中登录 `https://x.com`
2. 打开开发者工具
3. 进入 `Application` / `Storage` / `Cookies`
4. 选择 `https://x.com`
5. 找到 `auth_token` 和 `ct0`
6. 将 `auth_token` 填入 `.env` 的 `TWITTER_AUTH_TOKEN`
7. 将 `ct0` 填入 `.env` 的 `TWITTER_CT0`

安全提醒：
- `auth_token` 和 `ct0` 等同于登录态
- 不要提交到 git，也不要分享给他人
- 如果失效，需要重新从浏览器获取

补充说明：
- `TWITTER_BROWSER` 和 `TWITTER_CHROME_PROFILE` 只用于本地工具辅助读取或排障
- 它们不是默认必经配置，也不替代 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0`

### 3. 安装前端依赖

```bash
cd ./web-ui
npm install
cd ..
```

### 4. 启动开发主链路

推荐直接使用开发主链路服务总控脚本：

```bash
python ./run/services.py start
```

如需查看当前状态或关闭这些服务：

```bash
python ./run/services.py status
python ./run/services.py stop
python ./run/services.py restart
```

这会默认启动：
- `run/api.py`
- `run/scheduler.py`
- `web-ui` dev server

说明：
- `run/services.py` 默认只管理开发主链路（API、Scheduler、Dev UI），不包含 `run/static_web_server.py`
- 构建产物静态预览仍需单独运行 `python ./run/static_web_server.py --root dist`

打开 `http://127.0.0.1:5177/`。

## 服务说明

当前仓库常见的运行项一共有 4 类：

1. `run/api.py`
   - 本地后端 API
   - 默认监听 `127.0.0.1:8765`
   - 前端页面和手动操作都依赖它

2. `web-ui` dev server
   - 开发态前端
   - 默认监听 `127.0.0.1:5177`
   - 平时手动测试主要访问这个地址

3. `run/static_web_server.py`
   - 构建后前端静态服务
   - 默认监听 `127.0.0.1:5178`
   - 用于本地预览构建产物，不是日常开发主入口

4. `run/scheduler.py`
   - 后台轮询进程
   - 不监听端口
   - 默认每 30 秒执行一次 `tick()`

补充说明：
- 三个有端口的服务是 `8765`、`5177`、`5178`
- 日常开发最常用的三个进程通常是 API、Dev UI、Scheduler
- scheduler 没有端口，因为它不是 HTTP 服务，而是后台定时执行任务的进程

## 当前仓库结构

- `web-ui/`：前端单页应用
- `backend/`：核心业务、规则、SQLite 读写、X 搜索适配
- `run/`：运行入口、本机依赖准备脚本和服务总控脚本
- `data/`：数据库目录，当前只保留 `app.db`
- `runtime/`：运行日志与临时文件
- `artifacts/`：流程图、辅助资料和非源码材料
- `tests/`：当前自动化测试

## Git 提交边界

建议提交到 Git 的内容：
- `backend/`、`run/`、`tests/`、`web-ui/src/`
- `config/`、`artifacts/`
- `README.md`、`CLAUDE.md`、`.env.example`
- `runtime/README.md`
- `.learnings/`：作为项目级协作记忆保留提交，但不得写入真实 cookie、token 或一次性调试噪音

不应提交的本地内容：
- `.env`
- `data/*.db`
- `runtime/logs/`、`runtime/pids/`、`runtime/tmp/`
- `web-ui/node_modules/`、`web-ui/dist/`、`web-ui/.tmp-esbuild/`
- `__pycache__/`、`.pytest_cache/` 等缓存目录

原则：
- 提交源码、配置模板、文档和必要锁文件
- 不提交依赖、日志、数据库、运行输出和本机私有配置

## 验证命令

```bash
python -m pytest -c tests/pytest.ini tests
cd web-ui && npm run build
```
