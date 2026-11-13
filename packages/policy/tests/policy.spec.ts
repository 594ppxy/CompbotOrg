/**
 * Policy engine command tests.
 *
 * A fixed clock keeps event timestamps deterministic, so replay comparisons
 * are exact. Every rejection path asserts the stable error code, not text.
 *
 * @module @compbotorg/policy/tests
 */

import { BotId } from '@compbotorg/organization'
import { describe, expect, it } from 'vitest'
import {
  MemoryPolicyStore,
  PolicyError,
  PolicyId,
  PolicyService,
  restorePolicy,
  type PolicyEffect,
} from '../src/index'

const CEO = BotId('ceo')
const ENGINEER = BotId('engineer')
const AUDITOR = BotId('auditor')
const FIXED = new Date('2026-01-01T00:00:00.000Z')
const now = (): Date => FIXED

function newService(): PolicyService {
  return new PolicyService({ now })
}

/** Return the stable error code thrown by a command, or `none`. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'none'
  } catch (error) {
    return error instanceof PolicyError ? error.code : `unexpected:${String(error)}`
  }
}

describe('policy declarations', () => {
  it('creates an enabled policy with default priority', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'Deny deletes',
      action: 'artifact.delete',
      effect: 'deny',
      createdBy: CEO,
    })
    expect(policy.id).toBe('policy-1')
    expect(policy.priority).toBe(0)
    expect(policy.enabled).toBe(true)
    expect(policy.description).toBeUndefined()
    expect(policy.createdAt).toBe(FIXED.toISOString())
    expect(svc.getStats().policyCount).toBe(1)
  })

  it('rejects an empty name and an unknown effect', () => {
    const svc = newService()
    expect(
      codeOf(() =>
        svc.createPolicy({ name: '  ', action: 'task.create', effect: 'allow', createdBy: CEO }),
      ),
    ).toBe('POLICY_INVALID_ARGUMENT')
    expect(
      codeOf(() =>
        svc.createPolicy({
          name: 'Odd',
          action: 'task.create',
          effect: 'maybe' as PolicyEffect,
          createdBy: CEO,
        }),
      ),
    ).toBe('POLICY_INVALID_ARGUMENT')
    expect(svc.events()).toHaveLength(0)
  })

  it('rejects a non-finite priority', () => {
    const svc = newService()
    expect(
      codeOf(() =>
        svc.createPolicy({
          name: 'Odd',
          action: 'task.create',
          effect: 'allow',
          priority: Number.POSITIVE_INFINITY,
          createdBy: CEO,
        }),
      ),
    ).toBe('POLICY_INVALID_ARGUMENT')
  })

  it('updates effect and priority', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'Gate',
      action: 'task.create',
      effect: 'allow',
      createdBy: CEO,
    })
    const updated = svc.updatePolicy(policy.id, {
      effect: 'requires_approval',
      priority: 5,
      changedBy: CEO,
    })
    expect(updated.effect).toBe('requires_approval')
    expect(updated.priority).toBe(5)
    expect(svc.getPolicy(policy.id)?.effect).toBe('requires_approval')
  })

  it('fails to update an unknown policy', () => {
    const svc = newService()
    expect(
      codeOf(() => svc.updatePolicy(PolicyId('missing'), { changedBy: CEO })),
    ).toBe('POLICY_NOT_FOUND')
  })

  it('revokes a policy and refuses a second revocation', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'Temp',
      action: 'task.create',
      effect: 'allow',
      createdBy: CEO,
    })
    expect(svc.revokePolicy(policy.id, { revokedBy: CEO }).enabled).toBe(false)
    expect(codeOf(() => svc.revokePolicy(policy.id, { revokedBy: CEO }))).toBe('POLICY_DISABLED')
    expect(codeOf(() => svc.updatePolicy(policy.id, { changedBy: CEO }))).toBe('POLICY_DISABLED')
  })

  it('can re-enable a disabled policy explicitly', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'Temp',
      action: 'task.create',
      effect: 'allow',
      createdBy: CEO,
    })
    svc.updatePolicy(policy.id, { enabled: false, changedBy: CEO })
    expect(svc.getPolicy(policy.id)?.enabled).toBe(false)
    expect(svc.updatePolicy(policy.id, { enabled: true, changedBy: CEO }).enabled).toBe(true)
  })
})

describe('policy evaluation', () => {
  it('defaults to allow when nothing matches', () => {
    const svc = newService()
    const result = svc.evaluate({ action: 'task.create', actorId: ENGINEER })
    expect(result.decision).toBe('allow')
    expect(result.matchedPolicyId).toBeUndefined()
    expect(result.risk).toBe('low')
    expect(result.evaluatedAt).toBe(FIXED.toISOString())
  })

  it('rejects an empty action and an unknown risk', () => {
    const svc = newService()
    expect(codeOf(() => svc.evaluate({ action: ' ', actorId: ENGINEER }))).toBe(
      'POLICY_INVALID_ARGUMENT',
    )
    expect(
      codeOf(() => svc.evaluate({ action: 'task.create', actorId: ENGINEER, risk: 'extreme' as 'high' })),
    ).toBe('POLICY_INVALID_ARGUMENT')
  })

  it('matches an exact policy and records a deny', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'No deletes',
      action: 'artifact.delete',
      effect: 'deny',
      createdBy: CEO,
    })
    const result = svc.evaluate({ action: 'artifact.delete', actorId: ENGINEER, risk: 'high' })
    expect(result.decision).toBe('deny')
    expect(result.matchedPolicyId).toBe(policy.id)
    expect(result.risk).toBe('high')
    expect(svc.getStats().deniedCount).toBe(1)
  })

  it('ranks by descending priority', () => {
    const svc = newService()
    svc.createPolicy({
      name: 'Low',
      action: 'deploy.*',
      effect: 'deny',
      priority: 1,
      createdBy: CEO,
    })
    const winner = svc.createPolicy({
      name: 'High',
      action: 'deploy.*',
      effect: 'allow',
      priority: 9,
      createdBy: CEO,
    })
    const result = svc.evaluate({ action: 'deploy.prod', actorId: ENGINEER })
    expect(result.decision).toBe('allow')
    expect(result.matchedPolicyId).toBe(winner.id)
  })

  it('breaks equal-priority ties by declaration order', () => {
    const svc = newService()
    const first = svc.createPolicy({
      name: 'First',
      action: 'deploy',
      effect: 'deny',
      createdBy: CEO,
    })
    svc.createPolicy({ name: 'Second', action: 'deploy', effect: 'allow', createdBy: CEO })
    expect(svc.evaluate({ action: 'deploy', actorId: ENGINEER }).matchedPolicyId).toBe(first.id)
  })

  it('supports the global and prefix wildcards', () => {
    const svc = newService()
    const globalPolicy = svc.createPolicy({
      name: 'Global',
      action: '*',
      effect: 'deny',
      createdBy: CEO,
    })
    expect(svc.evaluate({ action: 'anything.at.all', actorId: ENGINEER }).matchedPolicyId).toBe(
      globalPolicy.id,
    )
    const prefixPolicy = svc.createPolicy({
      name: 'Prefix',
      action: 'artifact.*',
      effect: 'deny',
      priority: 10,
      createdBy: CEO,
    })
    expect(svc.evaluate({ action: 'artifact.publish', actorId: ENGINEER }).matchedPolicyId).toBe(
      prefixPolicy.id,
    )
  })

  it('ignores disabled policies', () => {
    const svc = newService()
    const policy = svc.createPolicy({
      name: 'Off',
      action: 'task.create',
      effect: 'deny',
      createdBy: CEO,
    })
    svc.revokePolicy(policy.id, { revokedBy: CEO })
    expect(svc.evaluate({ action: 'task.create', actorId: ENGINEER }).decision).toBe('allow')
  })

  it('requires_approval emits three events and a pending audit', () => {
    const svc = newService()
    svc.createPolicy({
      name: 'Approve deploys',
      action: 'deploy.*',
      effect: 'requires_approval',
      createdBy: CEO,
    })
    const before = svc.events().length
    const result = svc.evaluate({ action: 'deploy.prod', actorId: ENGINEER, context: 'prod' })
    expect(result.decision).toBe('requires_approval')
    expect(svc.events().length - before).toBe(3)
    expect(svc.getStats().approvalRequiredCount).toBe(1)
    const pending = svc.getAuditLog({ outcome: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.detail).toBe('prod')
  })

  it('records audits and filters by actor and outcome', () => {
    const svc = newService()
    svc.recordAudit({ actorId: ENGINEER, action: 'task.create', outcome: 'allowed' })
    svc.recordAudit({
      actorId: AUDITOR,
      action: 'task.create',
      outcome: 'completed',
      detail: 'reviewed',
      taskId: 'task-1',
    })
    expect(svc.getAuditLog()).toHaveLength(2)
    expect(svc.getAuditLog({ actorId: AUDITOR })).toHaveLength(1)
    expect(svc.getAuditLog({ outcome: 'allowed' })[0]?.actorId).toBe(ENGINEER)
    expect(svc.getAuditLog({ outcome: 'denied' })).toHaveLength(0)
    expect(svc.getStats().auditCount).toBe(2)
  })
})

describe('event sourcing', () => {
  it('replays a full log into an identical projection', () => {
    const svc = newService()
    svc.createPolicy({
      name: 'Gate',
      action: 'deploy.*',
      effect: 'requires_approval',
      priority: 3,
      createdBy: CEO,
    })
    svc.evaluate({ action: 'deploy.prod', actorId: ENGINEER })
    svc.recordAudit({ actorId: CEO, action: 'deploy.prod', outcome: 'completed' })
    const restored = restorePolicy(
      svc.events().map(entry => entry.event),
      { now },
    )
    expect(restored.getStats()).toEqual(svc.getStats())
    expect(restored.listPolicies()).toEqual(svc.listPolicies())
    expect(restored.getEvaluations()).toEqual(svc.getEvaluations())
    expect(restored.getAuditLog()).toEqual(svc.getAuditLog())
    expect(restored.events()).toEqual(svc.events())
  })

  it('folds an injected store and notifies onCommit once per event', () => {
    const store = new MemoryPolicyStore()
    const seen: number[] = []
    const svc = new PolicyService({
      now,
      store,
      onCommit: entry => seen.push(entry.seq),
    })
    svc.createPolicy({ name: 'A', action: 'a', effect: 'allow', createdBy: CEO })
    svc.evaluate({ action: 'a', actorId: ENGINEER })
    expect(store.size).toBe(2)
    expect(seen).toEqual([1, 2])
    expect(store.readSince(1)).toHaveLength(1)
  })
})
