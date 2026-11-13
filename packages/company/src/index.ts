/**
 * CompbotOrg — v1.0 product facade.
 *
 * `Company` composes the nine event-sourced domain packages into one
 * autonomous organization and adds JSON persistence. It is the only package
 * that knows how all the pieces fit together; CLI, HTTP API and demos consume
 * this facade rather than wiring services themselves.
 *
 * Typical use:
 *
 * ```ts
 * const company = new Company()
 * company.bootstrap()
 * const result = await company.runGoal({ title: 'Research competitor pricing' })
 * saveCompany(company, 'data/company.json')
 * ```
 *
 * @module @compbotorg/company/index
 */

export { Company, COMPANY_BOTS } from './company'

export { CompanyError, type CompanyErrorCode } from './errors'

export type {
  BootstrapInput,
  CompanyLogs,
  CompanyMembers,
  CompanyOptions,
  CompanySnapshot,
  CompanyStats,
  GoalRunResult,
  RunGoalInput,
} from './types'

export {
  companyFromJson,
  companyToJson,
  loadCompany,
  saveCompany,
} from './persistence'
