/**
 * Durable event storage for one registry log.
 *
 * The service talks only to this interface, so an in-memory log, a JSONL file,
 * or the DSH Session log are interchangeable backends. Implementations must
 * append synchronously in call order; the service assumes that when it reads
 * back the projection.
 *
 * @module @compbotorg/registry/store
 */

import type { LoggedRegistryEvent, RegistryEvent } from './events'

/** Append-only storage for registry events. */
export interface RegistryStore {
  /**
   * Append one event and return its logged position.
   * @param event - the event to persist.
   * @returns the stored entry with its assigned sequence number.
   */
  append(event: RegistryEvent): LoggedRegistryEvent

  /**
   * Read the full log in append order.
   * @returns every logged event.
   */
  readAll(): LoggedRegistryEvent[]

  /**
   * Read events after a position, for incremental projection.
   * @param afterSeq - exclusive lower bound; pass 0 to read from the start.
   * @returns logged events with a greater sequence number.
   */
  readSince(afterSeq: number): LoggedRegistryEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemoryRegistryStore implements RegistryStore {
  private readonly entries: LoggedRegistryEvent[] = []

  append(event: RegistryEvent): LoggedRegistryEvent {
    const entry: LoggedRegistryEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedRegistryEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedRegistryEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
