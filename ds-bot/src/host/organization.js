// CompBotOrg organization layer: a lightweight graph over DS Bot's existing roster.
// DSH remains the runtime; this module only adds company structure and coordination
// metadata. Nothing here is authoritative for Bot execution.
import { randomUUID } from 'node:crypto'

export const RELATION_TYPES = new Set([
  'manages', 'reports_to', 'member_of', 'collaborates', 'advisor_of', 'project_lead', 'delegates_to',
])

// Goal → Project → Task → Assignment → Report → Review → Result.
export const TASK_STATUSES = new Set(['pending', 'running', 'review', 'blocked', 'done'])
export const DELIVERY_STATUSES = new Set(['unassigned', 'ready', 'dispatched', 'acknowledged', 'failed'])

// 职级只描述岗位层级，不改变 DSH 的权限：L5 决策层 → L1 执行。
export const LEVELS = { 5: '决策层', 4: '管理层', 3: '主管', 2: '骨干', 1: '执行' }
export const levelOf = value => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}
const defaultLevel = bot => bot?.main ? 5 : 2
const STATUS_ALIASES = {
  pending: 'pending', 'not started': 'pending', todo: 'pending', 待办: 'pending', 待启动: 'pending',
  running: 'running', working: 'running', active: 'running', 'in progress': 'running', in_progress: 'running', 进行中: 'running', 工作中: 'running',
  review: 'review', reported: 'review', 待验收: 'review', 验收中: 'review',
  blocked: 'blocked', 阻塞: 'blocked', 需要关注: 'blocked',
  done: 'done', completed: 'done', 已完成: 'done',
}
export const taskStatus = value => STATUS_ALIASES[String(value ?? '').trim().toLowerCase()] ?? null

