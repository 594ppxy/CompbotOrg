/**
 * Durable organization protocol events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends exactly one event. Replaying the log in
 * order reproduces the projection, which is what makes work inside the
 * organization auditable and restorable.
 *
 * @module @compbotorg/task/events
 */

import type { BotId } from '@compbotorg/organization'
import type { ApprovalId, DecisionId, EscalationId, ReportId, TaskId } from './brand'
import type { DecisionOutcome, TaskPriority } from './types'

/** Event appended when a task is created. */
export interface TaskCreatedEvent {
  readonly type: 'task/created'
  readonly taskId: TaskId
  readonly title: string
  readonly description?: string
  readonly priority: TaskPriority
  readonly createdBy: BotId
  readonly occurredAt: string
}

/** Event appended when a task is assigned to a member. */
export interface TaskAssignedEvent {
  readonly type: 'task/assigned'
  readonly taskId: TaskId
  readonly assigneeId: BotId
  readonly assignedBy: BotId
  readonly occurredAt: string
}

/** Event appended when an assignee delegates a task downward. */
export interface TaskDelegatedEvent {
  readonly type: 'task/delegated'
  readonly taskId: TaskId
  readonly fromBotId: BotId
  readonly toBotId: BotId
  readonly occurredAt: string
}

/** Event appended when a member claims an unassigned task. */
export interface TaskClaimedEvent {
  readonly type: 'task/claimed'
  readonly taskId: TaskId
  readonly claimedBy: BotId
  readonly occurredAt: string
}

/** Event appended when work on a task starts. */
export interface TaskStartedEvent {
  readonly type: 'task/started'
  readonly taskId: TaskId
  readonly startedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a task is blocked. */
export interface TaskBlockedEvent {
  readonly type: 'task/blocked'
  readonly taskId: TaskId
  readonly reason: string
  readonly occurredAt: string
}

/** Event appended when a blocked task is unblocked. */
export interface TaskUnblockedEvent {
  readonly type: 'task/unblocked'
  readonly taskId: TaskId
  readonly occurredAt: string
}

/** Event appended when a task is completed. */
export interface TaskCompletedEvent {
  readonly type: 'task/completed'
  readonly taskId: TaskId
  readonly completedBy: BotId
  readonly summary?: string
  readonly artifactRefs: readonly string[]
  readonly occurredAt: string
}

/** Event appended when a task is cancelled. */
export interface TaskCancelledEvent {
  readonly type: 'task/cancelled'
  readonly taskId: TaskId
  readonly cancelledBy: BotId
  readonly reason: string
  readonly occurredAt: string
}

/** Event appended when a task is escalated up the reporting line. */
export interface TaskEscalatedEvent {
  readonly type: 'task/escalated'
  readonly taskId: TaskId
  readonly escalationId: EscalationId
  readonly raisedBy: BotId
  readonly fromBotId: BotId
  readonly escalatedTo: BotId
  readonly reason: string
  readonly occurredAt: string
}

/** Event appended when a report is submitted for a task. */
export interface ReportSubmittedEvent {
  readonly type: 'report/submitted'
  readonly reportId: ReportId
  readonly taskId: TaskId
  readonly authorId: BotId
  readonly summary: string
  readonly artifactRefs: readonly string[]
  readonly occurredAt: string
}

/** Event appended when a report is approved by a reviewer. */
export interface ReportApprovedEvent {
  readonly type: 'report/approved'
  readonly reportId: ReportId
  readonly reviewerId: BotId
  readonly note?: string
  readonly occurredAt: string
}

/** Event appended when a report is rejected by a reviewer. */
export interface ReportRejectedEvent {
  readonly type: 'report/rejected'
  readonly reportId: ReportId
  readonly reviewerId: BotId
  readonly note: string
  readonly occurredAt: string
}

/** Event appended when a decision is requested. */
export interface DecisionRequestedEvent {
  readonly type: 'decision/requested'
  readonly decisionId: DecisionId
  readonly subject: string
  readonly context?: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a decision is made. */
export interface DecisionMadeEvent {
  readonly type: 'decision/made'
  readonly decisionId: DecisionId
  readonly madeBy: BotId
  readonly outcome: DecisionOutcome
  readonly rationale: string
  readonly occurredAt: string
}

/** Event appended when an approval is requested. */
export interface ApprovalRequestedEvent {
  readonly type: 'approval/requested'
  readonly approvalId: ApprovalId
  readonly subject: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
  readonly approverId: BotId
  readonly occurredAt: string
}

/** Event appended when an approval is granted. */
export interface ApprovalGrantedEvent {
  readonly type: 'approval/granted'
  readonly approvalId: ApprovalId
  readonly decidedBy: BotId
  readonly note?: string
  readonly occurredAt: string
}

/** Event appended when an approval is denied. */
export interface ApprovalDeniedEvent {
  readonly type: 'approval/denied'
  readonly approvalId: ApprovalId
  readonly decidedBy: BotId
  readonly note: string
  readonly occurredAt: string
}

/** Every durable organization protocol event. */
export type TaskEvent =
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskDelegatedEvent
  | TaskClaimedEvent
  | TaskStartedEvent
  | TaskBlockedEvent
  | TaskUnblockedEvent
  | TaskCompletedEvent
  | TaskCancelledEvent
  | TaskEscalatedEvent
  | ReportSubmittedEvent
  | ReportApprovedEvent
  | ReportRejectedEvent
  | DecisionRequestedEvent
  | DecisionMadeEvent
  | ApprovalRequestedEvent
  | ApprovalGrantedEvent
  | ApprovalDeniedEvent

/** Discriminant of {@link TaskEvent}. */
export type TaskEventType = TaskEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: TaskEvent
}
