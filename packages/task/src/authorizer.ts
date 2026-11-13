/**
 * Authorization port for the organization protocol.
 *
 * The task domain never computes rank itself. It asks an {@link Authorizer}
 * whether one member may manage another and who sits above a member in the
 * reporting line. The default is permissive so the package runs standalone;
 * hosts inject {@link OrganizationAuthorizer} to plug in v0.1's
 * `OrganizationService.canManage` and the hierarchy it derives.
 *
 * @module @compbotorg/task/authorizer
 */

import type { BotId, OrganizationService } from '@compbotorg/organization'

/** The single authority question the protocol asks of its host. */
export interface Authorizer {
  /**
   * Whether `actorId` may direct work at `targetId`.
   * @param actorId - member issuing a command.
   * @param targetId - member receiving the work.
   * @returns whether the manage relation holds.
   */
  canManage(actorId: BotId, targetId: BotId): boolean

  /**
   * Read the direct manager used to walk escalations upward.
   * @param botId - member whose manager is requested.
   * @returns the manager identity, or undefined at the top of the line.
   */
  managerOf(botId: BotId): BotId | undefined

  /**
   * Whether a member is currently able to act.
   * @param botId - member to inspect.
   * @returns whether the member is active.
   */
  isActive(botId: BotId): boolean
}

/**
 * Permissive authorizer used when no organization is wired in.
 *
 * Every manage check passes and the reporting line is empty, so standalone
 * usage works while escalations must name their target explicitly.
 */
export class PermissiveAuthorizer implements Authorizer {
  canManage(_actorId: BotId, _targetId: BotId): boolean {
    return true
  }

  managerOf(_botId: BotId): BotId | undefined {
    return undefined
  }

  isActive(_botId: BotId): boolean {
    return true
  }
}

/** Shared permissive instance for callers that do not need their own. */
export const permissiveAuthorizer: Authorizer = new PermissiveAuthorizer()

/**
 * Adapter that delegates authorization to an `OrganizationService`.
 *
 * This is the intended production wiring: assignment, delegation, review,
 * approval, and escalation all obey the rank × scope rules defined in v0.1.
 */
export class OrganizationAuthorizer implements Authorizer {
  /**
   * @param organization - the live organization service owning the members.
   */
  constructor(private readonly organization: OrganizationService) {}

  canManage(actorId: BotId, targetId: BotId): boolean {
    return this.organization.canManage(actorId, targetId)
  }

  managerOf(botId: BotId): BotId | undefined {
    return this.organization.getManager(botId)?.botId
  }

  isActive(botId: BotId): boolean {
    return this.organization.getMember(botId)?.status === 'active'
  }
}
