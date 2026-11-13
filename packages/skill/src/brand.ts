/**
 * Branded identity primitives for the skill protocol.
 *
 * Bot identities are owned by `@compbotorg/organization`; this module brands
 * only the identities introduced by the skill domain. Keeping them distinct at
 * compile time prevents a Connector identity from being passed where a Skill
 * identity is expected.
 *
 * @module @compbotorg/skill/brand
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

/** Stable identifier for one registered Skill. */
export type SkillId = Branded<'SkillId'>

/** Stable identifier for one registered Connector. */
export type ConnectorId = Branded<'ConnectorId'>

/**
 * Brand one Skill identity.
 * @param value - raw identity text.
 * @returns the value as a {@link SkillId}.
 */
export function SkillId(value: string): SkillId {
  return brand<'SkillId'>(value)
}

/**
 * Brand one Connector identity.
 * @param value - raw identity text.
 * @returns the value as a {@link ConnectorId}.
 */
export function ConnectorId(value: string): ConnectorId {
  return brand<'ConnectorId'>(value)
}
