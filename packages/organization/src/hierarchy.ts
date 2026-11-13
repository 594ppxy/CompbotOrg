/**
 * Reporting-line queries over a folded organization state.
 *
 * The hierarchy is derived, never stored: a member knows only its direct
 * manager, and everything else — ancestors, descendants, depth, trees — is
 * computed on demand. That keeps the log small and makes the invariant
 * "one manager per member" impossible to violate structurally.
 *
 * @module @compbotorg/organization/hierarchy
 */

import type { BotId, DepartmentId } from './brand'
import { OrganizationError } from './errors'
import type { AuthorityScope, Permission } from './roles'
import type { BotMembership, OrganizationState, OrganizationStats, OrgTreeNode } from './types'

/**
 * Return the direct reports of one member.
 * @param state - folded organization state.
 * @param managerId - the member whose reports are requested.
 * @returns active and suspended members reporting to `managerId`, in join order.
 */
export function directReports(state: OrganizationState, managerId: BotId): BotMembership[] {
  const reports: BotMembership[] = []
  for (const member of state.members.values()) {
    if (member.reportsTo === managerId && member.status !== 'removed') reports.push(member)
  }
  return reports
}

/**
 * Return the manager of one member.
 * @param state - folded organization state.
 * @param botId - the member whose manager is requested.
 * @returns the manager membership, or undefined at the top of the line.
 */
export function managerOf(state: OrganizationState, botId: BotId): BotMembership | undefined {
  const member = state.members.get(botId)
  if (member?.reportsTo === undefined) return undefined
  return state.members.get(member.reportsTo)
}

/**
 * Walk the reporting line upward from one member.
 * @param state - folded organization state.
 * @param botId - the member to start from.
 * @returns ancestors ordered from immediate manager to the top member.
 */
export function ancestorsOf(state: OrganizationState, botId: BotId): BotMembership[] {
  const chain: BotMembership[] = []
  const seen = new Set<BotId>([botId])
  let current = managerOf(state, botId)
  while (current !== undefined) {
    if (seen.has(current.botId)) break
    seen.add(current.botId)
    chain.push(current)
    current = managerOf(state, current.botId)
  }
  return chain
}

/**
 * Collect every member below one member.
 * @param state - folded organization state.
 * @param botId - the member to start from.
 * @returns descendants in breadth-first order.
 */
export function descendantsOf(state: OrganizationState, botId: BotId): BotMembership[] {
  const collected: BotMembership[] = []
  const seen = new Set<BotId>([botId])
  const queue: BotId[] = [botId]
  while (queue.length > 0) {
    const current = queue.shift() as BotId
    for (const report of directReports(state, current)) {
      if (seen.has(report.botId)) continue
      seen.add(report.botId)
      collected.push(report)
      queue.push(report.botId)
    }
  }
  return collected
}

/**
 * Detect whether assigning `managerId` above `botId` would create a cycle.
 *
 * A cycle appears when the proposed manager is the member itself or one of its
 * own descendants: the line would fold back on itself.
 *
 * @param state - folded organization state.
 * @param botId - the member whose manager is changing.
 * @param managerId - the proposed new manager.
 * @returns whether the assignment is safe.
 */
export function canReportTo(
  state: OrganizationState,
  botId: BotId,
  managerId: BotId | undefined,
): boolean {
  if (managerId === undefined) return true
  if (managerId === botId) return false
  return !descendantsOf(state, botId).some(member => member.botId === managerId)
}

/**
 * Assert that a proposed manager assignment does not create a cycle.
 * @param state - folded organization state.
 * @param botId - the member whose manager is changing.
 * @param managerId - the proposed new manager.
 * @throws OrganizationError with code `MEMBER_REPORTING_CYCLE` when unsafe.
 */
export function assertCanReportTo(
  state: OrganizationState,
  botId: BotId,
  managerId: BotId | undefined,
): void {
  if (canReportTo(state, botId, managerId)) return
  throw new OrganizationError(
    managerId === botId
      ? `bot "${botId}" cannot report to itself`
      : `bot "${botId}" cannot report to its own descendant "${String(managerId)}"`,
    'MEMBER_REPORTING_CYCLE',
  )
}

/**
 * Compute the depth of one member's subtree.
 * @param state - folded organization state.
 * @param botId - subtree root.
 * @returns number of levels below and including the root.
 */
export function subtreeDepth(state: OrganizationState, botId: BotId): number {
  const reports = directReports(state, botId)
  if (reports.length === 0) return 1
  return 1 + Math.max(...reports.map(report => subtreeDepth(state, report.botId)))
}

/**
 * Determine the organization's top members.
 * @param state - folded organization state.
 * @returns members with no manager, in join order.
 */
export function rootsOf(state: OrganizationState): BotMembership[] {
  const roots: BotMembership[] = []
  for (const member of state.members.values()) {
    if (member.status !== 'removed' && member.reportsTo === undefined) roots.push(member)
  }
  return roots
}

/**
 * Build a renderable organization tree.
 * @param state - folded organization state.
 * @returns one node per root, with children nested beneath.
 */
export function buildTree(state: OrganizationState): OrgTreeNode[] {
  const build = (member: BotMembership): OrgTreeNode => {
    const role = state.roles.get(member.roleId)
    const department = state.departments.get(member.departmentId)
    return {
      botId: member.botId,
      displayName: member.displayName,
      roleId: member.roleId,
      roleName: role?.name ?? member.roleId,
      rank: member.rank,
      departmentId: member.departmentId,
      departmentName: department?.name ?? member.departmentId,
      status: member.status,
      children: directReports(state, member.botId).map(build),
    }
  }
  return rootsOf(state).map(build)
}

