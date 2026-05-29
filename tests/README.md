# Tests

当前仓库的测试相关文件统一收束到 `tests/` 目录。

## 运行方式

```bash
python -m pytest -c tests/pytest.ini tests
```

## 当前内容

- `pytest.ini`：pytest 配置
- `test_*.py`：当前保留的单元 / 集成级测试

## 约束

- 涉及 `backend/twitter_cli.py` 的 CLI runtime 测试必须完整 mock `find_twitter_cli()` / `find_xreach_cli()`，不能依赖本机已安装的 `twitter-cli`、`xreach` 或用户 PATH。
- 如果运行时实现经过 `_run_cli_command()` / `subprocess.Popen`，测试也必须 mock 对应层级，不能沿用旧的 `subprocess.run` 假设。
- 默认按 GitHub Actions 这类干净环境来写测试；本机能通过但 CI 缺少 CLI 时失败，视为测试隔离不完整。

## 当前边界

- 旧 `e2e_smoke.py` / `browser_smoke.ps1` 链路已移除
- 浏览器 E2E 暂不在仓库内维护；后续如需恢复，将以新方案重新建设
