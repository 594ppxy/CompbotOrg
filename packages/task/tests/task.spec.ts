import { describe, expect, it } from 'vitest'
import {
  BotId,
  OrganizationService,
  RoleId,
} from '@compbotorg/organization'
import {
  EventBus,
  OrganizationAuthorizer,
  PermissiveAuthorizer,
  TaskError,
  TaskService,
  applyEvent,
  emptyState,
  replay,
  restoreTask,
  type LoggedEvent,
  type TaskEvent,
  type TaskServiceOptions,
} from '../src/index'

const NOW = () => new Date('2026-02-01T00:00:00.000Z')
const CEO = BotId('bot-ceo')
const DIRECTOR = BotId('bot-director')
const ENGINEER = BotId('bot-engineer')
const ANALYST = BotId('bot-analyst')
const OUTSIDER = BotId('bot-outsider')

/** Build a three-level organization wired to the protocol. */
function makeOrganization(): OrganizationService {
  const org = new OrganizationService({ now: NOW })
  org.createOrganization({ name: 'Acme AI' })
  const executive = org.createDepartment({ name: 'Executive' }).id
  const engineering = org.createDepartment({ name: 'Engineering' }).id
  org.addMember({
    botId: CEO,
    displayName: 'Ada',
    departmentId: executive,
    roleId: RoleId('ceo'),
  })
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
  org.addMember(
    {
      botId: ANALYST,
      displayName: 'Grace',
      departmentId: engineering,
      roleId: RoleId('analyst'),
      reportsTo: DIRECTOR,
    },
    { actorId: DIRECTOR },
  )
  return org
}

/** Standalone permissive service. */
function makeService(options: TaskServiceOptions = {}): TaskService {
  return new TaskService({ now: NOW, ...options })
}

/** Organization-wired service. */
function makeWired(): { org: OrganizationService; tasks: TaskService } {
  const org = makeOrganization()
  const tasks = new TaskService({ authorizer: new OrganizationAuthorizer(org), now: NOW })
  return { org, tasks }
}

/** Create and assign a task in one helper. */
function assigned(
  tasks: TaskService,
  assigneeId = ENGINEER,
  options: { actorId?: typeof CEO } = {},
): ReturnType<TaskService['createTask']> {
  const task = tasks.createTask({ title: 'Write the spec', createdBy: CEO }, options)
  tasks.assignTask(task.id, assigneeId, options)
  return tasks.getTask(task.id)!
}

/** Return the stable error code of a rejected command. */
function errorCode(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof TaskError) return error.code
    return `UNEXPECTED:${String(error)}`
  }
  return 'NO_ERROR'
}

/** Serialize a service projection for deterministic comparison. */
function snapshot(tasks: TaskService): string {
  return JSON.stringify({
    tasks: tasks.listTasks(),
    reports: tasks.listReports(),
    decisions: tasks.listDecisions(),
    approvals: tasks.listApprovals(),
    escalations: tasks.listEscalations(),
    stats: tasks.getStats(),
  })
}

