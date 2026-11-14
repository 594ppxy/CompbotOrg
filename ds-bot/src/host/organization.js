// CompBotOrg organization layer: a lightweight graph over DS Bot's existing roster.
// DSH remains the runtime; this module only adds company structure and coordination metadata.
import { randomUUID } from 'node:crypto'

export const RELATION_TYPES = new Set([
  'manages', 'reports_to', 'member_of', 'collaborates', 'advisor_of', 'project_lead', 'delegates_to',
])

const clean = value => typeof value === 'string' ? value.trim() : ''
const id = prefix => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`

export function ensureOrganization(state) {
  if (!state.organization || typeof state.organization !== 'object' || Array.isArray(state.organization)) {
    state.organization = { version: 1, name: 'CompBotOrg', owner: { id: 'owner', name: '老板', role: 'Owner' }, departments: [], edges: [], projects: [] }
  }
  const org = state.organization
  if (!Array.isArray(org.departments)) org.departments = []
  if (!Array.isArray(org.edges)) org.edges = []
  if (!Array.isArray(org.projects)) org.projects = []
  if (!org.owner || typeof org.owner !== 'object') org.owner = { id: 'owner', name: '老板', role: 'Owner' }
  return org
}

export function organizationView(state) {
  const org = ensureOrganization(state)
  const ceo = state.mainBotIds?.[0]
  if (ceo && !org.edges.some(e => e.from === 'owner' && e.to === ceo && e.type === 'manages')) org.edges.push({ id: id('edge'), from: 'owner', to: ceo, type: 'manages' })
  return {
    ...org,
    departments: org.departments.map(d => ({ ...d })),
    edges: org.edges.map(e => ({ ...e })),
    projects: org.projects.map(p => ({ ...p })),
    employees: Object.values(state.bots ?? {}).map(bot => ({
      id: bot.id, name: bot.name, role: bot.role ?? '', main: state.mainBotIds?.includes(bot.id) === true,
      sectionId: bot.sectionId ?? null, model: bot.model ?? bot.appliedModel ?? null,
    })),
  }
}

export function addDepartment(state, input = {}) {
  const org = ensureOrganization(state)
  const name = clean(input.name)
  if (!name) throw Object.assign(new Error('Department name is required'), { code: 'bot/invalid' })
  const department = { id: clean(input.id) || id('dept'), name: name.slice(0, 80), description: clean(input.description).slice(0, 500), parentId: clean(input.parentId) || null }
  if (org.departments.some(d => d.id === department.id)) throw Object.assign(new Error('Department already exists'), { code: 'bot/invalid' })
  org.departments.push(department)
  return department
}

export function setRelation(state, input = {}) {
  const org = ensureOrganization(state)
  const from = clean(input.from)
  const to = clean(input.to)
  const type = clean(input.type)
  if (!from || !to || from === to || !RELATION_TYPES.has(type)) throw Object.assign(new Error('Invalid organization relation'), { code: 'bot/invalid' })
  if (org.edges.some(e => e.from === from && e.to === to && e.type === type)) return org.edges.find(e => e.from === from && e.to === to && e.type === type)
  const edge = { id: clean(input.id) || id('edge'), from, to, type }
  org.edges.push(edge)
  return edge
}

export function removeRelation(state, edgeId) {
  const org = ensureOrganization(state)
  const before = org.edges.length
  org.edges = org.edges.filter(e => e.id !== edgeId)
  return before !== org.edges.length
}

export function upsertProject(state, input = {}) {
  const org = ensureOrganization(state)
  const name = clean(input.name)
  if (!name) throw Object.assign(new Error('Project name is required'), { code: 'bot/invalid' })
  const project = { id: clean(input.id) || id('project'), name: name.slice(0, 120), status: clean(input.status) || 'active', leadId: clean(input.leadId) || null, goal: clean(input.goal).slice(0, 1000) }
  const index = org.projects.findIndex(p => p.id === project.id)
  if (index >= 0) org.projects[index] = { ...org.projects[index], ...project }
  else org.projects.push(project)
  return project
}


export function assignEmployee(state, input = {}) {
  const org = ensureOrganization(state)
  const botId = clean(input.botId)
  const bot = state.bots?.[botId]
  if (!bot) throw Object.assign(new Error('Unknown Bot'), { code: 'bot/not-found' })
  const departmentId = clean(input.departmentId)
  if (departmentId && !org.departments.some(d => d.id === departmentId)) throw Object.assign(new Error('Unknown department'), { code: 'bot/not-found' })
  if (departmentId) bot.departmentId = departmentId
  else delete bot.departmentId
  if (input.role !== undefined) bot.organizationRole = clean(input.role).slice(0, 80)
  if (input.reportsTo !== undefined) {
    org.edges = org.edges.filter(e => !(e.from === botId && e.type === 'reports_to'))
    const reportsTo = clean(input.reportsTo)
    if (reportsTo) setRelation(state, { from: reportsTo, to: botId, type: 'manages' }), setRelation(state, { from: botId, to: reportsTo, type: 'reports_to' })
  }
  return bot
}
