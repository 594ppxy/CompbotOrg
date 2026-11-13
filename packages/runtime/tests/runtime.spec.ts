import { BotId, OrganizationService, RoleId } from '@compbotorg/organization'
import { TaskId, TaskService } from '@compbotorg/task'
import { describe, expect, it } from 'vitest'
import {
  AgentRunner,
  ExecutionId,
  ExecutionService,
  MemoryExecutionStore,
  RuntimeError,
  SimulatedRuntime,
  applyEvent,
  buildPrompt,
  emptyState,
  replay,
  restoreRuntime,
  statsOf,
  type ArtifactSinkInput,
  type BotRuntime,
  type ExecutionRequest,
  type ExecutionResult,
  type LoggedExecutionEvent,
  type MemberDirectory,
} from '../src/index'

/** Fixed clock shared by every deterministic fixture. */
const NOW = (): Date => new Date('2026-01-01T00:00:00Z')
const ISO_NOW = '2026-01-01T00:00:00.000Z'
const BOT = BotId('bot-ceo')
const OTHER = BotId('bot-other')
const TASK_TITLE = '撰写季度规划'

/** Build the minimal organization from the standard fixture. */
function makeOrganization(): OrganizationService {
  const org = new OrganizationService({ now: NOW })
  org.createOrganization({ name: 'Test' })
  const department = org.createDepartment({ name: 'Eng' })
  org.addMember({
    botId: BOT,
    displayName: 'Ada',
    departmentId: department.id,
    roleId: RoleId('ceo'),
  })
  return org
}

/** A standalone, permissive task service. */
function makeTasks(): TaskService {
  return new TaskService({ now: NOW })
}

/** Create a task and assign it to the fixture member. */
function assignedTask(tasks: TaskService): TaskId {
  const task = tasks.createTask({ title: TASK_TITLE, createdBy: BOT })
  tasks.assignTask(task.id, BOT, { actorId: BOT })
  return task.id
}

/** A standard simulated execution request. */
function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    botId: BOT,
    displayName: 'Ada',
    roleId: 'ceo',
    taskTitle: TASK_TITLE,
    skills: ['analysis', 'writing'],
    ...overrides,
  }
}

/** Extract the three numbered lines of the 分析要点 section. */
function analysisPoints(content: string): string[] {
  const section = content.split('## 分析要点')[1]?.split('## 结论')[0] ?? ''
  return section.trim().split('\n').filter(line => /^\d+\.\s/u.test(line))
}

/** Return the stable error code of a synchronous rejection. */
function errorCode(fn: () => unknown): string {
  try {
    fn()
    return 'NO_ERROR'
  } catch (error: unknown) {
    return error instanceof RuntimeError ? error.code : `UNKNOWN:${String(error)}`
  }
}

/** Return the stable error code of an asynchronous rejection. */
async function asyncErrorCode(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
    return 'NO_ERROR'
  } catch (error: unknown) {
    return error instanceof RuntimeError ? error.code : `UNKNOWN:${String(error)}`
  }
}

/** Options accepted by the runner fixture. */
interface FixtureOptions {
  readonly runtime?: BotRuntime
  readonly directory?: MemberDirectory
  readonly skillsOf?: (botId: BotId) => readonly string[]
  readonly artifactSink?: (input: ArtifactSinkInput) => readonly string[]
  readonly goalTitle?: string
}

/** Wire an organization, task service, execution log and runner together. */
function makeFixture(options: FixtureOptions = {}) {
  const org = makeOrganization()
  const tasks = makeTasks()
  const executions = new ExecutionService({ now: NOW })
  const runtime = options.runtime ?? new SimulatedRuntime({ now: NOW })
  const runner = new AgentRunner({
    tasks,
    executions,
    runtime,
    directory: options.directory ?? org,
    now: NOW,
    ...(options.skillsOf === undefined ? {} : { skillsOf: options.skillsOf }),
    ...(options.artifactSink === undefined ? {} : { artifactSink: options.artifactSink }),
    ...(options.goalTitle === undefined ? {} : { goalTitle: options.goalTitle }),
  })
  return { org, tasks, executions, runtime, runner }
}

