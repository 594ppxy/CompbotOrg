# CompbotOrg

> From AI Agents to AI Organizations.
>
> **Company Bot Organization OS**（Comp = Company / 复合组织）—— 一个开放协议驱动的 AI 组织操作系统：让用户管理一家 AI 公司，而不是管理几十个孤立 Bot。
>
> 名字里的 **Open** 不在标签上，而在骨子里：MIT 许可证、开放协议、可被社区的 Runtime 替换。

**当前版本：v0.2 — Organization Protocol**（组织开始「动」起来）

---

## 这是什么

CompbotOrg 不是一个多 Agent 聊天框架，也不是 Agent Swarm。它要解决的问题是：

> 当你有 30 个 Bot 的时候，你需要的不是 30 个对话框，而是一个**组织**。

组织意味着：有人负责定方向，有人负责拆任务，有人负责干活，有人负责验收。有汇报线，有权限边界，有审批流程，有审计记录。

本项目在 **DeepSeek Harness (DSH)** 与 **Tobs (BotHarness/DeepSeekBot)** 的代码基础上深度改造，复用它们已经验证过的 Agent 运行时、Session 持久化、Bot 身份、记忆系统与 IM 接入，只补齐真正缺失的那一层：**组织**。

---

## v0.1 已经实现什么

`packages/organization` 是组织领域核心，完全独立于运行时、传输层和 UI。

| 能力 | 说明 |
|------|------|
| **Organization** | 创建组织、命名、描述、指定最高负责人 |
| **Department** | 部门创建、嵌套子部门、部门元数据 |
| **Role** | 9 个内置角色 + 自定义角色，5 级 rank，48 种权限 |
| **Membership** | Bot 加入、调动、晋升、停职、复职、离职 |
| **Hierarchy** | 汇报线、祖先/后代查询、组织树、深度统计 |
| **Authority** | 基于 rank + scope 的管理关系推导 |
| **Permission** | 角色默认权限 + 个人加授/剥夺 |
| **Event Sourcing** | 每条命令产生一个不可变事件，日志可完整重放 |

### 设计上的几个关键取舍

**1. 汇报线与部门归属是正交的**

一个 Bot 可以属于 `Research` 部门，但汇报给 `AI Lab` 的负责人。真实组织经常这样运作，代码里不强行绑死。

**2. 权限由 rank 与 scope 共同决定**

`canManage(actor, target)` 需要同时满足三个条件：

- actor 的 rank 严格小于 target 的 rank（数字更小 = 更资深）
- actor 的 authority scope 覆盖 target（self / subtree / department / organization）
- 双方都在 active 状态

任何一条不满足都会被拒绝，并给出可读的原因（`whyCannotManage`），方便 Bot 决定该向谁升级。

**3. 事件溯源而非可变状态**

`OrganizationService` 的每个写操作都只 append 一个事件，然后折叠到投影。这意味着：

- 组织可以完整审计（谁在什么时候改了什么）
- 组织可以回放重建（`restoreOrganization(events)`）
- 可以基于日志做时间旅行对比

**4. 结构约束优先于业务约束**

"不能成环" 是结构性不可能，先于 "上级必须比下级资深" 这条业务规则检查。否则"让自己汇报给自己的下属"会报出令人困惑的 rank 错误。

---

## v0.2 已经实现什么

`packages/task` 是组织协议核心，把 v0.1 的静态组织结构变成可运转的工作流，同样独立于运行时、传输层和 UI。

| 能力 | 说明 |
|------|------|
| **Task** | 创建、指派、向下委派、认领、开始、阻塞/解阻、完成、取消；记录委派深度与产物引用 |
| **Report** | 提交报告、上级审阅、批准/驳回（不允许自审） |
| **Decision** | 请求决策、作出决策（自动定位 requester 的直属上级） |
| **Approval** | 请求审批、批准/驳回；审批人必须能管理请求人 |
| **Escalation** | 沿汇报线升级；显式目标必须在汇报线上且能管理原负责人 |
| **Authorizer** | 注入式授权端口；`OrganizationAuthorizer` 直接复用 v0.1 的 `canManage`（rank × scope） |
| **EventBus** | 每次 commit 同步发布领域事件，支持类型过滤、退订、错误隔离 |
| **Event Sourcing** | 18 种领域事件、纯函数折叠、`restoreTask(events)` 完整重放 |

```ts
import { OrganizationAuthorizer, TaskService } from '@compbotorg/task'

const tasks = new TaskService({ authorizer: new OrganizationAuthorizer(org) })
const task = tasks.createTask({ title: 'Ship v0.2', createdBy: ceo }, { actorId: ceo })
tasks.assignTask(task.id, engineer, { actorId: ceo })   // 不能管的人不能派活
tasks.completeTask(task.id, { summary: 'done' }, { actorId: engineer })
tasks.approveReport(report.id, 'LGTM', { actorId: director })
```

`pnpm demo:protocol` 会跑通完整闭环：建任务 → 向下委派 → 完成 → 提交报告 → 上级审批 → 决策 → 审批 → 阻塞升级 → 事件重放，并演示一次越权派活被拒绝。

---

## 快速开始

