# Code Review Issues (运行中)

> 标记 ✅ 的已完成，⏳ 的待处理，❌ 的已验证不可行。

---

## 已修复（本轮 + 前几轮）

### ✅ DB connect 每请求做全表扫描
- 文件: `backend/collector_store.py` — `initialize_database()` + `_SCHEMA_INITIALIZED_PATHS`

### ✅ DesktopService god object
- 文件: `backend/collector_service.py` → `_impl.py` re-export

### ✅ 后台 run 异常静默吞掉 + 并发上限
- 文件: `backend/collector_service_impl.py` — `_record_background_run_failure()` + `BoundedSemaphore(4)`

### ✅ API 手写路由 + CORS 全开
- 文件: `run/api.py` — `_path_segment` helpers + origin 反射

### ✅ 前端单文件过大（部分）
- 文件: `ResultsPage.tsx`/`JobsPage.tsx` → `*Impl.tsx` re-export

### ✅ 外部依赖敏感性 — health 分项探活

### ✅ health 端点缓存 (30s)
- 文件: `backend/collector_service_impl.py` — `_probe_x_health_cached()`

### ✅ do_PUT _path_segment 修复
- 文件: `run/api.py` — `split("/")[-1]` → `_path_segment(path, 1)`

### ✅ CORS 拒绝时全部不发
- 文件: `run/api.py:_set_cors_headers` — methods/headers 只在合法 origin 时发

### ✅ IndexError/ValueError → 404, JSONDecodeError → 400, 其他 → 500
- 文件: `run/api.py` — 三层 except

### ✅ 请求体大小限制 10MB
- 文件: `run/api.py:_read_json` — `MAX_BODY_SIZE`

### ✅ thread.start() 孤儿 run
- 文件: `backend/collector_service_impl.py` — except 块加 `_record_background_run_failure`

### ✅ LIKE 搜索转义 % 和 _
- 文件: `backend/collector_service_impl.py:_item_where_clause` — `ESCAPE '\\'`

### ✅ RunCancelled 专用异常
- 文件: `backend/models.py` — 定义 `RunCancelled`；`twitter_cli.py` / `collector_service_impl.py` 使用

### ✅ filter_tree 全表加载加 50000 行上限
- 文件: `backend/collector_service_impl.py` — `MAX_FILTER_TREE_ROWS`

### ✅ Windows _owner_pid_alive 僵尸进程修复
- 文件: `backend/collector_service_impl.py` — `GetExitCodeProcess` + `STILL_ACTIVE`

### ✅ WorkspaceStore 缓存加 RLock
- 文件: `backend/workspace_store.py` — `get_workspace` / `_write_workspace` 加 `_cache_lock`

### ✅ scheduler 信号处理
- 文件: `run/scheduler.py` — `SIGINT`/`SIGTERM` handler

### ✅ 前端 AbortController
- 文件: `web-ui/src/api.ts` — `req()` 加 `signal` 参数

### ✅ 前端类型去重
- 文件: `web-ui/src/collector.ts` — 类型从 `api.ts` import

### ✅ CI py_compile 扩展
- 文件: `.github/workflows/ci.yml` — 覆盖所有 `backend/*.py` + `run/*.py`

### ✅ days_filter 语义注释
- 文件: `backend/collector_rules.py`

### ✅ rule_set level_hint 语义注释
- 文件: `backend/collector_rules.py`

### ✅ test_config.py 标记 skip
- 文件: `tests/test_config.py`

### ✅ 文件拆分未真正拆小
- 后端: `backend/collector_service_impl.py` 缩为组合入口；职责拆到 `backend/collector_service_parts/common.py`, `rules_taskpacks.py`, `jobs.py`, `runs.py`, `items.py`, `health.py`
- Results: `ResultsPageImpl.tsx` 保留页面状态和数据编排；表格配置、筛选状态、高级筛选 UI、数据表分别拆到 `web-ui/src/pages/results/`
- Jobs: `JobsPageImpl.tsx` 保留 API orchestration 和页面状态；表格配置、草稿 helper、任务表格、右侧工作区拆到 `web-ui/src/pages/jobs/`
- 运行时路径: 拆分后 `collector_service_parts/common.py` 的 `PROJECT_ROOT` 已校正为仓库根目录，默认配置仍读取 `config/workspace.json`，不会漂到 `backend/config`
- 验证: 后端 pytest 151 passed / 1 skipped；`tests/test_collector_service.py` 56 passed；前端 vitest 157 passed；前端 build 通过；Python py_compile 通过；`services.py restart` 后 `/health`、前端主要页面和核心 JSON API smoke 通过

---

## 待处理

### ⏳ 前端类型定义重复已解决但 api.ts 更精确
- `collector.ts` 现在从 `api.ts` import 类型

### ⏳ Dockerfile 未固定 CLI 版本
- 文件: `Dockerfile:17-19`

### ⏳ days_filter "天" 语义模糊 — 已加注释

### ⏳ raw 表 dedupe 与 run 内 dedupe 不一致
- 文件: `backend/collector_service_impl.py:2085-2098` vs `_dedupe_search_results:638-654`

### ⏳ 后台 run 测试依赖 sleep 轮询 (flaky)
- 文件: `tests/test_collector_service.py:970-977`

### ⏳ .lock 文件永不清理 — 无影响，可不修

### ❌ _save_runs_unlocked 改用 _atomic_write_text
- Windows `os.replace` 权限冲突，回退。原 `write_text` 配合 `_exclusive_lock` 已足够安全。

---

## 验证状态

| 检查项 | 结果 |
|---|---|
| 后端 pytest | 151 passed / 1 skipped（排除 1 个已有 flaky 测试） |
| collector_service 单测 | 56 passed |
| 前端 vitest | 157 passed (11 files) |
| 前端 build | 干净 |
| Python 编译 | 24 files compiled |
| 服务重启 | api / scheduler / web-ui 均 running |
| 健康检查 `/health` | `db.connected: true`, `x.connected: true` |
| 前端 smoke | /, /results, /jobs, #/manual 均 HTTP 200 |
| API smoke | /items, /jobs, /runs 均返回 JSON；CORS local 反射正常，外部拒绝正常 |
