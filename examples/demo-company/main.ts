/**
 * Demo: build one AI company and print its organization.
 *
 * Run with `pnpm demo` from the repository root. The demo exercises the whole
 * v0.1 surface: organization creation, departments, members, promotion,
 * reporting-line changes, permission checks, and tree rendering.
 *
 * @module compbotorg/examples/demo-company
 */

import {
  BotId,
  OrganizationService,
  RoleId,
  type BotMembership,
  type OrgTreeNode,
} from '@compbotorg/organization'

const CEO = BotId('bot-ada')
const CTO = BotId('bot-linus')
const COO = BotId('bot-grace')
const ENG_DIR = BotId('bot-margaret')
const AI_DIR = BotId('bot-demis')
const MKT_DIR = BotId('bot-sheryl')
const BACKEND_ENG = BotId('bot-ken')
const FRONTEND_ENG = BotId('bot-barbara')
const RESEARCHER = BotId('bot-alan')
const MODEL_ENG = BotId('bot-yann')
const GROWTH = BotId('bot-brian')

const org = new OrganizationService()

console.log('='.repeat(72))
console.log('CompbotOrg — v0.1 Organization Core demo')
console.log('='.repeat(72))

// 1. Create the organization.
org.createOrganization({
  name: 'Acme AI',
  description: 'An AI-native product company: research, build, and ship.',
})
console.log(`\n[1] Organization created: ${org.organization?.name} (${org.organization?.id})`)
console.log(`    Built-in roles: ${org.listRoles().map(role => `${role.name}@L${role.rank}`).join(', ')}`)

// 2. Carve out departments.
const executive = org.createDepartment({ name: 'Executive', description: 'Sets direction and answers to the user.' })
const engineering = org.createDepartment({ name: 'Engineering', description: 'Builds and ships the product.' })
const research = org.createDepartment({ name: 'Research', description: 'Finds what is true and what is next.' })
const marketing = org.createDepartment({ name: 'Marketing', description: 'Tells the story.' })
const aiLab = org.createDepartment({
  name: 'AI Lab',
  description: 'Trains and evaluates models.',
  parentDepartmentId: research.id,
})
console.log(`\n[2] Departments: ${org.listDepartments().map(dept => dept.name).join(' / ')}`)

// 3. Hire the leadership team.
org.addMember({ botId: CEO, displayName: 'Ada', departmentId: executive.id, roleId: RoleId('ceo') })
org.addMember(
  { botId: CTO, displayName: 'Linus', departmentId: engineering.id, roleId: RoleId('cto'), reportsTo: CEO },
  { actorId: CEO },
)
org.addMember(
  { botId: COO, displayName: 'Grace', departmentId: executive.id, roleId: RoleId('coo'), reportsTo: CEO },
  { actorId: CEO },
)
console.log(`\n[3] Leadership: Ada (CEO) → Linus (CTO) + Grace (COO)`)

// 4. Directors own departments.
org.addMember(
  { botId: ENG_DIR, displayName: 'Margaret', departmentId: engineering.id, roleId: RoleId('director'), reportsTo: CTO },
  { actorId: CTO },
)
org.addMember(
  { botId: AI_DIR, displayName: 'Demis', departmentId: aiLab.id, roleId: RoleId('director'), reportsTo: CTO },
  { actorId: CTO },
)
org.addMember(
  { botId: MKT_DIR, displayName: 'Sheryl', departmentId: marketing.id, roleId: RoleId('director'), reportsTo: COO },
  { actorId: COO },
)
console.log(`[4] Directors: Margaret (Engineering), Demis (AI Lab), Sheryl (Marketing)`)

// 5. Hire individual contributors.
org.addMember(
  { botId: BACKEND_ENG, displayName: 'Ken', departmentId: engineering.id, roleId: RoleId('engineer'), reportsTo: ENG_DIR },
  { actorId: ENG_DIR },
)
org.addMember(
  { botId: FRONTEND_ENG, displayName: 'Barbara', departmentId: engineering.id, roleId: RoleId('engineer'), reportsTo: ENG_DIR },
  { actorId: ENG_DIR },
)
org.addMember(
  { botId: RESEARCHER, displayName: 'Alan', departmentId: research.id, roleId: RoleId('researcher'), reportsTo: AI_DIR },
  { actorId: AI_DIR },
)
org.addMember(
  { botId: MODEL_ENG, displayName: 'Yann', departmentId: aiLab.id, roleId: RoleId('engineer'), reportsTo: AI_DIR },
  { actorId: AI_DIR },
)
org.addMember(
  { botId: GROWTH, displayName: 'Brian', departmentId: marketing.id, roleId: RoleId('analyst'), reportsTo: MKT_DIR },
  { actorId: MKT_DIR },
)
console.log(`[5] Contributors hired: Ken, Barbara, Alan, Yann, Brian`)

// 6. Render the tree.
function render(node: OrgTreeNode, prefix = '', isLast = true, isRoot = true): string[] {
  const connector = isRoot ? '' : isLast ? '└─ ' : '├─ '
  const line = `${prefix}${connector}${node.displayName} — ${node.roleName} @ ${node.departmentName}`
  const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
  const lines = [line]
  node.children.forEach((child, index) => {
    lines.push(...render(child, childPrefix, index === node.children.length - 1, false))
  })
  return lines
}