/**
 * Aggregate counters for a dashboard.
 * @param state - folded organization state.
 * @returns summary counters.
 */
export function statsOf(state: OrganizationState): OrganizationStats {
  const members = [...state.members.values()].filter(member => member.status !== 'removed')
  const roots = rootsOf(state)
  const leafCount = members.filter(member => directReports(state, member.botId).length === 0).length
  const depth = roots.length === 0 ? 0 : Math.max(...roots.map(root => subtreeDepth(state, root.botId)))
  return {
    departmentCount: state.departments.size,
    memberCount: members.length,
    activeMemberCount: members.filter(member => member.status === 'active').length,
    leafCount,
    depth,
  }
}

/**
 * List members of one department.
 * @param state - folded organization state.
 * @param departmentId - department to inspect.
 * @returns members sitting directly in the department.
 */
export function membersOfDepartment(
  state: OrganizationState,
  departmentId: DepartmentId,
): BotMembership[] {
  const members: BotMembership[] = []
  for (const member of state.members.values()) {
    if (member.departmentId === departmentId && member.status !== 'removed') members.push(member)
  }
  return members
}

/**
 * Resolve the effective permission grant of one member.
 *
 * The grant is the role default, plus extra grants, minus explicit denials.
 * This is the single place that answers "what may this member do".
 *
 * @param state - folded organization state.
 * @param botId - the member to inspect.
 * @returns the effective permission set.
 */
export function effectivePermissions(state: OrganizationState, botId: BotId): Set<Permission> {
  const member = state.members.get(botId)
  if (member === undefined || member.status === 'removed') return new Set()
  const role = state.roles.get(member.roleId)
  const granted = new Set<Permission>(role?.permissions ?? [])
  for (const permission of member.extraPermissions) granted.add(permission)
  for (const permission of member.deniedPermissions) granted.delete(permission)
  return granted
}

/**
 * Return whether a member holds one permission.
 * @param state - folded organization state.
 * @param botId - the member to check.
 * @param permission - the permission required.
 * @returns whether the effective grant includes it.
 */
export function hasPermission(
  state: OrganizationState,
  botId: BotId,
  permission: Permission,
): boolean {
  return effectivePermissions(state, botId).has(permission)
}

/**
 * Return the authority scope of one member.
 * @param state - folded organization state.
 * @param botId - the member to inspect.
 * @returns the role's authority scope, or `self` for unknown members.
 */
export function authorityOf(state: OrganizationState, botId: BotId): AuthorityScope {
  const member = state.members.get(botId)
  if (member === undefined) return 'self'
  return state.roles.get(member.roleId)?.authority ?? 'self'
}

/**
 * Return whether `actorId` may manage `targetId`.
 *
 * Management requires three things at once: the actor outranks the target, the
 * actor's authority scope reaches the target, and neither is removed.
 *
 * @param state - folded organization state.
 * @param actorId - the member attempting to manage.
 * @param targetId - the member being managed.
 * @returns whether the manage relation holds.
 */
export function canManage(
  state: OrganizationState,
  actorId: BotId,
  targetId: BotId,
): boolean {
  if (actorId === targetId) return false
  const actor = state.members.get(actorId)
  const target = state.members.get(targetId)
  if (actor === undefined || target === undefined) return false
  if (actor.status !== 'active' || target.status === 'removed') return false
  if (actor.rank >= target.rank) return false
  const scope = authorityOf(state, actorId)
  switch (scope) {
    case 'organization':
      return true
    case 'department':
      return actor.departmentId === target.departmentId
    case 'subtree':
      return descendantsOf(state, actorId).some(member => member.botId === targetId)
    case 'self':
      return false
  }
}

/**
 * Explain why one member cannot manage another.
 *
 * Used by the tool layer to return an actionable rejection instead of a bare
 * denial, so a blocked Bot can escalate to the right manager.
 *
 * @param state - folded organization state.
 * @param actorId - the member attempting to manage.
 * @param targetId - the member being managed.
 * @returns a human-readable reason, or undefined when management is allowed.
 */
export function whyCannotManage(
  state: OrganizationState,
  actorId: BotId,
  targetId: BotId,
): string | undefined {
  if (canManage(state, actorId, targetId)) return undefined
  if (actorId === targetId) return 'a member cannot manage itself'
  const actor = state.members.get(actorId)
  const target = state.members.get(targetId)
  if (actor === undefined) return `actor "${actorId}" is not a member`
  if (target === undefined) return `target "${targetId}" is not a member`
  if (actor.status !== 'active') return `actor "${actorId}" is ${actor.status}`
  if (target.status === 'removed') return `target "${targetId}" has left the organization`
  if (actor.rank >= target.rank) {
    return `rank ${actor.rank} cannot manage rank ${target.rank}; management requires a strictly senior rank`
  }
  const scope = authorityOf(state, actorId)
  switch (scope) {
    case 'department':
      return `actor's department scope does not include target's department`
    case 'subtree':
      return `target is not in the actor's reporting subtree`
    case 'self':
      return `actor's authority is limited to its own work`
    case 'organization':
      return undefined
  }
}
