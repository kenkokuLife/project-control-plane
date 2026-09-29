# Architecture

本文记录已确认的 v1 技术设计；P1～P5 已完成，P6 repository implementation 已完成，Deploy Hook 和本仓库 GitHub Secret 已配置，待真实联调。产品范围及 future roadmap 见 [Vision](vision.md)，数据公开边界见 [Privacy Model](privacy-model.md)。

## 技术栈：已确认 v1

- **Astro + TypeScript**：构建和渲染 Dashboard。
- **Node/TypeScript**：负责 Registry 读取、GitHub API 访问、project status validation 与 Full Refresh。
- **`registry.yaml`**：项目清单；字段约定见下文 Registry v1。
- **Cloudflare Pages**：执行构建并部署 Dashboard。
- **GitHub 集成与 Deploy Hook**：Control Plane 的 `main` 更新后由 Cloudflare Pages 自动 build / deploy；其他项目的状态变化及每日定时任务通过 Pages Deploy Hook 触发构建。

v1 不使用数据库、Docker、Python runtime 或复杂状态管理。下文 P1～P6 是实现顺序，不代表功能已经完成。

## Source of Truth

v1 的事实来源只有：

- Control Plane 的 `registry.yaml`：管理哪些项目及其读取位置。
- 各项目自己的 `.project/status.json`（或显式覆盖路径）：项目自行声明的状态事实。

Control Plane 只读被管理项目，不主动修改它们。聚合数据可从上述来源重新生成。

项目本人或 Coding Agent 维护语义状态；CI/CD 可以维护客观信息，两者的职责分开。v1 只消费 status v1 契约内的数据，不另外抓取 Commit、Build、Deployment 或 HANDOFF 来补充 Dashboard 状态。

## Project Status Schema ownership

正式 canonical/public runtime schema 为本仓库的 [`schemas/project-status-v1.schema.json`](../schemas/project-status-v1.schema.json)。Skill 内 Schema 是 Agent workflow 的同步副本，必须与本仓库保持一致；运行时不依赖 private personal-skills。此次仅调整 ownership，v1 字段契约未变，`schemaVersion` 仍为 1；后续 breaking change 必须走 v2。来源、同步责任及校验入口见 [Schema ownership](schema-ownership.md)。

## Registry v1

使用 `registry.yaml`，顶层包含 `version: 1` 和被管理项目列表 `projects`。

```yaml
version: 1
projects:
  - id: example-project
    repo: example-owner/example-repository
    enabled: true

  - id: special-project
    repo: example-owner/special-repository
    enabled: false
    statusPath: metadata/status.json
```

以上仅为示例，不是真实项目清单。

| 字段 | v1 约定 |
| --- | --- |
| `id` | 必填，Control Plane 内稳定的项目 ID，不自动从 repo 名推导 |
| `repo` | 必填，GitHub 仓库的 `owner/repository` |
| `enabled` | 必填，`false` 时本次同步直接跳过该项目 |
| `statusPath` | 可选，默认 `.project/status.json`，仅特殊项目显式覆盖 |

Registry 不引入 `visibility` 或 public/private dashboard 概念，也不记录 Feedback 开关。不复制 `name`、`current`、`next`、`status` 等项目状态字段，避免双 Source of Truth。

## GitHub 读取与认证

Control Plane 按 `repo + statusPath` 从 GitHub 读取 repository 的 default branch，不依赖本地 clone。v1 只读取 `status.json`，不读取 HANDOFF 作为 Dashboard 数据源。

Public repository 可直接读取。Private repository 经统一认证层读取，上层读取逻辑不绑定具体 token 类型。**已确认 v1 初期使用 fine-grained PAT**，等真正接入第一个 private repo 时再配置；P2 暂不配置或处理 private repo PAT。PAT 不进入 Git，通过部署平台的 Secret / Environment Variable 提供，且不得进入聚合产物或前端。后续可升级为 GitHub App + Contents Read，此升级属于 future。凭证管理遵循 [Privacy Model](privacy-model.md)。

