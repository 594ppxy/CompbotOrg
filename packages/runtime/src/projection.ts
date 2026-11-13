/**
 * Pure folding of runtime events into state.
 *
 * @module @compbotorg/runtime/projection
 */

import type { ExecutionId } from './brand'
import type { ExecutionEvent } from './events'
import type { ExecutionSnapshot, ExecutionStats, RuntimeState } from './types'

/** The empty state a fold starts from. */
export function emptyState(): RuntimeState {
  return { executions: new Map() }
}

/** Replace one execution while preserving map identity semantics. */
function withExecution(
  current: ReadonlyMap<ExecutionId, ExecutionSnapshot>,
  next: ExecutionSnapshot,
): ReadonlyMap<ExecutionId, ExecutionSnapshot> {
  const copy = new Map(current)
  copy.set(next.id, next)
  return copy
}

/**
 * Fold one event into the current state. Pure and validation-free.
 * @param state - previous projection.
 * @param event - the event to apply.
 * @returns the next projection.
 */
export function applyEvent(state: RuntimeState, event: ExecutionEvent): RuntimeState {
  switch (event.type) {
    case 'execution/started':
      return {
        executions: withExecution(state.executions, {
          id: event.executionId,
          taskId: event.taskId,
          botId: event.botId,
          title: event.title,
          status: 'running',
          artifactRefs: [],
          toolCalls: [],
          startedAt: event.occurredAt,
        }),
      }
    case 'execution/succeeded': {
      const current = state.executions.get(event.executionId)
      if (current === undefined) return state
      return {
        executions: withExecution(state.executions, {
          ...current,
          status: 'succeeded',
          summary: event.summary,
          artifactRefs: event.artifactRefs,
          toolCalls: event.toolCalls,
          confidence: event.confidence,
          durationMs: event.durationMs,
          finishedAt: event.occurredAt,
        }),
      }
    }
    case 'execution/failed': {
      const current = state.executions.get(event.executionId)
      if (current === undefined) return state
      return {
        executions: withExecution(state.executions, {
          ...current,
          status: 'failed',
          failureReason: event.reason,
          durationMs: event.durationMs,
          finishedAt: event.occurredAt,
        }),
      }
    }
  }
}

/**
 * Replay a full event log.
 * @param events - events in append order.
 * @returns the folded state.
 */
export function replay(events: readonly ExecutionEvent[]): RuntimeState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Derive dashboard counters.
 * @param state - current projection.
 * @returns serializable runtime statistics.
 */
export function statsOf(state: RuntimeState): ExecutionStats {
  const all = [...state.executions.values()]
  const succeeded = all.filter(entry => entry.status === 'succeeded')
  const confidenceSum = succeeded.reduce((sum, entry) => sum + (entry.confidence ?? 0), 0)
  const round2 = (value: number): number => Math.round(value * 100) / 100
  return {
    executionCount: all.length,
    runningCount: all.filter(entry => entry.status === 'running').length,
    succeededCount: succeeded.length,
    failedCount: all.filter(entry => entry.status === 'failed').length,
    successRate: all.length === 0 ? 0 : round2(succeeded.length / all.length),
    averageConfidence: succeeded.length === 0 ? 0 : round2(confidenceSum / succeeded.length),
    toolCallCount: all.reduce((sum, entry) => sum + entry.toolCalls.length, 0),
  }
}
