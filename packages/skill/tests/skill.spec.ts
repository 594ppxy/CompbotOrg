/**
 * Skill Protocol (v0.6) behaviour tests.
 *
 * All clocks are fixed, all imports of the domain package are relative, and
 * every command is checked against both its projection and its event log.
 */

import { describe, expect, it } from 'vitest'
import { BotId } from '@compbotorg/organization'
import {
  ConnectorId,
  MemorySkillStore,
  SkillError,
  SkillId,
  SkillService,
  applyEvent,
  emptyState,
  replay,
  restoreSkill,
  statsOf,
  type ConnectorProtocol,
  type LoggedSkillEvent,
  type RegisterSkillInput,
  type RiskLevel,
  type SkillErrorCode,
  type SkillEvent,
  type SkillInstalledEvent,
  type SkillKind,
  type SkillRegisteredEvent,
} from '../src/index'

const NOW = (): Date => new Date('2026-02-01T00:00:00.000Z')
const AT = '2026-02-01T00:00:00.000Z'
const CEO = BotId('bot-ceo')
const DEV = BotId('bot-dev')
const OPS = BotId('bot-ops')
const GUEST = BotId('bot-guest')

interface SkillOverrides {
  readonly name?: string
  readonly kind?: SkillKind
  readonly description?: string
  readonly version?: string
  readonly capabilities?: readonly string[]
  readonly registeredBy?: BotId
  readonly risk?: RiskLevel
  readonly manifest?: Record<string, unknown>
}

/** Build one valid registration input with optional overrides. */
function skillInput(overrides: SkillOverrides = {}): RegisterSkillInput {
  return {
    name: overrides.name ?? 'Research',
    kind: overrides.kind ?? 'expert',
    description: overrides.description ?? 'Public source research',
    version: overrides.version ?? '1.0.0',
    capabilities: overrides.capabilities ?? ['research', 'web'],
    registeredBy: overrides.registeredBy ?? CEO,
    ...(overrides.risk === undefined ? {} : { risk: overrides.risk }),
    ...(overrides.manifest === undefined ? {} : { manifest: overrides.manifest }),
  }
}

/** Assert that a command rejects with one exact closed-set error code. */
function expectReject(action: () => unknown, code: SkillErrorCode): void {
  let caught: unknown
  try {
    action()
  } catch (error: unknown) {
    caught = error
  }
  expect(caught).toBeInstanceOf(SkillError)
  expect(caught instanceof SkillError ? caught.code : undefined).toBe(code)
}

describe('SkillService — registration', () => {
  it('registers a skill with defaults and a fixed timestamp', () => {
    const service = new SkillService({ now: NOW })
    const skill = service.registerSkill(skillInput())

    expect(skill.id).toBe(SkillId('skill-1'))
    expect(skill.name).toBe('Research')
    expect(skill.kind).toBe('expert')
    expect(skill.description).toBe('Public source research')
    expect(skill.version).toBe('1.0.0')
    expect(skill.capabilities).toEqual(['research', 'web'])
    expect(skill.risk).toBe('low')
    expect(skill.manifest).toBeUndefined()
    expect(skill.registeredBy).toBe(CEO)
    expect(skill.enabled).toBe(true)
    expect(skill.installedBots).toEqual([])
    expect(skill.createdAt).toBe(AT)
    expect(skill.updatedAt).toBe(AT)
    expect(service.events().map(entry => entry.event.type)).toEqual(['skill/registered'])
    expect(service.events()[0]?.event.occurredAt).toBe(AT)
  })

  it('keeps risk and manifest, and returns detached snapshots', () => {
    const service = new SkillService({ now: NOW })
    const manifest: Record<string, unknown> = { entry: 'cli', sandbox: true }
    const skill = service.registerSkill(skillInput({ risk: 'medium', manifest }))

    expect(skill.risk).toBe('medium')
    expect(skill.manifest).toEqual(manifest)
    const read = service.getSkill(skill.id)
    expect(read?.manifest).toEqual(manifest)
    expect(read?.manifest).not.toBe(manifest)
    expect(skill.manifest).not.toBe(manifest)
    expect(read?.capabilities).not.toBe(skill.capabilities)
    expect(read?.installedBots).not.toBe(skill.installedBots)
  })

  it('rejects empty name, empty version, unknown kind and unknown risk', () => {
    const service = new SkillService({ now: NOW })
    expectReject(
      () => service.registerSkill(skillInput({ name: '   ' })),
      'SKILL_INVALID_ARGUMENT',
    )
    expectReject(
      () => service.registerSkill(skillInput({ version: '' })),
      'SKILL_INVALID_ARGUMENT',
    )
    expectReject(
      () => service.registerSkill(skillInput({ kind: 'bogus' as unknown as SkillKind })),
      'SKILL_INVALID_ARGUMENT',
    )
    expectReject(
      () => service.registerSkill(skillInput({ risk: 'critical' as unknown as RiskLevel })),
      'SKILL_INVALID_ARGUMENT',
    )
    expect(service.events()).toHaveLength(0)
    expect(service.getStats().skillCount).toBe(0)
  })

  it('rejects a duplicate name+version but accepts a new version of the same name', () => {
    const service = new SkillService({ now: NOW })
    service.registerSkill(skillInput())
    expectReject(
      () => service.registerSkill(skillInput({ description: 'Different description' })),
      'SKILL_INVALID_ARGUMENT',
    )
    const second = service.registerSkill(skillInput({ version: '2.0.0' }))
    expect(second.id).toBe(SkillId('skill-2'))
    expect(service.listSkills()).toHaveLength(2)
  })
})