单项目读取或验证失败必须隔离，不能让整个同步失败。

## 同步触发与 Full Refresh

P5 已使用 Cloudflare Pages 与本仓库 GitHub `main` 的直接集成；`main` 更新自动 build / deploy。P6 为其他项目提供 workflow 模板：push 到 `main` 且 `.project/status.json` 变化时，POST Pages Deploy Hook。本仓库另有每日 00:17 UTC 的 scheduled workflow，并支持手动 `workflow_dispatch`，调用同一个 Hook。Hook 与本仓库 GitHub Secret 已配置，真实联调待进行；详见 [P6 自动刷新触发](automatic-rebuild.md)。

所有刷新入口采用相同的 Full Refresh 流程：

```text
本仓库 main 更新（P5 GitHub 集成）；其他项目状态变化 / 每日定时 / 手动触发（P6 Deploy Hook）
    ↓
Cloudflare Pages 启动 main build
    ↓
pnpm build → Astro build → 构建时调用 refreshProjects()：
    读取 registry.yaml，筛选所有 enabled 项目
    → 从 GitHub 读取各项目 .project/status.json（或 statusPath 覆盖路径）
    → 验证 status v1（schemaVersion: 1），隔离单项目失败
    → Full Refresh 聚合 project + source + sync
    → 将内存结果渲染成 dist/ 静态 Dashboard
    ↓
Cloudflare Pages 部署 Dashboard
```

同步必须幂等：重复触发不会产生重复项目或累计业务副作用，按同样的来源重新生成完整结果；同步时间等元数据可以更新。单项目失败不阻断其他项目的同步与聚合。

Dashboard 只读取聚合后的数据，不在打开页面时实时读取所有 GitHub repository。当前项目数量少、每份状态文件很小，v1 接受每次全量读取的成本。

## 聚合数据模型

v1 不新建重复的 `NormalizedProject` 业务模型。每份项目 status v1 数据保留原结构，外层只添加 Control Plane 自己的元数据：

| 数据层 | 内容与职责 |
| --- | --- |
| `project` | 原始 status v1 字段与结构，不改写为另一套业务模型 |
| `source` | `source.repo`、`source.statusPath`，记录实际读取位置 |
| `sync` | `sync.state`、`sync.syncedAt`、失败时的 `sync.error` |

Registry 的稳定 ID 用于关联聚合条目；不从仓库名称推导，也不覆盖项目 status 内自行声明的字段。已确认聚合条目采用 `project` + `source` + `sync` 结构。P3 已明确：稳定 ID 位于 `source.id`；失败条目省略 `project`；`sync.state` 固定为 `ok` / `unavailable` / `unauthorized` / `invalid`；同一轮 refresh 的 `generatedAt` 与所有 `syncedAt` 取同一时间，失败条目同样记录。详见 [Full Refresh](full-refresh.md)。

项目的 `updatedAt` 与 Control Plane 的 `sync.syncedAt` 含义不同，不能用同步时间冒充项目更新时间。

读取失败的 enabled 项目仍进入本轮聚合结果，保留身份、来源和同步错误。例如：

- `unavailable`：状态来源不可用。
- `unauthorized`：无法获得读取授权。
- `invalid`：内容不符合状态契约。

错误说明需足以识别问题，但不得泄露凭证或敏感响应内容。无法读取的业务字段不伪造，v1 不依赖历史快照填充失败条目。

## 存储与构建产物

v1 不使用数据库。每次 build 在内存中生成完整聚合数据，由 Astro 直接渲染到 `dist/`；不写 `projects.json`，也不把生成的页面提交 Git。

v1 不实现 per-project persistent snapshot 或 incremental refresh。P6 的各触发入口均重新执行 Full Refresh，不改变数据模型和构建产物。

## 模块职责：已确认 v1

