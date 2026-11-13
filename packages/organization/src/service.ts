/**
 * Organization command service.
 *
 * Every public method follows the same shape: validate against the current
 * projection, append exactly one event, fold it, return a detached view. No
 * method mutates state in place, so a caller can keep an older projection for
 * comparison or diffing.
 *
 * Authorization is explicit rather than ambient: commands that change the
 * organization take an optional `actorId` and check it against the folded
 * grant. Bootstrap operations (creating the organization, adding the first
 * member) intentionally allow an absent actor.
 *
 * @module @compbotorg/organization/service
 */

import { BotId, DepartmentId, OrganizationId, RoleId, type Branded } from './brand'
import { OrganizationError } from './errors'
import type { OrganizationEvent, LoggedEvent } from './events'
import {
  ancestorsOf,
  assertCanReportTo,
  buildTree,
  canManage,
  descendantsOf,
  directReports,
  effectivePermissions,
  hasPermission,
  managerOf,
  membersOfDepartment,
  rootsOf,
  statsOf,
  whyCannotManage,
} from './hierarchy'
import { applyEvent, emptyState, replay } from './projection'
import {
  ALL_PERMISSIONS,
  BUILTIN_ROLES,
  defineRole,
  defaultAuthority,
  roleIdFromName,
  type Permission,
  type Role,
  type RoleDefinition,
  type RoleRank,
} from './roles'
import { MemoryOrganizationStore, type OrganizationStore } from './store'
import type {
  BotMembership,
  DepartmentSnapshot,
  OrganizationSnapshot,
  OrganizationState,
  OrganizationStats,
  OrgTreeNode,
} from './types'

/** Input for {@link OrganizationService.createOrganization}. */
export interface CreateOrganizationInput {
  readonly name: string
  readonly description?: string
  /** Extra roles registered alongside the built-ins. */
  readonly roles?: readonly RoleDefinition[]
}

/** Input for {@link OrganizationService.createDepartment}. */
export interface CreateDepartmentInput {
  readonly name: string
  readonly description?: string
  readonly parentDepartmentId?: DepartmentId
}

/** Input for {@link OrganizationService.addMember}. */
export interface AddMemberInput {
  readonly botId: BotId
  readonly displayName: string
  readonly departmentId: DepartmentId
  readonly roleId: RoleId
  readonly reportsTo?: BotId
}

/** Options accepted by mutating commands. */
export interface CommandOptions {
  /** Member issuing the command; omitted for bootstrap operations. */
  readonly actorId?: BotId
}

/** Service construction options. */
export interface OrganizationServiceOptions {
  /** Storage backend; defaults to an in-memory log. */
  readonly store?: OrganizationStore
  /** Clock override for deterministic tests. */
  readonly now?: () => Date
}

const MAX_NAME_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 4_000

/** Validate one required display string. */
function requiredText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new OrganizationError(`${field} must not be empty`, 'ORG_INVALID_ARGUMENT')
  }
  if (trimmed.length > max) {
    throw new OrganizationError(
      `${field} must be at most ${max} characters`,
      'ORG_INVALID_ARGUMENT',
    )
  }
  return trimmed
}

/** Validate one optional display string. */
function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  return requiredText(value, field, max)
}

/** Fold the stored log into current state. */
function foldStore(store: OrganizationStore): OrganizationState {
  return replay(store.readAll().map(entry => entry.event))
}

/**
 * Organization, department, role, and membership commands.
 *
 * Construct one service per organization. The service owns the log; nothing
 * else writes to it.
 */
export class OrganizationService {
  private readonly store: OrganizationStore
  private readonly now: () => Date
  private state: OrganizationState

  constructor(options: OrganizationServiceOptions = {}) {
    this.store = options.store ?? new MemoryOrganizationStore()
    this.now = options.now ?? (() => new Date())
    this.state = foldStore(this.store)
  }

  // ---------------------------------------------------------------- queries

  /** Current organization snapshot, or undefined before creation. */
  get organization(): OrganizationSnapshot | undefined {
    return this.state.organization
  }

