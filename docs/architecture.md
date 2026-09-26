# Architecture

本文记录已确认的 v1 技术设计，尚未实现。产品范围及 future roadmap 见 [Vision](vision.md)，数据公开边界见 [Privacy Model](privacy-model.md)。

## 技术栈：已确认 v1

- **Astro + TypeScript**：构建和渲染 Dashboard。
- **Node/TypeScript**：负责 Registry 读取、GitHub API 访问、project status validation 与 Full Refresh。
- **`registry.yaml`**：项目清单；字段约定见下文 Registry v1。
- **Cloudflare Pages**：执行构建并部署 Dashboard。
- **GitHub Actions**：负责项目事件触发与每日一次的全量 reconciliation 兜底。

v1 不使用数据库、Docker、Python runtime 或复杂状态管理。下文 P1～P6 是实现顺序，不代表功能已经完成。

## Source of Truth

v1 的事实来源只有：

- Control Plane 的 `registry.yaml`：管理哪些项目及其读取位置。
- 各项目自己的 `.project/status.json`（或显式覆盖路径）：项目自行声明的状态事实。

Control Plane 只读被管理项目，不主动修改它们。聚合数据可从上述来源重新生成。

项目本人或 Coding Agent 维护语义状态；CI/CD 可以维护客观信息，两者的职责分开。v1 只消费 status v1 契约内的数据，不另外抓取 Commit、Build、Deployment 或 HANDOFF 来补充 Dashboard 状态。

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

v1 使用事件触发刷新，加上 Control Plane 自己每天一次的全量 reconciliation 兜底，以处理事件丢失、项目 workflow 关闭等情况。事件可以来自：

- `status.json` 变化
- 主分支部署成功
- 手动 workflow dispatch

项目状态或其他重要变化通过 GitHub Actions / `repository_dispatch` / Cloudflare Pages deploy hook 触发 Project Control Plane rebuild。GitHub Actions 同时负责每日一次的 full reconciliation。具体 workflow 与 hook 接线在 P6 实现，所有入口均触发同一构建链路。

所有刷新入口采用相同的 Full Refresh 流程：

```text
项目重要变化 / 手动触发 / GitHub Actions 每日 reconciliation
    ↓
GitHub Actions / repository_dispatch / deploy hook 触发 rebuild
    ↓
Cloudflare Pages build：
    读取 registry.yaml，筛选所有 enabled 项目
    → 从 GitHub 读取各项目 .project/status.json（或 statusPath 覆盖路径）
    → 验证 status v1（schemaVersion: 1），隔离单项目失败
    → Full Refresh 聚合 project + source + sync
    → 生成临时聚合数据（例如 data/projects.json）
    → Astro build
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

Registry 的稳定 ID 用于关联聚合条目；不从仓库名称推导，也不覆盖项目 status 内自行声明的字段。已确认聚合条目采用 `project` + `source` + `sync` 结构。稳定 ID 的外层字段位置、失败时 `project` 的空值表达、完整同步状态枚举及失败时的时间字段语义，在 P3 实现前明确。

项目的 `updatedAt` 与 Control Plane 的 `sync.syncedAt` 含义不同，不能用同步时间冒充项目更新时间。

读取失败的 enabled 项目仍进入本轮聚合结果，保留身份、来源和同步错误。例如：

- `unavailable`：状态来源不可用。
- `unauthorized`：无法获得读取授权。
- `invalid`：内容不符合状态契约。

错误说明需足以识别问题，但不得泄露凭证或敏感响应内容。无法读取的业务字段不伪造，v1 不依赖历史快照填充失败条目。

## 存储与构建产物

v1 不使用数据库。每次同步 / build 临时生成完整聚合数据，例如 `data/projects.json`，再用于 Dashboard 构建。

聚合文件是缓存 / 构建产物，不是 Source of Truth，不提交进 Git。实现时应确保该产物不纳入版本控制；本文不创建产物或修改仓库忽略配置。

v1 不实现 per-project persistent snapshot 或 incremental refresh。未来若引入这些优化，仍保留每日全量 reconciliation；每日兜底本身已属于 v1。

## 模块职责：已确认 v1

| 模块 | 职责 |
| --- | --- |
| registry reader | 读取并解析 Registry v1，处理 `enabled` 与默认 `statusPath` |
| GitHub status reader | 按仓库与路径读取 default branch 的状态文件，处理 GitHub API 读取错误 |
| project status validation | 验证 `schemaVersion: 1` 及状态契约，返回项目级验证错误 |
| full refresh orchestration | 遍历所有 enabled 项目，编排读取与验证、隔离失败并生成完整临时聚合数据 |
| Dashboard rendering | Astro 消费聚合数据，展示项目状态、来源与同步异常 |

## 实现里程碑：已确认 v1

按 P1 → P6 推进；下列均为待实现的验收目标。

### P1 Registry Reader

- 能读取 `registry.yaml`，解析顶层 `version: 1` 与 `projects`。
- 支持 `enabled`，将禁用项目排除在本轮读取范围之外。
- 未指定 `statusPath` 时默认使用 `.project/status.json`。
- 字段和示例以本文 Registry v1 为准，足以开始 P1。

### P2 GitHub Status Reader

- 从真实 public repo 的 default branch 读取 `.project/status.json`，支持 Registry 的路径覆盖。
- 接入 project status validation，验证 `schemaVersion: 1` 和 status v1 契约。
- 暂不处理 private repo PAT；真正接入首个 private repo 时再按本文认证方案配置。
- 实现验证前落实 canonical status v1 Schema 的引用方式；验证运行时使用 Node/TypeScript。

### P3 Full Refresh

- 读取所有 enabled 项目，单项目读取或验证失败不阻断其他项目。
- 输出 `project` + `source` + `sync` 聚合结构，保留失败项目的身份、来源和同步错误。
- 按本文聚合数据模型补齐尚未确定的字段细节，生成不提交 Git 的临时完整聚合数据。

### P4 Dashboard

- 展示 `name`、`status`、`stage`、`current`、`next`、`updatedAt`、`publicUrl`、`source.repo`、`sync.state`。
- 按 Active / Paused / Completed+Archived / Idea 轻量分组，Completed 与 Archived 合并展示。
- 同步失败项目不能消失；缺失业务状态时仍展示可用身份、来源和错误，不能因无法分组而过滤掉。
- 页面消费构建时聚合数据，不实时请求所有 GitHub repo。展示含义见 [Vision](vision.md)。

### P5 Cloudflare deployment

- 在 Cloudflare Pages build 中依次完成 Full Refresh + Astro build，并部署 Dashboard。
- 临时聚合文件不进入 Git；部署真实个人数据前落实符合 [Privacy Model](privacy-model.md) 的访问边界。

### P6 Sync triggers

- 项目重要变化通过 GitHub Actions / `repository_dispatch` / deploy hook 触发 rebuild。
- GitHub Actions 每日执行一次 full reconciliation，作为事件触发的兜底。
- 所有触发入口复用相同构建链路，保证 Full Refresh 幂等，重复事件不产生重复项目或累计业务副作用。