| 模块 | 职责 |
| --- | --- |
| registry reader | 读取并解析 Registry v1，处理 `enabled` 与默认 `statusPath` |
| GitHub status reader | 按仓库与路径读取 default branch 的状态文件，处理 GitHub API 读取错误 |
| project status validation | 验证 `schemaVersion: 1` 及状态契约，返回项目级验证错误 |
| full refresh orchestration | 遍历所有 enabled 项目，编排读取与验证、隔离失败并生成完整临时聚合数据 |
| Dashboard rendering | Astro 消费聚合数据，展示项目状态、来源与同步异常 |

## 实现里程碑：已确认 v1

按 P1 → P6 推进；P1～P5 已完成，P6 的仓库文件与本仓库外部配置已完成，真实联调待进行。

### P1 Registry Reader

- 能读取 `registry.yaml`，解析顶层 `version: 1` 与 `projects`。
- 支持 `enabled`，解析结果保留禁用项目；后续同步阶段再跳过。P1 不执行同步。
- 未指定 `statusPath` 时默认使用 `.project/status.json`。
- 字段和示例以本文 Registry v1 为准；实现与测试说明见 [Registry Reader](registry-reader.md)。

### P2 GitHub Status Reader

- 从真实 public repo 的 default branch 读取 `.project/status.json`，支持 Registry 的路径覆盖。
- 接入 project status validation，验证 `schemaVersion: 1` 和 status v1 契约。
- 暂不处理 private repo PAT；真正接入首个 private repo 时再按本文认证方案配置。
- 直接加载本仓库 `schemas/project-status-v1.schema.json`；验证运行时使用 Node/TypeScript，并启用 date/uri 格式校验。

### P3 Full Refresh

- 读取所有 enabled 项目，单项目读取或验证失败不阻断其他项目。
- 输出 `project` + `source` + `sync` 聚合结构，保留失败项目的身份、来源和同步错误。
- 按本文聚合数据模型返回内存中的完整聚合数据，不写临时聚合文件。实现说明见 [Full Refresh](full-refresh.md)。

### P4 Dashboard

- 展示 `name`、`status`、`stage`、`current`、`next`、`updatedAt`、`publicUrl`、`source.repo`、`sync.state`。
- 按 Active / Paused / Completed+Archived / Idea 轻量分组，Completed 与 Archived 合并展示。
- 同步失败项目不能消失；缺失业务状态时仍展示可用身份、来源和错误，不能因无法分组而过滤掉。
- 页面消费构建时聚合数据，不实时请求所有 GitHub repo。展示含义见 [Vision](vision.md)。
- 已实现：Astro 页面在 build 时直接调用 `refreshProjects()`，结果只在内存中经 `buildDashboard()` view-model 渲染为静态 HTML，不写 `projects.json`。实现说明见 [Dashboard](dashboard.md)。

### P5 Cloudflare deployment

- 已完成：Cloudflare Pages 连接本仓库 GitHub `main`，生产 `pages.dev` 部署成功，后续 `main` 更新自动 build / deploy。构建与版本设置见 [Cloudflare Pages deployment](cloudflare-pages.md)。
- 生产 hostname 与 preview wildcard hostname 均受 Cloudflare Access 保护，策略仅允许项目所有者邮箱访问，遵循 [Privacy Model](privacy-model.md)。当前只读 public repo；PAT 未配置。

### P6 Sync triggers

- 已提供其他项目的状态文件变更触发模板，只监听 `main` 的 `.project/status.json`。
- 已增加每日一次 full reconciliation / rebuild workflow，支持手动触发。
- 所有触发入口复用相同构建链路，保证 Full Refresh 幂等，重复事件不产生重复项目或累计业务副作用。
- Cloudflare Pages Deploy Hook 已绑定 `main`，本仓库 GitHub Secret 已配置；待合入 `main` 后手动联调，并选择一个 public 项目验证事件触发，详见 [P6 自动刷新触发](automatic-rebuild.md)。
