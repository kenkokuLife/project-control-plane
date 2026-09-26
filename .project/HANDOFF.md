# Project Handoff

## Current State

- Project Control Plane v1 的 Registry、读取、同步、聚合、存储、Dashboard 信息架构及技术栈已经确定并写入文档（README 与 docs/）。v1 设计已完成，P1 Registry Reader 已实现并通过 52 项测试及 TypeScript 类型检查。
- Project Control Plane Skill v1 已冻结，当前项目已正式接入状态管理体系；状态契约为 `schemaVersion: 1`。Skill 记录冻结日期为 2026-09-26。
- `status: active`、`stage: implementation`：已具备 Node/TypeScript、Registry 配置和测试；P2～P6、Astro 与 CI/CD 尚未实现。Feedback Inbox 与 Ideas 属于 future。
- 本次状态内容更新时间为 2026-09-26（UTC）；使用 Skill v1 的 `validate_status.py` 最低检查通过（PASS），未执行完整 JSON Schema 验证。

## Decisions

- **状态契约**：以 Project Control Plane Skill v1 的 canonical schema 为准；本仓库不保留本地状态 Schema 副本。旧的无版本 `schemas/project-status.schema.json` 与 v1 不兼容、从未提交、无任何引用，已删除。
- **迁移（2026-09-25）**：状态文件从无版本格式迁移到 `schemaVersion: 1`。事实内容未改变，只调整格式（`current` / `next` 由字符串包装为数组）；`updatedAt` 从 `2026-09-24` 更新为迁移日 `2026-09-25`。迁移前的原文件备份保存在本地 `.project/backups/`，该目录不纳入 Git。
- 各项目仓库是自身状态的 Source of Truth；Control Plane 读取和聚合，原则上不修改被管理项目。依据：README、`docs/architecture.md`。
- 自动信息（Commit、Build、Deployment 等）与人工维护的语义状态分离。依据：README、`docs/architecture.md`。
- 架构方向采用事件通知更新与定时同步兜底；当前尚无实现。依据：`docs/architecture.md`。
- 应用代码可公开，私人项目数据、私人备注、Feedback 原始内容和凭证不进入公开仓库；无法判断的数据默认按 Private 处理。依据：`docs/privacy-model.md`。
- 先稳定目标、架构、隐私模型和状态数据格式，再实现 UI 和后端，避免过早引入复杂基础设施。依据：`AGENTS.md`、README。

## Next

1. 落实 Project Status v1 Schema 的正式运行时引用方式。
2. 进入 P2 GitHub Status Reader；本次未开始 P2。

## Known Issues

- 项目状态此前只执行过 Skill v1 最低检查；P1 测试只验证 Registry，不代替 status.json 的完整 Schema 验证。
- Schema 的权威来源已确定为 Skill v1 canonical schema，本仓库不保留本地副本；P2 的 Node/TypeScript 验证实现如何引用该契约仍需落实（见 `docs/architecture.md` P2），不阻塞 P1。
- P3 实现前仍需明确稳定 ID 的外层字段位置、失败时 `project` 的空值表达、完整同步状态枚举及失败时的时间字段语义。
- Cloudflare Pages 已确定为部署平台；P5 部署真实个人数据前仍需确定私有访问控制方式，遵循 `docs/privacy-model.md`。
- private repo 的 v1 初期认证已确定为 fine-grained PAT，真正接入第一个 private repo 时再配置，P2 暂不处理；P6 的 workflow / hook 具体接线留待实现。
- 仓库没有可核实的公开部署地址，`publicUrl` 保持 `null`；Registry Reader 已验证，尚无 Dashboard。
