/**
 * CompbotOrg — Runtime API, deterministic Bot execution engine and task
 * orchestrator (v0.3).
 *
 * The package keeps *how* a Bot worked in its own append-only execution log,
 * separate from the organization protocol's *what was decided* log. Hosts can
 * replace {@link SimulatedRuntime} with a DSH agent loop or a real LLM without
 * changing a single organization event.
 *
 * @module @compbotorg/runtime/index
 */

export { ExecutionId, brand, type Branded } from './brand'

export { RuntimeError, type RuntimeErrorCode } from './errors'

export type {
  ExecutionEvent,
  ExecutionEventType,
  ExecutionFailedEvent,
  ExecutionStartedEvent,
  ExecutionSucceededEvent,
  LoggedExecutionEvent,
} from './events'

export { applyEvent, emptyState, replay, statsOf } from './projection'

export { MemoryExecutionStore, type ExecutionStore } from './store'

export { SimulatedRuntime, buildPrompt, type SimulatedRuntimeOptions } from './simulated'

export {
  AgentRunner,
  ExecutionService,
  restoreRuntime,
  type AgentRunnerOptions,
  type ExecutionServiceOptions,
  type MemberDirectory,
} from './service'

export type {
  ArtifactSinkInput,
  BotRuntime,
  ExecutionRequest,
  ExecutionResult,
  ExecutionSnapshot,
  ExecutionStats,
  ProducedArtifact,
  ProducedArtifactKind,
  RunTaskResult,
  RuntimeState,
} from './types'
