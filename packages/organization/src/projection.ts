/**
 * Event folding into organization state.
 *
 * The fold is pure: given the previous state and one event it returns the next
 * state. Nothing here validates or rejects; commands own that. This keeps
 * replay deterministic and lets a corrupt log surface as a projection anomaly
 * rather than an exception mid-stream.
 *
 * @module @compbotorg/organization/projection
 */

import type { BotId, DepartmentId, RoleId } from './brand'
import type { OrganizationEvent } from './events'
import type { BotMembership, DepartmentSnapshot, OrganizationState } from './types'

/** The empty state a fold starts from. */
export function emptyState(): OrganizationState {
  return {
    organization: undefined,
    departments: new Map(),
    members: new Map(),
    roles: new Map(),
  }
}

/** Replace one membership while preserving map identity semantics. */
function withMember(
  members: ReadonlyMap<BotId, BotMembership>,
  botId: BotId,
  next: BotMembership,
): ReadonlyMap<BotId, BotMembership> {
  const copy = new Map(members)
  copy.set(botId, next)
  return copy
}

/**
 * Fold one event into the previous state.
 * @param state - state before the event.
 * @param event - the next durable event.
 * @returns the state after the event.
 */
export function applyEvent(state: OrganizationState, event: OrganizationEvent): OrganizationState {
  switch (event.type) {
    case 'organization/created': {
      const roles = new Map(state.roles)
      for (const role of event.roles) roles.set(role.id, role)
      return {
        organization: {
          id: event.organizationId,
          name: event.name,
          ...(event.description === undefined ? {} : { description: event.description }),
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
        },
        departments: state.departments,
        members: state.members,
        roles,
      }
    }

    case 'organization/updated': {
      if (state.organization === undefined) return state
      return {
        ...state,
        organization: {
          ...state.organization,
          ...(event.name === undefined ? {} : { name: event.name }),
          ...(event.description === undefined ? {} : { description: event.description }),
          updatedAt: event.occurredAt,
        },
      }
    }

    case 'organization/ceo-designated': {
      if (state.organization === undefined) return state
      return {
        ...state,
        organization: {
          ...state.organization,
          ceoBotId: event.botId,
          updatedAt: event.occurredAt,
        },
      }
    }

    case 'department/created': {
      const departments = new Map(state.departments)
      const department: DepartmentSnapshot = {
        id: event.departmentId,
        organizationId: event.organizationId,
        name: event.name,
        ...(event.description === undefined ? {} : { description: event.description }),
        ...(event.parentDepartmentId === undefined
          ? {}
          : { parentDepartmentId: event.parentDepartmentId }),
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      departments.set(event.departmentId, department)
      return { ...state, departments }
    }

    case 'department/updated': {
      const current = state.departments.get(event.departmentId)
      if (current === undefined) return state
      const departments = new Map(state.departments)
      departments.set(event.departmentId, {
        ...current,
        ...(event.name === undefined ? {} : { name: event.name }),
        ...(event.description === undefined ? {} : { description: event.description }),
        updatedAt: event.occurredAt,
      })
      return { ...state, departments }
    }

    case 'department/removed': {
      const departments = new Map(state.departments)
      departments.delete(event.departmentId)
      return { ...state, departments }
    }

    case 'member/joined': {
      const membership: BotMembership = {
        botId: event.botId,
        displayName: event.displayName,
        departmentId: event.departmentId,
        roleId: event.roleId,
        rank: event.rank,
        ...(event.reportsTo === undefined ? {} : { reportsTo: event.reportsTo }),
        extraPermissions: [],
        deniedPermissions: [],
        status: 'active',
        joinedAt: event.occurredAt,
        updatedAt: event.occurredAt,
      }
      return { ...state, members: withMember(state.members, event.botId, membership) }
    }

    case 'member/transferred': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...current,
          departmentId: event.toDepartmentId,
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'member/promoted': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...current,
          roleId: event.toRoleId,
          rank: event.toRank,
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'member/reports-to-changed': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      const { reportsTo: _previous, ...rest } = current
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...rest,
          ...(event.toReportsTo === undefined ? {} : { reportsTo: event.toReportsTo }),
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'member/status-changed': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...current,
          status: event.to,
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'member/left': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...current,
          status: 'removed',
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'member/permissions-changed': {
      const current = state.members.get(event.botId)
      if (current === undefined) return state
      return {
        ...state,
        members: withMember(state.members, event.botId, {
          ...current,
          extraPermissions: event.extraPermissions,
          deniedPermissions: event.deniedPermissions,
          updatedAt: event.occurredAt,
        }),
      }
    }

    case 'role/registered': {
      const roles = new Map(state.roles)
      roles.set(event.role.id, event.role)
      return { ...state, roles }
    }
  }
}

/**
 * Fold an ordered event stream from the empty state.
 * @param events - events in append order.
 * @returns the reconstructed state.
 */
export function replay(events: readonly OrganizationEvent[]): OrganizationState {
  let state = emptyState()
  for (const event of events) state = applyEvent(state, event)
  return state
}
