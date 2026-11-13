/**
 * Organization protocol command service.
 *
 * Every public method follows the same shape: validate against the current
 * projection, append exactly one event, fold it, publish it on the event bus,
 * then return a detached view. Nothing mutates state in place.
 *
 * Authorization is a port, not ambient state: an {@link Authorizer} is injected
 * at construction. The default is permissive so the package runs standalone;
 * wiring an `OrganizationAuthorizer` makes every assignment, delegation,
 * review, approval, and escalation obey v0.1's rank × scope rules.
 *
 * @module @compbotorg/task/service
 */

import type { BotId } from '@compbotorg/organization'
import { permissiveAuthorizer, type Authorizer } from './authorizer'
import { EventBus } from './bus'
import { ApprovalId, DecisionId, EscalationId, ReportId, TaskId } from './brand'
import { TaskError } from './errors'
import type { TaskEvent, LoggedEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryTaskStore, type TaskStore } from './store'
import type {
  ApprovalSnapshot,
  DecisionOutcome,
  DecisionSnapshot,
  EscalationSnapshot,
  ReportSnapshot,
  TaskPriority,
  TaskSnapshot,
  TaskState,
  TaskStats,
} from './types'

/** Input for {@link TaskService.createTask}. */
export interface CreateTaskInput {
  readonly title: string
  readonly description?: string
  readonly priority?: TaskPriority
  readonly createdBy: BotId
}

/** Input for {@link TaskService.completeTask}. */
export interface CompleteTaskInput {
  readonly summary?: string
  readonly artifactRefs?: readonly string[]
}

/** Input for {@link TaskService.submitReport}. */
export interface SubmitReportInput {
  readonly summary: string
  readonly artifactRefs?: readonly string[]
}

/** Input for {@link TaskService.escalateTask}. */
export interface EscalateTaskInput {
  readonly reason: string
  /** Explicit target; when omitted the reporting line decides. */
  readonly toBotId?: BotId
}

/** Input for {@link TaskService.requestDecision}. */
export interface RequestDecisionInput {
  readonly subject: string
  readonly context?: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
}

/** Input for {@link TaskService.makeDecision}. */
export interface MakeDecisionInput {
  readonly outcome: DecisionOutcome
  readonly rationale: string
}

/** Input for {@link TaskService.requestApproval}. */
export interface RequestApprovalInput {
  readonly subject: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
  readonly approverId: BotId
}

/** Options accepted by mutating commands. */
export interface CommandOptions {
  /** Member issuing the command; omitted for standalone/bootstrap usage. */
  readonly actorId?: BotId
}

/** Service construction options. */
export interface TaskServiceOptions {
  /** Storage backend; defaults to an in-memory log. */
  readonly store?: TaskStore
  /** Authority source; defaults to a permissive authorizer. */
  readonly authorizer?: Authorizer
  /** Domain event bus; a private one is created when omitted. */
  readonly bus?: EventBus
  /** Clock override for deterministic tests. */
  readonly now?: () => Date
}

const MAX_TITLE_LENGTH = 200
const MAX_TEXT_LENGTH = 4_000
const MAX_REF_LENGTH = 200
const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'normal', 'high', 'urgent']
const DECISION_OUTCOMES: readonly DecisionOutcome[] = ['approved', 'rejected', 'deferred']

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new TaskError(`${field} must not be empty`, 'TASK_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new TaskError(`${field} must be at most ${max} characters`, 'TASK_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Validate one optional display string. */
function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  return requiredText(value, field, max)
}

/** Validate and copy a list of artifact references. */
function artifactRefs(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return []
  return value.map((ref, index) => requiredText(ref, `artifactRefs[${index}]`, MAX_REF_LENGTH))
}

/** Fold the stored log into current state. */
function foldStore(store: TaskStore): TaskState {
  return replay(store.readAll().map(entry => entry.event))
}

