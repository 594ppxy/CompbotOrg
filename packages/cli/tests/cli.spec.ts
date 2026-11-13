/**
 * CLI tests: argument parsing, init, inspection commands and goal runs.
 *
 * @module @compbotorg/cli/tests
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseArgs, runCli } from '../src/index'

const directories: string[] = []

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'compbotorg-cli-'))
  directories.push(dir)
  return join(dir, 'nested', 'company.json')
}

afterEach(() => {
  while (directories.length > 0) {
    const dir = directories.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseArgs', () => {
  it('collects repeatable flags and positional words', () => {
    const parsed = parseArgs([
      'goal',
      'run',
      'Research',
      'pricing',
      '--subtask',
      'Collect',
      '--subtask',
      'Write',
      '--file',
      'state.json',
    ])
    expect(parsed.command).toBe('goal')
    expect(parsed.positional).toEqual(['run', 'Research', 'pricing'])
    expect(parsed.flags.subtask).toEqual(['Collect', 'Write'])
    expect(parsed.flags.file).toBe('state.json')
  })

  it('treats a bare flag as a boolean string', () => {
    expect(parseArgs(['stats', '--pretty']).flags.pretty).toBe('true')
  })
})

describe('runCli', () => {
  it('prints help without touching the filesystem', async () => {
    const output = await runCli(['help'])
    expect(output).toContain('CompbotOrg CLI')
    expect(output).toContain('cli init')
  })

  it('asks for init when no state file exists', async () => {
    const file = tempFile()
    expect(await runCli(['stats', '--file', file])).toContain('Run "cli init" first')
  })

  it('initializes a company and reports its stats', async () => {
    const file = tempFile()
    const init = await runCli(['init', '--name', 'Acme AI', '--file', file])
    expect(init).toContain('Initialized')
    expect(existsSync(file)).toBe(true)
    const stats = await runCli(['stats', '--file', file])
    expect(JSON.parse(stats) as Record<string, unknown>).toMatchObject({
      organization: { memberCount: 3 },
    })
  })

  it('runs a goal with subtasks and persists the result', async () => {
    const file = tempFile()
    await runCli(['init', '--file', file])
    const output = await runCli([
      'goal',
      'run',
      'Research',
      'pricing',
      '--subtask',
      'Collect',
      '--subtask',
      'Write',
      '--file',
      file,
    ])
    const summary = JSON.parse(output) as {
      goal: { status: string }
      tasks: number
      artifacts: number
      policyDecision: string
    }
    expect(summary.goal.status).toBe('completed')
    expect(summary.tasks).toBe(2)
    expect(summary.artifacts).toBe(2)
    expect(summary.policyDecision).toBe('allow')

    const goals = JSON.parse(await runCli(['goals', '--file', file])) as unknown[]
    expect(goals).toHaveLength(1)
    const stats = JSON.parse(await runCli(['stats', '--file', file])) as {
      goal: { completedCount: number }
    }
    expect(stats.goal.completedCount).toBe(1)
  })

  it('exports a snapshot and renders memory as Markdown', async () => {
    const file = tempFile()
    await runCli(['init', '--file', file])
    const exported = JSON.parse(await runCli(['export', '--file', file])) as { version: number }
    expect(exported.version).toBe(1)
    expect(await runCli(['memory', '--file', file])).toContain('## Mission')
  })

  it('rejects unknown commands with help', async () => {
    const file = tempFile()
    await runCli(['init', '--file', file])
    expect(await runCli(['frobnicate', '--file', file])).toContain('Unknown command')
  })
})
