import test from 'node:test'
import assert from 'node:assert/strict'
import { addDepartment, assignEmployee, ensureOrganization, organizationView, setRelation } from './organization.js'

test('CompBotOrg organization graph bootstraps around the DSH Main Bot', () => {
  const state = { bots: { ceo: { id: 'ceo', name: 'CEO', role: 'CEO' }, eng: { id: 'eng', name: 'Engineer', role: 'Engineer' } }, mainBotIds: ['ceo'] }
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
