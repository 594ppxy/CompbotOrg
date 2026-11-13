/**
 * Durable event storage for one skill protocol log.
 *
 * The service talks only to this interface, so an in-memory log, a JSONL file,
 * or the DSH Session log are interchangeable backends. Implementations must
 * append synchronously in call order; the service assumes that when it reads
 * back the projection.
 *
 * @module @compbotorg/skill/store
 */

import type { LoggedSkillEvent, SkillEvent } from './events'

/** Append-only storage for skill protocol events. */
export interface SkillStore {
  /**
   * Append one event and return its logged position.
   * @param event - the event to persist.
   * @returns the stored entry with its assigned sequence number.
   */
  append(event: SkillEvent): LoggedSkillEvent

  /**
   * Read the full log in append order.
   * @returns every logged event.
   */
  readAll(): LoggedSkillEvent[]

  /**
   * Read events after a position, for incremental projection.
   * @param afterSeq - exclusive lower bound; pass 0 to read from the start.
   * @returns logged events with a greater sequence number.
   */
  readSince(afterSeq: number): LoggedSkillEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemorySkillStore implements SkillStore {
  private readonly entries: LoggedSkillEvent[] = []

  append(event: SkillEvent): LoggedSkillEvent {
    const entry: LoggedSkillEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedSkillEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedSkillEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
