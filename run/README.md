# Run

`run/` 是当前仓库的主运行入口目录，只放真正的启动入口和本地运行辅助脚本。

## 当前内容

- `api.py`：本地 HTTP API 主入口
- `scheduler.py`：后台调度器主入口
- `static_web_server.py`：构建后前端静态文件服务
- `bootstrap.py`：跨平台本机依赖准备脚本
- `services.py`：开发主链路服务总控脚本

## 默认端口 / 无端口约定

- `api.py`：默认监听 `127.0.0.1:8765`
- `static_web_server.py`：默认监听 `127.0.0.1:5178`
- `scheduler.py`：不监听端口，默认每 30 秒执行一次 `tick()`
- `web-ui` dev server：默认监听 `127.0.0.1:5177`

## `services.py`

推荐命令：

```bash
python run/services.py start
python run/services.py status
python run/services.py stop
python run/services.py restart
```

默认控制范围：

- `run/api.py`
- `run/scheduler.py`
- `web-ui` dev server

说明：

- `services.py` 默认只管理开发主链路，不包含 `run/static_web_server.py`
- 运行状态写入 `runtime/pids/`
- 当前日志写入 `runtime/logs/*.current.out.log` 和 `runtime/logs/*.current.err.log`

## 健康接口语义

- `GET /health`
  - 主动探测数据库和 X 会话
  - 更新 `runtime/state/runtime_health_snapshot.json`
- `GET /health/snapshot`
  - 只读取现有后端快照
  - 不主动探测

说明：

- Dashboard 首屏当前不会自动调用这两个接口
- 页面里的 `重新加载` 才会触发 `GET /health`

## 边界

- 这里负责“怎么启动系统”
- 核心业务编排仍在 `backend/`
- `bootstrap.py` 负责准备本机依赖，包括 `pipx`、`twitter-cli` 和 `agent-browser`
- `bootstrap.py` 不负责启动 API、scheduler 或前端
