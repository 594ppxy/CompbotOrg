import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

// The organization column, bundled once and rendered with the minimal React
// stand-in the other client tests use: hooks are numbered by expansion order.
const PLUGIN = fileURLToPath(new URL('..', import.meta.url))
const { outputFiles } = await build({
  stdin: { contents: "export { OrganizationNav, DepartmentPanel } from './src/client/organization-shell.js'", resolveDir: PLUGIN },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const slots = []
let idx = 0
let tree = null
const expand = (node) => {
  if (node === null || node === undefined || node === false || node === true) return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node !== 'object') return node
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } }
}
// The React stand-in re-renders whatever is on screen; each harness sets `target`.
let target = () => module.exports.OrganizationNav(props)
const rerender = () => { idx = 0; tree = expand(target()) }
const react = {
  createElement: (type, p, ...children) => ({ type, props: { ...p, children } }),
  Fragment: 'fragment',
  useCallback: fn => fn,
  useEffect() {}, useLayoutEffect() {},
  useMemo: make => make(),
  useState: (init) => {
    const i = idx++
    if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init
    return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; rerender() }]
  },
  useRef: (current) => {
    const i = idx++
    if (!(i in slots)) slots[i] = { current }
    return slots[i]
  },
}
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => (name === 'react' ? react : name === 'react-dom' ? { createPortal: node => node } : {}),
})

function walk(node, found = []) {
  if (node === null || node === undefined || node === false || node === true) return found
  if (Array.isArray(node)) { for (const child of node) walk(child, found); return found }
  if (typeof node !== 'object') return found
  found.push(node)
  walk(node.props?.children, found)
  return found
}

const departments = [{ id: 'd1', name: '技术部' }]
let props = null
let calls = []
let subjects = []
const render = () => {
  calls = []
  subjects = []
  slots.length = 0
  const roster = {
    bots: [{ id: 'ceo', name: 'Chief' }],
    mainBotId: 'ceo',
    byId: { ceo: { id: 'ceo', name: 'Chief' } },
    organization: {
      employees: [{ id: 'ceo', name: 'Chief', main: true, level: 5 }],
      departments, projects: [], tasks: [], edges: [], actions: [], currentActions: {}, stats: {},
    },
  }
  const actions = {
    setOrgSubject: subject => { subjects.push(subject) },
    organizationUpdate: (endpoint, payload) => {
      calls.push([endpoint, payload])
      return Promise.resolve({ departments: [...departments, { id: 'd2', name: payload.name }] })
    },
  }
  props = { useRoster: pick => pick(roster), actions }
  target = () => module.exports.OrganizationNav(props)
  rerender()
}

const find = match => walk(tree).find(match)

test('the department form creates a department through the host channel', async () => {
  render()
  find(node => node.props?.['aria-label'] === '新建部门').props.onClick()
  find(node => node.props?.['aria-label'] === '部门名称').props.onChange({ target: { value: '质量部' } })
  find(node => node.props?.['aria-label'] === '部门职责').props.onChange({ target: { value: '负责测试与发布' } })
  find(node => node.type === 'button' && node.props?.className === 'cb-dept-create').props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'organization-department')
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ name: '质量部', description: '负责测试与发布' }))
  // The new department becomes the inspector's subject, so it opens on screen.
  assert.equal(JSON.stringify(subjects.at(-1)), JSON.stringify({ kind: 'department', id: 'd2' }))
})

test('the form takes a parent department, and a name is required', async () => {
  render()
  find(node => node.props?.['aria-label'] === '新建部门').props.onClick()
  assert.equal(find(node => node.type === 'button' && node.props?.className === 'cb-dept-create').props.disabled, true)
  find(node => node.props?.['aria-label'] === '部门名称').props.onChange({ target: { value: '前端组' } })
  find(node => node.props?.label === '上级部门' && Array.isArray(node.props.options)).props.onChange('d1')
  find(node => node.type === 'button' && node.props?.className === 'cb-dept-create').props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ name: '前端组', parentId: 'd1' }))
})

const flatten = (node, out = []) => {
  if (node === null || node === undefined || node === false || node === true) return out
  if (Array.isArray(node)) { node.forEach(child => flatten(child, out)); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  flatten(node.props?.children, out)
  return out
}
const nodeByText = (root, text) => walk(root).find(node => node.type === 'button' && flatten(node).join('') === text)

const panel = (overrides = {}) => {
  const calls = []
  const actions = {
    setOrgSubject() {},
    organizationUpdate: (endpoint, payload) => { calls.push([endpoint, payload]); return Promise.resolve({}) },
  }
  const panelProps = {
    department: { id: 'd1', name: '质量部', description: '负责测试与发布', parentId: null },
    members: [], parent: undefined, childCount: 0,
    departments: [{ id: 'd1', name: '质量部' }, { id: 'd2', name: '技术部' }],
    employees: [{ id: 'eng', name: 'Engineer', departmentId: null, organizationRole: '工程师' }],
    roster: { mainBotId: 'ceo', byId: {} }, actions, ...overrides,
  }
  slots.length = 0
  target = () => module.exports.DepartmentPanel(panelProps)
  rerender()
  return { calls, get tree() { return tree } }
}

test('a department can be renamed from its own panel', async () => {
  const view = panel()
  nodeByText(view.tree, '编辑').props.onClick()
  findIn(view.tree, node => node.props?.['aria-label'] === '部门名称').props.onChange({ target: { value: '质量保障部' } })
  nodeByText(view.tree, '保存').props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(view.calls[0][0], 'organization-department')
  assert.equal(JSON.stringify(view.calls[0][1]), JSON.stringify({
    action: 'update', departmentId: 'd1', name: '质量保障部', description: '负责测试与发布', parentId: '',
  }))
})

test('deleting a department takes two clicks, and an occupied one cannot be deleted', async () => {
  const empty = panel()
  nodeByText(empty.tree, '删除部门').props.onClick()
  assert.equal(nodeByText(empty.tree, '再次点击确认删除').props.disabled, false)
  nodeByText(empty.tree, '再次点击确认删除').props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(JSON.stringify(empty.calls[0][1]), JSON.stringify({ action: 'remove', departmentId: 'd1' }))

  const full = panel({ members: [{ id: 'eng', name: 'Engineer', departmentId: 'd1' }], childCount: 1 })
  assert.equal(nodeByText(full.tree, '删除部门').props.disabled, true)
  assert.match(flatten(full.tree).join(' '), /先把部门成员移到别处/)
})

function findIn(root, match) { return walk(root).find(match) }
