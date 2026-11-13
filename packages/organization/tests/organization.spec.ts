import { describe, expect, it } from 'vitest'
import {
  BotId,
  DepartmentId,
  OrganizationError,
  OrganizationService,
  RoleId,
  restoreOrganization,
  type Permission,
} from '../src/index'

const CEO = BotId('bot-ceo')
const CTO = BotId('bot-cto')
const COO = BotId('bot-coo')
const ENG_DIR = BotId('bot-eng-dir')
const RESEARCHER = BotId('bot-researcher')

/** Build a small organization used across tests. */
function makeCompany(): {
  org: OrganizationService
  engineering: DepartmentId
  research: DepartmentId
  operations: DepartmentId
} {
  const org = new OrganizationService({ now: () => new Date('2026-01-01T00:00:00.000Z') })
  org.createOrganization({ name: 'Acme AI', description: 'A test organization' })
  const engineering = org.createDepartment({ name: 'Engineering' }).id
  const research = org.createDepartment({ name: 'Research' }).id
  const operations = org.createDepartment({ name: 'Operations' }).id

  org.addMember({
    botId: CEO,
    displayName: 'Ada',
    departmentId: operations,
    roleId: RoleId('ceo'),
  })
  org.addMember(
    {
      botId: CTO,
      displayName: 'Linus',
      departmentId: engineering,
      roleId: RoleId('cto'),
      reportsTo: CEO,
    },
    { actorId: CEO },
  )
  org.addMember(
    {
      botId: COO,
      displayName: 'Grace',
      departmentId: operations,
      roleId: RoleId('coo'),
      reportsTo: CEO,
    },
    { actorId: CEO },
  )
  org.addMember(
    {
      botId: ENG_DIR,
      displayName: 'Margaret',
      departmentId: engineering,
      roleId: RoleId('director'),
      reportsTo: CTO,
    },
    { actorId: CTO },
  )
  org.addMember(
    {
      botId: RESEARCHER,
      displayName: 'Alan',
      departmentId: research,
      roleId: RoleId('researcher'),
      reportsTo: ENG_DIR,
    },
    { actorId: ENG_DIR },
  )
  return { org, engineering, research, operations }
}

describe('organization lifecycle', () => {
  it('creates an organization with built-in roles', () => {
    const org = new OrganizationService()
    const created = org.createOrganization({ name: 'Acme AI' })

    expect(created.name).toBe('Acme AI')
    expect(created.id).toBe('org-acme-ai')
    expect(org.listRoles().length).toBeGreaterThanOrEqual(9)
    expect(org.getRole(RoleId('ceo'))?.rank).toBe(0)
    expect(org.getRole(RoleId('researcher'))?.rank).toBe(4)
  })

  it('rejects a second organization', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    expect(() => org.createOrganization({ name: 'Other' })).toThrowError(
      expect.objectContaining({ code: 'ORG_ALREADY_EXISTS' }),
    )
  })

  it('rejects an empty name', () => {
    const org = new OrganizationService()
    expect(() => org.createOrganization({ name: '   ' })).toThrowError(
      expect.objectContaining({ code: 'ORG_INVALID_ARGUMENT' }),
    )
  })

  it('registers custom roles', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const role = org.registerRole({ name: 'Data Scientist', rank: 4 })
    expect(role.id).toBe('data-scientist')
    expect(role.rank).toBe(4)
    expect(org.getRole(RoleId('data-scientist'))).toBeDefined()
  })

  it('rejects a duplicate role', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    expect(() => org.registerRole({ name: 'Data Scientist', rank: 4 })).not.toThrow()
    expect(() => org.registerRole({ name: 'Data Scientist', rank: 4 })).toThrowError(
      expect.objectContaining({ code: 'ROLE_ALREADY_EXISTS' }),
    )
  })
})