  /** Immutable view of the folded state. */
  getState(): OrganizationState {
    return this.state
  }

  /** Every logged event, in append order. */
  events(): LoggedEvent[] {
    return this.store.readAll()
  }

  /** Every department, in creation order. */
  listDepartments(): DepartmentSnapshot[] {
    return [...this.state.departments.values()]
  }

  /** Every role, built-in and custom. */
  listRoles(): Role[] {
    return [...this.state.roles.values()]
  }

  /** Every member that has not left, in join order. */
  listMembers(): BotMembership[] {
    return [...this.state.members.values()].filter(member => member.status !== 'removed')
  }

  /**
   * Read one member.
   * @param botId - member identity.
   * @returns the membership, or undefined when unknown or removed.
   */
  getMember(botId: BotId): BotMembership | undefined {
    const member = this.state.members.get(botId)
    return member?.status === 'removed' ? undefined : member
  }

  /**
   * Read one department.
   * @param departmentId - department identity.
   * @returns the department, or undefined when unknown.
   */
  getDepartment(departmentId: DepartmentId): DepartmentSnapshot | undefined {
    return this.state.departments.get(departmentId)
  }

  /**
   * Read one role.
   * @param roleId - role identity.
   * @returns the role, or undefined when unknown.
   */
  getRole(roleId: RoleId): Role | undefined {
    return this.state.roles.get(roleId)
  }

  /** Renderable organization tree. */
  getTree(): OrgTreeNode[] {
    return buildTree(this.state)
  }

  /** Summary counters. */
  getStats(): OrganizationStats {
    return statsOf(this.state)
  }

  /**
   * Direct reports of one member.
   * @param botId - manager identity.
   * @returns members reporting to it.
   */
  getDirectReports(botId: BotId): BotMembership[] {
    return directReports(this.state, botId)
  }

  /**
   * Reporting line above one member.
   * @param botId - member identity.
   * @returns ancestors from immediate manager upward.
   */
  getAncestors(botId: BotId): BotMembership[] {
    return ancestorsOf(this.state, botId)
  }

  /**
   * Every member below one member.
   * @param botId - member identity.
   * @returns descendants in breadth-first order.
   */
  getDescendants(botId: BotId): BotMembership[] {
    return descendantsOf(this.state, botId)
  }

  /**
   * Manager of one member.
   * @param botId - member identity.
   * @returns the manager, or undefined at the top.
   */
  getManager(botId: BotId): BotMembership | undefined {
    return managerOf(this.state, botId)
  }

  /**
   * Members sitting in one department.
   * @param departmentId - department identity.
   * @returns members of that department.
   */
  getDepartmentMembers(departmentId: DepartmentId): BotMembership[] {
    return membersOfDepartment(this.state, departmentId)
  }

  /**
   * Effective permission grant of one member.
   * @param botId - member identity.
   * @returns the resolved permission set.
   */
  permissionsOf(botId: BotId): Set<Permission> {
    return effectivePermissions(this.state, botId)
  }

  /**
   * Whether one member holds a permission.
   * @param botId - member identity.
   * @param permission - permission required.
   * @returns whether the grant includes it.
   */
  can(botId: BotId, permission: Permission): boolean {
    return hasPermission(this.state, botId, permission)
  }

  /**
   * Whether one member may manage another.
   * @param actorId - member attempting to manage.
   * @param targetId - member being managed.
   * @returns whether the manage relation holds.
   */
  canManage(actorId: BotId, targetId: BotId): boolean {
    return canManage(this.state, actorId, targetId)
  }

  /**
   * Why one member may not manage another.
   * @param actorId - member attempting to manage.
   * @param targetId - member being managed.
   * @returns the blocking reason, or undefined when allowed.
   */
  whyCannotManage(actorId: BotId, targetId: BotId): string | undefined {
    return whyCannotManage(this.state, actorId, targetId)
  }

  // --------------------------------------------------------------- commands

