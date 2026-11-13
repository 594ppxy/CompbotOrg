/**
 * Stable error codes for the Company facade.
 *
 * The facade does not own an event log, so its failures are composition
 * failures (a denied action, a bad snapshot) rather than domain rejections.
 *
 * @module @compbotorg/company/errors
 */

/** Closed set of Company facade error codes. */
export type CompanyErrorCode =
  | 'COMPANY_ACTION_DENIED'
  | 'COMPANY_INVALID_ARGUMENT'
  | 'COMPANY_SNAPSHOT_INVALID'

/** Error thrown by Company facade operations. */
export class CompanyError extends Error {
  /**
   * @param message - human-readable explanation.
   * @param code - stable machine-readable code.
   * @param options - optional `cause` for chained diagnostics.
   */
  constructor(
    message: string,
    readonly code: CompanyErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'CompanyError'
  }
}
