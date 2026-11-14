import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDecision, addDepartment, addTask, assignEmployee, ensureOrganization,
  organizationSummary, organizationView, planGoal, recordAction, resolveDecision, setRelation,
  setTask, setTaskDelivery, upsertProject,
} from '../src/host/organization.js'

const team = () => ({
  bots: {
    ceo: { id: 'ceo', name: 'CEO', role: 'CEO', createdAt: 1 },
    eng: { id: 'eng', name: 'Engineer', role: 'Engineer', createdAt: 2 },
    design: { id: 'design', name: 'Designer', role: 'Designer', createdAt: 3 },
  },
  mainBotIds: ['ceo'],
})

test('CompBotOrg organization graph bootstraps around the DSH Main Bot', () => {
  const state = team()
  ensureOrganization(state)
  const engineering = addDepartment(state, { name: '技术部' })
  assignEmployee(state, { botId: 'eng', departmentId: engineering.id, role: '工程师', reportsTo: 'ceo' })
  setRelation(state, { from: 'eng', to: 'ceo', type: 'collaborates' })
  const view = organizationView(state)
  assert.equal(view.name, 'CompBotOrg')
  assert.ok(view.edges.some(e => e.from === 'owner' && e.to === 'ceo' && e.type === 'manages'))
  assert.ok(view.edges.some(e => e.from === 'ceo' && e.to === 'eng' && e.type === 'manages'))
  assert.equal(state.bots.eng.departmentId, engineering.id)
  assert.equal(state.bots.eng.organizationRole, '工程师')
})

test('the organization view is read-only, even for the derived Owner→CEO edge', () => {
  const state = team()
  ensureOrganization(state)
  const before = JSON.stringify(state)
  const view = organizationView(state)
  assert.equal(JSON.stringify(state), before)
  assert.equal(state.organization.edges.length, 0)
  assert.equal(view.edges.length, 1)
  assert.equal(view.stats.employees, 3)
})

test('a goal becomes a project, tasks and delegation edges', () => {
  const state = team()
  const { project, tasks } = planGoal(state, {
    goal: '把 AI Organization v1 做出来，这周完成第一版',
    project: 'AI Organization v1',
    tasks: [
      { title: '产品架构设计', assigneeId: 'eng', label: 'Product AI', progress: 100, status: 'done' },
      { title: '组织关系网', assigneeId: 'design', label: 'Backend AI', progress: 60, status: 'running' },
      { title: '测试与发布', assigneeId: 'eng', label: 'QA AI' },
    ],
  })
  assert.equal(project.name, 'AI Organization v1')
  assert.equal(tasks.length, 3)
  const view = organizationView(state)
  assert.equal(view.projects[0].progress, 53)
  assert.equal(view.projects[0].taskCount, 3)
  assert.equal(view.projects[0].doneCount, 1)
  assert.ok(view.edges.some(edge => edge.type === 'delegates_to' && edge.to === 'eng'))
  assert.match(organizationSummary(state), /产品架构设计/)
})

test('the same project name adds tasks instead of making a second project', () => {
  const state = team()
  planGoal(state, { project: '官网重构', tasks: [{ title: '信息架构' }] })
  planGoal(state, { project: '官网重构', tasks: [{ title: '视觉稿' }] })
  const view = organizationView(state)
  assert.equal(view.projects.length, 1)
  assert.equal(view.tasks.length, 2)
})

test('tasks move through pending → running → review → done and keep their report', () => {
  const state = team()
  const project = upsertProject(state, { name: '下一代 Agent 平台' })
  const task = addTask(state, { projectId: project.id, title: 'Skill 系统开发', assigneeId: 'design' })
  assert.equal(task.status, 'pending')
  setTask(state, { taskId: task.id, status: '进行中', progress: 45 })
  setTask(state, { taskId: task.title, status: 'review', report: '初版已提交' })
  assert.equal(state.organization.tasks[0].report, '初版已提交')
  setTask(state, { taskId: task.id, status: 'done', review: '通过' })
  assert.equal(state.organization.tasks[0].status, 'done')
  assert.equal(state.organization.tasks[0].progress, 100)
  assert.equal(state.organization.tasks[0].review, '通过')
  assert.throws(() => setTask(state, { taskId: task.id, status: 'unknown' }), /Unknown task status/)
  assert.throws(() => setTask(state, { taskId: 'nope', status: 'done' }), /Unknown task/)
})

