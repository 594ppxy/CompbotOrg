/**
 * Durable goal state shapes.
 *
 * Every value here is folded from events. Snapshots are immutable; a command
 * produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/goal/types
 */

import type { BotId } from '@compbotorg/organization'
import type { GoalId } from './brand'

/** Lifecycle state of a goal. */
export type GoalStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled'

/** One unit of work produced by decomposing a goal. */
export interface GoalSubtask {
  readonly title: string
  readonly assigneeHint?: string
  /** Task id linked from the organization protocol layer, if any. */
  readonly taskId?: string
}

/** One performance measurement for a Bot working on this goal. */
export interface GoalMetric {
  readonly botId: BotId
  readonly quality: number
  readonly timeliness: number
  readonly recordedAt: string
}

/** One goal and its decomposition, task links, metrics, and outcome. */
export interface GoalSnapshot {
  readonly id: GoalId
  readonly title: string
  readonly description?: string
  readonly createdBy: BotId
  readonly ownerId: BotId
  readonly status: GoalStatus
  readonly subtasks: readonly GoalSubtask[]
  readonly taskIds: readonly string[]
  readonly metrics: readonly GoalMetric[]
  readonly summary?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete folded goal state. */
export interface GoalState {
  readonly goals: ReadonlyMap<GoalId, GoalSnapshot>
}

/** Summary counters for dashboards; a plain JSON-serializable object. */
export interface GoalStats {
  readonly goalCount: number
  readonly inProgressCount: number
  readonly completedCount: number
  readonly subtaskCount: number
  readonly linkedTaskCount: number
  /** Mean quality across all metrics, rounded to two decimals. */
  readonly averageQuality: number
}
