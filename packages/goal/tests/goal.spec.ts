/**
 * Goal command tests.
 *
 * A fixed clock keeps event timestamps deterministic, so replay comparisons
 * are exact. Every rejection path asserts the stable error code, not text.
 *
 * @module @compbotorg/goal/tests
 */

import { BotId } from '@compbotorg/organization'
import { describe, expect, it } from 'vitest'
import {
  GoalError,
  GoalId,
  GoalService,
  MemoryGoalStore,
  restoreGoal,
} from '../src/index'

const CEO = BotId('ceo')
const COO = BotId('coo')
const RESEARCHER = BotId('researcher')
const FIXED = new Date('2026-03-01T00:00:00.000Z')
const now = (): Date => FIXED

function newService(): GoalService {
  return new GoalService({ now })
}

function create(svc: GoalService) {
  return svc.createGoal({
    title: 'Research competitor pricing',
    description: 'Deliver a pricing report',
    createdBy: CEO,
    ownerId: COO,
  })
}

/** Return the stable error code thrown by a command, or `none`. */
function codeOf(run: () => unknown): string {
  try {
    run()
    return 'none'
  } catch (error) {
    return error instanceof GoalError ? error.code : `unexpected:${String(error)}`
  }
}

describe('goal creation', () => {
  it('creates a draft goal', () => {
    const svc = newService()
    const goal = create(svc)
    expect(goal.id).toBe('goal-1')
    expect(goal.status).toBe('draft')
    expect(goal.description).toBe('Deliver a pricing report')
    expect(goal.subtasks).toEqual([])
    expect(goal.taskIds).toEqual([])
    expect(goal.metrics).toEqual([])
    expect(goal.createdAt).toBe(FIXED.toISOString())
  })

  it('rejects an empty title', () => {
    const svc = newService()
    expect(
      codeOf(() =>
        svc.createGoal({ title: ' ', createdBy: CEO, ownerId: COO }),
      ),
    ).toBe('GOAL_INVALID_ARGUMENT')
    expect(svc.events()).toHaveLength(0)
  })

  it('fails commands on an unknown goal', () => {
    const svc = newService()
    expect(
      codeOf(() => svc.decompose(GoalId('missing'), { subtasks: [], decomposedBy: COO })),
    ).toBe('GOAL_NOT_FOUND')
  })
})

describe('decomposition and linking', () => {
  it('decomposes into subtasks and starts the goal', () => {
    const svc = newService()
    const goal = create(svc)
    const updated = svc.decompose(goal.id, {
      subtasks: [{ title: 'Collect prices', assigneeHint: 'research' }, { title: 'Write report' }],
      decomposedBy: COO,
    })
    expect(updated.status).toBe('in_progress')
    expect(updated.subtasks).toHaveLength(2)
    expect(updated.subtasks[0]?.assigneeHint).toBe('research')
    expect(svc.getStats().subtaskCount).toBe(2)
    expect(svc.getStats().inProgressCount).toBe(1)
  })

  it('rejects an empty subtask list and an empty subtask title', () => {
    const svc = newService()
    const goal = create(svc)
    expect(codeOf(() => svc.decompose(goal.id, { subtasks: [], decomposedBy: COO }))).toBe(
      'GOAL_NO_SUBTASKS',
    )
    expect(
      codeOf(() => svc.decompose(goal.id, { subtasks: [{ title: '  ' }], decomposedBy: COO })),
    ).toBe('GOAL_INVALID_ARGUMENT')
    expect(svc.getGoal(goal.id)?.status).toBe('draft')
  })

  it('links tasks, optionally onto one subtask', () => {
    const svc = newService()
    const goal = create(svc)
    svc.decompose(goal.id, {
      subtasks: [{ title: 'Collect prices' }, { title: 'Write report' }],
      decomposedBy: COO,
    })
    svc.linkTask(goal.id, { taskId: 'task-1', subtaskIndex: 0, linkedBy: COO })
    svc.linkTask(goal.id, { taskId: 'task-2', linkedBy: COO })
    const linked = svc.getGoal(goal.id)
    expect(linked?.taskIds).toEqual(['task-1', 'task-2'])
    expect(linked?.subtasks[0]?.taskId).toBe('task-1')
    expect(linked?.subtasks[1]?.taskId).toBeUndefined()
    expect(svc.getStats().linkedTaskCount).toBe(2)
  })

  it('deduplicates task ids and rejects a bad subtask index', () => {
    const svc = newService()
    const goal = create(svc)
    svc.decompose(goal.id, { subtasks: [{ title: 'Work' }], decomposedBy: COO })
    svc.linkTask(goal.id, { taskId: 'task-1', linkedBy: COO })
    svc.linkTask(goal.id, { taskId: 'task-1', linkedBy: COO })
    expect(svc.getGoal(goal.id)?.taskIds).toEqual(['task-1'])
    expect(
      codeOf(() => svc.linkTask(goal.id, { taskId: 'task-2', subtaskIndex: 9, linkedBy: COO })),
    ).toBe('GOAL_INVALID_ARGUMENT')
    expect(codeOf(() => svc.linkTask(goal.id, { taskId: ' ', linkedBy: COO }))).toBe(
      'GOAL_INVALID_ARGUMENT',
    )
  })
})