describe('SkillService — connectors', () => {
  it('registers connectors and lists them in registration order', () => {
    const service = new SkillService({ now: NOW })
    const first = service.registerConnector({
      name: 'Knowledge Base',
      endpoint: 'mcp://knowledge.internal',
      protocol: 'mcp',
      registeredBy: CEO,
    })
    const second = service.registerConnector({
      name: 'Metrics API',
      endpoint: 'https://metrics.internal/v1',
      protocol: 'http',
      registeredBy: OPS,
    })

    expect(first.id).toBe(ConnectorId('connector-1'))
    expect(first.createdAt).toBe(AT)
    expect(second.id).toBe(ConnectorId('connector-2'))
    expect(service.listConnectors()).toEqual([first, second])
    expect(service.getConnector(first.id)).toEqual(first)
    expect(service.getConnector(ConnectorId('missing'))).toBeUndefined()
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'skill/connector-registered',
      'skill/connector-registered',
    ])
  })

  it('rejects invalid connector arguments and duplicates', () => {
    const service = new SkillService({ now: NOW })
    const valid = {
      name: 'Knowledge Base',
      endpoint: 'mcp://knowledge.internal',
      protocol: 'mcp' as ConnectorProtocol,
      registeredBy: CEO,
    }
    expectReject(
      () => service.registerConnector({ ...valid, name: '' }),
      'SKILL_INVALID_ARGUMENT',
    )
    expectReject(
      () => service.registerConnector({ ...valid, endpoint: '  ' }),
      'SKILL_INVALID_ARGUMENT',
    )
    expectReject(
      () =>
        service.registerConnector({
          ...valid,
          protocol: 'grpc' as unknown as ConnectorProtocol,
        }),
      'SKILL_INVALID_ARGUMENT',
    )
    expect(service.listConnectors()).toHaveLength(0)
    service.registerConnector(valid)
    expectReject(() => service.registerConnector(valid), 'SKILL_INVALID_ARGUMENT')
    expect(service.listConnectors()).toHaveLength(1)
  })
})

