/**
 * CompbotOrg — three-layer Memory (v0.5).
 *
 * Organization, department and Bot memory live in one append-only event log.
 * Entries can be written, revised, removed, searched and exported to (or
 * imported from) Markdown, so a hosted MEMORY.md file and the in-process
 * projection always tell the same story. The package has no runtime, transport
 * or UI dependency; Bot identities are borrowed as types only from
 * `@compbotorg/organization`.
 *
 * Typical use:
 *
 * ```ts
 * const memory = new MemoryService({ now })
 * const entry = memory.addEntry({ layer: 'organization', ownerId: 'acme',
 *   title: 'Mission', content: 'Serve the user', authorId: CEO })
 * memory.updateEntry(entry.id, { content: 'Serve the team', editorId: CEO })
 * const markdown = memory.toMarkdown()
 * ```
 *
 * @module @compbotorg/memory/index
 */

export { MemoryEntryId, brand, type Branded } from './brand'

export { MemoryError, type MemoryErrorCode } from './errors'

export type {
  LoggedMemoryEvent,
  MemoryEntryAddedEvent,
  MemoryEntryRemovedEvent,
  MemoryEntryUpdatedEvent,
  MemoryEvent,
  MemoryEventType,
  MemoryLayerClearedEvent,
} from './events'

/** Task-style alias for the logged event shape. */
export type { LoggedMemoryEvent as LoggedEvent } from './events'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryEventStore, type MemoryStore } from './store'

export type {
  AddEntryInput,
  ImportMarkdownInput,
  MemoryEntrySnapshot,
  MemoryLayer,
  MemoryListFilter,
  MemoryScopeFilter,
  MemoryState,
  MemoryStats,
  RemoveEntryInput,
  UpdateEntryInput,
} from './types'

export {
  MemoryService,
  restoreMemory,
  type MemoryServiceOptions,
} from './service'
