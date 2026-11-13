/**
 * Stable error codes for runtime commands.
 *
 * @module @compbotorg/runtime/errors
 */

/** Closed set of runtime error codes. */
export type RuntimeErrorCode =
  | 'RUNTIME_TASK_NOT_FOUND'
  | 'RUNTIME_TASK_NOT_ASSIGNED'
  | 'RUNTIME_TASK_NOT_RUNNABLE'
  | 'RUNTIME_EXECUTION_NOT_FOUND'
  | 'RUNTIME_EXECUTION_ALREADY_FINISHED'
  | 'RUNTIME_EXECUTION_FAILED'
  | 'RUNTIME_INVALID_ARGUMENT'

/** Error thrown by every runtime rejection. */
export class RuntimeError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional cause for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: RuntimeErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RuntimeError'
  }
}