```bash
pnpm install
pnpm verify          # 类型检查 + 124 个测试 + 两个 demo 冒烟
pnpm demo            # 打印一家完整 AI 公司的组织结构
pnpm demo:protocol   # 跑通 v0.2 组织协议闭环
```

`pnpm demo` 的输出：

```text
Ada — CEO @ Executive
├─ Linus — CTO @ Engineering
│  ├─ Margaret — Director @ Engineering
│  │  ├─ Ken — Engineer @ Engineering
│  │  └─ Barbara — Engineer @ Engineering
│  └─ Demis — Director @ AI Lab
│     ├─ Alan — Researcher @ Research
│     └─ Yann — Engineer @ AI Lab
└─ Grace — COO @ Executive
   └─ Sheryl — Director @ Marketing
      └─ Brian — Analyst @ Marketing
```

---

## 代码用法

```ts
import { BotId, DepartmentId, OrganizationService, RoleId } from '@compbotorg/organization'

const org = new OrganizationService()

// 1. 创建组织（自动注册 9 个内置角色）
org.createOrganization({ name: 'Acme AI' })

// 2. 建部门
const engineering = org.createDepartment({ name: 'Engineering' })

// 3. 第一个成员自动成为 CEO
const ceo = BotId('bot-ada')
org.addMember({
  botId: ceo,
  displayName: 'Ada',
  departmentId: engineering.id,
  roleId: RoleId('ceo'),
})

// 4. 招一个工程师，挂在 CEO 下面
const engineer = BotId('bot-ken')
org.addMember(
  {
    botId: engineer,
    displayName: 'Ken',
    departmentId: engineering.id,
    roleId: RoleId('engineer'),
    reportsTo: ceo,
  },
  { actorId: ceo },          // 授权检查：CEO 有 org.member.invite
)

// 5. 查询
org.getTree()                // 渲染用树
org.getStats()               // 部门数、人数、深度、叶子数
org.getAncestors(engineer)   // [ceo]
org.canManage(ceo, engineer) // true
org.can(engineer, 'dept.create') // false
```

---

## 项目结构

```text
compbotorg/
├── packages/
│   ├── organization/          # ★ v0.1 组织领域核心（48 个测试）
│   └── task/                  # ★ v0.2 组织协议核心（76 个测试）
│       ├── src/
│       │   ├── brand.ts       # Task/Report/Decision/Approval/Escalation ID
│       │   ├── events.ts      # 18 种领域事件
│       │   ├── errors.ts      # 稳定错误码
│       │   ├── types.ts       # 状态快照类型
│       │   ├── projection.ts  # 纯函数折叠 + 统计
│       │   ├── store.ts       # 事件存储抽象
│       │   ├── bus.ts         # EventBus（pub/sub）
│       │   ├── authorizer.ts  # Authorizer 端口 + v0.1 适配器
│       │   ├── service.ts     # 18 个命令 + 查询
│       │   └── index.ts
│       └── tests/
│           └── task.spec.ts
├── examples/
│   ├── demo-company/          # v0.1 组织结构 demo
│   └── demo-protocol/         # v0.2 协议闭环 demo
├── docs/
│   ├── architecture.md
│   ├── demo-output.txt
│   └── 项目总计划.md          # v0.1→v1.0 完整设计
├── HANDOFF.md                 # 接手文档
└── README.md
```

---

## 路线图

| 版本 | 内容 | 状态 |
|------|------|------|
| **v0.1** | Organization / Department / Role / Membership / Hierarchy | ✅ 已完成 |
| **v0.2** | Organization Protocol：Task / Delegation / Report / Review / Decision / Approval / Escalation / Event Bus | ✅ 已完成 |
| v0.3 | Runtime 集成：接入 DSH Agent Loop、Tobs PersonaBot、Browser/Computer | 下一步 |
| v0.4 | Artifact FS：以 Artifact 为核心的文件系统、版本、权限共享 | 计划中 |
| v0.5 | 三层 Memory：Organization / Department / Bot | 计划中 |
| v0.6 | Skill Protocol：Expert Skill / Connector / Manifest | 计划中 |
| v0.7 | Governance：Policy Engine / Approval Flow / Audit | 计划中 |
| v0.8 | Skill Ecosystem：Registry / Marketplace | 计划中 |
| v0.9 | Autonomous Organization：目标分解、自动委派、绩效评估 | 计划中 |

---

## 三条不可变核心

从第一天就要保护这三个接口，未来才能替换底层 Runtime 而不重写系统。

1. **Organization Protocol** — Bot 如何工作、委派、汇报、审批、升级
2. **Runtime API** — DSH / Tobs 等 Runtime 如何接入组织
3. **Skill Protocol** — Skill / Tool / Connector / Workflow 如何进入数字员工体系

---

## 核心原则

```text
Organization > Agent Swarm
Task > Message
Artifact > Shared Folder
Skill > Tool Collection
Runtime > Specific Agent Framework
Policy > Blind Autonomy
Human Approval > High-risk Automation
Open Protocol > Vendor Lock-in
Community Ecosystem > Centralized Plugin System
```

---

## 许可证

MIT。基于 DSH（MIT）与 Tobs（MIT）改造，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
