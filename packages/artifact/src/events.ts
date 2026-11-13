/**
 * Durable artifact events.
 *
 * @module @compbotorg/artifact/events
 */

import type { BotId } from '@compbotorg/organization'
import type { ArtifactId, VersionId } from './brand'
import type { ArtifactKind, ArtifactNamespace } from './types'

/** Event appended when an artifact is created. */
export interface ArtifactCreatedEvent {
  readonly type: 'artifact/created'
  readonly artifactId: ArtifactId
  readonly versionId: VersionId
  readonly title: string
  readonly kind: ArtifactKind
  readonly createdBy: BotId
  readonly namespace: ArtifactNamespace
  readonly content: string
  readonly taskId?: string
  readonly tags: readonly string[]
  readonly occurredAt: string
}

/** Event appended when a new version is published. */
export interface ArtifactVersionPublishedEvent {
  readonly type: 'artifact/version-published'
  readonly artifactId: ArtifactId
  readonly versionId: VersionId
  readonly version: number
  readonly content: string
  readonly publishedBy: BotId
  readonly note?: string
  readonly occurredAt: string
}

/** Event appended when an artifact is shared with a Bot. */
export interface ArtifactSharedEvent {
  readonly type: 'artifact/shared'
  readonly artifactId: ArtifactId
  readonly withBotId: BotId
  readonly level: 'read' | 'write'
  readonly grantedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a share is revoked. */
export interface ArtifactShareRevokedEvent {
  readonly type: 'artifact/share-revoked'
  readonly artifactId: ArtifactId
  readonly withBotId: BotId
  readonly revokedBy: BotId
  readonly occurredAt: string
}

/** Event appended when an artifact is archived. */
export interface ArtifactArchivedEvent {
  readonly type: 'artifact/archived'
  readonly artifactId: ArtifactId
  readonly archivedBy: BotId
  readonly reason?: string
  readonly occurredAt: string
}

/** Discriminated union of every artifact event. */
export type ArtifactEvent =
  | ArtifactCreatedEvent
  | ArtifactVersionPublishedEvent
  | ArtifactSharedEvent
  | ArtifactShareRevokedEvent
  | ArtifactArchivedEvent

/** Discriminant values. */
export type ArtifactEventType = ArtifactEvent['type']

/** One event together with its position in the append-only log. */
export interface LoggedArtifactEvent {
  readonly seq: number
  readonly event: ArtifactEvent
}
