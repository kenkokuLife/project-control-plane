# Project Status v1 Schema ownership

Project Status Schema 属于 Project Control Plane 本体。正式 canonical/public runtime schema 位于 [`schemas/project-status-v1.schema.json`](../schemas/project-status-v1.schema.json)。P2 及未来 Cloudflare build 从当前仓库加载它，不依赖 private personal-skills 仓库，也不在运行时下载 Skill。

Skill 负责指导 Agent 使用、迁移和验证契约；其中的 schema 是 Agent workflow 的同步副本，不是独立的契约来源。两者必须保持一致。

## 来源与版本

2026-09-26 从被冻结的 Project Control Plane Skill v1 原样复制，来源为 personal-skills 的 `skills/project-control-plane/schemas/project-status-v1.schema.json`，冻结基线 commit 为 `10c85a6cd0eb56ebb8599e81a42d8b8d454b42c6`。此次已核对当前 Skill 文件、冻结基线和本仓库文件逐字节一致。

冻结文件 SHA-256：`38476a634281876ad084c554cc6b9b95df5338d0f879744611f14b423d03f778`。

本次只转移 ownership，字段契约和验证判定没有变化，继续使用 `schemaVersion: 1`。增删/重命名字段、改变类型、枚举、格式、语义或放宽约束等 breaking change 必须新增 v2 Schema 及迁移规则，不允许原地修改冻结 v1。说明澄清优先放在本文，避免改动冻结文件。

## 最小防漂移机制

- `pnpm test:schema` 在当前仓库验证冻结文件指纹、Draft 2020-12 meta-schema、必填/类型/枚举/额外字段/date/uri，以及当前项目状态。测试无需读取 personal-skills。
- `pnpm schema:compare /path/to/skill/schemas/project-status-v1.schema.json` 只读比较副本。忽略 JSON 排版和对象键顺序，其余内容不同、文件缺失或 JSON 无效都以非零退出；不会自动覆盖任何文件。
- Project Control Plane 维护者负责 canonical schema 与版本演进；Skill 维护者负责同步副本、workflow 文档和验证说明，并在每次 Skill 发布或 Schema 相关修改时运行比较命令，记录所对应的 Control Plane commit。
- 涉及 Schema 的评审必须检查测试和同步记录，不得通过更新指纹掩盖 v1 契约变更。若比较失败，先调查来源；契约发生变化时走 v2。

本次没有修改 personal-skills。该仓库现有 SKILL.md 仍将其副本称为 canonical，后续需在单独授权的 Skill 文档维护中更新这一措辞；本次已验证两个 Schema 内容相同。这不阻塞本仓库独立进入 P2。

这里没有跨仓库自动同步或后台监控：单仓库测试能发现 canonical v1 改动；副本变化由 Skill 发布/修改时显式执行比较发现。

## 本次边界

Ajv 和 ajv-formats 仅作为开发依赖用于 Schema 测试，启用 date/uri 格式校验。没有实现 P2 的 status reader、运行时验证模块或 GitHub API；P2 应直接消费本地 canonical schema。
