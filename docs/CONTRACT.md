# CompbotOrg 领域包统一契约（v0.3–v0.9）

> 本文件是 `packages/artifact` / `memory` / `skill` / `policy` / `registry` / `goal` / `runtime`
> 的实现契约，也是 `packages/company` 门面的调用依据。实现新包时**签名不得偏离**。
> 范式请直接阅读 `packages/task/src/*`（尤其 `service.ts` 的 constructor / `getState()` / `events()` /
> `commit()` / `restoreTask`，以及 `projection.ts` 的 `applyEvent` / `replay`）。

---

## 1. 统一范式

| 约束 | 说明 |
|------|------|
| 目录 | `packages/<name>/{src,tests}` + `package.json` + `tsconfig.json` |
| 包名 | `@compbotorg/<name>`，`type: module`，MIT，version 见各节 |
| 分层 | `brand.ts` / `errors.ts` / `events.ts` / `types.ts` / `projection.ts` / `store.ts` / `service.ts` / `index.ts` |
| 事件溯源 | 命令 = 校验 → append **一个**事件 → 纯函数 `applyEvent` 折叠 → `onCommit?.(entry)` → 返回快照副本 |
| ID | `brand.ts` 的 Branded 类型，编译期防串用 |
| 错误 | 闭集错误码 + `XError extends Error { readonly code }`，禁止裸 `Error` |
| 时间 | 事件含 `readonly occurredAt: string`（ISO），由注入 `now: () => Date` 生成 |
| TS | strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess + verbatimModuleSyntax；`import type`；禁用 `any`；可选属性用 `...(x === undefined ? {} : { x })` 展开 |
| 依赖 | 只依赖 `@compbotorg/organization`（`import type { BotId }`）；跨包关联用 `string` |
| 测试 | `tests/<name>.spec.ts`，相对导入 `../src/index`，≥10 个测试（含拒绝路径 + 重放一致性），固定时钟 |
| JSDoc | 每个 src 文件 `@module @compbotorg/<name>/xxx`，公开方法写参数/返回/抛错 |

`package.json` 模板：`main/types/exports` 指向 `dist`，`scripts.build = "tsc -b"`，`files: ["dist"]`。
`tsconfig.json` 模板：复制 `packages/task/tsconfig.json`，`references: [{ "path": "../organization" }]`。

---

## 2. 统一 Service 契约

每个包都导出下列同名结构（`X` = 包名，如 `Artifact`）：

```ts
export interface LoggedXEvent { readonly seq: number; readonly event: XEvent }
export interface XStore {
  append(e: XEvent): LoggedXEvent
  readAll(): LoggedXEvent[]
  readSince(seq: number): LoggedXEvent[]
}
export class MemoryXStore implements XStore { /* 另有 get size(): number */ }
export interface XServiceOptions {
  readonly now?: () => Date
  readonly store?: XStore
  readonly idFactory?: () => string
  readonly onCommit?: (entry: LoggedXEvent) => void
}
export class XError extends Error { readonly code: XErrorCode }
export function restoreX(events: readonly XEvent[], options?: XServiceOptions): XService
export { applyEvent, emptyState, replay } from './projection'
export class XService {
  constructor(options?: XServiceOptions)
  getState(): XState            // 内部投影，可含 ReadonlyMap
  events(): LoggedXEvent[]      // 完整日志，持久化用
  getStats(): XStats            // 纯对象，可直接 JSON.stringify
  // 下列领域命令与查询
}
```

`restoreX` 用 `new MemoryXStore()` 逐条 append 后构造服务；重放**不触发** `onCommit`。
所有快照 `readonly`，返回副本；所有命令校验失败抛 `XError`。

---

## 3. `packages/artifact` — @compbotorg/artifact v0.4.0

