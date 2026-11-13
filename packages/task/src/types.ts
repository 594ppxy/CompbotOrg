/**
 * Durable organization protocol state shapes.
 *
 * Every value here is a snapshot folded from events. Snapshots are immutable;
 * a command produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/task/types
 */

import type { BotId } from '@compbotorg/organization'
import type { ApprovalId, DecisionId, EscalationId, ReportId, TaskId } from './brand'

/** Lifecycle of one task. */
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'

/** Urgency of one task, used for ordering and escalation decisions. */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

/** Review state of one report. */
export type ReportStatus = 'submitted' | 'approved' | 'rejected'

/** State of one decision request. */
export type DecisionStatus = 'pending' | 'made'

/** Outcome of one decision. */
export type DecisionOutcome = 'approved' | 'rejected' | 'deferred'

/** State of one approval request. */
export type ApprovalStatus = 'pending' | 'granted' | 'denied'

/** One unit of work inside the organization. */
export interface TaskSnapshot {
  readonly id: TaskId
  readonly title: string
  readonly description?: string
  readonly priority: TaskPriority
  /** Member who created the task. */
  readonly createdBy: BotId
  /** Current owner of the work, or undefined while pending. */
  readonly assigneeId?: BotId
  /** Member who performed the last assignment or delegation. */
  readonly assignedBy?: BotId
  /** Number of downward delegations performed on this task. */
  readonly delegationDepth: number
  readonly status: TaskStatus
  /** Reason the task is currently blocked. */
  readonly blocker?: string
  /** Member the task was most recently escalated to. */
  readonly escalatedTo?: BotId
  /** Artifact references attached at completion. */
  readonly artifactRefs: readonly string[]
  /** Summary supplied when the task was completed. */
  readonly completionSummary?: string
  /** Reports submitted against this task, in submission order. */
  readonly reportIds: readonly ReportId[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** One report submitted against a task. */
export interface ReportSnapshot {
  readonly id: ReportId
  readonly taskId: TaskId
  readonly authorId: BotId
  readonly summary: string
  readonly artifactRefs: readonly string[]
  readonly status: ReportStatus
  readonly reviewerId?: BotId
  readonly reviewNote?: string
  readonly submittedAt: string
  readonly reviewedAt?: string
}

/** One decision request and its resolution. */
export interface DecisionSnapshot {
  readonly id: DecisionId
  readonly subject: string
  readonly context?: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
  readonly madeBy?: BotId
  readonly outcome?: DecisionOutcome
  readonly rationale?: string
  readonly status: DecisionStatus
  readonly requestedAt: string
  readonly madeAt?: string
}

/** One approval request and its resolution. */
export interface ApprovalSnapshot {
  readonly id: ApprovalId
  readonly subject: string
  readonly taskId?: TaskId
  readonly requestedBy: BotId
  readonly approverId: BotId
  readonly status: ApprovalStatus
  readonly note?: string
  readonly requestedAt: string
  readonly resolvedAt?: string
}

/** One escalation record, preserving the reporting-line hop. */
export interface EscalationSnapshot {
  readonly id: EscalationId
  readonly taskId: TaskId
  readonly raisedBy: BotId
  readonly fromBotId: BotId
  readonly escalatedTo: BotId
  readonly reason: string
  readonly createdAt: string
}

/** Complete folded protocol state. */
export interface TaskState {
  readonly tasks: ReadonlyMap<TaskId, TaskSnapshot>
  readonly reports: ReadonlyMap<ReportId, ReportSnapshot>
  readonly decisions: ReadonlyMap<DecisionId, DecisionSnapshot>
  readonly approvals: ReadonlyMap<ApprovalId, ApprovalSnapshot>
  readonly escalations: ReadonlyMap<EscalationId, EscalationSnapshot>
}

/** Summary counters for dashboards. */
export interface TaskStats {
  readonly taskCount: number
  readonly openTaskCount: number
  readonly completedTaskCount: number
  readonly blockedTaskCount: number
  readonly reportCount: number
  readonly pendingReportCount: number
  readonly pendingDecisionCount: number
  readonly pendingApprovalCount: number
  readonly escalationCount: number
}