describe('task creation and validation', () => {
  it('creates a pending task with defaults', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Ship it', createdBy: CEO })
    expect(task.status).toBe('pending')
    expect(task.priority).toBe('normal')
    expect(task.createdBy).toBe(CEO)
    expect(task.assigneeId).toBeUndefined()
    expect(task.delegationDepth).toBe(0)
    expect(task.reportIds).toEqual([])
    expect(task.createdAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('keeps description, priority and creator', () => {
    const tasks = makeService()
    const task = tasks.createTask({
      title: 'Ship it',
      description: 'With notes',
      priority: 'urgent',
      createdBy: DIRECTOR,
    })
    expect(task.description).toBe('With notes')
    expect(task.priority).toBe('urgent')
    expect(task.createdBy).toBe(DIRECTOR)
  })

  it('rejects an empty title', () => {
    const tasks = makeService()
    expect(errorCode(() => tasks.createTask({ title: '   ', createdBy: CEO }))).toBe(
      'TASK_INVALID_ARGUMENT',
    )
  })

  it('rejects an over-long description', () => {
    const tasks = makeService()
    expect(
      errorCode(() => tasks.createTask({ title: 'Ok', description: 'x'.repeat(4001), createdBy: CEO })),
    ).toBe('TASK_INVALID_ARGUMENT')
  })

  it('rejects an unknown priority', () => {
    const tasks = makeService()
    expect(
      errorCode(() =>
        tasks.createTask({ title: 'Ok', priority: 'critical' as 'high', createdBy: CEO }),
      ),
    ).toBe('TASK_INVALID_ARGUMENT')
  })

  it('assigns monotonically increasing identities', () => {
    const tasks = makeService()
    const first = tasks.createTask({ title: 'One', createdBy: CEO })
    const second = tasks.createTask({ title: 'Two', createdBy: CEO })
    expect(first.id).toBe('task-1')
    expect(second.id).toBe('task-2')
  })

  it('rejects unknown task identities across commands', () => {
    const tasks = makeService()
    expect(errorCode(() => tasks.assignTask('task-404' as never, ENGINEER))).toBe('TASK_NOT_FOUND')
    expect(errorCode(() => tasks.startTask('task-404' as never))).toBe('TASK_NOT_FOUND')
  })
})

describe('task lifecycle', () => {
  it('assigns a task and records who assigned it', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Write', createdBy: CEO })
    const updated = tasks.assignTask(task.id, ENGINEER, { actorId: CEO })
    expect(updated.status).toBe('assigned')
    expect(updated.assigneeId).toBe(ENGINEER)
    expect(updated.assignedBy).toBe(CEO)
  })

  it('rejects assigning the same person twice', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    expect(errorCode(() => tasks.assignTask(task.id, ENGINEER))).toBe('TASK_ALREADY_ASSIGNED')
  })

  it('rejects assigning a completed task', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.startTask(task.id)
    tasks.completeTask(task.id)
    expect(errorCode(() => tasks.assignTask(task.id, ANALYST))).toBe('TASK_INVALID_TRANSITION')
  })

  it('claims a pending task only with an actorId', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Unowned', createdBy: CEO })
    expect(errorCode(() => tasks.claimTask(task.id))).toBe('TASK_INVALID_ARGUMENT')
    const claimed = tasks.claimTask(task.id, { actorId: ANALYST })
    expect(claimed.status).toBe('assigned')
    expect(claimed.assigneeId).toBe(ANALYST)
    expect(errorCode(() => tasks.claimTask(task.id, { actorId: ENGINEER }))).toBe(
      'TASK_INVALID_TRANSITION',
    )
  })

  it('starts only assigned tasks', () => {
    const tasks = makeService()
    const pending = tasks.createTask({ title: 'Pending', createdBy: CEO })
    expect(errorCode(() => tasks.startTask(pending.id))).toBe('TASK_NOT_ASSIGNED')
    const task = assigned(tasks)
    const started = tasks.startTask(task.id)
    expect(started.status).toBe('in_progress')
    expect(errorCode(() => tasks.startTask(task.id))).toBe('TASK_INVALID_TRANSITION')
  })

  it('blocks and unblocks a task, clearing the blocker text', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.startTask(task.id)
    const blocked = tasks.blockTask(task.id, 'Waiting on credentials')
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker).toBe('Waiting on credentials')
    expect(errorCode(() => tasks.blockTask(task.id, 'again'))).toBe('TASK_INVALID_TRANSITION')
    const resumed = tasks.unblockTask(task.id)
    expect(resumed.status).toBe('in_progress')
    expect(resumed.blocker).toBeUndefined()
    expect(errorCode(() => tasks.unblockTask(task.id))).toBe('TASK_INVALID_TRANSITION')
  })

  it('rejects blocking a completed task', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.completeTask(task.id)
    expect(errorCode(() => tasks.blockTask(task.id, 'too late'))).toBe('TASK_INVALID_TRANSITION')
  })

  it('completes with a summary and artifact references', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.startTask(task.id)
    const done = tasks.completeTask(
      task.id,
      { summary: 'Spec written', artifactRefs: ['botfs://org/spec.md'] },
      { actorId: ENGINEER },
    )
    expect(done.status).toBe('completed')
    expect(done.completionSummary).toBe('Spec written')
    expect(done.artifactRefs).toEqual(['botfs://org/spec.md'])
  })

  it('rejects completing a pending or cancelled task', () => {
    const tasks = makeService()
    const pending = tasks.createTask({ title: 'Pending', createdBy: CEO })
    expect(errorCode(() => tasks.completeTask(pending.id))).toBe('TASK_NOT_ASSIGNED')
    const task = tasks.createTask({ title: 'Dropped', createdBy: CEO })
    tasks.cancelTask(task.id, 'No longer needed')
    expect(errorCode(() => tasks.completeTask(task.id))).toBe('TASK_INVALID_TRANSITION')
  })

  it('cancels a task as its creator and rejects double cancellation', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Drop me', createdBy: CEO })
    const cancelled = tasks.cancelTask(task.id, 'Out of scope')
    expect(cancelled.status).toBe('cancelled')
    expect(errorCode(() => tasks.cancelTask(task.id, 'again'))).toBe('TASK_INVALID_TRANSITION')
  })

  it('rejects cancelling a completed task', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.completeTask(task.id)
    expect(errorCode(() => tasks.cancelTask(task.id, 'too late'))).toBe('TASK_INVALID_TRANSITION')
  })

  it('records delegation depth on downward hand-offs', () => {
    const tasks = makeService()
    const task = assigned(tasks, DIRECTOR)
    const delegated = tasks.delegateTask(task.id, ENGINEER, { actorId: DIRECTOR })
    expect(delegated.assigneeId).toBe(ENGINEER)
    expect(delegated.assignedBy).toBe(DIRECTOR)
    expect(delegated.delegationDepth).toBe(1)
    expect(delegated.status).toBe('assigned')
  })

  it('rejects delegating an unassigned task or to its own assignee', () => {
    const tasks = makeService()
    const pending = tasks.createTask({ title: 'Unowned', createdBy: CEO })
    expect(errorCode(() => tasks.delegateTask(pending.id, ENGINEER))).toBe('TASK_NOT_ASSIGNED')
    const task = assigned(tasks)
    expect(errorCode(() => tasks.delegateTask(task.id, ENGINEER))).toBe('TASK_INVALID_TRANSITION')
  })
})

