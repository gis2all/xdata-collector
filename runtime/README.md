# Runtime

`runtime/` 用于承载运行时状态、日志、PID 和临时产物。

## 当前结构

- `history/search_runs.jsonl`：手动执行和自动任务的运行记录
- `state/runtime_health_snapshot.json`：后端最近一次 DB / X 健康快照
- `state/sequences.json`：运行态序号
- `logs/`：服务日志
- `pids/`：`run/services.py` 维护的 PID 文件
- `tmp/`：临时产物，测试临时文件统一放在 `runtime/tmp/tests/`

## 健康状态边界

这里需要区分两个层次：

- `runtime/state/runtime_health_snapshot.json`
  - 是后端运行态快照
  - 由 `/health` 主动探测后更新
  - `/health/snapshot` 只读这个后端快照
- Dashboard 首屏显示
  - 默认来自浏览器本地恢复的上次展示状态
  - 页面刷新本身不会自动读取后端快照来覆盖 UI
  - 只有用户点击 `重新加载` 才会重新主动校验并刷新展示

## 约束

- `runtime/` 里的生成文件是运行态，不应作为长期配置
- 不要再把日志、快照或临时输出写回仓库根目录
- `runtime/history/`、`runtime/state/`、`runtime/logs/`、`runtime/pids/`、`runtime/tmp/` 都属于本地运行态
- SQLite 数据库固定在 `data/app.db`，不放在 `runtime/`