  /**
   * Create the organization and register its roles.
   * @param input - organization name, optional description, optional extra roles.
   * @returns the created organization snapshot.
   * @throws ORG_ALREADY_EXISTS when an organization is already present.
   */
  createOrganization(input: CreateOrganizationInput): OrganizationSnapshot {
    if (this.state.organization !== undefined) {
      throw new OrganizationError('an organization already exists in this service', 'ORG_ALREADY_EXISTS')
    }
    const name = requiredText(input.name, 'organization name', MAX_NAME_LENGTH)
    const description = optionalText(input.description, 'organization description', MAX_DESCRIPTION_LENGTH)
    const organizationId = OrganizationId(`org-${roleIdFromName(name) || 'main'}`)
    const roles = this.buildRoleSet(input.roles ?? [])
    this.commit({
      type: 'organization/created',
      organizationId,
      name,
      ...(description === undefined ? {} : { description }),
      roles,
      occurredAt: this.timestamp(),
    })
    return this.requireOrganization()
  }

  /**
   * Update organization metadata.
   * @param patch - fields to change.
   * @param options - issuing actor, checked for `org.update`.
   * @returns the updated snapshot.
   */
  updateOrganization(
    patch: { name?: string; description?: string },
    options: CommandOptions = {},
  ): OrganizationSnapshot {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'org.update')
    const name = patch.name === undefined ? undefined : requiredText(patch.name, 'organization name', MAX_NAME_LENGTH)
    const description =
      patch.description === undefined
        ? undefined
        : requiredText(patch.description, 'organization description', MAX_DESCRIPTION_LENGTH)
    if (name === undefined && description === undefined) {
      throw new OrganizationError('update requires name or description', 'ORG_INVALID_ARGUMENT')
    }
    this.commit({
      type: 'organization/updated',
      organizationId: organization.id,
      ...(name === undefined ? {} : { name }),
      ...(description === undefined ? {} : { description }),
      occurredAt: this.timestamp(),
    })
    return this.state.organization as OrganizationSnapshot
  }

  /**
   * Designate the organization's top member.
   * @param botId - member to place at the top of the reporting line.
   * @param options - issuing actor, checked for `org.update`.
   * @returns the updated snapshot.
   */
  designateCeo(botId: BotId, options: CommandOptions = {}): OrganizationSnapshot {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'org.update')
    this.requireMember(botId)
    this.commit({
      type: 'organization/ceo-designated',
      organizationId: organization.id,
      botId,
      occurredAt: this.timestamp(),
    })
    return this.state.organization as OrganizationSnapshot
  }

  /**
   * Register a custom role.
   * @param definition - role fields; rank and name are required.
   * @param options - issuing actor, checked for `org.update`.
   * @returns the registered role.
   */
  registerRole(definition: RoleDefinition, options: CommandOptions = {}): Role {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'org.update')
    const id = definition.id ?? roleIdFromName(definition.name)
    if (this.state.roles.has(id)) {
      throw new OrganizationError(`role "${id}" already exists`, 'ROLE_ALREADY_EXISTS')
    }
    const role = defineRole(definition, id)
    this.commit({
      type: 'role/registered',
      organizationId: organization.id,
      role,
      occurredAt: this.timestamp(),
    })
    return role
  }

  /**
   * Create a department.
   * @param input - department name, optional description and parent.
   * @param options - issuing actor, checked for `dept.create`.
   * @returns the created department.
   */
  createDepartment(input: CreateDepartmentInput, options: CommandOptions = {}): DepartmentSnapshot {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'dept.create')
    const name = requiredText(input.name, 'department name', MAX_NAME_LENGTH)
    const description = optionalText(input.description, 'department description', MAX_DESCRIPTION_LENGTH)
    if (input.parentDepartmentId !== undefined && !this.state.departments.has(input.parentDepartmentId)) {
      throw new OrganizationError(
        `parent department "${input.parentDepartmentId}" not found`,
        'DEPT_NOT_FOUND',
      )
    }
    const departmentId = DepartmentId(`dept-${roleIdFromName(name)}-${this.state.departments.size + 1}`)
    if (this.state.departments.has(departmentId)) {
      throw new OrganizationError(`department "${departmentId}" already exists`, 'DEPT_ALREADY_EXISTS')
    }
    this.commit({
      type: 'department/created',
      organizationId: organization.id,
      departmentId,
      name,
      ...(description === undefined ? {} : { description }),
      ...(input.parentDepartmentId === undefined ? {} : { parentDepartmentId: input.parentDepartmentId }),
      occurredAt: this.timestamp(),
    })
    return this.state.departments.get(departmentId) as DepartmentSnapshot
  }

  /**
   * Update department metadata.
   * @param departmentId - department to change.
   * @param patch - fields to change.
   * @param options - issuing actor, checked for `dept.update`.
   * @returns the updated department.
   */
  updateDepartment(
    departmentId: DepartmentId,
    patch: { name?: string; description?: string },
    options: CommandOptions = {},
  ): DepartmentSnapshot {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'dept.update')
    this.requireDepartment(departmentId)
    const name = patch.name === undefined ? undefined : requiredText(patch.name, 'department name', MAX_NAME_LENGTH)
    const description =
      patch.description === undefined
        ? undefined
        : requiredText(patch.description, 'department description', MAX_DESCRIPTION_LENGTH)
    if (name === undefined && description === undefined) {
      throw new OrganizationError('update requires name or description', 'ORG_INVALID_ARGUMENT')
    }
    this.commit({
      type: 'department/updated',
      organizationId: organization.id,
      departmentId,
      ...(name === undefined ? {} : { name }),
      ...(description === undefined ? {} : { description }),
      occurredAt: this.timestamp(),
    })
    return this.state.departments.get(departmentId) as DepartmentSnapshot
  }

  /**
   * Remove an empty department.
   * @param departmentId - department to remove.
   * @param options - issuing actor, checked for `dept.delete`.
   */
  removeDepartment(departmentId: DepartmentId, options: CommandOptions = {}): void {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'dept.delete')
    this.requireDepartment(departmentId)
    if (membersOfDepartment(this.state, departmentId).length > 0) {
      throw new OrganizationError(
        `department "${departmentId}" still has members`,
        'DEPT_HAS_MEMBERS',
      )
    }
    const hasChildren = [...this.state.departments.values()].some(
      department => department.parentDepartmentId === departmentId,
    )
    if (hasChildren) {
      throw new OrganizationError(
        `department "${departmentId}" still has child departments`,
        'DEPT_HAS_CHILDREN',
      )
    }
    this.commit({
      type: 'department/removed',
      organizationId: organization.id,
      departmentId,
      occurredAt: this.timestamp(),
    })
  }

  /**
   * Add one Bot to the organization.
   * @param input - Bot identity, display name, department, role, optional manager.
   * @param options - issuing actor; omitted only while bootstrapping the first member.
   * @returns the created membership.
   */
  addMember(input: AddMemberInput, options: CommandOptions = {}): BotMembership {
    const organization = this.requireOrganization()
    const existing = this.state.members.get(input.botId)
    if (existing !== undefined && existing.status !== 'removed') {
      throw new OrganizationError(`bot "${input.botId}" is already a member`, 'MEMBER_ALREADY_EXISTS')
    }
    const isFirstMember = this.listMembers().length === 0
    if (!isFirstMember) this.requirePermission(options, 'org.member.invite')

    const displayName = requiredText(input.displayName, 'display name', MAX_NAME_LENGTH)
    this.requireDepartment(input.departmentId)
    const role = this.state.roles.get(input.roleId)
    if (role === undefined) {
      throw new OrganizationError(`role "${input.roleId}" not found`, 'ROLE_NOT_FOUND')
    }
    if (input.reportsTo !== undefined) {
      this.requireMember(input.reportsTo)
      const manager = this.state.members.get(input.reportsTo) as BotMembership
      if (manager.rank >= role.rank) {
        throw new OrganizationError(
          `manager "${manager.botId}" (rank ${manager.rank}) must outrank the new member (rank ${role.rank})`,
          'MEMBER_INVALID_TRANSITION',
        )
      }
    }

    this.commit({
      type: 'member/joined',
      organizationId: organization.id,
      botId: input.botId,
      displayName,
      departmentId: input.departmentId,
      roleId: input.roleId,
      rank: role.rank,
      ...(input.reportsTo === undefined ? {} : { reportsTo: input.reportsTo }),
      occurredAt: this.timestamp(),
    })
    if (isFirstMember && organization.ceoBotId === undefined) {
      this.commit({
        type: 'organization/ceo-designated',
        organizationId: organization.id,
        botId: input.botId,
        occurredAt: this.timestamp(),
      })
    }
    return this.state.members.get(input.botId) as BotMembership
  }

  /**
   * Move a member to another department.
   * @param botId - member to move.
   * @param toDepartmentId - destination department.
   * @param options - issuing actor, checked for `dept.member.assign` or self-transfer rights.
   * @returns the updated membership.
   */
  transferMember(
    botId: BotId,
    toDepartmentId: DepartmentId,
    options: CommandOptions = {},
  ): BotMembership {
    const organization = this.requireOrganization()
    const member = this.requireMember(botId)
    this.requireDepartment(toDepartmentId)
    this.requireManageOrSelf(options, botId, 'dept.member.assign')
    if (member.departmentId === toDepartmentId) {
      throw new OrganizationError(`member "${botId}" is already in that department`, 'MEMBER_INVALID_TRANSITION')
    }
    this.commit({
      type: 'member/transferred',
      organizationId: organization.id,
      botId,
      fromDepartmentId: member.departmentId,
      toDepartmentId,
      occurredAt: this.timestamp(),
    })
    return this.state.members.get(botId) as BotMembership
  }

  /**
   * Change a member's role, and with it the rank.
   * @param botId - member to promote or demote.
   * @param roleId - destination role.
   * @param options - issuing actor, checked for `bot.promote`.
   * @returns the updated membership.
   */
  promoteMember(botId: BotId, roleId: RoleId, options: CommandOptions = {}): BotMembership {
    const organization = this.requireOrganization()
    const member = this.requireMember(botId)
    const role = this.state.roles.get(roleId)
    if (role === undefined) {
      throw new OrganizationError(`role "${roleId}" not found`, 'ROLE_NOT_FOUND')
    }
    this.requirePermission(options, 'bot.promote')
    if (options.actorId !== undefined) {
      const actor = this.state.members.get(options.actorId)
      if (actor !== undefined && actor.rank >= role.rank) {
        throw new OrganizationError(
          `actor rank ${actor.rank} cannot assign rank ${role.rank}`,
          'PERMISSION_DENIED',
        )
      }
    }
    if (member.rank === role.rank && member.roleId === roleId) {
      throw new OrganizationError(`member "${botId}" already holds that role`, 'MEMBER_INVALID_TRANSITION')
    }
    if (member.reportsTo !== undefined) {
      const manager = this.state.members.get(member.reportsTo)
      if (manager !== undefined && manager.rank >= role.rank) {
        throw new OrganizationError(
          `manager "${manager.botId}" (rank ${manager.rank}) must outrank the member (rank ${role.rank})`,
          'MEMBER_INVALID_TRANSITION',
        )
      }
    }
    this.commit({
      type: 'member/promoted',
      organizationId: organization.id,
      botId,
      fromRoleId: member.roleId,
      toRoleId: roleId,
      fromRank: member.rank,
      toRank: role.rank,
      occurredAt: this.timestamp(),
    })
    return this.state.members.get(botId) as BotMembership
  }

  /**
   * Change a member's direct manager.
   * @param botId - member whose line changes.
   * @param managerId - new manager, or undefined to make the member a root.
   * @param options - issuing actor, checked for `dept.member.assign` or self rights.
   * @returns the updated membership.
   */
  setReportsTo(
    botId: BotId,
    managerId: BotId | undefined,
    options: CommandOptions = {},
  ): BotMembership {
    const organization = this.requireOrganization()
    const member = this.requireMember(botId)
    this.requireManageOrSelf(options, botId, 'dept.member.assign')
    if (managerId !== undefined) {
      const manager = this.requireMember(managerId)
      // A cycle is a structural impossibility, so it is reported before the
      // softer rank rule; otherwise "report to your own report" would surface
      // as a confusing rank complaint.
      assertCanReportTo(this.state, botId, managerId)
      if (manager.rank >= member.rank) {
        throw new OrganizationError(
          `manager "${managerId}" (rank ${manager.rank}) must outrank the member (rank ${member.rank})`,
          'MEMBER_INVALID_TRANSITION',
        )
      }
    }
    this.commit({
      type: 'member/reports-to-changed',
      organizationId: organization.id,
      botId,
      ...(member.reportsTo === undefined ? {} : { fromReportsTo: member.reportsTo }),
      ...(managerId === undefined ? {} : { toReportsTo: managerId }),
      occurredAt: this.timestamp(),
    })
    return this.state.members.get(botId) as BotMembership
  }

  /**
   * Suspend an active member.
   * @param botId - member to suspend.
   * @param options - issuing actor, checked for `bot.disable`.
   * @returns the updated membership.
   */
  suspendMember(botId: BotId, options: CommandOptions = {}): BotMembership {
    return this.changeStatus(botId, 'active', 'suspended', options)
  }

  /**
   * Resume a suspended member.
   * @param botId - member to resume.
   * @param options - issuing actor, checked for `bot.disable`.
   * @returns the updated membership.
   */
  resumeMember(botId: BotId, options: CommandOptions = {}): BotMembership {
    return this.changeStatus(botId, 'suspended', 'active', options)
  }

  /**
   * Remove a member from the organization.
   * @param botId - member to remove.
   * @param options - issuing actor, checked for `org.member.remove`.
   */
  removeMember(botId: BotId, options: CommandOptions = {}): void {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'org.member.remove')
    const member = this.requireMember(botId)
    if (directReports(this.state, botId).length > 0) {
      throw new OrganizationError(
        `member "${botId}" still has direct reports; reassign them first`,
        'MEMBER_INVALID_TRANSITION',
      )
    }
    if (member.status === 'removed') {
      throw new OrganizationError(`member "${botId}" already left`, 'MEMBER_INVALID_TRANSITION')
    }
    this.commit({
      type: 'member/left',
      organizationId: organization.id,
      botId,
      occurredAt: this.timestamp(),
    })
  }

  /**
   * Replace a member's permission overrides.
   * @param botId - member to adjust.
   * @param grant - permissions added beyond the role default.
   * @param deny - permissions withheld despite the role default.
   * @param options - issuing actor, checked for `permission.grant.temporary`.
   * @returns the updated membership.
   */
  setMemberPermissions(
    botId: BotId,
    grant: readonly Permission[],
    deny: readonly Permission[],
    options: CommandOptions = {},
  ): BotMembership {
    const organization = this.requireOrganization()
    this.requireMember(botId)
    this.requirePermission(options, 'permission.grant.temporary')
    for (const permission of [...grant, ...deny]) {
      if (!ALL_PERMISSIONS.includes(permission)) {
        throw new OrganizationError(`unknown permission "${permission}"`, 'ORG_INVALID_ARGUMENT')
      }
    }
    const overlap = grant.filter(permission => deny.includes(permission))
    if (overlap.length > 0) {
      throw new OrganizationError(
        `permission granted and denied at once: ${overlap.join(', ')}`,
        'ORG_INVALID_ARGUMENT',
      )
    }
    this.commit({
      type: 'member/permissions-changed',
      organizationId: organization.id,
      botId,
      extraPermissions: [...grant],
      deniedPermissions: [...deny],
      occurredAt: this.timestamp(),
    })
    return this.state.members.get(botId) as BotMembership
  }

  // --------------------------------------------------------------- internals

  /** Build the role set registered at organization creation. */
  private buildRoleSet(extra: readonly RoleDefinition[]): Role[] {
    const roles: Role[] = []
    const seen = new Set<RoleId>()
    for (const definition of BUILTIN_ROLES) {
      const id = roleIdFromName(definition.name)
      if (seen.has(id)) continue
      seen.add(id)
      roles.push(defineRole(definition, id))
    }
    for (const definition of extra) {
      const id = definition.id ?? roleIdFromName(definition.name)
      if (seen.has(id)) {
        throw new OrganizationError(`duplicate role "${id}"`, 'ROLE_ALREADY_EXISTS')
      }
      seen.add(id)
      roles.push(defineRole(definition, id))
    }
    return roles
  }

  /** Append one event and fold it into the live projection. */
  private commit(event: OrganizationEvent): void {
    this.store.append(event)
    this.state = applyEvent(this.state, event)
  }

  /** Current ISO-8601 timestamp from the injected clock. */
  private timestamp(): string {
    return this.now().toISOString()
  }

  /** Require a created organization. */
  private requireOrganization(): OrganizationSnapshot {
    const organization = this.state.organization
    if (organization === undefined) {
      throw new OrganizationError('create an organization first', 'ORG_NOT_FOUND')
    }
    return organization
  }

  /** Require a live member. */
  private requireMember(botId: BotId): BotMembership {
    const member = this.state.members.get(botId)
    if (member === undefined || member.status === 'removed') {
      throw new OrganizationError(`bot "${botId}" is not a member`, 'MEMBER_NOT_FOUND')
    }
    return member
  }

  /** Require an existing department. */
  private requireDepartment(departmentId: DepartmentId): DepartmentSnapshot {
    const department = this.state.departments.get(departmentId)
    if (department === undefined) {
      throw new OrganizationError(`department "${departmentId}" not found`, 'DEPT_NOT_FOUND')
    }
    return department
  }

  /** Require a permission when an actor is supplied. */
  private requirePermission(options: CommandOptions, permission: Permission): void {
    const actorId = options.actorId
    if (actorId === undefined) return
    const actor = this.state.members.get(actorId)
    if (actor === undefined || actor.status !== 'active') {
      throw new OrganizationError(`actor "${actorId}" is not an active member`, 'PERMISSION_DENIED')
    }
    if (!hasPermission(this.state, actorId, permission)) {
      throw new OrganizationError(
        `actor "${actorId}" lacks permission "${permission}"`,
        'PERMISSION_DENIED',
      )
    }
  }

  /**
   * Require either the relevant permission or that the actor is the member
   * itself. Self-service transfers and line changes stay possible for a member
   * whose role cannot manage others.
   */
  private requireManageOrSelf(options: CommandOptions, botId: BotId, permission: Permission): void {
    const actorId = options.actorId
    if (actorId === undefined) return
    if (actorId === botId) return
    this.requirePermission(options, permission)
  }

  /** Shared status transition. */
  private changeStatus(
    botId: BotId,
    from: 'active' | 'suspended',
    to: 'active' | 'suspended',
    options: CommandOptions,
  ): BotMembership {
    const organization = this.requireOrganization()
    this.requirePermission(options, 'bot.disable')
    const member = this.requireMember(botId)
    if (member.status !== from) {
      throw new OrganizationError(
        `member "${botId}" is ${member.status}, expected ${from}`,
        'MEMBER_INVALID_TRANSITION',
      )
    }
    this.commit({
      type: 'member/status-changed',
      organizationId: organization.id,
      botId,
      from,
      to,
      occurredAt: this.timestamp(),
    })
    return this.state.members.get(botId) as BotMembership
  }
}

/**
 * Create a service and replay an existing log.
 * @param events - previously persisted events.
 * @param options - clock override.
 * @returns a service whose projection reflects the log.
 */
export function restoreOrganization(
  events: readonly OrganizationEvent[],
  options: OrganizationServiceOptions = {},
): OrganizationService {
  const store = new MemoryOrganizationStore()
  for (const event of events) store.append(event)
  return new OrganizationService({ ...options, store })
}

/** Default authority for a rank, re-exported for callers building role UIs. */
export { defaultAuthority }
/** Rank type re-exported alongside the service. */
export type { RoleRank }
/** Branded identity re-exported for convenience. */
export type { Branded }
/** Bot identity constructor re-exported for convenience. */
export { BotId }
