/**
 * Stable error codes for skill protocol commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/skill/errors
 */

/** Closed set of skill protocol error codes. */
export type SkillErrorCode =
  | 'SKILL_NOT_FOUND'
  | 'SKILL_INVALID_ARGUMENT'
  | 'SKILL_ALREADY_INSTALLED'
  | 'SKILL_NOT_INSTALLED'
  | 'SKILL_RISKY_INSTALL'
  | 'CONNECTOR_NOT_FOUND'
  | 'SKILL_DISABLED'

/** Error thrown by every skill protocol command rejection. */
export class SkillError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: SkillErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'SkillError'
  }
}
