# Project Handoff

## Current State

- Project Control Plane v1 已完成：P1～P6 均已交付，真实跨项目 E2E 已通过。
- P1 Registry Reader：读取、验证 Registry v1，处理默认 `statusPath`，保留禁用项目。见 `docs/registry-reader.md`。
- P2 GitHub Status Reader：从 public repo default branch 读取状态文件，按本仓库 canonical Schema 验证。见 `docs/github-status-reader.md`。
- P3 Full Refresh：`refreshProjects()` 并发读取所有 enabled 项目，隔离单项目失败，返回内存中的 `project` + `source` + `sync` 聚合结果。见 `docs/full-refresh.md`。
- P4 Dashboard：Astro 静态页面在 build time 调用 `refreshProjects()`，经 `buildDashboard()` view-model 渲染；按 Active / Paused / Completed+Archived / Idea 分组，单独展示 Sync Issues。见 `docs/dashboard.md`。
- P5 Cloudflare Pages + Access：Cloudflare Pages 已连接本仓库 GitHub `main`，使用 Astro preset、`pnpm build`、`dist` 和仓库根目录；生产 `pages.dev` 已部署成功。生产 hostname 与 preview wildcard hostname 均由 Cloudflare Access 保护，仅允许项目所有者邮箱访问。见 `docs/cloudflare-pages.md`。
- P6 automatic rebuild：每日 scheduled / 手动 workflow、供其他项目复制的状态变更模板、文档和静态测试已实现。Cloudflare Pages Deploy Hook 已绑定 `main`；本仓库 GitHub repository secret `CONTROL_PLANE_DEPLOY_HOOK` 已配置。见 `docs/automatic-rebuild.md`。
- 真实跨项目 E2E 已完成：`forge-context/goodidea-agent` 的 `.project/status.json` push → GitHub Action → Cloudflare Deploy Hook → Pages rebuild → Dashboard 显示 **GoodIdea Public Experience / Sync ok**。
- 状态内容更新时间为 2026-09-29（UTC）；状态契约为 `schemaVersion: 1`。Feedback Inbox 与 Ideas 属于 future。

## Decisions

- **Runtime（2026-09-27）**：仓库根目录 `mise.toml` 声明 node 24.21.0 与 pnpm 11.25.0，并把 pnpm store / cache 固定在仓库内、关闭 Astro telemetry。不修改 shell 或全局 mise 配置；首次使用需 `mise trust` 与 `mise install`，命令通过 `mise exec -- pnpm …` 运行。
- **Cloudflare CI（2026-09-29）**：`package.json` 声明 Node 24.21.0 与 pnpm 11.25.0，`.node-version` 固定 Cloudflare Node 版本，Pages 设置 `PNPM_VERSION=11.25.0`；不依赖本地 mise。GitHub `main` 更新由 Cloudflare 自动构建并部署，不使用 Wrangler 主导部署。
- **访问控制（2026-09-29）**：Cloudflare Access 已保护生产 `pages.dev` 与 preview wildcard hostname，policy 仅允许项目所有者邮箱；`noindex` 不是访问控制。当前只读 public repo，未配置 PAT。
- **P6 触发（2026-09-29）**：其他项目的 `main` 上 `.project/status.json` 变化时，项目侧 workflow POST Pages Deploy Hook；本仓库每天 00:17 UTC 定时 POST，也支持手动触发。Hook 仅启动 build，数据仍由 Full Refresh 读取。Hook URL 只保存在 GitHub Secrets；本仓库的 Hook 与 Secret 已配置，其他项目逐个接入。
- **Schema 加载（2026-09-27）**：`src/lib/project-status.ts` 由运行时 `readFileSync` + `import.meta.url` 改为静态 JSON import（`with { type: 'json' }`）。原方式在 Astro/Vite 打包后路径指向 `dist/` 而失败；schema 内容与验证行为不变，P2 / schema 测试全部通过。
- **Dashboard 数据流（2026-09-27）**：P4 不写 `projects.json`、不做 API route、客户端请求或数据库缓存；依赖仅新增 `astro`，未引入 UI 框架。
- **状态契约 ownership（2026-09-26）**：正式 canonical/public runtime schema 为本仓库 `schemas/project-status-v1.schema.json`；Skill Schema 是同步副本，后续 breaking change 必须走 v2。见 `docs/schema-ownership.md`。
- **迁移（2026-09-25）**：状态文件从无版本格式迁移到 `schemaVersion: 1`，事实内容未改变；迁移前备份保存在本地 `.project/backups/`（不纳入 Git）。
- 各项目仓库是自身状态的 Source of Truth；Control Plane 只读聚合，不修改被管理项目。依据：`docs/architecture.md`。
- 应用代码可公开，私人项目数据、私人备注、Feedback 原始内容和凭证不进入公开仓库；无法判断的数据默认按 Private 处理。依据：`docs/privacy-model.md`。

## Next

1. 批量接入其他 public projects。
2. 首次需要接入 private repo 时，再设计并启用 PAT 或 GitHub App。
3. 根据实际使用反馈，再决定是否进入 v2、persistent snapshots 或 incremental refresh。

## Known Issues

- personal-skills 未修改；其现有文档仍使用旧 canonical 措辞，待单独维护。`pnpm schema:compare` 需要传入 Skill Schema 路径，本仓库测试不依赖 personal-skills。
- 每次 build 对每个项目约发 2 次未认证 GitHub API 请求（匿名限额 60 次/小时），当前项目数量下不是问题。
- `.astro` 组件不在 `tsc` 检查范围内（未引入 `@astrojs/check`）；页面逻辑集中在已检查的 `src/lib/dashboard.ts`。
- `publicUrl` 保持 `null`：Dashboard 受 Access 保护，不将生产地址作为公开项目 URL 声明。
- 当前不接入 private repo，也不配置 PAT；首次有实际需求时再设计鉴权方案。
