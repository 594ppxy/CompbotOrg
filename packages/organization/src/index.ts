/**
 * CompbotOrg — organization domain core.
 *
 * This package owns the durable shape of an organization: its departments,
 * roles, memberships, and reporting line. It is deliberately free of any
 * runtime, transport, or UI dependency so the same core drives the CLI, the
 * web client, and the DSH plugin layer.
 *
 * Typical use:
 *
 * ```ts
 * const org = new OrganizationService()
 * org.createOrganization({ name: 'Acme AI' })
 * const eng = org.createDepartment({ name: 'Engineering' })
 * org.addMember({ botId: BotId('ceo'), displayName: 'Ada', departmentId: eng.id, roleId: RoleId('ceo') })
 * ```
 *
 * @module @compbotorg/organization
 */

export {
  BotId,
  DepartmentId,
  OrganizationId,
  RoleId,
  brand,
  type Branded,
} from './brand'

export {
  ALL_PERMISSIONS,
  BUILTIN_ROLES,
  RANK_NAMES,
  defaultAuthority,
  defaultCanApprove,
  defaultCanDelegate,
  defaultCanEscalate,
  defaultPermissions,
  defineRole,
  roleIdFromName,
  type AuthorityScope,
  type Permission,
  type Role,
  type RoleDefinition,
  type RoleRank,
} from './roles'

export {
  type BotMembership,
  type DepartmentSnapshot,
  type MemberStatus,
  type OrganizationSnapshot,
  type OrganizationState,
  type OrganizationStats,
  type OrgTreeNode,
} from './types'

export type {
  CeoDesignatedEvent,
  DepartmentCreatedEvent,
  DepartmentRemovedEvent,
  DepartmentUpdatedEvent,
  LoggedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberPermissionsChangedEvent,
  MemberPromotedEvent,
  MemberReportsToChangedEvent,
  MemberStatusChangedEvent,
  MemberTransferredEvent,
  OrganizationCreatedEvent,
  OrganizationEvent,
  OrganizationEventType,
  OrganizationUpdatedEvent,
  RoleRegisteredEvent,
} from './events'

export { OrganizationError, type OrganizationErrorCode } from './errors'

export { applyEvent, emptyState, replay } from './projection'

export {
  ancestorsOf,
  assertCanReportTo,
  authorityOf,
  buildTree,
  canManage,
  canReportTo,
  descendantsOf,
  directReports,
  effectivePermissions,
  hasPermission,
  managerOf,
  membersOfDepartment,
  rootsOf,
  statsOf,
  subtreeDepth,
  whyCannotManage,
} from './hierarchy'

export {
  MemoryOrganizationStore,
  type OrganizationStore,
} from './store'

export {
  OrganizationService,
  restoreOrganization,
  type AddMemberInput,
  type CommandOptions,
  type CreateDepartmentInput,
  type CreateOrganizationInput,
  type OrganizationServiceOptions,
} from './service'
