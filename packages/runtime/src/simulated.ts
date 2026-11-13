/**
 * Deterministic, dependency-free Bot runtime for tests and standalone demos.
 *
 * The simulator never reads ambient time or randomness: an identical request
 * always yields byte-identical output. Hosts may inject `model` to route the
 * composed prompt to a real LLM while keeping the surrounding API stable.
 *
 * @module @compbotorg/runtime/simulated
 */

import type { BotRuntime, ExecutionRequest, ExecutionResult } from './types'

/** Construction options for {@link SimulatedRuntime}. */
export interface SimulatedRuntimeOptions {
  /** Optional model adapter; its returned text becomes the artifact content. */
  readonly model?: (prompt: string) => string
  /** Clock used for the report timestamp; defaults to a fixed instant. */
  readonly now?: () => Date
}

/** Fixed instant used when no clock is injected, keeping output deterministic. */
const FIXED_INSTANT = '2026-01-01T00:00:00.000Z'

/** Tools the simulator may add to the baseline workflow. */
const OPTIONAL_TOOLS: readonly string[] = [
  'web.search',
  'analysis.summarize',
  'code.review',
]

/** Analysis points selected three at a time from a title hash. */
const ANALYSIS_POINTS: readonly string[] = [
  '梳理任务上下文与约束条件，明确交付边界与验收口径',
  '核对组织内已有资料、历史决策与相关报告',
  '识别关键干系人及其信息需求，确认沟通路径',
  '评估候选方案的成本、收益与实施路径',
  '把目标拆解为可验证的阶段里程碑',
  '交叉验证数据来源并标注不确定性',
  '对照角色职责检查权限与合规边界',
  '归纳结论并给出可执行的下一步动作',
]

/** Risks chosen from the same deterministic hash. */
const RISKS: readonly string[] = [
  '输入资料可能不完整，结论需在补充证据后复核',
  '跨部门依赖尚未确认，排期存在波动',
  '部分指标缺少历史基线，估算偏差需持续跟踪',
]

/** Follow-up suggestions chosen from the same deterministic hash. */
const SUGGESTIONS: readonly string[] = [
  '建议先完成小范围试点，再按里程碑扩展执行',
  '建议指定专人维护数据口径并定期回看结论',
  '建议将本次产物归档，供后续任务复用',
]

/**
 * Stable FNV-1a style hash over UTF-16 code units.
 * @param text - value to hash.
 * @returns an unsigned 32-bit digest.
 */
