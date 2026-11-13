/**
 * Durable organization state shapes.
 *
 * Every value here is a snapshot folded from events. Snapshots are immutable;
 * a command produces a new snapshot rather than mutating an existing one, so a
 * projection can be replayed at any point and comparisons stay cheap.
 *
 * @module @compbotorg/organization/types
 */

import type { BotId, DepartmentId, OrganizationId, RoleId } from './brand'
import type { Permission, Role } from './roles'

/** Lifecycle of one member inside the organization. */
export type MemberStatus = 'active' | 'suspended' | 'removed'

/**
 * One Bot's membership in the organization.
 *
 * A Bot exists independently of the organization (it is a PersonaBot owned by
 * the Host). This record is the organization's view of that Bot: which
 * department it sits in, what role it holds, and whom it reports to.
 */
export interface BotMembership {
  /** The Bot this membership describes. */
  readonly botId: BotId
  /** Human-readable name mirrored from the Bot profile for rendering. */
  readonly displayName: string
  /** Department the member currently sits in. */
  readonly departmentId: DepartmentId
  /** Role held by the member. */
  readonly roleId: RoleId
  /** Rank cached from the role at assignment time, for fast manage checks. */
  readonly rank: number
  /** Direct manager, or undefined for the organization's top member. */
  readonly reportsTo?: BotId
  /** Permissions granted to this member beyond the role default. */
  readonly extraPermissions: readonly Permission[]
  /** Permissions withheld from this member despite the role default. */
  readonly deniedPermissions: readonly Permission[]
  /** Current lifecycle state. */
  readonly status: MemberStatus
  /** ISO-8601 timestamp of the join. */
  readonly joinedAt: string
  /** ISO-8601 timestamp of the last membership change. */
  readonly updatedAt: string
}

/** One department inside the organization. */
export interface DepartmentSnapshot {
  readonly id: DepartmentId
  readonly organizationId: OrganizationId
  readonly name: string
  /** Optional one-line purpose shown in the organization graph. */
  readonly description?: string
  /** Parent department for nested structures, absent at the top level. */
  readonly parentDepartmentId?: DepartmentId
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the last change. */
  readonly updatedAt: string
}

/** The organization itself. */
export interface OrganizationSnapshot {
  readonly id: OrganizationId
  readonly name: string
  readonly description?: string
  /** Member holding the top of the reporting line. */
  readonly ceoBotId?: BotId
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the last change. */
  readonly updatedAt: string
}

/** Complete folded organization state. */
export interface OrganizationState {
  readonly organization: OrganizationSnapshot | undefined
  /** Departments keyed by identity. */
  readonly departments: ReadonlyMap<DepartmentId, DepartmentSnapshot>
  /** Memberships keyed by Bot identity. */
  readonly members: ReadonlyMap<BotId, BotMembership>
  /** Roles keyed by identity, including built-ins registered at creation. */
  readonly roles: ReadonlyMap<RoleId, Role>
}

/** One node in a rendered organization tree. */
export interface OrgTreeNode {
  readonly botId: BotId
  readonly displayName: string
  readonly roleId: RoleId
  readonly roleName: string
  readonly rank: number
  readonly departmentId: DepartmentId
  readonly departmentName: string
  readonly status: MemberStatus
  readonly children: readonly OrgTreeNode[]
}

/** Summary counters for dashboards. */
export interface OrganizationStats {
  readonly departmentCount: number
  readonly memberCount: number
  readonly activeMemberCount: number
  /** Number of members with no direct reports. */
  readonly leafCount: number
  /** Deepest level of the reporting line, counting the top member as level 1. */
  readonly depth: number
}
