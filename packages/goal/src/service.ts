/**
 * Goal command service.
 *
 * Every command follows the same shape: validate against the current
 * projection, append exactly one event, fold it, notify the optional commit
 * hook, then return a detached snapshot. Nothing mutates state in place, so
 * the append-only log is the single source of truth and can be replayed by
 * {@link restoreGoal} at any time.
 *
 * @module @compbotorg/goal/service
 */

import type { BotId } from '@compbotorg/organization'
import { GoalId } from './brand'
import { GoalError } from './errors'
import type { GoalEvent, LoggedGoalEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryGoalStore, type GoalStore } from './store'
import type { GoalSnapshot, GoalState, GoalStats, GoalSubtask } from './types'

/** Input for {@link GoalService.createGoal}. */
export interface CreateGoalInput {
  readonly title: string
  readonly description?: string
  readonly createdBy: BotId
  readonly ownerId: BotId
}

/** Input for {@link GoalService.decompose}. */
export interface DecomposeGoalInput {
  readonly subtasks: readonly { readonly title: string; readonly assigneeHint?: string }[]
  readonly decomposedBy: BotId
}

/** Input for {@link GoalService.linkTask}. */
export interface LinkTaskInput {
  readonly taskId: string
  readonly subtaskIndex?: number
  readonly linkedBy: BotId
}

/** Input for {@link GoalService.recordMetric}. */
export interface RecordMetricInput {
  readonly botId: BotId
  readonly quality: number
  readonly timeliness: number
  readonly recordedBy: BotId
}

/** Input for {@link GoalService.completeGoal}. */
export interface CompleteGoalInput {
  readonly completedBy: BotId
  readonly summary?: string
}

/** Input for {@link GoalService.cancelGoal}. */
export interface CancelGoalInput {
  readonly cancelledBy: BotId
}

/** Construction options for {@link GoalService}. */
export interface GoalServiceOptions {
  /** Clock used for every event timestamp; defaults to the system clock. */
  readonly now?: () => Date
  /** Append-only log; defaults to an in-memory store. */
  readonly store?: GoalStore
  /** Factory for new identity strings; defaults to `goal-N`. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding; never during replay. */
  readonly onCommit?: (entry: LoggedGoalEvent) => void
}

const MAX_NAME_LENGTH = 200
const MAX_TEXT_LENGTH = 4_000

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new GoalError(`${field} must not be empty`, 'GOAL_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new GoalError(`${field} must be at most ${max} characters`, 'GOAL_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Trim one optional text, treating blank input as absent. */
function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > max) {
    throw new GoalError(`${field} must be at most ${max} characters`, 'GOAL_INVALID_ARGUMENT')
  }
  return trimmed
}

/** Validate a 0..100 score. */
function score(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new GoalError(`${field} must be between 0 and 100`, 'GOAL_INVALID_ARGUMENT')
  }
  return value
}

/** Fold the stored log into current state. */
function foldStore(store: GoalStore): GoalState {
  return replay(store.readAll().map(entry => entry.event))
}

/** Detach one goal snapshot so callers cannot mutate folded state. */
function copyGoal(snapshot: GoalSnapshot): GoalSnapshot {
  return {
    ...snapshot,
    subtasks: snapshot.subtasks.map(subtask => ({ ...subtask })),
    taskIds: [...snapshot.taskIds],
    metrics: snapshot.metrics.map(metric => ({ ...metric })),
  }
}

