# CompbotOrg — 交接文档（Handoff）

> 给接手者的第一份文档。读完这份，你就能知道项目是什么、现在做到哪、下一步怎么干。
> 完整设计背景见同目录 `docs/项目总计划.md`（从原 `AI_Organization_OS_项目总计划_修订版.md` 改名而来）。

---

## 0. 一句话定位

**CompbotOrg = Company Bot Organization OS**：一个开源的 AI 组织操作系统。
让用户管理「一家 AI 公司」（有部门、角色、汇报线、任务、审批、记忆），而不是管理几十个孤立的 Bot / Agent。

改名历史（别再改了，成本已经在前面付过了）：

| 阶段 | 名称 |
|------|------|
| 原始计划文档 | AI Organization OS |
| 第一版仓库 | `ai-org-os` / `@ai-org-os/*` |
| **当前（定稿）** | **CompbotOrg** / `compbotorg` / `@compbotorg/*` |

名字里三个要素：**Comp** = Company / 复合组织，**Bot** = 数字员工，**Org** = 组织。
**Open** 不在标签上，而在骨子里：MIT 许可证、开放协议、可替换的 Runtime。

---

## 1. 技术基座（重要：不是从零造轮子）

本项目是**在现有开源项目代码基础上深度改造**，不是以「适配器」方式接入。复用它们的成熟能力，只补齐「组织」这一层。

| 上游项目 | 地址 | 我们复用什么 |
|----------|------|--------------|
| **DSH**（deepseek-harness） | `github.com/deepseek-ai/deepseek-harness` | Agent 执行循环、Session 持久化、Subagent、Team 任务板、Skill 注册、一切皆插件（Cordis）架构 |
| **Tobs**（BotHarness/DeepSeekBot） | `github.com/BotHarness/DeepSeekBot`（MIT） | PersonaBot 持久身份、SOUL.md/MEMORY.md 记忆、Orchestrator/Assignment Session、Channel 群聊、Approval、IM 接入、Bot 市场 |

> 这两个仓库的源码克隆在 `/workspace/dsh` 和 `/workspace/tobs`，**但它们不在本仓库内**，只是参考资料。本仓库 `compbotorg` 是从 DSH/Tobs 的设计中提炼出的「组织领域核心 + 后续包」，独立可运行、不依赖上游源码即可编译测试。

---

## 2. 当前进度：v0.1 Organization Core ✅ 已完成

v0.1 交付了一个**完全独立于运行时/传输层/UI 的组织领域核心**。

### 已验证状态
| 检查 | 结果 |
|------|------|
| TypeScript 编译（strict + exactOptionalPropertyTypes） | ✅ 0 错误 |
| 单元测试（vitest） | ✅ 48/48 通过 |
| Demo 可运行 | ✅ 输出 87 行，进程退出 0 |

### 已交付能力
- **Organization**：创建组织、命名、描述、指定最高负责人（CEO）
- **Department**：部门创建、嵌套子部门、部门元数据
- **Role**：9 个内置角色 + 自定义角色，5 级 rank，48 种权限，4 种权威范围
- **Membership**：Bot 加入、调动、晋升/降级、停职、复职、离职
- **Hierarchy**：汇报线、祖先/后代查询、组织树、深度统计
- **Authority**：基于 `rank × scope` 的管理关系推导（`canManage` / `whyCannotManage`）
- **Permission**：角色默认权限 + 个人加授/剥夺
- **Event Sourcing**：每条命令产生一个不可变事件，日志可完整重放（`restoreOrganization(events)`）

### 关键设计决策（改之前先读，别推翻重来）
1. **汇报线与部门归属正交**：Bot 可以属于 Research 部门但汇报给 AI Lab 负责人。
2. **管理权 = rank × scope 同时满足**：只满足 rank 会「跨部门乱管」，只满足 scope 会「基层管全树」，必须两者相乘。
3. **结构约束先于业务约束**：「不能成环」先于「上级必须更资深」检查，否则报错会令人困惑。
4. **命令 → 校验 → append 一个事件 → fold**：事件日志是唯一真相源，保证可审计、可重放。

### 已知限制（v0.1 刻意留白，留给后续版本）
- 内存存储，不持久化；单组织实例；无并发控制；无批量操作。
- 没有 HTTP API / CLI；没有 Bot 实际执行引擎对接；没有任务/审批/记忆/Artifact。

---

## 3. 仓库结构

