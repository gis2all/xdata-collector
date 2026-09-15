# 贡献指南

感谢你参与 X 数据采集器。提交代码、文档、测试或问题报告前，请先阅读本指南。

## 开始之前

- 先阅读 [`README.md`](../README.md) 了解功能、启动方式和固定契约。
- 修改核心架构或运行语义前，阅读 [`CLAUDE.md`](../CLAUDE.md)。
- 修改 Web UI 前，阅读 [`DESIGN.md`](../DESIGN.md)；`DESIGN.md` 是 UI 视觉规范的唯一来源。
- 较大的功能、API 变更或架构调整，建议先创建 Issue 说明问题、范围和验收方式。

## 本地开发

项目支持 Windows / Linux / macOS，本机运行和 Docker 运行两种方式。标准启动顺序：

```text
python doctor.py
python install.py
python services.py start
```

启动后访问 `http://127.0.0.1:5177`。API 默认监听 `http://127.0.0.1:8765`，本机与 Docker 发布默认都以 loopback 为边界，不提供局域网访问。

## 分支与提交

- 分支名建议使用 `feat/`、`fix/`、`docs/`、`test/` 或 `chore/` 前缀，例如 `fix/jobs-timezone`。
- 提交信息建议使用 Conventional Commits，例如 `fix(api): validate missing run id`、`docs: clarify loopback setup`。
- 一个 Pull Request 尽量只解决一个问题，避免把无关格式化、重命名和功能改动混在一起。
- 不要把 `.env`、Cookie、Token、`data/*.db`、运行日志、PID 或本地生成目录提交到仓库。

## 改动边界

- `config/workspace.json`、`config/packs/*.json`、`runtime/` 和 `data/app.db` 共同构成系统真相，不能把它们简单当成同一种持久化状态。
- 修改 API 形状时，先更新 `web-ui/src/api.ts`，再同步调用方、`docs/api/openapi.json` 和测试。
- 修改任务包或规则语义时，同时检查后端运行链路、前端预览和对应测试。
- 只做必要的改动，不顺手重构无关模块，不删除现有文档契约中的固定命令或关键字。

## 验证

提交前请根据改动范围运行相关测试。后端：

```powershell
python -m pytest -c tests/pytest.ini tests
```

前端请进入 `web-ui/` 后执行：

```powershell
npm test
npm exec tsc -- -p tsconfig.app.json --noEmit
npm run lint
npm run build
```

涉及页面交互或关键用户流程时，再运行 `npm run test:e2e`。只改文档时，至少要做 UTF-8 读取检查、关键字检查和 `git diff --check`。

## 创建 Pull Request

1. 确认分支基于最新的 `main`，并已同步必要变更。
2. 在 Pull Request 中说明背景、解决的问题、主要改动、验证命令和已知风险。
3. 使用仓库的 Pull Request 模板；涉及 UI 时附上截图或录屏。
4. 确保 CI 通过。若某项检查无法在本地执行，请在描述中明确说明原因和未覆盖的风险。
5. 评审意见处理完成后，再请求合并。

## 行为与安全

参与项目即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。如果发现安全漏洞，请不要创建公开 Issue，按 [安全政策](SECURITY.md) 私下报告。

## 许可证

除非另有明确说明，你提交到本仓库的贡献将按 [MIT License](../LICENSE) 授权。
