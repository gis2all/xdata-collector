# X数据采集器 Web UI

## 推荐启动方式

前端联调时，默认推荐直接从仓库根目录启动开发主链路：

```bash
python ./install.py
python ./services.py start
```

这会默认启动：

- `run/api.py`
- `run/scheduler.py`
- `web-ui` dev server

如需查看状态或关闭这些服务：

```bash
python ./services.py status
python ./services.py stop
python ./services.py restart
```

打开 `http://127.0.0.1:5177/`。

该入口和 API 都仅供 `127.0.0.1` 本机访问。若 `.env` 设置了可选的 `XDATA_API_TOKEN`，在 `Settings` 页输入同一值；token 只保存在当前标签页会话的 `sessionStorage`，关闭会话后需要重新输入。

## 单独启动前端

如果你只想单独调试前端开发服务，也可以手动执行：

```bash
cd web-ui
npm install
npm run dev
```

说明：

- 当前 UI 默认依赖本地 API `http://127.0.0.1:8765`
- 如果不使用 `services.py`，需要你自己确保 API 已经启动

## 构建与静态预览

```bash
npm run build
python ../run/static_web_server.py --root dist
```

静态预览地址默认是 `http://127.0.0.1:5178/`。

## 页面地图

### 运行总览（`#/dashboard`）

- 浏览器刷新时不会自动重新探测 DB / X
- 首屏恢复浏览器本地上次展示状态
- 只有点击 `重新加载` 才会主动调用 `/health`

### 手动搜索（`#/manual`）

- 当前页面围绕“任务包草稿”工作
- `任务包 = 搜索条件 + 规则`
- 可以直接执行当前草稿，也可以载入、导入、另存为、覆盖保存、删除任务包

### 自动任务（`#/jobs`）

- 左侧是调度任务列表，右侧是任务工作区
- 自动任务负责调度；任务正文来自当前绑定任务包
- 支持批量启用、停用、立即运行、删除、恢复、彻底删除
- 批量选择采用“两段式全选”

### 结果浏览（`#/results`）

- 支持在 `x_items_curated` 和 `x_items_raw` 之间切换
- 支持关键词查询、分页、排序、列显隐、删除、去重
- 表头支持列宽拖拽，且两张表分别记忆列宽

### 运行日志（`#/logs`）

- 展示运行记录和当前服务日志快照

### 设置（`#/settings`）

- 轻量 workspace 管理页
- 管理当前浏览器会话的可选 API token
- 只维护 `config/workspace.json`
- 搜索条件与规则正文不在这里编辑

## 当前交互口径

- 手动页和自动任务页都围绕任务包工作
- 自动任务页除了任务包正文，还承担调度管理
- “载入任务包”指载入已有受管 pack
- “从文件导入”指从本地 JSON 导入到当前草稿，不会自动创建 pack
- “导入并保存为新任务包”指导入后立刻保存成本地受管 pack
- “保存到当前任务包”才会覆盖当前绑定的 pack 文件

## 当前 UI 约定

- 设计规范入口是仓库根目录的 `DESIGN.md`；前端 UI 改动前先读它，不按单页临时判断。
- 默认深色主题，可在侧栏底部切换浅色主题。
- 全站字体统一：西文 `Inter`、中文 `Noto Sans SC`，回退系统无衬线字体；代码 / 日志 / JSON 块也使用同一字体族，不混排等宽字体。
- 品牌色为荧光绿（`#d9ff3f`），用于主按钮、当前导航、焦点态和成功状态。
- 浏览器 favicon 使用绿色 X 图标：`web-ui/public/favicon.svg`。
- 控件焦点态使用绿色 2px outline，`outline-offset: 0`，与控件边缘完全贴合。
- 界面文案统一使用中文，不使用英文 eyebrow 或重复描述文字。

## 补充说明

- `5177` 是开发态入口
- `5178` 是构建后静态预览入口，由 `run/static_web_server.py` 提供
- `services.py` 默认只管理开发主链路，不包含 `run/static_web_server.py`
