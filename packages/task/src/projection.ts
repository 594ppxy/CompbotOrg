/**
 * Event folding into organization protocol state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/task/projection
 */

import type { ApprovalId, DecisionId, EscalationId, ReportId, TaskId } from './brand'
import type { TaskEvent } from './events'
import type {
  ApprovalSnapshot,
  DecisionSnapshot,
  EscalationSnapshot,
  ReportSnapshot,
  TaskSnapshot,
  TaskState,
  TaskStats,
} from './types'

/** The empty state a fold starts from. */
export function emptyState(): TaskState {
  return {
    tasks: new Map(),
    reports: new Map(),
    decisions: new Map(),
    approvals: new Map(),
    escalations: new Map(),
  }
}

/** Replace one task while preserving map identity semantics. */
function withTask(
  tasks: ReadonlyMap<TaskId, TaskSnapshot>,
  taskId: TaskId,
  next: TaskSnapshot,
): ReadonlyMap<TaskId, TaskSnapshot> {
  const copy = new Map(tasks)
  copy.set(taskId, next)
  return copy
}

/** Replace one report while preserving map identity semantics. */
function withReport(
  reports: ReadonlyMap<ReportId, ReportSnapshot>,
  reportId: ReportId,
  next: ReportSnapshot,
): ReadonlyMap<ReportId, ReportSnapshot> {
  const copy = new Map(reports)
  copy.set(reportId, next)
  return copy
}

/** Replace one decision while preserving map identity semantics. */
function withDecision(
  decisions: ReadonlyMap<DecisionId, DecisionSnapshot>,
  decisionId: DecisionId,
  next: DecisionSnapshot,
): ReadonlyMap<DecisionId, DecisionSnapshot> {
  const copy = new Map(decisions)
  copy.set(decisionId, next)
  return copy
}

/** Replace one approval while preserving map identity semantics. */
function withApproval(
  approvals: ReadonlyMap<ApprovalId, ApprovalSnapshot>,
  approvalId: ApprovalId,
  next: ApprovalSnapshot,
): ReadonlyMap<ApprovalId, ApprovalSnapshot> {
  const copy = new Map(approvals)
  copy.set(approvalId, next)
  return copy
}

