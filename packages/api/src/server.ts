/**
 * Zero-dependency HTTP layer for the Company facade.
 *
 * The router is a pure async function (`dispatch`) so it can be unit tested
 * without opening a socket, and so the same routes can later be mounted on a
 * different host. Only `createServer` touches Node's `http` module.
 *
 * @module @compbotorg/api/server
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer as createHttpServer } from 'node:http'
import type { Company } from '@compbotorg/company'

/** One transport-independent request. */
export interface ApiRequest {
  readonly method: string
  readonly path: string
  readonly body?: unknown
}

/** One transport-independent response. */
export interface ApiResponse {
  readonly status: number
  readonly body: unknown
}

/** Options for {@link createServer}. */
export interface ApiServerOptions {
  /** Called after a request that may have mutated the company. */
  readonly onMutate?: () => void
  /** Maximum request body size in bytes; defaults to 1 MiB. */
  readonly maxBodyBytes?: number
}

const MAX_BODY_BYTES = 1024 * 1024

/** Extract the title and optional subtasks from an untrusted POST body. */
function parseGoalBody(body: unknown): { title: string; description?: string; subtasks?: { title: string }[] } | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const candidate = body as Record<string, unknown>
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') return undefined
  const description =
    typeof candidate.description === 'string' ? candidate.description : undefined
  let subtasks: { title: string }[] | undefined
  if (candidate.subtasks !== undefined) {
    if (!Array.isArray(candidate.subtasks)) return undefined
    const parsed: { title: string }[] = []
    for (const item of candidate.subtasks) {
      if (typeof item !== 'object' || item === null) return undefined
      const title = (item as Record<string, unknown>).title
      if (typeof title !== 'string' || title.trim() === '') return undefined
      parsed.push({ title })
    }
    subtasks = parsed
  }
  return {
    title: candidate.title,
    ...(description === undefined ? {} : { description }),
    ...(subtasks === undefined ? {} : { subtasks }),
  }
}

/**
 * Route one request against a Company.
 *
 * Supported endpoints:
 *
 * | Method | Path | Meaning |
 * |--------|------|---------|
 * | GET | `/health` | liveness |
 * | GET | `/stats` | aggregated dashboard |
 * | GET | `/state` | full JSON snapshot |
 * | GET | `/organization/members`, `/organization/departments`, `/organization/tree` | org views |
 * | GET | `/tasks`, `/reports`, `/artifacts`, `/executions` | protocol + runtime views |
 * | GET | `/skills`, `/connectors`, `/policies`, `/evaluations`, `/audit`, `/listings`, `/goals`, `/memory` | domain views |
 * | POST | `/goals` | run one goal end to end |
 *
 * @param company - company to serve.
 * @param request - method, path and parsed JSON body.
 * @returns a status code and a JSON-serializable body.
 */
export async function dispatch(company: Company, request: ApiRequest): Promise<ApiResponse> {
  const method = request.method.toUpperCase()
  const path = new URL(request.path, 'http://localhost').pathname.replace(/\/$/, '') || '/'

  if (method === 'GET') {
    switch (path) {
      case '/health':
        return { status: 200, body: { status: 'ok', product: 'CompbotOrg', version: '1.0.0' } }
      case '/stats':
        return { status: 200, body: company.getStats() }
      case '/state':
        return { status: 200, body: company.toSnapshot() }
      case '/organization/members':
        return { status: 200, body: company.organization.listMembers() }
      case '/organization/departments':
        return { status: 200, body: company.organization.listDepartments() }
      case '/organization/tree':
        return { status: 200, body: company.organization.getTree() }
      case '/tasks':
        return { status: 200, body: company.tasks.listTasks() }
      case '/reports':
        return { status: 200, body: company.tasks.listReports() }
      case '/artifacts':
        return { status: 200, body: company.artifacts.listArtifacts() }
      case '/executions':
        return { status: 200, body: company.executions.listExecutions() }
      case '/skills':
        return { status: 200, body: company.skills.listSkills() }
      case '/connectors':
        return { status: 200, body: company.skills.listConnectors() }
      case '/policies':
        return { status: 200, body: company.policies.listPolicies() }
      case '/evaluations':
        return { status: 200, body: company.policies.getEvaluations() }
      case '/audit':
        return { status: 200, body: company.policies.getAuditLog() }
      case '/listings':
        return { status: 200, body: company.registry.listListings() }
      case '/goals':
        return { status: 200, body: company.goals.listGoals() }
      case '/memory':
        return { status: 200, body: { markdown: company.memory.toMarkdown() } }
      default:
        return { status: 404, body: { error: 'NOT_FOUND', path } }
    }
  }

  if (method === 'POST' && path === '/goals') {
    const input = parseGoalBody(request.body)
    if (input === undefined) {
      return {
        status: 400,
        body: { error: 'INVALID_ARGUMENT', message: 'title (non-empty string) is required; subtasks must be an array of { title }' },
      }
    }
    const result = await company.runGoal(input)
    return { status: 201, body: result }
  }

  return { status: 405, body: { error: 'METHOD_NOT_ALLOWED', method, path } }
}

/** Read a bounded JSON request body. */
async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return undefined
  return JSON.parse(text) as unknown
}

/** Write one JSON response. */
function writeJson(res: ServerResponse, response: ApiResponse): void {
  const payload = JSON.stringify(response.body)
  res.writeHead(response.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * Create an HTTP server for one Company.
 * @param company - company to serve.
 * @param options - mutation hook and body size limit.
 * @returns an unstarted Node HTTP server.
 */
export function createServer(company: Company, options: ApiServerOptions = {}): Server {
  const maxBytes = options.maxBodyBytes ?? MAX_BODY_BYTES
  return createHttpServer((req, res) => {
    void (async () => {
      try {
        const body = req.method === 'POST' || req.method === 'PUT'
          ? await readBody(req, maxBytes)
          : undefined
        const response = await dispatch(company, {
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          ...(body === undefined ? {} : { body }),
        })
        if (req.method === 'POST' && response.status < 400) options.onMutate?.()
        writeJson(res, response)
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause)
        writeJson(res, { status: 400, body: { error: 'BAD_REQUEST', message } })
      }
    })()
  })
}
