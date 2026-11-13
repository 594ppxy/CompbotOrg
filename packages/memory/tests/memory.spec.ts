import { describe, expect, it } from 'vitest'
import { BotId } from '@compbotorg/organization'
import {
  MemoryEntryId,
  MemoryError,
  MemoryEventStore,
  MemoryService,
  applyEvent,
  emptyState,
  replay,
  restoreMemory,
  statsOf,
  type LoggedMemoryEvent,
  type MemoryErrorCode,
  type MemoryEvent,
  type MemoryLayer,
  type MemoryServiceOptions,
} from '../src/index'

const NOW = (): Date => new Date('2026-02-01T00:00:00.000Z')
const AT = '2026-02-01T00:00:00.000Z'
const CEO = BotId('bot-ceo')
const CTO = BotId('bot-cto')
const KEN = BotId('bot-ken')

/** Assert that a command rejects with one of the closed-set error codes. */
function expectCode(run: () => unknown, code: MemoryErrorCode): void {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MemoryError)
    expect((error as MemoryError).code).toBe(code)
    return
  }
  throw new Error(`expected MemoryError with code ${code}`)
}

/** A service with a fixed clock and, optionally, extra options. */
function makeService(options: MemoryServiceOptions = {}): MemoryService {
  return new MemoryService({ now: NOW, ...options })
}

/** Seed one entry per layer. */
function seed(): MemoryService {
  const service = makeService()
  service.addEntry({
    layer: 'organization', ownerId: 'organization', title: 'Mission',
    content: 'Serve the user', authorId: CEO, tags: ['mission'],
  })
  service.addEntry({
    layer: 'department', ownerId: 'engineering', title: 'Delivery rules',
    content: 'Ship artifacts', authorId: CTO, tags: ['process', 'shared'],
  })
  service.addEntry({
    layer: 'bot', ownerId: 'bot-ken', title: 'Ken notes',
    content: 'Split big tasks', authorId: KEN, tags: ['shared'],
  })
  return service
}

