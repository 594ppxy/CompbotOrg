/**
 * Branded identity primitives for the policy engine.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by the governance domain, so a policy id can
 * never be passed where an evaluation or audit id is expected.
 *
 * @module @compbotorg/policy/brand
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

/** Stable identifier for one declared policy. */
export type PolicyId = Branded<'PolicyId'>

/**
 * Brand one policy identity.
 * @param value - raw identity text.
 * @returns the value as a {@link PolicyId}.
 */
export function PolicyId(value: string): PolicyId {
  return brand<'PolicyId'>(value)
}
