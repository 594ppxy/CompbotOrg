/**
 * Durable goal events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends exactly one event. Replaying the log in
 * order reproduces the projection, which makes goal decomposition, delegation
 * and performance evaluation auditable and restorable.
 *
 * @module @compbotorg/goal/events
 */

import type { BotId } from '@compbotorg/organization'
import type { GoalId } from './brand'
import type { GoalStatus, GoalSubtask } from './types'

/** Event appended when a goal is created in `draft` state. */
export interface GoalCreatedEvent {
  readonly type: 'goal/created'
  readonly goalId: GoalId
  readonly title: string
  readonly description?: string
  readonly createdBy: BotId
  readonly ownerId: BotId
  readonly occurredAt: string
}

/** Event appended when a goal is broken into subtasks and started. */
export interface GoalDecomposedEvent {
  readonly type: 'goal/decomposed'
  readonly goalId: GoalId
  readonly subtasks: readonly GoalSubtask[]
  readonly decomposedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a task from the protocol layer is linked to a goal. */
export interface GoalTaskLinkedEvent {
  readonly type: 'goal/task-linked'
  readonly goalId: GoalId
  readonly taskId: string
  readonly subtaskIndex?: number
  readonly linkedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Bot's performance is measured. */
export interface GoalMetricRecordedEvent {
  readonly type: 'goal/metric-recorded'
  readonly goalId: GoalId
  readonly botId: BotId
  readonly quality: number
  readonly timeliness: number
  readonly recordedBy: BotId
  readonly occurredAt: string
}

/** Event appended for an explicit lifecycle change (e.g. cancellation). */
export interface GoalStatusChangedEvent {
  readonly type: 'goal/status-changed'
  readonly goalId: GoalId
  readonly status: GoalStatus
  readonly changedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a goal is completed with an optional summary. */
export interface GoalCompletedEvent {
  readonly type: 'goal/completed'
  readonly goalId: GoalId
  readonly summary?: string
  readonly completedBy: BotId
  readonly occurredAt: string
}

/** Every durable goal event. */
export type GoalEvent =
  | GoalCreatedEvent
  | GoalDecomposedEvent
  | GoalTaskLinkedEvent
  | GoalMetricRecordedEvent
  | GoalStatusChangedEvent
  | GoalCompletedEvent

/** Discriminant of {@link GoalEvent}. */
export type GoalEventType = GoalEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedGoalEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: GoalEvent
}

/** Alias matching the generic `LoggedXEvent` name in the unified contract. */
export type LoggedEvent = LoggedGoalEvent
