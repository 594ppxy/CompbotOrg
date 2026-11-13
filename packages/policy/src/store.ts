/**
 * Durable event storage for one policy engine log.
 *
 * The service talks only to this interface, so an in-memory log, a JSONL file,
 * or the DSH Session log are interchangeable backends. Implementations must
 * append synchronously in call order; the service assumes that when it reads
 * back the projection.
 *
 * @module @compbotorg/policy/store
 */

import type { LoggedPolicyEvent, PolicyEvent } from './events'

/** Append-only storage for policy engine events. */
export interface PolicyStore {
  /**
   * Append one event and return its logged position.
   * @param event - the event to persist.
   * @returns the stored entry with its assigned sequence number.
   */
  append(event: PolicyEvent): LoggedPolicyEvent

  /**
   * Read the full log in append order.
   * @returns every logged event.
   */
  readAll(): LoggedPolicyEvent[]

  /**
   * Read events after a position, for incremental projection.
   * @param afterSeq - exclusive lower bound; pass 0 to read from the start.
   * @returns logged events with a greater sequence number.
   */
  readSince(afterSeq: number): LoggedPolicyEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemoryPolicyStore implements PolicyStore {
  private readonly entries: LoggedPolicyEvent[] = []

  append(event: PolicyEvent): LoggedPolicyEvent {
    const entry: LoggedPolicyEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedPolicyEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedPolicyEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
