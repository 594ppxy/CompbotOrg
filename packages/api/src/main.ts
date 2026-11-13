/**
 * HTTP entry point: `pnpm serve`.
 *
 * Loads `data/company.json` (or bootstraps a fresh company), exposes the REST
 * routes, and persists the snapshot after every successful mutation.
 *
 * @module @compbotorg/api/main
 */

import { existsSync } from 'node:fs'
import { Company, loadCompany, saveCompany } from '@compbotorg/company'
import { createServer } from './server'

const port = Number(process.env.PORT ?? '3000')
const file = process.env.COMPANY_FILE ?? 'data/company.json'
const exists = existsSync(file)

const company = exists ? loadCompany(file) : new Company()
if (!exists) {
  company.bootstrap()
  saveCompany(company, file)
}

const server = createServer(company, { onMutate: () => saveCompany(company, file) })
server.listen(port, () => {
  console.log(`CompbotOrg API listening on http://localhost:${port}`)
  console.log(`State file: ${file}`)
  console.log('Try: GET /health, GET /stats, POST /goals {"title":"..."}')
})