describe('metrics, completion and cancellation', () => {
  it('validates metric ranges and computes a two-decimal average', () => {
    const svc = newService()
    const goal = create(svc)
    expect(
      codeOf(() =>
        svc.recordMetric(goal.id, { botId: RESEARCHER, quality: 101, timeliness: 50, recordedBy: COO }),
      ),
    ).toBe('GOAL_INVALID_ARGUMENT')
    expect(
      codeOf(() =>
        svc.recordMetric(goal.id, { botId: RESEARCHER, quality: 50, timeliness: -1, recordedBy: COO }),
      ),
    ).toBe('GOAL_INVALID_ARGUMENT')
    svc.recordMetric(goal.id, { botId: RESEARCHER, quality: 90, timeliness: 95, recordedBy: COO })
    svc.recordMetric(goal.id, { botId: COO, quality: 80, timeliness: 70, recordedBy: CEO })
    const measured = svc.getGoal(goal.id)
    expect(measured?.metrics).toHaveLength(2)
    expect(measured?.metrics[0]?.recordedAt).toBe(FIXED.toISOString())
    expect(svc.getStats().averageQuality).toBe(85)
  })

  it('rounds the global average to two decimals', () => {
    const svc = newService()
    const goal = create(svc)
    svc.recordMetric(goal.id, { botId: RESEARCHER, quality: 90, timeliness: 90, recordedBy: COO })
    svc.recordMetric(goal.id, { botId: COO, quality: 95, timeliness: 90, recordedBy: COO })
    svc.recordMetric(goal.id, { botId: CEO, quality: 80, timeliness: 90, recordedBy: COO })
    expect(svc.getStats().averageQuality).toBe(88.33)
  })

  it('completes only an in-progress goal', () => {
    const svc = newService()
    const goal = create(svc)
    expect(codeOf(() => svc.completeGoal(goal.id, { completedBy: CEO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
    svc.decompose(goal.id, { subtasks: [{ title: 'Work' }], decomposedBy: COO })
    const done = svc.completeGoal(goal.id, { completedBy: CEO, summary: 'Report delivered' })
    expect(done.status).toBe('completed')
    expect(done.summary).toBe('Report delivered')
    expect(svc.getStats().completedCount).toBe(1)
    expect(codeOf(() => svc.completeGoal(goal.id, { completedBy: CEO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
    expect(codeOf(() => svc.decompose(goal.id, { subtasks: [{ title: 'x' }], decomposedBy: COO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
    expect(codeOf(() => svc.linkTask(goal.id, { taskId: 'task-9', linkedBy: COO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
  })

  it('cancels a goal and blocks further changes', () => {
    const svc = newService()
    const goal = create(svc)
    expect(svc.cancelGoal(goal.id, { cancelledBy: CEO }).status).toBe('cancelled')
    expect(codeOf(() => svc.cancelGoal(goal.id, { cancelledBy: CEO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
    expect(codeOf(() => svc.completeGoal(goal.id, { completedBy: CEO }))).toBe(
      'GOAL_INVALID_TRANSITION',
    )
  })
})

describe('event sourcing', () => {
  it('replays a full log into an identical projection', () => {
    const svc = newService()
    const goal = create(svc)
    svc.decompose(goal.id, { subtasks: [{ title: 'Work' }], decomposedBy: COO })
    svc.linkTask(goal.id, { taskId: 'task-1', subtaskIndex: 0, linkedBy: COO })
    svc.recordMetric(goal.id, { botId: RESEARCHER, quality: 88, timeliness: 91, recordedBy: COO })
    svc.completeGoal(goal.id, { completedBy: CEO, summary: 'done' })
    const restored = restoreGoal(
      svc.events().map(entry => entry.event),
      { now },
    )
    expect(restored.getStats()).toEqual(svc.getStats())
    expect(restored.listGoals()).toEqual(svc.listGoals())
    expect(restored.getGoal(goal.id)).toEqual(svc.getGoal(goal.id))
    expect(restored.events()).toEqual(svc.events())
  })

  it('folds an injected store and notifies onCommit once per event', () => {
    const store = new MemoryGoalStore()
    const seen: number[] = []
    const svc = new GoalService({ now, store, onCommit: entry => seen.push(entry.seq) })
    const goal = create(svc)
    svc.decompose(goal.id, { subtasks: [{ title: 'Work' }], decomposedBy: COO })
    expect(store.size).toBe(2)
    expect(seen).toEqual([1, 2])
    expect(store.readSince(1)).toHaveLength(1)
  })
})
