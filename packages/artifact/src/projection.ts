/**
 * Pure folding of artifact events into state.
 *
 * @module @compbotorg/artifact/projection
 */

import type { ArtifactId } from './brand'
import type { ArtifactEvent } from './events'
import type {
  ArtifactSnapshot,
  ArtifactState,
  ArtifactStats,
  ArtifactVersionSnapshot,
} from './types'

/** The empty state a fold starts from. */
export function emptyState(): ArtifactState {
  return { artifacts: new Map(), versions: new Map() }
}

/** Replace one artifact while preserving map identity semantics. */
function withArtifact(
  current: ReadonlyMap<ArtifactId, ArtifactSnapshot>,
  next: ArtifactSnapshot,
): ReadonlyMap<ArtifactId, ArtifactSnapshot> {
  const copy = new Map(current)
  copy.set(next.id, next)
  return copy
}

/**
 * Fold one event into the current state. Pure and validation-free.
 * @param state - previous projection.
 * @param event - the event to apply.
 * @returns the next projection.
 */
export function applyEvent(state: ArtifactState, event: ArtifactEvent): ArtifactState {
  switch (event.type) {
    case 'artifact/created': {
      const snapshot: ArtifactSnapshot = {
        id: event.artifactId,
        title: event.title,
        kind: event.kind,
        createdBy: event.createdBy,
        namespace: event.namespace,
        ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
        tags: event.tags,
        content: event.content,
        latestVersion: 1,
        versionCount: 1,
        shares: [],
        status: 'active',
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      const initial: ArtifactVersionSnapshot = {
        id: event.versionId,
        artifactId: event.artifactId,
        version: 1,
        content: event.content,
        publishedBy: event.createdBy,
        publishedAt: event.occurredAt,
      }
      const versions = new Map(state.versions)
      versions.set(event.artifactId, [initial])
      return {
        artifacts: withArtifact(state.artifacts, snapshot),
        versions,
      }
    }
    case 'artifact/version-published': {
      const current = state.artifacts.get(event.artifactId)
      if (current === undefined) return state
      const version: ArtifactVersionSnapshot = {
        id: event.versionId,
        artifactId: event.artifactId,
        version: event.version,
        content: event.content,
        publishedBy: event.publishedBy,
        ...(event.note === undefined ? {} : { note: event.note }),
        publishedAt: event.occurredAt,
      }
      const existing = state.versions.get(event.artifactId) ?? []
      const versions = new Map(state.versions)
      versions.set(event.artifactId, [...existing, version])
      return {
        artifacts: withArtifact(state.artifacts, {
          ...current,
          content: event.content,
          latestVersion: event.version,
          versionCount: version.version,
          updatedAt: event.occurredAt,
        }),
        versions,
      }
    }
    case 'artifact/shared': {
      const current = state.artifacts.get(event.artifactId)
      if (current === undefined) return state
      return {
        ...state,
        artifacts: withArtifact(state.artifacts, {
          ...current,
          shares: [...current.shares, { botId: event.withBotId, level: event.level }],
          updatedAt: event.occurredAt,
        }),
      }
    }
    case 'artifact/share-revoked': {
      const current = state.artifacts.get(event.artifactId)
      if (current === undefined) return state
      return {
        ...state,
        artifacts: withArtifact(state.artifacts, {
          ...current,
          shares: current.shares.filter(share => share.botId !== event.withBotId),
          updatedAt: event.occurredAt,
        }),
      }
    }
    case 'artifact/archived': {
      const current = state.artifacts.get(event.artifactId)
      if (current === undefined) return state
      return {
        ...state,
        artifacts: withArtifact(state.artifacts, {
          ...current,
          status: 'archived',
          updatedAt: event.occurredAt,
        }),
      }
    }
  }
}

/**
 * Replay a full event log.
 * @param events - events in append order.
 * @returns the folded state.
 */
export function replay(events: readonly ArtifactEvent[]): ArtifactState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Derive dashboard counters.
 * @param state - current projection.
 * @returns serializable artifact statistics.
 */
export function statsOf(state: ArtifactState): ArtifactStats {
  const all = [...state.artifacts.values()]
  return {
    artifactCount: all.length,
    versionCount: [...state.versions.values()].reduce((sum, list) => sum + list.length, 0),
    activeCount: all.filter(artifact => artifact.status === 'active').length,
    archivedCount: all.filter(artifact => artifact.status === 'archived').length,
    sharedCount: all.reduce((sum, artifact) => sum + artifact.shares.length, 0),
  }
}