/** A runtime that records the request it received. */
function capturingRuntime(): {
  runtime: BotRuntime
  read: () => ExecutionRequest | undefined
} {
  let captured: ExecutionRequest | undefined
  const runtime: BotRuntime = {
    execute: (req: ExecutionRequest): ExecutionResult => {
      captured = req
      return {
        summary: `已完成「${req.taskTitle}」的捕获结论`,
        artifactTitle: `${req.taskTitle} — 捕获报告`,
        artifactContent: '# 捕获报告',
        artifactKind: 'report',
        toolCalls: ['analysis.summarize'],
        confidence: 0.9,
      }
    },
  }
  return { runtime, read: () => captured }
}

/** Standard successful completion payload. */
function successInput() {
  return {
    summary: '已完成「撰写季度规划」',
    artifactRefs: ['artifact://report-1'],
    toolCalls: ['workspace.read', 'artifact.write'],
    confidence: 0.9,
    durationMs: 42,
  }
}

describe('SimulatedRuntime', () => {
  it('同输入两次执行结果全等（完全确定性）', () => {
    const runtime = new SimulatedRuntime({ now: NOW })
    const first = runtime.execute(request())
    const second = runtime.execute(request())
    expect(first).toEqual(second)
    expect(first.artifactContent).toBe(second.artifactContent)
  })

  it('默认构造（无注入时钟）同样保持确定性', () => {
    const first = new SimulatedRuntime().execute(request())
    const second = new SimulatedRuntime().execute(request())
    expect(first).toEqual(second)
  })

  it('默认报告包含标题/执行人/角色/目标/方法/要点/结论/风险/生成时间', () => {
    const result = new SimulatedRuntime({ now: NOW }).execute(
      request({ taskDescription: '对齐路线图', goalTitle: '年度目标' }),
    )
    expect(result.artifactKind).toBe('report')
    expect(result.artifactTitle).toBe(`${TASK_TITLE} — 执行报告`)
    expect(result.summary).toContain(TASK_TITLE)
    expect(result.confidence).toBeGreaterThanOrEqual(0.82)
    expect(result.confidence).toBeLessThanOrEqual(0.96)
    expect(Math.round(result.confidence * 100) / 100).toBe(result.confidence)
    expect(result.toolCalls).toContain('workspace.read')
    expect(result.toolCalls).toContain('artifact.write')
    expect(result.artifactContent).toContain(`# ${TASK_TITLE} — 执行报告`)
    expect(result.artifactContent).toContain('执行人：Ada')
    expect(result.artifactContent).toContain('角色：ceo')
    expect(result.artifactContent).toContain('目标：年度目标')
    expect(result.artifactContent).toContain('任务描述：对齐路线图')
    expect(result.artifactContent).toContain('## 方法')
    expect(result.artifactContent).toContain('## 结论')
    expect(result.artifactContent).toContain('## 风险与建议')
    expect(result.artifactContent).toContain(ISO_NOW)
    expect(analysisPoints(result.artifactContent)).toHaveLength(3)
  })

  it('分析要点为 3 条，且随任务标题哈希变化', () => {
    const runtime = new SimulatedRuntime({ now: NOW })
    const triples = ['规划甲', '规划乙', '规划丙', '规划丁', '规划戊'].map(title =>
      analysisPoints(runtime.execute(request({ taskTitle: title })).artifactContent),
    )
    expect(triples.every(points => points.length === 3)).toBe(true)
    expect(new Set(triples.map(points => points.join('|'))).size).toBeGreaterThan(1)
  })

  it('buildPrompt 拼接必填字段且不写出 undefined', () => {
    const prompt = buildPrompt(request())
    expect(prompt).toContain(TASK_TITLE)
    expect(prompt).toContain('Ada')
    expect(prompt).toContain('ceo')
    expect(prompt).toContain('技能：analysis、writing')
    expect(prompt).toContain(`目标：${TASK_TITLE}`)
    expect(prompt).not.toContain('undefined')
  })

  it('buildPrompt 包含可选描述、目标与技能清单', () => {
    const prompt = buildPrompt(
      request({ taskDescription: '对齐路线图', goalTitle: '年度目标', skills: ['a', 'b', 'c'] }),
    )
    expect(prompt).toContain('任务描述：对齐路线图')
    expect(prompt).toContain('目标：年度目标')
    expect(prompt).toContain('技能：a、b、c')
    expect(buildPrompt(request({ skills: [] }))).toContain('技能：未指定')
  })

  it('注入 model 时以返回文本作为 artifactContent 并收到 buildPrompt 结果', () => {
    let received = ''
    const runtime = new SimulatedRuntime({
      now: NOW,
      model: (prompt: string): string => {
        received = prompt
        return '# 自定义产物\n\n来自模型。'
      },
    })
    const result = runtime.execute(request())
    expect(result.artifactContent).toBe('# 自定义产物\n\n来自模型。')
    expect(received).toBe(buildPrompt(request()))
    expect(result.artifactKind).toBe('report')
    expect(result.summary).toContain(TASK_TITLE)
  })

  it('报告生成时间来自注入的 now()', () => {
    const runtime = new SimulatedRuntime({ now: () => new Date('2030-05-06T07:08:09.000Z') })
    expect(runtime.execute(request()).artifactContent).toContain('2030-05-06T07:08:09.000Z')
  })
})

