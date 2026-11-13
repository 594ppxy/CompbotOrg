/**
 * CompbotOrg — Registry and Marketplace (v0.8).
 *
 * Skills, Connectors and Workflows are published with versions, installed by
 * Bots, rated by their peers, and taken down when obsolete. Every change is a
 * durable event, so marketplace history is auditable and restorable. The
 * package has no runtime, transport, or UI dependency: it only brands
 * identities owned by `@compbotorg/organization` and folds its own log.
 *
 * Typical use:
 *
 * ```ts
 * const registry = new RegistryService({ now })
 * const listing = registry.publish({ name: 'Code Review', kind: 'skill',
 *   version: '1.0.0', description: 'Static analysis', publisherId: CEO,
 *   capabilities: ['code'] })
 * registry.install(listing.id, { botId: ENGINEER, installedBy: CEO })
 * ```
 *
 * @module @compbotorg/registry/index
 */

export { ListingId, brand, type Branded } from './brand'

export { RegistryError, type RegistryErrorCode } from './errors'

export type {
  LoggedEvent,
  LoggedRegistryEvent,
  RegistryEvent,
  RegistryEventType,
  RegistryInstalledEvent,
  RegistryPublishedEvent,
  RegistryRatedEvent,
  RegistryUnpublishedEvent,
} from './events'

export type {
  ListingKind,
  ListingSnapshot,
  ListingStatus,
  RatingSnapshot,
  RegistryState,
  RegistryStats,
} from './types'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryRegistryStore, type RegistryStore } from './store'

export {
  RegistryService,
  restoreRegistry,
  type InstallInput,
  type PublishInput,
  type RateInput,
  type RegistryServiceOptions,
  type SearchFilter,
  type UnpublishInput,
} from './service'
