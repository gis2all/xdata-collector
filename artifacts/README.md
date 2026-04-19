# Artifacts

`artifacts/` 用于存放项目辅助资料，不承载主业务代码，也不存放运行产物。

## 当前内容

- `diagrams/`：项目流程图、技术框图与设计辅助图稿
- `design/`：本地临时 spec / plan / design 文档目录，按 `specs/`、`plans/` 分层，默认不进入 Git

## 当前边界

- 可长期纳入版本控制的辅助资料放在 `artifacts/` 的受管子目录，例如 `diagrams/`
- 临时设计稿、计划稿、实现方案稿统一放在 `artifacts/design/`，该目录默认不进入 Git
- 根目录 `docs/` 不再作为临时方案文档入口；若外部流程默认写 `docs/superpowers/...`，本仓统一改落到 `artifacts/design/...`
- 运行日志、PID、临时文件等运行产物应放在 `runtime/`
- 本地 brainstorming、预览 HTML、临时状态文件等应放在被 Git 忽略的 `.superpowers/`
- 当前项目流程图位于 `artifacts/diagrams/workflow.excalidraw`
