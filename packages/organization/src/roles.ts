/**
 * Roles, permission vocabulary, and authority scopes.
 *
 * A Role is a named position in the organization with a fixed rank and a
 * default permission grant. Individual memberships may extend or narrow that
 * grant, but never above what the role's rank allows for organization-wide
 * actions.
 *
 * @module @compbotorg/organization/roles
 */

import { brand, type RoleId } from './brand'

/**
 * Rank inside the organization.
 *
 * Lower is more senior. The rank drives default authority and the "may this
 * actor manage that actor" relation: an actor may manage any member whose rank
 * is strictly greater (numerically larger) than its own, within the actor's
 * scope.
 */
export type RoleRank = 0 | 1 | 2 | 3 | 4

/** Human-readable rank names, indexed by {@link RoleRank}. */
export const RANK_NAMES: Readonly<Record<RoleRank, string>> = {
  0: 'Executive',
  1: 'C-Level',
  2: 'Director',
  3: 'Manager',
  4: 'Individual Contributor',
}

/**
 * Permission vocabulary.
 *
 * Names are dotted `resource.action` pairs. A grant is a set of these; an
 * absence means denial. Wildcards are not part of the vocabulary — every grant
 * is explicit so audits can enumerate exactly what was allowed.
 */
export type Permission =
  // Organization
  | 'org.read'
  | 'org.update'
  | 'org.delete'
  | 'org.member.invite'
  | 'org.member.remove'
  // Department
  | 'dept.create'
  | 'dept.read'
  | 'dept.update'
  | 'dept.delete'
  | 'dept.member.assign'
  | 'dept.member.remove'
  // Bot lifecycle
  | 'bot.create'
  | 'bot.read'
  | 'bot.update'
  | 'bot.disable'
  | 'bot.promote'
  // Task and work
  | 'task.create'
  | 'task.read'
  | 'task.assign'
  | 'task.delegate'
  | 'task.claim'
  | 'task.complete'
  | 'task.cancel'
  | 'task.escalate'
  // Report and review
  | 'report.submit'
  | 'report.read'
  | 'report.review'
  | 'report.approve'
  | 'report.reject'
  // Decision
  | 'decision.request'
  | 'decision.make'
  // Artifact
  | 'artifact.read'
  | 'artifact.write'
  | 'artifact.delete'
  | 'artifact.share'
  | 'artifact.version'
  // Memory
  | 'memory.org.read'
  | 'memory.org.write'
  | 'memory.dept.read'
  | 'memory.dept.write'
  | 'memory.bot.read'
  | 'memory.bot.write'
  // Governance
  | 'policy.read'
  | 'policy.update'
  | 'audit.read'
  | 'approval.grant'
  | 'approval.deny'
  | 'permission.grant.temporary'

/** Every permission in the vocabulary, useful for validation and full grants. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  'org.read',
  'org.update',
  'org.delete',
  'org.member.invite',
  'org.member.remove',
  'dept.create',
  'dept.read',
  'dept.update',
  'dept.delete',
  'dept.member.assign',
  'dept.member.remove',
  'bot.create',
  'bot.read',
  'bot.update',
  'bot.disable',
  'bot.promote',
  'task.create',
  'task.read',
  'task.assign',
  'task.delegate',
  'task.claim',
  'task.complete',
  'task.cancel',
  'task.escalate',
  'report.submit',
  'report.read',
  'report.review',
  'report.approve',
  'report.reject',
  'decision.request',
  'decision.make',
  'artifact.read',
  'artifact.write',
  'artifact.delete',
  'artifact.share',
  'artifact.version',
  'memory.org.read',
  'memory.org.write',
  'memory.dept.read',
  'memory.dept.write',
  'memory.bot.read',
  'memory.bot.write',
  'policy.read',
  'policy.update',
  'audit.read',
  'approval.grant',
  'approval.deny',
  'permission.grant.temporary',
]

/**
 * How far an actor's authority reaches.
 *
 * - `self`: only the actor's own work.
 * - `subtree`: the actor and every member below it in the reporting line.
 * - `department`: every member of the actor's department.
 * - `organization`: every member of the organization.
 */
