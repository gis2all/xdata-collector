# Artifacts

`artifacts/` 用于存放项目辅助资料，不承载主业务代码，也不存放运行产物。

## 当前内容

- `diagrams/`：项目流程图、技术框图与设计辅助图稿

## 当前边界

- 这里只放可纳入版本控制的辅助资料
- 本地设计草稿、结构稿、实施计划可放在 `artifacts/design/`，但该目录默认不进入 Git
- 运行日志、PID、临时文件等运行产物应放在 `runtime/`
- 本地 brainstorming、预览 HTML、临时状态文件等应放在被 Git 忽略的 `.superpowers/`
- 当前项目流程图位于 `artifacts/diagrams/workflow.excalidraw`
