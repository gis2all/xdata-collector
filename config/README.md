# Config

`config/` 现在只承载“通用基线 + 本地动态配置”两类内容。

## 当前边界

- Git 中保留的通用基线：
  - `config/README.md`
  - `config/packs/default-rule-set.json`
- 本地动态配置，不再进入版本控制：
  - `config/workspace.json`
  - `config/packs/job-*.json`
  - `config/packs/manual-preset-*.json`
  - `config/packs/manual-rule-set-*.json`

## workspace.json

`config/workspace.json` 是本地运行时生成和维护的轻量 workspace，不再作为仓库基线文件提交。

它当前只负责：

- 环境与路径类配置
- 自动任务注册表
- `jobs[]` 中每条任务对 `pack_name` / `pack_path` 的引用

典型字段包括：

- `version`
- `meta`
- `environment`
- `jobs[]`

说明：

- 当 `workspace.json` 缺失时，后端会自动 bootstrap 一个空白但可运行的默认 workspace
- 默认不会自动生成具体任务

## task pack

每个 `config/packs/*.json` task pack 固定包含：

- `version`
- `kind: "task_pack"`
- `meta`
- `search_spec`
- `rule_set`

当前约定：

- `任务包 = 搜索条件 + 规则`
- Git 中只保留默认规则 pack：`default-rule-set.json`
- 具体任务 pack、手动预设 pack、手动规则 pack 都属于本地动态配置

## 任务包操作语义

手动执行页和自动任务页都围绕当前草稿工作，操作含义如下：

- `载入任务包`
  - 从受管任务包列表载入一个已有 pack
  - 只替换当前草稿
- `从文件导入`
  - 从本地 JSON 文件导入到当前草稿
  - 不会创建新的受管 pack
- `导入并保存为新任务包`
  - 先从本地文件导入
  - 再立刻保存成新的本地受管 pack
- `另存为新任务包`
  - 把当前草稿保存成一个新的受管 pack
- `保存到当前任务包`
  - 用当前草稿覆盖当前绑定的 pack 文件

重要：

- 页面继续编辑不会自动回写原 pack
- 只有显式保存类操作才会落盘

## 历史配置兼容

旧的 `search_presets*.json` 已退出仓库基线：

- 具体历史预设 JSON 不再提交到 Git
- `WorkspaceStore` 也不会再主动从这类文件自动迁移 task pack

## 兼容说明

- 敏感 Cookie 仍保留在 `.env`，不写入 `workspace.json` 或 task pack
- 仓库 clone 后默认是“空白可运行”状态，而不是“预置一组具体任务”状态
