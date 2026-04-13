# X数据采集器 Web UI

## 推荐启动方式

前端联调时，默认推荐直接从仓库根目录启动开发主链路：

```bash
python ./run/services.py start
```

这会默认启动：
- `run/api.py`
- `run/scheduler.py`
- `web-ui` dev server

如需查看状态或关闭这些服务：

```bash
python ./run/services.py status
python ./run/services.py stop
python ./run/services.py restart
```

打开 `http://127.0.0.1:5177/`。

## 单独启动前端

如果你只想单独调试前端开发服务，也可以手动执行：

```bash
cd web-ui
npm install
npm run dev
```

说明：
- 当前 UI 依赖本地 API `http://127.0.0.1:8765`
- 如果不使用 `run/services.py`，需要你自己确保 API 已经启动

## 构建与静态预览

```bash
npm run build
python ../run/static_web_server.py --root dist
```

静态预览地址默认是 `http://127.0.0.1:5178/`。

## 补充说明

- `5177` 是开发态入口
- `5178` 是构建后静态预览入口，由 `run/static_web_server.py` 提供
- `run/services.py` 默认只管理开发主链路，不包含 `run/static_web_server.py`