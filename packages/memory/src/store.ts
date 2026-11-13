/**
 * Append-only storage for one memory event log.
 *
 * The service talks only to this interface, so an in-memory log, a JSONL file,
 * or the DSH Session log are interchangeable backends. Implementations must
 * append synchronously in call order; the service assumes that when it reads
 * back the projection.
 *
 * @module @compbotorg/memory/store
 */

import type { LoggedMemoryEvent, MemoryEvent } from './events'

/** Append-only storage for memory events. */
export interface MemoryStore {
  /**
   * Append one event and return its logged position.
   * @param event - the event to persist.
   * @returns the stored entry with its assigned sequence number.
   */
  append(event: MemoryEvent): LoggedMemoryEvent

  /**
   * Read the full log in append order.
   * @returns every logged event.
   */
  readAll(): LoggedMemoryEvent[]

  /**
   * Read events after a position, for incremental projection.
   * @param afterSeq - exclusive lower bound; pass 0 to read from the start.
   * @returns logged events with a greater sequence number.
   */
  readSince(afterSeq: number): LoggedMemoryEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemoryEventStore implements MemoryStore {
  private readonly entries: LoggedMemoryEvent[] = []

  /** @param event - event to persist. @returns the stored entry. */
  append(event: MemoryEvent): LoggedMemoryEvent {
    const entry: LoggedMemoryEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  /** @returns every logged event in append order. */
  readAll(): LoggedMemoryEvent[] {
    return [...this.entries]
  }

  /** @param afterSeq - exclusive lower bound. @returns later logged events. */
  readSince(afterSeq: number): LoggedMemoryEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
