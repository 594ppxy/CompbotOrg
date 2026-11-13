/**
 * Artifact command service.
 *
 * Every command validates against the current projection, appends exactly one
 * event, folds it, notifies the optional commit hook, and returns a detached
 * snapshot. The event log is the only source of truth.
 *
 * @module @compbotorg/artifact/service
 */

import type { BotId } from '@compbotorg/organization'
import { ArtifactId, VersionId } from './brand'
import { ArtifactError } from './errors'
import type { ArtifactEvent, LoggedArtifactEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryArtifactStore, type ArtifactStore } from './store'
import type {
  ArtifactKind,
  ArtifactNamespace,
  ArtifactSnapshot,
  ArtifactState,
  ArtifactStats,
  ArtifactVersionSnapshot,
} from './types'

/** Input for {@link ArtifactService.createArtifact}. */
export interface CreateArtifactInput {
  readonly title: string
  readonly kind: ArtifactKind
  readonly createdBy: BotId
  readonly namespace: ArtifactNamespace
  readonly content?: string
  readonly taskId?: string
  readonly tags?: readonly string[]
}

/** Input for {@link ArtifactService.publishVersion}. */
export interface PublishVersionInput {
  readonly content: string
  readonly publishedBy: BotId
  readonly note?: string
}

/** Input for {@link ArtifactService.shareArtifact}. */
export interface ShareArtifactInput {
  readonly withBotId: BotId
  readonly grantedBy: BotId
  readonly level: 'read' | 'write'
}

/** Construction options. */
export interface ArtifactServiceOptions {
  /** Injected clock for deterministic timestamps. */
  readonly now?: () => Date
  /** Storage backend; defaults to an in-memory log. */
  readonly store?: ArtifactStore
  /** Injectable identity generator. */
  readonly idFactory?: () => string
  /** Notified after each successful commit. */
  readonly onCommit?: (entry: LoggedArtifactEvent) => void
}

/** Filter accepted by {@link ArtifactService.listArtifacts}. */
export interface ArtifactFilter {
  readonly scope?: ArtifactNamespace['scope']
  readonly ownerId?: string
  readonly taskId?: string
  readonly kind?: ArtifactKind
}

const KINDS: readonly ArtifactKind[] = ['document', 'report', 'code', 'data', 'design']

/** Fold the stored log into current state. */
function foldStore(store: ArtifactStore): ArtifactState {
  return replay(store.readAll().map(entry => entry.event))
}

