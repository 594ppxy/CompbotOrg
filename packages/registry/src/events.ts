/**
 * Durable registry events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends exactly one event. Replaying the log in
 * order reproduces the projection, which makes publishing, installing and
 * rating auditable and restorable.
 *
 * @module @compbotorg/registry/events
 */

import type { BotId } from '@compbotorg/organization'
import type { ListingId } from './brand'
import type { ListingKind } from './types'

/** Event appended when a capability is published to the marketplace. */
export interface RegistryPublishedEvent {
  readonly type: 'registry/published'
  readonly listingId: ListingId
  readonly name: string
  readonly kind: ListingKind
  readonly version: string
  readonly description: string
  readonly publisherId: BotId
  readonly capabilities: readonly string[]
  readonly occurredAt: string
}

/** Event appended when a Bot installs one listing. */
export interface RegistryInstalledEvent {
  readonly type: 'registry/installed'
  readonly listingId: ListingId
  readonly botId: BotId
  readonly installedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Bot rates one listing. */
export interface RegistryRatedEvent {
  readonly type: 'registry/rated'
  readonly listingId: ListingId
  readonly raterId: BotId
  readonly score: number
  readonly comment?: string
  readonly occurredAt: string
}

/** Event appended when a listing is taken off the marketplace. */
export interface RegistryUnpublishedEvent {
  readonly type: 'registry/unpublished'
  readonly listingId: ListingId
  readonly unpublishedBy: BotId
  readonly occurredAt: string
}

/** Every durable registry event. */
export type RegistryEvent =
  | RegistryPublishedEvent
  | RegistryInstalledEvent
  | RegistryRatedEvent
  | RegistryUnpublishedEvent

/** Discriminant of {@link RegistryEvent}. */
export type RegistryEventType = RegistryEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedRegistryEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: RegistryEvent
}

/** Alias matching the generic `LoggedXEvent` name in the unified contract. */
export type LoggedEvent = LoggedRegistryEvent
