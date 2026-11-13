/**
 * CompbotOrg — Policy Engine, Sandbox Guard and Audit (v0.7).
 *
 * Policies decide whether an action is allowed, denied, or held for approval;
 * every decision and every audit entry is a durable event. Governance is a
 * pure event-sourced domain core: it brands only identities owned by
 * `@compbotorg/organization` and has no runtime, transport, or UI dependency.
 *
 * Typical use:
 *
 * ```ts
 * const policies = new PolicyService({ now })
 * policies.createPolicy({ name: 'Gate deploys', action: 'deploy.*',
 *   effect: 'requires_approval', priority: 10, createdBy: CEO })
 * const verdict = policies.evaluate({ action: 'deploy.prod', actorId: ENGINEER })
 * ```
 *
 * @module @compbotorg/policy/index
 */

export { PolicyId, brand, type Branded } from './brand'

export { PolicyError, type PolicyErrorCode } from './errors'

export type {
  LoggedEvent,
  LoggedPolicyEvent,
  PolicyApprovalRequiredEvent,
  PolicyAuditAppendedEvent,
  PolicyCreatedEvent,
  PolicyEvaluatedEvent,
  PolicyEvent,
  PolicyEventType,
  PolicyRevokedEvent,
  PolicyUpdatedEvent,
} from './events'

export type {
  AuditOutcome,
  AuditSnapshot,
  EvaluationSnapshot,
  PolicyEffect,
  PolicySnapshot,
  PolicyState,
  PolicyStats,
  RiskLevel,
} from './types'

export type { PolicyStore } from './store'
export { MemoryPolicyStore } from './store'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export {
  PolicyService,
  restorePolicy,
  type CreatePolicyInput,
  type EvaluateInput,
  type PolicyServiceOptions,
  type RecordAuditInput,
  type RevokePolicyInput,
  type UpdatePolicyInput,
} from './service'

export type { AuditLogFilter, AuditLogFilter as PolicyAuditLogFilter } from './service'
