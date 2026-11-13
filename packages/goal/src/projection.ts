/**
 * Event folding into goal state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/goal/projection
 */

import type { GoalId } from './brand'
import type { GoalEvent } from './events'
import type { GoalSnapshot, GoalState, GoalStats } from './types'

/** Round a mean score to two decimals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** The empty state a fold starts from. */
export function emptyState(): GoalState {
  return { goals: new Map() }
}

/** Replace one goal while preserving map identity semantics. */
function withGoal(
  goals: ReadonlyMap<GoalId, GoalSnapshot>,
  goalId: GoalId,
  goal: GoalSnapshot,
): ReadonlyMap<GoalId, GoalSnapshot> {
  const copy = new Map(goals)
  copy.set(goalId, goal)
  return copy
}

/** Patch one goal if it exists, otherwise return the unchanged state. */
function patchGoal(
  state: GoalState,
  goalId: GoalId,
  patch: (goal: GoalSnapshot) => GoalSnapshot,
): GoalState {
  const goal = state.goals.get(goalId)
  if (goal === undefined) return state
  return { ...state, goals: withGoal(state.goals, goalId, patch(goal)) }
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: GoalState, event: GoalEvent): GoalState {
  switch (event.type) {
    case 'goal/created': {
      const goal: GoalSnapshot = {
        id: event.goalId,
        title: event.title,
        ...(event.description === undefined ? {} : { description: event.description }),
        createdBy: event.createdBy,
        ownerId: event.ownerId,
        status: 'draft',
        subtasks: [],
        taskIds: [],
        metrics: [],
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { ...state, goals: withGoal(state.goals, event.goalId, goal) }
    }

    case 'goal/decomposed': {
      return patchGoal(state, event.goalId, goal => ({
        ...goal,
        subtasks: event.subtasks.map(subtask => ({ ...subtask })),
        status: 'in_progress',
        updatedAt: event.occurredAt,
      }))
    }

    case 'goal/task-linked': {
      return patchGoal(state, event.goalId, goal => {
        const subtasks =
          event.subtaskIndex === undefined
            ? goal.subtasks
            : goal.subtasks.map((subtask, index) =>
                index === event.subtaskIndex ? { ...subtask, taskId: event.taskId } : subtask,
              )
        return {
          ...goal,
          taskIds: goal.taskIds.includes(event.taskId)
            ? goal.taskIds
            : [...goal.taskIds, event.taskId],
          subtasks,
          updatedAt: event.occurredAt,
        }
      })
    }

    case 'goal/metric-recorded': {
      return patchGoal(state, event.goalId, goal => ({
        ...goal,
        metrics: [
          ...goal.metrics,
          {
            botId: event.botId,
            quality: event.quality,
            timeliness: event.timeliness,
            recordedAt: event.occurredAt,
          },
        ],
        updatedAt: event.occurredAt,
      }))
    }

    case 'goal/status-changed': {
      return patchGoal(state, event.goalId, goal => ({
        ...goal,
        status: event.status,
        updatedAt: event.occurredAt,
      }))
    }

    case 'goal/completed': {
      return patchGoal(state, event.goalId, goal => ({
        ...goal,
        ...(event.summary === undefined ? {} : { summary: event.summary }),
        status: 'completed',
        updatedAt: event.occurredAt,
      }))
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly GoalEvent[]): GoalState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded goal state.
 * @returns summary counters.
 */
export function statsOf(state: GoalState): GoalStats {
  const goals = [...state.goals.values()]
  const metrics = goals.flatMap(goal => goal.metrics)
  const averageQuality =
    metrics.length === 0
      ? 0
      : round2(metrics.reduce((sum, metric) => sum + metric.quality, 0) / metrics.length)
  return {
    goalCount: goals.length,
    inProgressCount: goals.filter(goal => goal.status === 'in_progress').length,
    completedCount: goals.filter(goal => goal.status === 'completed').length,
    subtaskCount: goals.reduce((sum, goal) => sum + goal.subtasks.length, 0),
    linkedTaskCount: goals.reduce((sum, goal) => sum + goal.taskIds.length, 0),
    averageQuality,
  }
}
