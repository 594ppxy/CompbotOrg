/**
 * Execution log commands and the Bot task orchestrator.
 *
 * Every {@link ExecutionService} command validates against the current
 * projection, appends exactly one event, folds it, notifies the optional commit
 * hook, and returns a detached snapshot. {@link AgentRunner} chains that log
 * with the task protocol: start → execute → persist artifacts → complete →
 * report. Both halves stay independently replayable.
 *
 * @module @compbotorg/runtime/service
 */

import type { BotId } from '@compbotorg/organization'
import type { ReportSnapshot, TaskId, TaskService, TaskSnapshot } from '@compbotorg/task'
import { ExecutionId } from './brand'
import { RuntimeError } from './errors'
import type { ExecutionEvent, LoggedExecutionEvent } from './events'
import { applyEvent, replay, statsOf } from './projection'
import { MemoryExecutionStore, type ExecutionStore } from './store'
import type {
  ArtifactSinkInput,
  BotRuntime,
  ExecutionRequest,
  ExecutionResult,
  ExecutionSnapshot,
  ExecutionStats,
  ProducedArtifact,
  RunTaskResult,
  RuntimeState,
} from './types'

/** Construction options for {@link ExecutionService}. */
export interface ExecutionServiceOptions {
  /** Clock used for every event timestamp. */
  readonly now?: () => Date
  /** Append-only execution log; defaults to an in-memory store. */
  readonly store?: ExecutionStore
  /** Factory for new execution ids; defaults to `execution-N`. */
  readonly idFactory?: () => string
  /** Hook invoked once per committed event, after folding. */
  readonly onCommit?: (entry: LoggedExecutionEvent) => void
}

/**
 * Detach one snapshot so callers cannot mutate folded state through an alias.
 * @param snapshot - projection entry.
 * @returns a shallow copy with copied arrays.
 */
function copySnapshot(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  return {
    ...snapshot,
    artifactRefs: [...snapshot.artifactRefs],
    toolCalls: [...snapshot.toolCalls],
  }
}

/**
 * Event-sourced log of Bot executions.
 *
 * Construct one service per runtime. The service owns its log; nothing else
 * writes to it.
 */
export class ExecutionService {
  private readonly store: ExecutionStore
  private readonly now: () => Date
  private readonly idFactory: (() => string) | undefined
  private readonly onCommit: ((entry: LoggedExecutionEvent) => void) | undefined
  private state: RuntimeState

  /**
   * @param options - clock, store, id factory and commit hook.
   */
  constructor(options: ExecutionServiceOptions = {}) {
    this.store = options.store ?? new MemoryExecutionStore()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory
    this.onCommit = options.onCommit
    this.state = replay(this.store.readAll().map(entry => entry.event))
  }

  /** @returns the current folded state (read-only by convention). */
  getState(): RuntimeState {
    return this.state
  }

  /** @returns every logged event in append order. */
  events(): LoggedExecutionEvent[] {
    return this.store.readAll()
  }

  /** @returns dashboard counters derived from the current projection. */
  getStats(): ExecutionStats {
    return statsOf(this.state)
  }

