# X数据采集器

[![CI](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml)
[![Backend Coverage](https://img.shields.io/endpoint?url=https://gis2all.github.io/xdata-collector/backend-coverage.json)](https://github.com/gis2all/xdata-collector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

跨平台运行的 `X` 数据采集与规则筛选工作台，用于定义任务、采集 `X` 数据、按规则筛选结果，并将数据沉淀至数据库，再通过 `Web UI` 进行浏览、复盘与调度。

![Workbench Screenshot](artifacts/diagrams/readme-workbench.png)

## 产品概览

该项目覆盖一条完整数据采集工作流程：

1. 定义任务：维护关键词、时间范围、过滤条件、规则和标签
2. 采集数据：手动运行，或者按自动任务定时执行
3. 筛选结果：把原始搜索结果和规则命中结果分别沉淀下来
4. 浏览复盘：在工作台里查看结果、运行状态和日志

典型使用场景包括：

- 想持续跟踪某一类 `X` 信息流
- 想把搜索和筛选逻辑固化成可重复执行的任务
- 想在本地保留一份可查询、可复盘的结果库

该仓库定位为数据采集工作台，不负责下游投递平台。

## 快速开始

> 不要使用个人 `X` 主账号！ 现有使用经验表明一定会触发限制，测试账号虽然限制但仍可获取数据。

### 1. 准备 X Cookie

在已登录 `https://x.com` 的浏览器开发者工具里，从 `Application -> Storage -> Cookies -> https://x.com` 取出 `auth_token` 和 `ct0`，再写入项目根目录 `.env` 文件：

```env
TWITTER_AUTH_TOKEN=你的 auth_token
TWITTER_CT0=你的 ct0
```

Cookie 过期、账号风控或浏览器 Cookie 解密失败都会影响采集稳定性。

### 2. 选择启动方式

#### 本机启动

准备条件：

- 已安装 `Python`
- 已安装 `Node.js / npm`

执行：

```
python doctor.py
python install.py
python services.py start
```

该路径会启动以下三个服务：

- `API`
- `Scheduler`
- `Dev UI`

默认访问：

- 工作台：`http://127.0.0.1:5177`
- 健康检查：`http://127.0.0.1:8765/health`

API 鉴权默认关闭。需要限制本机其他进程调用时，可在 `.env` 设置可选的 `XDATA_API_TOKEN`，再到工作台 `Settings` 输入同一值；前端只在当前浏览器会话的 `sessionStorage` 中保存，不写入 workspace 或 URL。

#### Docker 启动

```
docker compose up --build
```

该路径同样会启动以下三个服务：

- `api`
- `scheduler`
- `web-ui`

默认访问：

- 工作台：`http://127.0.0.1:5177`
- API：`http://127.0.0.1:8765`

Compose 的宿主机端口固定绑定 `127.0.0.1`，仅供本机访问，不支持局域网其他设备连接。设置 `XDATA_API_TOKEN` 后，同样在 Web UI 的 `Settings` 中为当前浏览器会话输入 token。

当前 `Docker Compose` 默认挂载以下目录：

- `config/`
- `data/`
- `runtime/`
- `.env`

停止容器：

```
docker compose down
```

Docker 注意事项：

- 未设置 `DOCKER_PROXY_URL` 时，不注入代理环境变量
- 需要代理时，先将 `DOCKER_PROXY_URL` 设为可用代理地址，再运行 `docker compose up --build`

## 常用入口

常用命令：

- `python doctor.py`：检查 Python、Node/npm、CLI、`.env`、Docker 和端口状态
- `python install.py`：准备 `pipx` / `psutil` / `twitter-cli` / `xreach-cli` 并安装前端依赖
- `python services.py start`：启动 `API`、`Scheduler` 和 `Dev UI`
- `python services.py stop`：停止服务
- `python services.py restart`：重启服务
- `python services.py status`：查看服务状态

默认端口：

- API：`127.0.0.1:8765`
- 开发态 Web UI：`127.0.0.1:5177`
- 静态预览：`127.0.0.1:5178`

## 更多文档

- [`CLAUDE.md`](CLAUDE.md)：项目真相、架构、搜索链路、页面行为、维护手册
- [`config/README.md`](config/README.md)：`workspace.json`、task pack 和配置边界
