# Architecture

## 总体结构

Project Control Plane 本身不保存各项目的主状态。

每个项目在自己的仓库中维护：

```text
.project/
└── status.json
```

Project Control Plane 负责读取这些状态并进行聚合展示。

## 项目状态来源

每个项目的 `.project/status.json` 由项目自己维护。

内容分成两类：

### 语义状态

由本人或 Coding Agent 维护：

- 项目名称
- 项目状态
- 当前阶段
- Current
- Next
- Open Items
- Summary
- Public URL

### 客观状态

可以由 CI/CD 自动补充：

- Branch
- Commit SHA
- Last Commit Time
- Build 状态
- Deployment 状态
- Last Deployment Time

## Registry

Project Control Plane 维护一个 Registry，用于记录：

- 哪些项目需要被管理
- GitHub Repository
- status.json 路径
- 项目是否公开
- 是否启用 Feedback

示例：

```yaml
projects:
  - id: project-control-plane
    repo: <owner>/project-control-plane
    status_path: .project/status.json
    visibility: public

  - id: example-private-project
    repo: <owner>/example-private-project
    status_path: .project/status.json
    visibility: private
```

## 同步方式

采用：

> Event-driven update + periodic reconciliation

### Event-driven

项目发生重要变化，例如部署成功后：

```text
Project CI
    ↓
通知 Project Control Plane
    ↓
触发重新读取项目状态
    ↓
重新生成聚合数据
```

可以使用 GitHub Actions 的跨仓库触发机制实现。

### Periodic reconciliation

Project Control Plane 自己定时重新读取全部项目。

用于处理：

- 某个项目 CI 失败
- 通知事件丢失
- 手工修改 status.json
- 项目 workflow 暂时关闭

## 权限模型

Control Plane 原则上只拥有各项目的读取权限。

不主动修改被管理项目。

对于 Private Repository，后续优先考虑使用：

- GitHub App
- 最小必要的 Contents Read 权限

初期实现也可以先使用更简单的授权方式验证方案。

## Feedback

各项目可以提供自己的 Feedback 入口，但统一提交到 Project Control Plane 的 Feedback API。

```text
Project A ─┐
Project B ─┼─→ Feedback API → Feedback Store
Project C ─┘
```

提交时可以自动携带：

- project_id
- feature_id
- page_url
- version
- category
- message

Feedback 默认属于私人数据。

## Feedback 防滥用

初期考虑：

- Cloudflare Turnstile
- 服务端验证
- Rate Limit
- 输入长度限制
- Honeypot
- 必要时使用短期来源 Hash

不以长期追踪用户为目的。

## Public / Private

代码与用户数据分离。

```text
Public Repository
├── Application Code
├── Schema
├── Architecture
└── Example Data

Private Runtime Data
├── Private Project Metadata
├── Feedback
├── Personal Notes
└── Secrets
```

原则：

> Public by design, private by data.

如果未来私人数据确实需要 Git 版本管理，再考虑建立独立的 Private Data Repository。

## 初期不做的内容

第一阶段避免：

- 复杂登录系统
- 双代码库 Public / Private 实现
- 实时读取所有 GitHub Repository
- 复杂 Project Management Workflow
- Jira / Linear 风格的 Task 管理
- 过早引入复杂基础设施