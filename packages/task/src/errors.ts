/**
 * Stable error codes for organization protocol commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/task/errors
 */

/** Closed set of protocol error codes. */
export type TaskErrorCode =
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_EXISTS'
  | 'TASK_INVALID_ARGUMENT'
  | 'TASK_INVALID_TRANSITION'
  | 'TASK_ALREADY_ASSIGNED'
  | 'TASK_NOT_ASSIGNED'
  | 'TASK_PERMISSION_DENIED'
  | 'TASK_NO_ESCALATION_TARGET'
  | 'TASK_INVALID_ESCALATION'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_INVALID_TRANSITION'
  | 'REPORT_PERMISSION_DENIED'
  | 'DECISION_NOT_FOUND'
  | 'DECISION_INVALID_TRANSITION'
  | 'DECISION_PERMISSION_DENIED'
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_INVALID_TRANSITION'
  | 'APPROVAL_PERMISSION_DENIED'

/** Error thrown by every protocol command rejection. */
export class TaskError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: TaskErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'TaskError'
  }
}
