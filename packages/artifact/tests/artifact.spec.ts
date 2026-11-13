/**
 * Artifact FS unit tests: commands, rejections, access control and replay.
 *
 * @module @compbotorg/artifact/tests
 */

import { BotId } from '@compbotorg/organization'
import { describe, expect, it } from 'vitest'

import {
  ArtifactError,
  ArtifactId,
  ArtifactService,
  applyEvent,
  emptyState,
  replay,
  restoreArtifact,
  type ArtifactEvent,
} from '../src/index'

const now = (): Date => new Date('2026-01-01T00:00:00.000Z')
const CEO = BotId('bot-ceo')
const ENGINEER = BotId('bot-eng')
const RESEARCHER = BotId('bot-researcher')

const namespace = { scope: 'department', ownerId: 'dept-eng' } as const

function service(): ArtifactService {
  return new ArtifactService({ now })
}

function create(overrides: { readonly createdBy?: typeof CEO; readonly scope?: 'organization' | 'department' | 'bot'; readonly ownerId?: string } = {}) {
  const svc = service()
  const artifact = svc.createArtifact({
    title: '竞品定价报告',
    kind: 'report',
    createdBy: overrides.createdBy ?? CEO,
    namespace: {
      scope: overrides.scope ?? 'department',
      ownerId: overrides.ownerId ?? 'dept-eng',
    },
    content: '# 初版',
    taskId: 'task-1',
    tags: ['research'],
  })
  return { svc, artifact }
}

describe('artifact — creation', () => {
  it('creates an artifact with an initial version and defaults', () => {
    const { svc, artifact } = create()
    expect(artifact.title).toBe('竞品定价报告')
    expect(artifact.kind).toBe('report')
    expect(artifact.status).toBe('active')
    expect(artifact.latestVersion).toBe(1)
    expect(artifact.versionCount).toBe(1)
    expect(artifact.taskId).toBe('task-1')
    expect(artifact.tags).toEqual(['research'])
    expect(svc.getVersions(artifact.id)).toHaveLength(1)
  })

  it('assigns monotonically increasing ids', () => {
    const { svc, artifact } = create()
    const second = svc.createArtifact({
      title: '第二份', kind: 'document', createdBy: CEO, namespace,
    })
    expect(second.id).not.toBe(artifact.id)
    expect(svc.getStats().artifactCount).toBe(2)
  })

  it('rejects an empty title, empty owner, or unknown kind', () => {
    const svc = service()
    expect(() => svc.createArtifact({ title: ' ', kind: 'report', createdBy: CEO, namespace }))
      .toThrowError(ArtifactError)
    expect(() => svc.createArtifact({ title: 'x', kind: 'report', createdBy: CEO, namespace: { scope: 'bot', ownerId: '' } }))
      .toThrowError(ArtifactError)
    expect(() => svc.createArtifact({ title: 'x', kind: 'nope' as never, createdBy: CEO, namespace }))
      .toThrowError(ArtifactError)
  })

  it('filters artifacts by namespace, task and kind', () => {
    const { svc } = create()
    svc.createArtifact({ title: '代码', kind: 'code', createdBy: CEO, namespace: { scope: 'bot', ownerId: ENGINEER } })
    expect(svc.listArtifacts({ scope: 'department' })).toHaveLength(1)
    expect(svc.listArtifacts({ kind: 'code' })).toHaveLength(1)
    expect(svc.listArtifacts({ taskId: 'task-1' })).toHaveLength(1)
    expect(svc.listArtifacts({ ownerId: ENGINEER })).toHaveLength(1)
  })
})

describe('artifact — versions', () => {
  it('publishes new versions and updates the latest content', () => {
    const { svc, artifact } = create()
    const v2 = svc.publishVersion(artifact.id, { content: '# 第二版', publishedBy: ENGINEER, note: '补充数据' })
    expect(v2.version).toBe(2)
    expect(v2.note).toBe('补充数据')
    expect(svc.getVersions(artifact.id)).toHaveLength(2)
    const current = svc.getArtifact(artifact.id)
    expect(current?.content).toBe('# 第二版')
    expect(current?.latestVersion).toBe(2)
    expect(svc.getStats().versionCount).toBe(2)
  })

  it('rejects empty content and unknown artifact', () => {
    const { svc, artifact } = create()
    expect(() => svc.publishVersion(artifact.id, { content: '', publishedBy: CEO })).toThrowError(ArtifactError)
    expect(() => svc.publishVersion(ArtifactId('nope'), { content: 'x', publishedBy: CEO })).toThrowError(ArtifactError)
  })
})

