/**
 * Durable three-layer memory state shapes.
 *
 * Every value here is a snapshot folded from events. Snapshots are immutable:
 * a command produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/memory/types
 */

import type { BotId } from '@compbotorg/organization'
import type { MemoryEntryId } from './brand'

/** The three ownership layers of organizational memory. */
export type MemoryLayer = 'organization' | 'department' | 'bot'

/** One memory entry, folded from the event log. */
export interface MemoryEntrySnapshot {
  readonly id: MemoryEntryId
  readonly layer: MemoryLayer
  /** Owner inside the layer: an organization, department or Bot id as text. */
  readonly ownerId: string
  readonly title: string
  readonly content: string
  readonly tags: readonly string[]
  /** Member who authored the entry. */
  readonly authorId: BotId
  /** Optional provenance, e.g. `markdown` for imported entries. */
  readonly source?: string
  /** Number of times the content has been written; starts at 1. */
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete folded memory state. */
export interface MemoryState {
  /** Entries keyed by id, in insertion order. */
  readonly entries: ReadonlyMap<MemoryEntryId, MemoryEntrySnapshot>
}

/** Summary counters for dashboards; a plain JSON-serializable object. */
export interface MemoryStats {
  readonly entryCount: number
  readonly organizationCount: number
  readonly departmentCount: number
  readonly botCount: number
  /** Number of distinct tags currently in use. */
  readonly tagCount: number
}

/** Input for {@link MemoryService.addEntry}. */
export interface AddEntryInput {
  readonly layer: MemoryLayer
  readonly ownerId: string
  readonly title: string
  readonly content: string
  readonly authorId: BotId
  readonly tags?: readonly string[]
  readonly source?: string
}

/** Input for {@link MemoryService.updateEntry}. */
export interface UpdateEntryInput {
  readonly content: string
  readonly editorId: BotId
}

/** Input for {@link MemoryService.removeEntry}. */
export interface RemoveEntryInput {
  readonly removedBy: BotId
}

/** Input for {@link MemoryService.importMarkdown}. */
export interface ImportMarkdownInput {
  readonly layer: MemoryLayer
  readonly ownerId: string
  readonly markdown: string
  readonly authorId: BotId
}

/** Scope filter shared by Markdown export and search. */
export interface MemoryScopeFilter {
  readonly layer?: MemoryLayer
  readonly ownerId?: string
}

/** Filter accepted by {@link MemoryService.listEntries}. */
export interface MemoryListFilter extends MemoryScopeFilter {
  readonly tag?: string
}
