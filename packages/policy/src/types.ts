/**
 * Durable policy engine state shapes.
 *
 * Every value here is folded from events. Snapshots are immutable; a command
 * produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/policy/types
 */

import type { BotId } from '@compbotorg/organization'
import type { PolicyId } from './brand'

/** Outcome of a policy rule: allow, deny, or hold until a manager approves. */
export type PolicyEffect = 'allow' | 'deny' | 'requires_approval'

/** Declared risk of the action being evaluated. */
export type RiskLevel = 'low' | 'medium' | 'high'

/** Lifecycle outcome recorded in the audit log. */
export type AuditOutcome = 'allowed' | 'denied' | 'pending' | 'completed'

/** One declared policy and its current lifecycle state. */
export interface PolicySnapshot {
  readonly id: PolicyId
  readonly name: string
  readonly action: string
  readonly effect: PolicyEffect
  readonly priority: number
  readonly description?: string
  readonly enabled: boolean
  readonly createdBy: BotId
  readonly createdAt: string
  readonly updatedAt: string
}

/** One immutable evaluation result. */
export interface EvaluationSnapshot {
  readonly id: string
  readonly action: string
  readonly actorId: BotId
  readonly risk: RiskLevel
  readonly decision: PolicyEffect
  readonly matchedPolicyId?: PolicyId
  readonly evaluatedAt: string
}

/** One immutable audit entry. */
export interface AuditSnapshot {
  readonly id: string
  readonly actorId: BotId
  readonly action: string
  readonly outcome: AuditOutcome
  readonly detail?: string
  readonly taskId?: string
  readonly recordedAt: string
}

/** Complete folded policy engine state. */
export interface PolicyState {
  readonly policies: ReadonlyMap<PolicyId, PolicySnapshot>
  readonly evaluations: readonly EvaluationSnapshot[]
  readonly audits: readonly AuditSnapshot[]
  /** Number of `approval-required` events folded so far. */
  readonly approvalRequiredCount: number
}

/** Summary counters for dashboards; a plain JSON-serializable object. */
export interface PolicyStats {
  readonly policyCount: number
  readonly enabledCount: number
  readonly evaluationCount: number
  readonly approvalRequiredCount: number
  readonly auditCount: number
  /** Evaluations whose decision was `deny`. */
  readonly deniedCount: number
}
