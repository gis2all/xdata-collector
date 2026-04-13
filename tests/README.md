# Tests

当前仓库的测试相关文件统一收束到 `tests/` 目录。

## 运行方式

```bash
python -m pytest -c tests/pytest.ini tests
```

## 当前内容

- `pytest.ini`：pytest 配置
- `test_*.py`：当前保留的单元 / 集成级测试

## 当前边界

- 旧 `e2e_smoke.py` / `browser_smoke.ps1` 链路已移除
- 浏览器 E2E 暂不在仓库内维护；后续如需恢复，将以新方案重新建设