describe('SkillService — install, uninstall, enablement', () => {
  it('installs for several bots and de-duplicates installedBots', () => {
    const service = new SkillService({ now: NOW })
    const skill = service.registerSkill(skillInput())
    const one = service.installSkill(skill.id, { botId: DEV, installedBy: OPS })
    const two = service.installSkill(skill.id, { botId: OPS, installedBy: OPS })

    expect(one.installedBots).toEqual([DEV])
    expect(two.installedBots).toEqual([DEV, OPS])
    expect(service.skillsOf(DEV).map(entry => entry.id)).toEqual([skill.id])
    expect(service.skillsOf(GUEST)).toEqual([])
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'skill/registered',
      'skill/installed',
      'skill/installed',
    ])
  })

  it('rejects a repeated installation', () => {
    const service = new SkillService({ now: NOW })
    const skill = service.registerSkill(skillInput())
    service.installSkill(skill.id, { botId: DEV, installedBy: CEO })
    expectReject(
      () => service.installSkill(skill.id, { botId: DEV, installedBy: CEO }),
      'SKILL_ALREADY_INSTALLED',
    )
    expect(service.getSkill(skill.id)?.installedBots).toEqual([DEV])
    expect(service.events()).toHaveLength(2)
  })

  it('rejects installing an unknown skill and a disabled skill', () => {
    const service = new SkillService({ now: NOW })
    expectReject(
      () => service.installSkill(SkillId('missing'), { botId: DEV, installedBy: CEO }),
      'SKILL_NOT_FOUND',
    )
    const skill = service.registerSkill(skillInput())
    service.setEnabled(skill.id, { enabled: false, changedBy: CEO })
    expectReject(
      () => service.installSkill(skill.id, { botId: DEV, installedBy: CEO }),
      'SKILL_DISABLED',
    )
    expect(service.getSkill(skill.id)?.installedBots).toEqual([])
  })

  it('uninstalls a bot and rejects uninstalling one that is not installed', () => {
    const service = new SkillService({ now: NOW })
    const skill = service.registerSkill(skillInput())
    expectReject(
      () => service.uninstallSkill(skill.id, { botId: DEV, uninstalledBy: CEO }),
      'SKILL_NOT_INSTALLED',
    )
    expectReject(
      () => service.uninstallSkill(SkillId('missing'), { botId: DEV, uninstalledBy: CEO }),
      'SKILL_NOT_FOUND',
    )
    service.installSkill(skill.id, { botId: DEV, installedBy: CEO })
    service.installSkill(skill.id, { botId: OPS, installedBy: CEO })
    const after = service.uninstallSkill(skill.id, { botId: DEV, uninstalledBy: CEO })
    expect(after.installedBots).toEqual([OPS])
    expect(service.skillsOf(DEV)).toEqual([])
    expect(service.skillsOf(OPS).map(entry => entry.id)).toEqual([skill.id])
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'skill/registered',
      'skill/installed',
      'skill/installed',
      'skill/uninstalled',
    ])
  })

  it('enables and disables a skill with dedicated events', () => {
    const service = new SkillService({ now: NOW })
    const skill = service.registerSkill(skillInput())
    const disabled = service.setEnabled(skill.id, { enabled: false, changedBy: OPS })
    expect(disabled.enabled).toBe(false)
    expect(disabled.updatedAt).toBe(AT)
    expectReject(
      () => service.setEnabled(SkillId('missing'), { enabled: true, changedBy: CEO }),
      'SKILL_NOT_FOUND',
    )
    const enabled = service.setEnabled(skill.id, { enabled: true, changedBy: OPS })
    expect(enabled.enabled).toBe(true)
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'skill/registered',
      'skill/disabled',
      'skill/enabled',
    ])
    expect(service.installSkill(skill.id, { botId: DEV, installedBy: CEO }).installedBots).toEqual([
      DEV,
    ])
  })

  it('allows only the registrar to install a high-risk skill', () => {
    const service = new SkillService({ now: NOW })
    const risky = service.registerSkill(
      skillInput({ name: 'Deploy', risk: 'high', registeredBy: CEO }),
    )
    expectReject(
      () => service.installSkill(risky.id, { botId: DEV, installedBy: OPS }),
      'SKILL_RISKY_INSTALL',
    )
    const installed = service.installSkill(risky.id, { botId: DEV, installedBy: CEO })
    expect(installed.installedBots).toEqual([DEV])

    const medium = service.registerSkill(
      skillInput({ name: 'Lint', risk: 'medium', version: '1.1.0' }),
    )
    expect(
      service.installSkill(medium.id, { botId: OPS, installedBy: GUEST }).installedBots,
    ).toEqual([OPS])
    expect(service.getStats().highRiskCount).toBe(1)
  })
})