```ts
export function ArtifactId(value: string): ArtifactId
export function VersionId(value: string): VersionId
export type ArtifactKind = 'document' | 'report' | 'code' | 'data' | 'design'
export type ArtifactErrorCode =
  | 'ARTIFACT_NOT_FOUND' | 'ARTIFACT_INVALID_ARGUMENT' | 'ARTIFACT_ARCHIVED'
  | 'ARTIFACT_PERMISSION_DENIED' | 'ARTIFACT_ALREADY_SHARED' | 'ARTIFACT_SHARE_NOT_FOUND'

export interface ArtifactSnapshot {
  readonly id: ArtifactId; readonly title: string; readonly kind: ArtifactKind
  readonly createdBy: BotId
  readonly namespace: { readonly scope: 'organization'|'department'|'bot'; readonly ownerId: string }
  readonly taskId?: string; readonly tags: readonly string[]; readonly content: string
  readonly latestVersion: number; readonly versionCount: number
  readonly shares: readonly { readonly botId: BotId; readonly level: 'read'|'write' }[]
  readonly status: 'active'|'archived'
  readonly createdAt: string; readonly updatedAt: string
}
export interface ArtifactVersionSnapshot {
  readonly id: VersionId; readonly artifactId: ArtifactId; readonly version: number
  readonly content: string; readonly publishedBy: BotId; readonly note?: string
  readonly publishedAt: string
}
export interface ArtifactStats {
  readonly artifactCount: number; readonly versionCount: number; readonly activeCount: number
  readonly archivedCount: number; readonly sharedCount: number
}
```

命令与查询（签名一致）：

```ts
createArtifact(input: { readonly title: string; readonly kind: ArtifactKind; readonly createdBy: BotId;
  readonly namespace: { readonly scope: 'organization'|'department'|'bot'; readonly ownerId: string };
  readonly content?: string; readonly taskId?: string; readonly tags?: readonly string[] }): ArtifactSnapshot
publishVersion(artifactId: ArtifactId, input: { readonly content: string; readonly publishedBy: BotId; readonly note?: string }): ArtifactVersionSnapshot
shareArtifact(artifactId: ArtifactId, input: { readonly withBotId: BotId; readonly grantedBy: BotId; readonly level: 'read'|'write' }): ArtifactSnapshot
revokeShare(artifactId: ArtifactId, input: { readonly withBotId: BotId; readonly revokedBy: BotId }): ArtifactSnapshot
archiveArtifact(artifactId: ArtifactId, input: { readonly archivedBy: BotId; readonly reason?: string }): ArtifactSnapshot
getArtifact(id: ArtifactId): ArtifactSnapshot | undefined
listArtifacts(filter?: { readonly scope?: 'organization'|'department'|'bot'; readonly ownerId?: string; readonly taskId?: string; readonly kind?: ArtifactKind }): ArtifactSnapshot[]
getVersions(id: ArtifactId): ArtifactVersionSnapshot[]
canAccess(botId: BotId, artifactId: ArtifactId): boolean
```

事件（5 种）：`artifact/created` / `artifact/version-published` / `artifact/shared` / `artifact/share-revoked` / `artifact/archived`。
规则：归档后禁止发版本与共享；`canAccess` 对创建者、同 namespace owner、显式共享者放行；重复共享同一 bot 抛 `ARTIFACT_ALREADY_SHARED`；撤销不存在的共享抛 `ARTIFACT_SHARE_NOT_FOUND`；`publishVersion` 更新 `latestVersion` / `versionCount` / `content`；title / namespace.ownerId 非空。

---

## 4. `packages/memory` — @compbotorg/memory v0.5.0

```ts
export function MemoryEntryId(value: string): MemoryEntryId
export type MemoryLayer = 'organization' | 'department' | 'bot'
export type MemoryErrorCode = 'MEMORY_ENTRY_NOT_FOUND' | 'MEMORY_INVALID_ARGUMENT' | 'MEMORY_INVALID_MARKDOWN'
export class MemoryEventStore implements MemoryStore   // 注意类名
export interface MemoryEntrySnapshot {
  readonly id: MemoryEntryId; readonly layer: MemoryLayer; readonly ownerId: string
  readonly title: string; readonly content: string; readonly tags: readonly string[]
  readonly authorId: BotId; readonly source?: string; readonly revision: number
  readonly createdAt: string; readonly updatedAt: string
}
export interface MemoryStats {
  readonly entryCount: number; readonly organizationCount: number
  readonly departmentCount: number; readonly botCount: number; readonly tagCount: number
}
```

```ts
addEntry(input: { readonly layer: MemoryLayer; readonly ownerId: string; readonly title: string;
  readonly content: string; readonly authorId: BotId; readonly tags?: readonly string[]; readonly source?: string }): MemoryEntrySnapshot
updateEntry(id: MemoryEntryId, input: { readonly content: string; readonly editorId: BotId }): MemoryEntrySnapshot
removeEntry(id: MemoryEntryId, input: { readonly removedBy: BotId }): void
importMarkdown(input: { readonly layer: MemoryLayer; readonly ownerId: string; readonly markdown: string; readonly authorId: BotId }): MemoryEntrySnapshot[]
toMarkdown(filter?: { readonly layer?: MemoryLayer; readonly ownerId?: string }): string
getEntry(id: MemoryEntryId): MemoryEntrySnapshot | undefined
listEntries(filter?: { readonly layer?: MemoryLayer; readonly ownerId?: string; readonly tag?: string }): MemoryEntrySnapshot[]
search(query: string, filter?: { readonly layer?: MemoryLayer; readonly ownerId?: string }): MemoryEntrySnapshot[]
```

