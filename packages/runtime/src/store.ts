/**
 * Append-only storage for one runtime execution log.
 *
 * @module @compbotorg/runtime/store
 */

import type { ExecutionEvent, LoggedExecutionEvent } from './events'

/** Append-only storage for runtime events. */
export interface ExecutionStore {
  /** Append one event and return its logged position. */
  append(event: ExecutionEvent): LoggedExecutionEvent
  /** Read the full log in append order. */
  readAll(): LoggedExecutionEvent[]
  /** Read events after a position. */
  readSince(afterSeq: number): LoggedExecutionEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemoryExecutionStore implements ExecutionStore {
  private readonly entries: LoggedExecutionEvent[] = []

  append(event: ExecutionEvent): LoggedExecutionEvent {
    const entry: LoggedExecutionEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedExecutionEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedExecutionEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
