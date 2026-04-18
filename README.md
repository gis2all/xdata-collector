# X数据采集器

本项目是一个本地运行的 X 数据采集、规则筛选、结果沉淀工作台。
它只负责 X 搜索、本地 API、任务调度、SQLite 结果存储和 Web UI。
![image](artifacts\diagrams\workflow.png)

主链路：

```text
task pack
  = 搜索条件 + 规则

手动执行 / 自动任务
  -> X 搜索
  -> x_items_raw
  -> 规则评估
  -> x_items_curated
```

## 核心能力

- 手动执行任务：直接编辑并运行任务草稿，不必先保存成任务包
- 自动任务：通过 `workspace.json` 里的 jobs registry 调度任务包
- 结果浏览：支持 `x_items_raw` / `x_items_curated` 双表浏览、删除、去重
- 运行总览 / 运行日志：查看 DB / X 状态、运行记录和当前服务日志

## 快速开始

### 1. 准备本机依赖

```bash
python run/bootstrap.py
```

这个入口会准备本地运行所需依赖，包括：

- `pipx`
- `twitter-cli`
- `agent-browser`

它只负责准备依赖，不负责启动服务。

### 2. 获取 X cookie

运行采集前，先在桌面浏览器里登录 `https://x.com`，然后打开开发者工具。Chrome 或 Edge 一般可以在 `Application -> Storage -> Cookies -> https://x.com` 里直接找到 `auth_token` 和 `ct0`，把这两个值复制出来就可以；如果 Cookies 面板里不方便找，也可以去 `Network` 面板点开任意一个发往 `x.com` 的请求，从请求头里的 `Cookie` 文本中把 `auth_token=...` 和 `ct0=...` 拆出来。它们本质上是你当前 X 登录会话的一部分，拿到后只写本地，不要提交到 Git，也不要贴到 issue、PR 或聊天记录里；如果怀疑泄露，最稳妥的处理方式就是回到 X 重新登录或清理会话，再把新的值更新到本地 `.env`。

### 3. 写入 `.env`

拿到 `auth_token` 和 `ct0` 之后，在项目根目录创建或编辑 `.env`，写成下面这样：

```env
TWITTER_AUTH_TOKEN=你的 auth_token
TWITTER_CT0=你的 ct0
```

这两个字段是必填，也是项目连接 X 会话的核心来源；下面这两个字段只是辅助提示，用来告诉工具优先使用哪个浏览器或哪个本地 Profile，它们不是必填，也不能替代上面的 cookie：

```env
TWITTER_BROWSER=edge
TWITTER_CHROME_PROFILE=Default
```

如果后面遇到 X 会话异常、采集跑不起来或健康检查不通过，先看 `.env` 里是否真的填了 `TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`，再看 `http://127.0.0.1:8765/health` 返回的 X 会话状态，通常这两步就能先排掉大部分问题。

### 4. 安装前端依赖

```bash
cd web-ui
npm install
cd ..
```

### 5. 启动开发主链路

```bash
python run/services.py start
```

常用命令：

```bash
python run/services.py status
python run/services.py stop
python run/services.py restart
```

开发界面默认打开：

- `http://127.0.0.1:5177/`

## 运行入口与端口

平时真正常用的入口只有两个：`python run/bootstrap.py` 和 `python run/services.py start`。前者只负责准备本机依赖，会安装 `twitter-cli` 和 `agent-browser`，适合新机器首次启动、补依赖，或者遇到 `twitter-cli not found` 这类问题时使用；它不会启动 API、Scheduler 或前端。后者才是日常开发主入口，会统一拉起 `run/api.py`、`run/scheduler.py` 和 `web-ui` dev server，常用命令就是：

```bash
python run/services.py start
python run/services.py status
python run/services.py stop
python run/services.py restart
```

如果只是正常开发或联调，直接用它就够了。对应默认端口也很简单：API 是 `127.0.0.1:8765`，开发态 Web UI 是 `127.0.0.1:5177`，Scheduler 没有 HTTP 端口，前端默认请求本地 API。只有在你想看构建后的静态页面时，才需要单独使用 `run/static_web_server.py`，它不由 `run/services.py` 管理，默认端口是 `127.0.0.1:5178`，典型用法是先执行 `cd web-ui && npm run build`，再执行 `python run/static_web_server.py --root web-ui/dist`。除非你在单独调 API、调 Scheduler 或做静态预览，否则不需要分别手动启动这些底层入口。

## 关键边界

- `config/`
  - `workspace.json`：轻量环境配置和 jobs registry
  - `packs/*.json`：任务包正文
- `runtime/`
  - 运行记录、健康快照、日志、PID、临时文件
- `data/app.db`
  - 正式结果库
  - 当前只保留：
    - `x_items_raw`
    - `x_items_curated`

## 最小排障顺序

如果“采集不到结果”或“X 会话异常”，先按这个顺序排：

1. 先看 `.env` 里有没有 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0`
2. 再看 `python run/services.py status`
3. 再看 `http://127.0.0.1:8765/health`
4. 最后再怀疑前端页面或任务配置
