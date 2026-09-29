# Project Control Plane

用于统一查看个人开发项目状态的控制台，降低在多个项目之间恢复上下文的成本。

Dashboard v1 聚合各项目自行维护的状态，帮助快速了解项目进展、下一步和同步异常。项目仓库保留自己的状态事实，Control Plane 负责只读聚合与展示。

## 设计文档

- [Vision](docs/vision.md)：Dashboard v1 的目标、展示范围、明确不做的功能，以及 future roadmap。
- [Architecture](docs/architecture.md)：v1 已确认的技术栈、运行链路、模块职责、数据模型与 [P1～P6 实现里程碑](docs/architecture.md#实现里程碑已确认-v1)。
- [Project Status Schema](schemas/project-status-v1.schema.json)：正式 v1 运行时契约；[ownership 与同步规则](docs/schema-ownership.md)。
- [Privacy Model](docs/privacy-model.md)：代码与真实运行数据的公开边界、凭证与未来 Feedback 的隐私原则。
- [P6 自动刷新触发](docs/automatic-rebuild.md)：其他项目的状态变更触发构建、每日兜底及接入步骤。

## 当前阶段

v1 设计已确认，P1 Registry Reader、P2 GitHub Status Reader、P3 Full Refresh、P4 Dashboard 和 P5 Cloudflare deployment 已完成。P1～P3 从 public repo 读取并聚合状态；P4 在 Astro build 时生成静态 Dashboard；P5 通过 Cloudflare Pages 的 GitHub 集成部署。运行与 API 见 [Registry Reader](docs/registry-reader.md)、[GitHub Status Reader](docs/github-status-reader.md)、[Full Refresh](docs/full-refresh.md) 和 [Dashboard](docs/dashboard.md)。构建不写 `projects.json`；当前未启用 PAT 或 private repo。

已确认采用 Astro + TypeScript、Node/TypeScript、`registry.yaml` 与 Cloudflare Pages。构建时完成 Full Refresh，再生成静态 Dashboard；具体运行链路以 Architecture 为准。

**P5 已完成；P6 repository implementation 已完成，待真实联调**：Cloudflare Pages 已连接本仓库 GitHub `main`，生产 `pages.dev` 已部署，生产 hostname 与 preview wildcard hostname 都受 Cloudflare Access 保护，策略仅允许项目所有者邮箱访问。P6 提供其他项目的状态变更触发模板，以及每日一次的 full reconciliation 构建；绑定 `main` 的 Deploy Hook 与本仓库 GitHub Secret 已配置。接下来验证手动 rebuild 和一个项目的状态变更触发，见 [P6 自动刷新触发](docs/automatic-rebuild.md)。当前不接入 private repo，也不配置 PAT。

## 本地运行

Node / pnpm 版本由 `package.json` 声明；`mise.toml` 仅供本地安装和运行：

```sh
mise install
mise exec -- pnpm install
mise exec -- pnpm test
mise exec -- pnpm build     # build 时对 registry.yaml 执行一次真实 Full Refresh
mise exec -- pnpm preview
```