```
compbotorg/
├── packages/
│   └── organization/          # ★ v0.1 组织领域核心（已完成）
│       ├── src/
│       │   ├── brand.ts        # Branded ID 类型（防串用）
│       │   ├── roles.ts        # 角色、权限词汇、权威范围
│       │   ├── types.ts        # 状态快照类型
│       │   ├── events.ts       # 14 种领域事件
│       │   ├── errors.ts       # 稳定错误码
│       │   ├── projection.ts   # 事件折叠（纯函数）
│       │   ├── hierarchy.ts    # 组织树与权限推导
│       │   ├── store.ts        # 事件存储抽象 + 内存实现
│       │   ├── service.ts      # 命令服务（20 命令 + 20 查询）
│       │   └── index.ts        # 对外导出
│       └── tests/
│           └── organization.spec.ts   # 48 个测试
├── examples/
│   └── demo-company/          # 可运行的组织 demo
├── docs/
│   ├── architecture.md        # 架构说明
│   ├── demo-output.txt        # demo 实际输出
│   └── 项目总计划.md          # v0.1→v1.0 完整设计
├── README.md
├── HANDOFF.md                 # 本文件
├── LICENSE                    # MIT
├── THIRD_PARTY_NOTICES.md     # 上游许可证声明
├── package.json               # 根（pnpm workspace）
├── pnpm-workspace.yaml
├── tsconfig.json
└── vitest.config.ts
```

---

## 4. 本地开发（接手第一步）

```bash
# 前置：Node >= 22.13，pnpm >= 10
pnpm install
pnpm build      # tsc -b 编译所有包
pnpm test       # vitest run（48 个测试）
pnpm demo       # 打印一家完整 AI 公司的组织结构
pnpm verify     # tsc + test + demo 一键校验
```

代码用法（v0.1 已有）：

```ts
import { BotId, OrganizationService, RoleId } from '@compbotorg/organization'

const org = new OrganizationService()
org.createOrganization({ name: 'Acme AI' })
const eng = org.createDepartment({ name: 'Engineering' })
org.addMember({ botId: BotId('ceo'), displayName: 'Ada', departmentId: eng.id, roleId: RoleId('ceo') })
org.canManage(BotId('ceo'), BotId('eng1'))   // true
```

---

## 5. 领域模型速览（接手者必读）

### 核心实体
- **Organization**：组织本身，含 `ceoBotId`。
- **Department**：部门，支持 `parentDepartmentId` 嵌套。
- **Role**：角色 = 名字 + rank + 默认权限 + 权威范围 + 能否委派/审批/升级。
- **BotMembership**：Bot（PersonaBot 身份）在组织中的视图：所在部门、角色、rank、汇报对象、权限增减、状态。
- **OrgTreeNode / OrganizationStats**：渲染与统计用派生结构。

### 权限模型（两维）
- **rank**（0=Executive … 4=IC）：数字越小越资深。
- **AuthorityScope**：`self` / `subtree` / `department` / `organization`。
- **canManage(actor, target)** = actor.rank < target.rank **且** actor 的 scope 覆盖 target **且** 双方 active。
- 拒绝时返回可读原因 `whyCannotManage`，方便 Bot 决定向谁升级。

### 事件（14 种，全部在 `events.ts`）
`organization/created|updated|ceo-designated`、`department/created|updated|removed`、
`member/joined|transferred|promoted|reports-to-changed|status-changed|left|permissions-changed`、
`role/registered`。

---

## 6. 路线图：v0.2 → v1.0（接手者任务清单）

下面的每一版都是一个**独立 npm 包**（参考 `packages/organization` 的写法），保持「事件溯源 + 与运行时解耦」的同一套范式。每个包通过 `@compbotorg/organization` 复用组织/权限能力。

### v0.2 Organization Protocol ★【最优先，组织开始「动」起来】
- **新建包** `packages/task`
- **领域**：Task（创建/分配/委派/认领/开始/完成/取消/阻塞）、Report（提交/审阅/批准/驳回）、Decision（请求/作出）、Approval（请求/批准/驳回）、Escalation（升级）。
- **关键接口草案**：
  - `TaskId / ReportId / DecisionId / ApprovalId`（Branded，仿 `brand.ts`）
  - `TaskCreatedEvent | TaskAssignedEvent | TaskDelegatedEvent | TaskEscalatedEvent | ReportSubmittedEvent | ReportApprovedEvent | ApprovalRequestedEvent | ...`（仿 `events.ts`）
  - `TaskService`：命令 `createTask / assignTask / delegateTask / claimTask / startTask / completeTask / escalateTask / submitReport / approveReport / requestApproval / grantApproval` 等；每条命令 append 一个事件。
  - **授权**：`TaskService` 构造时注入一个 `Authorizer` 接口（默认宽松，CLI 层把 `OrganizationService` 接进去），实现「不能管的人不能派活、不能向他升级」——直接复用 v0.1 的 `canManage`。
  - **EventBus**：一个简单的 pub/sub（仿 DSH 的 Event Bus），`TaskService` 每次 commit 后发布领域事件，供 Runtime / CLI 订阅。
