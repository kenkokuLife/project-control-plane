# Project Control Plane

用于统一查看和管理个人开发项目状态的项目控制台。

随着项目数量增加，希望解决这些问题：

- 很久没打开一个项目后，不记得做到哪里
- 不清楚当前项目的下一步是什么
- 不知道哪些项目仍然活跃、暂停或已经归档
- 部署地址、最近更新等信息分散
- 外部用户对不同网站的反馈没有统一入口
- 自己突然产生的想法容易散落在不同地方

## 核心原则

### 1. 项目自己是状态的 Source of Truth

每个被管理项目在自己的仓库内维护标准化项目状态，例如：

```text
.project/
└── status.json
```

Project Control Plane 只负责读取和聚合，不成为项目状态的唯一存储位置。

### 2. Registry 对项目原则上只有读取权限

Project Control Plane 不主动修改其他项目。

项目发生更新后，可以通过 CI/CD 通知 Control Plane 重新读取状态。

同时可以通过定时同步进行兜底。

### 3. Public by design, private by data

程序本身可以公开。

项目数据是否公开由数据本身决定。

真实私人备注、个人信息、Feedback 原始数据、凭证等不进入公开 Git 仓库。

### 4. 自动信息与语义信息分离

CI 可以自动生成：

- 最近 Commit
- Commit SHA
- Branch
- Build 状态
- Deployment 状态
- 最近部署时间

项目本人或 Coding Agent 维护：

- 当前状态
- 当前阶段
- 下一步
- Open Items
- 重要决策

## 计划中的模块

### Projects

查看所有项目：

- 状态
- 当前阶段
- Current
- Next
- 最近活动
- 部署地址
- Open Items

### Feedback Inbox

各项目网站可以提供 Feedback 入口。

所有 Feedback 统一进入 Control Plane 管理。

计划支持：

- 项目和页面来源
- Feedback 类型
- New / Read / Planned / Done / Archived
- Turnstile
- Rate Limit
- 输入长度限制等基础防滥用措施

Feedback 默认属于私人数据，不自动公开。

### Ideas

记录尚未正式成为项目的想法。

后续可以将 Idea 转换为正式 Project。

## 当前阶段

目前只进行：

1. 产品目标整理
2. 架构设计
3. Privacy Model
4. `.project/status.json` Schema 设计

在这些内容稳定之前，不开始复杂实现。