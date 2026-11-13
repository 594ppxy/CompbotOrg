/**
 * Durable skill protocol state shapes.
 *
 * Every value here is a snapshot folded from events. Snapshots are immutable;
 * a command produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/skill/types
 */

import type { BotId } from '@compbotorg/organization'
import type { ConnectorId, SkillId } from './brand'

/** Category of a registered capability. */
export type SkillKind = 'expert' | 'tool' | 'connector' | 'workflow'

/** Declared risk of installing and running one Skill. */
export type RiskLevel = 'low' | 'medium' | 'high'

/** Transport spoken by a registered Connector. */
export type ConnectorProtocol = 'mcp' | 'http' | 'cli'

/** One registered Skill and its current lifecycle state. */
export interface SkillSnapshot {
  readonly id: SkillId
  readonly name: string
  readonly kind: SkillKind
  readonly description: string
  readonly version: string
  readonly capabilities: readonly string[]
  readonly risk: RiskLevel
  /** Free-form registration metadata, copied on every returned snapshot. */
  readonly manifest?: Record<string, unknown>
  /** Member who registered the Skill; the only actor allowed to install high-risk ones. */
  readonly registeredBy: BotId
  readonly enabled: boolean
  /** Bots the Skill is installed for, de-duplicated in event order. */
  readonly installedBots: readonly BotId[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** One registered Connector endpoint. */
export interface ConnectorSnapshot {
  readonly id: ConnectorId
  readonly name: string
  readonly endpoint: string
  readonly protocol: ConnectorProtocol
  readonly registeredBy: BotId
  readonly createdAt: string
}

/** Complete folded skill protocol state. */
export interface SkillState {
  readonly skills: ReadonlyMap<SkillId, SkillSnapshot>
  readonly connectors: ReadonlyMap<ConnectorId, ConnectorSnapshot>
}

/** Summary counters for dashboards; a plain JSON-serializable object. */
export interface SkillStats {
  readonly skillCount: number
  readonly connectorCount: number
  /** Total number of (skill, bot) installations across all skills. */
  readonly installedCount: number
  readonly enabledCount: number
  readonly highRiskCount: number
}