/** Validate one required, bounded string. */
function requiredText(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new ArtifactError(`${field} must not be empty`, 'ARTIFACT_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Artifact, version, sharing and archiving commands. */
export class ArtifactService {
  private readonly store: ArtifactStore
  private readonly now: () => Date
  private readonly idFactory: () => string
  private readonly onCommit: ((entry: LoggedArtifactEvent) => void) | undefined
  private state: ArtifactState

  /**
   * @param options - clock, store, identity factory and commit hook.
   */
  constructor(options: ArtifactServiceOptions = {}) {
    this.store = options.store ?? new MemoryArtifactStore()
    this.now = options.now ?? (() => new Date())
    this.onCommit = options.onCommit
    this.idFactory =
      options.idFactory ??
      (() => `artifact-${this.state.artifacts.size + 1}`)
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): ArtifactState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedArtifactEvent[] {
    return this.store.readAll()
  }

  /** Serializable dashboard counters. */
  getStats(): ArtifactStats {
    return statsOf(this.state)
  }

  /** Read one artifact. */
  getArtifact(id: ArtifactId): ArtifactSnapshot | undefined {
    return this.state.artifacts.get(id)
  }

  /**
   * List artifacts, optionally filtered.
   * @param filter - namespace, task, or kind filter.
   * @returns matching snapshots in creation order.
   */
  listArtifacts(filter: ArtifactFilter = {}): ArtifactSnapshot[] {
    return [...this.state.artifacts.values()].filter(artifact => {
      if (filter.scope !== undefined && artifact.namespace.scope !== filter.scope) return false
      if (filter.ownerId !== undefined && artifact.namespace.ownerId !== filter.ownerId) return false
      if (filter.taskId !== undefined && artifact.taskId !== filter.taskId) return false
      if (filter.kind !== undefined && artifact.kind !== filter.kind) return false
      return true
    })
  }

  /** All published versions of one artifact, oldest first. */
  getVersions(id: ArtifactId): ArtifactVersionSnapshot[] {
    return [...(this.state.versions.get(id) ?? [])]
  }

  /**
   * Whether a Bot may read an artifact.
   *
   * The creator, the owner of a Bot-scoped namespace, any member for an
   * organization-scoped artifact, and explicitly shared Bots are allowed.
   * @param botId - Bot requesting access.
   * @param artifactId - artifact to inspect.
   * @returns whether access is granted.
   */
  canAccess(botId: BotId, artifactId: ArtifactId): boolean {
    const artifact = this.state.artifacts.get(artifactId)
    if (artifact === undefined) return false
    if (artifact.createdBy === botId) return true
    if (artifact.namespace.scope === 'organization') return true
    if (artifact.namespace.scope === 'bot' && artifact.namespace.ownerId === String(botId)) {
      return true
    }
    return artifact.shares.some(share => share.botId === botId)
  }

  // --------------------------------------------------------------- commands

  /**
   * Create an artifact with its initial version.
   * @param input - title, kind, owner, namespace and initial content.
   * @returns the created artifact.
   */
  createArtifact(input: CreateArtifactInput): ArtifactSnapshot {
    const title = requiredText(input.title, 'artifact title')
    const ownerId = requiredText(input.namespace.ownerId, 'namespace ownerId')
    if (!KINDS.includes(input.kind)) {
      throw new ArtifactError(`unknown artifact kind "${input.kind}"`, 'ARTIFACT_INVALID_ARGUMENT')
    }
    const artifactId = ArtifactId(this.idFactory())
    const versionId = VersionId(`${artifactId}-v1`)
    const content = input.content ?? ''
    const namespace: ArtifactNamespace = { ...input.namespace, ownerId }
    this.commit({
      type: 'artifact/created',
      artifactId,
      versionId,
      title,
      kind: input.kind,
      createdBy: input.createdBy,
      namespace,
      content,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      tags: input.tags ?? [],
      occurredAt: this.timestamp(),
    })
    return this.state.artifacts.get(artifactId) as ArtifactSnapshot
  }

  /**
   * Publish a new version of an active artifact.
   * @param artifactId - artifact to update.
   * @param input - content, publisher and optional note.
   * @returns the newly published version.
   */
  publishVersion(artifactId: ArtifactId, input: PublishVersionInput): ArtifactVersionSnapshot {
    const artifact = this.requireArtifact(artifactId)
    if (artifact.status === 'archived') {
      throw new ArtifactError(`artifact "${artifactId}" is archived`, 'ARTIFACT_ARCHIVED')
    }
    const content = requiredText(input.content, 'version content')
    const version = artifact.latestVersion + 1
    const versionId = VersionId(`${artifactId}-v${version}`)
    this.commit({
      type: 'artifact/version-published',
      artifactId,
      versionId,
      version,
      content,
      publishedBy: input.publishedBy,
      ...(input.note === undefined ? {} : { note: input.note }),
      occurredAt: this.timestamp(),
    })
    const versions = this.state.versions.get(artifactId) ?? []
    return versions[versions.length - 1] as ArtifactVersionSnapshot
  }

  /**
   * Share an artifact with a Bot.
   * @param artifactId - artifact to share.
   * @param input - target Bot, grantor and access level.
   * @returns the updated artifact.
   */
  shareArtifact(artifactId: ArtifactId, input: ShareArtifactInput): ArtifactSnapshot {
    const artifact = this.requireArtifact(artifactId)
    if (artifact.status === 'archived') {
      throw new ArtifactError(`artifact "${artifactId}" is archived`, 'ARTIFACT_ARCHIVED')
    }
    const isOwner = input.grantedBy === artifact.createdBy
    const hasWrite = artifact.shares.some(
      share => share.botId === input.grantedBy && share.level === 'write',
    )
    if (!isOwner && !hasWrite) {
      throw new ArtifactError(
        `bot "${input.grantedBy}" may not share artifact "${artifactId}"`,
        'ARTIFACT_PERMISSION_DENIED',
      )
    }
    if (artifact.shares.some(share => share.botId === input.withBotId)) {
      throw new ArtifactError(
        `artifact "${artifactId}" is already shared with "${input.withBotId}"`,
        'ARTIFACT_ALREADY_SHARED',
      )
    }
    this.commit({
      type: 'artifact/shared',
      artifactId,
      withBotId: input.withBotId,
      level: input.level,
      grantedBy: input.grantedBy,
      occurredAt: this.timestamp(),
    })
    return this.state.artifacts.get(artifactId) as ArtifactSnapshot
  }

  /**
   * Revoke one share.
   * @param artifactId - artifact to update.
   * @param input - Bot to revoke and the revoker.
   * @returns the updated artifact.
   */
  revokeShare(
    artifactId: ArtifactId,
    input: { readonly withBotId: BotId; readonly revokedBy: BotId },
  ): ArtifactSnapshot {
    const artifact = this.requireArtifact(artifactId)
    if (artifact.status === 'archived') {
      throw new ArtifactError(`artifact "${artifactId}" is archived`, 'ARTIFACT_ARCHIVED')
    }
    if (!artifact.shares.some(share => share.botId === input.withBotId)) {
      throw new ArtifactError(
        `artifact "${artifactId}" is not shared with "${input.withBotId}"`,
        'ARTIFACT_SHARE_NOT_FOUND',
      )
    }
    this.commit({
      type: 'artifact/share-revoked',
      artifactId,
      withBotId: input.withBotId,
      revokedBy: input.revokedBy,
      occurredAt: this.timestamp(),
    })
    return this.state.artifacts.get(artifactId) as ArtifactSnapshot
  }

  /**
   * Archive an artifact. Archived artifacts become immutable.
   * @param artifactId - artifact to archive.
   * @param input - archiver and optional reason.
   * @returns the updated artifact.
   */
  archiveArtifact(
    artifactId: ArtifactId,
    input: { readonly archivedBy: BotId; readonly reason?: string },
  ): ArtifactSnapshot {
    const artifact = this.requireArtifact(artifactId)
    if (artifact.status === 'archived') {
      throw new ArtifactError(`artifact "${artifactId}" is archived`, 'ARTIFACT_ARCHIVED')
    }
    this.commit({
      type: 'artifact/archived',
      artifactId,
      archivedBy: input.archivedBy,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      occurredAt: this.timestamp(),
    })
    return this.state.artifacts.get(artifactId) as ArtifactSnapshot
  }

  // --------------------------------------------------------------- internals

  /** Read one artifact or throw. */
  private requireArtifact(artifactId: ArtifactId): ArtifactSnapshot {
    const artifact = this.state.artifacts.get(artifactId)
    if (artifact === undefined) {
      throw new ArtifactError(`artifact "${artifactId}" not found`, 'ARTIFACT_NOT_FOUND')
    }
    return artifact
  }

  /** Append one event, fold it, and notify the commit hook. */
  private commit(event: ArtifactEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }
}

/**
 * Create a service and replay an existing log.
 * @param events - previously persisted events.
 * @param options - clock, commit hook and identity factory overrides.
 * @returns a service whose projection reflects the log.
 */
export function restoreArtifact(
  events: readonly ArtifactEvent[],
  options: ArtifactServiceOptions = {},
): ArtifactService {
  const store = new MemoryArtifactStore()
  for (const event of events) store.append(event)
  return new ArtifactService({ ...options, store })
}
