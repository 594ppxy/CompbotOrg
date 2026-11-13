/**
 * Stable error codes for goal commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/goal/errors
 */

/** Closed set of goal error codes. */
export type GoalErrorCode =
  | 'GOAL_NOT_FOUND'
  | 'GOAL_INVALID_ARGUMENT'
  | 'GOAL_INVALID_TRANSITION'
  | 'GOAL_NO_SUBTASKS'

/** Error thrown by every goal command rejection. */
export class GoalError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: GoalErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'GoalError'
  }
}
