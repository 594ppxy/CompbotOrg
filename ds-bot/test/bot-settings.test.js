import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/bot-settings.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {}, useLayoutEffect() {}, useMemo: make => make(), useCallback: fn => fn,
  useRef: current => ({ current }), useId: () => 'id', Fragment: Symbol('Fragment'),
}
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => (name === 'react' ? react : name === 'react-dom' ? { createPortal: node => node } : {}),
})
const { BotSettingsForm } = module.exports

function walk(node, found = []) {
  if (Array.isArray(node)) { for (const child of node) walk(child, found); return found }
  if (node === null || node === undefined || typeof node !== 'object') return found
  found.push(node)
  walk(node.props?.children, found)
  return found
}
function settings(bot, { main = false, rooms = [] } = {}) {
  const roster = { mainBotIds: main ? [bot.id] : [], mainBotId: main ? bot.id : null, rooms, models: [], memory: false }
  return walk(BotSettingsForm({ bot, roster, actions: {}, run: fn => fn }))
}
const bot = { id: 'b', name: 'Writer', role: 'Writer', instructions: '', capabilities: [] }

test('the Private switch is enabled only for a state the host accepts', () => {
  const noFolder = settings(bot).find(node => node.props?.label === 'Private')
  assert.equal(noFolder.props.disabled, true)
  assert.equal(noFolder.props.hint, 'Choose a working folder of its own first.')

  const grouped = settings({ ...bot, workDir: '/work' }, { rooms: [{ id: 'r', members: ['b'] }] }).find(node => node.props?.label === 'Private')
  assert.equal(grouped.props.disabled, true)
  assert.equal(grouped.props.hint, 'Leave its group chats before making it private.')

  const main = settings({ ...bot, workDir: '/work' }, { main: true }).find(node => node.props?.label === 'Private')
  assert.equal(main.props.disabled, true)
  assert.equal(main.props.hint, 'A Main Bot cannot be private.')

  const allowed = settings({ ...bot, workDir: '/work' }).find(node => node.props?.label === 'Private')
  assert.equal(allowed.props.disabled, false)
  assert.equal(allowed.props.on, false)
})

test('a private Bot can always turn privacy off, and cannot become Main or be duplicated', () => {
  const tree = settings({ ...bot, workDir: '/work', private: true })
  const privacy = tree.find(node => node.props?.label === 'Private')
  assert.equal(privacy.props.on, true)
  assert.equal(privacy.props.disabled, false)
  assert.equal(tree.find(node => node.props?.label === 'Main Bot').props.disabled, true)
  assert.equal(tree.some(node => node.props?.onClick && node.props.className === 'bt-set-row bt-bs-row' && JSON.stringify(node).includes('Duplicate')), false)
})

test('the organization job level is edited through the host channel', () => {
  const calls = []
  const roster = {
    mainBotIds: [], mainBotId: null, rooms: [], models: [], memory: false,
    organization: { employees: [{ id: 'b', level: 3 }] },
  }
  const actions = {
    organizationUpdate: (endpoint, payload) => { calls.push([endpoint, payload]); return Promise.resolve({}) },
  }
  const nodes = walk(BotSettingsForm({ bot, roster, actions, run: fn => fn }))
  assert.ok(nodes.some(node => node.props?.label === '职级'))
  // The select is built by OrgSelect, so the row is asserted through its props.
  const select = nodes.find(node => node.props?.label === '职级' && Array.isArray(node.props.options))
  assert.equal(select.props.value, '3')
  assert.equal(JSON.stringify(select.props.options.map(option => option.value)), JSON.stringify(['5', '4', '3', '2', '1']))
  select.props.onChange('4')
  assert.equal(calls[0][0], 'organization-employee')
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ botId: 'b', level: 4 }))
})

test('岗位, 部门 and 汇报对象 save through the same host call', () => {
  const calls = []
  const roster = {
    mainBotIds: [], mainBotId: null, rooms: [], models: [], memory: false,
    bots: [{ id: 'b', name: 'Writer' }, { id: 'lead', name: 'Tech Lead' }],
    organization: {
      employees: [{ id: 'b', level: 3, organizationRole: '写手', departmentId: 'd1' }],
      departments: [{ id: 'd1', name: '技术部' }, { id: 'd2', name: '产品部' }],
      edges: [{ id: 'e1', from: 'b', to: 'lead', type: 'reports_to' }],
    },
  }
  const actions = {
    organizationUpdate: (endpoint, payload) => { calls.push([endpoint, payload]); return Promise.resolve({}) },
  }
  const nodes = walk(BotSettingsForm({ bot, roster, actions, run: fn => fn }))
  const title = nodes.find(node => node.props?.label === '岗位' && 'value' in node.props)
  assert.equal(title.props.value, '写手')

  const department = nodes.find(node => node.props?.label === '部门' && Array.isArray(node.props.options))
  assert.equal(department.props.value, 'd1')
  department.props.onChange('d2')

  const reportsTo = nodes.find(node => node.props?.label === '汇报对象' && Array.isArray(node.props.options))
  assert.equal(reportsTo.props.value, 'lead')
  reportsTo.props.onChange('')

  // The Bot itself is never offered as its own lead.
  assert.deepEqual(reportsTo.props.options.map(option => option.value), ['lead'])

  assert.equal(JSON.stringify(calls[0]), JSON.stringify(['organization-employee', { botId: 'b', departmentId: 'd2' }]))
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(['organization-employee', { botId: 'b', reportsTo: '' }]))
})