const clean = value => typeof value === 'string' ? value.trim() : ''
const id = prefix => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`
const limit = (value, max) => clean(value).slice(0, max)
const stamp = () => Date.now()
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
const TASK_TRANSITIONS = {
  pending: new Set(['pending', 'running', 'blocked']),
  running: new Set(['running', 'review', 'blocked']),
  review: new Set(['review', 'running', 'blocked', 'done']),
  blocked: new Set(['blocked', 'pending', 'running']),
  done: new Set(['done', 'review']),
}

const EMPTY_ORG = () => ({
  version: 3,
  name: 'CompBotOrg',
  owner: { id: 'owner', name: '老板', role: 'Owner' },
  departments: [], edges: [], projects: [], tasks: [], decisions: [], activity: [], actions: [],
})

export function ensureOrganization(state) {
  if (!state.organization || typeof state.organization !== 'object' || Array.isArray(state.organization)) state.organization = EMPTY_ORG()
  const org = state.organization
  for (const key of ['departments', 'edges', 'projects', 'tasks', 'decisions', 'activity', 'actions']) {
    if (!Array.isArray(org[key])) org[key] = []
  }
  if (!org.owner || typeof org.owner !== 'object') org.owner = { id: 'owner', name: '老板', role: 'Owner' }
  org.version = 3
  return org
}

function logActivity(org, text, kind = 'info') {
  org.activity = [...org.activity, { id: id('event'), at: stamp(), kind, text: limit(text, 300) }].slice(-60)
}

// An action is a record of work a Bot actually did in DSH, not a promise to do it.
// `kind` is the lifecycle step or the tool that produced it; `text` is what it did.
export function recordAction(state, input = {}) {
  const org = ensureOrganization(state)
  const botId = clean(input.botId)
  const text = limit(input.text, 300)
  if (!botId || !text) return null
  const action = {
    id: id('action'), botId, kind: limit(input.kind ?? 'step', 40) || 'step',
    text, taskId: clean(input.taskId) || null,
    source: clean(input.source) || 'dsh', at: stamp(),
  }
  org.actions = [...org.actions, action].slice(-300)
  // Keep the work visible where the task is reviewed, not only in the global feed.
  const task = action.taskId
    ? org.tasks.find(item => item.id === action.taskId)
    : org.tasks.find(item => item.assigneeId === botId && item.status === 'running')
  if (task) {
    action.taskId = task.id
    taskEvent(task, 'action', `${action.kind}: ${action.text}`)
  }
  return action
}

// Read-only: what each Bot is doing right now, for the navigation column.
function currentActionsOf(org) {
  const tasks = org.tasks
  const latest = new Map()
  for (const action of org.actions) if (action.botId) latest.set(action.botId, action)
  const out = {}
  for (const task of tasks) {
    if (!task.assigneeId) continue
    const active = task.status === 'running' || task.status === 'review' || task.status === 'blocked'
    if (!active) continue
    const last = latest.get(task.assigneeId)
    out[task.assigneeId] = {
      status: task.status,
      taskId: task.id,
      taskTitle: task.title ?? '',
      text: last && (!last.taskId || last.taskId === task.id) ? last.text : '',
      kind: last?.kind ?? task.status,
    }
  }
  return out
}

// A read-only projection. The Owner→CEO edge is derived, not stored: view() runs on
// every roster poll and must never write to state.
export function organizationView(state) {
  const org = ensureOrganization(state)
  const edges = org.edges.map(edge => ({ ...edge }))
  const ceo = state.mainBotIds?.[0]
  if (ceo && !edges.some(edge => edge.from === 'owner' && edge.to === ceo && edge.type === 'manages')) {
    edges.push({ id: 'edge-owner-ceo', from: 'owner', to: ceo, type: 'manages' })
  }
  const employees = Object.values(state.bots ?? {}).map(bot => {
    const level = levelOf(bot.level) ?? defaultLevel({ ...bot, main: state.mainBotIds?.includes(bot.id) === true })
    return {
      id: bot.id,
      name: bot.name,
      role: bot.role ?? '',
      main: state.mainBotIds?.includes(bot.id) === true,
      sectionId: bot.sectionId ?? null,
      departmentId: bot.departmentId ?? null,
      organizationRole: bot.organizationRole ?? bot.role ?? '',
      level,
      levelLabel: LEVELS[level],
      model: bot.model ?? bot.appliedModel ?? null,
      joinedAt: bot.createdAt ?? null,
    }
  })
  const tasks = org.tasks.map(task => ({ ...task }))
  const projects = org.projects.map(project => {
    const own = tasks.filter(task => task.projectId === project.id)
    const progress = own.length > 0
      ? Math.round(own.reduce((sum, task) => sum + pct(task.progress), 0) / own.length)
      : pct(project.progress)
    return {
      ...project,
      progress,
      status: project.status || 'active',
      taskCount: own.length,
      doneCount: own.filter(task => task.status === 'done').length,
    }
  })
  const departments = org.departments.map(department => ({
    ...department,
    memberCount: employees.filter(employee => employee.departmentId === department.id).length,
  }))
  const decisions = org.decisions.filter(decision => decision.status === 'pending')
  return {
    ...org,
    employees, departments, edges, projects, tasks, decisions,
    actions: org.actions.slice(-120),
    currentActions: currentActionsOf(org),
    levels: LEVELS,
    stats: {
      employees: employees.length,
      departments: departments.length,
      projects: projects.length,
      tasks: tasks.length,
      relations: edges.length,
      running: tasks.filter(task => task.status === 'running').length,
      review: tasks.filter(task => task.status === 'review').length,
      blocked: tasks.filter(task => task.status === 'blocked').length,
      done: tasks.filter(task => task.status === 'done').length,
      pending: tasks.filter(task => task.status === 'pending').length,
    },
  }
}

export function addDepartment(state, input = {}) {
  const org = ensureOrganization(state)
  const name = clean(input.name)
  if (!name) throw Object.assign(new Error('Department name is required'), { code: 'bot/invalid' })
  const department = {
    id: limit(input.id, 80) || id('dept'),
    name: name.slice(0, 80),
    description: limit(input.description, 500),
    parentId: limit(input.parentId, 80) || null,
    icon: limit(input.icon, 40) || null,
  }
  if (org.departments.some(item => item.id === department.id)) throw Object.assign(new Error('Department already exists'), { code: 'bot/invalid' })
  org.departments.push(department)
  logActivity(org, `新建部门 ${department.name}`)
  return department
}

// Renaming, re-parenting or re-describing a department. Nothing is cleared unless
// the field was sent, so a partial edit cannot wipe the rest.
export function updateDepartment(state, input = {}) {
  const org = ensureOrganization(state)
  const departmentId = clean(input.departmentId ?? input.id)
  const department = org.departments.find(item => item.id === departmentId)
  if (!department) throw Object.assign(new Error('Unknown department'), { code: 'bot/not-found' })
  const name = clean(input.name)
  if (name) {
    if (org.departments.some(item => item.id !== department.id && item.name === name)) {
      throw Object.assign(new Error('A department with that name already exists'), { code: 'bot/invalid' })
    }
    department.name = name.slice(0, 80)
  }
  if (input.description !== undefined) department.description = limit(input.description, 500)
  if (input.parentId !== undefined) {
    const parentId = clean(input.parentId)
    if (parentId === department.id) throw Object.assign(new Error('A department cannot sit under itself'), { code: 'bot/invalid' })
    if (parentId && !org.departments.some(item => item.id === parentId)) throw Object.assign(new Error('Unknown parent department'), { code: 'bot/not-found' })
    // Walking up from the new parent must never come back to this department.
    for (let cursor = parentId, guard = 0; cursor && guard < 32; guard += 1) {
      if (cursor === department.id) throw Object.assign(new Error('That parent sits inside this department'), { code: 'bot/invalid' })
      cursor = org.departments.find(item => item.id === cursor)?.parentId ?? null
    }
    department.parentId = parentId || null
  }
  logActivity(org, `更新部门 ${department.name}`)
  return department
}

// Only an empty department can go: its members and sub-departments have to be moved
// first, so a click here can never orphan a Bot.
export function removeDepartment(state, input = {}) {
  const org = ensureOrganization(state)
  const departmentId = clean(input.departmentId ?? input.id)
  const named = clean(input.name)
  const department = org.departments.find(item => item.id === departmentId)
    ?? (named ? org.departments.find(item => item.name === named) : undefined)
  if (!department) throw Object.assign(new Error('Unknown department'), { code: 'bot/not-found' })
  const members = Object.values(state.bots ?? {}).filter(bot => bot.departmentId === department.id)
  if (members.length > 0) throw Object.assign(new Error(`Move ${members.length} member(s) out before deleting this department`), { code: 'bot/invalid' })
  if (org.departments.some(item => item.parentId === department.id)) throw Object.assign(new Error('Delete its sub-departments first'), { code: 'bot/invalid' })
  org.departments = org.departments.filter(item => item.id !== department.id)
  logActivity(org, `删除部门 ${department.name}`)
  return department
}

export function setRelation(state, input = {}) {
  const org = ensureOrganization(state)
  const from = clean(input.from)
  const to = clean(input.to)
  const type = clean(input.type)
  if (!from || !to || from === to || !RELATION_TYPES.has(type)) throw Object.assign(new Error('Invalid organization relation'), { code: 'bot/invalid' })
  const existing = org.edges.find(edge => edge.from === from && edge.to === to && edge.type === type)
  if (existing) return existing
  const edge = { id: clean(input.id) || id('edge'), from, to, type }
  org.edges.push(edge)
  return edge
}

export function removeRelation(state, edgeId) {
  const org = ensureOrganization(state)
  const before = org.edges.length
  org.edges = org.edges.filter(edge => edge.id !== edgeId)
  return before !== org.edges.length
}

export function upsertProject(state, input = {}) {
  const org = ensureOrganization(state)
  const name = clean(input.name)
  if (!name) throw Object.assign(new Error('Project name is required'), { code: 'bot/invalid' })
  const project = {
    id: clean(input.id) || id('project'),
    name: name.slice(0, 120),
    status: clean(input.status) || 'active',
    leadId: clean(input.leadId) || null,
    goal: limit(input.goal, 1000),
    description: limit(input.description, 1000),
  }
  const index = org.projects.findIndex(item => item.id === project.id)
  if (index >= 0) org.projects[index] = { ...org.projects[index], ...project }
  else org.projects.push(project)
  logActivity(org, `${index >= 0 ? '更新' : '新建'}项目 ${project.name}`)
  return project
}

export function assignEmployee(state, input = {}) {
  const org = ensureOrganization(state)
  const botId = clean(input.botId)
  const bot = state.bots?.[botId]
  if (!bot) throw Object.assign(new Error('Unknown Bot'), { code: 'bot/not-found' })
  const departmentId = clean(input.departmentId)
  if (departmentId && !org.departments.some(department => department.id === departmentId)) throw Object.assign(new Error('Unknown department'), { code: 'bot/not-found' })
  if (departmentId) bot.departmentId = departmentId
  else delete bot.departmentId
  const title = input.title !== undefined ? clean(input.title) : clean(input.role)
  if (input.title !== undefined || input.role !== undefined) bot.organizationRole = title.slice(0, 80)
  if (input.level !== undefined && input.level !== '' && input.level !== null) {
    const level = levelOf(input.level)
    if (level === null) throw Object.assign(new Error('Level must be a whole number from 1 to 5'), { code: 'bot/invalid' })
    bot.level = level
  }
  if (input.reportsTo !== undefined) {
    org.edges = org.edges.filter(edge => !(edge.from === botId && edge.type === 'reports_to'))
    const reportsTo = clean(input.reportsTo)
    if (reportsTo) setRelation(state, { from: reportsTo, to: botId, type: 'manages' }), setRelation(state, { from: botId, to: reportsTo, type: 'reports_to' })
  }
  return bot
}

// -------------------------------------------------------------------------
// Tasks: Assignment → Report → Review → Result.

function findTask(org, ref) {
  const key = clean(ref)
  if (!key) return undefined
  const byId = org.tasks.find(task => task.id === key)
  if (byId) return byId
  const matches = org.tasks.filter(task => String(task.title ?? '').toLowerCase() === key.toLowerCase())
  if (matches.length > 1) throw Object.assign(new Error('Task title is ambiguous; use its id'), { code: 'bot/invalid' })
  return matches[0]
}

function requireBot(state, value) {
  const botId = clean(value)
  if (botId && !state.bots?.[botId]) throw Object.assign(new Error('Unknown task assignee'), { code: 'bot/not-found' })
  return botId || null
}

function taskEvent(task, kind, text) {
  task.history = [...(Array.isArray(task.history) ? task.history : []), {
    id: id('task_event'), at: stamp(), kind, text: limit(text, 300),
  }].slice(-80)
}

export function addTask(state, input = {}) {
  const org = ensureOrganization(state)
  const title = clean(input.title ?? input.task ?? input.name)
  if (!title) throw Object.assign(new Error('Task title is required'), { code: 'bot/invalid' })
  const projectId = clean(input.projectId) || null
  if (projectId && !org.projects.some(project => project.id === projectId)) throw Object.assign(new Error('Unknown project'), { code: 'bot/not-found' })
  const status = taskStatus(input.status) ?? 'pending'
  const assigneeId = requireBot(state, input.assigneeId)
  const task = {
    id: clean(input.id) || id('task'),
    projectId,
    title: title.slice(0, 200),
    assigneeId,
    label: limit(input.label, 80),
    status,
    progress: status === 'done' ? 100 : pct(input.progress),
    report: limit(input.report, 2000),
    review: limit(input.review, 2000),
    note: limit(input.note, 500),
    createdAt: stamp(),
    updatedAt: stamp(),
    assignment: {
      // Derive delivery from the *cleaned* assignee. A whitespace-only id becomes
      // null above; using the raw input here would leave an unassigned task marked
      // "ready" with no one to dispatch it to.
      status: assigneeId ? 'ready' : 'unassigned',
      requestId: null, // filled in below from the resolved task id
      attempts: 0,
      updatedAt: stamp(),
      error: '',
    },
    history: [],
  }
  task.assignment.requestId = task.assigneeId ? `task:${task.id}` : null
  taskEvent(task, 'created', task.assigneeId ? 'Task created and ready for delegation.' : 'Task created without an assignee.')
  org.tasks.push(task)
  logActivity(org, `任务「${task.title}」${task.assigneeId ? '已分配' : '已创建'}`, 'task')
  return task
}

export function setTask(state, input = {}) {
  const org = ensureOrganization(state)
  const task = findTask(org, input.taskId ?? input.id ?? input.task)
  if (!task) throw Object.assign(new Error('Unknown task'), { code: 'bot/not-found' })
  const status = input.status === undefined ? null : taskStatus(input.status)
  if (input.status !== undefined && status === null) throw Object.assign(new Error('Unknown task status'), { code: 'bot/invalid' })
  // Rows written by older builds may carry a status outside the current enum.
  // Normalise on read instead of locking them out of every legal transition.
  const current = taskStatus(task.status) ?? 'pending'
  if (current !== task.status) task.status = current
  if (status && !TASK_TRANSITIONS[current]?.has(status)) {
    throw Object.assign(new Error(`Invalid task transition: ${current} → ${status}`), { code: 'bot/invalid' })
  }
  if (status === 'review' && !(clean(input.report) || clean(task.report))) {
    throw Object.assign(new Error('A task needs a report before review'), { code: 'bot/invalid' })
  }
  if (status === 'done' && !(clean(input.review) || clean(task.review))) {
    throw Object.assign(new Error('A task needs a CEO review before completion'), { code: 'bot/invalid' })
  }
  if (status) task.status = status
  if (status && status !== current) {
    const label = { pending: '待启动', running: '开始执行', review: '提交审核', blocked: '受阻', done: '已完成' }[status]
    const detail = status === 'review' ? (clean(input.report) || clean(task.report) || label)
      : status === 'blocked' ? (clean(input.note) || label)
        : status === 'done' ? (clean(input.review) || clean(task.review) || label) : label
    recordAction(state, {
      botId: task.assigneeId, kind: status, text: `「${task.title ?? ''}」${detail}`,
      taskId: task.id, source: 'task',
    })
  }
  if (input.progress !== undefined) task.progress = pct(input.progress)
  if (status === 'done') task.progress = 100
  if (input.assigneeId !== undefined) {
    task.assigneeId = requireBot(state, input.assigneeId)
    task.assignment = {
      status: task.assigneeId ? 'ready' : 'unassigned',
      requestId: task.assigneeId ? `task:${task.id}` : null,
      attempts: 0,
      updatedAt: stamp(),
      error: '',
    }
    taskEvent(task, 'reassigned', task.assigneeId ? 'Task assignment changed and needs delegation.' : 'Task assignment was removed.')
  }
  if (input.label !== undefined) task.label = limit(input.label, 80)
  if (input.report !== undefined) task.report = limit(input.report, 2000)
  if (input.review !== undefined) task.review = limit(input.review, 2000)
  if (input.note !== undefined) task.note = limit(input.note, 500)
  task.updatedAt = stamp()
  taskEvent(task, 'updated', `Task is ${task.status} at ${task.progress}%.`)
  logActivity(org, `任务「${task.title}」→ ${task.status} · ${task.progress}%`, 'task')
  return task
}

export function setTaskDelivery(state, input = {}) {
  const org = ensureOrganization(state)
  const task = findTask(org, input.taskId ?? input.id ?? input.task)
  if (!task) throw Object.assign(new Error('Unknown task'), { code: 'bot/not-found' })
  const status = clean(input.status)
  if (!DELIVERY_STATUSES.has(status) || status === 'unassigned') throw Object.assign(new Error('Invalid delivery status'), { code: 'bot/invalid' })
  if (!task.assigneeId) throw Object.assign(new Error('Assign the task before recording delivery'), { code: 'bot/invalid' })
  const delivery = task.assignment && typeof task.assignment === 'object' ? task.assignment : { requestId: `task:${task.id}`, attempts: 0 }
  if (status === 'dispatched') delivery.attempts = Math.max(0, Number(delivery.attempts) || 0) + 1
  delivery.status = status
  delivery.requestId = limit(input.requestId, 120) || delivery.requestId || `task:${task.id}`
  delivery.error = status === 'failed' ? limit(input.error, 500) : ''
  delivery.updatedAt = stamp()
  task.assignment = delivery
  task.updatedAt = stamp()
  recordAction(state, {
    botId: task.assigneeId,
    kind: status === 'dispatched' ? 'dispatch' : status === 'acknowledged' ? 'claim' : 'blocked',
    text: status === 'dispatched' ? `已被点名派发「${task.title ?? ''}」`
      : status === 'acknowledged' ? `接单「${task.title ?? ''}」，开始执行`
        : `派发受阻：${delivery.error || '未知原因'}`,
    taskId: task.id, source: 'task',
  })
  taskEvent(task, 'delivery', `Delegation ${status}${delivery.error ? `: ${delivery.error}` : ''}`)
  logActivity(org, `任务「${task.title}」委派${status}`, 'delivery')
  return task
}

export function addDecision(state, input = {}) {
  const org = ensureOrganization(state)
  const title = clean(input.title ?? input.question)
  if (!title) throw Object.assign(new Error('Decision title is required'), { code: 'bot/invalid' })
  const decision = {
    id: clean(input.id) || id('decision'),
    title: title.slice(0, 200),
    detail: limit(input.detail, 1000),
    projectId: clean(input.projectId) || null,
    status: 'pending',
    answer: '',
    createdAt: stamp(),
    updatedAt: stamp(),
  }
  org.decisions.push(decision)
  logActivity(org, `待决策：${decision.title}`, 'decision')
  return decision
}

export function resolveDecision(state, input = {}) {
  const org = ensureOrganization(state)
  const key = clean(input.decisionId ?? input.id ?? input.title)
  const decision = org.decisions.find(item => item.id === key || String(item.title ?? '').toLowerCase() === key.toLowerCase())
  if (!decision) throw Object.assign(new Error('Unknown decision'), { code: 'bot/not-found' })
  decision.status = 'resolved'
  decision.answer = limit(input.answer ?? input.note, 1000)
  decision.updatedAt = stamp()
  logActivity(org, `已决策：${decision.title}`, 'decision')
  return decision
}

// One Owner goal → one project → its tasks and assignments. Used by the CEO tool
// so the Owner never has to act as a project manager.
export function planGoal(state, input = {}) {
  const org = ensureOrganization(state)
  const goal = limit(input.goal, 1000)
  const projectName = clean(input.project) || (goal ? goal.split('\n')[0].slice(0, 80) : '')
  if (!projectName) throw Object.assign(new Error('A goal or project name is required'), { code: 'bot/invalid' })
  const existing = org.projects.find(project => project.name === projectName && project.status !== 'done')
  const leadId = clean(input.leadId) || state.mainBotIds?.[0] || null
  const project = upsertProject(state, {
    ...(existing ? { id: existing.id } : {}),
    name: projectName,
    goal: goal || (existing?.goal ?? ''),
    status: 'active',
    leadId,
  })
  const tasks = []
  const rows = Array.isArray(input.tasks) ? input.tasks.slice(0, 24) : []
  for (const row of rows) {
    const item = typeof row === 'string' ? { title: row } : (row ?? {})
    const title = clean(item.title ?? item.task)
    if (!title) continue
    const assigneeId = clean(item.assigneeId) || null
    tasks.push(addTask(state, {
      projectId: project.id,
      title,
      assigneeId,
      label: item.label ?? '',
      status: item.status ?? 'pending',
      progress: item.progress ?? 0,
    }))
    if (assigneeId && leadId) setRelation(state, { from: leadId, to: assigneeId, type: 'delegates_to' })
  }
  logActivity(org, `CEO 拆解目标：${project.name}（${tasks.length} 项任务）`, 'goal')
  return { project, tasks }
}

export function organizationSummary(state) {
  const view = organizationView(state)
  const nameOf = botId => view.employees.find(employee => employee.id === botId)?.name ?? null
  const lines = [
    `Organization: ${view.name} · ${view.stats.employees} employees, ${view.stats.departments} departments, ${view.stats.projects} projects`,
  ]
  for (const project of view.projects) {
    lines.push(`- Project "${project.name}" [${project.id}] ${project.status} ${project.progress}% lead ${nameOf(project.leadId) ?? 'unassigned'}`)
    for (const task of view.tasks.filter(task => task.projectId === project.id)) {
      const delivery = task.assignment?.status ? ` · delivery ${task.assignment.status}${task.assignment.requestId ? ` [${task.assignment.requestId}]` : ''}` : ''
      lines.push(`  - ${task.title} [${task.id}] ${task.status} ${task.progress}% → ${nameOf(task.assigneeId) ?? 'unassigned'}${task.label ? ` (${task.label})` : ''}${delivery}`)
    }
  }
  const loose = view.tasks.filter(task => !task.projectId)
  if (loose.length) lines.push(`- Tasks without a project: ${loose.map(task => `${task.title} [${task.id}]`).join(', ')}`)
  if (view.decisions.length) lines.push(`- Pending decisions: ${view.decisions.map(decision => decision.title).join(', ')}`)
  if (view.departments.length) lines.push(`- Departments: ${view.departments.map(department => `${department.name} [${department.id}]`).join(', ')}`)
  return lines.join('\n')
}
