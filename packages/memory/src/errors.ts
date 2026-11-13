/**
 * Stable error codes for three-layer memory commands.
 *
 * Every rejection carries a code from this closed set, so hosts, tools and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/memory/errors
 */

/** Closed set of memory error codes. */
export type MemoryErrorCode =
  | 'MEMORY_ENTRY_NOT_FOUND'
  | 'MEMORY_INVALID_ARGUMENT'
  | 'MEMORY_INVALID_MARKDOWN'

/** Error thrown by every memory command rejection. */
export class MemoryError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: MemoryErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'MemoryError'
  }
}