- **验收**：能建任务→派给下属→下属完成→提交报告→上级审批；升级链正确；事件可重放。

### v0.3 DSH / Tobs Runtime 适配层
- **新建包** `packages/runtime`
- 把 `OrganizationService` 的 Bot 注册为 DSH 的 Agent；把 Task 执行映射为 DSH 的 agent-loop 调用；Bot 间通信通过 Task 委派而非消息。
- 复用 Tobs 的 PersonaBot 身份、SOUL/MEMORY 机制。

### v0.4 Artifact FS
- **新建包** `packages/artifact`
- Bot 通过 **Artifact**（而非共享文件夹）交换成果；版本控制、权限管控、组织/部门/Bot 三级命名空间。
- 与 v0.2 的 `task/completed` 事件关联（`artifactRefs`）。

### v0.5 三层 Memory
- **新建包** `packages/memory`
- 组织级（使命/策略/知识库）、部门级（团队上下文）、Bot 级（个人经验）。基于事件溯源 + Markdown 文件（复用 Tobs 的 SOUL.md/MEMORY.md 思路）。

### v0.6 Skill / Tool / Connector 协议
- **新建包** `packages/skill`
- Skill 注册与发现、Tool 清单、Connector 接口。Bot 可安装 Skill 获得专业能力，受组织策略管控。

### v0.7 Policy Engine / Sandbox / Audit
- **新建包** `packages/policy`
- 行为策略、高风险操作审批、沙箱隔离、审计日志。整合 v0.2 的 Approval + v0.1 的权限体系。

### v0.8 Registry / Marketplace
- **新建包** `packages/registry`
- Skill/Tool/Connector 注册表与市场：社区贡献、版本管理、安装/卸载。

### v0.9 目标分解 / 自主调度 / 绩效评估
- **新建包** `packages/goal`
- Goal → Task 自动分解、Bot 自主认领与调度、绩效指标。用户只给目标，组织自运行。

### v1.0 产品形态（初步可用）
- **新建包** `packages/cli` + `packages/api`
- CLI（`org create` / `member add` / `task assign` …）、HTTP API（RESTful）、JSON 文件持久化、端到端 Demo（建组织→派任务→Bot 执行→产出 Artifact→审批→完成）。
- 把前面所有包串起来，做到「用户只给目标，组织自运行」的初步闭环。

---

## 7. 代码规范（保持与 v0.1 一致，别另起炉灶）

- **TypeScript strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess**：编译器帮你挡很多坑。
- **事件溯源范式**：
  1. 命令方法先对当前 projection 校验；
  2. 校验通过才 `commit`（append 一个事件）；
  3. `projection.ts` 的 `applyEvent` 是纯函数折叠，**只折叠不校验**，保证重放确定性。
- **Branded types**：所有 ID 用 `brand.ts` 模式，编译期防串用。
- **稳定错误码**：`errors.ts` 用闭集错误码，别抛裸 `Error`。
- **测试用 vitest**：每个包 `tests/*.spec.ts`，命令层每个分支都要有测试（含拒绝路径）。
- **JSDoc 详尽**：每个公开方法写清楚参数、返回、抛错、`@module` 注解（demo 里已示范）。

---

## 8. 给接手者的 5 条建议

1. **先读懂 `packages/organization/src/service.ts` 的命令范式**，再写任何新包——所有后续包都是这个模式的复制扩展。
2. **权限校验永远走 `canManage` / `can`**，不要在业务代码里重新算 rank。
3. **新增事件类型时，同步更新** `events.ts` 的联合类型 + `projection.ts` 的 `applyEvent` switch + 测试。漏一个就编译不过，这是好事。
4. **别急着接 DSH/Tobs 源码**：先把领域核心（task/memory/skill/policy）用纯 TS + 内存存储跑通、测试覆盖，最后再用 `packages/runtime` 接真实执行引擎。
5. **改名已定稿为 CompbotOrg**，仓库、scope、文档都已统一。除非有强理由，不要再动名字——全局替换和重新发布成本很高。

---

祝顺利。这个项目的核心壁垒不在「让 Bot 跑起来」（DSH/Tobs 已经解决），而在「让一群 Bot 像组织一样协作、可控、可审计」。v0.1 已经把「组织」这层钉死了，往下是水到渠成。
