/**
 * Registry command service.
 *
 * Every command follows the same shape: validate against the current
 * projection, append exactly one event, fold it, notify the optional commit
 * hook, then return a detached snapshot. Nothing mutates state in place, so
 * the append-only log is the single source of truth and can be replayed by
 * {@link restoreRegistry} at any time.
 *
 * @module @compbotorg/registry/service
 */

import type { BotId } from '@compbotorg/organization'
import { ListingId } from './brand'
import { RegistryError } from './errors'
import type { LoggedRegistryEvent, RegistryEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryRegistryStore, type RegistryStore } from './store'
import type {
  ListingKind,
  ListingSnapshot,
  RegistryState,
  RegistryStats,
} from './types'

/** Input for {@link RegistryService.publish}. */
export interface PublishInput {
  readonly name: string
  readonly kind: ListingKind
  readonly version: string
  readonly description: string
  readonly publisherId: BotId
  readonly capabilities: readonly string[]
}

/** Input for {@link RegistryService.install}. */
export interface InstallInput {
  readonly botId: BotId
  readonly installedBy: BotId
}

/** Input for {@link RegistryService.rate}. */
export interface RateInput {
  readonly score: number
  readonly raterId: BotId
  readonly comment?: string
}

/** Input for {@link RegistryService.unpublish}. */
export interface UnpublishInput {
  readonly unpublishedBy: BotId
}

/** Filter accepted by {@link RegistryService.search}. */
export interface SearchFilter {
  readonly kind?: ListingKind
  readonly capability?: string
}

/** Construction options for {@link RegistryService}. */
export interface RegistryServiceOptions {
  /** Clock used for every event timestamp; defaults to the system clock. */
  readonly now?: () => Date
  /** Append-only log; defaults to an in-memory store. */
  readonly store?: RegistryStore
  /** Factory for new identity strings; defaults to `listing-N`. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding; never during replay. */
  readonly onCommit?: (entry: LoggedRegistryEvent) => void
}

