# 架构说明 — v0.1 Organization Core

本文说明 `packages/organization` 的内部结构、关键决策与后续扩展点。

---

## 1. 分层

```text
┌─────────────────────────────────────────────────┐
│  apps (web / cli)          ← v0.3+              │
├─────────────────────────────────────────────────┤
│  Organization Protocol     ← v0.2               │
│  (Task / Report / Review / Decision)            │
├─────────────────────────────────────────────────┤
│  ★ Organization Core       ← v0.1 本包          │
│  Organization / Department / Role / Membership  │
│  Hierarchy / Permission / Event Sourcing        │
├─────────────────────────────────────────────────┤
│  Runtime (DSH + Tobs)      ← v0.3 接入          │
│  Agent Loop / Session / Skill / Memory / IM     │
└─────────────────────────────────────────────────┘
```

Organization Core 刻意不依赖任何运行时：

- 不 import DSH 的任何包
- 不 import Tobs 的任何包
- 不依赖 Node 特有的 API（除时间）
- 存储层通过 `OrganizationStore` 接口注入

这样它可以被 CLI、Web、DSH 插件、测试同时复用，也意味着换掉整个 Agent Runtime 不需要改一行组织代码。

---

## 2. 模块职责

| 文件 | 职责 | 不做什么 |
|------|------|---------|
| `brand.ts` | 品牌化 ID 类型，防止 ID 串用 | 不生成 ID |
| `roles.ts` | 角色定义、权限词表、默认授权 | 不校验成员 |
| `types.ts` | 状态快照类型 | 不包含逻辑 |
| `events.ts` | 14 种领域事件定义 | 不做校验 |
| `errors.ts` | 稳定错误码 | 不格式化消息 |
| `projection.ts` | 事件折叠为状态（纯函数） | 不校验、不拒绝 |
| `hierarchy.ts` | 树查询、防环、权限推导 | 不写事件 |
| `store.ts` | 事件存储接口 + 内存实现 | 不做业务判断 |
| `service.ts` | 命令校验 + append 事件 | 不直接改状态 |

关键点：**`projection.ts` 是纯的**。它不做任何校验，只负责折叠。所有拒绝逻辑在 `service.ts`。这保证回放是确定性的——哪怕日志里有异常事件，投影也不会中途抛错。

---

## 3. 数据流

### 写路径

```text
command(input)
  ↓
requireOrganization() / requireMember() / requireDepartment()   ← 存在性
  ↓
requirePermission(actorId, permission)                          ← 授权
  ↓
业务校验（防环、rank、唯一性、状态机）                            ← 一致性
  ↓
store.append(event)                                             ← 持久化
  ↓
state = applyEvent(state, event)                                ← 折叠
  ↓
return 快照
```

### 读路径

```text
state (已折叠)
  ↓
hierarchy.ts 的纯函数（directReports / ancestorsOf / buildTree ...）
  ↓
返回派生结果
```

读路径不碰存储，所以查询是 O(1) 到 O(n) 的内存操作，适合 UI 高频调用。

---

## 4. 为什么用事件溯源

### 备选方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 可变状态 + 直接 UPDATE | 简单、查询快 | 无审计、无法回放、并发难 |
| 状态快照 + 定期存档 | 恢复快 | 丢失中间过程 |
| **事件溯源** | 完整审计、可回放、天然并发友好 | 需要投影、日志会增长 |

选事件溯源的核心原因是**审计**。组织系统必然要回答"谁在什么时候把谁踢出了部门"，这正是事件日志天然擅长的问题。而且 DSH 本身就是事件溯源的（Session 是 append-only log），两者风格一致，后续合并到 Session log 时不需要换范式。

### 日志增长怎么办

v0.1 用内存实现，日志无限增长。生产化路径：

1. **快照 + 增量**：每 N 个事件存一次状态快照，恢复时只回放快照之后的事件
2. **归档**：已归档部门的历史事件移到冷存储
3. **分区**：按组织 ID 分区，单个组织的日志量可控

接口已经预留：`OrganizationStore.readSince(afterSeq)` 就是为增量回放准备的。

---

## 5. 权限模型

### 三个维度

```text
Permission   = 能做什么（48 种，dotted 命名）
RoleRank     = 有多资深（0 最资深，4 最基层）
AuthorityScope = 管到哪（self / subtree / department / organization）
```

### 有效权限的推导

```text
effective(member) = role.permissions
                  ∪ member.extraPermissions
                  − member.deniedPermissions
```

这个推导只在 `hierarchy.ts:effectivePermissions` 一处实现，是唯一的真相来源。

### 管理关系（canManage）

```text
canManage(actor, target) =
      actor ≠ target
  AND actor.status = active
  AND target.status ≠ removed
  AND actor.rank < target.rank              ← 严格资深
  AND scopeReaches(actor, target)           ← 范围覆盖

scopeReaches:
  organization → true
  department   → actor.departmentId = target.departmentId
  subtree      → target ∈ descendants(actor)
  self         → false
```

**为什么 rank 要严格小于？** 同级的两个人不应该互相管理，否则会形成互相否决的死锁。这也是真实组织的惯例：平级之间靠协调，不靠命令。

