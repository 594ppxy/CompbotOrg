/**
 * Stable error codes for policy engine commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/policy/errors
 */

/** Closed set of policy engine error codes. */
export type PolicyErrorCode =
  | 'POLICY_NOT_FOUND'
  | 'POLICY_INVALID_ARGUMENT'
  | 'POLICY_DISABLED'

/** Error thrown by every policy engine command rejection. */
export class PolicyError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: PolicyErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'PolicyError'
  }
}
