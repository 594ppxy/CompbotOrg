/**
 * Pure event folding into three-layer memory state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/memory/projection
 */

import type { MemoryEntryId } from './brand'
import type { MemoryEvent } from './events'
import type { MemoryEntrySnapshot, MemoryState, MemoryStats } from './types'

/** The empty state a fold starts from. */
export function emptyState(): MemoryState {
  return { entries: new Map() }
}

/** Replace one entry while preserving map identity semantics. */
function withEntry(
  entries: ReadonlyMap<MemoryEntryId, MemoryEntrySnapshot>,
  next: MemoryEntrySnapshot,
): ReadonlyMap<MemoryEntryId, MemoryEntrySnapshot> {
  const copy = new Map(entries)
  copy.set(next.id, next)
  return copy
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: MemoryState, event: MemoryEvent): MemoryState {
  switch (event.type) {
    case 'memory/entry-added': {
      const entry: MemoryEntrySnapshot = {
        id: event.entryId,
        layer: event.layer,
        ownerId: event.ownerId,
        title: event.title,
        content: event.content,
        tags: [...event.tags],
        authorId: event.authorId,
        ...(event.source === undefined ? {} : { source: event.source }),
        revision: 1,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { entries: withEntry(state.entries, entry) }
    }

    case 'memory/entry-updated': {
      const current = state.entries.get(event.entryId)
      if (current === undefined) return state
      return {
        entries: withEntry(state.entries, {
          ...current,
          content: event.content,
          revision: current.revision + 1,
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'memory/entry-removed': {
      if (!state.entries.has(event.entryId)) return state
      const entries = new Map(state.entries)
      entries.delete(event.entryId)
      return { entries }
    }

    case 'memory/layer-cleared': {
      const entries = new Map(state.entries)
      for (const entry of state.entries.values()) {
        if (entry.layer === event.layer && entry.ownerId === event.ownerId) {
          entries.delete(entry.id)
        }
      }
      return { entries }
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly MemoryEvent[]): MemoryState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded memory state.
 * @returns plain, JSON-serializable summary counters.
 */
export function statsOf(state: MemoryState): MemoryStats {
  const entries = [...state.entries.values()]
  const tags = new Set<string>()
  for (const entry of entries) {
    for (const tag of entry.tags) tags.add(tag)
  }
  return {
    entryCount: entries.length,
    organizationCount: entries.filter(entry => entry.layer === 'organization').length,
    departmentCount: entries.filter(entry => entry.layer === 'department').length,
    botCount: entries.filter(entry => entry.layer === 'bot').length,
    tagCount: tags.size,
  }
}
