# Project Handoff

## Current State

- v1 设计已确认并写入 README 与 docs/；P1～P4 已实现，P5 Cloudflare deployment 与 P6 Sync triggers 尚未开始。
- P1 Registry Reader：读取、验证 Registry v1，处理默认 `statusPath`，保留禁用项目。见 `docs/registry-reader.md`。
- P2 GitHub Status Reader：从 public repo default branch 读取状态文件，按本仓库 canonical Schema 验证。见 `docs/github-status-reader.md`。
- P3 Full Refresh：`refreshProjects()` 并发读取所有 enabled 项目，隔离单项目失败，返回内存中的 `project` + `source` + `sync` 聚合结果。见 `docs/full-refresh.md`。
- P4 Dashboard：Astro 静态页面在 build time 调用 `refreshProjects()`，经 `buildDashboard()` view-model 渲染；按 Active / Paused / Completed+Archived / Idea 分组，单独展示 Sync Issues。当前真实数据为本仓库（public），显示 sync ok。见 `docs/dashboard.md`。
- 测试：`pnpm test`（P1～P4 + schema，181 项）、`pnpm typecheck`、`pnpm build` 均通过。
- 状态内容更新时间为 2026-09-27（UTC）；状态契约为 `schemaVersion: 1`。Feedback Inbox 与 Ideas 属于 future。

## Decisions

- **Runtime（2026-09-27）**：仓库根目录 `mise.toml` 声明 node 24.21.0 与 pnpm 11.25.0，并把 pnpm store / cache 固定在仓库内、关闭 Astro telemetry。不修改 shell 或全局 mise 配置；首次使用需 `mise trust` 与 `mise install`，命令通过 `mise exec -- pnpm …` 运行。
- **Schema 加载（2026-09-27）**：`src/lib/project-status.ts` 由运行时 `readFileSync` + `import.meta.url` 改为静态 JSON import（`with { type: 'json' }`）。原方式在 Astro/Vite 打包后路径指向 `dist/` 而失败；schema 内容与验证行为不变，P2 / schema 测试全部通过。
- **Dashboard 数据流（2026-09-27）**：P4 不写 `projects.json`、不做 API route、客户端请求或数据库缓存；依赖仅新增 `astro`，未引入 UI 框架。
- **状态契约 ownership（2026-09-26）**：正式 canonical/public runtime schema 为本仓库 `schemas/project-status-v1.schema.json`；Skill Schema 是同步副本，后续 breaking change 必须走 v2。见 `docs/schema-ownership.md`。
- **迁移（2026-09-25）**：状态文件从无版本格式迁移到 `schemaVersion: 1`，事实内容未改变；迁移前备份保存在本地 `.project/backups/`（不纳入 Git）。
- 各项目仓库是自身状态的 Source of Truth；Control Plane 只读聚合，不修改被管理项目。依据：`docs/architecture.md`。
- 应用代码可公开，私人项目数据、私人备注、Feedback 原始内容和凭证不进入公开仓库；无法判断的数据默认按 Private 处理。依据：`docs/privacy-model.md`。

## Next

1. 进入 P5 deployment：Cloudflare Pages build 中完成 Full Refresh + Astro build 并部署。
2. P5 中确定真实 Dashboard 的访问控制与部署方式（页面目前仅有 `noindex`，不构成访问控制）。
3. private repo / PAT 暂未启用，接入首个 private repo 时再配置。

## Known Issues

- personal-skills 未修改；其现有文档仍使用旧 canonical 措辞，待单独维护。`pnpm schema:compare` 需要传入 Skill Schema 路径，本仓库测试不依赖 personal-skills。
- 每次 build 对每个项目约发 2 次未认证 GitHub API 请求（匿名限额 60 次/小时），当前项目数量下不是问题。
- `.astro` 组件不在 `tsc` 检查范围内（未引入 `@astrojs/check`）；页面逻辑集中在已检查的 `src/lib/dashboard.ts`。
- 尚无公开部署地址，`publicUrl` 保持 `null`。
