/**
 * Skill protocol command service.
 *
 * Every command follows the same shape: validate against the current
 * projection, append exactly one event, fold it, notify the optional commit
 * hook, then return a detached snapshot. Nothing mutates state in place, so
 * the append-only log is the single source of truth and can be replayed by
 * {@link restoreSkill} at any time.
 *
 * High-risk skills are gated: only the Bot that registered a `high` risk
 * skill may install it, and a disabled skill cannot be installed at all.
 *
 * @module @compbotorg/skill/service
 */

import type { BotId } from '@compbotorg/organization'
import { ConnectorId, SkillId } from './brand'
import { SkillError } from './errors'
import type { LoggedSkillEvent, SkillEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemorySkillStore, type SkillStore } from './store'
import type {
  ConnectorProtocol,
  ConnectorSnapshot,
  RiskLevel,
  SkillKind,
  SkillSnapshot,
  SkillState,
  SkillStats,
} from './types'

/** Input for {@link SkillService.registerSkill}. */
export interface RegisterSkillInput {
  readonly name: string
  readonly kind: SkillKind
  readonly description: string
  readonly version: string
  readonly capabilities: readonly string[]
  readonly registeredBy: BotId
  readonly risk?: RiskLevel
  readonly manifest?: Record<string, unknown>
}

/** Input for {@link SkillService.registerConnector}. */
export interface RegisterConnectorInput {
  readonly name: string
  readonly endpoint: string
  readonly protocol: ConnectorProtocol
  readonly registeredBy: BotId
}

/** Input for {@link SkillService.installSkill}. */
export interface InstallSkillInput {
  readonly botId: BotId
  readonly installedBy: BotId
}

/** Input for {@link SkillService.uninstallSkill}. */
export interface UninstallSkillInput {
  readonly botId: BotId
  readonly uninstalledBy: BotId
}

/** Input for {@link SkillService.setEnabled}. */
export interface SetEnabledInput {
  readonly enabled: boolean
  readonly changedBy: BotId
}

/** Filter accepted by {@link SkillService.listSkills}. */
export interface ListSkillsFilter {
  readonly kind?: SkillKind
  readonly capability?: string
}

/** Construction options for {@link SkillService}. */
export interface SkillServiceOptions {
  /** Clock used for every event timestamp; defaults to the system clock. */
  readonly now?: () => Date
  /** Append-only log; defaults to an in-memory store. */
  readonly store?: SkillStore
  /** Factory for new identity strings; defaults to `skill-N` / `connector-N`. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding; never during replay. */
  readonly onCommit?: (entry: LoggedSkillEvent) => void
}

