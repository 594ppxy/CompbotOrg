/**
 * Durable artifact state shapes.
 *
 * @module @compbotorg/artifact/types
 */

import type { BotId } from '@compbotorg/organization'
import type { ArtifactId, VersionId } from './brand'

/** Kind of an organizational output. */
export type ArtifactKind = 'document' | 'report' | 'code' | 'data' | 'design'

/** Ownership namespace of an artifact. */
export interface ArtifactNamespace {
  readonly scope: 'organization' | 'department' | 'bot'
  readonly ownerId: string
}

/** One explicit share grant. */
export interface ArtifactShare {
  readonly botId: BotId
  readonly level: 'read' | 'write'
}

/** One artifact, folded from its events. */
export interface ArtifactSnapshot {
  readonly id: ArtifactId
  readonly title: string
  readonly kind: ArtifactKind
  readonly createdBy: BotId
  readonly namespace: ArtifactNamespace
  readonly taskId?: string
  readonly tags: readonly string[]
  readonly content: string
  readonly latestVersion: number
  readonly versionCount: number
  readonly shares: readonly ArtifactShare[]
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

/** One immutable published version. */
export interface ArtifactVersionSnapshot {
  readonly id: VersionId
  readonly artifactId: ArtifactId
  readonly version: number
  readonly content: string
  readonly publishedBy: BotId
  readonly note?: string
  readonly publishedAt: string
}

/** Complete folded artifact state. */
export interface ArtifactState {
  readonly artifacts: ReadonlyMap<ArtifactId, ArtifactSnapshot>
  readonly versions: ReadonlyMap<ArtifactId, readonly ArtifactVersionSnapshot[]>
}

/** Summary counters for dashboards. */
export interface ArtifactStats {
  readonly artifactCount: number
  readonly versionCount: number
  readonly activeCount: number
  readonly archivedCount: number
  readonly sharedCount: number
}