const MAX_NAME_LENGTH = 200
const MAX_TEXT_LENGTH = 4_000
const LISTING_KINDS: readonly ListingKind[] = ['skill', 'connector', 'workflow']

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new RegistryError(`${field} must not be empty`, 'REGISTRY_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new RegistryError(`${field} must be at most ${max} characters`, 'REGISTRY_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Trim one optional text, treating blank input as absent. */
function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > max) {
    throw new RegistryError(`${field} must be at most ${max} characters`, 'REGISTRY_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Fold the stored log into current state. */
function foldStore(store: RegistryStore): RegistryState {
  return replay(store.readAll().map(entry => entry.event))
}

/** Detach one listing snapshot so callers cannot mutate folded state. */
function copyListing(snapshot: ListingSnapshot): ListingSnapshot {
  return {
    ...snapshot,
    capabilities: [...snapshot.capabilities],
    ratings: snapshot.ratings.map(rating => ({ ...rating })),
  }
}

/**
 * Marketplace publishing, installation and rating commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class RegistryService {
  private readonly store: RegistryStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedRegistryEvent) => void) | undefined
  private state: RegistryState

  /**
   * @param options - clock, store, identity factory, and commit hook.
   */
  constructor(options: RegistryServiceOptions = {}) {
    this.store = options.store ?? new MemoryRegistryStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): RegistryState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedRegistryEvent[] {
    return this.store.readAll()
  }

  /** Summary counters derived from the current projection. */
  getStats(): RegistryStats {
    return statsOf(this.state)
  }

  /** Read one Listing, or undefined when unknown. */
  getListing(id: ListingId): ListingSnapshot | undefined {
    const snapshot = this.state.listings.get(id)
    return snapshot === undefined ? undefined : copyListing(snapshot)
  }

  /** Every Listing, including unpublished ones, in publication order. */
  listListings(): ListingSnapshot[] {
    return [...this.state.listings.values()].map(copyListing)
  }

  // --------------------------------------------------------------- commands

  /**
   * Publish one capability to the marketplace.
   * @param input - name, kind, version, description, publisher and capabilities.
   * @returns the published Listing with `status === 'published'`.
   * @throws RegistryError `REGISTRY_INVALID_ARGUMENT` for empty required text
   *   or an unknown kind, and `REGISTRY_ALREADY_PUBLISHED` for a duplicate
   *   name + version pair.
   */
  publish(input: PublishInput): ListingSnapshot {
    const name = requiredText(input.name, 'listing name', MAX_NAME_LENGTH)
    const version = requiredText(input.version, 'listing version', MAX_NAME_LENGTH)
    const description = requiredText(input.description, 'listing description', MAX_TEXT_LENGTH)
    if (!LISTING_KINDS.includes(input.kind)) {
      throw new RegistryError(`unknown listing kind "${input.kind}"`, 'REGISTRY_INVALID_ARGUMENT')
    }
    if (
      [...this.state.listings.values()].some(
        listing => listing.name === name && listing.version === version,
      )
    ) {
      throw new RegistryError(
        `listing "${name}@${version}" is already published`,
        'REGISTRY_ALREADY_PUBLISHED',
      )
    }
    const listingId = this.nextListingId()
    const event: RegistryEvent = {
      type: 'registry/published',
      listingId,
      name,
      kind: input.kind,
      version,
      description,
      publisherId: input.publisherId,
      capabilities: [...input.capabilities],
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireListing(listingId)
  }

  /**
   * Record one installation of a Listing by a Bot.
   * @param listingId - Listing to install.
   * @param input - target Bot and the actor performing the installation.
   * @returns the updated Listing with an incremented `installCount`.
   * @throws RegistryError `REGISTRY_LISTING_NOT_FOUND` when unknown, or
   *   `REGISTRY_UNPUBLISHED` when the Listing has been taken down.
   */
  install(listingId: ListingId, input: InstallInput): ListingSnapshot {
    this.requirePublished(listingId)
    const event: RegistryEvent = {
      type: 'registry/installed',
      listingId,
      botId: input.botId,
      installedBy: input.installedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireListing(listingId)
  }

  /**
   * Rate one Listing. A later score by the same rater replaces the earlier one.
   * @param listingId - Listing to rate.
   * @param input - 1..5 integer score, rater, and optional comment.
   * @returns the updated Listing with a recomputed `averageRating`.
   * @throws RegistryError `REGISTRY_LISTING_NOT_FOUND` when unknown,
   *   `REGISTRY_UNPUBLISHED` when taken down, or `REGISTRY_INVALID_RATING`
   *   for a non-integer or out-of-range score.
   */
  rate(listingId: ListingId, input: RateInput): ListingSnapshot {
    this.requirePublished(listingId)
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw new RegistryError(
        'rating score must be an integer between 1 and 5',
        'REGISTRY_INVALID_RATING',
      )
    }
    const comment = optionalText(input.comment, 'rating comment', MAX_TEXT_LENGTH)
    const event: RegistryEvent = {
      type: 'registry/rated',
      listingId,
      raterId: input.raterId,
      score: input.score,
      ...(comment === undefined ? {} : { comment }),
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireListing(listingId)
  }

  /**
   * Take one Listing off the marketplace.
   * @param listingId - Listing to unpublish.
   * @param input - actor performing the change.
   * @returns the Listing with `status === 'unpublished'`.
   * @throws RegistryError `REGISTRY_LISTING_NOT_FOUND` when unknown, or
   *   `REGISTRY_UNPUBLISHED` when already unpublished.
   */
  unpublish(listingId: ListingId, input: UnpublishInput): ListingSnapshot {
    const listing = this.requireListing(listingId)
    if (listing.status === 'unpublished') {
      throw new RegistryError(`listing "${listingId}" is unpublished`, 'REGISTRY_UNPUBLISHED')
    }
    const event: RegistryEvent = {
      type: 'registry/unpublished',
      listingId,
      unpublishedBy: input.unpublishedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireListing(listingId)
  }

  /**
   * Search published Listings by free text, case-insensitively.
   * @param query - text matched against name, description and capabilities;
   *   an empty query matches every published Listing.
   * @param filter - optional kind and capability selectors.
   * @returns detached published snapshots in publication order.
   */
  search(query: string, filter: SearchFilter = {}): ListingSnapshot[] {
    const needle = query.trim().toLowerCase()
    return [...this.state.listings.values()]
      .filter(listing => listing.status === 'published')
      .filter(listing => filter.kind === undefined || listing.kind === filter.kind)
      .filter(
        listing =>
          filter.capability === undefined || listing.capabilities.includes(filter.capability),
      )
      .filter(listing => {
        if (needle === '') return true
        return (
          listing.name.toLowerCase().includes(needle) ||
          listing.description.toLowerCase().includes(needle) ||
          listing.capabilities.some(capability => capability.toLowerCase().includes(needle))
        )
      })
      .map(copyListing)
  }

  // --------------------------------------------------------------- internals

  /** Allocate one unused listing identity. */
  private nextListingId(): ListingId {
    const base = this.idFactory === undefined
      ? `listing-${this.state.listings.size + 1}`
      : this.idFactory()
    let candidate = base
    let suffix = 2
    while (this.state.listings.has(ListingId(candidate))) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return ListingId(candidate)
  }

  /** Append one event, fold it into state, then notify the commit hook. */
  private commit(event: RegistryEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Read one Listing or fail with a stable error code. */
  private requireListing(id: ListingId): ListingSnapshot {
    const snapshot = this.state.listings.get(id)
    if (snapshot === undefined) {
      throw new RegistryError(`listing "${id}" not found`, 'REGISTRY_LISTING_NOT_FOUND')
    }
    return copyListing(snapshot)
  }

  /** Read one Listing and assert it is still published. */
  private requirePublished(id: ListingId): ListingSnapshot {
    const snapshot = this.requireListing(id)
    if (snapshot.status === 'unpublished') {
      throw new RegistryError(`listing "${id}" is unpublished`, 'REGISTRY_UNPUBLISHED')
    }
    return snapshot
  }
}

/**
 * Create a service and replay an existing log.
 *
 * Restored events are folded silently: `onCommit` only observes newly
 * committed commands, never the replayed history.
 *
 * @param events - previously persisted registry events in append order.
 * @param options - clock, identity factory, and commit hook overrides; the
 *   store is replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restoreRegistry(
  events: readonly RegistryEvent[],
  options: RegistryServiceOptions = {},
): RegistryService {
  const store = new MemoryRegistryStore()
  for (const event of events) store.append(event)
  return new RegistryService({ ...options, store })
}