const MAX_NAME_LENGTH = 200
const MAX_TEXT_LENGTH = 4_000
const SKILL_KINDS: readonly SkillKind[] = ['expert', 'tool', 'connector', 'workflow']
const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high']
const CONNECTOR_PROTOCOLS: readonly ConnectorProtocol[] = ['mcp', 'http', 'cli']

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new SkillError(`${field} must not be empty`, 'SKILL_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new SkillError(`${field} must be at most ${max} characters`, 'SKILL_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Fold the stored log into current state. */
function foldStore(store: SkillStore): SkillState {
  return replay(store.readAll().map(entry => entry.event))
}

/** Detach one skill snapshot so callers cannot mutate folded state. */
function copySkill(snapshot: SkillSnapshot): SkillSnapshot {
  return {
    ...snapshot,
    capabilities: [...snapshot.capabilities],
    installedBots: [...snapshot.installedBots],
    ...(snapshot.manifest === undefined ? {} : { manifest: { ...snapshot.manifest } }),
  }
}

/** Detach one connector snapshot so callers cannot mutate folded state. */
function copyConnector(snapshot: ConnectorSnapshot): ConnectorSnapshot {
  return { ...snapshot }
}

/**
 * Skill and connector registration, installation, and enablement commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class SkillService {
  private readonly store: SkillStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedSkillEvent) => void) | undefined
  private state: SkillState

  /**
   * @param options - clock, store, identity factory, and commit hook.
   */
  constructor(options: SkillServiceOptions = {}) {
    this.store = options.store ?? new MemorySkillStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): SkillState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedSkillEvent[] {
    return this.store.readAll()
  }

  /** Summary counters derived from the current projection. */
  getStats(): SkillStats {
    return statsOf(this.state)
  }

  /** Read one Skill, or undefined when unknown. */
  getSkill(id: SkillId): SkillSnapshot | undefined {
    const snapshot = this.state.skills.get(id)
    return snapshot === undefined ? undefined : copySkill(snapshot)
  }

  /**
   * List Skills in registration order, optionally filtered by kind and capability.
   * @param filter - optional kind and capability selectors.
   * @returns detached snapshots matching every supplied selector.
   */
  listSkills(filter: ListSkillsFilter = {}): SkillSnapshot[] {
    return [...this.state.skills.values()]
      .filter(skill => filter.kind === undefined || skill.kind === filter.kind)
      .filter(
        skill =>
          filter.capability === undefined || skill.capabilities.includes(filter.capability),
      )
      .map(copySkill)
  }

  /**
   * List Skills installed for one Bot.
   * @param botId - Bot identity to look up.
   * @returns detached snapshots in registration order.
   */
  skillsOf(botId: BotId): SkillSnapshot[] {
    return this.listSkills().filter(skill => skill.installedBots.includes(botId))
  }

  /** Every registered Connector, in registration order. */
  listConnectors(): ConnectorSnapshot[] {
    return [...this.state.connectors.values()].map(copyConnector)
  }

  /** Read one Connector, or undefined when unknown. */
  getConnector(id: ConnectorId): ConnectorSnapshot | undefined {
    const connector = this.state.connectors.get(id)
    return connector === undefined ? undefined : copyConnector(connector)
  }

  // --------------------------------------------------------------- commands

  /**
   * Register one Skill, enabled by default with no installed Bots.
   * @param input - name, kind, description, version, capabilities, registrar,
   *   and optional risk and manifest.
   * @returns the registered Skill.
   * @throws SkillError `SKILL_INVALID_ARGUMENT` for empty name/version,
   *   unknown kind/risk, or a duplicate name+version registration.
   */
  registerSkill(input: RegisterSkillInput): SkillSnapshot {
    const name = requiredText(input.name, 'skill name', MAX_NAME_LENGTH)
    const version = requiredText(input.version, 'skill version', MAX_NAME_LENGTH)
    const description = input.description.trim()
    if (description.length > MAX_TEXT_LENGTH) {
      throw new SkillError(
        `skill description must be at most ${MAX_TEXT_LENGTH} characters`,
        'SKILL_INVALID_ARGUMENT',
      )
    }
    if (!SKILL_KINDS.includes(input.kind)) {
      throw new SkillError(`unknown skill kind "${input.kind}"`, 'SKILL_INVALID_ARGUMENT')
    }
    const risk = input.risk ?? 'low'
    if (!RISK_LEVELS.includes(risk)) {
      throw new SkillError(`unknown risk level "${risk}"`, 'SKILL_INVALID_ARGUMENT')
    }
    const capabilities: readonly string[] = [...input.capabilities]
    const manifest = input.manifest === undefined ? undefined : { ...input.manifest }
    if (
      [...this.state.skills.values()].some(
        skill => skill.name === name && skill.version === version,
      )
    ) {
      throw new SkillError(
        `skill "${name}@${version}" is already registered`,
        'SKILL_INVALID_ARGUMENT',
      )
    }
    const skillId = SkillId(this.nextId('skill'))
    const event: SkillEvent = {
      type: 'skill/registered',
      skillId,
      name,
      kind: input.kind,
      description,
      version,
      capabilities,
      risk,
      ...(manifest === undefined ? {} : { manifest }),
      registeredBy: input.registeredBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireSkill(skillId)
  }

  /**
   * Register one Connector endpoint.
   * @param input - name, endpoint, protocol, and registrar.
   * @returns the registered Connector.
   * @throws SkillError `SKILL_INVALID_ARGUMENT` for empty name/endpoint,
   *   unknown protocol, or a duplicate name+endpoint registration.
   */
  registerConnector(input: RegisterConnectorInput): ConnectorSnapshot {
    const name = requiredText(input.name, 'connector name', MAX_NAME_LENGTH)
    const endpoint = requiredText(input.endpoint, 'connector endpoint', MAX_TEXT_LENGTH)
    if (!CONNECTOR_PROTOCOLS.includes(input.protocol)) {
      throw new SkillError(`unknown protocol "${input.protocol}"`, 'SKILL_INVALID_ARGUMENT')
    }
    if (
      [...this.state.connectors.values()].some(
        connector => connector.name === name && connector.endpoint === endpoint,
      )
    ) {
      throw new SkillError(
        `connector "${name}@${endpoint}" is already registered`,
        'SKILL_INVALID_ARGUMENT',
      )
    }
    const connectorId = ConnectorId(this.nextId('connector'))
    const event: SkillEvent = {
      type: 'skill/connector-registered',
      connectorId,
      name,
      endpoint,
      protocol: input.protocol,
      registeredBy: input.registeredBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireConnector(connectorId)
  }

  /**
   * Install one Skill for one Bot.
   * @param skillId - Skill to install.
   * @param input - target Bot and the actor performing the installation.
   * @returns the updated Skill.
   * @throws SkillError `SKILL_NOT_FOUND` when the Skill is unknown,
   *   `SKILL_DISABLED` when it is disabled, `SKILL_ALREADY_INSTALLED` when the
   *   Bot already has it, or `SKILL_RISKY_INSTALL` when a high-risk Skill is
   *   installed by anyone other than its registrar.
   */
  installSkill(skillId: SkillId, input: InstallSkillInput): SkillSnapshot {
    const skill = this.requireSkill(skillId)
    if (!skill.enabled) {
      throw new SkillError(`skill "${skillId}" is disabled`, 'SKILL_DISABLED')
    }
    if (skill.installedBots.includes(input.botId)) {
      throw new SkillError(
        `skill "${skillId}" is already installed for "${input.botId}"`,
        'SKILL_ALREADY_INSTALLED',
      )
    }
    if (skill.risk === 'high' && input.installedBy !== skill.registeredBy) {
      throw new SkillError(
        `skill "${skillId}" is high risk and may only be installed by its registrar`,
        'SKILL_RISKY_INSTALL',
      )
    }
    const event: SkillEvent = {
      type: 'skill/installed',
      skillId,
      botId: input.botId,
      installedBy: input.installedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireSkill(skillId)
  }

  /**
   * Uninstall one Skill from one Bot.
   * @param skillId - Skill to uninstall.
   * @param input - target Bot and the actor performing the uninstallation.
   * @returns the updated Skill.
   * @throws SkillError `SKILL_NOT_FOUND` when the Skill is unknown, or
   *   `SKILL_NOT_INSTALLED` when the Bot never had that Skill installed.
   */
  uninstallSkill(skillId: SkillId, input: UninstallSkillInput): SkillSnapshot {
    const skill = this.requireSkill(skillId)
    if (!skill.installedBots.includes(input.botId)) {
      throw new SkillError(
        `skill "${skillId}" is not installed for "${input.botId}"`,
        'SKILL_NOT_INSTALLED',
      )
    }
    const event: SkillEvent = {
      type: 'skill/uninstalled',
      skillId,
      botId: input.botId,
      uninstalledBy: input.uninstalledBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireSkill(skillId)
  }

  /**
   * Enable or disable one Skill.
   * @param skillId - Skill to change.
   * @param input - desired enabled state and the actor making the change.
   * @returns the updated Skill.
   * @throws SkillError `SKILL_NOT_FOUND` when the Skill is unknown.
   */
  setEnabled(skillId: SkillId, input: SetEnabledInput): SkillSnapshot {
    this.requireSkill(skillId)
    const event: SkillEvent = input.enabled
      ? {
          type: 'skill/enabled',
          skillId,
          changedBy: input.changedBy,
          occurredAt: this.timestamp(),
        }
      : {
          type: 'skill/disabled',
          skillId,
          changedBy: input.changedBy,
          occurredAt: this.timestamp(),
        }
    this.commit(event)
    return this.requireSkill(skillId)
  }

  // --------------------------------------------------------------- internals

  /** Allocate one unused identity string for a new Skill or Connector. */
  private nextId(prefix: 'skill' | 'connector'): string {
    const base =
      this.idFactory === undefined
        ? `${prefix}-${
            prefix === 'skill' ? this.state.skills.size + 1 : this.state.connectors.size + 1
          }`
        : this.idFactory()
    let candidate = base
    let suffix = 2
    while (
      this.state.skills.has(SkillId(candidate)) ||
      this.state.connectors.has(ConnectorId(candidate))
    ) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  /** Append one event, fold it into state, then notify the commit hook. */
  private commit(event: SkillEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Read one Skill or fail with a stable error code. */
  private requireSkill(id: SkillId): SkillSnapshot {
    const snapshot = this.state.skills.get(id)
    if (snapshot === undefined) {
      throw new SkillError(`skill "${id}" not found`, 'SKILL_NOT_FOUND')
    }
    return copySkill(snapshot)
  }

  /** Read one Connector or fail with a stable error code. */
  private requireConnector(id: ConnectorId): ConnectorSnapshot {
    const connector = this.state.connectors.get(id)
    if (connector === undefined) {
      throw new SkillError(`connector "${id}" not found`, 'CONNECTOR_NOT_FOUND')
    }
    return copyConnector(connector)
  }
}

/**
 * Create a service and replay an existing log.
 *
 * Restored events are folded silently: `onCommit` only observes newly
 * committed commands, never the replayed history.
 *
 * @param events - previously persisted skill events in append order.
 * @param options - clock, identity factory, and commit hook overrides; the
 *   store is replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restoreSkill(
  events: readonly SkillEvent[],
  options: SkillServiceOptions = {},
): SkillService {
  const store = new MemorySkillStore()
  for (const event of events) store.append(event)
  return new SkillService({ ...options, store })
}