describe('SkillService — queries and statistics', () => {
  it('filters listSkills by kind and capability and resolves skillsOf', () => {
    const service = new SkillService({ now: NOW })
    const expert = service.registerSkill(skillInput())
    const tool = service.registerSkill(
      skillInput({ name: 'Linter', kind: 'tool', version: '2.0.0', capabilities: ['code'] }),
    )
    const workflow = service.registerSkill(
      skillInput({ name: 'Writer', kind: 'workflow', version: '3.0.0', capabilities: ['writing'] }),
    )
    service.installSkill(expert.id, { botId: DEV, installedBy: CEO })
    service.installSkill(tool.id, { botId: DEV, installedBy: CEO })

    expect(service.listSkills()).toHaveLength(3)
    expect(service.listSkills({ kind: 'tool' }).map(entry => entry.id)).toEqual([tool.id])
    expect(service.listSkills({ capability: 'writing' }).map(entry => entry.id)).toEqual([
      workflow.id,
    ])
    expect(service.listSkills({ kind: 'expert', capability: 'web' })).toHaveLength(1)
    expect(service.listSkills({ kind: 'tool', capability: 'web' })).toEqual([])
    expect(service.skillsOf(DEV).map(entry => entry.id)).toEqual([expert.id, tool.id])
  })

  it('returns undefined for unknown skills and never exposes internal arrays', () => {
    const service = new SkillService({ now: NOW })
    expect(service.getSkill(SkillId('missing'))).toBeUndefined()
    const skill = service.registerSkill(skillInput())
    const first = service.getSkill(skill.id)
    const second = service.getSkill(skill.id)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(service.listSkills()[0]).not.toBe(first)
  })

  it('computes all getStats counters as a plain JSON object', () => {
    const service = new SkillService({ now: NOW })
    expect(service.getStats()).toEqual({
      skillCount: 0,
      connectorCount: 0,
      installedCount: 0,
      enabledCount: 0,
      highRiskCount: 0,
    })

    const low = service.registerSkill(skillInput())
    const high = service.registerSkill(
      skillInput({ name: 'Deploy', version: '2.0.0', risk: 'high' }),
    )
    service.registerConnector({
      name: 'Knowledge Base',
      endpoint: 'mcp://knowledge.internal',
      protocol: 'mcp',
      registeredBy: CEO,
    })
    service.installSkill(low.id, { botId: DEV, installedBy: CEO })
    service.installSkill(low.id, { botId: OPS, installedBy: CEO })
    service.installSkill(high.id, { botId: DEV, installedBy: CEO })
    service.setEnabled(high.id, { enabled: false, changedBy: CEO })

    expect(service.getStats()).toEqual({
      skillCount: 2,
      connectorCount: 1,
      installedCount: 3,
      enabledCount: 1,
      highRiskCount: 1,
    })
    expect(JSON.parse(JSON.stringify(service.getStats()))).toEqual(service.getStats())
  })
})