console.log(`\n[6] Organization tree`)
console.log('─'.repeat(72))
for (const root of org.getTree()) {
  for (const line of render(root)) console.log(line)
}

// 7. Stats.
const stats = org.getStats()
console.log(`\n[7] Stats`)
console.log('─'.repeat(72))
console.log(`    departments : ${stats.departmentCount}`)
console.log(`    members     : ${stats.memberCount} (active ${stats.activeMemberCount})`)
console.log(`    depth       : ${stats.depth} levels`)
console.log(`    leaf bots   : ${stats.leafCount}`)

// 8. Reporting-line queries.
console.log(`\n[8] Reporting line for Alan (Researcher)`)
console.log('─'.repeat(72))
const chain = org.getAncestors(RESEARCHER)
console.log(`    ${chain.map(member => `${member.displayName}(${member.roleId})`).join(' → ')}`)

// 9. Authority checks.
console.log(`\n[9] Authority checks`)
console.log('─'.repeat(72))
const checks: Array<[string, BotMembership, BotMembership]> = [
  ['CEO → Researcher (org-wide scope)', org.getMember(CEO)!, org.getMember(RESEARCHER)!],
  ['CTO → Backend Engineer (org-wide scope)', org.getMember(CTO)!, org.getMember(BACKEND_ENG)!],
  ['AI Lab Director → Researcher (own subtree)', org.getMember(AI_DIR)!, org.getMember(RESEARCHER)!],
  ['Engineering Director → Researcher (other subtree)', org.getMember(ENG_DIR)!, org.getMember(RESEARCHER)!],
  ['Researcher → Backend Engineer (same rank)', org.getMember(RESEARCHER)!, org.getMember(BACKEND_ENG)!],
]
for (const [label, actor, target] of checks) {
  const allowed = org.canManage(actor.botId, target.botId)
  const reason = org.whyCannotManage(actor.botId, target.botId)
  console.log(`    ${allowed ? '✓' : '✗'} ${label}${allowed ? '' : `\n        ↳ ${reason}`}`)
}

// 10. Permission checks.
console.log(`\n[10] Permission checks`)
console.log('─'.repeat(72))
for (const permission of ['org.delete', 'dept.create', 'task.assign', 'report.approve', 'artifact.write'] as const) {
  const holders = org
    .listMembers()
    .filter(member => org.can(member.botId, permission))
    .map(member => member.displayName)
  console.log(`    ${permission.padEnd(18)} → ${holders.join(', ')}`)
}

// 11. A promotion.
console.log(`\n[11] Promote Alan from Researcher to Manager`)
console.log('─'.repeat(72))
const before = org.getMember(RESEARCHER)!
const permissionsBefore = org.permissionsOf(RESEARCHER).size
org.promoteMember(RESEARCHER, RoleId('manager'), { actorId: AI_DIR })
const after = org.getMember(RESEARCHER)!
const permissionsAfter = org.permissionsOf(RESEARCHER).size
console.log(`    rank ${before.rank} (${before.roleId}) → ${after.rank} (${after.roleId})`)
console.log(`    permissions ${permissionsBefore} → ${permissionsAfter}`)
console.log(`    Alan may now approve reports: ${org.can(RESEARCHER, 'report.approve')}`)

// 12. A department transfer.
console.log(`\n[12] Transfer Barbara from Engineering to AI Lab`)
console.log('─'.repeat(72))
org.transferMember(FRONTEND_ENG, aiLab.id, { actorId: CTO })
console.log(`    Barbara now sits in ${org.getDepartment(org.getMember(FRONTEND_ENG)!.departmentId)?.name}`)

// 13. A guard rail: cycle rejection.
console.log(`\n[13] Guard rail — try to make the CEO report to a contributor`)
console.log('─'.repeat(72))
try {
  org.setReportsTo(CEO, BACKEND_ENG, { actorId: CEO })
} catch (error) {
  console.log(`    rejected: ${(error as Error).message}`)
}

// 14. A guard rail: unauthorized command.
console.log(`\n[14] Guard rail — a contributor tries to delete the organization`)
console.log('─'.repeat(72))
try {
  org.updateOrganization({ name: 'Hijacked' }, { actorId: BACKEND_ENG })
} catch (error) {
  console.log(`    rejected: ${(error as Error).message}`)
}

// 15. Event log.
console.log(`\n[15] Event log`)
console.log('─'.repeat(72))
console.log(`    ${org.events().length} durable events recorded`)
const counts = new Map<string, number>()
for (const entry of org.events()) {
  counts.set(entry.event.type, (counts.get(entry.event.type) ?? 0) + 1)
}
for (const [type, count] of [...counts.entries()].sort()) {
  console.log(`    ${type.padEnd(28)} ${count}`)
}

console.log(`\n${'='.repeat(72)}`)
console.log('Demo complete. The same log replays into an identical organization.')
console.log('='.repeat(72))
