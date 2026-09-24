# Vision

## 背景

随着个人开发项目越来越多，最大的成本不再只是“怎么继续开发”，而是“重新理解这个项目”。

一个项目暂停几周或几个月之后，重新开始时经常需要重新确认：

- 这个项目现在做到哪里
- 为什么当时这样设计
- 下一步原本准备做什么
- 哪些问题还没有解决
- 当前部署在哪里
- 最近一次修改是什么
- 有没有来自外部用户的反馈

这些信息通常分散在：

- Git Commit
- README
- Issue
- Chat
- 本地笔记
- Coding Agent 的上下文
- 自己的记忆

Project Control Plane 希望降低这种 Context Recovery 成本。

## 目标

建立一个个人项目的统一控制面，让自己可以快速回答：

- 我现在有哪些项目？
- 哪些项目正在进行？
- 哪些暂停了？
- 每个项目当前做到哪里？
- 下一步是什么？
- 最近发生了什么？
- 有哪些 Open Items？
- 有哪些外部 Feedback？
- 有哪些还没有正式立项的 Idea？

目标不是替代 GitHub、Linear、Jira 或其他项目管理工具。

它更关注的是：

> 在多个个人项目之间，持续保留“重新开始所需要的上下文”。

## 核心模型

每个项目自己维护自己的状态。

Project Control Plane 负责：

1. 发现项目
2. 读取项目状态
3. 聚合项目信息
4. 展示整体状态
5. 接收跨项目 Feedback
6. 管理尚未归属具体项目的 Idea

项目本身仍然是 Source of Truth。

Control Plane 应该可以随时删除并重新构建，而不导致项目状态丢失。

## 长期方向

未来希望它不仅是 Dashboard，而是一个个人开发的 Context Hub。

可能逐步支持：

- Project Registry
- Current / Next / Open Items
- Deployment / Build 状态
- Feedback Inbox
- Idea Inbox
- Decision / Handoff 信息
- Coding Agent 可读取的项目上下文
- Coding Agent 可使用的 Feedback 摘要
- 长期项目历史

最终希望做到：

> 无论一个项目停了多久，都可以在很短时间内重新进入状态。