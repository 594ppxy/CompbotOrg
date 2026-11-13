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

## 2. 当前进度：v1.0 产品形态 ✅ 已完成

v0.1 → v0.9 的十个领域包全部落地，v1.0 交付组合根 `company`、HTTP API、CLI 与端到端 Demo。
**九个领域包各自持有独立的事件日志**，全部独立于运行时/传输层/UI；只有 `company` 知道如何把它们拼起来。

### 已验证状态（2026-11-13）
| 检查 | 结果 |
|------|------|
| TypeScript 编译（strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess） | ✅ 12 个包全量 `tsc -b --force` 0 错误 |
| 单元测试（vitest） | ✅ **276/276** 通过（12 个测试文件） |
| `pnpm demo` / `pnpm demo:protocol` | ✅ 均可运行 |
| `pnpm demo:product` | ✅ 两个目标闭环 + 策略拒绝 + 62 事件持久化 + 重放一致 |
| `pnpm cli ...` | ✅ init / stats / goal run / export 实测通过 |
| `pnpm serve` + HTTP | ✅ Web 控制台 `/` + `/health`、`/stats`、`POST /goals`、`/goals` 实测通过 |
| `pnpm verify` | ✅ 一键全绿（`all checks passed`） |

### 后续版本新增的包（本次完成）

| 包 | 版本 | 职责 | 测试 |
|------|------|------|------|
| `runtime` | v0.3 | `BotRuntime` 端口、确定性 `SimulatedRuntime`、执行日志、`AgentRunner` | 28 |
| `artifact` | v0.4 | 版本化产物、共享/撤销、归档 | 16 |
| `memory` | v0.5 | 三层记忆 + Markdown 导入导出 | 19 |
| `skill` | v0.6 | Skill / Connector 注册安装、风险门槛 | 21 |
| **`policy`** | **v0.7** | 优先级 + 通配匹配、审批请求、审计日志 | 18 |
| **`registry`** | **v0.8** | 发布 / 安装 / 评分 / 下架 / 搜索 | 13 |
| **`goal`** | **v0.9** | 目标分解、任务关联、绩效、状态机 | 13 |
| **`company`** | **v1.0** | 组合根、`bootstrap()`、`runGoal()`、JSON 快照持久化 | 9 |
| **`api`** | **v1.0** | 零外部依赖 HTTP REST + 内嵌 Web 控制台（`web.ts`） | 7 |
| **`cli`** | **v1.0** | 命令行 + JSON 状态文件 | 8 |

实现签名以 [`docs/CONTRACT.md`](./docs/CONTRACT.md) 为准；该契约文件是 v0.3–v0.9 的规范，新包不得偏离。

### 已交付能力
- **Organization**：创建组织、命名、描述、指定最高负责人（CEO）
- **Department**：部门创建、嵌套子部门、部门元数据
- **Role**：9 个内置角色 + 自定义角色，5 级 rank，48 种权限，4 种权威范围
- **Membership**：Bot 加入、调动、晋升/降级、停职、复职、离职
- **Hierarchy**：汇报线、祖先/后代查询、组织树、深度统计
- **Authority**：基于 `rank × scope` 的管理关系推导（`canManage` / `whyCannotManage`）
- **Permission**：角色默认权限 + 个人加授/剥夺
- **Event Sourcing**：每条命令产生一个不可变事件，日志可完整重放（`restoreOrganization(events)`）

### v0.2 新增交付（`packages/task`）

- **Task**：创建/指派/向下委派/认领/开始/阻塞/解阻/完成/取消；记录委派深度、产物引用、报告列表。
- **Report**：提交/批准/驳回，禁止自审，审阅人必须能管理作者（`canManage`）。
- **Decision**：请求/作出，缺省由 requester 的直属上级裁定。
- **Approval**：请求/批准/驳回，审批人必须能管理请求人。
- **Escalation**：沿 `Authorizer.managerOf` 汇报线升级；显式目标必须在汇报线上且能管理原负责人。
- **Authorizer 端口**：默认 `PermissiveAuthorizer`，生产注入 `OrganizationAuthorizer(org)` 直接复用 v0.1 的 rank × scope。
- **EventBus**：每次 commit 同步发布 `LoggedEvent`，支持类型过滤、退订、监听器错误隔离。
- **18 种领域事件 + 纯函数折叠 + `restoreTask(events)` 完整重放**。