describe('MemoryService — three layers', () => {
  it('adds entries on all three layers with fixed timestamps and a logged event', () => {
    const committed: LoggedMemoryEvent[] = []
    const service = makeService({ onCommit: entry => committed.push(entry) })
    const org = service.addEntry({
      layer: 'organization', ownerId: 'organization', title: '  Mission  ',
      content: 'Serve the user', authorId: CEO, tags: ['mission'], source: 'manual',
    })
    const dep = service.addEntry({
      layer: 'department', ownerId: 'engineering', title: 'Rules',
      content: 'Ship artifacts', authorId: CTO,
    })
    const bot = service.addEntry({
      layer: 'bot', ownerId: 'bot-ken', title: 'Notes',
      content: 'Split big tasks', authorId: KEN,
    })

    expect(org.title).toBe('Mission')
    expect(org.revision).toBe(1)
    expect(org.createdAt).toBe(AT)
    expect(org.updatedAt).toBe(AT)
    expect(org.source).toBe('manual')
    expect(dep.tags).toEqual([])
    expect(service.getState().entries.size).toBe(3)
    expect(service.listEntries().map(entry => entry.layer)).toEqual([
      'organization', 'department', 'bot',
    ])
    expect(committed).toHaveLength(3)
    expect(committed.map(entry => entry.seq)).toEqual([1, 2, 3])
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'memory/entry-added', 'memory/entry-added', 'memory/entry-added',
    ])
    expect(service.events()[2]?.event.occurredAt).toBe(AT)
    expect(bot.id).not.toBe(org.id)
    expectCode(
      () => service.addEntry({
        layer: 'team' as MemoryLayer, ownerId: 'x', title: 'T',
        content: 'C', authorId: CEO,
      }),
      'MEMORY_INVALID_ARGUMENT',
    )
  })

  it('rejects empty title, content and ownerId', () => {
    const service = makeService()
    expectCode(
      () => service.addEntry({ layer: 'bot', ownerId: 'x', title: '', content: 'C', authorId: CEO }),
      'MEMORY_INVALID_ARGUMENT',
    )
    expectCode(
      () => service.addEntry({ layer: 'bot', ownerId: 'x', title: 'T', content: '  ', authorId: CEO }),
      'MEMORY_INVALID_ARGUMENT',
    )
    expectCode(
      () => service.addEntry({ layer: 'bot', ownerId: ' ', title: 'T', content: 'C', authorId: CEO }),
      'MEMORY_INVALID_ARGUMENT',
    )
    expect(service.events()).toHaveLength(0)
    expect(service.getStats().entryCount).toBe(0)
  })

  it('rejects empty tags and an empty source', () => {
    const service = makeService()
    expectCode(
      () => service.addEntry({
        layer: 'bot', ownerId: 'x', title: 'T', content: 'C', authorId: CEO,
        tags: ['ok', ''],
      }),
      'MEMORY_INVALID_ARGUMENT',
    )
    expectCode(
      () => service.addEntry({
        layer: 'bot', ownerId: 'x', title: 'T', content: 'C', authorId: CEO, source: '  ',
      }),
      'MEMORY_INVALID_ARGUMENT',
    )
    expect(service.getState().entries.size).toBe(0)
  })

  it('returns detached snapshots from getEntry and listEntries', () => {
    const service = seed()
    const entry = service.getEntry(MemoryEntryId('entry-1'))
    expect(entry?.title).toBe('Mission')
    expect(service.getEntry(MemoryEntryId('missing'))).toBeUndefined()
    const listed = service.listEntries()
    expect(listed).toHaveLength(3)
    const mutableTags = entry?.tags as string[]
    mutableTags.push('tampered')
    expect(service.getEntry(MemoryEntryId('entry-1'))?.tags).toEqual(['mission'])
  })

  it('updates content, increments revision and keeps the original metadata', () => {
    const service = seed()
    const updated = service.updateEntry(MemoryEntryId('entry-1'), {
      content: 'Serve the whole team', editorId: CTO,
    })
    expect(updated.revision).toBe(2)
    expect(updated.content).toBe('Serve the whole team')
    expect(updated.title).toBe('Mission')
    expect(updated.tags).toEqual(['mission'])
    expect(updated.authorId).toBe(CEO)
    expect(updated.createdAt).toBe(AT)
    expect(updated.updatedAt).toBe(AT)
    expect(service.events()[3]?.event.type).toBe('memory/entry-updated')
    expectCode(
      () => service.updateEntry(MemoryEntryId('entry-1'), { content: '  ', editorId: CTO }),
      'MEMORY_INVALID_ARGUMENT',
    )
  })

  it('rejects updates and removals for ids that do not exist', () => {
    const service = seed()
    const missing = MemoryEntryId('does-not-exist')
    expectCode(
      () => service.updateEntry(missing, { content: 'new', editorId: CEO }),
      'MEMORY_ENTRY_NOT_FOUND',
    )
    expectCode(
      () => service.removeEntry(missing, { removedBy: CEO }),
      'MEMORY_ENTRY_NOT_FOUND',
    )
    expect(service.events()).toHaveLength(3)
  })

  it('removes an entry and records who removed it', () => {
    const service = seed()
    const before = service.getStats()
    expect(before.entryCount).toBe(3)
    expect(service.removeEntry(MemoryEntryId('entry-2'), { removedBy: CEO })).toBeUndefined()
    expect(service.getEntry(MemoryEntryId('entry-2'))).toBeUndefined()
    expect(service.getStats().departmentCount).toBe(0)
    expect(service.getStats().entryCount).toBe(2)
    const removal = service.events()[3]?.event
    expect(removal?.type).toBe('memory/entry-removed')
    expect(removal?.occurredAt).toBe(AT)
    expect(service.listEntries().map(entry => entry.id)).toEqual(['entry-1', 'entry-3'])
  })
})