describe('artifact — sharing', () => {
  it('shares, exposes access, and rejects duplicates', () => {
    const { svc, artifact } = create()
    expect(svc.canAccess(ENGINEER, artifact.id)).toBe(false)
    svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'write' })
    expect(svc.canAccess(ENGINEER, artifact.id)).toBe(true)
    expect(() => svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'read' }))
      .toThrowError(ArtifactError)
  })

  it('revokes an existing share and rejects a missing one', () => {
    const { svc, artifact } = create()
    svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'read' })
    svc.revokeShare(artifact.id, { withBotId: ENGINEER, revokedBy: CEO })
    expect(svc.canAccess(ENGINEER, artifact.id)).toBe(false)
    expect(() => svc.revokeShare(artifact.id, { withBotId: ENGINEER, revokedBy: CEO })).toThrowError(ArtifactError)
  })

  it('only the creator or a write-share holder may grant access', () => {
    const { svc, artifact } = create()
    expect(() => svc.shareArtifact(artifact.id, { withBotId: RESEARCHER, grantedBy: ENGINEER, level: 'read' }))
      .toThrowError(ArtifactError)
  })

  it('creator, org namespace, bot namespace owner and shared bots can access', () => {
    const { svc, artifact } = create()
    expect(svc.canAccess(CEO, artifact.id)).toBe(true)
    const org = svc.createArtifact({ title: '组织手册', kind: 'document', createdBy: CEO, namespace: { scope: 'organization', ownerId: 'organization' } })
    expect(svc.canAccess(RESEARCHER, org.id)).toBe(true)
    const personal = svc.createArtifact({ title: '个人笔记', kind: 'document', createdBy: CEO, namespace: { scope: 'bot', ownerId: ENGINEER } })
    expect(svc.canAccess(ENGINEER, personal.id)).toBe(true)
    expect(artifact.status).toBe('active')
  })
})

describe('artifact — archiving', () => {
  it('archives and then freezes the artifact', () => {
    const { svc, artifact } = create()
    svc.archiveArtifact(artifact.id, { archivedBy: CEO, reason: '项目结束' })
    expect(svc.getArtifact(artifact.id)?.status).toBe('archived')
    expect(() => svc.publishVersion(artifact.id, { content: 'x', publishedBy: CEO })).toThrowError(ArtifactError)
    expect(() => svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'read' })).toThrowError(ArtifactError)
    expect(() => svc.archiveArtifact(artifact.id, { archivedBy: CEO })).toThrowError(ArtifactError)
  })
})

describe('artifact — event sourcing', () => {
  it('appends exactly one event per command', () => {
    const { svc, artifact } = create()
    svc.publishVersion(artifact.id, { content: 'v2', publishedBy: CEO })
    svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'read' })
    expect(svc.events().map(entry => entry.event.type)).toEqual([
      'artifact/created', 'artifact/version-published', 'artifact/shared',
    ])
    expect(svc.events().map(entry => entry.seq)).toEqual([1, 2, 3])
  })

  it('notifies the commit hook after each successful commit', () => {
    const seen: string[] = []
    const svc = new ArtifactService({ now, onCommit: entry => seen.push(entry.event.type) })
    svc.createArtifact({ title: 'x', kind: 'report', createdBy: CEO, namespace })
    expect(seen).toEqual(['artifact/created'])
  })

  it('folds purely with applyEvent / replay', () => {
    const { svc, artifact } = create()
    svc.publishVersion(artifact.id, { content: 'v2', publishedBy: CEO })
    const events: readonly ArtifactEvent[] = svc.events().map(entry => entry.event)
    expect(replay(events)).toEqual(svc.getState())
    expect(applyEvent(emptyState(), events[0] as ArtifactEvent).artifacts.size).toBe(1)
  })

  it('restores an identical state and stats from a bare event log', () => {
    const { svc, artifact } = create()
    svc.publishVersion(artifact.id, { content: 'v2', publishedBy: CEO })
    svc.shareArtifact(artifact.id, { withBotId: ENGINEER, grantedBy: CEO, level: 'write' })
    const events = svc.events().map(entry => entry.event)
    const restored = restoreArtifact(events, { now })
    expect(restored.getState()).toEqual(svc.getState())
    expect(restored.getStats()).toEqual(svc.getStats())
    expect(restored.getVersions(artifact.id)).toEqual(svc.getVersions(artifact.id))
  })

  it('reports aggregate stats', () => {
    const { svc, artifact } = create()
    svc.archiveArtifact(artifact.id, { archivedBy: CEO })
    const stats = svc.getStats()
    expect(stats.artifactCount).toBe(1)
    expect(stats.archivedCount).toBe(1)
    expect(stats.activeCount).toBe(0)
    expect(stats.versionCount).toBe(1)
  })
})
