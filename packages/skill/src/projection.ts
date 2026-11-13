/**
 * Event folding into skill protocol state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/skill/projection
 */

import type { ConnectorId, SkillId } from './brand'
import type { SkillEvent } from './events'
import type { ConnectorSnapshot, SkillSnapshot, SkillState, SkillStats } from './types'

/** The empty state a fold starts from. */
export function emptyState(): SkillState {
  return {
    skills: new Map(),
    connectors: new Map(),
  }
}

/** Replace one skill while preserving map identity semantics. */
function withSkill(
  skills: ReadonlyMap<SkillId, SkillSnapshot>,
  skillId: SkillId,
  skill: SkillSnapshot,
): ReadonlyMap<SkillId, SkillSnapshot> {
  const copy = new Map(skills)
  copy.set(skillId, skill)
  return copy
}

/** Replace one connector while preserving map identity semantics. */
function withConnector(
  connectors: ReadonlyMap<ConnectorId, ConnectorSnapshot>,
  connectorId: ConnectorId,
  connector: ConnectorSnapshot,
): ReadonlyMap<ConnectorId, ConnectorSnapshot> {
  const copy = new Map(connectors)
  copy.set(connectorId, connector)
  return copy
}

/** Patch one skill if it exists, otherwise return the unchanged state. */
function patchSkill(
  state: SkillState,
  skillId: SkillId,
  patch: (skill: SkillSnapshot) => SkillSnapshot,
): SkillState {
  const skill = state.skills.get(skillId)
  if (skill === undefined) return state
  return { ...state, skills: withSkill(state.skills, skillId, patch(skill)) }
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: SkillState, event: SkillEvent): SkillState {
  switch (event.type) {
    case 'skill/registered': {
      const skill: SkillSnapshot = {
        id: event.skillId,
        name: event.name,
        kind: event.kind,
        description: event.description,
        version: event.version,
        capabilities: [...event.capabilities],
        risk: event.risk,
        ...(event.manifest === undefined ? {} : { manifest: { ...event.manifest } }),
        registeredBy: event.registeredBy,
        enabled: true,
        installedBots: [],
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { ...state, skills: withSkill(state.skills, event.skillId, skill) }
    }

    case 'skill/connector-registered': {
      const connector: ConnectorSnapshot = {
        id: event.connectorId,
        name: event.name,
        endpoint: event.endpoint,
        protocol: event.protocol,
        registeredBy: event.registeredBy,
        createdAt: event.occurredAt,
      }
      return {
        ...state,
        connectors: withConnector(state.connectors, event.connectorId, connector),
      }
    }

    case 'skill/installed': {
      return patchSkill(state, event.skillId, skill => ({
        ...skill,
        installedBots: skill.installedBots.includes(event.botId)
          ? [...skill.installedBots]
          : [...skill.installedBots, event.botId],
        updatedAt: event.occurredAt,
      }))
    }

    case 'skill/uninstalled': {
      return patchSkill(state, event.skillId, skill => ({
        ...skill,
        installedBots: skill.installedBots.filter(botId => botId !== event.botId),
        updatedAt: event.occurredAt,
      }))
    }

    case 'skill/enabled': {
      return patchSkill(state, event.skillId, skill => ({
        ...skill,
        enabled: true,
        updatedAt: event.occurredAt,
      }))
    }

    case 'skill/disabled': {
      return patchSkill(state, event.skillId, skill => ({
        ...skill,
        enabled: false,
        updatedAt: event.occurredAt,
      }))
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly SkillEvent[]): SkillState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded skill protocol state.
 * @returns summary counters.
 */
export function statsOf(state: SkillState): SkillStats {
  const skills = [...state.skills.values()]
  return {
    skillCount: skills.length,
    connectorCount: state.connectors.size,
    installedCount: skills.reduce((sum, skill) => sum + skill.installedBots.length, 0),
    enabledCount: skills.filter(skill => skill.enabled).length,
    highRiskCount: skills.filter(skill => skill.risk === 'high').length,
  }
}
