/**
 * Durable policy engine events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends its events. Replaying the log in order
 * reproduces the projection, which makes governance decisions auditable and
 * restorable.
 *
 * @module @compbotorg/policy/events
 */

import type { BotId } from '@compbotorg/organization'
import type { PolicyId } from './brand'
import type {
  AuditOutcome,
  PolicyEffect,
  RiskLevel,
} from './types'

/** Event appended when a policy is declared. */
export interface PolicyCreatedEvent {
  readonly type: 'policy/created'
  readonly policyId: PolicyId
  readonly name: string
  readonly action: string
  readonly effect: PolicyEffect
  readonly priority: number
  readonly description?: string
  readonly createdBy: BotId
  readonly occurredAt: string
}

/** Event appended when a policy is changed or re-enabled. */
export interface PolicyUpdatedEvent {
  readonly type: 'policy/updated'
  readonly policyId: PolicyId
  readonly effect?: PolicyEffect
  readonly priority?: number
  readonly enabled?: boolean
  readonly changedBy: BotId
  readonly occurredAt: string
}

/** Event appended when a policy is revoked (disabled permanently). */
export interface PolicyRevokedEvent {
  readonly type: 'policy/revoked'
  readonly policyId: PolicyId
  readonly revokedBy: BotId
  readonly occurredAt: string
}

/** Event appended for every evaluation, including the default `allow`. */
export interface PolicyEvaluatedEvent {
  readonly type: 'policy/evaluated'
  readonly id: string
  readonly action: string
  readonly actorId: BotId
  readonly risk: RiskLevel
  readonly decision: PolicyEffect
  readonly matchedPolicyId?: PolicyId
  readonly occurredAt: string
}

/** Event appended when an evaluation resolves to `requires_approval`. */
export interface PolicyApprovalRequiredEvent {
  readonly type: 'policy/approval-required'
  readonly id: string
  readonly evaluationId: string
  readonly policyId?: PolicyId
  readonly action: string
  readonly actorId: BotId
  readonly occurredAt: string
}

/** Event appended for every audit entry. */
export interface PolicyAuditAppendedEvent {
  readonly type: 'policy/audit-appended'
  readonly id: string
  readonly actorId: BotId
  readonly action: string
  readonly outcome: AuditOutcome
  readonly detail?: string
  readonly taskId?: string
  readonly occurredAt: string
}

/** Every durable policy engine event. */
export type PolicyEvent =
  | PolicyCreatedEvent
  | PolicyUpdatedEvent
  | PolicyRevokedEvent
  | PolicyEvaluatedEvent
  | PolicyApprovalRequiredEvent
  | PolicyAuditAppendedEvent

/** Discriminant of {@link PolicyEvent}. */
export type PolicyEventType = PolicyEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedPolicyEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: PolicyEvent
}

/** Alias matching the generic `LoggedXEvent` name in the unified contract. */
export type LoggedEvent = LoggedPolicyEvent