describe('authorization through OrganizationAuthorizer', () => {
  it('exposes v0.1 manage relations through the adapter', () => {
    const { org, tasks } = makeWired()
    const authorizer = new OrganizationAuthorizer(org)
    expect(authorizer.canManage(CEO, DIRECTOR)).toBe(true)
    expect(authorizer.canManage(DIRECTOR, ENGINEER)).toBe(true)
    expect(authorizer.canManage(ENGINEER, CEO)).toBe(false)
    expect(authorizer.managerOf(ENGINEER)).toBe(DIRECTOR)
    expect(authorizer.isActive(OUTSIDER)).toBe(false)
    expect(tasks.getStats().taskCount).toBe(0)
  })

  it('lets the CEO assign and the director delegate down the line', () => {
    const { tasks } = makeWired()
    const task = tasks.createTask({ title: 'Build', createdBy: CEO }, { actorId: CEO })
    tasks.assignTask(task.id, DIRECTOR, { actorId: CEO })
    const delegated = tasks.delegateTask(task.id, ENGINEER, { actorId: DIRECTOR })
    expect(delegated.assigneeId).toBe(ENGINEER)
  })

  it('rejects an engineer assigning work to the CEO', () => {
    const { tasks } = makeWired()
    const task = tasks.createTask({ title: 'Build', createdBy: CEO }, { actorId: CEO })
    expect(errorCode(() => tasks.assignTask(task.id, CEO, { actorId: ENGINEER }))).toBe(
      'TASK_PERMISSION_DENIED',
    )
  })

  it('rejects a director delegating upward to the CEO', () => {
    const { tasks } = makeWired()
    const task = tasks.createTask({ title: 'Build', createdBy: CEO }, { actorId: CEO })
    tasks.assignTask(task.id, DIRECTOR, { actorId: CEO })
    expect(errorCode(() => tasks.delegateTask(task.id, CEO, { actorId: DIRECTOR }))).toBe(
      'TASK_PERMISSION_DENIED',
    )
  })

  it('rejects commands from a bot outside the organization', () => {
    const { tasks } = makeWired()
    expect(
      errorCode(() => tasks.createTask({ title: 'Build', createdBy: CEO }, { actorId: OUTSIDER })),
    ).toBe('TASK_PERMISSION_DENIED')
  })

  it('rejects a peer completing another member\'s task', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    expect(
      errorCode(() => tasks.completeTask(task.id, {}, { actorId: ANALYST })),
    ).toBe('TASK_PERMISSION_DENIED')
  })

  it('lets a manager complete a subordinate task', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const done = tasks.completeTask(task.id, { summary: 'Reviewed by manager' }, { actorId: DIRECTOR })
    expect(done.status).toBe('completed')
  })

  it('rejects a non-creator non-manager cancelling a task', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    expect(errorCode(() => tasks.cancelTask(task.id, 'No', { actorId: ANALYST }))).toBe(
      'TASK_PERMISSION_DENIED',
    )
    const cancelled = tasks.cancelTask(task.id, 'Reprioritized', { actorId: CEO })
    expect(cancelled.status).toBe('cancelled')
  })

  it('uses a permissive authorizer by default in standalone mode', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Build', createdBy: CEO })
    expect(tasks.assignTask(task.id, CEO).assigneeId).toBe(CEO)
  })

  it('accepts an explicit permissive authorizer instance', () => {
    const tasks = makeService({ authorizer: new PermissiveAuthorizer() })
    const task = tasks.createTask({ title: 'Build', createdBy: ENGINEER })
    expect(tasks.assignTask(task.id, CEO).assigneeId).toBe(CEO)
  })
})