事件（4 种）：`memory/entry-added` / `memory/entry-updated` / `memory/entry-removed` / `memory/layer-cleared`。
规则：title / content / ownerId 非空；`updateEntry` 使 `revision + 1`；找不到抛 `MEMORY_ENTRY_NOT_FOUND`；`importMarkdown` 用 `^#{1,3}\s+` 分段（无标题则整段、title=`Imported`），空内容抛 `MEMORY_INVALID_MARKDOWN`；`toMarkdown` 输出 `## <title>\n\n<content>` 拼接；`search` 不区分大小写匹配 title/content。

---

## 5. `packages/skill` — @compbotorg/skill v0.6.0

```ts
export function SkillId(value: string): SkillId
export function ConnectorId(value: string): ConnectorId
export type SkillKind = 'expert' | 'tool' | 'connector' | 'workflow'
export type RiskLevel = 'low' | 'medium' | 'high'
export type SkillErrorCode =
  | 'SKILL_NOT_FOUND' | 'SKILL_INVALID_ARGUMENT' | 'SKILL_ALREADY_INSTALLED'
  | 'SKILL_NOT_INSTALLED' | 'SKILL_RISKY_INSTALL' | 'CONNECTOR_NOT_FOUND' | 'SKILL_DISABLED'
export interface SkillSnapshot {
  readonly id: SkillId; readonly name: string; readonly kind: SkillKind; readonly description: string
  readonly version: string; readonly capabilities: readonly string[]; readonly risk: RiskLevel
  readonly manifest?: Record<string, unknown>; readonly registeredBy: BotId; readonly enabled: boolean
  readonly installedBots: readonly BotId[]; readonly createdAt: string; readonly updatedAt: string
}
export interface ConnectorSnapshot {
  readonly id: ConnectorId; readonly name: string; readonly endpoint: string
  readonly protocol: 'mcp'|'http'|'cli'; readonly registeredBy: BotId; readonly createdAt: string
}
export interface SkillStats {
  readonly skillCount: number; readonly connectorCount: number; readonly installedCount: number
  readonly enabledCount: number; readonly highRiskCount: number
}
```

```ts
registerSkill(input: { readonly name: string; readonly kind: SkillKind; readonly description: string;
  readonly version: string; readonly capabilities: readonly string[]; readonly registeredBy: BotId;
  readonly risk?: RiskLevel; readonly manifest?: Record<string, unknown> }): SkillSnapshot
registerConnector(input: { readonly name: string; readonly endpoint: string; readonly protocol: 'mcp'|'http'|'cli'; readonly registeredBy: BotId }): ConnectorSnapshot
installSkill(skillId: SkillId, input: { readonly botId: BotId; readonly installedBy: BotId }): SkillSnapshot
uninstallSkill(skillId: SkillId, input: { readonly botId: BotId; readonly uninstalledBy: BotId }): SkillSnapshot
setEnabled(skillId: SkillId, input: { readonly enabled: boolean; readonly changedBy: BotId }): SkillSnapshot
getSkill(id: SkillId): SkillSnapshot | undefined
listSkills(filter?: { readonly kind?: SkillKind; readonly capability?: string }): SkillSnapshot[]
skillsOf(botId: BotId): SkillSnapshot[]
listConnectors(): ConnectorSnapshot[]
```

事件（6 种）：`skill/registered` / `skill/connector-registered` / `skill/installed` / `skill/uninstalled` / `skill/enabled` / `skill/disabled`。
规则：name / version / endpoint 非空；同名同版本重复注册抛 `SKILL_INVALID_ARGUMENT`；重复安装抛 `SKILL_ALREADY_INSTALLED`；未安装却卸载抛 `SKILL_NOT_INSTALLED`；给 disabled 技能安装抛 `SKILL_DISABLED`；`risk='high'` 的技能仅允许 `installedBy === registeredBy`（否则 `SKILL_RISKY_INSTALL`）；`installedBots` 去重。

---

## 6. `packages/policy` — @compbotorg/policy v0.7.0

