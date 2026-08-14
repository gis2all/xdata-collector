# X数据采集器

[![CI](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml)
[![Backend Coverage](https://img.shields.io/endpoint?url=https://gis2all.github.io/xdata-collector/backend-coverage.json)](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

跨平台运行的 `X / Twitter` 数据采集与规则筛选工作台：定义任务、定时采集、规则筛选，结果存入本地数据库，通过 `Web UI` 浏览与复盘。

![Workbench Screenshot](artifacts/diagrams/readme-workbench.png)

## 核心能力

- 基于本地 `twitter-cli` 执行搜索，失败时自动回退 `xreach`，并补全缺失字段
- 可视化构造查询：关键词、精确短语、排除词、作者、语言、时间范围与指标门槛
- 规则引擎按条件打分分级（S / A / B），支持排除规则与命中原因回放
- 手动运行与自动任务定时调度，支持取消、并发限制与孤儿运行恢复
- 原始结果与规则命中结果分表存储（raw / curated），统一去重后写入本地数据库
- `Web UI` 工作台：结果筛选、排序、分页、详情浏览与列宽记忆
- 本地健康检查与运行日志视图，快速定位采集异常
- 本机与 Docker 两种运行方式，跨 Windows / Linux / macOS

## 技术栈

| 技术 | 职责 |
| --- | --- |
| Python / Flask | 本地 HTTP API 与后台调度 |
| SQLite | raw / curated 结果数据存储 |
| twitter-cli | 默认搜索入口 |
| xreach-cli | fallback 搜索与字段补全 |
| React / Vite | Web UI 工作台 |
| Vitest / Playwright | 前端单元测试与浏览器回归 |
| Docker Compose | 容器化运行 |

## 快速开始

> ⚠️ 不要使用个人 `X` 主账号！ 现有使用经验表明一定会触发限制，测试账号虽然限制但仍可获取数据。

### 前置：准备 X Cookie

在已登录 `https://x.com` 的浏览器开发者工具里，从 `Application -> Storage -> Cookies -> https://x.com` 取出 `auth_token` 和 `ct0`，写入项目根目录 `.env` 文件（Cookie 过期、账号风控或浏览器 Cookie 解密失败都会影响采集稳定性）：

```env
TWITTER_AUTH_TOKEN=你的 auth_token
TWITTER_CT0=你的 ct0
```

### 一、本机方式

已安装 `Python` 和 `Node.js / npm` 后，依次执行：

```text
python doctor.py
python install.py
python services.py start
```

启动后访问工作台 `http://127.0.0.1:5177`，健康检查见 `http://127.0.0.1:8765/health`。API 鉴权默认关闭；需要限制本机其他进程调用时，在 `.env` 设置可选的 `XDATA_API_TOKEN`，再到工作台 `Settings` 输入同一值。token 只保存在当前浏览器会话的 `sessionStorage`，不写入 workspace 或 URL。

### 二、Docker 方式

```text
docker compose up --build
```

同样启动 API、Scheduler 和 Web UI，访问工作台 `http://127.0.0.1:5177` 或 API `http://127.0.0.1:8765`。Compose 默认挂载 `config/`、`data/`、`runtime/` 和 `.env`；宿主机端口固定绑定 `127.0.0.1`，仅供本机访问。停止容器：`docker compose down`。未设置 `DOCKER_PROXY_URL` 时，不注入代理环境变量；需要代理时，先将其设为可用代理地址，再运行 `docker compose up --build`。`XDATA_API_TOKEN` 的用法见「一、本机方式」。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `python doctor.py` | 检查 Python、Node/npm、CLI、`.env`、Docker 和端口状态 |
| `python install.py` | 安装 twitter-cli / xreach-cli 并准备前端依赖 |
| `python services.py start` | 启动 API、Scheduler 和 Dev UI |
| `python services.py stop` | 停止服务 |
| `python services.py restart` | 重启服务 |
| `python services.py status` | 查看服务状态 |

默认端口：API `127.0.0.1:8765`、开发态 Web UI `127.0.0.1:5177`、静态预览 `127.0.0.1:5178`。

## 架构

```text
search_spec / task pack
  -> 查询构造（关键词 · 时间切片 · 语言 · 指标门槛）
  -> twitter-cli 搜索（失败自动回退 xreach，缺失字段二次补全）
  -> 规则筛选（打分分级 / 排除规则）
  -> raw / curated 分表写入 SQLite（统一去重）
  -> Web UI（5177）<-> API（8765）<-> Scheduler
```

系统真相分三处：`config/` 保存 workspace 与 task pack 配置，`runtime/` 保存运行历史与健康快照，`data/app.db` 保存采集结果。

## 目录结构

```text
backend/              核心业务：搜索、规则、存储、任务与运行
run/                  API、Scheduler、静态预览入口
web-ui/               React 前端工作台
config/               workspace 与 task pack 配置
runtime/              日志、运行历史、健康快照
data/                 本地 SQLite 数据（data/app.db）
tests/                后端与服务测试
docs/api/             OpenAPI 与 API 文档
```

## 配置与数据

- `.env`：`TWITTER_AUTH_TOKEN` / `TWITTER_CT0` 认证，可选 `XDATA_API_TOKEN`
- `config/workspace.json`：自动任务注册信息
- `config/packs/*.json`：task pack，搜索条件与规则正文
- `runtime/`：运行历史、健康快照、日志与 PID
- `data/app.db`：raw / curated 结果数据

## 更多文档

- [`DESIGN.md`](DESIGN.md)：UI 设计规范
- [`CLAUDE.md`](CLAUDE.md)：项目真相、架构与维护手册
- [`run/README.md`](run/README.md)：运行入口、端口与服务边界
- [`web-ui/README.md`](web-ui/README.md)：前端启动与测试
- [`config/README.md`](config/README.md)：workspace 与 task pack 语义
- [`docs/api/README.md`](docs/api/README.md)：API 契约与鉴权约定

## 许可证

[MIT License](LICENSE)

更完整的项目上下文、架构决策与维护手册见 [`CLAUDE.md`](./CLAUDE.md)。
