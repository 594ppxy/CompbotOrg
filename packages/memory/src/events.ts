/**
 * Durable memory events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends events. Replaying the log in order restores
 * the projection exactly, which makes organizational knowledge auditable and
 * restorable. Each event carries an ISO-8601 `occurredAt` produced by the
 * service's injected clock.
 *
 * @module @compbotorg/memory/events
 */

import type { BotId } from '@compbotorg/organization'
import type { MemoryEntryId } from './brand'
import type { MemoryLayer } from './types'

/** Event appended when one memory entry is added (also used by imports). */
export interface MemoryEntryAddedEvent {
  readonly type: 'memory/entry-added'
  readonly entryId: MemoryEntryId
  readonly layer: MemoryLayer
  readonly ownerId: string
  readonly title: string
  readonly content: string
  readonly tags: readonly string[]
  readonly authorId: BotId
  readonly source?: string
  readonly occurredAt: string
}

/** Event appended when the content of an entry is revised. */
export interface MemoryEntryUpdatedEvent {
  readonly type: 'memory/entry-updated'
  readonly entryId: MemoryEntryId
  readonly content: string
  readonly editorId: BotId
  readonly occurredAt: string
}

/** Event appended when one entry is removed. */
export interface MemoryEntryRemovedEvent {
  readonly type: 'memory/entry-removed'
  readonly entryId: MemoryEntryId
  readonly removedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a layer scope is cleared before a Markdown re-import. */
export interface MemoryLayerClearedEvent {
  readonly type: 'memory/layer-cleared'
  readonly layer: MemoryLayer
  readonly ownerId: string
  readonly clearedBy: BotId
  readonly occurredAt: string
}

/** Every durable memory event. */
export type MemoryEvent =
  | MemoryEntryAddedEvent
  | MemoryEntryUpdatedEvent
  | MemoryEntryRemovedEvent
  | MemoryLayerClearedEvent

/** Discriminant of {@link MemoryEvent}. */
export type MemoryEventType = MemoryEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedMemoryEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: MemoryEvent
}
