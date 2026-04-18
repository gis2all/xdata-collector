# Config

`config/` 用于存放可版本化的配置文件。

## 当前结构

- `workspace.json`：轻量工作区底座，只保留 `version`、`meta`、`environment`、`jobs`
- `packs/*.json`：任务包目录，每个文件都必须同时包含 `search_spec + rule_set`

## workspace.json

`workspace.json` 当前只负责：
- 环境与路径类配置
- 自动任务注册表
- `jobs[]` 中每条任务对 `pack_path` 的引用

自动任务注册表建议字段：
- `id`
- `name`
- `enabled`
- `interval_minutes`
- `pack_path`
- `next_run_at`
- `created_at`
- `updated_at`
- `deleted_at`

## task pack

每个 `config/packs/*.json` 任务包固定包含：
- `version`
- `kind: "task_pack"`
- `meta`
- `search_spec`
- `rule_set`

说明：
- 手动搜索页和自动任务页都可以导入任务包
- 导入后只替换当前表单里的搜索配置和规则集
- 页面继续编辑不会自动回写原 pack 文件
- 只有显式「导出为任务包 / 覆盖当前任务包」才会落盘

## 兼容说明

- `search_presets*.json` 只作为历史迁移来源，不再是主真相
- 敏感 Cookie 仍保留在 `.env`，不写入 `workspace.json` 或任务包
