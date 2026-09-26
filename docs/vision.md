# Vision

## 产品目标

个人项目暂停一段时间后，重新理解进展和下一步往往需要翻阅 README、Git、Issue、聊天和笔记。Project Control Plane 希望降低这种上下文恢复成本，让多个项目保持可理解、可继续的状态。

它不替代 GitHub、Linear、Jira 等项目管理工具。长期愿景是保留“重新开始所需要的上下文”。

## Dashboard v1：已确认

打开页面后，在 10 秒内知道：

- 有哪些项目
- 哪些正在进行
- 做到哪里
- 下一步是什么
- 有没有同步异常

每个项目至少展示以下信息；状态读取失败时，仍保留该项目并展示可用的来源信息与错误，不能因缺少状态而隐藏项目。

| 字段 | 展示含义 |
| --- | --- |
| `name` | 项目名称 |
| `status` | 项目声明的状态 |
| `stage` | 当前阶段 |
| `current` | 当前进展 |
| `next` | 下一步 |
| `updatedAt` | 项目声明的更新时间 |
| `publicUrl` | 公开地址（如果有） |
| `source.repo` | 来源仓库 |
| `sync.state` | Control Plane 的同步状态 |

页面按 Active、Paused、Completed+Archived、Idea 做轻量分组，Completed 与 Archived 合并展示。这里的 Idea 是已登记项目的状态分组，不是独立的 Ideas 收集功能。

同步失败需要显示错误状态，例如 `unavailable`、`unauthorized`、`invalid`，以及必要的错误说明。同步状态与项目自己声明的业务状态分开。读取与失败处理规则见 [Architecture](architecture.md)。

技术栈、构建运行链路、模块职责和 P1～P6 实现里程碑统一记录在 [Architecture](architecture.md#实现里程碑已确认-v1)。

### v1 不做

- Kanban、百分比进度、Timeline、Task 管理
- 搜索、Tag 系统、图表、Activity Feed
- 登录系统
- Public / Private 两套 Dashboard
- Feedback Inbox、Ideas 收集与管理

排除项不代表已经承诺后续实现。

## Future roadmap

以下是长期方向，不进入 Dashboard v1：

- **Feedback Inbox**：统一接收各项目网站的反馈，后续可探索来源项目与页面、反馈分类、处理状态和摘要。
- **Ideas**：收集尚未正式立项的想法，并探索转换为正式项目。
- **上下文扩展**：Open Items、Decision / Handoff 信息、Coding Agent 可读取的上下文、长期项目历史，以及额外的 Build / Deployment 信息。
- **同步优化**：per-project persistent snapshot、incremental refresh，并保留 daily full reconciliation 兜底。v1 已采用每日全量兜底；未来变化是引入持久快照与增量刷新，详见 [Architecture](architecture.md)。

Registry / Status 从其他仓库读取数据，而 Feedback / Ideas 需要 Control Plane 自己接收和写入数据，两者的数据生命周期不同。未来 Feedback 可能需要 API、D1 或其他持久化、Turnstile、Rate Limit、Honeypot、输入限制和隐私处理；这些不作为 v1 的基础设施引入。

公开范围与真实个人数据的边界统一以 [Privacy Model](privacy-model.md) 为准。
