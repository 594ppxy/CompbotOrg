/**
 * Durable skill protocol events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends exactly one event. Replaying the log in
 * order reproduces the projection, which is what makes skill registration,
 * installation, and enablement inside the organization auditable and
 * restorable.
 *
 * @module @compbotorg/skill/events
 */

import type { BotId } from '@compbotorg/organization'
import type { ConnectorId, SkillId } from './brand'
import type { ConnectorProtocol, RiskLevel, SkillKind } from './types'

/** Event appended when a Skill is registered. */
export interface SkillRegisteredEvent {
  readonly type: 'skill/registered'
  readonly skillId: SkillId
  readonly name: string
  readonly kind: SkillKind
  readonly description: string
  readonly version: string
  readonly capabilities: readonly string[]
  readonly risk: RiskLevel
  readonly manifest?: Record<string, unknown>
  readonly registeredBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Connector endpoint is registered. */
export interface ConnectorRegisteredEvent {
  readonly type: 'skill/connector-registered'
  readonly connectorId: ConnectorId
  readonly name: string
  readonly endpoint: string
  readonly protocol: ConnectorProtocol
  readonly registeredBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Skill is installed for one Bot. */
export interface SkillInstalledEvent {
  readonly type: 'skill/installed'
  readonly skillId: SkillId
  readonly botId: BotId
  readonly installedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Skill is uninstalled from one Bot. */
export interface SkillUninstalledEvent {
  readonly type: 'skill/uninstalled'
  readonly skillId: SkillId
  readonly botId: BotId
  readonly uninstalledBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Skill is enabled. */
export interface SkillEnabledEvent {
  readonly type: 'skill/enabled'
  readonly skillId: SkillId
  readonly changedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a Skill is disabled. */
export interface SkillDisabledEvent {
  readonly type: 'skill/disabled'
  readonly skillId: SkillId
  readonly changedBy: BotId
  readonly occurredAt: string
}

/** Every durable skill protocol event. */
export type SkillEvent =
  | SkillRegisteredEvent
  | ConnectorRegisteredEvent
  | SkillInstalledEvent
  | SkillUninstalledEvent
  | SkillEnabledEvent
  | SkillDisabledEvent

/** Discriminant of {@link SkillEvent}. */
export type SkillEventType = SkillEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedSkillEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: SkillEvent
}

/** Alias matching the generic `LoggedXEvent` name in the unified contract. */
export type LoggedEvent = LoggedSkillEvent