describe('MemoryService — Markdown', () => {
  it('imports level 1–3 headings into separate entries', () => {
    const service = makeService()
    const entries = service.importMarkdown({
      layer: 'organization', ownerId: 'organization', authorId: CEO,
      markdown: '# Vision\n\nBe helpful.\n\n## Rules\n\nBe safe.\n\n### Extra\n\nKeep it short.',
    })
    expect(entries.map(entry => entry.title)).toEqual(['Vision', 'Rules', 'Extra'])
    expect(entries.map(entry => entry.content)).toEqual([
      'Be helpful.', 'Be safe.', 'Keep it short.',
    ])
    expect(entries[0]?.source).toBe('markdown')
    expect(entries[0]?.revision).toBe(1)
    expect(entries[0]?.layer).toBe('organization')
    expect(service.events()).toHaveLength(3)
  })

  it('imports heading-less Markdown as one Imported entry', () => {
    const service = makeService()
    const entries = service.importMarkdown({
      layer: 'bot', ownerId: 'bot-ken', authorId: KEN,
      markdown: 'just some text\nwith two lines',
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.title).toBe('Imported')
    expect(entries[0]?.content).toBe('just some text\nwith two lines')
    expect(service.toMarkdown()).toBe('## Imported\n\njust some text\nwith two lines')
  })

  it('rejects empty Markdown documents without appending events', () => {
    const service = makeService()
    expectCode(
      () => service.importMarkdown({
        layer: 'bot', ownerId: 'bot-ken', authorId: KEN, markdown: '   \n  ',
      }),
      'MEMORY_INVALID_MARKDOWN',
    )
    expectCode(
      () => service.importMarkdown({
        layer: 'bot', ownerId: 'bot-ken', authorId: KEN, markdown: '# Only a heading\n',
      }),
      'MEMORY_INVALID_MARKDOWN',
    )
    expect(service.events()).toHaveLength(0)
    expect(service.toMarkdown()).toBe('')
  })

  it('exports Markdown and round-trips through importMarkdown', () => {
    const source = '# Vision\n\nBe helpful.\n\n## Rules\n\nBe safe.'
    const service = makeService()
    const imported = service.importMarkdown({
      layer: 'organization', ownerId: 'organization', markdown: source, authorId: CEO,
    })
    const output = service.toMarkdown()
    expect(output).toBe('## Vision\n\nBe helpful.\n\n## Rules\n\nBe safe.')
    const second = makeService()
    const reimported = second.importMarkdown({
      layer: 'organization', ownerId: 'organization', markdown: output, authorId: CEO,
    })
    expect(reimported.map(entry => [entry.title, entry.content])).toEqual(
      imported.map(entry => [entry.title, entry.content]),
    )
    expect(second.toMarkdown()).toBe(output)
    const replayed = restoreMemory(service.events().map(entry => entry.event), { now: NOW })
    expect(replayed.toMarkdown()).toBe(output)
  })

  it('re-importing one scope replaces it with a layer-cleared event', () => {
    const service = makeService()
    service.addEntry({
      layer: 'bot', ownerId: 'bot-ken', title: 'Old', content: 'Stale', authorId: KEN,
    })
    service.addEntry({
      layer: 'organization', ownerId: 'organization', title: 'Keep',
      content: 'Unaffected', authorId: CEO,
    })
    service.importMarkdown({
      layer: 'bot', ownerId: 'bot-ken', authorId: KEN, markdown: '# Fresh\n\nNew text',
    })
    expect(service.listEntries().map(entry => entry.title)).toEqual(['Keep', 'Fresh'])
    expect(service.events().map(entry => entry.event.type)).toContain('memory/layer-cleared')
    expect(service.toMarkdown({ layer: 'bot' })).toBe('## Fresh\n\nNew text')
  })

  it('filters Markdown export by layer and ownerId', () => {
    const service = seed()
    expect(service.toMarkdown({ layer: 'bot' })).toBe('## Ken notes\n\nSplit big tasks')
    expect(service.toMarkdown({ ownerId: 'engineering' })).toBe(
      '## Delivery rules\n\nShip artifacts',
    )
    expect(service.toMarkdown({ layer: 'bot', ownerId: 'organization' })).toBe('')
    expect(service.toMarkdown().split('\n\n## ')).toHaveLength(3)
  })
})

describe('MemoryService — queries and statistics', () => {
  it('filters listEntries by layer, ownerId and tag', () => {
    const service = seed()
    expect(service.listEntries({ layer: 'bot' }).map(entry => entry.title)).toEqual(['Ken notes'])
    expect(service.listEntries({ ownerId: 'organization' }).map(entry => entry.title)).toEqual([
      'Mission',
    ])
    expect(service.listEntries({ tag: 'shared' })).toHaveLength(2)
    expect(service.listEntries({ tag: 'process', layer: 'department' })).toHaveLength(1)
    expect(service.listEntries({ tag: 'absent' })).toEqual([])
    expect(service.listEntries({ layer: 'department', ownerId: 'organization' })).toEqual([])
  })

  it('searches title and content case-insensitively with a scope filter', () => {
    const service = seed()
    expect(service.search('MISSION').map(entry => entry.title)).toEqual(['Mission'])
    expect(service.search('SHIP').map(entry => entry.title)).toEqual(['Delivery rules'])
    expect(service.search('split big').map(entry => entry.title)).toEqual(['Ken notes'])
    expect(service.search('serve', { layer: 'organization' })).toHaveLength(1)
    expect(service.search('serve', { layer: 'bot' })).toHaveLength(0)
    expect(service.search('serve', { ownerId: 'engineering' })).toHaveLength(0)
    expect(service.search('not-present')).toEqual([])
  })

  it('reports entry, layer and distinct-tag counters as a plain object', () => {
    const service = seed()
    const stats = service.getStats()
    expect(stats).toEqual({
      entryCount: 3, organizationCount: 1, departmentCount: 1, botCount: 1, tagCount: 3,
    })
    expect(JSON.stringify(stats)).toContain('"tagCount":3')
    service.addEntry({
      layer: 'bot', ownerId: 'bot-ada', title: 'Ada notes', content: 'Review reports',
      authorId: CEO, tags: ['shared', 'review'],
    })
    expect(service.getStats().tagCount).toBe(4)
    expect(service.getStats().botCount).toBe(2)
    service.removeEntry(MemoryEntryId('entry-3'), { removedBy: CEO })
    expect(service.getStats().botCount).toBe(1)
    expect(service.getStats().entryCount).toBe(3)
  })

  it('exposes pure projection helpers', () => {
    const events: readonly MemoryEvent[] = seed().events().map(entry => entry.event)
    expect(emptyState().entries.size).toBe(0)
    expect(statsOf(emptyState()).entryCount).toBe(0)
    expect(applyEvent(emptyState(), events[0] as MemoryEvent).entries.size).toBe(1)
    expect(replay(events).entries.size).toBe(3)
    expect(statsOf(replay(events))).toEqual(seed().getStats())
  })
})

describe('MemoryService — store, ids and replay', () => {
  it('uses an injected store and idFactory and keeps sequence numbers', () => {
    const store = new MemoryEventStore()
    let counter = 0
    const service = makeService({ store, idFactory: () => `custom-${++counter}` })
    const first = service.addEntry({
      layer: 'bot', ownerId: 'bot-ken', title: 'A', content: 'a', authorId: KEN,
    })
    expect(first.id).toBe('custom-1')
    expect(store.size).toBe(1)
    expect(store.readSince(0)).toHaveLength(1)
    expect(store.readSince(1)).toEqual([])

    const colliding = makeService({ idFactory: () => 'fixed' })
    colliding.addEntry({
      layer: 'bot', ownerId: 'bot-ken', title: 'A', content: 'a', authorId: KEN,
    })
    expectCode(
      () => colliding.addEntry({
        layer: 'bot', ownerId: 'bot-ken', title: 'B', content: 'b', authorId: KEN,
      }),
      'MEMORY_INVALID_ARGUMENT',
    )

    const defaultIds = makeService()
    const one = defaultIds.addEntry({
      layer: 'bot', ownerId: 'x', title: 'A', content: 'a', authorId: KEN,
    })
    defaultIds.removeEntry(one.id, { removedBy: KEN })
    const two = defaultIds.addEntry({
      layer: 'bot', ownerId: 'x', title: 'B', content: 'b', authorId: KEN,
    })
    expect(two.id).not.toBe(one.id)
  })

  it('replays a mixed log without firing onCommit and stays consistent', () => {
    const service = seed()
    service.updateEntry(MemoryEntryId('entry-1'), { content: 'Serve the team', editorId: CTO })
    service.removeEntry(MemoryEntryId('entry-2'), { removedBy: CEO })
    service.importMarkdown({
      layer: 'bot', ownerId: 'bot-ada', authorId: CEO, markdown: '# Onboarding\n\nRead the handbook.',
    })
    let replayed = 0
    const restored = restoreMemory(service.events().map(entry => entry.event), {
      now: NOW, onCommit: () => { replayed += 1 },
    })
    expect(replayed).toBe(0)
    expect(restored.events()).toEqual(service.events())
    expect(restored.getState().entries.size).toBe(service.getState().entries.size)
    expect(restored.getStats()).toEqual(service.getStats())
    expect(restored.listEntries()).toEqual(service.listEntries())
    expect(restored.toMarkdown()).toEqual(service.toMarkdown())
    expect(restored.search('handbook')).toEqual(service.search('handbook'))

    const added = restored.addEntry({
      layer: 'organization', ownerId: 'organization', title: 'After restore',
      content: 'Still deterministic', authorId: CEO,
    })
    expect(replayed).toBe(1)
    expect(restored.getEntry(added.id)?.createdAt).toBe(AT)
    expect(restored.events()).toHaveLength(service.events().length + 1)
  })
})
