import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDecision, addDepartment, addTask, assignEmployee, ensureOrganization,
  organizationSummary, organizationView, planGoal, resolveDecision, setRelation,
  setTask, upsertProject,
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
  assert.equal(state.organization.version, 2)
})