describe('escalation', () => {
  it('walks the reporting line to the first managing manager', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const escalation = tasks.escalateTask(task.id, { reason: 'Need a decision' }, { actorId: ENGINEER })
    expect(escalation.fromBotId).toBe(ENGINEER)
    expect(escalation.escalatedTo).toBe(DIRECTOR)
    expect(escalation.raisedBy).toBe(ENGINEER)
    expect(tasks.getTask(task.id)!.escalatedTo).toBe(DIRECTOR)
    expect(tasks.escalationsOf(task.id)).toHaveLength(1)
  })

  it('accepts an explicit target that sits on the reporting line', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const escalation = tasks.escalateTask(
      task.id,
      { reason: 'Need executive help', toBotId: CEO },
      { actorId: ENGINEER },
    )
    expect(escalation.escalatedTo).toBe(CEO)
  })

  it('rejects escalation to a peer outside the reporting line', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    expect(
      errorCode(() =>
        tasks.escalateTask(task.id, { reason: 'Help', toBotId: ANALYST }, { actorId: ENGINEER }),
      ),
    ).toBe('TASK_INVALID_ESCALATION')
  })

  it('rejects escalation to the owner itself', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    expect(
      errorCode(() =>
        tasks.escalateTask(task.id, { reason: 'Help', toBotId: ENGINEER }, { actorId: ENGINEER }),
      ),
    ).toBe('TASK_INVALID_ESCALATION')
  })

  it('reports no escalation target when the authorizer has no line', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    expect(errorCode(() => tasks.escalateTask(task.id, { reason: 'Stuck' }))).toBe(
      'TASK_NO_ESCALATION_TARGET',
    )
  })

  it('allows an explicit target in standalone mode', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    const escalation = tasks.escalateTask(task.id, { reason: 'Stuck', toBotId: CEO })
    expect(escalation.escalatedTo).toBe(CEO)
  })

  it('rejects escalating a cancelled task', () => {
    const tasks = makeService()
    const task = tasks.createTask({ title: 'Gone', createdBy: CEO })
    tasks.cancelTask(task.id, 'Dropped')
    expect(errorCode(() => tasks.escalateTask(task.id, { reason: 'Why', toBotId: CEO }))).toBe(
      'TASK_INVALID_TRANSITION',
    )
  })

  it('keeps every escalation record in creation order', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    tasks.escalateTask(task.id, { reason: 'First' }, { actorId: ENGINEER })
    tasks.escalateTask(task.id, { reason: 'Second', toBotId: CEO }, { actorId: ENGINEER })
    expect(tasks.listEscalations().map(item => item.reason)).toEqual(['First', 'Second'])
    expect(tasks.escalationsOf(task.id)).toHaveLength(2)
  })
})

