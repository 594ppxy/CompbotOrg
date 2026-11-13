/**
 * CompbotOrg — Skill Protocol (v0.6).
 *
 * Skills and Connectors are registered once, installed on digital employees,
 * and enabled or disabled over time. Every change is a durable event, so a
 * company can save its skill log, restore it later, and audit exactly who
 * installed a high-risk capability for which Bot. The package has no runtime,
 * transport, or UI dependency: it only brands identities owned by
 * `@compbotorg/organization` and folds its own append-only log.
 *
 * Typical use:
 *
 * ```ts
 * const skills = new SkillService({ now })
 * const skill = skills.registerSkill({
 *   name: 'Code Review', kind: 'tool', description: 'Static analysis',
 *   version: '1.0.0', capabilities: ['code'], registeredBy: CEO,
 * })
 * skills.installSkill(skill.id, { botId: ENGINEER, installedBy: CEO })
 * ```
 *
 * @module @compbotorg/skill/index
 */

export { ConnectorId, SkillId, brand, type Branded } from './brand'

export { SkillError, type SkillErrorCode } from './errors'

export type {
  ConnectorRegisteredEvent,
  LoggedEvent,
  LoggedSkillEvent,
  SkillDisabledEvent,
  SkillEnabledEvent,
  SkillEvent,
  SkillEventType,
  SkillInstalledEvent,
  SkillRegisteredEvent,
  SkillUninstalledEvent,
} from './events'

export type {
  ConnectorProtocol,
  ConnectorSnapshot,
  RiskLevel,
  SkillKind,
  SkillSnapshot,
  SkillState,
  SkillStats,
} from './types'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemorySkillStore, type SkillStore } from './store'

export {
  SkillService,
  restoreSkill,
  type InstallSkillInput,
  type ListSkillsFilter,
  type RegisterConnectorInput,
  type RegisterSkillInput,
  type SetEnabledInput,
  type SkillServiceOptions,
  type UninstallSkillInput,
} from './service'
