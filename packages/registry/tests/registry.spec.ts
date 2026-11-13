/**
 * Registry command tests.
 *
 * A fixed clock keeps event timestamps deterministic, so replay comparisons
 * are exact. Every rejection path asserts the stable error code, not text.
 *
 * @module @compbotorg/registry/tests
 */

import { BotId } from '@compbotorg/organization'
import { describe, expect, it } from 'vitest'
import {
  ListingId,
  MemoryRegistryStore,
  RegistryError,
  RegistryService,
  restoreRegistry,
  type ListingKind,
} from '../src/index'

const CEO = BotId('ceo')
const ENGINEER = BotId('engineer')
const RESEARCHER = BotId('researcher')
const FIXED = new Date('2026-02-01T00:00:00.000Z')
const now = (): Date => FIXED

function newService(): RegistryService {
  return new RegistryService({ now })
}

function publish(svc: RegistryService, name = 'Code Review', version = '1.0.0') {
  return svc.publish({
    name,
    kind: 'skill',
    version,
    description: 'Static analysis for pull requests',
    publisherId: CEO,
    capabilities: ['code', 'review'],
  })
}

/** Return the stable error code thrown by a command, or `none`. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'none'
  } catch (error) {
    return error instanceof RegistryError ? error.code : `unexpected:${String(error)}`
  }
}

describe('publishing', () => {
  it('publishes a listing with empty counters', () => {
    const svc = newService()
    const listing = publish(svc)
    expect(listing.id).toBe('listing-1')
    expect(listing.status).toBe('published')
    expect(listing.installCount).toBe(0)
    expect(listing.ratings).toEqual([])
    expect(listing.averageRating).toBe(0)
    expect(listing.createdAt).toBe(FIXED.toISOString())
    expect(svc.getStats().publishedCount).toBe(1)
  })

  it('rejects a duplicate name and version', () => {
    const svc = newService()
    publish(svc)
    expect(codeOf(() => publish(svc))).toBe('REGISTRY_ALREADY_PUBLISHED')
    expect(svc.listListings()).toHaveLength(1)
  })

  it('allows the same name at a different version', () => {
    const svc = newService()
    publish(svc)
    expect(publish(svc, 'Code Review', '1.1.0').version).toBe('1.1.0')
    expect(svc.getStats().listingCount).toBe(2)
  })

  it('rejects empty text and an unknown kind', () => {
    const svc = newService()
    expect(
      codeOf(() =>
        svc.publish({
          name: ' ',
          kind: 'skill',
          version: '1.0.0',
          description: 'x',
          publisherId: CEO,
          capabilities: [],
        }),
      ),
    ).toBe('REGISTRY_INVALID_ARGUMENT')
    expect(
      codeOf(() =>
        svc.publish({
          name: 'Odd',
          kind: 'plugin' as ListingKind,
          version: '1.0.0',
          description: 'x',
          publisherId: CEO,
          capabilities: [],
        }),
      ),
    ).toBe('REGISTRY_INVALID_ARGUMENT')
    expect(svc.events()).toHaveLength(0)
  })
})

describe('install and rating', () => {
  it('increments install count on each install', () => {
    const svc = newService()
    const listing = publish(svc)
    svc.install(listing.id, { botId: ENGINEER, installedBy: CEO })
    svc.install(listing.id, { botId: RESEARCHER, installedBy: CEO })
    expect(svc.getListing(listing.id)?.installCount).toBe(2)
    expect(svc.getStats().installCount).toBe(2)
  })

  it('fails to install an unknown listing', () => {
    const svc = newService()
    expect(
      codeOf(() => svc.install(ListingId('missing'), { botId: ENGINEER, installedBy: CEO })),
    ).toBe('REGISTRY_LISTING_NOT_FOUND')
  })

  it('validates rating scores', () => {
    const svc = newService()
    const listing = publish(svc)
    expect(codeOf(() => svc.rate(listing.id, { score: 0, raterId: ENGINEER }))).toBe(
      'REGISTRY_INVALID_RATING',
    )
    expect(codeOf(() => svc.rate(listing.id, { score: 6, raterId: ENGINEER }))).toBe(
      'REGISTRY_INVALID_RATING',
    )
    expect(codeOf(() => svc.rate(listing.id, { score: 4.5, raterId: ENGINEER }))).toBe(
      'REGISTRY_INVALID_RATING',
    )
    expect(svc.getListing(listing.id)?.ratings).toHaveLength(0)
  })

  it('computes a two-decimal average and replaces a rater score', () => {
    const svc = newService()
    const listing = publish(svc)
    svc.rate(listing.id, { score: 4, raterId: ENGINEER })
    svc.rate(listing.id, { score: 5, raterId: RESEARCHER, comment: 'great' })
    expect(svc.getListing(listing.id)?.averageRating).toBe(4.5)
    expect(svc.getListing(listing.id)?.ratings[1]?.comment).toBe('great')
    svc.rate(listing.id, { score: 3, raterId: ENGINEER })
    const rated = svc.getListing(listing.id)
    expect(rated?.ratings).toHaveLength(2)
    expect(rated?.averageRating).toBe(4)
    expect(svc.getStats().ratingCount).toBe(2)
  })

  it('rounds the global average to two decimals', () => {
    const svc = newService()
    const listing = publish(svc)
    svc.rate(listing.id, { score: 4, raterId: ENGINEER })
    svc.rate(listing.id, { score: 5, raterId: RESEARCHER })
    svc.rate(listing.id, { score: 4, raterId: CEO })
    expect(svc.getStats().averageRating).toBe(4.33)
  })
})

describe('unpublishing and search', () => {
  it('blocks install and rate after unpublishing', () => {
    const svc = newService()
    const listing = publish(svc)
    expect(svc.unpublish(listing.id, { unpublishedBy: CEO }).status).toBe('unpublished')
    expect(codeOf(() => svc.install(listing.id, { botId: ENGINEER, installedBy: CEO }))).toBe(
      'REGISTRY_UNPUBLISHED',
    )
    expect(codeOf(() => svc.rate(listing.id, { score: 5, raterId: ENGINEER }))).toBe(
      'REGISTRY_UNPUBLISHED',
    )
    expect(codeOf(() => svc.unpublish(listing.id, { unpublishedBy: CEO }))).toBe(
      'REGISTRY_UNPUBLISHED',
    )
    expect(codeOf(() => svc.unpublish(ListingId('missing'), { unpublishedBy: CEO }))).toBe(
      'REGISTRY_LISTING_NOT_FOUND',
    )
  })

  it('searches only published listings, case-insensitively', () => {
    const svc = newService()
    const first = publish(svc, 'Code Review', '1.0.0')
    const second = svc.publish({
      name: 'Browser',
      kind: 'connector',
      version: '2.0.0',
      description: 'Web browsing toolkit',
      publisherId: CEO,
      capabilities: ['browse'],
    })
    expect(svc.search('CODE')).toHaveLength(1)
    expect(svc.search('code')[0]?.id).toBe(first.id)
    expect(svc.search('review')[0]?.id).toBe(first.id)
    expect(svc.search('browse')[0]?.id).toBe(second.id)
    expect(svc.search('', { kind: 'connector' })[0]?.id).toBe(second.id)
    expect(svc.search('', { capability: 'browse' })).toHaveLength(1)
    svc.unpublish(first.id, { unpublishedBy: CEO })
    expect(svc.search('code')).toHaveLength(0)
    expect(svc.listListings()).toHaveLength(2)
    expect(svc.getStats().publishedCount).toBe(1)
  })
})

describe('event sourcing', () => {
  it('replays a full log into an identical projection', () => {
    const svc = newService()
    const listing = publish(svc)
    svc.install(listing.id, { botId: ENGINEER, installedBy: CEO })
    svc.rate(listing.id, { score: 5, raterId: ENGINEER, comment: 'nice' })
    svc.unpublish(listing.id, { unpublishedBy: CEO })
    const restored = restoreRegistry(
      svc.events().map(entry => entry.event),
      { now },
    )
    expect(restored.getStats()).toEqual(svc.getStats())
    expect(restored.listListings()).toEqual(svc.listListings())
    expect(restored.getListing(listing.id)).toEqual(svc.getListing(listing.id))
    expect(restored.events()).toEqual(svc.events())
  })

  it('folds an injected store and notifies onCommit once per event', () => {
    const store = new MemoryRegistryStore()
    const seen: number[] = []
    const svc = new RegistryService({ now, store, onCommit: entry => seen.push(entry.seq) })
    const listing = publish(svc)
    svc.install(listing.id, { botId: ENGINEER, installedBy: CEO })
    expect(store.size).toBe(2)
    expect(seen).toEqual([1, 2])
    expect(store.readSince(1)).toHaveLength(1)
  })
})