/**
 * Task, report, decision, approval, and escalation commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class TaskService {
  private readonly store: TaskStore
  private readonly authorizer: Authorizer
  private readonly bus: EventBus
  private readonly now: () => Date
  private state: TaskState

  constructor(options: TaskServiceOptions = {}) {
    this.store = options.store ?? new MemoryTaskStore()
    this.authorizer = options.authorizer ?? permissiveAuthorizer
    this.bus = options.bus ?? new EventBus()
    this.now = options.now ?? (() => new Date())
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): TaskState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedEvent[] {
    return this.store.readAll()
  }

  /** The bus that receives every committed event. */
  get eventBus(): EventBus {
    return this.bus
  }

  /** Read one task. */
  getTask(taskId: TaskId): TaskSnapshot | undefined {
    return this.state.tasks.get(taskId)
  }

  /** Every task, in creation order. */
  listTasks(): TaskSnapshot[] {
    return [...this.state.tasks.values()]
  }

  /** Tasks currently owned by one member. */
  tasksAssignedTo(botId: BotId): TaskSnapshot[] {
    return this.listTasks().filter(task => task.assigneeId === botId)
  }

  /** Tasks created by one member. */
  tasksCreatedBy(botId: BotId): TaskSnapshot[] {
    return this.listTasks().filter(task => task.createdBy === botId)
  }

  /** Read one report. */
  getReport(reportId: ReportId): ReportSnapshot | undefined {
    return this.state.reports.get(reportId)
  }

  /** Every report, in submission order. */
  listReports(): ReportSnapshot[] {
    return [...this.state.reports.values()]
  }

  /** Reports submitted against one task. */
  reportsOfTask(taskId: TaskId): ReportSnapshot[] {
    return this.listReports().filter(report => report.taskId === taskId)
  }

  /** Read one decision. */
  getDecision(decisionId: DecisionId): DecisionSnapshot | undefined {
    return this.state.decisions.get(decisionId)
  }

  /** Every decision, in request order. */
  listDecisions(): DecisionSnapshot[] {
    return [...this.state.decisions.values()]
  }

  /** Read one approval request. */
  getApproval(approvalId: ApprovalId): ApprovalSnapshot | undefined {
    return this.state.approvals.get(approvalId)
  }

  /** Every approval request, in request order. */
  listApprovals(): ApprovalSnapshot[] {
    return [...this.state.approvals.values()]
  }

  /** Approval requests waiting on one approver. */
  approvalsFor(approverId: BotId): ApprovalSnapshot[] {
    return this.listApprovals().filter(
      approval => approval.approverId === approverId && approval.status === 'pending',
    )
  }

  /** Read one escalation record. */
  getEscalation(escalationId: EscalationId): EscalationSnapshot | undefined {
    return this.state.escalations.get(escalationId)
  }

  /** Every escalation record, in creation order. */
  listEscalations(): EscalationSnapshot[] {
    return [...this.state.escalations.values()]
  }

  /** Escalations raised for one task. */
  escalationsOf(taskId: TaskId): EscalationSnapshot[] {
    return this.listEscalations().filter(escalation => escalation.taskId === taskId)
  }

  /** Summary counters. */
  getStats(): TaskStats {
    return statsOf(this.state)
  }

  // --------------------------------------------------------------- commands

  /**
   * Create a task in the `pending` state.
   * @param input - title, optional description and priority, and creator.
   * @param options - issuing actor, checked for membership activity.
   * @returns the created task.
   */
  createTask(input: CreateTaskInput, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const title = requiredText(input.title, 'task title', MAX_TITLE_LENGTH)
    const description = optionalText(input.description, 'task description', MAX_TEXT_LENGTH)
    const priority = input.priority ?? 'normal'
    if (!TASK_PRIORITIES.includes(priority)) {
      throw new TaskError(`unknown priority "${priority}"`, 'TASK_INVALID_ARGUMENT')
    }
    const taskId = TaskId(`task-${this.state.tasks.size + 1}`)
    if (this.state.tasks.has(taskId)) {
      throw new TaskError(`task "${taskId}" already exists`, 'TASK_ALREADY_EXISTS')
    }
    this.commit({
      type: 'task/created',
      taskId,
      title,
      ...(description === undefined ? {} : { description }),
      priority,
      createdBy: input.createdBy,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Assign a task to a member. The actor must be able to manage the assignee.
   * @param taskId - task to assign.
   * @param assigneeId - member receiving the work.
   * @param options - issuing actor; when supplied, `canManage` is enforced.
   * @returns the updated task.
   */
  assignTask(taskId: TaskId, assigneeId: BotId, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    this.requireOpen(task, 'assign')
    this.requireManage(options, assigneeId, 'assign task')
    if (task.status === 'assigned' && task.assigneeId === assigneeId) {
      throw new TaskError(`task "${taskId}" is already assigned to "${assigneeId}"`, 'TASK_ALREADY_ASSIGNED')
    }
    this.commit({
      type: 'task/assigned',
      taskId,
      assigneeId,
      assignedBy: options.actorId ?? task.createdBy,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Delegate an assigned task downward. The current assignee must be able to
   * manage the new assignee, so delegation always follows authority.
   * @param taskId - task to delegate.
   * @param toBotId - member receiving the delegated work.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the updated task.
   */
  delegateTask(taskId: TaskId, toBotId: BotId, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    this.requireOpen(task, 'delegate')
    const fromBotId = task.assigneeId
    if (fromBotId === undefined) {
      throw new TaskError(`task "${taskId}" has no assignee to delegate from`, 'TASK_NOT_ASSIGNED')
    }
    this.requireAssigneeActor(options, task, 'delegate task')
    if (toBotId === fromBotId) {
      throw new TaskError('cannot delegate a task to its current assignee', 'TASK_INVALID_TRANSITION')
    }
    if (!this.authorizer.isActive(toBotId) || !this.authorizer.canManage(fromBotId, toBotId)) {
      throw new TaskError(
        `assignee "${fromBotId}" cannot delegate to "${toBotId}"`,
        'TASK_PERMISSION_DENIED',
      )
    }
    this.commit({
      type: 'task/delegated',
      taskId,
      fromBotId,
      toBotId,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Claim an unassigned task. `options.actorId` is required: a claim without a
   * claimant has no meaning.
   * @param taskId - task to claim.
   * @param options - the claiming member.
   * @returns the updated task.
   */
  claimTask(taskId: TaskId, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const claimedBy = options.actorId
    if (claimedBy === undefined) {
      throw new TaskError('claimTask requires an actorId', 'TASK_INVALID_ARGUMENT')
    }
    const task = this.requireTask(taskId)
    if (task.status !== 'pending' || task.assigneeId !== undefined) {
      throw new TaskError(
        `task "${taskId}" is ${task.status} and cannot be claimed`,
        'TASK_INVALID_TRANSITION',
      )
    }
    this.commit({
      type: 'task/claimed',
      taskId,
      claimedBy,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Start work on an assigned task.
   * @param taskId - task to start.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the updated task.
   */
  startTask(taskId: TaskId, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    if (task.assigneeId === undefined) {
      throw new TaskError(`task "${taskId}" has no assignee`, 'TASK_NOT_ASSIGNED')
    }
    if (task.status !== 'assigned') {
      throw new TaskError(
        `task "${taskId}" is ${task.status}; only assigned tasks can start`,
        'TASK_INVALID_TRANSITION',
      )
    }
    this.requireAssigneeActor(options, task, 'start task')
    this.commit({
      type: 'task/started',
      taskId,
      startedBy: options.actorId ?? task.assigneeId,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Mark a task blocked with a reason.
   * @param taskId - task to block.
   * @param reason - why work cannot proceed.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the updated task.
   */
  blockTask(taskId: TaskId, reason: string, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    this.requireOpen(task, 'block')
    if (task.status === 'blocked') {
      throw new TaskError(`task "${taskId}" is already blocked`, 'TASK_INVALID_TRANSITION')
    }
    this.requireAssigneeActor(options, task, 'block task')
    const text = requiredText(reason, 'block reason', MAX_TEXT_LENGTH)
    this.commit({
      type: 'task/blocked',
      taskId,
      reason: text,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Clear a blocker and return the task to `in_progress`.
   * @param taskId - task to unblock.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the updated task.
   */
  unblockTask(taskId: TaskId, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    if (task.status !== 'blocked') {
      throw new TaskError(`task "${taskId}" is not blocked`, 'TASK_INVALID_TRANSITION')
    }
    this.requireAssigneeActor(options, task, 'unblock task')
    this.commit({
      type: 'task/unblocked',
      taskId,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Complete a task, optionally attaching a summary and artifact references.
   * @param taskId - task to complete.
   * @param input - optional summary and artifact references.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the updated task.
   */
  completeTask(
    taskId: TaskId,
    input: CompleteTaskInput = {},
    options: CommandOptions = {},
  ): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    // Terminal states are a structural impossibility, so they are reported
    // before the softer "who owns the work" checks.
    this.requireOpen(task, 'complete')
    if (task.assigneeId === undefined) {
      throw new TaskError(`task "${taskId}" has no assignee`, 'TASK_NOT_ASSIGNED')
    }
    if (task.status !== 'assigned' && task.status !== 'in_progress') {
      throw new TaskError(
        `task "${taskId}" is ${task.status}; only assigned or in-progress tasks can complete`,
        'TASK_INVALID_TRANSITION',
      )
    }
    this.requireAssigneeActor(options, task, 'complete task')
    const summary = optionalText(input.summary, 'completion summary', MAX_TEXT_LENGTH)
    const refs = artifactRefs(input.artifactRefs)
    this.commit({
      type: 'task/completed',
      taskId,
      completedBy: options.actorId ?? task.assigneeId,
      ...(summary === undefined ? {} : { summary }),
      artifactRefs: refs,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Cancel a task. The creator or a manager of the assignee may cancel.
   * @param taskId - task to cancel.
   * @param reason - why the task is being dropped.
   * @param options - issuing actor.
   * @returns the updated task.
   */
  cancelTask(taskId: TaskId, reason: string, options: CommandOptions = {}): TaskSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    if (task.status === 'cancelled' || task.status === 'completed') {
      throw new TaskError(
        `task "${taskId}" is already ${task.status}`,
        'TASK_INVALID_TRANSITION',
      )
    }
    const actorId = options.actorId
    if (actorId !== undefined && actorId !== task.createdBy) {
      const assigneeId = task.assigneeId
      if (assigneeId === undefined || !this.authorizer.canManage(actorId, assigneeId)) {
        throw new TaskError(
          `actor "${actorId}" may not cancel task "${taskId}"`,
          'TASK_PERMISSION_DENIED',
        )
      }
    }
    const text = requiredText(reason, 'cancel reason', MAX_TEXT_LENGTH)
    this.commit({
      type: 'task/cancelled',
      taskId,
      cancelledBy: actorId ?? task.createdBy,
      reason: text,
      occurredAt: this.timestamp(),
    })
    return this.state.tasks.get(taskId) as TaskSnapshot
  }

  /**
   * Escalate a task up the reporting line.
   *
   * When `toBotId` is omitted, the authorizer's manager chain is walked and the
   * first active manager able to manage the current owner is chosen. An
   * explicit target must still sit on that chain (when one exists) and be able
   * to manage the owner — nobody may escalate to someone they cannot be
   * managed by.
   *
   * @param taskId - task to escalate.
   * @param input - reason and optional explicit target.
   * @param options - issuing actor.
   * @returns the escalation record.
   */
  escalateTask(
    taskId: TaskId,
    input: EscalateTaskInput,
    options: CommandOptions = {},
  ): EscalationSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    if (task.status === 'cancelled') {
      throw new TaskError(`task "${taskId}" is cancelled`, 'TASK_INVALID_TRANSITION')
    }
    const reason = requiredText(input.reason, 'escalation reason', MAX_TEXT_LENGTH)
    const fromBotId = task.assigneeId ?? task.createdBy
    const raisedBy = options.actorId ?? fromBotId

    const chain: BotId[] = []
    const seen = new Set<BotId>([fromBotId])
    let current = this.authorizer.managerOf(fromBotId)
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      chain.push(current)
      current = this.authorizer.managerOf(current)
    }

    let target: BotId | undefined = input.toBotId
    if (target === undefined) {
      target = chain.find(
        candidate => this.authorizer.isActive(candidate) && this.authorizer.canManage(candidate, fromBotId),
      )
      if (target === undefined) {
        throw new TaskError(
          `no manager above "${fromBotId}" can receive an escalation`,
          'TASK_NO_ESCALATION_TARGET',
        )
      }
    } else if (chain.length > 0 && !chain.includes(target)) {
      throw new TaskError(
        `escalation target "${target}" is not on the reporting line above "${fromBotId}"`,
        'TASK_INVALID_ESCALATION',
      )
    }

    if (
      target === fromBotId ||
      !this.authorizer.isActive(target) ||
      !this.authorizer.canManage(target, fromBotId)
    ) {
      throw new TaskError(
        `"${target}" cannot manage "${fromBotId}"; escalation rejected`,
        'TASK_INVALID_ESCALATION',
      )
    }

    const escalationId = EscalationId(`escalation-${this.state.escalations.size + 1}`)
    this.commit({
      type: 'task/escalated',
      taskId,
      escalationId,
      raisedBy,
      fromBotId,
      escalatedTo: target,
      reason,
      occurredAt: this.timestamp(),
    })
    return this.state.escalations.get(escalationId) as EscalationSnapshot
  }

  /**
   * Submit a report against a task.
   * @param taskId - task the report belongs to.
   * @param input - report summary and optional artifact references.
   * @param options - issuing actor; the assignee or one of its managers.
   * @returns the submitted report.
   */
  submitReport(
    taskId: TaskId,
    input: SubmitReportInput,
    options: CommandOptions = {},
  ): ReportSnapshot {
    this.requireActorActive(options)
    const task = this.requireTask(taskId)
    if (task.status === 'cancelled') {
      throw new TaskError(`task "${taskId}" is cancelled`, 'TASK_INVALID_TRANSITION')
    }
    if (task.assigneeId === undefined) {
      throw new TaskError(`task "${taskId}" has no assignee`, 'TASK_NOT_ASSIGNED')
    }
    this.requireAssigneeActor(options, task, 'submit report')
    const summary = requiredText(input.summary, 'report summary', MAX_TEXT_LENGTH)
    const refs = artifactRefs(input.artifactRefs)
    const authorId = options.actorId ?? task.assigneeId
    const reportId = ReportId(`report-${this.state.reports.size + 1}`)
    this.commit({
      type: 'report/submitted',
      reportId,
      taskId,
      authorId,
      summary,
      artifactRefs: refs,
      occurredAt: this.timestamp(),
    })
    return this.state.reports.get(reportId) as ReportSnapshot
  }

  /**
   * Approve a submitted report. The reviewer must be able to manage the
   * report's author; when no actor is supplied the author's manager is used.
   * @param reportId - report to approve.
   * @param note - optional review note.
   * @param options - issuing actor.
   * @returns the reviewed report.
   */
  approveReport(
    reportId: ReportId,
    note?: string,
    options: CommandOptions = {},
  ): ReportSnapshot {
    this.requireActorActive(options)
    const report = this.requireReport(reportId)
    this.requireReportPending(report)
    const reviewerId = this.resolveReviewer(report.authorId, options, 'approve report')
    const text = optionalText(note, 'review note', MAX_TEXT_LENGTH)
    this.commit({
      type: 'report/approved',
      reportId,
      reviewerId,
      ...(text === undefined ? {} : { note: text }),
      occurredAt: this.timestamp(),
    })
    return this.state.reports.get(reportId) as ReportSnapshot
  }

  /**
   * Reject a submitted report with a required note.
   * @param reportId - report to reject.
   * @param note - why the report was rejected.
   * @param options - issuing actor.
   * @returns the reviewed report.
   */
  rejectReport(reportId: ReportId, note: string, options: CommandOptions = {}): ReportSnapshot {
    this.requireActorActive(options)
    const report = this.requireReport(reportId)
    this.requireReportPending(report)
    const reviewerId = this.resolveReviewer(report.authorId, options, 'reject report')
    const text = requiredText(note, 'rejection note', MAX_TEXT_LENGTH)
    this.commit({
      type: 'report/rejected',
      reportId,
      reviewerId,
      note: text,
      occurredAt: this.timestamp(),
    })
    return this.state.reports.get(reportId) as ReportSnapshot
  }

  /**
   * Request a decision from the organization.
   * @param input - subject, optional context and task reference, requester.
   * @param options - issuing actor.
   * @returns the pending decision.
   */
  requestDecision(input: RequestDecisionInput, options: CommandOptions = {}): DecisionSnapshot {
    this.requireActorActive(options)
    const subject = requiredText(input.subject, 'decision subject', MAX_TITLE_LENGTH)
    const context = optionalText(input.context, 'decision context', MAX_TEXT_LENGTH)
    if (input.taskId !== undefined) this.requireTask(input.taskId)
    const requestedBy = input.requestedBy
    if (options.actorId !== undefined && options.actorId !== requestedBy) {
      this.requireManage(options, requestedBy, 'request decision')
    }
    const decisionId = DecisionId(`decision-${this.state.decisions.size + 1}`)
    this.commit({
      type: 'decision/requested',
      decisionId,
      subject,
      ...(context === undefined ? {} : { context }),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      requestedBy,
      occurredAt: this.timestamp(),
    })
    return this.state.decisions.get(decisionId) as DecisionSnapshot
  }

  /**
   * Record a decision on a pending request.
   * @param decisionId - decision request to resolve.
   * @param input - outcome and rationale.
   * @param options - issuing actor; defaults to the requester's manager.
   * @returns the resolved decision.
   */
  makeDecision(
    decisionId: DecisionId,
    input: MakeDecisionInput,
    options: CommandOptions = {},
  ): DecisionSnapshot {
    this.requireActorActive(options)
    const decision = this.requireDecision(decisionId)
    if (decision.status !== 'pending') {
      throw new TaskError(`decision "${decisionId}" is already made`, 'DECISION_INVALID_TRANSITION')
    }
    if (!DECISION_OUTCOMES.includes(input.outcome)) {
      throw new TaskError(`unknown decision outcome "${input.outcome}"`, 'TASK_INVALID_ARGUMENT')
    }
    const rationale = requiredText(input.rationale, 'decision rationale', MAX_TEXT_LENGTH)
    const madeBy = this.resolveDecisionMaker(decision.requestedBy, options)
    this.commit({
      type: 'decision/made',
      decisionId,
      madeBy,
      outcome: input.outcome,
      rationale,
      occurredAt: this.timestamp(),
    })
    return this.state.decisions.get(decisionId) as DecisionSnapshot
  }

  /**
   * Request approval from a named approver.
   * @param input - subject, optional task reference, requester, and approver.
   * @param options - issuing actor.
   * @returns the pending approval.
   */
  requestApproval(input: RequestApprovalInput, options: CommandOptions = {}): ApprovalSnapshot {
    this.requireActorActive(options)
    const subject = requiredText(input.subject, 'approval subject', MAX_TITLE_LENGTH)
    if (input.taskId !== undefined) this.requireTask(input.taskId)
    const requestedBy = input.requestedBy
    if (options.actorId !== undefined && options.actorId !== requestedBy) {
      this.requireManage(options, requestedBy, 'request approval')
    }
    if (!this.authorizer.isActive(input.approverId)) {
      throw new TaskError(`approver "${input.approverId}" is not active`, 'APPROVAL_PERMISSION_DENIED')
    }
    if (input.approverId === requestedBy) {
      throw new TaskError('a member cannot approve its own request', 'APPROVAL_PERMISSION_DENIED')
    }
    if (!this.authorizer.canManage(input.approverId, requestedBy)) {
      throw new TaskError(
        `approver "${input.approverId}" cannot manage requester "${requestedBy}"`,
        'APPROVAL_PERMISSION_DENIED',
      )
    }
    const approvalId = ApprovalId(`approval-${this.state.approvals.size + 1}`)
    this.commit({
      type: 'approval/requested',
      approvalId,
      subject,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      requestedBy,
      approverId: input.approverId,
      occurredAt: this.timestamp(),
    })
    return this.state.approvals.get(approvalId) as ApprovalSnapshot
  }

  /**
   * Grant a pending approval.
   * @param approvalId - approval to grant.
   * @param note - optional decision note.
   * @param options - issuing actor; defaults to the designated approver.
   * @returns the resolved approval.
   */
  grantApproval(
    approvalId: ApprovalId,
    note?: string,
    options: CommandOptions = {},
  ): ApprovalSnapshot {
    this.requireActorActive(options)
    const approval = this.requireApproval(approvalId)
    this.requireApprovalPending(approval)
    const decidedBy = this.resolveApprover(approval, options, 'grant approval')
    const text = optionalText(note, 'approval note', MAX_TEXT_LENGTH)
    this.commit({
      type: 'approval/granted',
      approvalId,
      decidedBy,
      ...(text === undefined ? {} : { note: text }),
      occurredAt: this.timestamp(),
    })
    return this.state.approvals.get(approvalId) as ApprovalSnapshot
  }

  /**
   * Deny a pending approval with a required note.
   * @param approvalId - approval to deny.
   * @param note - why the approval was denied.
   * @param options - issuing actor; defaults to the designated approver.
   * @returns the resolved approval.
   */
  denyApproval(
    approvalId: ApprovalId,
    note: string,
    options: CommandOptions = {},
  ): ApprovalSnapshot {
    this.requireActorActive(options)
    const approval = this.requireApproval(approvalId)
    this.requireApprovalPending(approval)
    const decidedBy = this.resolveApprover(approval, options, 'deny approval')
    const text = requiredText(note, 'denial note', MAX_TEXT_LENGTH)
    this.commit({
      type: 'approval/denied',
      approvalId,
      decidedBy,
      note: text,
      occurredAt: this.timestamp(),
    })
    return this.state.approvals.get(approvalId) as ApprovalSnapshot
  }

  // --------------------------------------------------------------- internals

  /** Append one event, fold it, and publish it. */
  private commit(event: TaskEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.bus.publish(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Require a supplied actor to be active in the authority source. */
  private requireActorActive(options: CommandOptions): void {
    const actorId = options.actorId
    if (actorId === undefined) return
    if (!this.authorizer.isActive(actorId)) {
      throw new TaskError(`actor "${actorId}" is not an active member`, 'TASK_PERMISSION_DENIED')
    }
  }

  /** Require the actor to be able to manage a target, when an actor is given. */
  private requireManage(options: CommandOptions, targetId: BotId, action: string): void {
    const actorId = options.actorId
    if (actorId === undefined || actorId === targetId) return
    if (!this.authorizer.canManage(actorId, targetId)) {
      throw new TaskError(
        `actor "${actorId}" cannot manage "${targetId}" for ${action}`,
        'TASK_PERMISSION_DENIED',
      )
    }
  }

  /** Require the actor to be the task's assignee or one of its managers. */
  private requireAssigneeActor(options: CommandOptions, task: TaskSnapshot, action: string): void {
    const actorId = options.actorId
    if (actorId === undefined) return
    const assigneeId = task.assigneeId
    if (assigneeId === undefined) return
    if (actorId === assigneeId) return
    if (this.authorizer.canManage(actorId, assigneeId)) return
    throw new TaskError(
      `actor "${actorId}" is neither the assignee nor a manager of "${assigneeId}" (${action})`,
      'TASK_PERMISSION_DENIED',
    )
  }

  /** Require a task to exist. */
  private requireTask(taskId: TaskId): TaskSnapshot {
    const task = this.state.tasks.get(taskId)
    if (task === undefined) {
      throw new TaskError(`task "${taskId}" not found`, 'TASK_NOT_FOUND')
    }
    return task
  }

  /** Require a task to still be open for work. */
  private requireOpen(task: TaskSnapshot, action: string): void {
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new TaskError(
        `task "${task.id}" is ${task.status}; cannot ${action}`,
        'TASK_INVALID_TRANSITION',
      )
    }
  }

  /** Require a report to exist. */
  private requireReport(reportId: ReportId): ReportSnapshot {
    const report = this.state.reports.get(reportId)
    if (report === undefined) {
      throw new TaskError(`report "${reportId}" not found`, 'REPORT_NOT_FOUND')
    }
    return report
  }

  /** Require a report to still await review. */
  private requireReportPending(report: ReportSnapshot): void {
    if (report.status !== 'submitted') {
      throw new TaskError(`report "${report.id}" is already ${report.status}`, 'REPORT_INVALID_TRANSITION')
    }
  }

  /** Require a decision to exist. */
  private requireDecision(decisionId: DecisionId): DecisionSnapshot {
    const decision = this.state.decisions.get(decisionId)
    if (decision === undefined) {
      throw new TaskError(`decision "${decisionId}" not found`, 'DECISION_NOT_FOUND')
    }
    return decision
  }

  /** Require an approval to exist. */
  private requireApproval(approvalId: ApprovalId): ApprovalSnapshot {
    const approval = this.state.approvals.get(approvalId)
    if (approval === undefined) {
      throw new TaskError(`approval "${approvalId}" not found`, 'APPROVAL_NOT_FOUND')
    }
    return approval
  }

  /** Require an approval to still be pending. */
  private requireApprovalPending(approval: ApprovalSnapshot): void {
    if (approval.status !== 'pending') {
      throw new TaskError(
        `approval "${approval.id}" is already ${approval.status}`,
        'APPROVAL_INVALID_TRANSITION',
      )
    }
  }

  /** Resolve who reviews a report, enforcing the manage relation. */
  private resolveReviewer(
    authorId: BotId,
    options: CommandOptions,
    action: string,
  ): BotId {
    const reviewerId = options.actorId ?? this.authorizer.managerOf(authorId)
    if (reviewerId === undefined) {
      throw new TaskError(`${action} requires an actorId`, 'REPORT_PERMISSION_DENIED')
    }
    if (reviewerId === authorId) {
      throw new TaskError('a report cannot be reviewed by its own author', 'REPORT_PERMISSION_DENIED')
    }
    if (!this.authorizer.isActive(reviewerId)) {
      throw new TaskError(`reviewer "${reviewerId}" is not active`, 'REPORT_PERMISSION_DENIED')
    }
    if (!this.authorizer.canManage(reviewerId, authorId)) {
      throw new TaskError(
        `reviewer "${reviewerId}" cannot manage author "${authorId}"`,
        'REPORT_PERMISSION_DENIED',
      )
    }
    return reviewerId
  }

  /** Resolve who makes a decision, defaulting to the requester's manager. */
  private resolveDecisionMaker(requestedBy: BotId, options: CommandOptions): BotId {
    const madeBy = options.actorId ?? this.authorizer.managerOf(requestedBy) ?? requestedBy
    if (!this.authorizer.isActive(madeBy)) {
      throw new TaskError(`decision maker "${madeBy}" is not active`, 'DECISION_PERMISSION_DENIED')
    }
    if (madeBy !== requestedBy && !this.authorizer.canManage(madeBy, requestedBy)) {
      throw new TaskError(
        `"${madeBy}" cannot decide for "${requestedBy}"`,
        'DECISION_PERMISSION_DENIED',
      )
    }
    return madeBy
  }

  /** Resolve who resolves an approval, defaulting to the designated approver. */
  private resolveApprover(
    approval: ApprovalSnapshot,
    options: CommandOptions,
    action: string,
  ): BotId {
    const decidedBy = options.actorId ?? approval.approverId
    if (!this.authorizer.isActive(decidedBy)) {
      throw new TaskError(`approver "${decidedBy}" is not active`, 'APPROVAL_PERMISSION_DENIED')
    }
    if (
      decidedBy !== approval.approverId &&
      !this.authorizer.canManage(decidedBy, approval.approverId)
    ) {
      throw new TaskError(
        `"${decidedBy}" is not the designated approver for ${action}`,
        'APPROVAL_PERMISSION_DENIED',
      )
    }
    return decidedBy
  }
}

/**
 * Create a service and replay an existing log.
 * @param events - previously persisted events.
 * @param options - authorizer, clock, and bus overrides.
 * @returns a service whose projection reflects the log.
 */
export function restoreTask(
  events: readonly TaskEvent[],
  options: TaskServiceOptions = {},
): TaskService {
  const store = new MemoryTaskStore()
  for (const event of events) store.append(event)
  return new TaskService({ ...options, store })
}

