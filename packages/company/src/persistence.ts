/**
 * JSON file persistence for the Company facade.
 *
 * The snapshot is intentionally dumb: it stores the nine event logs verbatim.
 * All invariants stay in the domain services, so a file can be copied between
 * hosts and replayed by `Company.fromSnapshot` without any schema migration in
 * the domain layer.
 *
 * @module @compbotorg/company/persistence
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Company } from './company'
import { CompanyError } from './errors'
import type { CompanyOptions, CompanySnapshot } from './types'

const LOG_KEYS = [
  'organization',
  'task',
  'runtime',
  'artifact',
  'memory',
  'skill',
  'policy',
  'registry',
  'goal',
] as const

/** Validate the shape of an untrusted parsed snapshot. */
function isSnapshot(value: unknown): value is CompanySnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { version?: unknown; savedAt?: unknown; logs?: unknown }
  if (candidate.version !== 1 || typeof candidate.savedAt !== 'string') return false
  if (typeof candidate.logs !== 'object' || candidate.logs === null) return false
  const logs = candidate.logs as Record<string, unknown>
  return LOG_KEYS.every(key => Array.isArray(logs[key]))
}

/**
 * Serialize a Company to indented JSON.
 * @param company - company to export.
 * @returns JSON text containing all nine event logs.
 */
export function companyToJson(company: Company): string {
  return `${JSON.stringify(company.toSnapshot(), null, 2)}\n`
}

/**
 * Restore a Company from JSON text.
 * @param json - text produced by {@link companyToJson}.
 * @param options - clock and runtime overrides for the restored services.
 * @returns a Company whose projections match the snapshot.
 * @throws CompanyError `COMPANY_SNAPSHOT_INVALID` for malformed JSON or shape.
 */
export function companyFromJson(json: string, options: CompanyOptions = {}): Company {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch (cause: unknown) {
    throw new CompanyError('company snapshot is not valid JSON', 'COMPANY_SNAPSHOT_INVALID', {
      cause,
    })
  }
  if (!isSnapshot(parsed)) {
    throw new CompanyError('company snapshot has an invalid shape', 'COMPANY_SNAPSHOT_INVALID')
  }
  return Company.fromSnapshot(parsed, options)
}

/**
 * Write a Company to a JSON file, creating parent directories as needed.
 * @param company - company to save.
 * @param path - absolute or relative destination path.
 */
export function saveCompany(company: Company, path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, companyToJson(company), 'utf8')
}

/**
 * Read a Company from a JSON file.
 * @param path - path previously written by {@link saveCompany}.
 * @param options - clock and runtime overrides for the restored services.
 * @returns the restored Company.
 * @throws CompanyError `COMPANY_SNAPSHOT_INVALID` for malformed content.
 */
export function loadCompany(path: string, options: CompanyOptions = {}): Company {
  return companyFromJson(readFileSync(path, 'utf8'), options)
}