describe('departments', () => {
  it('creates departments with unique identities', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const a = org.createDepartment({ name: 'Engineering' })
    const b = org.createDepartment({ name: 'Engineering' })
    expect(a.id).not.toBe(b.id)
    expect(org.listDepartments()).toHaveLength(2)
  })

  it('supports nested departments', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const parent = org.createDepartment({ name: 'Technology' })
    const child = org.createDepartment({ name: 'AI Lab', parentDepartmentId: parent.id })
    expect(child.parentDepartmentId).toBe(parent.id)
  })

  it('rejects a missing parent', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    expect(() =>
      org.createDepartment({ name: 'Orphan', parentDepartmentId: DepartmentId('dept-missing') }),
    ).toThrowError(expect.objectContaining({ code: 'DEPT_NOT_FOUND' }))
  })

  it('refuses to remove a department that still has members', () => {
    const { org, engineering } = makeCompany()
    expect(() => org.removeDepartment(engineering, { actorId: CEO })).toThrowError(
      expect.objectContaining({ code: 'DEPT_HAS_MEMBERS' }),
    )
  })

  it('refuses to remove a department that still has children', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const parent = org.createDepartment({ name: 'Technology' })
    org.createDepartment({ name: 'AI Lab', parentDepartmentId: parent.id })
    expect(() => org.removeDepartment(parent.id, {})).toThrowError(
      expect.objectContaining({ code: 'DEPT_HAS_CHILDREN' }),
    )
  })

  it('removes an empty department', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const temp = org.createDepartment({ name: 'Temp' })
    org.removeDepartment(temp.id)
    expect(org.getDepartment(temp.id)).toBeUndefined()
  })
})