export type AuthorityScope = 'self' | 'subtree' | 'department' | 'organization'

/** A named position inside the organization. */
export interface Role {
  readonly id: RoleId
  /** Display name, for example `CEO`, `CTO`, `Engineer`. */
  readonly name: string
  /** Rank used for default authority and the manage relation. */
  readonly rank: RoleRank
  /** Default permission grant for members holding this role. */
  readonly permissions: readonly Permission[]
  /** How far a holder's authority reaches by default. */
  readonly authority: AuthorityScope
  /** Whether the role may delegate work downward. */
  readonly canDelegate: boolean
  /** Whether the role may review and approve subordinate reports. */
  readonly canApprove: boolean
  /** Whether the role may escalate blockers upward. */
  readonly canEscalate: boolean
  /** Optional role description shown in the organization graph. */
  readonly description?: string
}

/** Input used to define a custom role. */
export interface RoleDefinition {
  readonly id?: RoleId
  readonly name: string
  readonly rank: RoleRank
  readonly permissions?: readonly Permission[]
  readonly authority?: AuthorityScope
  readonly canDelegate?: boolean
  readonly canApprove?: boolean
  readonly canEscalate?: boolean
  readonly description?: string
}

/**
 * Permission sets by rank.
 *
 * These are defaults, not limits: a role definition may grant a subset or add
 * scoped permissions. The rank gate in {@link canManage} is what actually
 * prevents a junior role from taking organization-wide action.
 */
const EXECUTIVE_PERMISSIONS: readonly Permission[] = [
  'org.read',
  'org.update',
  'org.delete',
  'org.member.invite',
  'org.member.remove',
  'dept.create',
  'dept.read',
  'dept.update',
  'dept.delete',
  'dept.member.assign',
  'dept.member.remove',
  'bot.create',
  'bot.read',
  'bot.update',
  'bot.disable',
  'bot.promote',
  'task.create',
  'task.read',
  'task.assign',
  'task.delegate',
  'task.claim',
  'task.complete',
  'task.cancel',
  'task.escalate',
  'report.submit',
  'report.read',
  'report.review',
  'report.approve',
  'report.reject',
  'decision.request',
  'decision.make',
  'artifact.read',
  'artifact.write',
  'artifact.delete',
  'artifact.share',
  'artifact.version',
  'memory.org.read',
  'memory.org.write',
  'memory.dept.read',
  'memory.dept.write',
  'memory.bot.read',
  'memory.bot.write',
  'policy.read',
  'policy.update',
  'audit.read',
  'approval.grant',
  'approval.deny',
  'permission.grant.temporary',
]

const C_LEVEL_PERMISSIONS: readonly Permission[] = EXECUTIVE_PERMISSIONS.filter(
  permission => permission !== 'org.delete',
)

const DIRECTOR_PERMISSIONS: readonly Permission[] = [
  'org.read',
  'org.member.invite',
  'dept.create',
  'dept.read',
  'dept.update',
  'dept.member.assign',
  'dept.member.remove',
  'bot.create',
  'bot.read',
  'bot.update',
  'bot.disable',
  'bot.promote',
  'task.create',
  'task.read',
  'task.assign',
  'task.delegate',
  'task.claim',
  'task.complete',
  'task.cancel',
  'task.escalate',
  'report.submit',
  'report.read',
  'report.review',
  'report.approve',
  'report.reject',
  'decision.request',
  'artifact.read',
  'artifact.write',
  'artifact.delete',
  'artifact.share',
  'artifact.version',
  'memory.org.read',
  'memory.dept.read',
  'memory.dept.write',
  'memory.bot.read',
  'memory.bot.write',
  'policy.read',
  'audit.read',
]

const MANAGER_PERMISSIONS: readonly Permission[] = [
  'org.read',
  'dept.read',
  'bot.read',
  'task.create',
  'task.read',
  'task.assign',
  'task.delegate',
  'task.claim',
  'task.complete',
  'task.escalate',
  'report.submit',
  'report.read',
  'report.review',
  'report.approve',
  'report.reject',
  'decision.request',
  'artifact.read',
  'artifact.write',
  'artifact.share',
  'artifact.version',
  'memory.dept.read',
  'memory.bot.read',
  'memory.bot.write',
  'policy.read',
]