/**
 * Goal decomposition, task linking and performance evaluation commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class GoalService {
  private readonly store: GoalStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedGoalEvent) => void) | undefined
  private state: GoalState

  /**
   * @param options - clock, store, identity factory, and commit hook.
   */
  constructor(options: GoalServiceOptions = {}) {
    this.store = options.store ?? new MemoryGoalStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Immutable view of the folded state. */
  getState(): GoalState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedGoalEvent[] {
    return this.store.readAll()
  }

  /** Summary counters derived from the current projection. */
  getStats(): GoalStats {
    return statsOf(this.state)
  }

  /** Read one Goal, or undefined when unknown. */
  getGoal(id: GoalId): GoalSnapshot | undefined {
    const snapshot = this.state.goals.get(id)
    return snapshot === undefined ? undefined : copyGoal(snapshot)
  }

  /** Every Goal, in creation order. */
  listGoals(): GoalSnapshot[] {
    return [...this.state.goals.values()].map(copyGoal)
  }

  // --------------------------------------------------------------- commands

  /**
   * Create one Goal in `draft` state.
   * @param input - title, optional description, creator and owner.
   * @returns the created Goal.
   * @throws GoalError `GOAL_INVALID_ARGUMENT` for an empty title or overlong text.
   */
  createGoal(input: CreateGoalInput): GoalSnapshot {
    const title = requiredText(input.title, 'goal title', MAX_NAME_LENGTH)
    const description = optionalText(input.description, 'goal description', MAX_TEXT_LENGTH)
    const goalId = this.nextGoalId()
    const event: GoalEvent = {
      type: 'goal/created',
      goalId,
      title,
      ...(description === undefined ? {} : { description }),
      createdBy: input.createdBy,
      ownerId: input.ownerId,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  /**
   * Break a Goal into subtasks and move it to `in_progress`.
   * @param goalId - Goal to decompose.
   * @param input - non-empty subtask list and the actor decomposing it.
   * @returns the updated Goal.
   * @throws GoalError `GOAL_NOT_FOUND` when unknown, `GOAL_NO_SUBTASKS` for
   *   an empty list, `GOAL_INVALID_ARGUMENT` for an empty subtask title, or
   *   `GOAL_INVALID_TRANSITION` when the Goal is completed / cancelled.
   */
  decompose(goalId: GoalId, input: DecomposeGoalInput): GoalSnapshot {
    this.requireMutable(goalId)
    if (input.subtasks.length === 0) {
      throw new GoalError('a goal needs at least one subtask', 'GOAL_NO_SUBTASKS')
    }
    const subtasks: readonly GoalSubtask[] = input.subtasks.map(subtask => {
      const hint = optionalText(subtask.assigneeHint, 'assignee hint', MAX_NAME_LENGTH)
      return {
        title: requiredText(subtask.title, 'subtask title', MAX_NAME_LENGTH),
        ...(hint === undefined ? {} : { assigneeHint: hint }),
      }
    })
    const event: GoalEvent = {
      type: 'goal/decomposed',
      goalId,
      subtasks,
      decomposedBy: input.decomposedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  /**
   * Link a protocol-layer Task to a Goal, optionally to one subtask.
   * @param goalId - Goal to link into.
   * @param input - task id, optional zero-based subtask index, and actor.
   * @returns the updated Goal.
   * @throws GoalError `GOAL_NOT_FOUND` when unknown, `GOAL_INVALID_ARGUMENT`
   *   for an empty task id or an out-of-range subtask index, or
   *   `GOAL_INVALID_TRANSITION` when the Goal is completed / cancelled.
   */
  linkTask(goalId: GoalId, input: LinkTaskInput): GoalSnapshot {
    const goal = this.requireMutable(goalId)
    const taskId = requiredText(input.taskId, 'task id', MAX_NAME_LENGTH)
    if (
      input.subtaskIndex !== undefined &&
      (!Number.isInteger(input.subtaskIndex) ||
        input.subtaskIndex < 0 ||
        input.subtaskIndex >= goal.subtasks.length)
    ) {
      throw new GoalError('subtask index is out of range', 'GOAL_INVALID_ARGUMENT')
    }
    const event: GoalEvent = {
      type: 'goal/task-linked',
      goalId,
      taskId,
      ...(input.subtaskIndex === undefined ? {} : { subtaskIndex: input.subtaskIndex }),
      linkedBy: input.linkedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  /**
   * Record one performance measurement.
   * @param goalId - Goal being measured.
   * @param input - Bot, 0..100 quality and timeliness, and the recorder.
   * @returns the updated Goal.
   * @throws GoalError `GOAL_NOT_FOUND` when unknown, or
   *   `GOAL_INVALID_ARGUMENT` when a score is outside 0..100.
   */
  recordMetric(goalId: GoalId, input: RecordMetricInput): GoalSnapshot {
    this.requireGoal(goalId)
    const event: GoalEvent = {
      type: 'goal/metric-recorded',
      goalId,
      botId: input.botId,
      quality: score(input.quality, 'quality'),
      timeliness: score(input.timeliness, 'timeliness'),
      recordedBy: input.recordedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  /**
   * Complete an in-progress Goal with an optional summary.
   * @param goalId - Goal to complete.
   * @param input - actor completing it and optional summary.
   * @returns the completed Goal.
   * @throws GoalError `GOAL_NOT_FOUND` when unknown, `GOAL_INVALID_TRANSITION`
   *   when the Goal is not `in_progress`, or `GOAL_INVALID_ARGUMENT` for
   *   overlong summary text.
   */
  completeGoal(goalId: GoalId, input: CompleteGoalInput): GoalSnapshot {
    const goal = this.requireGoal(goalId)
    if (goal.status !== 'in_progress') {
      throw new GoalError(
        `goal "${goalId}" must be in_progress to complete`,
        'GOAL_INVALID_TRANSITION',
      )
    }
    const summary = optionalText(input.summary, 'goal summary', MAX_TEXT_LENGTH)
    const event: GoalEvent = {
      type: 'goal/completed',
      goalId,
      ...(summary === undefined ? {} : { summary }),
      completedBy: input.completedBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  /**
   * Cancel a draft or in-progress Goal.
   * @param goalId - Goal to cancel.
   * @param input - actor cancelling it.
   * @returns the cancelled Goal.
   * @throws GoalError `GOAL_NOT_FOUND` when unknown, or
   *   `GOAL_INVALID_TRANSITION` when the Goal is already terminal.
   */
  cancelGoal(goalId: GoalId, input: CancelGoalInput): GoalSnapshot {
    const goal = this.requireGoal(goalId)
    if (goal.status === 'completed' || goal.status === 'cancelled') {
      throw new GoalError(`goal "${goalId}" is already terminal`, 'GOAL_INVALID_TRANSITION')
    }
    const event: GoalEvent = {
      type: 'goal/status-changed',
      goalId,
      status: 'cancelled',
      changedBy: input.cancelledBy,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireGoal(goalId)
  }

  // --------------------------------------------------------------- internals

  /** Read one Goal and assert it is still open for decomposition or linking. */
  private requireMutable(id: GoalId): GoalSnapshot {
    const goal = this.requireGoal(id)
    if (goal.status === 'completed' || goal.status === 'cancelled') {
      throw new GoalError(`goal "${id}" is already closed`, 'GOAL_INVALID_TRANSITION')
    }
    return goal
  }

  /** Allocate one unused goal identity. */
  private nextGoalId(): GoalId {
    const base =
      this.idFactory === undefined ? `goal-${this.state.goals.size + 1}` : this.idFactory()
    let candidate = base
    let suffix = 2
    while (this.state.goals.has(GoalId(candidate))) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return GoalId(candidate)
  }

  /** Append one event, fold it into state, then notify the commit hook. */
  private commit(event: GoalEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Read one Goal or fail with a stable error code. */
  private requireGoal(id: GoalId): GoalSnapshot {
    const snapshot = this.state.goals.get(id)
    if (snapshot === undefined) {
      throw new GoalError(`goal "${id}" not found`, 'GOAL_NOT_FOUND')
    }
    return copyGoal(snapshot)
  }
}

/**
 * Create a service and replay an existing log.
 *
 * Restored events are folded silently: `onCommit` only observes newly
 * committed commands, never the replayed history.
 *
 * @param events - previously persisted goal events in append order.
 * @param options - clock, identity factory, and commit hook overrides; the
 *   store is replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restoreGoal(
  events: readonly GoalEvent[],
  options: GoalServiceOptions = {},
): GoalService {
  const store = new MemoryGoalStore()
  for (const event of events) store.append(event)
  return new GoalService({ ...options, store })
}
