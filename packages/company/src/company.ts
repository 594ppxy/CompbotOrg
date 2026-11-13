/**
 * CompbotOrg composition root.
 *
 * `Company` owns the nine independent domain services and wires them into one
 * autonomous loop: a user states a goal, the organization decomposes it into
 * tasks, an AgentRunner executes each task, artifacts are archived, reports
 * are reviewed, policies gate the completion, performance is measured, and the
 * goal is closed. Persistence is a plain JSON snapshot of all nine event logs;
 * restoring it rebuilds every service with its own `restoreX` function, so no
 * domain code needs to know about files, HTTP, or the CLI.
 *
 * @module @compbotorg/company/company
 */

import { ArtifactService, restoreArtifact } from '@compbotorg/artifact'
import type { ArtifactSnapshot } from '@compbotorg/artifact'
import { GoalService, restoreGoal } from '@compbotorg/goal'
import { MemoryService, restoreMemory } from '@compbotorg/memory'
import {
  BotId,
  OrganizationService,
  RoleId,
  restoreOrganization,
} from '@compbotorg/organization'
import { PolicyService, restorePolicy } from '@compbotorg/policy'
import { RegistryService, restoreRegistry } from '@compbotorg/registry'
import {
  AgentRunner,
  ExecutionService,
  SimulatedRuntime,
  restoreRuntime,
} from '@compbotorg/runtime'
import { SkillService, restoreSkill } from '@compbotorg/skill'
import type { ExecutionSnapshot } from '@compbotorg/runtime'
import type { ReportSnapshot, TaskSnapshot } from '@compbotorg/task'
import {
  EventBus,
  OrganizationAuthorizer,
  TaskService,
  restoreTask,
} from '@compbotorg/task'
import { CompanyError } from './errors'
import type {
  BootstrapInput,
  CompanyLogs,
  CompanyMembers,
  CompanyOptions,
  CompanySnapshot,
  CompanyStats,
  GoalRunResult,
  RunGoalInput,
} from './types'

/** Fixed Bot identities used to bootstrap the demo organization. */
export const COMPANY_BOTS = {
  ceo: BotId('bot-ada'),
  director: BotId('bot-margaret'),
  engineer: BotId('bot-ken'),
} as const

/** Bundle of the nine domain services, built fresh or restored from logs. */
interface CompanyServices {
  readonly organization: OrganizationService
  readonly tasks: TaskService
  readonly executions: ExecutionService
  readonly artifacts: ArtifactService
  readonly memory: MemoryService
  readonly skills: SkillService
  readonly policies: PolicyService
  readonly registry: RegistryService
  readonly goals: GoalService
  readonly bus: EventBus
}

/** Build every service from empty logs. */
function createServices(now: () => Date): CompanyServices {
  const organization = new OrganizationService({ now })
  const authorizer = new OrganizationAuthorizer(organization)
  const bus = new EventBus()
  return {
    organization,
    tasks: new TaskService({ now, authorizer, bus }),
    executions: new ExecutionService({ now }),
    artifacts: new ArtifactService({ now }),
    memory: new MemoryService({ now }),
    skills: new SkillService({ now }),
    policies: new PolicyService({ now }),
    registry: new RegistryService({ now }),
    goals: new GoalService({ now }),
    bus,
  }
}

/** Rebuild every service from persisted logs, in dependency order. */
function restoreServices(snapshot: CompanySnapshot, now: () => Date): CompanyServices {
  const organization = restoreOrganization(snapshot.logs.organization, { now })
  const authorizer = new OrganizationAuthorizer(organization)
  const bus = new EventBus()
  return {
    organization,
    tasks: restoreTask(snapshot.logs.task, { now, authorizer, bus }),
    executions: restoreRuntime(snapshot.logs.runtime, { now }),
    artifacts: restoreArtifact(snapshot.logs.artifact, { now }),
    memory: restoreMemory(snapshot.logs.memory, { now }),
    skills: restoreSkill(snapshot.logs.skill, { now }),
    policies: restorePolicy(snapshot.logs.policy, { now }),
    registry: restoreRegistry(snapshot.logs.registry, { now }),
    goals: restoreGoal(snapshot.logs.goal, { now }),
    bus,
  }
}

/**
 * One AI company: nine event-sourced services plus the orchestration facade.
 */
export class Company {
  /** v0.1 organization core. */
  readonly organization: OrganizationService
  /** v0.2 organization protocol. */
  readonly tasks: TaskService
  /** v0.3 execution log. */
  readonly executions: ExecutionService
  /** v0.4 artifact FS. */
  readonly artifacts: ArtifactService
  /** v0.5 three-layer memory. */
  readonly memory: MemoryService
  /** v0.6 skill protocol. */
  readonly skills: SkillService
  /** v0.7 policy engine. */
  readonly policies: PolicyService
  /** v0.8 registry. */
  readonly registry: RegistryService
  /** v0.9 goals. */
  readonly goals: GoalService
  /** Domain event bus shared with the task service. */
  readonly bus: EventBus
  /** Task orchestrator: start -> execute -> artifact -> complete -> report. */
  readonly runner: AgentRunner