describe('ExecutionService', () => {
  it('startExecution 校验空字段并生成 running 快照', () => {
    const service = new ExecutionService({ now: NOW })
    expect(
      errorCode(() => service.startExecution({ taskId: '', botId: BOT, title: TASK_TITLE })),
    ).toBe('RUNTIME_INVALID_ARGUMENT')
    expect(
      errorCode(() => service.startExecution({ taskId: 'task-1', botId: BOT, title: '   ' })),
    ).toBe('RUNTIME_INVALID_ARGUMENT')
    expect(service.events()).toHaveLength(0)

    const snapshot = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    expect(snapshot.id).toBe('execution-1')
    expect(snapshot.status).toBe('running')
    expect(snapshot.taskId).toBe('task-1')
    expect(snapshot.botId).toBe(BOT)
    expect(snapshot.title).toBe(TASK_TITLE)
    expect(snapshot.startedAt).toBe(ISO_NOW)
    expect(snapshot.artifactRefs).toEqual([])
    expect(snapshot.toolCalls).toEqual([])
  })

  it('startExecution 追加一个事件、触发 onCommit 并支持注入 idFactory', () => {
    const committed: LoggedExecutionEvent[] = []
    const service = new ExecutionService({
      now: NOW,
      idFactory: () => 'custom-execution',
      onCommit: entry => committed.push(entry),
    })
    const snapshot = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    expect(snapshot.id).toBe('custom-execution')
    expect(service.events()).toHaveLength(1)
    expect(service.events()[0]?.event.type).toBe('execution/started')
    expect(committed).toHaveLength(1)
    expect(committed[0]?.seq).toBe(1)
    expect(committed[0]?.event).toEqual(service.events()[0]?.event)
  })

  it('succeedExecution 折叠成功状态与全部字段', () => {
    const service = new ExecutionService({ now: NOW })
    const started = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    const input = successInput()
    const finished = service.succeedExecution(started.id, input)
    expect(finished.status).toBe('succeeded')
    expect(finished.summary).toBe(input.summary)
    expect(finished.artifactRefs).toEqual(input.artifactRefs)
    expect(finished.toolCalls).toEqual(input.toolCalls)
    expect(finished.confidence).toBe(0.9)
    expect(finished.durationMs).toBe(42)
    expect(finished.finishedAt).toBe(ISO_NOW)
    expect(service.events().map(entry => entry.event.type)).toEqual([
      'execution/started',
      'execution/succeeded',
    ])
  })

  it('failExecution 折叠失败原因与耗时', () => {
    const service = new ExecutionService({ now: NOW })
    const started = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    const failed = service.failExecution(started.id, { reason: '模型不可用', durationMs: 7 })
    expect(failed.status).toBe('failed')
    expect(failed.failureReason).toBe('模型不可用')
    expect(failed.durationMs).toBe(7)
    expect(failed.finishedAt).toBe(ISO_NOW)
    expect(service.getStats().failedCount).toBe(1)
  })

  it('已完成的执行不能再次 succeed 或 fail', () => {
    const service = new ExecutionService({ now: NOW })
    const first = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    service.succeedExecution(first.id, successInput())
    expect(
      errorCode(() => service.succeedExecution(first.id, successInput())),
    ).toBe('RUNTIME_EXECUTION_ALREADY_FINISHED')
    expect(
      errorCode(() => service.failExecution(first.id, { reason: 'x', durationMs: 1 })),
    ).toBe('RUNTIME_EXECUTION_ALREADY_FINISHED')

    const second = service.startExecution({ taskId: 'task-2', botId: BOT, title: TASK_TITLE })
    service.failExecution(second.id, { reason: 'x', durationMs: 1 })
    expect(
      errorCode(() => service.succeedExecution(second.id, successInput())),
    ).toBe('RUNTIME_EXECUTION_ALREADY_FINISHED')
  })

  it('未知 executionId 抛 RUNTIME_EXECUTION_NOT_FOUND', () => {
    const service = new ExecutionService({ now: NOW })
    const missing = ExecutionId('execution-404')
    expect(service.getExecution(missing)).toBeUndefined()
    expect(
      errorCode(() => service.succeedExecution(missing, successInput())),
    ).toBe('RUNTIME_EXECUTION_NOT_FOUND')
    expect(
      errorCode(() => service.failExecution(missing, { reason: 'x', durationMs: 1 })),
    ).toBe('RUNTIME_EXECUTION_NOT_FOUND')
  })

  it('confidence 越界或非有限值抛 RUNTIME_INVALID_ARGUMENT', () => {
    const service = new ExecutionService({ now: NOW })
    for (const confidence of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const started = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
      expect(
        errorCode(() =>
          service.succeedExecution(started.id, { ...successInput(), confidence }),
        ),
      ).toBe('RUNTIME_INVALID_ARGUMENT')
      expect(service.getExecution(started.id)?.status).toBe('running')
    }
    expect(service.events()).toHaveLength(4)
  })

  it('getStats 统计数量、成功率、平均置信度与工具调用数（与 statsOf 一致）', () => {
    const service = new ExecutionService({ now: NOW })
    const a = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    service.succeedExecution(a.id, successInput())
    const b = service.startExecution({ taskId: 'task-2', botId: OTHER, title: TASK_TITLE })
    service.failExecution(b.id, { reason: 'x', durationMs: 1 })
    service.startExecution({ taskId: 'task-3', botId: BOT, title: TASK_TITLE })

    const expected = {
      executionCount: 3,
      runningCount: 1,
      succeededCount: 1,
      failedCount: 1,
      successRate: 0.33,
      averageConfidence: 0.9,
      toolCallCount: 2,
    }
    expect(service.getStats()).toEqual(expected)
    expect(statsOf(service.getState())).toEqual(expected)
    expect(service.executionsOf(BOT)).toHaveLength(2)
    expect(service.executionsOf(OTHER)).toHaveLength(1)
  })

  it('restoreRuntime 重放后状态与事件日志一致', () => {
    const original = new ExecutionService({ now: NOW })
    const a = original.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    original.succeedExecution(a.id, successInput())
    const b = original.startExecution({ taskId: 'task-2', botId: OTHER, title: TASK_TITLE })
    original.failExecution(b.id, { reason: 'x', durationMs: 3 })

    const events = original.events().map(entry => entry.event)
    const restored = restoreRuntime(events, { now: NOW })
    expect(restored.getState()).toEqual(original.getState())
    expect(restored.events()).toEqual(original.events())
    expect(replay(events)).toEqual(original.getState())
    expect(restored.getStats()).toEqual(original.getStats())

    let state = emptyState()
    for (const event of events) state = applyEvent(state, event)
    expect(state).toEqual(original.getState())
  })

  it('getExecution/listExecutions 返回快照副本', () => {
    const service = new ExecutionService({ now: NOW })
    const a = service.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    const b = service.startExecution({ taskId: 'task-2', botId: OTHER, title: TASK_TITLE })
    expect(service.listExecutions()).toHaveLength(2)
    expect(service.getExecution(a.id)).toEqual(a)
    expect(service.getExecution(ExecutionId('nope'))).toBeUndefined()

    const detached = service.getExecution(a.id) as unknown as { status: string }
    detached.status = 'succeeded'
    expect(service.getExecution(a.id)?.status).toBe('running')
    expect(service.listExecutions()[1]?.id).toBe(b.id)
  })

  it('注入 store 时构造阶段折叠已有日志', () => {
    const store = new MemoryExecutionStore()
    const first = new ExecutionService({ now: NOW, store })
    const started = first.startExecution({ taskId: 'task-1', botId: BOT, title: TASK_TITLE })
    expect(store.size).toBe(1)

    const second = new ExecutionService({ now: NOW, store })
    expect(second.getExecution(started.id)?.status).toBe('running')
    expect(second.startExecution({ taskId: 'task-2', botId: BOT, title: TASK_TITLE }).id).toBe(
      'execution-2',
    )
    expect(store.size).toBe(2)
  })
})

