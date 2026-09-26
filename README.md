# Project Control Plane

用于统一查看个人开发项目状态的控制台，降低在多个项目之间恢复上下文的成本。

Dashboard v1 聚合各项目自行维护的状态，帮助快速了解项目进展、下一步和同步异常。项目仓库保留自己的状态事实，Control Plane 负责只读聚合与展示。

## 设计文档

- [Vision](docs/vision.md)：Dashboard v1 的目标、展示范围、明确不做的功能，以及 future roadmap。
- [Architecture](docs/architecture.md)：v1 已确认的技术栈、运行链路、模块职责、数据模型与 [P1～P6 实现里程碑](docs/architecture.md#实现里程碑已确认-v1)。
- [Project Status Schema](schemas/project-status-v1.schema.json)：正式 v1 运行时契约；[ownership 与同步规则](docs/schema-ownership.md)。
- [Privacy Model](docs/privacy-model.md)：代码与真实运行数据的公开边界、凭证与未来 Feedback 的隐私原则。

## 当前阶段

v1 设计已确认，P1 Registry Reader 已完成：支持 Registry v1 读取、验证与默认路径处理，保留禁用项目。运行与 API 见 [Registry Reader](docs/registry-reader.md)。尚未实现 GitHub 读取、同步、Dashboard 或部署工作流。

已确认采用 Astro + TypeScript、Node/TypeScript、`registry.yaml`、Cloudflare Pages 与 GitHub Actions。构建时完成 Full Refresh，再生成静态 Dashboard；具体运行链路以 Architecture 为准。

下一步可开始 **P2 GitHub Status Reader**，随后依次推进 P3 Full Refresh、P4 Dashboard、P5 Cloudflare deployment、P6 Sync triggers。正式状态 Schema 已纳入本仓库，P2 直接加载本地契约；真实数据部署的访问边界在 P5 前落实。
