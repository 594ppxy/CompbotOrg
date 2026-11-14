// The rules behind CompBotOrg placement — 岗位 / 职级 / 部门 / 汇报对象 — kept free
// of React so tests and the host-side helpers can load them directly.
//
// None of it changes DSH permissions: it only shapes the org chart.

export const LEVEL_CHOICES = [[5, '决策层'], [4, '管理层'], [3, '主管'], [2, '骨干'], [1, '执行']]

export const levelText = (level) => {
  const picked = LEVEL_CHOICES.find(([value]) => value === Number(level))
  return picked ? `L${picked[0]} · ${picked[1]}` : '未设定'
}

export const levelOptions = () => LEVEL_CHOICES.map(([value, label]) => ({ value: String(value), label: `L${value} · ${label}` }))

export const orgDepartments = org => Array.isArray(org?.departments) ? org.departments : []

export const departmentOptions = org => orgDepartments(org).map(department => ({ value: department.id, label: department.name }))

// Who a Bot reports to is a pair of edges the host keeps: reports_to plus manages.
export const reportsToOf = (org, botId) => {
  const edge = (org?.edges ?? []).find(item => item.type === 'reports_to' && item.from === botId)
  return edge?.to ?? ''
}

export const peersOf = (roster, botId) => (roster?.bots ?? []).filter(bot => bot.id !== botId)

export const peerOptions = (roster, botId) => peersOf(roster, botId).map(bot => ({ value: bot.id, label: bot.name }))

// Only what was actually answered is sent: an empty field must not wipe a value
// the user never touched.
export function placementOf({ title, level, departmentId, reportsTo } = {}) {
  const placement = {}
  const named = typeof title === 'string' ? title.trim() : ''
  if (named) placement.title = named
  const picked = Number(level)
  if (Number.isInteger(picked) && picked >= 1 && picked <= 5) placement.level = picked
  if (departmentId) placement.departmentId = String(departmentId)
  if (reportsTo) placement.reportsTo = String(reportsTo)
  return placement
}

export function placeBot(actions, botId, fields) {
  const placement = placementOf(fields)
  if (Object.keys(placement).length === 0) return Promise.resolve(null)
  const run = actions?.organizationUpdate
  if (typeof run !== 'function') return Promise.resolve(null)
  return Promise.resolve(run('organization-employee', { botId, ...placement }))
}
