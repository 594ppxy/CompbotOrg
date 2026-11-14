import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureOrganization, organizationView, planGoal } from '../src/host/organization.js'
import { install } from '../src/host/organization-activity.js'

const team = () => ({
  bots: {
    ceo: { id: 'ceo', name: 'Chief', role: 'CEO', createdAt: 1 },
    eng: { id: 'eng', name: 'Engineer', role: 'Engineer', createdAt: 2 },
    qa: { id: 'qa', name: 'QA', role: 'QA', createdAt: 3 },
  },
  mainBotIds: ['ceo'],
})

function bench() {
  const state = team()
  ensureOrganization(state)
  const listeners = []
  let saved = 0
  const sessions = { 's-ceo': 'ceo', 's-eng': 'eng', 's-room': 'ceo' }
  const rt = {
    state,
    ctx: { on: (name, fn) => { assert.equal(name, 'session/event'); listeners.push(fn) } },
    isBotSession: id => Object.hasOwn(sessions, id),
    selfOf: id => sessions[id],
    groupOwners: new Map([['s-room', { botId: 'ceo', roomId: 'r1' }]]),
    findBot: name => Object.values(state.bots).find(bot => bot.name === name),
    save: async () => { saved += 1 },
  }
  install(rt)
  const fire = (sessionId, event) => listeners.forEach(fn => fn({ id: sessionId }, event))
  const call = (sessionId, name, args) => fire(sessionId, {
    type: 'tool/call', data: { name, arguments: JSON.stringify(args ?? {}) },
  })
  return { state, fire, call, saves: () => saved }
}

test('the feed mirrors the tools a Bot really runs, and skips lookups', () => {
  const { state, call } = bench()
  call('s-eng', 'str_replace_editor', { path: 'src/host/organization.js', command: 'edit' })
  call('s-eng', 'organization_view', {})
  call('s-eng', 'list_bots', {})
  const own = organizationView(state).actions.filter(action => action.botId === 'eng')
  assert.equal(own.length, 1)
  assert.equal(own[0].kind, 'str_replace_editor')
  assert.match(own[0].text, /src\/host\/organization\.js/)
  assert.equal(own[0].source, 'dsh')
})

test('posting to a group with @Name dispatches to those members', () => {
  const { state, call } = bench()
  planGoal(state, {
    goal: '这周把接口联调收掉',
    project: '接口联调',
    tasks: [
      { title: '补齐 /org 字段', assigneeId: 'eng' },
      { title: '联调回归清单', assigneeId: 'qa' },
    ],
  })
  call('s-ceo', 'post_to_group', {
    group: '交付群',
    message: '@Engineer 今天把 /org 的汇报字段补齐 @QA 出一份联调回归清单',
  })
  const actions = organizationView(state).actions
  const calls = actions.filter(action => action.kind === 'call')
  assert.deepEqual(calls.map(action => action.botId).sort(), ['eng', 'qa'])
  for (const item of calls) {
    assert.match(item.text, /群里 @ 你/)
    assert.match(item.text, /\/org|回归清单/)
    assert.equal(item.source, 'group')
    assert.ok(item.taskId, 'the call is tied to that member\'s task')
  }
  assert.equal(actions.find(action => action.kind === 'post_to_group').botId, 'ceo')
})

test('message_bot with a request id lands on the exact task', () => {
  const { state, call } = bench()
  const { tasks } = planGoal(state, {
    goal: '交付 v1', project: 'v1', tasks: [{ title: '写接口', assigneeId: 'eng' }],
  })
  const task = tasks[0]
  call('s-ceo', 'message_bot', {
    to: 'Engineer', message: '把接口写完', request_id: task.assignment.requestId,
  })
  const dispatch = organizationView(state).actions.find(action => action.kind === 'message_bot')
  assert.equal(dispatch.taskId, task.id)
  assert.match(dispatch.text, /Engineer/)
})

test('a group reply that @ mentions another Bot hands the work on', () => {
  const { state, fire } = bench()
  fire('s-room', { type: 'assistant/message', data: { text: '@Engineer 麻烦接一下这块的回归' } })
  const calls = organizationView(state).actions.filter(action => action.kind === 'call')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].botId, 'eng')
  assert.match(calls[0].text, /回归/)
})

test('state is saved once for a burst of actions, not once per call', async () => {
  const { state, call, saves } = bench()
  call('s-eng', 'bash', { command: 'npm test' })
  call('s-eng', 'bash', { command: 'npm run lint' })
  call('s-eng', 'web_search', { query: 'dsh tool events' })
  await new Promise(resolve => setTimeout(resolve, 420))
  assert.equal(organizationView(state).actions.length, 3)
  assert.equal(saves(), 1)
})
