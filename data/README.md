# data 目录说明

`data/` 目录用于承载本地 SQLite 运行数据库，当前主文件是 `app.db`。

目录约束：

- `data/` 正式保留 `app.db` 和 `README.md`
- `data/` 不再作为测试、导出、日志或临时目录
- 测试临时产物放 `runtime/tmp/tests/`
- 服务日志放 `runtime/logs/`

## 当前业务表

`app.db` 当前只保留 2 张业务表：

1. `x_items_raw`
   - 原始抓取结果表
   - 保存某次 run 抓回来的原始 X 数据、时间、作者、指标和查询来源

2. `x_items_curated`
   - 规则筛选后的结果表
   - 保存 level、score、title、summary_zh、dedupe_key、rule_set_id 等字段

补充说明：

- `sqlite_sequence` 是 SQLite 系统表，不算业务表
- 手动执行和自动任务抓到的原始结果都会进入 `x_items_raw`
- 只有命中规则的结果会进入 `x_items_curated`
- 结果浏览页当前支持在 `x_items_raw` 和 `x_items_curated` 之间切换，并按当前表执行删除、批删和去重

## 文件化后的边界

```text
config/workspace.json
  |- environment
  `- jobs[] -> pack_path -> config/packs/*.json

config/packs/*.json
  |- search_spec
  `- rule_set

runtime/history/search_runs.jsonl
runtime/state/runtime_health_snapshot.json
runtime/state/sequences.json

data/app.db
  |- x_items_raw
  `- x_items_curated
```

也就是说：

- `workspace.json` 只保留轻量环境配置和自动任务注册表
- 搜索条件与规则正文放在 `config/packs/*.json`
- 运行记录和健康快照不再存 SQLite
- SQLite 只用来保存原始结果与筛选结果
