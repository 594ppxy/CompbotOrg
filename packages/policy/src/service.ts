/**
 * Policy engine command service.
 *
 * Every command follows the same shape: validate against the current
 * projection, append its events, fold them, notify the optional commit hook,
 * then return a detached snapshot. Nothing mutates state in place, so the
 * append-only log is the single source of truth and can be replayed by
 * {@link restorePolicy} at any time.
 *
 * An evaluation that resolves to `requires_approval` commits three events:
 * the evaluation itself, an approval request, and a `pending` audit entry.
 *
 * @module @compbotorg/policy/service
 */

import type { BotId } from '@compbotorg/organization'
import { PolicyId } from './brand'
import { PolicyError } from './errors'
import type { LoggedPolicyEvent, PolicyEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryPolicyStore, type PolicyStore } from './store'
import type {
  AuditOutcome,
  AuditSnapshot,
  EvaluationSnapshot,
  PolicyEffect,
  PolicySnapshot,
  PolicyState,
  PolicyStats,
  RiskLevel,
} from './types'

/** Input for {@link PolicyService.createPolicy}. */
export interface CreatePolicyInput {
  readonly name: string
  readonly action: string
  readonly effect: PolicyEffect
  readonly priority?: number
  readonly description?: string
  readonly createdBy: BotId
}

/** Input for {@link PolicyService.updatePolicy}. */
export interface UpdatePolicyInput {
  readonly effect?: PolicyEffect
  readonly priority?: number
  readonly enabled?: boolean
  readonly changedBy: BotId
}

/** Input for {@link PolicyService.revokePolicy}. */
export interface RevokePolicyInput {
  readonly revokedBy: BotId
}

/** Input for {@link PolicyService.evaluate}. */
export interface EvaluateInput {
  readonly action: string
  readonly actorId: BotId
  readonly risk?: RiskLevel
  readonly context?: string
}

/** Input for {@link PolicyService.recordAudit}. */
export interface RecordAuditInput {
  readonly actorId: BotId
  readonly action: string
  readonly outcome: AuditOutcome
  readonly detail?: string
  readonly taskId?: string
}

/** Filter accepted by {@link PolicyService.getAuditLog}. */
export interface AuditLogFilter {
  readonly actorId?: BotId
  readonly outcome?: AuditOutcome
}

/** Construction options for {@link PolicyService}. */
export interface PolicyServiceOptions {
  /** Clock used for every event timestamp; defaults to the system clock. */
  readonly now?: () => Date
  /** Append-only log; defaults to an in-memory store. */
  readonly store?: PolicyStore
  /** Factory for new identity strings; defaults to `policy-N` / `eval-N` etc. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding; never during replay. */
  readonly onCommit?: (entry: LoggedPolicyEvent) => void
}

