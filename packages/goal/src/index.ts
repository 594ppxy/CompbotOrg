/**
 * CompbotOrg — Goal Decomposition and Performance (v0.9).
 *
 * A user states a goal; the organization decomposes it into subtasks, links
 * those to protocol-layer Tasks, executes them, and records performance. Every
 * step is a durable event, so the whole autonomous loop is auditable and
 * restorable. The package has no runtime, transport, or UI dependency: it
 * only brands Bot identities owned by `@compbotorg/organization`.
 *
 * Typical use:
 *
 * ```ts
 * const goals = new GoalService({ now })
 * const goal = goals.createGoal({ title: 'Research competitor pricing',
 *   createdBy: CEO, ownerId: COO })
 * goals.decompose(goal.id, { subtasks: [{ title: 'Collect prices' }], decomposedBy: COO })
 * goals.completeGoal(goal.id, { completedBy: CEO, summary: 'Report delivered' })
 * ```
 *
 * @module @compbotorg/goal/index
 */

export { GoalId, brand, type Branded } from './brand'

export { GoalError, type GoalErrorCode } from './errors'

export type {
  GoalCompletedEvent,
  GoalCreatedEvent,
  GoalDecomposedEvent,
  GoalEvent,
  GoalEventType,
  GoalMetricRecordedEvent,
  GoalStatusChangedEvent,
  GoalTaskLinkedEvent,
  LoggedEvent,
  LoggedGoalEvent,
} from './events'

export type {
  GoalMetric,
  GoalSnapshot,
  GoalState,
  GoalStats,
  GoalStatus,
  GoalSubtask,
} from './types'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryGoalStore, type GoalStore } from './store'

export {
  GoalService,
  restoreGoal,
  type CancelGoalInput,
  type CompleteGoalInput,
  type CreateGoalInput,
  type DecomposeGoalInput,
  type GoalServiceOptions,
  type LinkTaskInput,
  type RecordMetricInput,
} from './service'
