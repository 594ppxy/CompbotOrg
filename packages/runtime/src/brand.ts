/**
 * Branded identity primitives for the runtime domain.
 *
 * @module @compbotorg/runtime/brand
 */

declare const brandSymbol: unique symbol

/** A string carrying a compile-time brand. */
export type Branded<T extends string> = string & { readonly [brandSymbol]: T }

/** Brand one validated string as an identity of the given kind. */
export function brand<T extends string>(value: string): Branded<T> {
  return value as Branded<T>
}

/** Stable identifier for one Bot execution. */
export type ExecutionId = Branded<'ExecutionId'>

/** Brand one execution identity. */
export function ExecutionId(value: string): ExecutionId {
  return brand<'ExecutionId'>(value)
}
