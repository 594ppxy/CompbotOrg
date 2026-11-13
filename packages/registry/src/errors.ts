/**
 * Stable error codes for registry commands.
 *
 * Every rejection carries a code from this closed set so callers, tools, and
 * the UI can branch without matching on message text.
 *
 * @module @compbotorg/registry/errors
 */

/** Closed set of registry error codes. */
export type RegistryErrorCode =
  | 'REGISTRY_LISTING_NOT_FOUND'
  | 'REGISTRY_INVALID_ARGUMENT'
  | 'REGISTRY_ALREADY_PUBLISHED'
  | 'REGISTRY_INVALID_RATING'
  | 'REGISTRY_UNPUBLISHED'

/** Error thrown by every registry command rejection. */
export class RegistryError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: RegistryErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RegistryError'
  }
}