  private readonly now: () => Date
  private readonly name: string
  private bootstrapped: boolean
  private members: CompanyMembers | undefined

  /**
   * @param options - name, clock, runtime engine, or a persisted snapshot.
   */
  constructor(options: CompanyOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.name = options.name ?? 'CompbotOrg Demo Company'
    const services: CompanyServices =
      options.snapshot === undefined
        ? createServices(this.now)
        : restoreServices(options.snapshot, this.now)

    this.organization = services.organization
    this.tasks = services.tasks
    this.executions = services.executions
    this.artifacts = services.artifacts
    this.memory = services.memory
    this.skills = services.skills
    this.policies = services.policies
    this.registry = services.registry
    this.goals = services.goals
    this.bus = services.bus

    const runtime = options.runtime ?? new SimulatedRuntime({ now: this.now })
    this.runner = new AgentRunner({
      tasks: this.tasks,
      executions: this.executions,
      runtime,
      directory: this.organization,
      skillsOf: botId => this.skills.skillsOf(botId).map(skill => skill.name),
      artifactSink: input => {
        const artifact = this.artifacts.createArtifact({
          title: input.title,
          kind: input.kind,
          createdBy: input.createdBy,
          namespace: { scope: 'organization', ownerId: 'company' },
          content: input.content,
          taskId: input.taskId,
          tags: ['runtime'],
        })
        return [`artifact://${artifact.id}`]
      },
      now: this.now,
    })

    this.bootstrapped =
      options.snapshot !== undefined && options.snapshot.logs.organization.length > 0
  }

  /**
   * Restore a Company from a previously exported snapshot.
   * @param snapshot - JSON-serializable company logs.
   * @param options - clock and runtime overrides.
   * @returns a Company whose projections match the snapshot.
   */
  static fromSnapshot(snapshot: CompanySnapshot, options: CompanyOptions = {}): Company {
    return new Company({ ...options, snapshot })
  }

  /**
   * Create the demo organization and seed every domain service.
   *
   * Reporting line: Ada (CEO) > Margaret (Director) > Ken (Engineer).
   * Idempotent: calling it twice returns the same members without appending
   * duplicate organization events.
   *
   * @param input - optional organization name override.
   * @returns the fixed Bot and department identities.
   */
  bootstrap(input: BootstrapInput = {}): CompanyMembers {
    if (this.members !== undefined) return this.members
    const { ceo, director, engineer } = COMPANY_BOTS
    const name = input.name ?? this.name
    this.organization.createOrganization({ name, description: 'Autonomous AI company' })
    const executive = this.organization.createDepartment({ name: 'Executive' }).id
    const engineering = this.organization.createDepartment({ name: 'Engineering' }).id
    this.organization.addMember({
      botId: ceo,
      displayName: 'Ada',
      departmentId: executive,
      roleId: RoleId('ceo'),
    })
    this.organization.addMember(
      {
        botId: director,
        displayName: 'Margaret',
        departmentId: engineering,
        roleId: RoleId('director'),
        reportsTo: ceo,
      },
      { actorId: ceo },
    )
    this.organization.addMember(
      {
        botId: engineer,
        displayName: 'Ken',
        departmentId: engineering,
        roleId: RoleId('engineer'),
        reportsTo: director,
      },
      { actorId: director },
    )

    const skill = this.skills.registerSkill({
      name: 'Competitive Research',
      kind: 'expert',
      description: 'Collect and summarize competitor pricing',
      version: '1.0.0',
      capabilities: ['research'],
      registeredBy: ceo,
    })
    this.skills.installSkill(skill.id, { botId: engineer, installedBy: ceo })
    const listing = this.registry.publish({
      name: 'Competitive Research',
      kind: 'skill',
      version: '1.0.0',
      description: 'Expert skill for pricing research',
      publisherId: ceo,
      capabilities: ['research'],
    })
    this.registry.install(listing.id, { botId: engineer, installedBy: ceo })
    this.registry.rate(listing.id, { score: 5, raterId: director, comment: 'Useful' })

    this.policies.createPolicy({
      name: 'Allow goal execution',
      action: 'goal.*',
      effect: 'allow',
      priority: 10,
      createdBy: ceo,
    })
    this.policies.createPolicy({
      name: 'Guard artifact deletion',
      action: 'artifact.delete',
      effect: 'deny',
      priority: 20,
      createdBy: ceo,
    })
    this.memory.addEntry({
      layer: 'organization',
      ownerId: 'company',
      title: 'Mission',
      content: 'Build organizations, not swarms.',
      authorId: ceo,
      tags: ['mission'],
    })

    this.members = { ceo, director, engineer, executive, engineering }
    this.bootstrapped = true
    return this.members
  }

