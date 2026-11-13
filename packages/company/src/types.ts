/**
 * Facade-level types for the CompbotOrg `company` package.
 *
 * A company is not another event log: it is the composition root that owns the
 * nine independent domain logs. Persistence therefore means persisting those
 * logs verbatim and rebuilding each service with its own `restoreX` function.
 *
 * @module @compbotorg/company/types
 */

import type { ArtifactEvent, ArtifactService, ArtifactSnapshot } from '@compbotorg/artifact'
import type { GoalEvent, GoalService, GoalSnapshot } from '@compbotorg/goal'
import type { MemoryEvent, MemoryService } from '@compbotorg/memory'
import type {
  BotId,
  DepartmentId,
  OrganizationEvent,
  OrganizationService,
} from '@compbotorg/organization'
import type {
  AuditSnapshot,
  EvaluationSnapshot,
  PolicyEvent,
  PolicyService,
} from '@compbotorg/policy'
import type { RegistryEvent, RegistryService } from '@compbotorg/registry'
import type {
  BotRuntime,
  ExecutionEvent,
  ExecutionService,
  ExecutionSnapshot,
} from '@compbotorg/runtime'
import type { SkillEvent, SkillService } from '@compbotorg/skill'
import type {
  ReportSnapshot,
  TaskEvent,
  TaskService,
  TaskSnapshot,
} from '@compbotorg/task'

/** The nine append-only logs owned by one Company, in plain-event form. */
export interface CompanyLogs {
  readonly organization: readonly OrganizationEvent[]
  readonly task: readonly TaskEvent[]
  readonly runtime: readonly ExecutionEvent[]
  readonly artifact: readonly ArtifactEvent[]
  readonly memory: readonly MemoryEvent[]
  readonly skill: readonly SkillEvent[]
  readonly policy: readonly PolicyEvent[]
  readonly registry: readonly RegistryEvent[]
  readonly goal: readonly GoalEvent[]
}

/** JSON-serializable snapshot of one Company. */
export interface CompanySnapshot {
  /** Bumped whenever the snapshot shape changes. */
  readonly version: 1
  /** ISO timestamp of the export. */
  readonly savedAt: string
  readonly logs: CompanyLogs
}

/** Dashboard summary aggregating every domain service. */
export interface CompanyStats {
  readonly organization: ReturnType<OrganizationService['getStats']>
  readonly task: ReturnType<TaskService['getStats']>
  readonly runtime: ReturnType<ExecutionService['getStats']>
  readonly artifact: ReturnType<ArtifactService['getStats']>
  readonly memory: ReturnType<MemoryService['getStats']>
  readonly skill: ReturnType<SkillService['getStats']>
  readonly policy: ReturnType<PolicyService['getStats']>
  readonly registry: ReturnType<RegistryService['getStats']>
  readonly goal: ReturnType<GoalService['getStats']>
  /** Total events across all nine logs. */
  readonly eventCount: number
}

/** Options for constructing or restoring a {@link Company}. */
export interface CompanyOptions {
  /** Organization name used by `bootstrap`. */
  readonly name?: string
  /** Clock injected into every domain service. */
  readonly now?: () => Date
  /** Execution engine used by the AgentRunner; defaults to `SimulatedRuntime`. */
  readonly runtime?: BotRuntime
  /** When supplied, the Company is restored from these logs. */
  readonly snapshot?: CompanySnapshot
}

/** Options for {@link Company.bootstrap}. */
export interface BootstrapInput {
  readonly name?: string
}

/** Fixed Bot identities used by the product demo. */
export interface CompanyMembers {
  readonly ceo: BotId
  readonly director: BotId
  readonly engineer: BotId
  readonly executive: DepartmentId
  readonly engineering: DepartmentId
}

/** Input for {@link Company.runGoal}. */
export interface RunGoalInput {
  readonly title: string
  readonly description?: string
  /** Defaults to one subtask named after the goal. */
  readonly subtasks?: readonly { readonly title: string }[]
  /** Policy action evaluated before completion; defaults to `goal.execute`. */
  readonly action?: string
  /** Quality score recorded for the executing Bot (0..100). */
  readonly quality?: number
  /** Timeliness score recorded for the executing Bot (0..100). */
  readonly timeliness?: number
}

/** Everything produced by one autonomous goal run. */
export interface GoalRunResult {
  readonly goal: GoalSnapshot
  readonly tasks: readonly TaskSnapshot[]
  readonly reports: readonly ReportSnapshot[]
  readonly artifacts: readonly ArtifactSnapshot[]
  readonly executions: readonly ExecutionSnapshot[]
  readonly evaluation: EvaluationSnapshot
  readonly audit: AuditSnapshot
}
