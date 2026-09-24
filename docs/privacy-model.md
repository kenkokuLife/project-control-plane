# Privacy Model

## 基本原则

Project Control Plane 的代码可以公开，但私人数据不进入公开仓库。

核心原则：

> Public by design, private by data.

## 数据分类

### Public

适合公开的数据：

- 项目名称
- 项目简介
- 技术栈
- Public URL
- 项目当前状态
- 当前阶段
- 最近公开更新时间
- 公开 Milestone
- 公开 Feedback 入口

这些内容可以用于：

- Project Dashboard
- Portfolio
- Public Project Registry

### Private

默认不公开的数据：

- 详细 Next Step
- 私人 TODO
- Personal Notes
- Internal Open Items
- 未公开 Idea
- Feedback 原始内容
- Email
- 访问来源相关信息
- Private Repository 信息
- 凭证、Token、Secret
- 与工作、客户或个人身份相关的敏感内容

这些数据不进入公开 Git Repository。

## Feedback

所有外部 Feedback 默认视为 Private。

即使 Feedback 来源于公开网站，也不会自动公开展示。

Feedback 后续如果需要公开，应通过明确操作进行选择。

初期 Feedback 不要求用户提供：

- 姓名
- Email
- Account

优先采用匿名提交。

如果未来需要回复用户，再考虑增加可选联系方式。

## 防滥用数据

为了实现 Rate Limit，可能需要使用请求来源信息。

原则：

- 不为了分析用户而长期保存原始 IP
- 如需要，可以生成短期 Hash 作为 Rate Limit Key
- 尽量设置合理的 TTL
- 不把防滥用数据用于用户画像

## Secrets

以下内容永远不能进入 Git：

- API Token
- GitHub App Private Key
- Cloudflare Credentials
- Database Password
- SSH Private Key
- 其他 Secret

使用部署平台提供的 Secret / Environment Variable 管理。

## Public / Private Repository

初期只维护一个公开的 Application Repository。

如果以后私人数据本身需要 Git 版本管理，再单独建立 Private Data Repository。

不维护两套独立的 Public / Private Application Code。

## 默认策略

如果无法明确判断某项数据是否适合公开：

> 默认按 Private 处理。

公开应是明确选择，而不是默认行为。