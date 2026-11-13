/**
 * Branded identity primitives for the three-layer memory core.
 *
 * Bot identities belong to `@compbotorg/organization`; this module brands only
 * the identity introduced by the memory domain. The compile-time brand keeps a
 * memory entry id from being passed where a Bot id (or another package's id)
 * is expected.
 *
 * @module @compbotorg/memory/brand
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

/** Stable identifier for one memory entry. */
export type MemoryEntryId = Branded<'MemoryEntryId'>

/**
 * Brand one memory entry identity.
 * @param value - raw identity text.
 * @returns the value as a {@link MemoryEntryId}.
 */
export function MemoryEntryId(value: string): MemoryEntryId {
  return brand<'MemoryEntryId'>(value)
}