  /**
   * Run one goal end to end: decompose, delegate, execute, archive, review,
   * evaluate policy, measure performance and close the goal.
   *
   * @param input - goal title, optional subtasks, action and metric overrides.
   * @returns the completed goal and everything produced along the way.
   * @throws CompanyError `COMPANY_INVALID_ARGUMENT` for an empty title or an
   *   empty subtask list, and `COMPANY_ACTION_DENIED` when policy denies the
   *   action.
   */
  async runGoal(input: RunGoalInput): Promise<GoalRunResult> {
    if (input.title.trim() === '') {
      throw new CompanyError('goal title must not be empty', 'COMPANY_INVALID_ARGUMENT')
    }
    if (input.subtasks?.length === 0) {
      throw new CompanyError('a goal needs at least one subtask', 'COMPANY_INVALID_ARGUMENT')
    }
    if (!this.bootstrapped) this.bootstrap()
    const { ceo, director, engineer } = COMPANY_BOTS
    const action = input.action ?? 'goal.execute'

    const evaluation = this.policies.evaluate({ action, actorId: ceo })
    if (evaluation.decision === 'deny') {
      throw new CompanyError(`action "${action}" was denied by policy`, 'COMPANY_ACTION_DENIED')
    }

    const goal = this.goals.createGoal({
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      createdBy: ceo,
      ownerId: director,
    })
    const subtasks: readonly { readonly title: string }[] =
      input.subtasks ?? [{ title: input.title }]
    this.goals.decompose(goal.id, { subtasks, decomposedBy: director })

    const tasks: TaskSnapshot[] = []
    const reports: ReportSnapshot[] = []
    const artifacts: ArtifactSnapshot[] = []
    const executions: ExecutionSnapshot[] = []

    for (let index = 0; index < subtasks.length; index += 1) {
      const subtask = subtasks[index]
      if (subtask === undefined) continue
      const task = this.tasks.createTask(
        {
          title: subtask.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          createdBy: ceo,
        },
        { actorId: ceo },
      )
      this.tasks.assignTask(task.id, engineer, { actorId: ceo })
      const run = await this.runner.runTask(task.id, { goalTitle: input.title })
      const report = this.tasks.approveReport(run.report.id, 'Reviewed, ship it.', {
        actorId: director,
      })
      this.goals.linkTask(goal.id, {
        taskId: String(task.id),
        subtaskIndex: index,
        linkedBy: ceo,
      })
      this.goals.recordMetric(goal.id, {
        botId: engineer,
        quality: input.quality ?? 90,
        timeliness: input.timeliness ?? 95,
        recordedBy: director,
      })
      tasks.push(run.task)
      reports.push(report)
      executions.push(run.execution)
      artifacts.push(...this.artifacts.listArtifacts({ taskId: String(task.id) }))
    }

    const summary = `${subtasks.length} subtask(s) executed, ${artifacts.length} artifact(s) archived`
    this.memory.addEntry({
      layer: 'organization',
      ownerId: 'company',
      title: `Goal: ${input.title}`,
      content: summary,
      authorId: ceo,
      tags: ['goal'],
    })
    const audit = this.policies.recordAudit({
      actorId: ceo,
      action,
      outcome:
        evaluation.decision === 'requires_approval'
          ? 'pending'
          : 'allowed',
      detail: String(goal.id),
    })
    this.goals.completeGoal(goal.id, { completedBy: ceo, summary })

    const completed = this.goals.getGoal(goal.id)
    if (completed === undefined) {
      throw new CompanyError('completed goal is missing from the projection', 'COMPANY_INVALID_ARGUMENT')
    }
    return { goal: completed, tasks, reports, artifacts, executions, evaluation, audit }
  }

  /**
   * Aggregate dashboard counters from every domain service.
   * @returns a plain JSON-serializable summary.
   */
  getStats(): CompanyStats {
    return {
      organization: this.organization.getStats(),
      task: this.tasks.getStats(),
      runtime: this.executions.getStats(),
      artifact: this.artifacts.getStats(),
      memory: this.memory.getStats(),
      skill: this.skills.getStats(),
      policy: this.policies.getStats(),
      registry: this.registry.getStats(),
      goal: this.goals.getStats(),
      eventCount: this.getEventCount(),
    }
  }

  /** Total number of events across all nine logs. */
  getEventCount(): number {
    return (
      this.organization.events().length +
      this.tasks.events().length +
      this.executions.events().length +
      this.artifacts.events().length +
      this.memory.events().length +
      this.skills.events().length +
      this.policies.events().length +
      this.registry.events().length +
      this.goals.events().length
    )
  }

  /**
   * Export the nine event logs as a JSON-serializable snapshot.
   * @returns a versioned snapshot suitable for `saveCompany` / `fromSnapshot`.
   */
  toSnapshot(): CompanySnapshot {
    const logs: CompanyLogs = {
      organization: this.organization.events().map(entry => entry.event),
      task: this.tasks.events().map(entry => entry.event),
      runtime: this.executions.events().map(entry => entry.event),
      artifact: this.artifacts.events().map(entry => entry.event),
      memory: this.memory.events().map(entry => entry.event),
      skill: this.skills.events().map(entry => entry.event),
      policy: this.policies.events().map(entry => entry.event),
      registry: this.registry.events().map(entry => entry.event),
      goal: this.goals.events().map(entry => entry.event),
    }
    return { version: 1, savedAt: this.now().toISOString(), logs }
  }
}
