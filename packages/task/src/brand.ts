/**
 * Branded identity primitives for the organization protocol.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by the task domain. Keeping them distinct at
 * compile time prevents a Report identity from being passed where a Task
 * identity is expected.
 *
 * @module @compbotorg/task/brand
 */

declare const brandSymbol: unique symbol

/** A string carrying a compile-time brand. */
export type Branded<T extends string> = string & { readonly [brandSymbol]: T }

/**
 * Brand one validated string as an identity of the given kind.
 * @param value - non-empty identity text.
 * @returns the same string branded as `T`.
 */
export function brand<T extends string>(value: string): Branded<T> {
  return value as Branded<T>
}

/** Stable identifier for one Task. */
export type TaskId = Branded<'TaskId'>

/** Stable identifier for one Report. */
export type ReportId = Branded<'ReportId'>

/** Stable identifier for one Decision. */
export type DecisionId = Branded<'DecisionId'>

/** Stable identifier for one Approval request. */
export type ApprovalId = Branded<'ApprovalId'>

/** Stable identifier for one Escalation record. */
export type EscalationId = Branded<'EscalationId'>

/**
 * Brand one Task identity.
 * @param value - raw identity text.
 * @returns the value as a {@link TaskId}.
 */
export function TaskId(value: string): TaskId {
  return brand<'TaskId'>(value)
}

/**
 * Brand one Report identity.
 * @param value - raw identity text.
 * @returns the value as a {@link ReportId}.
 */
export function ReportId(value: string): ReportId {
  return brand<'ReportId'>(value)
}

/**
 * Brand one Decision identity.
 * @param value - raw identity text.
 * @returns the value as a {@link DecisionId}.
 */
export function DecisionId(value: string): DecisionId {
  return brand<'DecisionId'>(value)
}

/**
 * Brand one Approval identity.
 * @param value - raw identity text.
 * @returns the value as an {@link ApprovalId}.
 */
export function ApprovalId(value: string): ApprovalId {
  return brand<'ApprovalId'>(value)
}

/**
 * Brand one Escalation identity.
 * @param value - raw identity text.
 * @returns the value as an {@link EscalationId}.
 */
export function EscalationId(value: string): EscalationId {
  return brand<'EscalationId'>(value)
}