```ts
export function PolicyId(value: string): PolicyId
export type PolicyEffect = 'allow' | 'deny' | 'requires_approval'
export type RiskLevel = 'low' | 'medium' | 'high'
export type PolicyErrorCode = 'POLICY_NOT_FOUND' | 'POLICY_INVALID_ARGUMENT' | 'POLICY_DISABLED'
export interface PolicySnapshot {
  readonly id: PolicyId; readonly name: string; readonly action: string; readonly effect: PolicyEffect
  readonly priority: number; readonly description?: string; readonly enabled: boolean
  readonly createdBy: BotId; readonly createdAt: string; readonly updatedAt: string
}
export interface EvaluationSnapshot {
  readonly id: string; readonly action: string; readonly actorId: BotId; readonly risk: RiskLevel
  readonly decision: PolicyEffect; readonly matchedPolicyId?: PolicyId; readonly evaluatedAt: string
}
export interface AuditSnapshot {
  readonly id: string; readonly actorId: BotId; readonly action: string
  readonly outcome: 'allowed'|'denied'|'pending'|'completed'
  readonly detail?: string; readonly taskId?: string; readonly recordedAt: string
}
export interface PolicyStats {
  readonly policyCount: number; readonly enabledCount: number; readonly evaluationCount: number
  readonly approvalRequiredCount: number; readonly auditCount: number; readonly deniedCount: number
}
```

```ts
createPolicy(input: { readonly name: string; readonly action: string; readonly effect: PolicyEffect;
  readonly priority?: number; readonly description?: string; readonly createdBy: BotId }): PolicySnapshot
updatePolicy(id: PolicyId, input: { readonly effect?: PolicyEffect; readonly priority?: number; readonly enabled?: boolean; readonly changedBy: BotId }): PolicySnapshot
revokePolicy(id: PolicyId, input: { readonly revokedBy: BotId }): PolicySnapshot
evaluate(input: { readonly action: string; readonly actorId: BotId; readonly risk?: RiskLevel; readonly context?: string }): EvaluationSnapshot
recordAudit(input: { readonly actorId: BotId; readonly action: string; readonly outcome: 'allowed'|'denied'|'pending'|'completed'; readonly detail?: string; readonly taskId?: string }): AuditSnapshot
getPolicy(id: PolicyId): PolicySnapshot | undefined
listPolicies(): PolicySnapshot[]
getEvaluations(): EvaluationSnapshot[]
getAuditLog(filter?: { readonly actorId?: BotId; readonly outcome?: 'allowed'|'denied'|'pending'|'completed' }): AuditSnapshot[]
```

事件（6 种）：`policy/created` / `policy/updated` / `policy/revoked` / `policy/evaluated` / `policy/audit-appended` / `policy/approval-required`。
`evaluate` 匹配：在 enabled 且未 revoked 策略中取 `action === input.action || policy.action === '*' || input.action.startsWith(policy.action.replace(/\*$/, ''))` 的候选，按 `priority` 降序、`createdAt` 升序取第一条；命中用其 effect，未命中默认 `allow`。命中 `requires_approval` 时额外 commit 一条 `approval-required` 事件与一条 `outcome='pending'` 审计。`evaluate` / `recordAudit` 各自 append 事件。

---

## 7. `packages/registry` — @compbotorg/registry v0.8.0

```ts
export function ListingId(value: string): ListingId
export type RegistryErrorCode =
  | 'REGISTRY_LISTING_NOT_FOUND' | 'REGISTRY_INVALID_ARGUMENT' | 'REGISTRY_ALREADY_PUBLISHED'
  | 'REGISTRY_INVALID_RATING' | 'REGISTRY_UNPUBLISHED'
export interface ListingSnapshot {
  readonly id: ListingId; readonly name: string; readonly kind: 'skill'|'connector'|'workflow'
  readonly version: string; readonly description: string; readonly publisherId: BotId
  readonly capabilities: readonly string[]; readonly status: 'published'|'unpublished'
  readonly installCount: number
  readonly ratings: readonly { readonly raterId: BotId; readonly score: number; readonly comment?: string }[]
  readonly averageRating: number; readonly createdAt: string; readonly updatedAt: string
}
export interface RegistryStats {
  readonly listingCount: number; readonly publishedCount: number; readonly installCount: number
  readonly ratingCount: number; readonly averageRating: number
}
```

