/**
 * CompbotOrg — organization protocol (v0.2).
 *
 * This package makes the organization *work*: tasks flow down the reporting
 * line, results come back as reports, and decisions, approvals, and escalations
 * are durable domain events. It is deliberately free of any runtime, transport,
 * or UI dependency. Authorization is injected through `Authorizer`, so the same
 * core drives a standalone script and a full `OrganizationService` deployment.
 *
 * Typical use:
 *
 * ```ts
 * const tasks = new TaskService({ authorizer: new OrganizationAuthorizer(org) })
 * const task = tasks.createTask({ title: 'Ship v0.2', createdBy: CEO })
 * tasks.assignTask(task.id, ENGINEER, { actorId: CEO })
 * tasks.completeTask(task.id, { summary: 'done' }, { actorId: ENGINEER })
 * ```
 *
 * @module @compbotorg/task
 */

export {
  ApprovalId,
  DecisionId,
  EscalationId,
  ReportId,
  TaskId,
  brand,
  type Branded,
} from './brand'

export { TaskError, type TaskErrorCode } from './errors'

export type {
  ApprovalDeniedEvent,
  ApprovalGrantedEvent,
  ApprovalRequestedEvent,
  DecisionMadeEvent,
  DecisionRequestedEvent,
  LoggedEvent,
  ReportApprovedEvent,
  ReportRejectedEvent,
  ReportSubmittedEvent,
  TaskAssignedEvent,
  TaskBlockedEvent,
  TaskCancelledEvent,
  TaskClaimedEvent,
  TaskCompletedEvent,
  TaskCreatedEvent,
  TaskDelegatedEvent,
  TaskEscalatedEvent,
  TaskEvent,
  TaskEventType,
  TaskStartedEvent,
  TaskUnblockedEvent,
} from './events'

export type {
  ApprovalSnapshot,
  ApprovalStatus,
  DecisionOutcome,
  DecisionSnapshot,
  DecisionStatus,
  EscalationSnapshot,
  ReportSnapshot,
  ReportStatus,
  TaskPriority,
  TaskSnapshot,
  TaskState,
  TaskStats,
  TaskStatus,
} from './types'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryTaskStore, type TaskStore } from './store'

export {
  EventBus,
  type DomainEventListener,
  type EventBusOptions,
  type SubscribeOptions,
  type Subscription,
} from './bus'

export {
  OrganizationAuthorizer,
  PermissiveAuthorizer,
  permissiveAuthorizer,
  type Authorizer,
} from './authorizer'

export {
  TaskService,
  restoreTask,
  type CommandOptions,
  type CompleteTaskInput,
  type CreateTaskInput,
  type EscalateTaskInput,
  type MakeDecisionInput,
  type RequestApprovalInput,
  type RequestDecisionInput,
  type SubmitReportInput,
  type TaskServiceOptions,
} from './service'
