/**
 * Durable organization events.
 *
 * The event log is the source of truth. Every command validates against the
 * current projection, then appends exactly one event. Replaying the log in
 * order reproduces the projection, which is what makes an organization
 * auditable and restorable.
 *
 * @module @compbotorg/organization/events
 */

import type { BotId, DepartmentId, OrganizationId, RoleId } from './brand'
import type { Permission, Role } from './roles'

/** Event appended when an organization is created. */
export interface OrganizationCreatedEvent {
  readonly type: 'organization/created'
  readonly organizationId: OrganizationId
  readonly name: string
  readonly description?: string
  /** Roles registered alongside the organization, including built-ins. */
  readonly roles: readonly Role[]
  readonly occurredAt: string
}

/** Event appended when organization-level metadata changes. */
export interface OrganizationUpdatedEvent {
  readonly type: 'organization/updated'
  readonly organizationId: OrganizationId
  readonly name?: string
  readonly description?: string
  readonly occurredAt: string
}

/** Event appended when a department is created. */
export interface DepartmentCreatedEvent {
  readonly type: 'department/created'
  readonly organizationId: OrganizationId
  readonly departmentId: DepartmentId
  readonly name: string
  readonly description?: string
  readonly parentDepartmentId?: DepartmentId
  readonly occurredAt: string
}

/** Event appended when department metadata changes. */
export interface DepartmentUpdatedEvent {
  readonly type: 'department/updated'
  readonly organizationId: OrganizationId
  readonly departmentId: DepartmentId
  readonly name?: string
  readonly description?: string
  readonly occurredAt: string
}

/** Event appended when a department is removed from the tree. */
export interface DepartmentRemovedEvent {
  readonly type: 'department/removed'
  readonly organizationId: OrganizationId
  readonly departmentId: DepartmentId
  readonly occurredAt: string
}

/** Event appended when a Bot joins the organization. */
export interface MemberJoinedEvent {
  readonly type: 'member/joined'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly displayName: string
  readonly departmentId: DepartmentId
  readonly roleId: RoleId
  readonly rank: number
  readonly reportsTo?: BotId
  readonly occurredAt: string
}

/** Event appended when a member changes department. */
export interface MemberTransferredEvent {
  readonly type: 'member/transferred'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly fromDepartmentId: DepartmentId
  readonly toDepartmentId: DepartmentId
  readonly occurredAt: string
}

/** Event appended when a member changes role, optionally changing rank. */
export interface MemberPromotedEvent {
  readonly type: 'member/promoted'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly fromRoleId: RoleId
  readonly toRoleId: RoleId
  readonly fromRank: number
  readonly toRank: number
  readonly occurredAt: string
}

/** Event appended when a member's direct manager changes. */
export interface MemberReportsToChangedEvent {
  readonly type: 'member/reports-to-changed'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly fromReportsTo?: BotId
  readonly toReportsTo?: BotId
  readonly occurredAt: string
}

/** Event appended when a member's status changes. */
export interface MemberStatusChangedEvent {
  readonly type: 'member/status-changed'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly from: 'active' | 'suspended'
  readonly to: 'active' | 'suspended'
  readonly occurredAt: string
}

/** Event appended when a member leaves the organization. */
export interface MemberLeftEvent {
  readonly type: 'member/left'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly occurredAt: string
}

/** Event appended when the top member of the organization is designated. */
export interface CeoDesignatedEvent {
  readonly type: 'organization/ceo-designated'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly occurredAt: string
}

/** Event appended when a member's permission grant is adjusted. */
export interface MemberPermissionsChangedEvent {
  readonly type: 'member/permissions-changed'
  readonly organizationId: OrganizationId
  readonly botId: BotId
  readonly extraPermissions: readonly Permission[]
  readonly deniedPermissions: readonly Permission[]
  readonly occurredAt: string
}

/** Event appended when a new role is registered. */
export interface RoleRegisteredEvent {
  readonly type: 'role/registered'
  readonly organizationId: OrganizationId
  readonly role: Role
  readonly occurredAt: string
}

/** Every durable organization event. */
export type OrganizationEvent =
  | OrganizationCreatedEvent
  | OrganizationUpdatedEvent
  | DepartmentCreatedEvent
  | DepartmentUpdatedEvent
  | DepartmentRemovedEvent
  | MemberJoinedEvent
  | MemberTransferredEvent
  | MemberPromotedEvent
  | MemberReportsToChangedEvent
  | MemberStatusChangedEvent
  | MemberLeftEvent
  | CeoDesignatedEvent
  | MemberPermissionsChangedEvent
  | RoleRegisteredEvent

/** Discriminant of {@link OrganizationEvent}. */
export type OrganizationEventType = OrganizationEvent['type']

/** One entry in the durable log: an event plus its position. */
export interface LoggedEvent {
  /** Monotonic position, starting at 1. */
  readonly seq: number
  readonly event: OrganizationEvent
}