test('tasks require a valid assignee, a legal lifecycle and an auditable delivery receipt', () => {
  const state = team()
  const project = upsertProject(state, { name: '可靠委派' })
  assert.throws(() => addTask(state, { projectId: project.id, title: '不存在的负责人', assigneeId: 'missing' }), /Unknown task assignee/)
  const task = addTask(state, { projectId: project.id, title: '交付方案', assigneeId: 'eng' })
  assert.equal(task.assignment.status, 'ready')
  assert.equal(task.assignment.requestId, `task:${task.id}`)
  setTaskDelivery(state, { taskId: task.id, status: 'dispatched', requestId: task.assignment.requestId })
  setTaskDelivery(state, { taskId: task.id, status: 'acknowledged' })
  assert.equal(task.assignment.status, 'acknowledged')
  assert.equal(task.assignment.attempts, 1)
  assert.throws(() => setTask(state, { taskId: task.id, status: 'done', review: '通过' }), /Invalid task transition/)
  setTask(state, { taskId: task.id, status: 'running' })
  assert.throws(() => setTask(state, { taskId: task.id, status: 'review' }), /needs a report/)
  setTask(state, { taskId: task.id, status: 'review', report: '方案已提交' })
  assert.throws(() => setTask(state, { taskId: task.id, status: 'done' }), /needs a CEO review/)
  setTask(state, { taskId: task.id, status: 'done', review: '通过' })
  assert.equal(task.status, 'done')
  assert.ok(task.history.some(event => event.kind === 'delivery'))
})

test('a duplicated title must be addressed by task id', () => {
  const state = team()
  const project = upsertProject(state, { name: '重复任务' })
  addTask(state, { projectId: project.id, title: '实现' })
  addTask(state, { projectId: project.id, title: '实现' })
  assert.throws(() => setTask(state, { taskId: '实现', status: 'running' }), /ambiguous/)
})

test('blocked work surfaces as a pending decision and closes with an answer', () => {
  const state = team()
  addDecision(state, { title: '是否外采模型', detail: '成本与合规' })
  assert.equal(organizationView(state).decisions.length, 1)
  resolveDecision(state, { title: '是否外采模型', answer: '继续自研' })
  const view = organizationView(state)
  assert.equal(view.decisions.length, 0)
  assert.equal(state.organization.decisions[0].answer, '继续自研')
})

test('an old v1 organization is adopted without losing its graph', () => {
  const state = team()
  state.organization = { version: 1, name: 'Old Org', owner: { id: 'owner', name: '老板', role: 'Owner' }, departments: [{ id: 'd1', name: '研究部' }], edges: [], projects: [] }
  const view = organizationView(state)
  assert.equal(view.name, 'Old Org')
  assert.equal(view.departments[0].memberCount, 0)
  assert.deepEqual(view.tasks, [])
  assert.equal(state.organization.version, 3)
})

