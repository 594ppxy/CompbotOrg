/**
 * HTTP API tests: transport-independent routing plus one real socket check.
 *
 * @module @compbotorg/api/tests
 */

import { Company } from '@compbotorg/company'
import { describe, expect, it } from 'vitest'
import { createServer, dispatch } from '../src/index'

const FIXED = new Date('2026-06-01T00:00:00.000Z')
const now = (): Date => FIXED

function newCompany(): Company {
  return new Company({ now })
}

describe('dispatch', () => {
  it('answers liveness and dashboard requests', async () => {
    const company = newCompany()
    expect((await dispatch(company, { method: 'GET', path: '/health' })).body).toMatchObject({
      status: 'ok',
      version: '1.0.0',
    })
    const stats = await dispatch(company, { method: 'GET', path: '/stats' })
    expect(stats.status).toBe(200)
    expect(stats.body).toMatchObject({ eventCount: 0 })
  })

  it('exposes every domain view after bootstrap', async () => {
    const company = newCompany()
    company.bootstrap()
    const paths = [
      '/organization/members',
      '/organization/departments',
      '/organization/tree',
      '/tasks',
      '/reports',
      '/artifacts',
      '/executions',
      '/skills',
      '/connectors',
      '/policies',
      '/evaluations',
      '/audit',
      '/listings',
      '/goals',
      '/memory',
      '/state',
    ]
    for (const path of paths) {
      const response = await dispatch(company, { method: 'GET', path })
      expect(response.status, path).toBe(200)
      expect(response.body, path).toBeDefined()
    }
    const state = await dispatch(company, { method: 'GET', path: '/state' })
    expect(state.body).toMatchObject({ version: 1 })
  })

  it('runs a goal through POST /goals', async () => {
    const company = newCompany()
    const response = await dispatch(company, {
      method: 'POST',
      path: '/goals',
      body: { title: 'Research pricing', subtasks: [{ title: 'Collect' }, { title: 'Write' }] },
    })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      goal: { status: 'completed' },
    })
    expect(company.goals.getStats().completedCount).toBe(1)
  })

  it('validates the POST body', async () => {
    const company = newCompany()
    expect(
      (await dispatch(company, { method: 'POST', path: '/goals', body: {} })).status,
    ).toBe(400)
    expect(
      (await dispatch(company, { method: 'POST', path: '/goals', body: { title: 'x', subtasks: [1] } }))
        .status,
    ).toBe(400)
    expect(company.goals.getStats().goalCount).toBe(0)
  })

  it('returns 404 / 405 for unknown routes and methods', async () => {
    const company = newCompany()
    expect((await dispatch(company, { method: 'GET', path: '/nope' })).status).toBe(404)
    expect((await dispatch(company, { method: 'DELETE', path: '/stats' })).status).toBe(405)
  })
})

describe('createServer', () => {
  it('serves JSON over a real socket', async () => {
    const company = newCompany()
    const server = createServer(company)
    await new Promise<void>(resolve => server.listen(0, () => resolve()))
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port')
      const response = await fetch(`http://127.0.0.1:${address.port}/health`)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status: 'ok' })
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
