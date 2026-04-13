# Data

`data/` 用于存放本地 SQLite 数据库和采集结果。

## 当前内容

- `app.db`：当前主 SQLite 数据库
- `search_results/`：历史搜索结果 JSON 输出
- `test/`：测试或临时数据库目录

## 当前边界

- `app.db` 保持为当前默认主库位置
- 测试或一次性数据库应继续收敛到 `data/test/` 或其他明确子目录
- 这里存放业务数据，不放源码、文档或运行日志
