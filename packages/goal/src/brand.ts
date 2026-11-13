/**
 * Branded identity primitives for the goal domain.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by goal decomposition, so a goal id can
 * never be passed where a Bot id is expected.
 *
 * @module @compbotorg/goal/brand
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

/** Stable identifier for one goal. */
export type GoalId = Branded<'GoalId'>

/**
 * Brand one goal identity.
 * @param value - raw identity text.
 * @returns the value as a {@link GoalId}.
 */
export function GoalId(value: string): GoalId {
  return brand<'GoalId'>(value)
}
