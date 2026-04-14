# data 目录说明

`data/` 目录用于承载本地 SQLite 运行数据库，当前主文件是 `app.db`。

目录约束：
- `data/` 正式保留 `app.db` 和本说明文件 `README.md`
- `data/` 不再作为测试、导出、日志或临时目录使用
- 测试临时产物应放到 `runtime/tmp/tests/`
- 服务日志应放到 `runtime/logs/`

## 当前业务表

当前主库里有 6 张业务表：

1. `search_jobs`
   - 自动任务配置表
   - 保存任务名、搜索条件、规则集、执行间隔、启停状态和下次运行时间

2. `search_runs`
   - 每次手动搜索或自动任务执行记录
   - 保存触发方式、执行状态、开始结束时间、错误信息和统计摘要

3. `x_items_raw`
   - 原始抓取结果表
   - 保存某次 run 抓回来的原始 X 数据和基础指标

4. `x_items_curated`
   - 规则筛选后的结果库
   - 保存 level、score、标题、摘要、去重键和来源链接等结果信息
   - “结果浏览”页读取的是这张表

5. `rule_sets`
   - 规则集定义表
   - 保存规则名称、描述、版本和具体规则定义

6. `runtime_health_snapshot`
   - 运行健康快照表
   - 保存 DB / X 等目标的最近健康检查状态

补充说明：
- `sqlite_sequence` 是 SQLite 系统表，不算业务表
- 手动搜索并不是所有抓取结果都会进入结果库，只有命中的 curated 结果会进入 `x_items_curated`

## 表关系

```text
rule_sets
   ^
   | rule_set_id
   |
search_jobs -----------+
   |                   |
   | job_id            | 手动搜索没有 job_id
   v                   |
search_runs <----------+
   |
   | run_id
   +------------------> x_items_raw
   |
   +------------------> x_items_curated

runtime_health_snapshot
   |
   +--> 独立保存 DB / X 健康状态
```

关系说明：
- 自动任务链路：`search_jobs -> search_runs -> x_items_raw -> x_items_curated`
- 手动搜索链路：`search_runs -> x_items_raw -> x_items_curated`
- `rule_sets` 会被自动任务配置和 curated 结果引用
- `runtime_health_snapshot` 独立保存健康状态，不参与结果入库主链路
