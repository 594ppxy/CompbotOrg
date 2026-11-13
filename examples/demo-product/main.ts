/**
 * Demo: one complete v1.0 product loop.
 *
 * Run with `pnpm demo:product` from the repository root. It drives:
 *
 *   bootstrap -> goal decomposition -> task delegation -> Bot execution
 *   -> artifact archive -> report review -> policy evaluation -> performance
 *   -> goal completion -> JSON persistence -> deterministic replay
 *
 * It also shows a policy denial and prints the aggregated dashboard.
 *
 * @module compbotorg/examples/demo-product
 */

import {
  COMPANY_BOTS,
  Company,
  CompanyError,
  loadCompany,
  saveCompany,
} from '@compbotorg/company'

const STATE_FILE = 'data/company.json'
const FIXED = new Date('2026-05-01T09:00:00.000Z')
const now = (): Date => FIXED

async function main(): Promise<void> {
  console.log('='.repeat(72))
  console.log('CompbotOrg — v1.0 product demo (user states a goal, the org runs)')
  console.log('='.repeat(72))

  const company = new Company({ now, name: 'Acme AI' })
  const members = company.bootstrap()
  console.log(
    `\n[0] Organization "${company.organization.getState().organization?.name ?? 'Acme AI'}"`,
  )
  console.log(`    Reporting line: ${members.ceo} > ${members.director} > ${members.engineer}`)

  // 1. A user gives a goal; the organization does everything else.
  const first = await company.runGoal({
    title: 'Research competitor pricing',
    description: 'Deliver a pricing analysis for the Q3 review',
    subtasks: [{ title: 'Collect public price lists' }, { title: 'Write pricing analysis' }],
  })
  console.log(
    `\n[1] Goal "${first.goal.title}" ${first.goal.status}: ` +
      `${first.tasks.length} tasks, ${first.artifacts.length} artifacts, ` +
      `${first.executions.length} executions, ${first.reports.length} approved reports`,
  )
  console.log(`    Policy verdict: ${first.evaluation.decision} (${first.evaluation.action})`)
  for (const artifact of first.artifacts) {
    console.log(`    Artifact: ${artifact.id} "${artifact.title}" [${artifact.kind}]`)
  }

  // 2. A second goal with an implicit single subtask.
  const second = await company.runGoal({
    title: 'Draft the Q3 launch memo',
    quality: 92,
    timeliness: 88,
  })
  console.log(
    `\n[2] Goal "${second.goal.title}" ${second.goal.status}; ` +
      `average quality ${company.goals.getStats().averageQuality}`,
  )

  // 3. Governance: a denied action stops the loop before any goal is created.
  company.policies.createPolicy({
    name: 'Block data exports',
    action: 'data.export',
    effect: 'deny',
    priority: 99,
    createdBy: COMPANY_BOTS.ceo,
  })
  const goalCountBefore = company.goals.getStats().goalCount
  try {
    await company.runGoal({ title: 'Export customer data', action: 'data.export' })
    console.log('\n[3] ERROR: denied action was accepted')
    process.exitCode = 1
  } catch (error) {
    const code = error instanceof CompanyError ? error.code : 'UNKNOWN'
    console.log(`\n[3] Denied action rejected: ${code} (no new goal was created)`)
    if (company.goals.getStats().goalCount !== goalCountBefore) process.exitCode = 1
  }

  // 4. Persistence: save all nine logs, reload, and compare projections.
  saveCompany(company, STATE_FILE)
  const restored = loadCompany(STATE_FILE, { now })
  const before = JSON.stringify(company.getStats())
  const after = JSON.stringify(restored.getStats())
  console.log(`\n[4] Saved ${company.getEventCount()} events to ${STATE_FILE}`)
  console.log(`    Replay matches: ${before === after}`)
  if (before !== after) process.exitCode = 1

  // 5. Dashboard and a slice of the organization memory.
  console.log('\n[5] Dashboard')
  const stats = company.getStats()
  console.log(
    `    org: ${stats.organization.memberCount} members / ${stats.organization.departmentCount} departments`,
  )
  console.log(
    `    work: ${stats.task.taskCount ?? 0} tasks, ${stats.runtime.executionCount ?? 0} executions, ${stats.artifact.artifactCount} artifacts`,
  )
  console.log(
    `    goals: ${stats.goal.goalCount} total, ${stats.goal.completedCount} completed, avg quality ${stats.goal.averageQuality}`,
  )
  console.log(
    `    ecosystem: ${stats.skill.skillCount} skills, ${stats.registry.listingCount} listings, ` +
      `${stats.policy.policyCount} policies, ${stats.policy.auditCount} audit entries`,
  )
  console.log('\n[6] Organization memory (Markdown)')
  console.log(
    company.memory
      .toMarkdown()
      .split('\n')
      .slice(0, 8)
      .map(line => `    ${line}`)
      .join('\n'),
  )

  console.log('\nProduct loop complete.')
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause)
  console.error(`demo-product failed: ${message}`)
  process.exitCode = 1
})
