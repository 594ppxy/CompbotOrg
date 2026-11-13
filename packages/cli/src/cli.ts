/**
 * Zero-dependency command line interface for the Company facade.
 *
 * The CLI is a thin adapter: every command loads the JSON snapshot, calls one
 * facade method, prints the result, and saves after mutations. `runCli`
 * returns text instead of writing to stdout, which keeps it directly testable.
 *
 * @module @compbotorg/cli/cli
 */

import { existsSync } from 'node:fs'
import {
  Company,
  companyToJson,
  loadCompany,
  saveCompany,
} from '@compbotorg/company'

/** Parsed command line: command, positional words, and repeatable flags. */
export interface ParsedArgs {
  readonly command: string
  readonly positional: readonly string[]
  readonly flags: Readonly<Record<string, string | readonly string[]>>
}

/** Options for {@link runCli}. */
export interface CliOptions {
  /** Default state file, overridden by `--file`. */
  readonly file?: string
}

const HELP = `CompbotOrg CLI (v1.0)

Usage:
  cli help
  cli init [--name "Acme AI"] [--file data/company.json]
  cli stats|members|departments|tasks|reports|artifacts|executions
  cli skills|policies|listings|goals|audit|memory [--file ...]
  cli export [--file ...]
  cli goal run "<title>" [--subtask "A"] [--subtask "B"] [--file ...]

State is a plain JSON snapshot of the nine event logs. Run "cli init" first.
`

/**
 * Parse an argv array into a command, positional words and flags.
 * A flag can repeat (e.g. `--subtask A --subtask B`).
 * @param argv - arguments excluding node and script path.
 * @returns the parsed command line.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0] ?? 'help'
  const positional: string[] = []
  const flags: Record<string, string | readonly string[]> = {}
  let index = 1
  while (index < argv.length) {
    const token = argv[index]
    if (token === undefined) break
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[index + 1]
      if (next !== undefined && !next.startsWith('--')) {
        const existing = flags[key]
        if (existing === undefined) flags[key] = next
        else if (typeof existing === 'string') flags[key] = [existing, next]
        else flags[key] = [...existing, next]
        index += 2
      } else {
        flags[key] = 'true'
        index += 1
      }
    } else {
      positional.push(token)
      index += 1
    }
  }
  return { command, positional, flags }
}

/** Read one single-valued flag. */
function flagOf(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.flags[key]
  return typeof value === 'string' ? value : undefined
}

/** Read one repeatable flag as a list. */
function flagsOf(parsed: ParsedArgs, key: string): readonly string[] {
  const value = parsed.flags[key]
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : value
}

/** Pretty-print any JSON-serializable value. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Run one CLI command.
 * @param argv - arguments excluding node and script path.
 * @param options - default state file.
 * @returns text to print on stdout.
 * @throws Error for domain failures (empty goal title, bad snapshot, ...).
 */
export async function runCli(argv: readonly string[], options: CliOptions = {}): Promise<string> {
  const parsed = parseArgs(argv)
  const file = flagOf(parsed, 'file') ?? options.file ?? 'data/company.json'

  if (parsed.command === 'help') return HELP
  if (parsed.command === 'init') {
    const name = flagOf(parsed, 'name')
    const company = new Company(name === undefined ? {} : { name })
    company.bootstrap()
    saveCompany(company, file)
    return `Initialized "${file}"\n${json(company.getStats())}`
  }

  if (!existsSync(file)) {
    return `No company found at "${file}". Run "cli init" first.\n`
  }
  const company = loadCompany(file)
  const subcommand = parsed.positional[0]

  switch (parsed.command) {
    case 'stats':
      return json(company.getStats())
    case 'members':
      return json(company.organization.listMembers())
    case 'departments':
      return json(company.organization.listDepartments())
    case 'tasks':
      return json(company.tasks.listTasks())
    case 'reports':
      return json(company.tasks.listReports())
    case 'artifacts':
      return json(company.artifacts.listArtifacts())
    case 'executions':
      return json(company.executions.listExecutions())
    case 'skills':
      return json(company.skills.listSkills())
    case 'policies':
      return json(company.policies.listPolicies())
    case 'listings':
      return json(company.registry.listListings())
    case 'goals':
      return json(company.goals.listGoals())
    case 'audit':
      return json(company.policies.getAuditLog())
    case 'memory':
      return `${company.memory.toMarkdown()}\n`
    case 'export':
      return companyToJson(company)
    case 'goal': {
      if (subcommand !== 'run') return `Unknown goal subcommand "${subcommand ?? ''}".\n${HELP}`
      const title = parsed.positional.slice(1).join(' ').trim()
      if (title === '') return 'Usage: cli goal run "<title>" [--subtask "A"]\n'
      const subtasks = flagsOf(parsed, 'subtask').map(item => ({ title: item }))
      const result = await company.runGoal({
        title,
        ...(subtasks.length === 0 ? {} : { subtasks }),
      })
      saveCompany(company, file)
      return json({
        goal: result.goal,
        tasks: result.tasks.length,
        reports: result.reports.length,
        artifacts: result.artifacts.length,
        executions: result.executions.length,
        policyDecision: result.evaluation.decision,
      })
    }
    default:
      return `Unknown command "${parsed.command}".\n${HELP}`
  }
}