### 关键设计决策（改之前先读，别推翻重来）
1. **汇报线与部门归属正交**：Bot 可以属于 Research 部门但汇报给 AI Lab 负责人。
2. **管理权 = rank × scope 同时满足**：只满足 rank 会「跨部门乱管」，只满足 scope 会「基层管全树」，必须两者相乘。
3. **结构约束先于业务约束**：「不能成环」先于「上级必须更资深」检查，否则报错会令人困惑。
4. **命令 → 校验 → append 一个事件 → fold → publish**：事件日志是唯一真相源；EventBus 只在 commit 成功后发布。
5. **授权走注入端口，不自己算 rank**：`TaskService` 只问 `Authorizer.canManage/managerOf/isActive`；默认宽松便于独立运行，接上 `OrganizationAuthorizer` 后所有派活/委派/审阅/审批/升级自动服从 v0.1 的 rank × scope。
6. **终态检查先于归属检查**：已取消/已完成的任务先报 `TASK_INVALID_TRANSITION`，再检查是否有人负责（沿用决策 3 的「结构约束优先」）。
7. **升级链 = 汇报线 ∩ 管理权**：默认沿 `managerOf` 找第一个能管理原负责人的上级；显式目标也必须同时满足「在汇报线上」和「能管理原负责人」，否则拒绝。

### 已知限制（截至 v1.0，刻意留白）
- **执行引擎是模拟的**：`SimulatedRuntime` 确定性产出，不调用真实 LLM / DSH Agent Loop。替换它只需实现 `BotRuntime.execute(request)`，组织事件一行都不用改。
- **持久化是 JSON 快照**：`saveCompany` 把九条日志整体写入一个文件，非增量、非并发安全、无数据库；生产可换成 JSONL / Session 日志后端。
- **单组织实例**：一个 `Company` 对应一家公司；多租户需要外层路由。
- **九条日志仍无跨日志事务**：`runGoal` 按固定顺序调用各服务，任一中间步骤抛错会留下部分已提交事件；需要 Saga / Outbox 才能在分布式环境下保证原子性。
- **Web 控制台是轻量视图**：`api/src/web.ts` 提供只读仪表盘与一个「下达目标」入口（零外部资源、单文件 HTML），没有登录鉴权、实时推送或权限体系；飞书 / Slack 等 IM 连接器仍未接入。

---

## 3. 仓库结构

```
compbotorg/
├── packages/
│   ├── organization/   # v0.1 组织领域核心
│   ├── task/           # v0.2 组织协议核心
│   ├── runtime/        # v0.3 执行引擎 + AgentRunner
│   ├── artifact/       # v0.4 Artifact FS
│   ├── memory/         # v0.5 三层记忆
│   ├── skill/          # v0.6 Skill / Connector
│   ├── policy/         # v0.7 策略引擎 + 审计
│   ├── registry/       # v0.8 能力市场
│   ├── goal/           # v0.9 目标分解 + 绩效
│   ├── company/        # v1.0 组合根（company.ts / persistence.ts）
│   ├── api/            # v1.0 HTTP REST + Web 控制台（server.ts / web.ts / main.ts）
│   └── cli/            # v1.0 命令行（cli.ts / main.ts）
│       # 领域包统一：src/{brand,errors,events,types,projection,store,service,index}.ts
│       #             tests/<name>.spec.ts + package.json + tsconfig.json
├── examples/
│   ├── demo-company/          # v0.1 组织结构
│   ├── demo-protocol/         # v0.2 协议闭环
│   └── demo-product/          # v1.0 端到端产品闭环
├── docs/
│   ├── CONTRACT.md            # ★ 领域包统一签名契约（实现新包前必读）
│   ├── architecture.md
│   ├── demo-output.txt
│   ├── demo-protocol-output.txt
│   └── 项目总计划.md          # v0.1→v1.0 完整设计
├── README.md
├── HANDOFF.md                 # 本文件
├── LICENSE                    # MIT
├── THIRD_PARTY_NOTICES.md
├── package.json               # 根（pnpm workspace + verify 脚本）
├── pnpm-workspace.yaml
├── tsconfig.json              # 12 个包全部登记在 references
└── vitest.config.ts           # 12 个包全部登记在 alias
```

