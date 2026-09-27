# P4 Dashboard

P4 用 Astro 生成一个静态 Dashboard。build 时调用一次 P3 `refreshProjects()`，把内存中的聚合结果渲染为 `dist/index.html`。P4 不写 `projects.json`，页面也不在运行时请求 GitHub。

## 运行环境

Node 与 pnpm 由仓库根目录的 `mise.toml` 声明（node 24.21.0、pnpm 11.25.0），不依赖 shell 中全局可用的 node / pnpm，也不修改 shell 配置：

```sh
mise install          # 首次：安装 mise.toml 声明的版本
mise exec -- pnpm install
mise exec -- pnpm build
```

`mise.toml` 同时把 pnpm store / cache 固定在仓库内（`.pnpm-store/`、`.pnpm-cache/`，均已 gitignore），并关闭 Astro telemetry（`ASTRO_TELEMETRY_DISABLED=1`），避免写入用户级目录。首次使用需 `mise trust`。

## 数据流

```text
pnpm build (astro build)
  → src/pages/index.astro 在 build 时执行
    → refreshProjects()            // P3，读取 registry.yaml，从 GitHub 读取各项目状态
    → buildDashboard(result)       // P4 纯函数 view-model：分组、字段白名单、URL 过滤
  → 渲染为静态 dist/index.html
```

- Registry 从 build 时的工作目录读取（与 P3 默认一致）。Registry 本身无法读取时 build 失败；单项目失败只进入 Sync Issues。
- 结果不落盘，不做 API route、客户端请求或数据库缓存。
- 当前只读 public repo，默认 `GitHubClient` 不带 token；PAT 未启用。每次 build 约每项目 2 次未认证 GitHub API 请求。
- `project-status.ts` 改用 `import schema from '…json' with { type: 'json' }` 加载 canonical schema：原先基于 `import.meta.url` 的运行时路径在 Vite 打包后指向 `dist/`，会找不到文件。schema 内容与验证行为不变。

## 信息架构

- 顶部：`Project Control Plane`，以及 `N projects · M sync issues · generated <UTC 时间>`；sync issues 是指向下方区域的锚点，仅在有失败时出现。
- 按 status 分组，固定顺序 **Active → Paused → Completed / Archived → Idea**；空分组不显示。组内顺序与 Registry 一致。
- 正常项目：name、status badge、stage、summary、Current、Next（强调色左边线）、Updated（项目自己的 `updatedAt`）、`Sync ok`、`source.repo`（链接到 GitHub）、`Open ↗`（仅当 `publicUrl` 为 http(s) URL）。`current` / `next` 为空时显示 `—`。
- **Sync Issues**：页面底部单独一块浅警示色区域，逐条展示 `source.id`、`sync.state`、`error.code`（及 HTTP 状态码）、P3 生成的固定文本 message、`source.repo`、`statusPath`、`syncedAt`。失败项目不伪造业务字段，也不参与分组。
- 空状态：无 enabled 项目时提示 “No enabled projects in registry.yaml.”；全部失败时提示去看 Sync Issues。
- 不显示百分比进度；不做 Kanban、图表、Timeline、搜索、Tag、Activity Feed、Feedback、Ideas、登录。
- 页面带 `noindex, nofollow`；时间以 UTC 绝对时间显示（静态页面不用相对时间）。

## 安全边界

`buildDashboard()` 只按白名单挑选字段，不展开 `sync.error` 对象，因此 token、Authorization header、响应体、本地路径即使意外出现在输入中也不会进入页面（有测试覆盖）。`publicUrl` 只接受 `http:` / `https:`，其他协议（如 `javascript:`）不渲染链接。

## 响应式

- 单列到多列：`grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr))`，375px 手机宽度为单列。
- 全局 `overflow-wrap: anywhere`，长 repo 名、长 token 式文本在卡片内换行，无页面级横向滚动。
- 链接最小点击高度 44px；所有信息直接可见，不依赖 hover。
- 跟随系统 light / dark 配色。

## 验证

```sh
mise exec -- pnpm test:dashboard   # P4 view-model 测试
mise exec -- pnpm test             # P1～P4 + schema
mise exec -- pnpm typecheck
mise exec -- pnpm build            # 真实网络 Full Refresh + 静态输出到 dist/
mise exec -- pnpm preview          # 本地预览 dist/
```

## 范围与后续

- P4 仍没有持久化的 `projects.json`；聚合结果只在 build 进程内存中。
- Cloudflare Pages 部署及真实数据访问边界属于 P5；事件触发与每日 reconciliation 属于 P6。
- PAT / private repo 仍未启用。
