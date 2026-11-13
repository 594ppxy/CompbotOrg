/**
 * Durable runtime events.
 *
 * The execution log is separate from the task log: it records *how* a Bot
 * worked, while the task log records *what* the organization decided. Keeping
 * them apart lets a Runtime be replaced (DSH agent loop, a real LLM, a human)
 * without rewriting the organization protocol.
 *
 * @module @compbotorg/runtime/events
 */

import type { BotId } from '@compbotorg/organization'
import type { ExecutionId } from './brand'

/** Event appended when a Bot begins executing a task. */
export interface ExecutionStartedEvent {
  readonly type: 'execution/started'
  readonly executionId: ExecutionId
  readonly taskId: string
  readonly botId: BotId
  readonly title: string
  readonly occurredAt: string
}

/** Event appended when a Bot finishes a task successfully. */
export interface ExecutionSucceededEvent {
  readonly type: 'execution/succeeded'
  readonly executionId: ExecutionId
  readonly summary: string
  readonly artifactRefs: readonly string[]
  readonly toolCalls: readonly string[]
  readonly confidence: number
  readonly durationMs: number
  readonly occurredAt: string
}

/** Event appended when a Bot execution fails. */
export interface ExecutionFailedEvent {
  readonly type: 'execution/failed'
  readonly executionId: ExecutionId
  readonly reason: string
  readonly durationMs: number
  readonly occurredAt: string
}

/** Discriminated union of every runtime event. */
export type ExecutionEvent =
  | ExecutionStartedEvent
  | ExecutionSucceededEvent
  | ExecutionFailedEvent

/** Discriminant values. */
export type ExecutionEventType = ExecutionEvent['type']

/** One event together with its position in the append-only log. */
export interface LoggedExecutionEvent {
  readonly seq: number
  readonly event: ExecutionEvent
}
