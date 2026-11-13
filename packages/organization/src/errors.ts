/**
 * Stable error codes for organization commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/organization/errors
 */

/** Closed set of organization error codes. */
export type OrganizationErrorCode =
  | 'ORG_NOT_FOUND'
  | 'ORG_ALREADY_EXISTS'
  | 'ORG_INVALID_ARGUMENT'
  | 'DEPT_NOT_FOUND'
  | 'DEPT_ALREADY_EXISTS'
  | 'DEPT_HAS_MEMBERS'
  | 'DEPT_HAS_CHILDREN'
  | 'DEPT_CYCLE'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_ALREADY_EXISTS'
  | 'MEMBER_REPORTING_CYCLE'
  | 'MEMBER_MANAGER_NOT_FOUND'
  | 'MEMBER_INVALID_TRANSITION'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_ALREADY_EXISTS'
  | 'PERMISSION_DENIED'

/** Error thrown by every organization command rejection. */
export class OrganizationError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: OrganizationErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'OrganizationError'
  }
}
