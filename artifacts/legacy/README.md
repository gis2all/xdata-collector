# Legacy Config Artifacts

这里存放已经退出当前主配置链路的历史资料。

当前约定：

- `artifacts/legacy/` 只保留说明性文档
- 不再提交具体 `search_presets*.json` 文件
- 具体历史预设 JSON 如需临时本地留存，应作为 ignored 本地文件存在
- `WorkspaceStore` 不再主动从这里生成 task pack
- 这里不参与当前 bootstrap、workspace 初始化或任务包主链路

如果后续需要回看旧搜索预设，请从 Git 历史或仓库外备份获取，不要把它们重新放回当前主配置链路。