describe('membership', () => {
  it('designates the first member as CEO', () => {
    const { org } = makeCompany()
    expect(org.organization?.ceoBotId).toBe(CEO)
  })

  it('rejects a duplicate member', () => {
    const { org, engineering } = makeCompany()
    expect(() =>
      org.addMember({
        botId: CEO,
        displayName: 'Ada Again',
        departmentId: engineering,
        roleId: RoleId('ceo'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'MEMBER_ALREADY_EXISTS' }))
  })

  it('rejects a member in a missing department', () => {
    const { org } = makeCompany()
    expect(() =>
      org.addMember({
        botId: BotId('bot-ghost'),
        displayName: 'Ghost',
        departmentId: DepartmentId('dept-nowhere'),
        roleId: RoleId('engineer'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'DEPT_NOT_FOUND' }))
  })

  it('rejects a manager that does not outrank the member', () => {
    const { org, engineering } = makeCompany()
    expect(() =>
      org.addMember(
        {
          botId: BotId('bot-peer'),
          displayName: 'Peer',
          departmentId: engineering,
          roleId: RoleId('engineer'),
          reportsTo: RESEARCHER,
        },
        { actorId: CEO },
      ),
    ).toThrowError(expect.objectContaining({ code: 'MEMBER_INVALID_TRANSITION' }))
  })

  it('transfers a member between departments', () => {
    const { org, research, operations } = makeCompany()
    const moved = org.transferMember(RESEARCHER, operations, { actorId: CEO })
    expect(moved.departmentId).toBe(operations)
    expect(org.getDepartmentMembers(research)).toHaveLength(0)
  })

  it('allows a member to move itself', () => {
    const { org, operations } = makeCompany()
    const moved = org.transferMember(RESEARCHER, operations, { actorId: RESEARCHER })
    expect(moved.departmentId).toBe(operations)
  })

  it('promotes a member to a senior role', () => {
    const { org } = makeCompany()
    const promoted = org.promoteMember(RESEARCHER, RoleId('manager'), { actorId: CEO })
    expect(promoted.rank).toBe(3)
    expect(promoted.roleId).toBe(RoleId('manager'))
  })

  it('refuses a promotion that would outrank the manager', () => {
    const { org } = makeCompany()
    expect(() => org.promoteMember(RESEARCHER, RoleId('cto'), { actorId: CEO })).toThrowError(
      expect.objectContaining({ code: 'MEMBER_INVALID_TRANSITION' }),
    )
  })

  it('refuses an actor promoting someone to its own rank', () => {
    const { org } = makeCompany()
    expect(() => org.promoteMember(RESEARCHER, RoleId('director'), { actorId: ENG_DIR })).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    )
  })

  it('suspends and resumes a member', () => {
    const { org } = makeCompany()
    const suspended = org.suspendMember(RESEARCHER, { actorId: CEO })
    expect(suspended.status).toBe('suspended')
    const resumed = org.resumeMember(RESEARCHER, { actorId: CEO })
    expect(resumed.status).toBe('active')
  })

  it('refuses to remove a member with direct reports', () => {
    const { org } = makeCompany()
    expect(() => org.removeMember(ENG_DIR, { actorId: CEO })).toThrowError(
      expect.objectContaining({ code: 'MEMBER_INVALID_TRANSITION' }),
    )
  })

  it('removes a leaf member', () => {
    const { org } = makeCompany()
    org.removeMember(RESEARCHER, { actorId: CEO })
    expect(org.getMember(RESEARCHER)).toBeUndefined()
    expect(org.listMembers()).toHaveLength(4)
  })
})

describe('reporting line', () => {
  it('walks ancestors from a member to the top', () => {
    const { org } = makeCompany()
    const chain = org.getAncestors(RESEARCHER).map(member => member.botId)
    expect(chain).toEqual([ENG_DIR, CTO, CEO])
  })

  it('collects descendants breadth-first', () => {
    const { org } = makeCompany()
    const below = org.getDescendants(CEO).map(member => member.botId)
    expect(below).toContain(CTO)
    expect(below).toContain(COO)
    expect(below).toContain(ENG_DIR)
    expect(below).toContain(RESEARCHER)
    expect(below).toHaveLength(4)
  })

  it('rejects a self-managed member', () => {
    const { org } = makeCompany()
    expect(() => org.setReportsTo(CTO, CTO, { actorId: CEO })).toThrowError(
      expect.objectContaining({ code: 'MEMBER_REPORTING_CYCLE' }),
    )
  })

  it('rejects reporting to a descendant', () => {
    const { org } = makeCompany()
    expect(() => org.setReportsTo(CTO, RESEARCHER, { actorId: CEO })).toThrowError(
      expect.objectContaining({ code: 'MEMBER_REPORTING_CYCLE' }),
    )
  })

  it('reparents a member', () => {
    const { org } = makeCompany()
    const updated = org.setReportsTo(RESEARCHER, CTO, { actorId: CEO })
    expect(updated.reportsTo).toBe(CTO)
    expect(org.getAncestors(RESEARCHER).map(member => member.botId)).toEqual([CTO, CEO])
  })

  it('detaches a member into a root', () => {
    const { org } = makeCompany()
    const updated = org.setReportsTo(COO, undefined, { actorId: CEO })
    expect(updated.reportsTo).toBeUndefined()
  })

  it('builds a renderable tree', () => {
    const { org } = makeCompany()
    const tree = org.getTree()
    expect(tree).toHaveLength(1)
    const root = tree[0]!
    expect(root.botId).toBe(CEO)
    expect(root.children.map(node => node.botId)).toEqual([CTO, COO])
    const cto = root.children[0]!
    expect(cto.children[0]!.botId).toBe(ENG_DIR)
    expect(cto.children[0]!.children[0]!.botId).toBe(RESEARCHER)
  })

  it('reports organization stats', () => {
    const { org } = makeCompany()
    const stats = org.getStats()
    expect(stats.memberCount).toBe(5)
    expect(stats.activeMemberCount).toBe(5)
    expect(stats.departmentCount).toBe(3)
    expect(stats.depth).toBe(4)
    expect(stats.leafCount).toBe(2)
  })
})

describe('permissions and authority', () => {
  it('derives role default permissions', () => {
    const { org } = makeCompany()
    expect(org.can(CEO, 'org.delete')).toBe(true)
    expect(org.can(CTO, 'org.delete')).toBe(false)
    expect(org.can(RESEARCHER, 'task.claim')).toBe(true)
    expect(org.can(RESEARCHER, 'org.delete')).toBe(false)
  })

  it('applies extra grants and denials', () => {
    const { org } = makeCompany()
    org.setMemberPermissions(RESEARCHER, ['artifact.delete'], ['task.complete'], { actorId: CEO })
    expect(org.can(RESEARCHER, 'artifact.delete')).toBe(true)
    expect(org.can(RESEARCHER, 'task.complete')).toBe(false)
  })

  it('rejects contradictory overrides', () => {
    const { org } = makeCompany()
    expect(() =>
      org.setMemberPermissions(RESEARCHER, ['artifact.delete'], ['artifact.delete'], { actorId: CEO }),
    ).toThrowError(expect.objectContaining({ code: 'ORG_INVALID_ARGUMENT' }))
  })

  it('rejects unknown permissions', () => {
    const { org } = makeCompany()
    expect(() =>
      org.setMemberPermissions(RESEARCHER, ['made.up' as Permission], [], { actorId: CEO }),
    ).toThrowError(expect.objectContaining({ code: 'ORG_INVALID_ARGUMENT' }))
  })

  it('lets a senior member manage a junior one in scope', () => {
    const { org } = makeCompany()
    expect(org.canManage(CEO, RESEARCHER)).toBe(true)
    expect(org.canManage(ENG_DIR, RESEARCHER)).toBe(true)
  })

  it('refuses management across departments when scope is departmental', () => {
    const { org } = makeCompany()
    // COO has organization scope, so it can reach across departments.
    expect(org.canManage(COO, RESEARCHER)).toBe(true)
    // CTO is scoped to the organization in the built-in definition.
    expect(org.canManage(CTO, RESEARCHER)).toBe(true)
  })

  it('refuses management of a peer rank', () => {
    const { org } = makeCompany()
    expect(org.canManage(CTO, COO)).toBe(false)
    expect(org.whyCannotManage(CTO, COO)).toContain('strictly senior')
  })

  it('refuses self management', () => {
    const { org } = makeCompany()
    expect(org.canManage(CEO, CEO)).toBe(false)
    expect(org.whyCannotManage(CEO, CEO)).toContain('itself')
  })

  it('refuses a contributor managing anyone', () => {
    const { org } = makeCompany()
    expect(org.canManage(RESEARCHER, RESEARCHER)).toBe(false)
  })
})

describe('authorization on commands', () => {
  it('rejects a command from a member without the permission', () => {
    const { org, engineering } = makeCompany()
    expect(() => org.createDepartment({ name: 'Shadow' }, { actorId: RESEARCHER })).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    )
    expect(() => org.transferMember(CEO, engineering, { actorId: RESEARCHER })).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    )
  })

  it('rejects a command from an unknown actor', () => {
    const { org } = makeCompany()
    expect(() =>
      org.createDepartment({ name: 'Shadow' }, { actorId: BotId('bot-unknown') }),
    ).toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('allows a permitted actor', () => {
    const { org } = makeCompany()
    const dept = org.createDepartment({ name: 'Marketing' }, { actorId: COO })
    expect(dept.name).toBe('Marketing')
  })
})

describe('event sourcing', () => {
  it('records one event per command', () => {
    const org = new OrganizationService()
    org.createOrganization({ name: 'Acme AI' })
    const before = org.events().length
    org.createDepartment({ name: 'Engineering' })
    expect(org.events().length).toBe(before + 1)
  })

  it('replays a log into an identical projection', () => {
    const { org } = makeCompany()
    const original = org.getTree()
    const restored = restoreOrganization(org.events().map(entry => entry.event))
    expect(restored.getTree()).toEqual(original)
    expect(restored.getStats()).toEqual(org.getStats())
    expect(restored.events().length).toBe(org.events().length)
  })

  it('assigns monotonic sequence numbers', () => {
    const { org } = makeCompany()
    const seqs = org.events().map(entry => entry.seq)
    expect(seqs).toEqual(seqs.map((_, index) => index + 1))
  })

  it('marks removed members without dropping their record', () => {
    const { org } = makeCompany()
    org.removeMember(RESEARCHER, { actorId: CEO })
    const raw = org.getState().members.get(RESEARCHER)
    expect(raw?.status).toBe('removed')
  })
})

describe('error codes', () => {
  it('exposes a stable code on every rejection', () => {
    const org = new OrganizationService()
    try {
      org.createDepartment({ name: 'Too Early' })
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(OrganizationError)
      expect((error as OrganizationError).code).toBe('ORG_NOT_FOUND')
    }
  })
})
