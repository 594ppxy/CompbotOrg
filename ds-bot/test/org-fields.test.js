import assert from 'node:assert/strict'
import { test } from 'node:test'
import { levelText, orgDepartments, peerOptions, placementOf, reportsToOf } from '../src/client/org-model.js'

test('placement keeps only the answers the user gave', () => {
  assert.equal(JSON.stringify(placementOf({})), '{}')
  assert.equal(JSON.stringify(placementOf({ title: '   ', level: '', departmentId: '', reportsTo: '' })), '{}')
  assert.equal(JSON.stringify(placementOf({ title: ' 技术负责人 ', level: '4', departmentId: 'd1', reportsTo: 'ceo' })),
    JSON.stringify({ title: '技术负责人', level: 4, departmentId: 'd1', reportsTo: 'ceo' }))
  // A level outside 1..5 is not an answer the host accepts.
  assert.equal(JSON.stringify(placementOf({ level: 9 })), '{}')
})

test('the org view answers who a Bot reports to and which departments exist', () => {
  const org = {
    departments: [{ id: 'd1', name: '技术部' }],
    edges: [{ id: 'e1', from: 'eng', to: 'ceo', type: 'reports_to' }, { id: 'e2', from: 'eng', to: 'qa', type: 'collaborates' }],
  }
  assert.equal(reportsToOf(org, 'eng'), 'ceo')
  assert.equal(reportsToOf(org, 'qa'), '')
  assert.deepEqual(orgDepartments(org).map(item => item.name), ['技术部'])
  assert.equal(JSON.stringify(orgDepartments(null)), '[]')
  assert.equal(levelText(5), 'L5 · 决策层')
  assert.equal(levelText(0), '未设定')
  // A Bot is never offered as its own lead.
  assert.deepEqual(peerOptions({ bots: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, 'a').map(item => item.value), ['b'])
})