describe('AgentRunner', () => {
  it('完整闭环：任务完成、报告生成、执行成功、artifactSink 的 refs 写入', async () => {
    let sinkInput: ArtifactSinkInput | undefined
    const refs = ['artifact://report-1', 'artifact://report-2']
    const { tasks, executions, runner } = makeFixture({
      artifactSink: (input: ArtifactSinkInput): readonly string[] => {
        sinkInput = input
        return refs
      },
    })
    const taskId = assignedTask(tasks)
    const result = await runner.runTask(taskId)

    expect(result.task.status).toBe('completed')
    expect(result.task.artifactRefs).toEqual(refs)
    expect(result.task.completionSummary).toBe(result.execution.summary)
    expect(result.execution.status).toBe('succeeded')
    expect(result.execution.artifactRefs).toEqual(refs)
    expect(result.execution.toolCalls.length).toBeGreaterThan(0)
    expect(result.report.status).toBe('submitted')
    expect(result.report.authorId).toBe(BOT)
    expect(result.report.summary).toBe(result.execution.summary)
    expect(result.report.artifactRefs).toEqual(refs)
    expect(result.artifact.title).toBe(`${TASK_TITLE} — 执行报告`)
    expect(result.artifact.kind).toBe('report')
    expect(result.artifact.content).toContain(`# ${TASK_TITLE}`)
    expect(result.artifact.refs).toEqual(refs)

    expect(sinkInput?.title).toBe(result.artifact.title)
    expect(sinkInput?.kind).toBe('report')
    expect(sinkInput?.content).toBe(result.artifact.content)
    expect(sinkInput?.createdBy).toBe(BOT)
    expect(sinkInput?.taskId).toBe(String(taskId))

    expect(tasks.getTask(taskId)?.status).toBe('completed')
    expect(tasks.reportsOfTask(taskId)).toHaveLength(1)
    expect(tasks.events().filter(entry => entry.event.type === 'task/started')).toHaveLength(1)
    expect(executions.getExecution(result.execution.id)?.status).toBe('succeeded')
    expect(executions.events().map(entry => entry.event.type)).toEqual([
      'execution/started',
      'execution/succeeded',
    ])
  })

  it('未注入 artifactSink 时使用 artifact://<executionId> 作为默认 ref', async () => {
    const { tasks, runner } = makeFixture()
    const taskId = assignedTask(tasks)
    const result = await runner.runTask(taskId)
    const expected = [`artifact://${result.execution.id}`]
    expect(result.artifact.refs).toEqual(expected)
    expect(result.task.artifactRefs).toEqual(expected)
    expect(result.report.artifactRefs).toEqual(expected)
  })

  it('未指派任务拒绝：RUNTIME_TASK_NOT_ASSIGNED', async () => {
    const { tasks, runner } = makeFixture()
    const task = tasks.createTask({ title: '无人认领', createdBy: BOT })
    expect(await asyncErrorCode(() => runner.runTask(task.id))).toBe('RUNTIME_TASK_NOT_ASSIGNED')
  })

  it('未知任务拒绝：RUNTIME_TASK_NOT_FOUND', async () => {
    const { runner } = makeFixture()
    expect(await asyncErrorCode(() => runner.runTask(TaskId('task-404')))).toBe(
      'RUNTIME_TASK_NOT_FOUND',
    )
  })

  it('终态任务（completed / cancelled）拒绝：RUNTIME_TASK_NOT_RUNNABLE', async () => {
    const { tasks, runner } = makeFixture()
    const completedId = assignedTask(tasks)
    tasks.completeTask(completedId, { summary: '提前完成' }, { actorId: BOT })
    expect(await asyncErrorCode(() => runner.runTask(completedId))).toBe(
      'RUNTIME_TASK_NOT_RUNNABLE',
    )

    const cancelledId = assignedTask(tasks)
    tasks.cancelTask(cancelledId, '不再需要', { actorId: BOT })
    expect(await asyncErrorCode(() => runner.runTask(cancelledId))).toBe(
      'RUNTIME_TASK_NOT_RUNNABLE',
    )
  })

  it('runtime 抛错时 failExecution 落库，并抛出带 cause 的 RUNTIME_EXECUTION_FAILED', async () => {
    const failing: BotRuntime = {
      execute: (): ExecutionResult => {
        throw new Error('模型不可用')
      },
    }
    const { tasks, executions, runner } = makeFixture({ runtime: failing })
    const taskId = assignedTask(tasks)

    let caught: unknown
    try {
      await runner.runTask(taskId)
    } catch (error: unknown) {
      caught = error
    }
    expect(caught).toBeInstanceOf(RuntimeError)
    expect((caught as RuntimeError).code).toBe('RUNTIME_EXECUTION_FAILED')
    expect((caught as RuntimeError).cause).toBeInstanceOf(Error)

    const all = executions.listExecutions()
    expect(all).toHaveLength(1)
    expect(all[0]?.status).toBe('failed')
    expect(all[0]?.failureReason).toBe('模型不可用')
    expect(executions.events().map(entry => entry.event.type)).toEqual([
      'execution/started',
      'execution/failed',
    ])
    expect(tasks.getTask(taskId)?.status).toBe('in_progress')
    expect(tasks.reportsOfTask(taskId)).toHaveLength(0)
  })

  it('skillsOf 与 goalTitle 传入 ExecutionRequest，且 context 优先于 options', async () => {
    const capture = capturingRuntime()
    const { tasks, runner } = makeFixture({
      runtime: capture.runtime,
      skillsOf: () => ['analysis', 'writing'],
      goalTitle: '选项目标',
    })
    const taskId = assignedTask(tasks)
    await runner.runTask(taskId, { goalTitle: '上下文目标' })

    const captured = capture.read()
    expect(captured?.botId).toBe(BOT)
    expect(captured?.displayName).toBe('Ada')
    expect(captured?.roleId).toBe('ceo')
    expect(captured?.taskTitle).toBe(TASK_TITLE)
    expect(captured?.skills).toEqual(['analysis', 'writing'])
    expect(captured?.goalTitle).toBe('上下文目标')
  })

  it('无 context 时使用 options.goalTitle，directory 缺省回退到 String(botId)/member', async () => {
    const capture = capturingRuntime()
    const { tasks, runner } = makeFixture({
      runtime: capture.runtime,
      goalTitle: '选项目标',
      directory: { getMember: () => undefined },
    })
    const taskId = assignedTask(tasks)
    await runner.runTask(taskId)
    expect(capture.read()?.goalTitle).toBe('选项目标')
    expect(capture.read()?.displayName).toBe(String(BOT))
    expect(capture.read()?.roleId).toBe('member')
    expect(capture.read()?.skills).toEqual([])
  })

  it('status=in_progress 时跳过 startTask，不重复写入 task/started', async () => {
    const { tasks, runner } = makeFixture()
    const taskId = assignedTask(tasks)
    tasks.startTask(taskId, { actorId: BOT })
    const before = tasks.events().filter(entry => entry.event.type === 'task/started').length
    const result = await runner.runTask(taskId)
    const after = tasks.events().filter(entry => entry.event.type === 'task/started').length
    expect(after).toBe(before)
    expect(result.task.status).toBe('completed')
    expect(result.execution.status).toBe('succeeded')
  })
})