test('legacy and dirty rows stay repairable instead of throwing or locking', () => {
  const state = team()
  const project = upsertProject(state, { name: '兼容旧数据' })

  // A whitespace-only assignee must not leave an unassigned task marked "ready".
  const ghost = addTask(state, { projectId: project.id, title: '空白负责人', assigneeId: '   ' })
  assert.equal(ghost.assigneeId, null)
  assert.equal(ghost.assignment.status, 'unassigned')
  assert.equal(ghost.assignment.requestId, null)

  // A status written by an older build is normalised on read, so the task can
  // still move through the legal lifecycle instead of being frozen forever.
  const legacy = addTask(state, { projectId: project.id, title: '旧任务', assigneeId: 'eng' })
  legacy.status = 'in_progress'
  setTask(state, { taskId: legacy.id, status: 'running' })
  assert.equal(legacy.status, 'running')
  legacy.status = 'totally_unknown'
  setTask(state, { taskId: legacy.id, status: 'running' })
  assert.equal(legacy.status, 'running')

  // A row without a title is still addressable by id; a title lookup fails
  // with a friendly error rather than a TypeError.
  const dirty = addTask(state, { projectId: project.id, title: '脏数据', assigneeId: 'eng' })
  delete dirty.title
  setTask(state, { taskId: dirty.id, progress: 55 })
  assert.equal(dirty.progress, 55)
  assert.throws(() => setTask(state, { taskId: '脏数据', status: 'running' }), /Unknown task/)

  // Same guard on decisions.
  addDecision(state, { title: '临时议题' })
  state.organization.decisions.push({ id: 'dirty_decision', status: 'pending' })
  assert.throws(() => resolveDecision(state, { decisionId: '查无此议题', answer: 'x' }), /Unknown decision/)
})

test('a Bot carries a job title and a level, without touching DSH permissions', () => {
  const state = team()
  const engineering = addDepartment(state, { name: '技术部' })
  assignEmployee(state, { botId: 'eng', departmentId: engineering.id, title: '技术负责人', level: 3, reportsTo: 'ceo' })
  const eng = organizationView(state).employees.find(employee => employee.id === 'eng')
  assert.equal(eng.organizationRole, '技术负责人')
  assert.equal(eng.level, 3)
  assert.equal(eng.levelLabel, '主管')
  const ceo = organizationView(state).employees.find(employee => employee.id === 'ceo')
  assert.equal(ceo.level, 5)
  assert.equal(ceo.levelLabel, '决策层')
  assert.throws(() => assignEmployee(state, { botId: 'eng', level: 9 }), /Level must be/)
  assert.equal(state.bots.eng.level, 3)
  assert.equal(state.bots.eng.permissions, undefined)
})

test('task lifecycle records concrete actions and exposes the current one', () => {
  const state = team()
  const project = upsertProject(state, { name: '组织关系网' })
  const task = addTask(state, { projectId: project.id, title: '补齐汇报关系', assigneeId: 'eng' })
  setTaskDelivery(state, { taskId: task.id, status: 'dispatched', requestId: task.assignment.requestId })
  setTaskDelivery(state, { taskId: task.id, status: 'acknowledged' })
  setTask(state, { taskId: task.id, status: 'running' })
  setTask(state, { taskId: task.id, status: 'review', report: '关系网补齐 6 个节点，自测 8/8 通过' })
  const view = organizationView(state)
  const own = view.actions.filter(action => action.botId === 'eng')
  assert.deepEqual(own.map(action => action.kind), ['dispatch', 'claim', 'running', 'review'])
  assert.match(own.at(-1).text, /自测 8\/8 通过/)
  assert.equal(own.at(-1).taskId, task.id)
  assert.ok(task.history.some(entry => entry.kind === 'action'))
  assert.match(view.currentActions.eng.text, /自测 8\/8 通过/)
  assert.equal(view.currentActions.eng.status, 'review')
  assert.equal(view.currentActions.eng.taskId, task.id)
})

test('an action can be recorded from DSH and follows the running task', () => {
  const state = team()
  const project = upsertProject(state, { name: '接口联调' })
  const task = addTask(state, { projectId: project.id, title: '补齐 /org 字段', assigneeId: 'eng' })
  setTask(state, { taskId: task.id, status: 'running' })
  const before = JSON.stringify(state)
  const action = recordAction(state, {
    botId: 'eng', kind: 'str_replace_editor', source: 'dsh',
    text: 'str_replace_editor · 改动 src/host/organization.js 的汇报关系字段',
  })
  assert.equal(action.taskId, task.id)
  assert.ok(task.history.some(entry => entry.kind === 'action' && /改动/.test(entry.text)))
  assert.equal(organizationView(state).currentActions.eng.text, action.text)
  assert.notEqual(JSON.stringify(state), before)
})
