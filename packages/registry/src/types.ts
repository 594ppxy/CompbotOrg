/**
 * Durable registry state shapes.
 *
 * Every value here is folded from events. Snapshots are immutable; a command
 * produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/registry/types
 */

import type { BotId } from '@compbotorg/organization'
import type { ListingId } from './brand'

/** Kind of capability offered by a listing. */
export type ListingKind = 'skill' | 'connector' | 'workflow'

/** Publication state of a listing. */
export type ListingStatus = 'published' | 'unpublished'

/** One rating left by a Bot. A rater's later score replaces the earlier one. */
export interface RatingSnapshot {
  readonly raterId: BotId
  readonly score: number
  readonly comment?: string
}

/** One marketplace listing and its lifecycle state. */
export interface ListingSnapshot {
  readonly id: ListingId
  readonly name: string
  readonly kind: ListingKind
  readonly version: string
  readonly description: string
  readonly publisherId: BotId
  readonly capabilities: readonly string[]
  readonly status: ListingStatus
  readonly installCount: number
  readonly ratings: readonly RatingSnapshot[]
  /** Mean of all ratings, rounded to two decimals; 0 when unrated. */
  readonly averageRating: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete folded registry state. */
export interface RegistryState {
  readonly listings: ReadonlyMap<ListingId, ListingSnapshot>
}

/** Summary counters for dashboards; a plain JSON-serializable object. */
export interface RegistryStats {
  readonly listingCount: number
  readonly publishedCount: number
  readonly installCount: number
  readonly ratingCount: number
  /** Mean across all ratings of all listings, rounded to two decimals. */
  readonly averageRating: number
}
