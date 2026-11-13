/**
 * Append-only storage for one artifact log.
 *
 * @module @compbotorg/artifact/store
 */

import type { ArtifactEvent, LoggedArtifactEvent } from './events'

/** Append-only storage for artifact events. */
export interface ArtifactStore {
  /** Append one event and return its logged position. */
  append(event: ArtifactEvent): LoggedArtifactEvent
  /** Read the full log in append order. */
  readAll(): LoggedArtifactEvent[]
  /** Read events after a position. */
  readSince(afterSeq: number): LoggedArtifactEvent[]
}

/** In-memory append-only log, used by tests and the standalone demo. */
export class MemoryArtifactStore implements ArtifactStore {
  private readonly entries: LoggedArtifactEvent[] = []

  append(event: ArtifactEvent): LoggedArtifactEvent {
    const entry: LoggedArtifactEvent = { seq: this.entries.length + 1, event }
    this.entries.push(entry)
    return entry
  }

  readAll(): LoggedArtifactEvent[] {
    return [...this.entries]
  }

  readSince(afterSeq: number): LoggedArtifactEvent[] {
    return this.entries.filter(entry => entry.seq > afterSeq)
  }

  /** Number of stored events. */
  get size(): number {
    return this.entries.length
  }
}
