# P3 Full Refresh

P3 读取 Registry 中所有 enabled 项目，对每个项目执行 P2 GitHub Status Reader，并返回一份完整、失败隔离的内存聚合结果。P3 不写文件、不生成 `projects.json`。

## API

模块：`src/lib/refresh.ts`。

```ts
import { refreshProjects } from '../src/lib/refresh.ts';

const result = await refreshProjects();
// 可选参数（均可省略）：
// {
//   registry?: Registry;            // 已解析的 Registry；省略时读取 projectRoot 下的 registry.yaml
//   projectRoot?: string;           // 默认 process.cwd()
//   readStatus?: (project) => Promise<GitHubStatusResult>;  // 默认 readGitHubStatus + 无 token GitHubClient
//   now?: () => Date;               // 时钟注入，测试用
// }
```

同时导出 `classifyError(error)`，把 P2 错误映射为 `{ state, error }`，以及 `SyncState`、`SyncError`、`ProjectEntry`、`RefreshResult` 等类型。

## 输出

```jsonc
{
  "generatedAt": "2026-09-26T08:00:00.000Z",
  "projects": [
    {
      "project": { /* Project Status v1 原始结构，不改写 */ },
      "source": { "id": "project-control-plane", "repo": "kenkokuLife/project-control-plane", "statusPath": ".project/status.json" },
      "sync": { "state": "ok", "syncedAt": "2026-09-26T08:00:00.000Z" }
    },
    {
      "source": { "id": "broken-project", "repo": "owner/repo", "statusPath": ".project/status.json" },
      "sync": {
        "state": "unavailable",
        "syncedAt": "2026-09-26T08:00:00.000Z",
        "error": { "code": "rate_limited", "message": "GitHub API rate limit exceeded", "httpStatus": 403, "rateLimitReset": "1790000000" }
      }
    }
  ]
}
```

- `source.id` 是 Registry 稳定 ID，放在 `source` 下；与 status 内的 `project.id` 分别保留，不做匹配约束。
- 失败条目**不含** `project` 字段（不伪造、不用历史快照填充），但一定保留 `source` 与 `sync`。
- 成功条目的 `sync` 不含 `error`。
- `generatedAt` 与所有 `syncedAt` 来自同一次时钟读取，表示本轮 Full Refresh 的时间；它不是项目的 `updatedAt`。

## enabled 处理

Registry Reader 仍解析并保留 `enabled: false` 项目；Full Refresh 在读取前过滤掉它们，不发请求，也不出现在结果中。全部禁用或空 Registry 返回空 `projects`。

## sync.state（v1 固定四种）

| state | 含义 |
| --- | --- |
| `ok` | 读取、JSON parse、Project Status v1 验证均成功 |
| `unavailable` | 暂时或当前无法取得状态：repo / 文件不存在、网络、5xx、限流、其他 |
| `unauthorized` | 明确的 401 / 403 权限或认证失败（未来 private repo 无权读取也归此） |
| `invalid` | 文件存在但内容不符合契约：非法 JSON、schemaVersion 不支持、schema 验证失败、文件 envelope 异常 |

## 错误映射

| P2 错误 | 条件 | state | `error.code` |
| --- | --- | --- | --- |
| `GitHubError repository_not_found` | 404 | unavailable | `repository_not_found` |
| `GitHubError status_file_not_found` | 404 | unavailable | `status_file_not_found` |
| `GitHubError network_error` | 网络、超时、响应流中断 | unavailable | `network_error` |
| `GitHubError http_error` | 429；或 403 且 `x-ratelimit-remaining: 0` / 有 `retry-after` | unavailable | `rate_limited` |
| `GitHubError http_error` | 其余 401 / 403 | unauthorized | `unauthorized` |
| `GitHubError http_error` | 5xx 及其他状态码 | unavailable | `http_error` |
| `GitHubError invalid_response` | Contents 请求（文件 envelope / 编码异常） | invalid | `invalid_response` |
| `GitHubError invalid_response` | repo metadata 请求异常 | unavailable | `invalid_response` |
| `ProjectStatusParseError` | JSON parse 失败 | invalid | `invalid_json` |
| `ProjectStatusValidationError` | 问题涉及 `/schemaVersion` | invalid | `unsupported_schema_version` |
| `ProjectStatusValidationError` | 其他 schema 问题 | invalid | `schema_validation` |
| 其他任何异常 | 例如调用方传入非法 statusPath 的 `TypeError` | unavailable | `unexpected_error` |

403 的限流判断依据 GitHub 文档：primary rate limit 返回 `x-ratelimit-remaining: 0`，secondary rate limit 可能带 `retry-after`，两者都不是权限问题。

`sync.error` 结构为 `{ code, message, httpStatus?, retryAfter?, rateLimitReset? }`。`message` 由 P3 固定文本生成，从不透传上游 `Error.message`、cause、响应体或 header；schema 失败只列出字段路径（最多 5 个），不含字段值。token 仅存在于 `GitHubClient` 传输层，不会进入聚合结果。

## 失败隔离与并发

所有 enabled 项目通过 `Promise.all` 并发读取；每个项目的读取包在自身 `try/catch` 中（同步 throw 与 Promise reject 均被捕获），因此单个项目失败永远不会使整个 refresh reject。结果顺序与 Registry 中 enabled 项目的顺序一致，与完成先后无关。当前项目数量少，未引入并发限制；每个项目约 2 次 GitHub API 请求。

唯一使整个 refresh reject 的情况是 Registry 本身无法读取或验证（`RegistryError`）——此时没有可隔离的项目列表。

## 范围与后续

- 聚合结果只存在于内存，不持久化。写出 `projects.json` 等构建产物属于后续 build / deployment 阶段（P4 / P5）。
- 不实现 Cloudflare、GitHub Actions / `repository_dispatch`。P4 Dashboard 在 build 时直接调用 `refreshProjects()`，见 [Dashboard](dashboard.md)。
- private repo PAT 仍未启用；当前只读 public repo，默认 `GitHubClient` 不带 token。

## 验证

```sh
pnpm test:refresh     # P3 单元测试，mock P2 reader，无网络
pnpm test             # P1 + P2 + P3 + schema
pnpm typecheck
```

真实网络 smoke test 单独执行，不属于 `pnpm test`：

```sh
pnpm test:refresh:smoke
```

它对本仓库 `registry.yaml`（仅含 public `project-control-plane`）执行一次真实 Full Refresh，期望得到 1 个 `ok`。网络或限流可能导致失败。
