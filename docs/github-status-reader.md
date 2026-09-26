# P2 GitHub Status Reader

P2 读取单个 Registry project 的远端状态；不依赖本地 clone，也不遍历 Registry、筛选 enabled、执行 Full Refresh 或生成聚合文件。

## API

```ts
import { readGitHubStatus } from '../src/lib/github-status-reader.ts';

const result = await readGitHubStatus({
  id: 'project-control-plane',
  repo: 'kenkokuLife/project-control-plane',
  enabled: true,
  statusPath: '.project/status.json',
});
// result: { projectId, repo, statusPath, defaultBranch, rawJson, status }
// status 的类型为 ProjectStatusV1；rawJson 保留原始文件文本。
```

- `github.ts`：`GitHubClient.getDefaultBranch(repo)` 和 `readFile(repo, path, branch)`；仅负责 REST 请求、响应检查与文件解码。构造参数支持注入 `fetch`、可选 `token` 和每次请求的 `timeoutMs`（默认 15 秒）。不读取环境变量或任何凭证文件。
- `project-status.ts`：`parseProjectStatus(source): ProjectStatusV1`；JSON parse 后使用 Ajv draft 2020-12 和 ajv-formats 验证本仓库 `schemas/project-status-v1.schema.json`。路径相对模块定位，与工作目录无关；不读取 personal-skills。schemaVersion 必须为数字 1，不转换字段、不填充默认值、不移除额外字段。
- `github-status-reader.ts`：`readGitHubStatus(project, github?)`；按顺序获取 default branch、读取文件、验证，返回结构化结果；失败时抛出下面的错误。可注入客户端，认证不会进入业务逻辑。Registry ID 与 status ID 分别保留，P2 不增加 schema 之外的匹配约束。

## 读取行为与限制

每次读取先调用 `GET /repos/{owner}/{repo}`，再调用 `GET /repos/{owner}/{repo}/contents/{path}?ref={defaultBranch}`，明确使用返回的默认分支，不假设 main/master。路径按段编码，分支通过查询参数编码；statusPath 必须是无空段和 `.` / `..` 段的仓库相对文件路径。两次请求之间分支可能更新，P2 不提供 commit 快照保证。

使用 GitHub 官方 REST API（版本 2022-11-28），默认不附带 Authorization。Contents API 的 JSON envelope 必须是 base64 文件内容，然后严格解码 UTF-8。目录、缺失字段、异常编码等均作为 API 响应异常处理，不会被误报为 status schema 错误。当前支持 Contents API 内嵌内容的文件（不超过 1 MB）；不实现大文件下载回退，`encoding: none` 会报 `invalid_response`。参见 [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content)。

无 token 的 public repo 请求受 GitHub 按 IP 的限流约束；每次读取通常需要两次 API 请求。不自动重试，HTTP 状态码及限流头留给调用者判断。共享出口 IP 可能更早触发限流。private repo / PAT 配置属于后续事项，目前无需 PAT；可选 token 参数只是传输层扩展点。

## 错误

| 类型 / code | 含义 |
| --- | --- |
| `GitHubError / repository_not_found` | repo metadata 请求返回 404 |
| `GitHubError / status_file_not_found` | 指定 path/ref 的 Contents 请求返回 404 |
| `GitHubError / network_error` | 网络、超时或响应流读取失败，保留 cause |
| `GitHubError / http_error` | 其他非成功 HTTP 响应，包括 401、403、429、5xx |
| `GitHubError / invalid_response` | API JSON、metadata、文件 envelope 或编码异常 |
| `ProjectStatusParseError / invalid_json` | 文件内容无法 JSON parse，保留 cause |
| `ProjectStatusValidationError / schema_validation` | 不符合 canonical v1，包括不支持的 schemaVersion；issues 保留独立的 Ajv 错误快照 |

`GitHubError` 包含 `url`、可用时的 `status`、`retryAfter`、`rateLimitRemaining`、`rateLimitReset`。404 表示 GitHub 未提供资源，不能据此断言 private repo 真的不存在；Contents 404 也可能是分支已删除。不在 P2 映射为 P3 的 ok/unavailable/unauthorized/invalid。调用方传入不合法 repo/path 会得到 `TypeError`。

## 验证

```sh
pnpm test:registry
pnpm test:github-status
pnpm test:schema
pnpm typecheck
git diff --check
```

`pnpm test` 包含以上三组离线测试。HTTP 层使用 stub，无真实 GitHub 依赖。Ajv 和 ajv-formats 从开发依赖调整为运行依赖，沿用既有版本；没有新增包、全局依赖或 SDK。

真实网络检查单独执行，失败不影响核心测试：

```sh
pnpm test:github-status:smoke
```

它不使用 token，读取 `kenkokuLife/project-control-plane` 当前默认分支的 `.project/status.json` 并执行相同的 canonical schema 验证。网络、限流及远端内容变化都可能使此检查失败。