describe('reports', () => {
  it('submits a report and links it to the task', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    const report = tasks.submitReport(
      task.id,
      { summary: 'Spec complete', artifactRefs: ['botfs://org/spec.md'] },
      { actorId: ENGINEER },
    )
    expect(report.status).toBe('submitted')
    expect(report.authorId).toBe(ENGINEER)
    expect(report.artifactRefs).toEqual(['botfs://org/spec.md'])
    expect(tasks.getTask(task.id)!.reportIds).toEqual([report.id])
    expect(tasks.reportsOfTask(task.id)).toHaveLength(1)
  })

  it('rejects a report on a cancelled task or an unassigned task', () => {
    const tasks = makeService()
    const cancelled = tasks.createTask({ title: 'Gone', createdBy: CEO })
    tasks.cancelTask(cancelled.id, 'Dropped')
    expect(errorCode(() => tasks.submitReport(cancelled.id, { summary: 'x' }))).toBe(
      'TASK_INVALID_TRANSITION',
    )
    const pending = tasks.createTask({ title: 'Pending', createdBy: CEO })
    expect(errorCode(() => tasks.submitReport(pending.id, { summary: 'x' }))).toBe(
      'TASK_NOT_ASSIGNED',
    )
  })

  it('rejects an empty report summary', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    expect(errorCode(() => tasks.submitReport(task.id, { summary: '  ' }))).toBe(
      'TASK_INVALID_ARGUMENT',
    )
  })

  it('approves a report by a manager and records the note', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const report = tasks.submitReport(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    const approved = tasks.approveReport(report.id, 'Looks good', { actorId: DIRECTOR })
    expect(approved.status).toBe('approved')
    expect(approved.reviewerId).toBe(DIRECTOR)
    expect(approved.reviewNote).toBe('Looks good')
    expect(approved.reviewedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('resolves the reviewer from the reporting line when no actor is given', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const report = tasks.submitReport(task.id, { summary: 'Done' })
    const approved = tasks.approveReport(report.id)
    expect(approved.reviewerId).toBe(DIRECTOR)
  })

  it('rejects self-review and peer review', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const report = tasks.submitReport(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    expect(errorCode(() => tasks.approveReport(report.id, 'ok', { actorId: ENGINEER }))).toBe(
      'REPORT_PERMISSION_DENIED',
    )
    expect(errorCode(() => tasks.approveReport(report.id, 'ok', { actorId: ANALYST }))).toBe(
      'REPORT_PERMISSION_DENIED',
    )
  })

  it('requires an actorId for review in standalone mode', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    const report = tasks.submitReport(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    expect(errorCode(() => tasks.approveReport(report.id))).toBe('REPORT_PERMISSION_DENIED')
    expect(tasks.approveReport(report.id, undefined, { actorId: DIRECTOR }).status).toBe('approved')
  })

  it('rejects a report with a required rejection note', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const report = tasks.submitReport(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    expect(errorCode(() => tasks.rejectReport(report.id, '   ', { actorId: DIRECTOR }))).toBe(
      'TASK_INVALID_ARGUMENT',
    )
    const rejected = tasks.rejectReport(report.id, 'Missing evidence', { actorId: DIRECTOR })
    expect(rejected.status).toBe('rejected')
    expect(rejected.reviewNote).toBe('Missing evidence')
  })

  it('rejects reviewing a report twice', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const report = tasks.submitReport(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    tasks.approveReport(report.id, undefined, { actorId: DIRECTOR })
    expect(errorCode(() => tasks.approveReport(report.id, undefined, { actorId: DIRECTOR }))).toBe(
      'REPORT_INVALID_TRANSITION',
    )
  })

  it('rejects unknown report identities', () => {
    const tasks = makeService()
    expect(errorCode(() => tasks.approveReport('report-404' as never, undefined, { actorId: CEO }))).toBe(
      'REPORT_NOT_FOUND',
    )
  })
})

