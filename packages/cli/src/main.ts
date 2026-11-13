/**
 * CLI entry point: `pnpm cli -- <command>`.
 *
 * @module @compbotorg/cli/main
 */

import { runCli } from './cli'

runCli(process.argv.slice(2))
  .then(text => {
    process.stdout.write(text)
  })
  .catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    process.stderr.write(`compbotorg: ${message}\n`)
    process.exitCode = 1
  })
