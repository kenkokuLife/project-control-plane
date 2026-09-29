# P6 自动刷新触发

状态：P6 repository implementation 已完成；Cloudflare Pages Deploy Hook 已绑定 `main`，本仓库 GitHub repository secret `CONTROL_PLANE_DEPLOY_HOOK` 已配置。真实联调尚未进行；workflow 合入 `main` 后开始运行。

## 运行链路

```text
其他已接入项目的 main 更新 .project/status.json ─┐
Control Plane 每日 00:17 UTC 定时任务 ──────────┼─→ POST Pages Deploy Hook
Control Plane 手动 workflow_dispatch ────────────┘       ↓
                                             Cloudflare Pages 构建 main
                                                       ↓
                                         Astro build 执行 Full Refresh
                                                       ↓
                                            部署静态 Dashboard
```

本仓库 `main` 的提交仍由现有 Cloudflare GitHub 集成自动部署。Deploy Hook 只负责启动同一个 Pages build；它不携带状态数据，不直接更新 Dashboard。每次 build 都按 `registry.yaml` 重新读取所有 enabled public repo 的状态，因而每日构建也是 full reconciliation。多次触发可能产生多次构建，但不会累计项目数据。

## 配置与项目接入

1. 已在 Cloudflare Pages 创建绑定 **`main`** 的 Deploy Hook；URL 按凭证保管，不写入仓库、示例、日志或 issue。位置为 **Workers & Pages → Project Control Plane 的 Pages 项目 → Settings → Builds**。
2. 已在 **project-control-plane** GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置 repository secret `CONTROL_PLANE_DEPLOY_HOOK`，供每日和手动 workflow 使用。
3. 在每个**需要状态变化后尽快刷新**、且已作为 enabled 项目列在 `registry.yaml` 中的 public 项目仓库，复制 [`examples/project-status-deploy-hook.yml`](../examples/project-status-deploy-hook.yml) 到该仓库的 `.github/workflows/control-plane-rebuild.yml`。在该项目仓库的 Actions repository secrets 中也新增同名 `CONTROL_PLANE_DEPLOY_HOOK`，值为同一个 URL。逐个接入即可；无需提前安装到所有项目。当前模板针对 `main` 和默认路径 `.project/status.json`；若该项目使用其他分支或 Registry `statusPath` 覆盖路径，接入时需对应调整过滤器。
4. 将本仓库 workflow 合入默认分支后，进行真实联调：在 GitHub **Actions → Daily Control Plane rebuild → Run workflow** 手动触发一次，并检查 Actions job、Cloudflare Pages deployment 和 Dashboard 的 `Sync ok` / `Sync Issues`。随后选择一个已纳入 Registry 的 public 项目完成第 3 步，改变该项目的 `.project/status.json`，验证 Dashboard 随之更新。本次仓库实施不调用真实 Hook。

Hook URL 无需配置为 Cloudflare build 环境变量；Pages 自己持有 Hook。此方案不需要 GitHub PAT、private repo access 或 Cloudflare API token。Hook 是可直接触发构建的凭证，若泄露应在 Cloudflare 删除并重建，然后更新每个已接入仓库的同名 GitHub Secret。

## 触发与时间

- 项目模板：仅在 push 到 `main` 且 `.project/status.json` 改变时运行；新增、修改、删除该文件都会触发。其他文件变更不会触发。
- 本仓库每日 workflow：`17 0 * * *`，即每天 **00:17 UTC / 09:17 日本时间（JST）**；也支持 `workflow_dispatch`。
- GitHub 的定时运行是尽力调度，可能延迟，负载高时甚至可能跳过。因此每日 workflow 是一次/天的计划兜底，不能保证严格的 24 小时 SLA。发生遗漏时可用手动触发补跑。
- GitHub Actions 定时 workflow 在默认分支运行。public 仓库长期无活动时，GitHub 可能自动禁用 scheduled workflow；应检查 Actions 状态并重新启用。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 项目状态更新后没有 Actions run | 确认 workflow 已在该项目默认分支、push 到 `main`，以及提交中确实包含 `.project/status.json` 变化；若项目使用覆盖路径，要同步修改模板的 `paths`。 |
| Job 报 `Missing GitHub secret` | 在**报错的仓库**配置 `CONTROL_PLANE_DEPLOY_HOOK`；每个仓库的 repository secret 独立。 |
| Job 报 Deploy Hook request failed | 检查 secret 是否为当前 Pages 项目的 Hook URL、Hook 是否仍存在、绑定分支是否为 `main`；必要时重建 Hook 并更新所有仓库的 secret。日志不会打印 URL 或响应体。 |
| Job 成功但页面没更新 | 到 Cloudflare Pages deployments 查看 Hook 来源的 build/deploy 是否完成；再看 Dashboard 的 `Sync Issues`。Hook POST 成功只表示请求被接受，不证明 Full Refresh 读取成功。 |
| 每日任务没运行 | 检查本仓库 workflow 是否在默认分支、Actions 是否启用、scheduled workflow 是否因长期无活动被禁用；可先用 `Run workflow` 补跑。 |

本地普通测试只静态解析 workflow YAML、校验触发条件与 secret 使用，不调用真实 Hook。

参考：[Cloudflare Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)、[GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[GitHub Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)。