/** Patch one task if it exists, otherwise return the unchanged state. */
function patchTask(
  state: TaskState,
  taskId: TaskId,
  patch: (task: TaskSnapshot) => TaskSnapshot,
): TaskState {
  const task = state.tasks.get(taskId)
  if (task === undefined) return state
  return { ...state, tasks: withTask(state.tasks, taskId, patch(task)) }
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: TaskState, event: TaskEvent): TaskState {
  switch (event.type) {
    case 'task/created': {
      const task: TaskSnapshot = {
        id: event.taskId,
        title: event.title,
        ...(event.description === undefined ? {} : { description: event.description }),
        priority: event.priority,
        createdBy: event.createdBy,
        delegationDepth: 0,
        status: 'pending',
        artifactRefs: [],
        reportIds: [],
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { ...state, tasks: withTask(state.tasks, event.taskId, task) }
    }

    case 'task/assigned': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        assigneeId: event.assigneeId,
        assignedBy: event.assignedBy,
        status: 'assigned',
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/delegated': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        assigneeId: event.toBotId,
        assignedBy: event.fromBotId,
        delegationDepth: task.delegationDepth + 1,
        status: 'assigned',
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/claimed': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        assigneeId: event.claimedBy,
        status: 'assigned',
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/started': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        status: 'in_progress',
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/blocked': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        status: 'blocked',
        blocker: event.reason,
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/unblocked': {
      return patchTask(state, event.taskId, task => {
        const { blocker: _previous, ...rest } = task
        return { ...rest, status: 'in_progress', updatedAt: event.occurredAt }
      })
    }

    case 'task/completed': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        status: 'completed',
        artifactRefs: event.artifactRefs,
        ...(event.summary === undefined ? {} : { completionSummary: event.summary }),
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/cancelled': {
      return patchTask(state, event.taskId, task => ({
        ...task,
        status: 'cancelled',
        updatedAt: event.occurredAt,
      }))
    }

    case 'task/escalated': {
      const escalation: EscalationSnapshot = {
        id: event.escalationId,
        taskId: event.taskId,
        raisedBy: event.raisedBy,
        fromBotId: event.fromBotId,
        escalatedTo: event.escalatedTo,
        reason: event.reason,
        createdAt: event.occurredAt,
      }
      const escalations = new Map(state.escalations)
      escalations.set(event.escalationId, escalation)
      const next = patchTask(state, event.taskId, task => ({
        ...task,
        escalatedTo: event.escalatedTo,
        updatedAt: event.occurredAt,
      }))
      return { ...next, escalations }
    }

    case 'report/submitted': {
      const report: ReportSnapshot = {
        id: event.reportId,
        taskId: event.taskId,
        authorId: event.authorId,
        summary: event.summary,
        artifactRefs: event.artifactRefs,
        status: 'submitted',
        submittedAt: event.occurredAt,
      }
      const next = patchTask(state, event.taskId, task => ({
        ...task,
        reportIds: [...task.reportIds, event.reportId],
        updatedAt: event.occurredAt,
      }))
      return { ...next, reports: withReport(next.reports, event.reportId, report) }
    }

    case 'report/approved': {
      const current = state.reports.get(event.reportId)
      if (current === undefined) return state
      return {
        ...state,
        reports: withReport(state.reports, event.reportId, {
          ...current,
          status: 'approved',
          reviewerId: event.reviewerId,
          ...(event.note === undefined ? {} : { reviewNote: event.note }),
          reviewedAt: event.occurredAt,
        }),
      }
    }

    case 'report/rejected': {
      const current = state.reports.get(event.reportId)
      if (current === undefined) return state
      return {
        ...state,
        reports: withReport(state.reports, event.reportId, {
          ...current,
          status: 'rejected',
          reviewerId: event.reviewerId,
          reviewNote: event.note,
          reviewedAt: event.occurredAt,
        }),
      }
    }

    case 'decision/requested': {
      const decision: DecisionSnapshot = {
        id: event.decisionId,
        subject: event.subject,
        ...(event.context === undefined ? {} : { context: event.context }),
        ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
        requestedBy: event.requestedBy,
        status: 'pending',
        requestedAt: event.occurredAt,
      }
      return {
        ...state,
        decisions: withDecision(state.decisions, event.decisionId, decision),
      }
    }

    case 'decision/made': {
      const current = state.decisions.get(event.decisionId)
      if (current === undefined) return state
      return {
        ...state,
        decisions: withDecision(state.decisions, event.decisionId, {
          ...current,
          status: 'made',
          madeBy: event.madeBy,
          outcome: event.outcome,
          rationale: event.rationale,
          madeAt: event.occurredAt,
        }),
      }
    }

    case 'approval/requested': {
      const approval: ApprovalSnapshot = {
        id: event.approvalId,
        subject: event.subject,
        ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
        requestedBy: event.requestedBy,
        approverId: event.approverId,
        status: 'pending',
        requestedAt: event.occurredAt,
      }
      return {
        ...state,
        approvals: withApproval(state.approvals, event.approvalId, approval),
      }
    }

    case 'approval/granted': {
      const current = state.approvals.get(event.approvalId)
      if (current === undefined) return state
      return {
        ...state,
        approvals: withApproval(state.approvals, event.approvalId, {
          ...current,
          status: 'granted',
          ...(event.note === undefined ? {} : { note: event.note }),
          resolvedAt: event.occurredAt,
        }),
      }
    }

    case 'approval/denied': {
      const current = state.approvals.get(event.approvalId)
      if (current === undefined) return state
      return {
        ...state,
        approvals: withApproval(state.approvals, event.approvalId, {
          ...current,
          status: 'denied',
          note: event.note,
          resolvedAt: event.occurredAt,
        }),
      }
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly TaskEvent[]): TaskState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded protocol state.
 * @returns summary counters.
 */
export function statsOf(state: TaskState): TaskStats {
  const tasks = [...state.tasks.values()]
  const reports = [...state.reports.values()]
  const decisions = [...state.decisions.values()]
  const approvals = [...state.approvals.values()]
  return {
    taskCount: tasks.length,
    openTaskCount: tasks.filter(
      task => task.status !== 'completed' && task.status !== 'cancelled',
    ).length,
    completedTaskCount: tasks.filter(task => task.status === 'completed').length,
    blockedTaskCount: tasks.filter(task => task.status === 'blocked').length,
    reportCount: reports.length,
    pendingReportCount: reports.filter(report => report.status === 'submitted').length,
    pendingDecisionCount: decisions.filter(decision => decision.status === 'pending').length,
    pendingApprovalCount: approvals.filter(approval => approval.status === 'pending').length,
    escalationCount: state.escalations.size,
  }
}
