/**
 * Event folding into registry state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/registry/projection
 */

import type { ListingId } from './brand'
import type { RegistryEvent } from './events'
import type { ListingSnapshot, RegistryState, RegistryStats } from './types'

/** Round a mean score to two decimals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Mean of a list of scores, or 0 for an empty list. */
function mean(scores: readonly number[]): number {
  if (scores.length === 0) return 0
  return round2(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

/** The empty state a fold starts from. */
export function emptyState(): RegistryState {
  return { listings: new Map() }
}

/** Replace one listing while preserving map identity semantics. */
function withListing(
  listings: ReadonlyMap<ListingId, ListingSnapshot>,
  listingId: ListingId,
  listing: ListingSnapshot,
): ReadonlyMap<ListingId, ListingSnapshot> {
  const copy = new Map(listings)
  copy.set(listingId, listing)
  return copy
}

/** Patch one listing if it exists, otherwise return the unchanged state. */
function patchListing(
  state: RegistryState,
  listingId: ListingId,
  patch: (listing: ListingSnapshot) => ListingSnapshot,
): RegistryState {
  const listing = state.listings.get(listingId)
  if (listing === undefined) return state
  return { ...state, listings: withListing(state.listings, listingId, patch(listing)) }
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: RegistryState, event: RegistryEvent): RegistryState {
  switch (event.type) {
    case 'registry/published': {
      const listing: ListingSnapshot = {
        id: event.listingId,
        name: event.name,
        kind: event.kind,
        version: event.version,
        description: event.description,
        publisherId: event.publisherId,
        capabilities: [...event.capabilities],
        status: 'published',
        installCount: 0,
        ratings: [],
        averageRating: 0,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return {
        ...state,
        listings: withListing(state.listings, event.listingId, listing),
      }
    }

    case 'registry/installed': {
      return patchListing(state, event.listingId, listing => ({
        ...listing,
        installCount: listing.installCount + 1,
        updatedAt: event.occurredAt,
      }))
    }

    case 'registry/rated': {
      return patchListing(state, event.listingId, listing => {
        const ratings = [
          ...listing.ratings.filter(rating => rating.raterId !== event.raterId),
          {
            raterId: event.raterId,
            score: event.score,
            ...(event.comment === undefined ? {} : { comment: event.comment }),
          },
        ]
        return {
          ...listing,
          ratings,
          averageRating: mean(ratings.map(rating => rating.score)),
          updatedAt: event.occurredAt,
        }
      })
    }

    case 'registry/unpublished': {
      return patchListing(state, event.listingId, listing => ({
        ...listing,
        status: 'unpublished',
        updatedAt: event.occurredAt,
      }))
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly RegistryEvent[]): RegistryState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded registry state.
 * @returns summary counters.
 */
export function statsOf(state: RegistryState): RegistryStats {
  const listings = [...state.listings.values()]
  const allRatings = listings.flatMap(listing => listing.ratings)
  return {
    listingCount: listings.length,
    publishedCount: listings.filter(listing => listing.status === 'published').length,
    installCount: listings.reduce((sum, listing) => sum + listing.installCount, 0),
    ratingCount: allRatings.length,
    averageRating: mean(allRatings.map(rating => rating.score)),
  }
}