  /**
   * Begin one Bot execution.
   * @param input - owning task id, executing Bot and task title.
   * @returns the `running` execution snapshot.
   * @throws RuntimeError `RUNTIME_INVALID_ARGUMENT` when taskId or title is empty.
   */
  startExecution(input: {
    readonly taskId: string
    readonly botId: BotId
    readonly title: string
  }): ExecutionSnapshot {
    if (input.taskId.trim() === '' || input.title.trim() === '') {
      throw new RuntimeError('taskId and title must not be empty', 'RUNTIME_INVALID_ARGUMENT')
    }
    const rawId = this.idFactory === undefined
      ? `execution-${this.state.executions.size + 1}`
      : this.idFactory()
    const executionId = ExecutionId(rawId)
    const event: ExecutionEvent = {
      type: 'execution/started',
      executionId,
      taskId: input.taskId,
      botId: input.botId,
      title: input.title,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireExecution(executionId)
  }

  /**
   * Finish one execution successfully.
   * @param executionId - execution to complete.
   * @param input - summary, artifact refs, tool calls, confidence and duration.
   * @returns the `succeeded` execution snapshot.
   * @throws RuntimeError `RUNTIME_EXECUTION_NOT_FOUND`,
   *   `RUNTIME_EXECUTION_ALREADY_FINISHED` or `RUNTIME_INVALID_ARGUMENT`
   *   (confidence outside 0..1).
   */
  succeedExecution(
    executionId: ExecutionId,
    input: {
      readonly summary: string
      readonly artifactRefs: readonly string[]
      readonly toolCalls: readonly string[]
      readonly confidence: number
      readonly durationMs: number
    },
  ): ExecutionSnapshot {
    this.requireRunning(executionId)
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
      throw new RuntimeError(
        `confidence must be between 0 and 1 (got ${input.confidence})`,
        'RUNTIME_INVALID_ARGUMENT',
      )
    }
    const event: ExecutionEvent = {
      type: 'execution/succeeded',
      executionId,
      summary: input.summary,
      artifactRefs: [...input.artifactRefs],
      toolCalls: [...input.toolCalls],
      confidence: input.confidence,
      durationMs: input.durationMs,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireExecution(executionId)
  }

  /**
   * Finish one execution with a failure.
   * @param executionId - execution to fail.
   * @param input - reason and duration.
   * @returns the `failed` execution snapshot.
   * @throws RuntimeError `RUNTIME_EXECUTION_NOT_FOUND` or
   *   `RUNTIME_EXECUTION_ALREADY_FINISHED`.
   */
  failExecution(
    executionId: ExecutionId,
    input: { readonly reason: string; readonly durationMs: number },
  ): ExecutionSnapshot {
    this.requireRunning(executionId)
    const event: ExecutionEvent = {
      type: 'execution/failed',
      executionId,
      reason: input.reason,
      durationMs: input.durationMs,
      occurredAt: this.timestamp(),
    }
    this.commit(event)
    return this.requireExecution(executionId)
  }

  /**
   * Read one execution.
   * @param id - execution identity.
   * @returns a detached snapshot, or undefined when unknown.
   */
  getExecution(id: ExecutionId): ExecutionSnapshot | undefined {
    const snapshot = this.state.executions.get(id)
    return snapshot === undefined ? undefined : copySnapshot(snapshot)
  }

  /** @returns every execution in creation order, as detached snapshots. */
  listExecutions(): ExecutionSnapshot[] {
    return [...this.state.executions.values()].map(copySnapshot)
  }

  /**
   * Read all executions performed by one Bot.
   * @param botId - Bot identity.
   * @returns detached snapshots in creation order.
   */
  executionsOf(botId: BotId): ExecutionSnapshot[] {
    return this.listExecutions().filter(snapshot => snapshot.botId === botId)
  }

  /** Append one event, fold it into state, then notify the commit hook. */
  private commit(event: ExecutionEvent): void {
    const entry = this.store.append(event)
    this.state = applyEvent(this.state, event)
    this.onCommit?.(entry)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /**
   * Read one execution or fail with a stable error code.
   * @param id - execution identity.
   * @returns a detached snapshot.
   */
  private requireExecution(id: ExecutionId): ExecutionSnapshot {
    const snapshot = this.state.executions.get(id)
    if (snapshot === undefined) {
      throw new RuntimeError(`execution "${id}" not found`, 'RUNTIME_EXECUTION_NOT_FOUND')
    }
    return copySnapshot(snapshot)
  }

  /**
   * Require an execution to still be running.
   * @param id - execution identity.
   * @returns a detached snapshot.
   */
  private requireRunning(id: ExecutionId): ExecutionSnapshot {
    const snapshot = this.requireExecution(id)
    if (snapshot.status !== 'running') {
      throw new RuntimeError(
        `execution "${id}" is already ${snapshot.status}`,
        'RUNTIME_EXECUTION_ALREADY_FINISHED',
      )
    }
    return snapshot
  }
}

/**
 * Rebuild an {@link ExecutionService} from a plain event log.
 *
 * Restored events are folded silently: `onCommit` only observes newly
 * committed commands, never the replayed history.
 *
 * @param events - runtime events in append order.
 * @param options - service options; the store is replaced by the replayed log.
 * @returns a service whose projection matches the original log.
 */
export function restoreRuntime(
  events: readonly ExecutionEvent[],
  options: ExecutionServiceOptions = {},
): ExecutionService {
  const store = new MemoryExecutionStore()
  for (const event of events) store.append(event)
  return new ExecutionService({ ...options, store })
}

/** Minimal identity port, satisfied by `OrganizationService.getMember`. */
export interface MemberDirectory {
  /**
   * Look up one Bot's display name and role.
   * @param botId - Bot identity.
   * @returns the member, or undefined when unknown.
   */
  getMember(botId: BotId): { readonly displayName: string; readonly roleId: string } | undefined
}

/** Construction options for {@link AgentRunner}. */
export interface AgentRunnerOptions {
  /** Task protocol service owning the work. */
  readonly tasks: TaskService
  /** Execution log service recording how the Bot worked. */
  readonly executions: ExecutionService
  /** Pluggable execution engine (sync or async). */
  readonly runtime: BotRuntime
  /** Read port for Bot display names and roles. */
  readonly directory: MemberDirectory
  /** Optional skill resolver for the executing Bot. */
  readonly skillsOf?: (botId: BotId) => readonly string[]
  /** Optional artifact persistence adapter; defaults to an `artifact://` ref. */
  readonly artifactSink?: (input: ArtifactSinkInput) => readonly string[]
  /** Default goal title placed in the execution request. */
  readonly goalTitle?: string
  /** Clock used to measure execution duration. */
  readonly now?: () => Date
}

/**
 * Orchestrates one assigned task end to end.
 *
 * The runner deliberately performs task commands in a fixed order with the
 * assignee as the sole actor, so the organization log and the execution log
 * always tell the same story.
 */
export class AgentRunner {
  private readonly tasks: TaskService
  private readonly executions: ExecutionService
  private readonly runtime: BotRuntime
  private readonly directory: MemberDirectory
  private readonly skillsOf: ((botId: BotId) => readonly string[]) | undefined
  private readonly artifactSink: ((input: ArtifactSinkInput) => readonly string[]) | undefined
  private readonly goalTitle: string | undefined
  private readonly now: () => Date

  /** @param options - task service, execution log, runtime and identity ports. */
  constructor(options: AgentRunnerOptions) {
    this.tasks = options.tasks
    this.executions = options.executions
    this.runtime = options.runtime
    this.directory = options.directory
    this.skillsOf = options.skillsOf
    this.artifactSink = options.artifactSink
    this.goalTitle = options.goalTitle
    this.now = options.now ?? (() => new Date())
  }

  /**
   * Run one assigned task: start (if needed), execute, persist artifacts,
   * complete the task and submit its report.
   *
   * @param taskId - task to execute.
   * @param context - optional per-call goal title, taking priority over
   *   `options.goalTitle`.
   * @returns the completed task, succeeded execution, submitted report and
   *   produced artifact.
   * @throws RuntimeError `RUNTIME_TASK_NOT_FOUND`, `RUNTIME_TASK_NOT_ASSIGNED`,
   *   `RUNTIME_TASK_NOT_RUNNABLE` or `RUNTIME_EXECUTION_FAILED`.
   */
  async runTask(
    taskId: TaskId,
    context?: { readonly goalTitle?: string },
  ): Promise<RunTaskResult> {
    const task: TaskSnapshot | undefined = this.tasks.getTask(taskId)
    if (task === undefined) {
      throw new RuntimeError(`task "${taskId}" not found`, 'RUNTIME_TASK_NOT_FOUND')
    }
    const assigneeId = task.assigneeId
    if (assigneeId === undefined) {
      throw new RuntimeError(`task "${taskId}" has no assignee`, 'RUNTIME_TASK_NOT_ASSIGNED')
    }
    if (task.status !== 'assigned' && task.status !== 'in_progress') {
      throw new RuntimeError(
        `task "${taskId}" is ${task.status}; only assigned or in-progress tasks can run`,
        'RUNTIME_TASK_NOT_RUNNABLE',
      )
    }
    if (task.status === 'assigned') {
      this.tasks.startTask(taskId, { actorId: assigneeId })
    }

    const member = this.directory.getMember(assigneeId)
    const skills: readonly string[] = this.skillsOf === undefined ? [] : this.skillsOf(assigneeId)
    const goalTitle = context?.goalTitle ?? this.goalTitle
    const request: ExecutionRequest = {
      botId: assigneeId,
      displayName: member?.displayName ?? String(assigneeId),
      roleId: member?.roleId ?? 'member',
      taskTitle: task.title,
      ...(task.description === undefined ? {} : { taskDescription: task.description }),
      skills,
      ...(goalTitle === undefined ? {} : { goalTitle }),
    }

    const execution = this.executions.startExecution({
      taskId: String(taskId),
      botId: assigneeId,
      title: task.title,
    })

    const startedAtMs = this.now().getTime()
    let result: ExecutionResult
    try {
      result = await this.runtime.execute(request)
    } catch (cause: unknown) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      this.executions.failExecution(execution.id, {
        reason,
        durationMs: Math.max(0, this.now().getTime() - startedAtMs),
      })
      throw new RuntimeError(
        `execution "${execution.id}" failed: ${reason}`,
        'RUNTIME_EXECUTION_FAILED',
        { cause },
      )
    }
    const durationMs = Math.max(0, this.now().getTime() - startedAtMs)

    const refs = this.artifactSink === undefined
      ? [`artifact://${execution.id}`]
      : this.artifactSink({
          title: result.artifactTitle,
          kind: result.artifactKind,
          content: result.artifactContent,
          createdBy: assigneeId,
          taskId: String(taskId),
        })

    const succeeded = this.executions.succeedExecution(execution.id, {
      summary: result.summary,
      artifactRefs: refs,
      toolCalls: result.toolCalls,
      confidence: result.confidence,
      durationMs,
    })
    const completed: TaskSnapshot = this.tasks.completeTask(
      taskId,
      { summary: result.summary, artifactRefs: refs },
      { actorId: assigneeId },
    )
    const report: ReportSnapshot = this.tasks.submitReport(
      taskId,
      { summary: result.summary, artifactRefs: refs },
      { actorId: assigneeId },
    )
    const artifact: ProducedArtifact = {
      title: result.artifactTitle,
      kind: result.artifactKind,
      content: result.artifactContent,
      refs,
    }
    return { task: completed, execution: succeeded, report, artifact }
  }
}