describe('decisions', () => {
  it('requests and makes a decision', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const decision = tasks.requestDecision(
      { subject: 'Adopt event sourcing', context: 'Auditability', taskId: task.id, requestedBy: ENGINEER },
      { actorId: ENGINEER },
    )
    expect(decision.status).toBe('pending')
    expect(decision.taskId).toBe(task.id)
    const made = tasks.makeDecision(
      decision.id,
      { outcome: 'approved', rationale: 'Required for audit' },
      { actorId: CEO },
    )
    expect(made.status).toBe('made')
    expect(made.madeBy).toBe(CEO)
    expect(made.rationale).toBe('Required for audit')
    expect(made.madeAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('defaults the decision maker to the requester manager', () => {
    const { tasks } = makeWired()
    const decision = tasks.requestDecision({ subject: 'Pick a date', requestedBy: ENGINEER })
    const made = tasks.makeDecision(decision.id, { outcome: 'deferred', rationale: 'Later' })
    expect(made.madeBy).toBe(DIRECTOR)
  })

  it('allows a member to decide its own request', () => {
    const { tasks } = makeWired()
    const decision = tasks.requestDecision({ subject: 'Set direction', requestedBy: CEO })
    const made = tasks.makeDecision(decision.id, { outcome: 'approved', rationale: 'Mine to make' }, { actorId: CEO })
    expect(made.madeBy).toBe(CEO)
  })

  it('rejects an unknown outcome or double decision', () => {
    const { tasks } = makeWired()
    const decision = tasks.requestDecision({ subject: 'Pick', requestedBy: ENGINEER })
    expect(
      errorCode(() =>
        tasks.makeDecision(decision.id, { outcome: 'maybe' as 'approved', rationale: 'x' }, { actorId: CEO }),
      ),
    ).toBe('TASK_INVALID_ARGUMENT')
    tasks.makeDecision(decision.id, { outcome: 'approved', rationale: 'x' }, { actorId: CEO })
    expect(
      errorCode(() => tasks.makeDecision(decision.id, { outcome: 'rejected', rationale: 'y' }, { actorId: CEO })),
    ).toBe('DECISION_INVALID_TRANSITION')
  })

  it('rejects a decision maker who cannot manage the requester', () => {
    const { tasks } = makeWired()
    const decision = tasks.requestDecision({ subject: 'Pick', requestedBy: DIRECTOR })
    expect(
      errorCode(() =>
        tasks.makeDecision(decision.id, { outcome: 'approved', rationale: 'x' }, { actorId: ENGINEER }),
      ),
    ).toBe('DECISION_PERMISSION_DENIED')
  })

  it('rejects unknown decision identities and missing task references', () => {
    const { tasks } = makeWired()
    expect(
      errorCode(() => tasks.makeDecision('decision-404' as never, { outcome: 'approved', rationale: 'x' })),
    ).toBe('DECISION_NOT_FOUND')
    expect(
      errorCode(() =>
        tasks.requestDecision({ subject: 'x', taskId: 'task-404' as never, requestedBy: CEO }),
      ),
    ).toBe('TASK_NOT_FOUND')
  })
})

describe('approvals', () => {
  function pendingApproval(tasks: TaskService) {
    return tasks.requestApproval({
      subject: 'Publish v0.2',
      requestedBy: ENGINEER,
      approverId: DIRECTOR,
    })
  }

  it('requests and grants an approval', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    expect(approval.status).toBe('pending')
    expect(tasks.approvalsFor(DIRECTOR)).toHaveLength(1)
    const granted = tasks.grantApproval(approval.id, 'Ship it', { actorId: DIRECTOR })
    expect(granted.status).toBe('granted')
    expect(granted.note).toBe('Ship it')
    expect(granted.resolvedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(tasks.approvalsFor(DIRECTOR)).toHaveLength(0)
  })

  it('denies an approval with a required note', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    expect(errorCode(() => tasks.denyApproval(approval.id, '  ', { actorId: DIRECTOR }))).toBe(
      'TASK_INVALID_ARGUMENT',
    )
    const denied = tasks.denyApproval(approval.id, 'Not ready', { actorId: DIRECTOR })
    expect(denied.status).toBe('denied')
    expect(denied.note).toBe('Not ready')
  })

  it('defaults to the designated approver when no actor is given', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    expect(tasks.grantApproval(approval.id).status).toBe('granted')
  })

  it('rejects self-approval requests', () => {
    const { tasks } = makeWired()
    expect(
      errorCode(() =>
        tasks.requestApproval({ subject: 'x', requestedBy: ENGINEER, approverId: ENGINEER }),
      ),
    ).toBe('APPROVAL_PERMISSION_DENIED')
  })

  it('rejects an approver who cannot manage the requester', () => {
    const { tasks } = makeWired()
    expect(
      errorCode(() =>
        tasks.requestApproval({ subject: 'x', requestedBy: ENGINEER, approverId: ANALYST }),
      ),
    ).toBe('APPROVAL_PERMISSION_DENIED')
  })

  it('rejects a non-designated approver resolving the request', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    expect(errorCode(() => tasks.grantApproval(approval.id, undefined, { actorId: ANALYST }))).toBe(
      'APPROVAL_PERMISSION_DENIED',
    )
  })

  it('lets a manager above the designated approver resolve the request', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    expect(tasks.grantApproval(approval.id, undefined, { actorId: CEO }).status).toBe('granted')
  })

  it('rejects resolving an approval twice and unknown identities', () => {
    const { tasks } = makeWired()
    const approval = pendingApproval(tasks)
    tasks.grantApproval(approval.id)
    expect(errorCode(() => tasks.grantApproval(approval.id))).toBe('APPROVAL_INVALID_TRANSITION')
    expect(errorCode(() => tasks.denyApproval('approval-404' as never, 'no'))).toBe(
      'APPROVAL_NOT_FOUND',
    )
  })
})

