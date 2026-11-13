/**
 * Branded identity primitives for the artifact file system.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by the artifact domain. Keeping them distinct
 * at compile time prevents a Version identity from being passed where an
 * Artifact identity is expected.
 *
 * @module @compbotorg/artifact/brand
 */

declare const brandSymbol: unique symbol

/** A string carrying a compile-time brand. */
export type Branded<T extends string> = string & { readonly [brandSymbol]: T }

/**
 * Brand one validated string as an identity of the given kind.
 * @param value - identity text.
 * @returns the same string branded as `T`.
 */
export function brand<T extends string>(value: string): Branded<T> {
  return value as Branded<T>
}

/** Stable identifier for one Artifact. */
export type ArtifactId = Branded<'ArtifactId'>

/** Stable identifier for one published Artifact version. */
export type VersionId = Branded<'VersionId'>

/**
 * Brand one Artifact identity.
 * @param value - raw identity text.
 * @returns the value as an {@link ArtifactId}.
 */
export function ArtifactId(value: string): ArtifactId {
  return brand<'ArtifactId'>(value)
}

/**
 * Brand one version identity.
 * @param value - raw identity text.
 * @returns the value as a {@link VersionId}.
 */
export function VersionId(value: string): VersionId {
  return brand<'VersionId'>(value)
}
