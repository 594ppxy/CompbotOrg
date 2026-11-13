/**
 * Branded identity primitives.
 *
 * Every entity identity is a plain string at runtime but a distinct type at
 * compile time, so an Organization identity can never be passed where a
 * Department identity is expected.
 *
 * @module @compbotorg/organization/brand
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

/** Stable identifier for one Organization. */
export type OrganizationId = Branded<'OrganizationId'>

/** Stable identifier for one Department inside an Organization. */
export type DepartmentId = Branded<'DepartmentId'>

/** Stable identifier for one Bot (a PersonaBot identity owned by the Host). */
export type BotId = Branded<'BotId'>

/** Stable identifier for one Role definition. */
export type RoleId = Branded<'RoleId'>

/** Stable identifier for one audit record. */
export type AuditId = Branded<'AuditId'>

/**
 * Brand one Organization identity.
 * @param value - raw identity text.
 * @returns the value as an {@link OrganizationId}.
 */
export function OrganizationId(value: string): OrganizationId {
  return brand<'OrganizationId'>(value)
}

/**
 * Brand one Department identity.
 * @param value - raw identity text.
 * @returns the value as a {@link DepartmentId}.
 */
export function DepartmentId(value: string): DepartmentId {
  return brand<'DepartmentId'>(value)
}

/**
 * Brand one Bot identity.
 * @param value - raw identity text.
 * @returns the value as a {@link BotId}.
 */
export function BotId(value: string): BotId {
  return brand<'BotId'>(value)
}

/**
 * Brand one Role identity.
 * @param value - raw identity text.
 * @returns the value as a {@link RoleId}.
 */
export function RoleId(value: string): RoleId {
  return brand<'RoleId'>(value)
}
