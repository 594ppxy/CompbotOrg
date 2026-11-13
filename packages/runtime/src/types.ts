/**
 * Runtime API contracts.
 *
 * `BotRuntime` is one of CompbotOrg's three immutable cores: host applications
 * may swap the deterministic simulator for a DSH agent loop or a real LLM
 * without touching the organization protocol.
 *
 * @module @compbotorg/runtime/types
 */

import type { BotId } from '@compbotorg/organization'
import type { ReportSnapshot, TaskSnapshot } from '@compbotorg/task'
import type { ExecutionId } from './brand'

/** Kinds of artifact a Bot can produce. Structurally shared with the artifact package. */
export type ProducedArtifactKind = 'document' | 'report' | 'code' | 'data' | 'design'

/** Everything a Runtime needs to know to execute one assigned task. */
export interface ExecutionRequest {
  readonly botId: BotId
  readonly displayName: string
  readonly roleId: string
  readonly taskTitle: string
  readonly taskDescription?: string
  readonly skills: readonly string[]
  readonly goalTitle?: string
}

/** The durable output of one execution. */
export interface ExecutionResult {
  readonly summary: string
  readonly artifactTitle: string
  readonly artifactContent: string
  readonly artifactKind: ProducedArtifactKind
  readonly toolCalls: readonly string[]
  readonly confidence: number
}

/** Pluggable execution engine. Implementations may be synchronous or async. */
export interface BotRuntime {
  /**
   * Execute one task on behalf of one Bot.
   * @param request - the task and identity context.
   * @returns the produced summary and artifact.
   */
  execute(request: ExecutionRequest): ExecutionResult | Promise<ExecutionResult>
}

/** One Bot execution, folded from the runtime event log. */
export interface ExecutionSnapshot {
  readonly id: ExecutionId
  readonly taskId: string
  readonly botId: BotId
  readonly title: string
  readonly status: 'running' | 'succeeded' | 'failed'
  readonly summary?: string
  readonly artifactRefs: readonly string[]
  readonly toolCalls: readonly string[]
  readonly confidence?: number
  readonly durationMs?: number
  readonly failureReason?: string
  readonly startedAt: string
  readonly finishedAt?: string
}

/** Complete folded runtime state. */
export interface RuntimeState {
  readonly executions: ReadonlyMap<ExecutionId, ExecutionSnapshot>
}

/** Summary counters for dashboards. */
export interface ExecutionStats {
  readonly executionCount: number
  readonly runningCount: number
  readonly succeededCount: number
  readonly failedCount: number
  readonly successRate: number
  readonly averageConfidence: number
  readonly toolCallCount: number
}

/** The artifact a runner produced, together with the refs stored on the task. */
export interface ProducedArtifact {
  readonly title: string
  readonly kind: ProducedArtifactKind
  readonly content: string
  readonly refs: readonly string[]
}

/** Result of one full `AgentRunner.runTask` cycle. */
export interface RunTaskResult {
  readonly task: TaskSnapshot
  readonly execution: ExecutionSnapshot
  readonly report: ReportSnapshot
  readonly artifact: ProducedArtifact
}

/** Input handed to an injected artifact sink. */
export interface ArtifactSinkInput {
  readonly title: string
  readonly kind: ProducedArtifactKind
  readonly content: string
  readonly createdBy: BotId
  readonly taskId: string
}