---

## 4. 本地开发（接手第一步）

```bash
# 前置：Node >= 22.13，pnpm >= 10
pnpm install
pnpm build          # tsc -b 编译 12 个包
pnpm test           # vitest run（276 个测试）
pnpm verify         # tsc + test + 三个 demo 一键校验
pnpm demo           # v0.1 组织结构
pnpm demo:protocol  # v0.2 协议闭环
pnpm demo:product   # v1.0 端到端产品闭环
pnpm cli help       # CLI 命令列表
pnpm serve          # Web 控制台 + HTTP API（PORT / COMPANY_FILE 环境变量可覆盖）
```

> `vitest.config.ts` 把全部 12 个 workspace 包 alias 到源码，所以 `pnpm test` 不需要预先生成 dist。
> `data/company.json` 是 demo / CLI / API 共用的状态文件，已在 `.gitignore` 中忽略，可随时删除重建。

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

### v0.2 领域模型速览（`packages/task`）

- **TaskSnapshot**：`pending → assigned → in_progress → blocked → completed / cancelled`；记录 `createdBy`、`assigneeId`、`assignedBy`、`delegationDepth`、`artifactRefs`、`reportIds`。
- **ReportSnapshot**：`submitted → approved / rejected`，带审阅人与审阅意见。
- **DecisionSnapshot**：`pending → made`，含 outcome（approved / rejected / deferred）与理由。
- **ApprovalSnapshot**：`pending → granted / denied`，含指定审批人。
- **EscalationSnapshot**：一次汇报线跳跃的不可变记录（raisedBy / fromBotId / escalatedTo / reason）。
- **TaskState**：以上五类快照的五张 `ReadonlyMap`，由 18 种事件纯函数折叠而来。
- **状态机约束**：终态（completed / cancelled）先于归属检查；审阅/审批不能自审自批；升级目标必须在汇报线上且能管理原负责人。

---

## 6. 路线图执行结果：v0.3 → v1.0

下面的每一版都是一个**独立 npm 包**（参考 `packages/organization` / `packages/task` 的写法），保持「事件溯源 + 与运行时解耦」的同一套范式。每个包只通过 `@compbotorg/organization` 借用 Bot 身份类型，跨包关联统一用 `string`。**目前全部已完成并通过 `pnpm verify`。**

### v0.2 Organization Protocol ✅【已完成，见 `packages/task`】
- **已交付**：18 种领域事件、18 个命令、纯函数折叠、`restoreTask` 重放、76 个测试、`pnpm demo:protocol` 端到端闭环。
- **授权**：`Authorizer` 端口（默认 `PermissiveAuthorizer`）+ `OrganizationAuthorizer(org)` 适配器，直接复用 v0.1 的 `canManage`，实现「不能管的人不能派活、不能向他升级」。
- **EventBus**：同步 pub/sub，支持类型过滤、退订、监听器错误隔离；每次 commit 后发布 `LoggedEvent`。
- **验收已通过**：建任务 → 派给下属 → 向下委派 → 完成 → 提交报告 → 上级审批 → 决策 → 审批 → 阻塞升级（沿汇报线）→ 事件重放一致；越权派活被拒绝。
- 事件清单：`task/created|assigned|delegated|claimed|started|blocked|unblocked|completed|cancelled|escalated`、`report/submitted|approved|rejected`、`decision/requested|made`、`approval/requested|granted|denied`。

### v0.3 → v0.9 ✅ 全部完成

十个领域包都已按 `docs/CONTRACT.md` 实现，每个包都有 `restoreX(events)`、闭集错误码、固定时钟测试与拒绝路径覆盖。实现要点：

