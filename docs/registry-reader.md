# P1 Registry Reader

P1 已实现本地 Registry v1 的读取、解析、验证和默认值处理。使用 Node + TypeScript；Astro 页面及其依赖留到 Dashboard 阶段，不包含同步或网络请求。

## 运行

需要 Node >= 22.18（直接运行可擦除类型的 TypeScript）和 pnpm。在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
```

测试使用 Node 内置 test runner，不另装测试框架。`yaml` 是运行依赖；TypeScript 和 Node 类型声明是开发依赖。

## API

模块：`src/lib/registry.ts`。

- `parseRegistry(source: string): Registry`：解析 YAML 文本并验证，不读取文件。
- `readRegistry(projectRoot = process.cwd()): Promise<Registry>`：读取给定项目根目录的 `registry.yaml`；默认要求从项目根目录调用。
- `Registry` / `RegistryProject`：已验证的结果类型，`version` 固定为 `1`，每个项目始终包含字符串 `statusPath`。
- `DEFAULT_STATUS_PATH`：`.project/status.json`。
- `RegistryError`：文件读取、YAML 解析或字段验证失败时抛出；底层文件/YAML 错误通过 `cause` 保留。字段错误带有类似 `registry.projects[0].repo` 的位置。

`enabled: false` 项目保留在结果中，P1 不筛选、不同步。ID 保留原值，不从 repo 推导。`statusPath` 只有缺省时使用默认值，显式值必须是非空字符串。

Registry v1 顶层仅接受 `version` 和 `projects`，项目仅接受 `id`、`repo`、`enabled`、`statusPath`；未知字段及项目状态字段报错，避免拼写错误与重复的状态来源。`repo` 验证为两个以 `/` 分隔的非空仓库标识段，不接受 URL、空白或额外路径；不验证远端存在性。空项目列表允许。YAML 重复键、多文档及解析警告均拒绝。

P1 不验证 status.json。正式契约已发布为 `schemas/project-status-v1.schema.json`，P2 将直接加载它。`pnpm test:registry` 单独运行 P1 测试；`pnpm test` 同时运行独立的 Schema 测试，详见 [Schema ownership](schema-ownership.md)。