const CONTRIBUTOR_PERMISSIONS: readonly Permission[] = [
  'org.read',
  'dept.read',
  'bot.read',
  'task.read',
  'task.claim',
  'task.complete',
  'task.escalate',
  'report.submit',
  'report.read',
  'decision.request',
  'artifact.read',
  'artifact.write',
  'artifact.share',
  'memory.dept.read',
  'memory.bot.read',
  'memory.bot.write',
]

/** Default permission grant for a rank. */
export function defaultPermissions(rank: RoleRank): readonly Permission[] {
  switch (rank) {
    case 0:
      return EXECUTIVE_PERMISSIONS
    case 1:
      return C_LEVEL_PERMISSIONS
    case 2:
      return DIRECTOR_PERMISSIONS
    case 3:
      return MANAGER_PERMISSIONS
    case 4:
      return CONTRIBUTOR_PERMISSIONS
  }
}

/** Default authority scope for a rank. */
export function defaultAuthority(rank: RoleRank): AuthorityScope {
  switch (rank) {
    case 0:
      return 'organization'
    case 1:
      return 'department'
    case 2:
      return 'subtree'
    case 3:
      return 'subtree'
    case 4:
      return 'self'
  }
}

/** Whether a rank may delegate by default. */
export function defaultCanDelegate(rank: RoleRank): boolean {
  return rank < 4
}

/** Whether a rank may approve by default. */
export function defaultCanApprove(rank: RoleRank): boolean {
  return rank < 4
}

/** Whether a rank may escalate by default. */
export function defaultCanEscalate(rank: RoleRank): boolean {
  return true
}

/**
 * Build a Role from a definition, filling defaults from the rank.
 * @param definition - caller-supplied role fields.
 * @param fallbackId - identity used when the definition omits one.
 * @returns a fully populated immutable Role.
 */
export function defineRole(definition: RoleDefinition, fallbackId: RoleId): Role {
  const rank = definition.rank
  return {
    id: definition.id ?? fallbackId,
    name: definition.name,
    rank,
    permissions: definition.permissions ?? defaultPermissions(rank),
    authority: definition.authority ?? defaultAuthority(rank),
    canDelegate: definition.canDelegate ?? defaultCanDelegate(rank),
    canApprove: definition.canApprove ?? defaultCanApprove(rank),
    canEscalate: definition.canEscalate ?? defaultCanEscalate(rank),
    ...(definition.description === undefined ? {} : { description: definition.description }),
  }
}

/**
 * Convert a role name into a stable kebab-case role identity.
 * @param name - role display name such as `Research Director`.
 * @returns a lowercase hyphenated identity such as `research-director`.
 */
export function roleIdFromName(name: string): RoleId {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return brand<'RoleId'>(slug === '' ? 'role' : slug)
}

/** The nine built-in roles covering a typical organization. */
export const BUILTIN_ROLES: readonly RoleDefinition[] = [
  {
    name: 'CEO',
    rank: 0,
    authority: 'organization',
    description: 'Owns the organization objective and answers to the user.',
  },
  {
    name: 'CTO',
    rank: 1,
    authority: 'organization',
    description: 'Owns engineering and research departments.',
  },
  {
    name: 'COO',
    rank: 1,
    authority: 'organization',
    description: 'Owns operations and go-to-market departments.',
  },
  {
    name: 'Director',
    rank: 2,
    authority: 'subtree',
    description: 'Owns one department and reviews its reports.',
  },
  {
    name: 'Manager',
    rank: 3,
    authority: 'subtree',
    description: 'Owns a team inside a department.',
  },
  {
    name: 'Engineer',
    rank: 4,
    authority: 'self',
    description: 'Builds and ships implementation work.',
  },
  {
    name: 'Researcher',
    rank: 4,
    authority: 'self',
    description: 'Produces research reports and evidence.',
  },
  {
    name: 'Designer',
    rank: 4,
    authority: 'self',
    description: 'Produces design artifacts and specifications.',
  },
  {
    name: 'Analyst',
    rank: 4,
    authority: 'self',
    description: 'Produces analysis, metrics, and recommendations.',
  },
]
