# Project Handoff

## Current State

- 项目用于统一查看和管理个人开发项目状态、反馈和想法；当前处于设计阶段（`status: active`、`stage: design`）。
- README、`docs/vision.md`、`docs/architecture.md`、`docs/privacy-model.md` 记录了产品目标、架构方向和隐私原则的初稿；文档存在不代表设计已定稿。
- 尚无应用代码、依赖清单、测试、Registry 配置或 CI/CD 工作流。Registry、Feedback Inbox 和 Ideas 均为规划内容。
- `.project/status.json` 采用 Project Control Plane 状态契约 v1（`schemaVersion: 1`），已通过 Project Control Plane Skill v1 的最低验证脚本（`validate_status.py`，PASS）。

## Decisions

- **状态契约**：以 Project Control Plane Skill v1 的 canonical schema 为准；本仓库不保留本地状态 Schema 副本。旧的无版本 `schemas/project-status.schema.json` 与 v1 不兼容、从未提交、无任何引用，已删除。
- **迁移（2026-09-25）**：状态文件从无版本格式迁移到 `schemaVersion: 1`。事实内容未改变，只调整格式（`current` / `next` 由字符串包装为数组）；`updatedAt` 从 `2026-09-24` 更新为迁移日 `2026-09-25`。迁移前的原文件备份保存在本地 `.project/backups/`，该目录不纳入 Git。
- 各项目仓库是自身状态的 Source of Truth；Control Plane 读取和聚合，原则上不修改被管理项目。依据：README、`docs/architecture.md`。
- 自动信息（Commit、Build、Deployment 等）与人工维护的语义状态分离。依据：README、`docs/architecture.md`。
- 架构方向采用事件通知更新与定时同步兜底；当前尚无实现。依据：`docs/architecture.md`。
- 应用代码可公开，私人项目数据、私人备注、Feedback 原始内容和凭证不进入公开仓库；无法判断的数据默认按 Private 处理。依据：`docs/privacy-model.md`。
- 先稳定目标、架构、隐私模型和状态数据格式，再实现 UI 和后端，避免过早引入复杂基础设施。依据：`AGENTS.md`、README。

## Next

1. 确定本仓库如何引用 v1 状态 Schema（直接引用 Skill 或在本仓库维护副本）。
2. 设计最小可用 Registry：项目列表格式与 `status.json` 读取流程。

## Known Issues

- 验证只达到最低检查级别，未执行完整 JSON Schema 验证（环境无 validator，未安装依赖）。
- 本仓库目前不包含状态 Schema；架构文档中 Public Repository 包含 Schema 的设想，需在上面 Next 1 中落实。
- `docs/privacy-model.md` 将“详细 Next Step”列为默认 Private。当前 `next` 与 README 已公开的阶段描述相当，判断为可公开；若写入更具体的下一步，需重新评估。
- 仓库没有可核实的公开部署地址，`publicUrl` 保持 `null`；尚无可运行应用，未验证运行效果。