function hashOf(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/**
 * Read one pool entry without leaking `undefined` under noUncheckedIndexedAccess.
 * @param pool - candidate strings.
 * @param index - deterministic index.
 * @param fallback - safest value if the pool is unexpectedly empty.
 * @returns one string.
 */
function pick(pool: readonly string[], index: number, fallback: string): string {
  return pool[index] ?? pool[0] ?? fallback
}

/**
 * Digest the parts of a request that steer tool and point selection.
 * @param request - execution context.
 * @returns the shared seed.
 */
function seedOf(request: ExecutionRequest): number {
  return hashOf([request.taskTitle, request.roleId, request.skills.join(',')].join('|'))
}

/**
 * Choose a deterministic tool list from the shared seed.
 * @param seed - request digest.
 * @returns ordered tool names.
 */
function toolsOf(seed: number): readonly string[] {
  const tools: string[] = ['workspace.read']
  for (let index = 0; index < OPTIONAL_TOOLS.length; index += 1) {
    const tool = OPTIONAL_TOOLS[index]
    if (tool !== undefined && (((seed >>> (index * 3 + 1)) & 0b11) !== 0)) {
      tools.push(tool)
    }
  }
  tools.push('artifact.write')
  return tools
}

/**
 * Choose three distinct analysis points from the title digest.
 * @param seed - task title digest.
 * @returns three Chinese analysis points.
 */
function pointsOf(seed: number): readonly string[] {
  const start = seed % ANALYSIS_POINTS.length
  const points: string[] = []
  for (let offset = 0; offset < 3; offset += 1) {
    points.push(
      pick(ANALYSIS_POINTS, (start + offset * 3) % ANALYSIS_POINTS.length, '复核任务上下文与交付边界'),
    )
  }
  return points
}

/**
 * Derive a confidence in [0.82, 0.96], rounded to two decimals.
 * @param seed - request digest.
 * @returns a two-decimal confidence.
 */
function confidenceOf(seed: number): number {
  return Math.round((0.82 + ((seed >>> 8) % 15) / 100) * 100) / 100
}

/**
 * Build the prompt handed to an injected model.
 *
 * All request fields are rendered; optional fields are omitted rather than
 * stringified as `undefined`, so a real model sees a clean instruction.
 *
 * @param request - the task and identity context.
 * @returns a stable multi-line Chinese prompt.
 */
export function buildPrompt(request: ExecutionRequest): string {
  const lines: string[] = [
    '你是 CompbotOrg 中的一名 Bot，请依据以下上下文完成任务并输出 Markdown 执行报告。',
    `Bot：${request.displayName}（${request.botId}）`,
    `角色：${request.roleId}`,
    `任务标题：${request.taskTitle}`,
    ...(request.taskDescription === undefined ? [] : [`任务描述：${request.taskDescription}`]),
    `技能：${request.skills.length === 0 ? '未指定' : request.skills.join('、')}`,
    `目标：${request.goalTitle ?? request.taskTitle}`,
    '请覆盖：执行人/角色/目标、方法、三条分析要点、结论、风险与建议。',
  ]
  return lines.join('\n')
}

/** Material shared between {@link SimulatedRuntime.execute} and its renderer. */
interface ReportMaterial {
  readonly tools: readonly string[]
  readonly points: readonly string[]
  readonly summary: string
  readonly confidence: number
}

/**
 * A fully deterministic {@link BotRuntime} implementation.
 *
 * @example
 * const runtime = new SimulatedRuntime({ now: () => new Date('2026-01-01T00:00:00Z') })
 * const result = runtime.execute(request)
 */
export class SimulatedRuntime implements BotRuntime {
  private readonly model: ((prompt: string) => string) | undefined
  private readonly now: () => Date

  /**
   * @param options - optional model adapter and clock override.
   */
  constructor(options: SimulatedRuntimeOptions = {}) {
    this.model = options.model
    this.now = options.now ?? (() => new Date(FIXED_INSTANT))
  }

  /**
   * Execute one task and produce a report artifact.
   *
   * Every field is derived from a string hash of the request; when `model` is
   * injected its response replaces only `artifactContent`.
   *
   * @param request - task and identity context.
   * @returns summary, artifact, tool calls and confidence.
   */
  execute(request: ExecutionRequest): ExecutionResult {
    const seed = seedOf(request)
    const tools = toolsOf(seed)
    const points = pointsOf(hashOf(request.taskTitle))
    const confidence = confidenceOf(seed)
    const summary = `已完成「${request.taskTitle}」：基于 ${tools.length} 项工具形成结论，可信度 ${confidence.toFixed(2)}。`
    const artifactTitle = `${request.taskTitle} — 执行报告`
    const material: ReportMaterial = { tools, points, summary, confidence }
    const artifactContent = this.model === undefined
      ? this.render(request, material)
      : this.model(buildPrompt(request))
    return {
      summary,
      artifactTitle,
      artifactContent,
      artifactKind: 'report',
      toolCalls: tools,
      confidence,
    }
  }

  /**
   * Render the default Chinese Markdown report.
   * @param request - execution context used for the header and metadata.
   * @param material - selected tools, points, summary and confidence.
   * @returns the Markdown document.
   */
  private render(request: ExecutionRequest, material: ReportMaterial): string {
    const seed = seedOf(request)
    const risk = pick(RISKS, (seed >>> 4) % RISKS.length, '输入资料可能不完整')
    const suggestion = pick(SUGGESTIONS, (seed >>> 12) % SUGGESTIONS.length, '建议先完成小范围试点')
    const lines: string[] = [
      `# ${request.taskTitle} — 执行报告`,
      '',
      `- 执行人：${request.displayName}（${request.botId}）`,
      `- 角色：${request.roleId}`,
      `- 目标：${request.goalTitle ?? request.taskTitle}`,
      `- 结论可信度：${material.confidence.toFixed(2)}`,
    ]
    if (request.taskDescription !== undefined) {
      lines.push(`- 任务描述：${request.taskDescription}`)
    }
    lines.push('', '## 方法', '', '本次执行按确定性顺序调用以下工具：', '')
    for (const [index, tool] of material.tools.entries()) {
      lines.push(`${index + 1}. \`${tool}\``)
    }
    lines.push('', '## 分析要点', '')
    for (const [index, point] of material.points.entries()) {
      lines.push(`${index + 1}. ${point}`)
    }
    lines.push(
      '',
      '## 结论',
      '',
      material.summary,
      '',
      '## 风险与建议',
      '',
      `- 风险：${risk}`,
      `- 建议：${suggestion}`,
      '',
      '## 生成时间',
      '',
      this.now().toISOString(),
      '',
    )
    return lines.join('\n')
  }
}
