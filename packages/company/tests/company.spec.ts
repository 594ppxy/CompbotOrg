/**
 * Company facade tests: bootstrap, autonomous goal loop, policy gating and
 * JSON persistence round-trips.
 *
 * @module @compbotorg/company/tests
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPANY_BOTS,
  Company,
  CompanyError,
  companyFromJson,
  companyToJson,
  loadCompany,
  saveCompany,
  type CompanySnapshot,
} from '../src/index'

const FIXED = new Date('2026-04-01T09:00:00.000Z')
const now = (): Date => FIXED

function newCompany(): Company {
  return new Company({ now, name: 'Acme AI' })
}

/** Return the stable error code thrown by a command, or `none`. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'none'
  } catch (error) {
    return error instanceof CompanyError ? error.code : `unexpected:${String(error)}`
  }
}

describe('bootstrap', () => {
  it('creates the reporting line and seeds every domain service', () => {
    const company = newCompany()
    const members = company.bootstrap()
    expect(members.ceo).toBe(COMPANY_BOTS.ceo)
    expect(company.organization.getStats().memberCount).toBe(3)
    expect(company.organization.getStats().departmentCount).toBe(2)
    expect(company.skills.getStats().installedCount).toBe(1)
    expect(company.registry.getStats().publishedCount).toBe(1)
    expect(company.registry.getStats().ratingCount).toBe(1)
    expect(company.policies.getStats().policyCount).toBe(2)
    expect(company.memory.getStats().entryCount).toBe(1)
    expect(company.getEventCount()).toBeGreaterThan(10)
  })

  it('is idempotent', () => {
    const company = newCompany()
    company.bootstrap()
    const before = company.getEventCount()
    expect(company.bootstrap().ceo).toBe(COMPANY_BOTS.ceo)
    expect(company.getEventCount()).toBe(before)
  })

  it('exposes all nine stat blocks', () => {
    const company = newCompany()
    const stats = company.getStats()
    expect(Object.keys(stats)).toEqual([
      'organization',
      'task',
      'runtime',
      'artifact',
      'memory',
      'skill',
      'policy',
      'registry',
      'goal',
      'eventCount',
    ])
    expect(stats.eventCount).toBe(0)
  })
})

describe('autonomous goal loop', () => {
  it('runs a goal end to end', async () => {
    const company = newCompany()
    const result = await company.runGoal({
      title: 'Research competitor pricing',
      description: 'Deliver a pricing report',
      subtasks: [{ title: 'Collect prices' }, { title: 'Write report' }],
    })
    expect(result.goal.status).toBe('completed')
    expect(result.goal.subtasks).toHaveLength(2)
    expect(result.goal.taskIds).toHaveLength(2)
    expect(result.goal.metrics).toHaveLength(2)
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks.every(task => task.status === 'completed')).toBe(true)
    expect(result.reports).toHaveLength(2)
    expect(result.reports.every(report => report.status === 'approved')).toBe(true)
    expect(result.artifacts).toHaveLength(2)
    expect(result.executions.every(execution => execution.status === 'succeeded')).toBe(true)
    expect(result.evaluation.decision).toBe('allow')
    expect(result.evaluation.matchedPolicyId).toBeDefined()
    expect(result.audit.outcome).toBe('allowed')
    expect(company.goals.getStats().completedCount).toBe(1)
    expect(company.memory.getStats().entryCount).toBe(2)
    expect(company.policies.getStats().auditCount).toBe(1)
  })

  it('rejects an empty title and an empty subtask list', async () => {
    const company = newCompany()
    await expect(company.runGoal({ title: ' ' })).rejects.toMatchObject({
      code: 'COMPANY_INVALID_ARGUMENT',
    })
    await expect(company.runGoal({ title: 'x', subtasks: [] })).rejects.toMatchObject({
      code: 'COMPANY_INVALID_ARGUMENT',
    })
  })

  it('refuses to run an action denied by policy', async () => {
    const company = newCompany()
    company.bootstrap()
    company.policies.createPolicy({
      name: 'No dangerous actions',
      action: 'dangerous.*',
      effect: 'deny',
      priority: 50,
      createdBy: COMPANY_BOTS.ceo,
    })
    const before = company.goals.getStats().goalCount
    await expect(
      company.runGoal({ title: 'x', action: 'dangerous.deploy' }),
    ).rejects.toMatchObject({ code: 'COMPANY_ACTION_DENIED' })
    expect(company.goals.getStats().goalCount).toBe(before)
  })
})

describe('persistence', () => {
  it('round-trips a snapshot and keeps running afterwards', async () => {
    const company = newCompany()
    await company.runGoal({ title: 'First goal' })
    const snapshot: CompanySnapshot = JSON.parse(
      JSON.stringify(company.toSnapshot()),
    ) as CompanySnapshot
    const restored = Company.fromSnapshot(snapshot, { now })
    expect(restored.getStats()).toEqual(company.getStats())
    expect(restored.getEventCount()).toBe(company.getEventCount())
    expect(restored.goals.listGoals()).toEqual(company.goals.listGoals())
    expect(restored.tasks.events().length).toBe(company.tasks.events().length)

    const second = await restored.runGoal({ title: 'Second goal' })
    expect(second.goal.status).toBe('completed')
    expect(restored.goals.getStats().goalCount).toBe(2)
  })

  it('writes and reloads a JSON file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'compbotorg-'))
    const file = join(dir, 'state', 'company.json')
    try {
      const company = newCompany()
      await company.runGoal({ title: 'Persisted goal' })
      saveCompany(company, file)
      const restored = loadCompany(file, { now })
      expect(restored.getStats()).toEqual(company.getStats())
      expect(companyToJson(restored)).toBe(companyToJson(company))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects malformed JSON and invalid snapshot shapes', () => {
    expect(codeOf(() => companyFromJson('{not json'))).toBe('COMPANY_SNAPSHOT_INVALID')
    expect(codeOf(() => companyFromJson('{"version":1}'))).toBe('COMPANY_SNAPSHOT_INVALID')
    expect(
      codeOf(() =>
        companyFromJson(
          JSON.stringify({
            version: 1,
            savedAt: FIXED.toISOString(),
            logs: { organization: [] },
          }),
        ),
      ),
    ).toBe('COMPANY_SNAPSHOT_INVALID')
  })
})