describe('SkillService — log, options and replay', () => {
  it('exposes a monotonic log and notifies onCommit after folding', () => {
    const committed: LoggedSkillEvent[] = []
    const service = new SkillService({
      now: NOW,
      onCommit: (entry): void => {
        committed.push(entry)
      },
    })
    const skill = service.registerSkill(skillInput())
    service.installSkill(skill.id, { botId: DEV, installedBy: CEO })

    expect(service.events().map(entry => entry.seq)).toEqual([1, 2])
    expect(committed.map(entry => entry.seq)).toEqual([1, 2])
    expect(committed[0]?.event.type).toBe('skill/registered')
    expect(committed[1]?.event.type).toBe('skill/installed')
    expect(service.getSkill(skill.id)?.installedBots).toEqual([DEV])
  })

  it('accepts an injected store and exposes readSince and size', () => {
    const store = new MemorySkillStore()
    const service = new SkillService({ now: NOW, store })
    const skill = service.registerSkill(skillInput())
    service.installSkill(skill.id, { botId: DEV, installedBy: CEO })

    expect(store.size).toBe(2)
    expect(store.readSince(0)).toHaveLength(2)
    expect(store.readSince(1).map(entry => entry.event.type)).toEqual(['skill/installed'])
    expect(store.readSince(2)).toEqual([])
    expect(service.events()).toEqual(store.readAll())
  })

  it('honours a custom idFactory', () => {
    let counter = 0
    const service = new SkillService({
      now: NOW,
      idFactory: (): string => `custom-${++counter}`,
    })
    const first = service.registerSkill(skillInput())
    const second = service.registerSkill(skillInput({ name: 'Linter', version: '2.0.0' }))
    const connector = service.registerConnector({
      name: 'Knowledge Base',
      endpoint: 'cli://knowledge',
      protocol: 'cli',
      registeredBy: CEO,
    })
    expect(first.id).toBe(SkillId('custom-1'))
    expect(second.id).toBe(SkillId('custom-2'))
    expect(connector.id).toBe(ConnectorId('custom-3'))
  })

  it('restores a full log with identical events, state, snapshots and stats', () => {
    const service = new SkillService({ now: NOW })
    const low = service.registerSkill(skillInput())
    const high = service.registerSkill(
      skillInput({ name: 'Deploy', version: '2.0.0', risk: 'high' }),
    )
    service.registerConnector({
      name: 'Knowledge Base',
      endpoint: 'mcp://knowledge.internal',
      protocol: 'mcp',
      registeredBy: CEO,
    })
    service.installSkill(low.id, { botId: DEV, installedBy: OPS })
    service.installSkill(high.id, { botId: DEV, installedBy: CEO })
    service.uninstallSkill(low.id, { botId: DEV, uninstalledBy: OPS })
    service.setEnabled(high.id, { enabled: false, changedBy: CEO })

    let commits = 0
    const events: readonly SkillEvent[] = service.events().map(entry => entry.event)
    const restored = restoreSkill(events, {
      now: NOW,
      onCommit: (): void => {
        commits += 1
      },
    })

    expect(commits).toBe(0)
    expect(restored.events()).toEqual(service.events())
    expect(restored.getState()).toEqual(service.getState())
    expect(restored.listSkills()).toEqual(service.listSkills())
    expect(restored.listConnectors()).toEqual(service.listConnectors())
    expect(restored.skillsOf(DEV)).toEqual(service.skillsOf(DEV))
    expect(restored.getStats()).toEqual(service.getStats())
    expect(restored.getSkill(high.id)).toEqual(service.getSkill(high.id))
  })

  it('keeps a restored service deterministic when commands continue', () => {
    const original = new SkillService({ now: NOW })
    const skill = original.registerSkill(skillInput())
    original.installSkill(skill.id, { botId: DEV, installedBy: CEO })
    const restored = restoreSkill(
      original.events().map(entry => entry.event),
      { now: NOW },
    )

    const nextOriginal = original.registerSkill(
      skillInput({ name: 'Writer', kind: 'workflow', version: '4.0.0' }),
    )
    const nextRestored = restored.registerSkill(
      skillInput({ name: 'Writer', kind: 'workflow', version: '4.0.0' }),
    )
    expect(nextRestored.id).toBe(nextOriginal.id)
    expect(restored.events()).toEqual(original.events())
    expect(restored.getStats()).toEqual(original.getStats())
    expect(restored.getState()).toEqual(original.getState())
  })

  it('exposes pure projection helpers that de-duplicate replayed installs', () => {
    const registered: SkillRegisteredEvent = {
      type: 'skill/registered',
      skillId: SkillId('skill-1'),
      name: 'Research',
      kind: 'tool',
      description: '',
      version: '1.0.0',
      capabilities: ['research'],
      risk: 'high',
      registeredBy: CEO,
      occurredAt: AT,
    }
    const installed: SkillInstalledEvent = {
      type: 'skill/installed',
      skillId: registered.skillId,
      botId: DEV,
      installedBy: CEO,
      occurredAt: AT,
    }
    const initial = emptyState()
    const folded = applyEvent(initial, registered)
    expect(initial.skills.size).toBe(0)
    expect(folded.skills.size).toBe(1)
    expect(replay([registered])).toEqual(folded)
    expect(statsOf(folded)).toEqual({
      skillCount: 1,
      connectorCount: 0,
      installedCount: 0,
      enabledCount: 1,
      highRiskCount: 1,
    })

    const twice = replay([registered, installed, installed])
    expect(twice.skills.get(registered.skillId)?.installedBots).toEqual([DEV])
    expect(statsOf(twice).installedCount).toBe(1)
  })
})