**为什么 scope 和 rank 都要满足？** 只有 rank 会导致"跨部门随便管"，只有 scope 会导致"基层也能管整个子树"。两者相乘才是真实的授权边界。

---

## 6. 汇报线的不变量

### 唯一不变量：无环

一个成员最多有一个直接上级（`reportsTo?: BotId` 是单值），这是结构保证的。

环检测在 `hierarchy.ts:canReportTo`：

```ts
canReportTo(state, botId, managerId) =
  managerId === undefined ? true
  : managerId !== botId && managerId ∉ descendants(botId)
```

### 为什么用 BFS 而不是递归

`descendantsOf` 用显式队列而不是递归，理由有两个：

1. 深层组织（比如 20 层）不会爆栈
2. 天然带 `seen` 集合，即使日志里混入了历史环也不会死循环

第 2 点很重要：事件溯源系统里，历史事件可能来自旧版本的 bug。投影必须对畸形数据免疫。

---

## 7. 与 DSH / Tobs 的对接点（v0.3 计划）

| 本包概念 | DSH 对应 | Tobs 对应 | 对接方式 |
|---------|---------|----------|---------|
| `BotId` | `SessionId` / Agent id | `PersonaBot.slug` | BotId 存 PersonaBot slug |
| `OrganizationState` | 无 | 无 | 新增 projection，注册到 `ctx.sessionProjections` |
| `OrganizationEvent` | `SessionEventMap` | 无 | 扩展 `SessionEventMap`，落进 Session log |
| `OrganizationStore` | `SessionPersistence` | Operational DB | 实现一个 `SessionBackedStore` |
| `canManage` | 无 | Orchestrator 权限 | 作为 tool 的 pre-execute 守卫 |
| `Permission` | `ctx.tools` 的作用域 | Approval 模板 | 映射为 tool 级允许列表 |

对接时的关键约束：**事件必须落进 DSH 的 Session log**，而不是另起一套存储。这样组织的变更和 Bot 的对话在同一条时间线上，才能回答"这条消息是在哪次组织调整之后发的"。

---

## 8. 测试策略

48 个测试分六组：

| 组 | 覆盖 |
|----|------|
| organization lifecycle | 创建、重复创建、空名、自定义角色 |
| departments | 唯一 ID、嵌套、缺失父、有成员/子部门时拒绝删除 |
| membership | 首个成员成为 CEO、重复、缺部门、manager rank、调动、晋升、停职、离职 |
| reporting line | 祖先链、后代 BFS、自环、后代环、重新挂载、树渲染、统计 |
| permissions | 角色默认、加授/剥夺、矛盾覆盖、未知权限、canManage 各分支 |
| event sourcing | 一命令一事件、重放一致、单调序号、软删除 |

**没有 mock**。所有测试都跑真实的事件流，因为投影是纯函数，不需要隔离。

**时间被注入**（`now: () => new Date('2026-01-01...')`），所以断言可以做时间无关的比较。

---

## 9. 后续扩展点

### v0.2 Organization Protocol

新增 `packages/protocol`，建立在 Core 之上：

```ts
interface Task {
  id: TaskId
  creatorId: BotId
  assigneeId?: BotId
  departmentId: DepartmentId
  status: 'draft' | 'assigned' | 'in_progress' | 'review' | 'blocked' | 'done' | 'cancelled'
  blockedBy: TaskId[]
  artifactIds: ArtifactId[]
}

interface Report {
  id: ReportId
  taskId: TaskId
  authorId: BotId
  artifactIds: ArtifactId[]
  status: 'submitted' | 'approved' | 'rejected'
  reviewerId?: BotId
  rejectionReason?: string
}
```

委派与升级的授权直接复用 `canManage`：不能管的人就不能给他派活，也不能向他升级。

### v0.4 Artifact FS

Artifact 的权限模型要和组织权限打通：

```text
artifact.permission = f(
  owner.scope,      // bot / dept / org
  requester.rank,
  requester.departmentId,
  artifact.sensitivity
)
```

### v0.7 Governance

Policy Engine 的判定输入就是 Core 的投影：

```ts
evaluate(policy, { actor, target, action, state }) → 'allow' | 'deny' | 'require-approval'
```

审计日志则直接复用事件日志——不需要另建一套 audit 表，组织事件本身就是审计。

---

## 10. 已知限制（v0.1）

1. **单组织**：一个 `OrganizationService` 实例只承载一个组织。多组织需要多实例或改造 `OrganizationState`。
2. **内存存储**：`MemoryOrganizationStore` 不持久化。生产需要实现 `OrganizationStore`。
3. **无并发控制**：多个进程同时写同一日志会冲突。需要引入版本号或乐观锁。
4. **无软删除的部门**：部门删除是硬删除（但要求空部门），历史事件仍保留。
5. **rank 是缓存值**：`BotMembership.rank` 从角色复制而来，如果角色的 rank 被修改（v0.1 不支持修改角色），缓存会失效。
6. **无批量操作**：所有命令单条执行，批量导入需要循环调用。

这些限制都是刻意留到后续版本解决的，v0.1 的目标是把领域模型钉死，而不是把功能做全。
