/**
 * Three-layer memory command service.
 *
 * Every mutating method follows the same shape: validate against the current
 * projection, append events, fold them with the pure projection, notify the
 * optional commit hook, then return detached snapshots. Nothing mutates state
 * in place. The service owns its log and is fully restorable from `events()`.
 *
 * @module @compbotorg/memory/service
 */

import type { BotId } from '@compbotorg/organization'
import { MemoryEntryId } from './brand'
import { MemoryError } from './errors'
import type { LoggedMemoryEvent, MemoryEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryEventStore, type MemoryStore } from './store'
import type {
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

/** Service construction options. */
export interface MemoryServiceOptions {
  /** Clock override for deterministic tests. */
  readonly now?: () => Date
  /** Storage backend; defaults to an in-memory log. */
  readonly store?: MemoryStore
  /** Factory for new entry ids; defaults to `entry-N`. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding. */
  readonly onCommit?: (entry: LoggedMemoryEvent) => void
}

const MEMORY_LAYERS: readonly MemoryLayer[] = ['organization', 'department', 'bot']
const HEADING_LINE = /^#{1,3}\s+(.+?)\s*$/

interface MarkdownSection {
  readonly title: string
  readonly content: string
}

/** Validate one required display string. */
function requiredText(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new MemoryError(`${field} must not be empty`, 'MEMORY_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Validate one optional provenance string. */
function optionalSource(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return requiredText(value, 'source')
}

/** Validate and copy a tag list. */
function normalizedTags(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return []
  return value.map((tag, index) => requiredText(tag, `tags[${index}]`))
}

/**
 * Split Markdown into sections delimited by level 1–3 headings.
 * Text without a heading becomes one `Imported` section; empty sections are
 * dropped so every imported entry has non-empty content.
 */
function parseMarkdown(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  let title = 'Imported'
  let lines: string[] = []
  const flush = (): void => {
    const content = lines.join('\n').trim()
    if (content !== '') sections.push({ title, content })
    lines = []
  }
  for (const line of markdown.split(/\r?\n/)) {
    const match = HEADING_LINE.exec(line)
    if (match === null) {
      lines.push(line)
    } else {
      flush()
      const heading = (match[1] ?? '').trim()
      title = heading === '' ? 'Imported' : heading
    }
  }
  flush()
  return sections
}

/** Whether one entry belongs to the requested layer/owner scope. */
function scopeMatches(
  entry: MemoryEntrySnapshot,
  filter: MemoryScopeFilter | undefined,
): boolean {
  if (filter === undefined) return true
  if (filter.layer !== undefined && entry.layer !== filter.layer) return false
  if (filter.ownerId !== undefined && entry.ownerId !== filter.ownerId) return false
  return true
}

/** Detach one snapshot so callers cannot mutate folded state through an alias. */
function copySnapshot(snapshot: MemoryEntrySnapshot): MemoryEntrySnapshot {
  return { ...snapshot, tags: [...snapshot.tags] }
}

/**
 * Organization, department and Bot memory commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class MemoryService {
  private readonly store: MemoryStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedMemoryEvent) => void) | undefined
  private state: MemoryState

  /**
   * @param options - clock, store, id factory and commit hook.
   */
  constructor(options: MemoryServiceOptions = {}) {
    this.store = options.store ?? new MemoryEventStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = replay(this.store.readAll().map(entry => entry.event))
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state (read-only by convention). */
  getState(): MemoryState {
    return this.state
  }

  /** Every logged event, in append order; use it for persistence. */
  events(): LoggedMemoryEvent[] {
    return this.store.readAll()
  }

  /** Read one entry, or undefined when the id is unknown. */
  getEntry(id: MemoryEntryId): MemoryEntrySnapshot | undefined {
    const snapshot = this.state.entries.get(id)
    return snapshot === undefined ? undefined : copySnapshot(snapshot)
  }

  /** List entries in insertion order, optionally filtered by scope and tag. */
  listEntries(filter?: MemoryListFilter): MemoryEntrySnapshot[] {
    return [...this.state.entries.values()]
      .filter(
        entry =>
          scopeMatches(entry, filter) &&
          (filter?.tag === undefined || entry.tags.includes(filter.tag)),
      )
      .map(copySnapshot)
  }

  /** Case-insensitive full-text search over titles and contents. */
  search(query: string, filter?: MemoryScopeFilter): MemoryEntrySnapshot[] {
    const needle = query.toLowerCase()
    return [...this.state.entries.values()]
      .filter(
        entry =>
          scopeMatches(entry, filter) &&
          (entry.title.toLowerCase().includes(needle) ||
            entry.content.toLowerCase().includes(needle)),
      )
      .map(copySnapshot)
  }

  /** Export the selected scope as `## <title>\n\n<content>` documents. */
  toMarkdown(filter?: MemoryScopeFilter): string {
    return [...this.state.entries.values()]
      .filter(entry => scopeMatches(entry, filter))
      .map(entry => `## ${entry.title}\n\n${entry.content}`)
      .join('\n\n')
  }

  /** Plain, JSON-serializable dashboard counters. */
  getStats(): MemoryStats {
    return statsOf(this.state)
  }

  // --------------------------------------------------------------- commands

  /**
   * Add one memory entry.
   * @param input - layer, owner, title, content, author, optional tags/source.
   * @returns the created entry.
   * @throws MemoryError `MEMORY_INVALID_ARGUMENT` when a required field is
   *   empty, the layer is unknown, or the generated id collides.
   */
  addEntry(input: AddEntryInput): MemoryEntrySnapshot {
    const layer = this.requireLayer(input.layer)
    const ownerId = requiredText(input.ownerId, 'ownerId')
    const title = requiredText(input.title, 'title')
    const content = requiredText(input.content, 'content')
    const tags = normalizedTags(input.tags)
    const source = optionalSource(input.source)
    const id = this.nextId()
    this.commit({
      type: 'memory/entry-added',
      entryId: id,
      layer,
      ownerId,
      title,
      content,
      tags,
      authorId: input.authorId,
      ...(source === undefined ? {} : { source }),
      occurredAt: this.timestamp(),
    })
    return this.requireEntry(id)
  }

  /**
   * Revise the content of one entry, incrementing its revision.
   * @param id - entry to revise.
   * @param input - new content and the editing member.
   * @returns the updated entry.
   * @throws MemoryError `MEMORY_ENTRY_NOT_FOUND` for an unknown id, or
   *   `MEMORY_INVALID_ARGUMENT` for empty content.
   */
  updateEntry(id: MemoryEntryId, input: UpdateEntryInput): MemoryEntrySnapshot {
    this.requireEntry(id)
    const content = requiredText(input.content, 'content')
    this.commit({
      type: 'memory/entry-updated',
      entryId: id,
      content,
      editorId: input.editorId,
      occurredAt: this.timestamp(),
    })
    return this.requireEntry(id)
  }

  /**
   * Remove one entry.
   * @param id - entry to remove.
   * @param input - the member removing it.
   * @throws MemoryError `MEMORY_ENTRY_NOT_FOUND` for an unknown id.
   */
  removeEntry(id: MemoryEntryId, input: RemoveEntryInput): void {
    this.requireEntry(id)
    this.commit({
      type: 'memory/entry-removed',
      entryId: id,
      removedBy: input.removedBy,
      occurredAt: this.timestamp(),
    })
  }

  /**
   * Import a Markdown document into one layer scope.
   *
   * The document is split on `^#{1,3}\s+` headings; text without a heading
   * becomes one entry titled `Imported`. Re-importing a document replaces the
   * entries already present in that exact `(layer, ownerId)` scope, which is
   * recorded as a `memory/layer-cleared` event.
   *
   * @param input - layer, owner, Markdown text and importing member.
   * @returns the imported entries, in document order.
   * @throws MemoryError `MEMORY_INVALID_ARGUMENT` for an empty owner or an
   *   unknown layer, or `MEMORY_INVALID_MARKDOWN` when the document has no
   *   usable content.
   */
  importMarkdown(input: ImportMarkdownInput): MemoryEntrySnapshot[] {
    const layer = this.requireLayer(input.layer)
    const ownerId = requiredText(input.ownerId, 'ownerId')
    if (input.markdown.trim() === '') {
      throw new MemoryError('markdown must not be empty', 'MEMORY_INVALID_MARKDOWN')
    }
    const sections = parseMarkdown(input.markdown)
    if (sections.length === 0) {
      throw new MemoryError('markdown contains no content', 'MEMORY_INVALID_MARKDOWN')
    }

    const hasExisting = [...this.state.entries.values()].some(
      entry => entry.layer === layer && entry.ownerId === ownerId,
    )
    if (hasExisting) {
      this.commit({
        type: 'memory/layer-cleared',
        layer,
        ownerId,
        clearedBy: input.authorId,
        occurredAt: this.timestamp(),
      })
    }

    const created: MemoryEntrySnapshot[] = []
    for (const section of sections) {
      const id = this.nextId()
      this.commit({
        type: 'memory/entry-added',
        entryId: id,
        layer,
        ownerId,
        title: section.title,
        content: section.content,
        tags: [],
        authorId: input.authorId,
        source: 'markdown',
        occurredAt: this.timestamp(),
      })
      created.push(this.requireEntry(id))
    }
    return created
  }

  // --------------------------------------------------------------- internals

  /** Append one event, fold it, then notify the commit hook. */
  private commit(event: MemoryEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Validate and return a layer discriminant. */
  private requireLayer(value: MemoryLayer): MemoryLayer {
    if (!MEMORY_LAYERS.includes(value)) {
      throw new MemoryError(`unknown memory layer "${value}"`, 'MEMORY_INVALID_ARGUMENT')
    }
    return value
  }

  /** Produce the next unused entry id. */
  private nextId(): MemoryEntryId {
    if (this.idFactory !== undefined) {
      const raw = requiredText(this.idFactory(), 'entry id')
      const id = MemoryEntryId(raw)
      if (this.state.entries.has(id)) {
        throw new MemoryError(`memory entry "${raw}" already exists`, 'MEMORY_INVALID_ARGUMENT')
      }
      return id
    }
    let sequence = this.events().length + 1
    let candidate = MemoryEntryId(`entry-${sequence}`)
    while (this.state.entries.has(candidate)) {
      sequence += 1
      candidate = MemoryEntryId(`entry-${sequence}`)
    }
    return candidate
  }

  /** Read one entry or fail with a stable error code. */
  private requireEntry(id: MemoryEntryId): MemoryEntrySnapshot {
    const snapshot = this.state.entries.get(id)
    if (snapshot === undefined) {
      throw new MemoryError(`memory entry "${id}" not found`, 'MEMORY_ENTRY_NOT_FOUND')
    }
    return copySnapshot(snapshot)
  }
}

/**
 * Create a service and replay an existing log.
 *
 * Restored events are folded silently: `onCommit` observes only newly
 * committed commands, never the replayed history.
 *
 * @param events - previously persisted events, in append order.
 * @param options - clock, id factory and commit hook overrides; the store is
 *   replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restoreMemory(
  events: readonly MemoryEvent[],
  options: MemoryServiceOptions = {},
): MemoryService {
  const store = new MemoryEventStore()
  for (const event of events) store.append(event)
  return new MemoryService({ ...options, store })
}
