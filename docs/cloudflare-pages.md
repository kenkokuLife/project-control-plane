# P5 Cloudflare Pages deployment

状态：**P5 已完成**。Cloudflare Pages 已连接本仓库 GitHub repo；生产分支 `main` 的 `pages.dev` 站点已部署成功。`main` 更新后由 Cloudflare 自动 build / deploy。P6 尚未实现。

## GitHub 集成设置

Cloudflare Pages 使用 GitHub 集成，实际构建设置如下（仓库根目录为 Astro 项目根目录）：

| Cloudflare 字段 | 值 |
| --- | --- |
| Framework preset | Astro |
| Production branch | `main` |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/`（仓库根目录；若可留空则保持默认） |

`package.json` 声明 Node `24.21.0` 和 `packageManager: pnpm@11.25.0`，`pnpm-lock.yaml` 固定依赖。Cloudflare Pages v3 **不会**根据 `package.json` 的 `engines` 或 lockfile 推断工具版本。仓库根目录的 `.node-version` 固定 Node `24.21.0`；Cloudflare Pages 已设置 `PNPM_VERSION=11.25.0`。这是工具版本设置，不是 secret；当前业务构建不需要其他环境变量。`mise.toml` 仅用于本地开发，Cloudflare 不依赖 mise 或本地 shell 配置。

Pages 安装依赖后执行 `pnpm build`。该脚本执行 `astro build`；`src/pages/index.astro` 在构建时调用 `refreshProjects()`，从 `registry.yaml` 读取 enabled 项目，经 GitHub public API 读取状态并渲染静态 `dist/index.html`。不写 `projects.json`，没有 Worker runtime、API route、SSR 或数据库。当前只读取 public GitHub repo，未配置 PAT 或 private repo。

## Access 与隐私

生产 `pages.dev` hostname 和 preview wildcard hostname 都已由 Cloudflare Access 保护；当前 Access policy 仅允许项目所有者邮箱访问。Access 配置保存在 Cloudflare 账户中，不存入仓库。`noindex, nofollow` 只是搜索引擎提示，不构成访问控制。Pages 的预览 Access 开关不会自动保护生产 `*.pages.dev`，两类 hostname 需分别核对；见 [Cloudflare Pages 已知问题](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)。

## 验证与后续

本地 clean CI 模拟可在仓库根目录用声明版本运行：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

真实网络构建要检查输出页面显示当前 public repo 的 `Sync ok`。Full Refresh 会隔离单项目 GitHub 读取错误，因此 **构建成功本身不证明远端读取成功**；限流或网络故障会显示 Sync Issues。当前无 PAT，也未启用 private repo。无认证 GitHub API 请求按共享出口 IP 限流。

P5 的 `main` 自动构建只响应本仓库更新。P6 将实现其他项目状态变化触发 Control Plane rebuild，并增加每日一次 full reconciliation / rebuild 兜底。private repo / PAT 留到首次接入 private repo 时再配置。

参考：[Cloudflare Pages Astro 配置](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)、[Pages build image v3 版本规则](https://developers.cloudflare.com/pages/configuration/build-image/)、[Pages build 配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)。
