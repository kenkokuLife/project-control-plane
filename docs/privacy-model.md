# Privacy Model

## 基本原则

> Public code, private personal data.

当前没有把真实个人项目数据公开成 public dashboard 的计划。仓库公开不意味着其关联的运行数据公开；`publicUrl` 或来源仓库可公开访问，也不构成公开整个聚合数据集的授权。

## 可以公开的内容

如果未来工具足够成熟，可以公开：

- 应用代码
- 架构
- Schema
- 明确用于演示的 example data
- 方法论

这些是可公开的内容范围，不代表本仓库已经包含所有这些产物。

## 默认私有的运行数据

真实个人项目状态、Registry 中的真实仓库信息、聚合数据、Feedback、Ideas、私人备注及其他运行数据，不因应用 repo 公开而公开。

不能仅凭字段名称把项目名称、状态、阶段、下一步或更新时间认定为适合公开。真实数据如需公开，应经过明确选择；示例数据应与真实运行数据分开。

私人运行数据不进入公开 Git 仓库。聚合产物即使未提交 Git，也必须在构建、部署和交付时保持这一边界。Dashboard 的 `noindex, nofollow` 只是搜索引擎提示，不是访问控制。P5 已在 Cloudflare Pages 部署，生产 `pages.dev` hostname 与 preview wildcard hostname 均由 Cloudflare Access 保护；当前策略仅允许项目所有者邮箱访问。新增部署 hostname 时仍须核对 Access 覆盖范围，不能在未保护的公开地址暴露真实项目数据。

如未来私人数据确实需要 Git 版本管理，可以考虑独立的 Private Data Repository；这不是 v1 要求，也不需要维护两套应用代码。

## Feedback 与防滥用：未来原则

Feedback 尚属 future roadmap，其功能与潜在基础设施见 [Vision](vision.md)。即使来自公开网站，原始反馈也默认私有，公开展示必须经过明确选择。

未来优先考虑匿名提交，不要求姓名、Email 或 Account；需要回复时再考虑可选联系方式。

如果防滥用需要请求来源信息：

- 不为分析用户而长期保存原始 IP。
- 必要时使用带合理 TTL 的短期 Hash 作为 Rate Limit Key。
- 不将防滥用数据用于用户画像。

## Secrets

API Token、GitHub App Private Key、Cloudflare Credentials、Database Password、SSH Private Key 等凭证永远不能进入 Git，也不能进入 Dashboard 聚合产物或错误说明。

使用部署平台提供的 Secret / Environment Variable 管理凭证。

## 默认策略

无法明确判断是否适合公开的数据，默认按 Private 处理。公开应是明确选择，而不是默认行为。