```ts
publish(input: { readonly name: string; readonly kind: 'skill'|'connector'|'workflow'; readonly version: string;
  readonly description: string; readonly publisherId: BotId; readonly capabilities: readonly string[] }): ListingSnapshot
install(listingId: ListingId, input: { readonly botId: BotId; readonly installedBy: BotId }): ListingSnapshot
rate(listingId: ListingId, input: { readonly score: number; readonly raterId: BotId; readonly comment?: string }): ListingSnapshot
unpublish(listingId: ListingId, input: { readonly unpublishedBy: BotId }): ListingSnapshot
search(query: string, filter?: { readonly kind?: 'skill'|'connector'|'workflow'; readonly capability?: string }): ListingSnapshot[]
getListing(id: ListingId): ListingSnapshot | undefined
listListings(): ListingSnapshot[]
```

事件（4 种）：`registry/published` / `registry/installed` / `registry/rated` / `registry/unpublished`。
规则：同名同版本重复发布抛 `REGISTRY_ALREADY_PUBLISHED`；score 必须 1..5 整数；已 unpublished 不能再 install/rate（`REGISTRY_UNPUBLISHED`）；`averageRating` 保留两位小数；`search` 只返回 published，不区分大小写匹配 name/description/capabilities。

---

## 8. `packages/goal` — @compbotorg/goal v0.9.0

```ts
export function GoalId(value: string): GoalId
export type GoalErrorCode = 'GOAL_NOT_FOUND' | 'GOAL_INVALID_ARGUMENT' | 'GOAL_INVALID_TRANSITION' | 'GOAL_NO_SUBTASKS'
export interface GoalSubtask { readonly title: string; readonly assigneeHint?: string; readonly taskId?: string }
export interface GoalMetric { readonly botId: BotId; readonly quality: number; readonly timeliness: number; readonly recordedAt: string }
export interface GoalSnapshot {
  readonly id: GoalId; readonly title: string; readonly description?: string
  readonly createdBy: BotId; readonly ownerId: BotId
  readonly status: 'draft'|'in_progress'|'completed'|'cancelled'
  readonly subtasks: readonly GoalSubtask[]; readonly taskIds: readonly string[]
  readonly metrics: readonly GoalMetric[]; readonly summary?: string
  readonly createdAt: string; readonly updatedAt: string
}
export interface GoalStats {
  readonly goalCount: number; readonly inProgressCount: number; readonly completedCount: number
  readonly subtaskCount: number; readonly linkedTaskCount: number; readonly averageQuality: number
}
```

```ts
createGoal(input: { readonly title: string; readonly description?: string; readonly createdBy: BotId; readonly ownerId: BotId }): GoalSnapshot
decompose(goalId: GoalId, input: { readonly subtasks: readonly { readonly title: string; readonly assigneeHint?: string }[]; readonly decomposedBy: BotId }): GoalSnapshot
linkTask(goalId: GoalId, input: { readonly taskId: string; readonly subtaskIndex?: number; readonly linkedBy: BotId }): GoalSnapshot
recordMetric(goalId: GoalId, input: { readonly botId: BotId; readonly quality: number; readonly timeliness: number; readonly recordedBy: BotId }): GoalSnapshot
completeGoal(goalId: GoalId, input: { readonly completedBy: BotId; readonly summary?: string }): GoalSnapshot
getGoal(id: GoalId): GoalSnapshot | undefined
listGoals(): GoalSnapshot[]
```

事件（6 种）：`goal/created` / `goal/decomposed` / `goal/task-linked` / `goal/metric-recorded` / `goal/status-changed` / `goal/completed`。
规则：title 非空；`decompose` 的 subtasks 非空（`GOAL_NO_SUBTASKS`）并把 status 置 `in_progress`；已 completed/cancelled 不能再 decompose / linkTask / completeGoal（`GOAL_INVALID_TRANSITION`）；quality / timeliness 必须 0..100；`completeGoal` 要求 status 为 `in_progress`；`averageQuality` 两位小数。

---

## 9. `packages/runtime` — @compbotorg/runtime v0.3.0（已单独实现）

`BotRuntime` 端口：`execute(request: ExecutionRequest): ExecutionResult | Promise<ExecutionResult>`。
`SimulatedRuntime` 确定性执行（可注入 `model`）；`ExecutionService` 三种执行事件；
`AgentRunner.runTask(taskId, context?)` 编排 `startTask → execute → completeTask → submitReport`，
通过 `artifactSink` 回调把产物交给 `Company` 归档；`restoreRuntime(events, options)` 重放。

---

## 10. 门面如何消费这些包

`packages/company/src/company.ts` 只调用：各包的 `new XService({ now })` / `restoreX(events, { now })` /
`events()` / `getStats()` / `list*()` 以及第 3–8 节列出的命令。新增包时保持这些签名不变即可。
