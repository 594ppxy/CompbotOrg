/**
 * Branded identity primitives for the registry.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by the marketplace domain, so a listing id
 * can never be passed where a Bot id is expected.
 *
 * @module @compbotorg/registry/brand
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

/** Stable identifier for one published listing. */
export type ListingId = Branded<'ListingId'>

/**
 * Brand one listing identity.
 * @param value - raw identity text.
 * @returns the value as a {@link ListingId}.
 */
export function ListingId(value: string): ListingId {
  return brand<'ListingId'>(value)
}
