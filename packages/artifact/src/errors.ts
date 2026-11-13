/**
 * Stable error codes for artifact commands.
 *
 * @module @compbotorg/artifact/errors
 */

/** Closed set of artifact error codes. */
export type ArtifactErrorCode =
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_INVALID_ARGUMENT'
  | 'ARTIFACT_ARCHIVED'
  | 'ARTIFACT_PERMISSION_DENIED'
  | 'ARTIFACT_ALREADY_SHARED'
  | 'ARTIFACT_SHARE_NOT_FOUND'

/** Error thrown by every artifact rejection. */
export class ArtifactError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional cause for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: ArtifactErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ArtifactError'
  }
}