describe('event bus', () => {
  it('publishes every committed event with a monotonic seq', () => {
    const bus = new EventBus()
    const seen: LoggedEvent[] = []
    bus.subscribe(entry => seen.push(entry))
    const tasks = makeService({ bus })
    const task = tasks.createTask({ title: 'One', createdBy: CEO })
    tasks.assignTask(task.id, ENGINEER)
    tasks.startTask(task.id)
    expect(seen.map(entry => entry.event.type)).toEqual([
      'task/created',
      'task/assigned',
      'task/started',
    ])
    expect(seen.map(entry => entry.seq)).toEqual([1, 2, 3])
  })

  it('filters by event type with on()', () => {
    const bus = new EventBus()
    const seen: string[] = []
    bus.on('task/completed', entry => seen.push(entry.event.type))
    const tasks = makeService({ bus })
    const task = assigned(tasks)
    tasks.completeTask(task.id)
    expect(seen).toEqual(['task/completed'])
  })

  it('stops delivery after unsubscribe', () => {
    const bus = new EventBus()
    const seen: string[] = []
    const subscription = bus.subscribe(entry => seen.push(entry.event.type))
    const tasks = makeService({ bus })
    tasks.createTask({ title: 'One', createdBy: CEO })
    subscription.unsubscribe()
    tasks.createTask({ title: 'Two', createdBy: CEO })
    expect(seen).toEqual(['task/created'])
    expect(bus.listenerCount).toBe(0)
  })

  it('routes listener errors to onError without breaking the commit', () => {
    const errors: string[] = []
    const bus = new EventBus({ onError: error => errors.push(String(error)) })
    bus.subscribe(() => {
      throw new Error('subscriber failed')
    })
    const tasks = makeService({ bus })
    const task = tasks.createTask({ title: 'Still committed', createdBy: CEO })
    expect(errors).toEqual(['Error: subscriber failed'])
    expect(tasks.getTask(task.id)!.title).toBe('Still committed')
  })

  it('supports direct publish, clear and listenerCount', () => {
    const bus = new EventBus()
    const seen: number[] = []
    bus.subscribe(entry => seen.push(entry.seq))
    bus.publish({ seq: 9, event: { type: 'task/created', taskId: 'task-9' as never, title: 'x', priority: 'normal', createdBy: CEO, occurredAt: 'now' } })
    expect(seen).toEqual([9])
    bus.clear()
    expect(bus.listenerCount).toBe(0)
  })

  it('exposes the bus from the service', () => {
    const bus = new EventBus()
    const tasks = makeService({ bus })
    expect(tasks.eventBus).toBe(bus)
  })
})

