/**
 * Demo: run one full organization protocol loop.
 *
 * Run with `pnpm demo:protocol` from the repository root. The demo wires the
 * v0.2 task core to a real v0.1 organization, then walks:
 *
 *   create -> assign -> delegate -> start -> complete -> report -> review
 *   -> decision -> approval -> block -> escalate -> replay
 *
 * It also shows an authorization rejection and a deterministic event replay.
 *
 * @module compbotorg/examples/demo-protocol
 */

import {
  BotId,
  OrganizationService,
  RoleId,
} from '@compbotorg/organization'
import {
  EventBus,
  OrganizationAuthorizer,
  TaskError,
  TaskService,
  restoreTask,
  type LoggedEvent,
} from '@compbotorg/task'

const CEO = BotId('bot-ada')
const DIRECTOR = BotId('bot-margaret')
const ENGINEER = BotId('bot-ken')

const org = new OrganizationService()
org.createOrganization({ name: 'Acme AI', description: 'Protocol demo company' })
const executive = org.createDepartment({ name: 'Executive' }).id
const engineering = org.createDepartment({ name: 'Engineering' }).id
org.addMember({ botId: CEO, displayName: 'Ada', departmentId: executive, roleId: RoleId('ceo') })
org.addMember(
  {
    botId: DIRECTOR,
    displayName: 'Margaret',
    departmentId: engineering,
    roleId: RoleId('director'),
    reportsTo: CEO,
  },
  { actorId: CEO },
)
org.addMember(
  {
    botId: ENGINEER,
    displayName: 'Ken',
    departmentId: engineering,
    roleId: RoleId('engineer'),
    reportsTo: DIRECTOR,
  },
  { actorId: DIRECTOR },
)

const bus = new EventBus()
const published: string[] = []
bus.subscribe((entry: LoggedEvent) => {
  published.push(`${entry.seq.toString().padStart(2, '0')} ${entry.event.type}`)
})

const tasks = new TaskService({
  authorizer: new OrganizationAuthorizer(org),
  bus,
  now: () => new Date('2026-02-01T09:00:00.000Z'),
})

console.log('='.repeat(72))
console.log('CompbotOrg — v0.2 Organization Protocol demo')
console.log('='.repeat(72))
console.log('\n[0] Reporting line: Ada (CEO) > Margaret (Director) > Ken (Engineer)')

// 1. CEO creates a task and assigns it down the line.
const task = tasks.createTask(
  {
    title: 'Ship the v0.2 protocol',
    description: 'Implement task, report, decision, approval and escalation.',
    priority: 'high',
    createdBy: CEO,
  },
  { actorId: CEO },
)
tasks.assignTask(task.id, DIRECTOR, { actorId: CEO })
console.log(`\n[1] Created ${task.id} "${task.title}" and assigned it to Margaret`)

// 2. The director delegates downward; only someone Margaret manages can receive it.
tasks.delegateTask(task.id, ENGINEER, { actorId: DIRECTOR })
tasks.startTask(task.id, { actorId: ENGINEER })
console.log('[2] Margaret delegated to Ken; Ken started the work')

// 3. An engineer cannot assign work to the CEO: authority is enforced by v0.1.
try {
  tasks.assignTask(task.id, CEO, { actorId: ENGINEER })
  console.log('[3] ERROR: unauthorized assignment was accepted')
  process.exitCode = 1
} catch (error) {
  const code = error instanceof TaskError ? error.code : 'UNKNOWN'
  console.log(`[3] Unauthorized assignment rejected: ${code}`)
}

// 4. Work completes with artifacts, a report is submitted and reviewed.
tasks.completeTask(
  task.id,
  { summary: 'Protocol core implemented and tested', artifactRefs: ['botfs://org/artifacts/protocol-core.md'] },
  { actorId: ENGINEER },
)
const report = tasks.submitReport(
  task.id,
  { summary: 'All 18 event types fold deterministically', artifactRefs: ['botfs://org/artifacts/report.md'] },
  { actorId: ENGINEER },
)
tasks.approveReport(report.id, 'Reviewed, ship it.', { actorId: DIRECTOR })
console.log(`[4] ${report.id} submitted by Ken, approved by Margaret`)

// 5. A decision is requested by the engineer and made by the CEO.
const decision = tasks.requestDecision(
  { subject: 'Adopt event sourcing for v0.3', taskId: task.id, requestedBy: ENGINEER },
  { actorId: ENGINEER },
)
tasks.makeDecision(decision.id, { outcome: 'approved', rationale: 'Auditability is a core requirement.' }, { actorId: CEO })
console.log(`[5] ${decision.id} decided by Ada: approved`)

// 6. A separate approval request is granted by its designated approver.
const approval = tasks.requestApproval(
  { subject: 'Publish v0.2 to the registry', taskId: task.id, requestedBy: ENGINEER, approverId: DIRECTOR },
  { actorId: ENGINEER },
)
tasks.grantApproval(approval.id, 'Approved for publication.', { actorId: DIRECTOR })
console.log(`[6] ${approval.id} granted by Margaret`)

// 7. A blocked task escalates along the reporting line, not to an arbitrary bot.
const blocked = tasks.createTask(
  { title: 'Evaluate a new model provider', createdBy: CEO },
  { actorId: CEO },
)
tasks.assignTask(blocked.id, ENGINEER, { actorId: CEO })
tasks.blockTask(blocked.id, 'Provider credentials are unavailable', { actorId: ENGINEER })
const escalation = tasks.escalateTask(blocked.id, { reason: 'Need a decision on credentials' }, { actorId: ENGINEER })
console.log(`[7] ${escalation.id}: Ken escalated to ${escalation.escalatedTo} via the reporting line`)

// 8. Replay the log and compare the folded state.
const restored = restoreTask(
  tasks.events().map(entry => entry.event),
  { authorizer: new OrganizationAuthorizer(org) },
)
const before = JSON.stringify(tasks.getStats())
const after = JSON.stringify(restored.getStats())
console.log(`\n[8] Event log: ${published.length} events; replay matches: ${before === after}`)
console.log('    ' + published.join(' | '))
console.log(`\n[9] Stats: ${JSON.stringify(tasks.getStats())}`)
console.log('\nProtocol loop complete.')
