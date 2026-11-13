/**
 * CompbotOrg — Artifact FS (v0.4).
 *
 * Bots exchange typed, versioned, shareable artifacts instead of sharing a
 * folder. The package is a pure event-sourced domain core with no runtime,
 * transport, or UI dependency.
 *
 * @module @compbotorg/artifact
 */

export {
  ArtifactId,
  VersionId,
  brand,
  type Branded,
} from './brand'

export { ArtifactError, type ArtifactErrorCode } from './errors'

export type {
  ArtifactArchivedEvent,
  ArtifactCreatedEvent,
  ArtifactEvent,
  ArtifactEventType,
  ArtifactShareRevokedEvent,
  ArtifactSharedEvent,
  ArtifactVersionPublishedEvent,
  LoggedArtifactEvent,
} from './events'

export type {
  ArtifactKind,
  ArtifactNamespace,
  ArtifactShare,
  ArtifactSnapshot,
  ArtifactState,
  ArtifactStats,
  ArtifactVersionSnapshot,
} from './types'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryArtifactStore, type ArtifactStore } from './store'

export {
  ArtifactService,
  restoreArtifact,
  type ArtifactFilter,
  type ArtifactServiceOptions,
  type CreateArtifactInput,
  type PublishVersionInput,
  type ShareArtifactInput,
} from './service'