describe('replay, restore and pure folding', () => {
  it('restores an identical projection from the event log', () => {
    const { org, tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    tasks.startTask(task.id)
    tasks.blockTask(task.id, 'Waiting')
    tasks.unblockTask(task.id)
    tasks.completeTask(task.id, { summary: 'Done' }, { actorId: ENGINEER })
    const report = tasks.submitReport(task.id, { summary: 'Report' }, { actorId: ENGINEER })
    tasks.approveReport(report.id, 'ok', { actorId: DIRECTOR })
    tasks.escalateTask(task.id, { reason: 'FYI' }, { actorId: ENGINEER })
    const approval = tasks.requestApproval({ subject: 'Publish', requestedBy: ENGINEER, approverId: DIRECTOR })
    tasks.grantApproval(approval.id)

    const restored = restoreTask(
      tasks.events().map(entry => entry.event),
      { authorizer: new OrganizationAuthorizer(org) },
    )
    expect(snapshot(restored)).toBe(snapshot(tasks))
    expect(restored.events()).toHaveLength(tasks.events().length)
  })

  it('replays a raw event list with the pure functions', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.completeTask(task.id)
    const events: TaskEvent[] = tasks.events().map(entry => entry.event)
    expect(replay(events).tasks.get(task.id)!.status).toBe('completed')
    let state = emptyState()
    for (const event of events) state = applyEvent(state, event)
    expect(state.tasks.size).toBe(1)
    expect(state.tasks.get(task.id)!.status).toBe('completed')
  })

  it('folds without validating (a corrupt log does not throw)', () => {
    const events: TaskEvent[] = [
      {
        type: 'task/completed',
        taskId: 'task-404' as never,
        completedBy: CEO,
        artifactRefs: [],
        occurredAt: 'now',
      },
    ]
    expect(replay(events).tasks.size).toBe(0)
  })

  it('does not publish replayed events on restore', () => {
    const tasks = makeService()
    const task = assigned(tasks)
    tasks.completeTask(task.id)
    const bus = new EventBus()
    let published = 0
    bus.subscribe(() => {
      published += 1
    })
    restoreTask(tasks.events().map(entry => entry.event), { bus })
    expect(published).toBe(0)
  })

  it('keeps the log append-only with monotonic positions', () => {
    const tasks = makeService()
    tasks.createTask({ title: 'One', createdBy: CEO })
    tasks.createTask({ title: 'Two', createdBy: CEO })
    expect(tasks.events().map(entry => entry.seq)).toEqual([1, 2])
    expect(tasks.events().map(entry => entry.event.type)).toEqual(['task/created', 'task/created'])
  })
})

describe('queries and stats', () => {
  it('filters tasks by assignee and creator', () => {
    const tasks = makeService()
    const first = tasks.createTask({ title: 'One', createdBy: CEO })
    tasks.assignTask(first.id, ENGINEER)
    tasks.createTask({ title: 'Two', createdBy: DIRECTOR })
    expect(tasks.tasksAssignedTo(ENGINEER).map(task => task.title)).toEqual(['One'])
    expect(tasks.tasksCreatedBy(CEO).map(task => task.title)).toEqual(['One'])
    expect(tasks.listTasks()).toHaveLength(2)
    expect(tasks.getTask('task-404' as never)).toBeUndefined()
  })

  it('reports accurate counters across the whole protocol', () => {
    const { tasks } = makeWired()
    const task = assigned(tasks, ENGINEER, { actorId: CEO })
    const blocked = assigned(tasks, ANALYST, { actorId: CEO })
    tasks.blockTask(blocked.id, 'Waiting')
    tasks.completeTask(task.id, {}, { actorId: ENGINEER })
    const report = tasks.submitReport(task.id, { summary: 'x' }, { actorId: ENGINEER })
    tasks.requestDecision({ subject: 'x', requestedBy: ENGINEER })
    tasks.requestApproval({ subject: 'x', requestedBy: ENGINEER, approverId: DIRECTOR })
    tasks.escalateTask(blocked.id, { reason: 'x' }, { actorId: ANALYST })
    const stats = tasks.getStats()
    expect(stats.taskCount).toBe(2)
    expect(stats.completedTaskCount).toBe(1)
    expect(stats.blockedTaskCount).toBe(1)
    expect(stats.openTaskCount).toBe(1)
    expect(stats.reportCount).toBe(1)
    expect(stats.pendingReportCount).toBe(1)
    expect(stats.pendingDecisionCount).toBe(1)
    expect(stats.pendingApprovalCount).toBe(1)
    expect(stats.escalationCount).toBe(1)
    expect(tasks.getReport(report.id)!.taskId).toBe(task.id)
  })

  it('exposes an immutable state view', () => {
    const tasks = makeService()
    tasks.createTask({ title: 'One', createdBy: CEO })
    expect(tasks.getState().tasks.size).toBe(1)
  })
})
