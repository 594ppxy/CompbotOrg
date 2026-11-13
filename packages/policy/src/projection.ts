/**
 * Event folding into policy engine state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/policy/projection
 */

import type { PolicyId } from './brand'
import type { PolicyEvent } from './events'
import type {
  AuditSnapshot,
  EvaluationSnapshot,
  PolicySnapshot,
  PolicyState,
  PolicyStats,
} from './types'

/** The empty state a fold starts from. */
export function emptyState(): PolicyState {
  return {
    policies: new Map(),
    evaluations: [],
    audits: [],
    approvalRequiredCount: 0,
  }
}

/** Replace one policy while preserving map identity semantics. */
function withPolicy(
  policies: ReadonlyMap<PolicyId, PolicySnapshot>,
  policyId: PolicyId,
  policy: PolicySnapshot,
): ReadonlyMap<PolicyId, PolicySnapshot> {
  const copy = new Map(policies)
  copy.set(policyId, policy)
  return copy
}

/** Patch one policy if it exists, otherwise return the unchanged state. */
function patchPolicy(
  state: PolicyState,
  policyId: PolicyId,
  patch: (policy: PolicySnapshot) => PolicySnapshot,
): PolicyState {
  const policy = state.policies.get(policyId)
  if (policy === undefined) return state
  return { ...state, policies: withPolicy(state.policies, policyId, patch(policy)) }
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: PolicyState, event: PolicyEvent): PolicyState {
  switch (event.type) {
    case 'policy/created': {
      const policy: PolicySnapshot = {
        id: event.policyId,
        name: event.name,
        action: event.action,
        effect: event.effect,
        priority: event.priority,
        ...(event.description === undefined ? {} : { description: event.description }),
        enabled: true,
        createdBy: event.createdBy,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { ...state, policies: withPolicy(state.policies, event.policyId, policy) }
    }

    case 'policy/updated': {
      return patchPolicy(state, event.policyId, policy => ({
        ...policy,
        ...(event.effect === undefined ? {} : { effect: event.effect }),
        ...(event.priority === undefined ? {} : { priority: event.priority }),
        ...(event.enabled === undefined ? {} : { enabled: event.enabled }),
        updatedAt: event.occurredAt,
      }))
    }

    case 'policy/revoked': {
      return patchPolicy(state, event.policyId, policy => ({
        ...policy,
        enabled: false,
        updatedAt: event.occurredAt,
      }))
    }

    case 'policy/evaluated': {
      const evaluation: EvaluationSnapshot = {
        id: event.id,
        action: event.action,
        actorId: event.actorId,
        risk: event.risk,
        decision: event.decision,
        ...(event.matchedPolicyId === undefined
          ? {}
          : { matchedPolicyId: event.matchedPolicyId }),
        evaluatedAt: event.occurredAt,
      }
      return { ...state, evaluations: [...state.evaluations, evaluation] }
    }

    case 'policy/approval-required': {
      return { ...state, approvalRequiredCount: state.approvalRequiredCount + 1 }
    }

    case 'policy/audit-appended': {
      const audit: AuditSnapshot = {
        id: event.id,
        actorId: event.actorId,
        action: event.action,
        outcome: event.outcome,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
        ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
        recordedAt: event.occurredAt,
      }
      return { ...state, audits: [...state.audits, audit] }
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly PolicyEvent[]): PolicyState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded policy engine state.
 * @returns summary counters.
 */
export function statsOf(state: PolicyState): PolicyStats {
  const policies = [...state.policies.values()]
  return {
    policyCount: policies.length,
    enabledCount: policies.filter(policy => policy.enabled).length,
    evaluationCount: state.evaluations.length,
    approvalRequiredCount: state.approvalRequiredCount,
    auditCount: state.audits.length,
    deniedCount: state.evaluations.filter(item => item.decision === 'deny').length,
  }
}