const MAX_NAME_LENGTH = 200
const MAX_TEXT_LENGTH = 4_000
const POLICY_EFFECTS: readonly PolicyEffect[] = ['allow', 'deny', 'requires_approval']
const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high']
const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['allowed', 'denied', 'pending', 'completed']

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new PolicyError(`${field} must not be empty`, 'POLICY_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new PolicyError(`${field} must be at most ${max} characters`, 'POLICY_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Trim one optional text, treating blank input as absent. */
function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > max) {
    throw new PolicyError(`${field} must be at most ${max} characters`, 'POLICY_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Fold the stored log into current state. */
function foldStore(store: PolicyStore): PolicyState {
  return replay(store.readAll().map(entry => entry.event))
}

/** Detach one policy snapshot so callers cannot mutate folded state. */
function copyPolicy(snapshot: PolicySnapshot): PolicySnapshot {
  return { ...snapshot }
}

/** Detach one evaluation snapshot so callers cannot mutate folded state. */
function copyEvaluation(snapshot: EvaluationSnapshot): EvaluationSnapshot {
  return { ...snapshot }
}

/** Detach one audit snapshot so callers cannot mutate folded state. */
function copyAudit(snapshot: AuditSnapshot): AuditSnapshot {
  return { ...snapshot }
}

/**
 * Policy declaration, evaluation and audit commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class PolicyService {
  private readonly store: PolicyStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedPolicyEvent) => void) | undefined
  private state: PolicyState

  /**
   * @param options - clock, store, identity factory, and commit hook.
   */
  constructor(options: PolicyServiceOptions = {}) {
    this.store = options.store ?? new MemoryPolicyStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): PolicyState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedPolicyEvent[] {
    return this.store.readAll()
  }

  /** Summary counters derived from the current projection. */
  getStats(): PolicyStats {
    return statsOf(this.state)
  }

  /** Read one Policy, or undefined when unknown. */
  getPolicy(id: PolicyId): PolicySnapshot | undefined {
    const snapshot = this.state.policies.get(id)
    return snapshot === undefined ? undefined : copyPolicy(snapshot)
  }

  /** Every declared Policy, in declaration order. */
  listPolicies(): PolicySnapshot[] {
    return [...this.state.policies.values()].map(copyPolicy)
  }

  /** Every evaluation result, in evaluation order. */
  getEvaluations(): EvaluationSnapshot[] {
    return this.state.evaluations.map(copyEvaluation)
  }

  /**
   * Read the audit log, optionally filtered by actor and outcome.
   * @param filter - optional actor and outcome selectors.
   * @returns detached audit entries in append order.
   */
  getAuditLog(filter: AuditLogFilter = {}): AuditSnapshot[] {
    return this.state.audits
      .filter(audit => filter.actorId === undefined || audit.actorId === filter.actorId)
      .filter(audit => filter.outcome === undefined || audit.outcome === filter.outcome)
      .map(copyAudit)
  }

  // --------------------------------------------------------------- commands

  /**
   * Declare one enabled Policy.
   * @param input - name, action pattern, effect, optional priority and
   *   description, and the declaring Bot.
   * @returns the declared Policy.
   * @throws PolicyError `POLICY_INVALID_ARGUMENT` for empty name/action, an
   *   unknown effect/risk, or a non-finite priority.
   */
  createPolicy(input: CreatePolicyInput): PolicySnapshot {
    const name = requiredText(input.name, 'policy name', MAX_NAME_LENGTH)
    const action = requiredText(input.action, 'policy action', MAX_NAME_LENGTH)
    if (!POLICY_EFFECTS.includes(input.effect)) {
      throw new PolicyError(`unknown effect "${input.effect}"`, 'POLICY_INVALID_ARGUMENT')
    }
    const priority = input.priority ?? 0
    if (!Number.isFinite(priority)) {
      throw new PolicyError('policy priority must be finite', 'POLICY_INVALID_ARGUMENT')
    }
    const description = optionalText(input.description, 'policy description', MAX_TEXT_LENGTH)
    const policyId = this.nextPolicyId()
    const event: PolicyEvent = {
      type: 'policy/created',
      policyId,
      name,
      action,
      effect: input.effect,
      priority,
      ...(description === undefined ? {} : { description }),
      createdBy: input.createdBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requirePolicy(policyId)
  }

  /**
   * Change the effect, priority, or enabled state of a Policy.
   * @param id - Policy to change.
   * @param input - fields to change and the actor making the change.
   * @returns the updated Policy.
   * @throws PolicyError `POLICY_NOT_FOUND` when the Policy is unknown,
   *   `POLICY_DISABLED` when it is disabled and not being re-enabled, or
   *   `POLICY_INVALID_ARGUMENT` for an unknown effect / non-finite priority.
   */
  updatePolicy(id: PolicyId, input: UpdatePolicyInput): PolicySnapshot {
    const policy = this.requirePolicy(id)
    if (!policy.enabled && input.enabled !== true) {
      throw new PolicyError(`policy "${id}" is disabled`, 'POLICY_DISABLED')
    }
    if (input.effect !== undefined && !POLICY_EFFECTS.includes(input.effect)) {
      throw new PolicyError(`unknown effect "${input.effect}"`, 'POLICY_INVALID_ARGUMENT')
    }
    if (input.priority !== undefined && !Number.isFinite(input.priority)) {
      throw new PolicyError('policy priority must be finite', 'POLICY_INVALID_ARGUMENT')
    }
    const event: PolicyEvent = {
      type: 'policy/updated',
      policyId: id,
      ...(input.effect === undefined ? {} : { effect: input.effect }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      changedBy: input.changedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requirePolicy(id)
  }

  /**
   * Revoke one Policy, disabling it permanently.
   * @param id - Policy to revoke.
   * @param input - actor performing the revocation.
   * @returns the revoked Policy with `enabled === false`.
   * @throws PolicyError `POLICY_NOT_FOUND` when unknown, or `POLICY_DISABLED`
   *   when the Policy is already disabled.
   */
  revokePolicy(id: PolicyId, input: RevokePolicyInput): PolicySnapshot {
    const policy = this.requirePolicy(id)
    if (!policy.enabled) {
      throw new PolicyError(`policy "${id}" is already disabled`, 'POLICY_DISABLED')
    }
    const event: PolicyEvent = {
      type: 'policy/revoked',
      policyId: id,
      revokedBy: input.revokedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requirePolicy(id)
  }

  /**
   * Evaluate one action against the active Policies.
   *
   * Matching rules (in order): exact `action`, the `*` wildcard, or a `prefix*`
   * policy whose prefix the action starts with. Candidates are ranked by
   * descending priority, then ascending creation time, then declaration order.
   * With no match the decision defaults to `allow`. A `requires_approval`
   * decision additionally commits an approval request and a `pending` audit.
   *
   * @param input - action, actor, optional risk and free-form context.
   * @returns the immutable evaluation result.
   * @throws PolicyError `POLICY_INVALID_ARGUMENT` for an empty action or an
   *   unknown risk level.
   */
  evaluate(input: EvaluateInput): EvaluationSnapshot {
    const action = requiredText(input.action, 'action', MAX_NAME_LENGTH)
    const risk = input.risk ?? 'low'
    if (!RISK_LEVELS.includes(risk)) {
      throw new PolicyError(`unknown risk level "${risk}"`, 'POLICY_INVALID_ARGUMENT')
    }
    const context = optionalText(input.context, 'context', MAX_TEXT_LENGTH)
    const matched = this.matchPolicy(action)
    const decision: PolicyEffect = matched?.effect ?? 'allow'
    const evaluationId = this.allocate('eval', new Set(this.state.evaluations.map(item => item.id)))
    const occurredAt = this.timestamp()
    const evaluated: PolicyEvent = {
      type: 'policy/evaluated',
      id: evaluationId,
      action,
      actorId: input.actorId,
      risk,
      decision,
      ...(matched === undefined ? {} : { matchedPolicyId: matched.id }),
      occurredAt,
    }
    this.commit(evaluated)

    if (decision === 'requires_approval') {
      const approvalId = this.allocate(
        'approval',
        new Set<string>(),
        this.state.approvalRequiredCount + 1,
      )
      const approval: PolicyEvent = {
        type: 'policy/approval-required',
        id: approvalId,
        evaluationId,
        ...(matched === undefined ? {} : { policyId: matched.id }),
        action,
        actorId: input.actorId,
        occurredAt: this.timestamp(),
      }
      this.commit(approval)
      const audit: PolicyEvent = {
        type: 'policy/audit-appended',
        id: this.allocate('audit', new Set(this.state.audits.map(item => item.id))),
        actorId: input.actorId,
        action,
        outcome: 'pending',
        ...(context === undefined ? {} : { detail: context }),
        occurredAt: this.timestamp(),
      }
      this.commit(audit)
    }

    const last = this.state.evaluations[this.state.evaluations.length - 1]
    if (last === undefined) {
      throw new PolicyError('evaluation was not recorded', 'POLICY_INVALID_ARGUMENT')
    }
    return copyEvaluation(last)
  }

  /**
   * Append one audit entry.
   * @param input - actor, action, outcome, and optional detail / task id.
   * @returns the recorded audit entry.
   * @throws PolicyError `POLICY_INVALID_ARGUMENT` for an empty action, an
   *   unknown outcome, or overlong optional text.
   */
  recordAudit(input: RecordAuditInput): AuditSnapshot {
    const action = requiredText(input.action, 'action', MAX_NAME_LENGTH)
    if (!AUDIT_OUTCOMES.includes(input.outcome)) {
      throw new PolicyError(`unknown outcome "${input.outcome}"`, 'POLICY_INVALID_ARGUMENT')
    }
    const detail = optionalText(input.detail, 'detail', MAX_TEXT_LENGTH)
    const taskId = optionalText(input.taskId, 'taskId', MAX_NAME_LENGTH)
    const event: PolicyEvent = {
      type: 'policy/audit-appended',
      id: this.allocate('audit', new Set(this.state.audits.map(item => item.id))),
      actorId: input.actorId,
      action,
      outcome: input.outcome,
      ...(detail === undefined ? {} : { detail }),
      ...(taskId === undefined ? {} : { taskId }),
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    const last = this.state.audits[this.state.audits.length - 1]
    if (last === undefined) {
      throw new PolicyError('audit entry was not recorded', 'POLICY_INVALID_ARGUMENT')
    }
    return copyAudit(last)
  }

  // --------------------------------------------------------------- internals

  /** Rank active policies and return the winner, if any. */
  private matchPolicy(action: string): PolicySnapshot | undefined {
    const candidates = [...this.state.policies.values()]
      .map((policy, index) => ({ policy, index }))
      .filter(policy => policy.policy.enabled)
      .filter(
        ({ policy }) =>
          policy.action === action ||
          policy.action === '*' ||
          action.startsWith(policy.action.replace(/\*$/, '')),
      )
      .sort(
        (a, b) =>
          b.policy.priority - a.policy.priority ||
          a.policy.createdAt.localeCompare(b.policy.createdAt) ||
          a.index - b.index,
      )
    return candidates[0]?.policy
  }

  /** Allocate one unused identity string. */
  private allocate(prefix: string, used: ReadonlySet<string>, seed?: number): string {
    const base =
      this.idFactory === undefined ? `${prefix}-${seed ?? used.size + 1}` : this.idFactory()
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  /** Allocate one unused policy identity. */
  private nextPolicyId(): PolicyId {
    return PolicyId(this.allocate('policy', new Set(this.state.policies.keys())))
  }

  /** Append one event, fold it into state, then notify the commit hook. */
  private commit(event: PolicyEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Read one Policy or fail with a stable error code. */
  private requirePolicy(id: PolicyId): PolicySnapshot {
    const snapshot = this.state.policies.get(id)
    if (snapshot === undefined) {
      throw new PolicyError(`policy "${id}" not found`, 'POLICY_NOT_FOUND')
    }
    return copyPolicy(snapshot)
  }
}

/**
 * Create a service and replay an existing log.
 *
 * Restored events are folded silently: `onCommit` only observes newly
 * committed commands, never the replayed history.
 *
 * @param events - previously persisted policy events in append order.
 * @param options - clock, identity factory, and commit hook overrides; the
 *   store is replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restorePolicy(
  events: readonly PolicyEvent[],
  options: PolicyServiceOptions = {},
): PolicyService {
  const store = new MemoryPolicyStore()
  for (const event of events) store.append(event)
  return new PolicyService({ ...options, store })
}
