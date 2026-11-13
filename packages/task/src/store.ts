/**
 * Durable event storage for one organization protocol log.
 *
 * The service talks only to this interface, so an in-memory log, a JSONL file,
 * or the DSH Session log are interchangeable backends. Implementations must
 * append synchronously in call order; the service assumes that when it reads
 * back the projection.
 *
 * @module @compbotorg/task/store
 */

import type { TaskEvent, LoggedEvent } from './events'

/** Append-only storage for protocol events. */
export interface TaskStore {
  /**
   * Append one event and return its logged position.
   * @param event - the event to persist.
   * @returns the stored entry with its assigned sequence number.
   */
  append(event: TaskEvent): LoggedEvent

  /**
   * Read the full log in append order.
   * @returns every logged event.
   */
  readAll(): LoggedEvent[]

  /**
   * Read events after a position, for incremental projection.
   * @param afterSeq - exclusive lower bound; pass 0 to read from the start.
   * @returns logged events with a greater sequence number.
   */
  readSince(afterSeq: number): LoggedEvent[]
}

/** In-memory append-only log, used by tests and the demo. */
export class MemoryTaskStore implements TaskStore {
  private readonly entries: LoggedEvent[] = []

  append(event: TaskEvent): LoggedEvent {
    const entry: LoggedEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