- **v0.3 `runtime`**：`BotRuntime` 是可替换端口，内置确定性 `SimulatedRuntime`；`AgentRunner.runTask` 按 `startTask → execute → succeedExecution → completeTask → submitReport` 固定顺序编排，并通过 `artifactSink` 把产物交给 `Company` 归档。接真实 DSH / LLM 只需换掉 `runtime`，不动任何组织事件。
- **v0.4 `artifact`**：`artifactRefs` 与 `task/completed` 关联；`Company` 的 sink 会把每次执行产物写成真实 Artifact。
- **v0.5 `memory`**：三层 + Markdown；`Company.bootstrap` 写入组织使命，`runGoal` 追加目标记录。
- **v0.6 `skill`**：`AgentRunner` 的 `skillsOf` 端口接到 `SkillService.skillsOf(botId)`，执行请求会带上该 Bot 已安装的技能名。
- **v0.7 `policy`**：`runGoal` 先 `evaluate`，`deny` 时抛 `CompanyError('COMPANY_ACTION_DENIED')`，`requires_approval` 会留下 `pending` 审计；每次成功运行写一条 `allowed` 审计。
- **v0.8 `registry`**：bootstrap 发布并安装一个专家技能，附一条评分；搜索只返回 published 条目。
- **v0.9 `goal`**：`decompose → linkTask → recordMetric → completeGoal`，状态机拒绝终态再操作。

### v1.0 产品形态 ✅ 已完成

- **`packages/company`**：组合根。`bootstrap()` 建组织/汇报线并播种各领域服务；`runGoal()` 一句话跑完整个闭环；`toSnapshot()` / `fromSnapshot()` / `saveCompany()` / `loadCompany()` 把九条事件日志原样持久化。
- **`packages/api`**：零外部依赖 HTTP REST，`dispatch()` 与传输解耦便于测试，`createServer()` 适配 `node:http`，写请求后自动保存。
- **`packages/cli`**：`init` / `stats` / 各领域查询 / `goal run` / `export`，状态存 JSON 文件。
- **`examples/demo-product`**：两个目标闭环 + 策略拒绝 + 持久化 + 重放一致性 + 仪表盘。

### 剩余可选工作（不阻塞 v1.0）

1. 接真实 DSH Agent Loop / LLM Runtime（实现 `BotRuntime` 即可）。
2. 把 JSON 快照换成增量 JSONL / 数据库后端；为 `runGoal` 加 Saga / Outbox 保证跨日志原子性。
3. 多租户、并发控制、批量操作。
4. Web 指挥中心与 IM 连接器（飞书 / Slack）。
5. 跨日志一致性事务（第 2 节「已知限制」里刻意留白的那条）。

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

## 8. 给接手者的 6 条建议

1. **先读懂 `packages/organization/src/service.ts` 与 `packages/task/src/service.ts` 的命令范式**，再写任何新包——所有后续包都是这个模式的复制扩展。
2. **权限校验永远走 `Authorizer.canManage` / `can`**，不要在业务代码里重新算 rank；新包也建议注入同一端口而非直接依赖 `OrganizationService`。
3. **新增事件类型时，同步更新** `events.ts` 的联合类型 + `projection.ts` 的 `applyEvent` switch + 测试。漏一个就编译不过，这是好事。
4. **别急着接 DSH/Tobs 源码**：`packages/task` 已经示范了「纯 TS + 内存存储 + 完整测试」的标准做法，按同样范式继续做 artifact / memory / skill / policy，最后再用 `packages/runtime` 接真实执行引擎。
5. **新包记得登记三处**：根 `tsconfig.json` 的 references、根 `package.json` 的 verify（若有 demo）、`vitest.config.ts` 的 alias（若测试跨包 import）。当前 12 个包在三处均已登记，新增包时照做即可。
6. **改名已定稿为 CompbotOrg**，仓库、scope、文档都已统一。除非有强理由，不要再动名字——全局替换和重新发布成本很高。

---

祝顺利。这个项目的核心壁垒不在「让 Bot 跑起来」（DSH/Tobs 已经解决），而在「让一群 Bot 像组织一样协作、可控、可审计」。v0.1 把「组织」钉死，v0.2 让组织开始「动」起来，往下是水到渠成。
