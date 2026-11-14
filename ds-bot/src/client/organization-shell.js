// CompBotOrg shell: the organization navigation in the left column and the
// context inspector on the right. The centre stays DSH's own conversation —
// CEO Chat is not reimplemented here, only framed by the organization.
import { createElement as h, Fragment, useEffect, useMemo, useState } from 'react'
import { BotAvatar } from './mark.js'
import { chatRoom } from './frame-watch.js'
import { OrgSelect } from './org-fields.js'

const text = value => typeof value === 'string' ? value : (value == null ? '' : String(value))
const clean = value => typeof value === 'string' ? value.trim() : ''
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)))

export const INSPECTOR_WIDTH = 272

const STATUS_LABEL = { pending: '待启动', running: '进行中', review: '待验收', blocked: '阻塞', done: '已完成' }
const STATUS_CLASS = { pending: 'pending', running: 'running', review: 'review', blocked: 'blocked', done: 'done' }
const ACTION_LABEL = {
  dispatch: '派发', claim: '接单', running: '执行', review: '提交审核', blocked: '受阻',
  done: '完成', call: '点名', pending: '待启动', step: '执行',
}
const LEVEL_LABEL = { 5: '决策层', 4: '管理层', 3: '主管', 2: '骨干', 1: '执行' }

const LevelTag = ({ level }) => level
  ? h('span', { className: 'cb-lv', title: `L${level} ${LEVEL_LABEL[level] ?? ''}` }, `L${level}`)
  : null

const actionText = (action) => {
  if (!action) return ''
  if (action.text) return text(action.text)
  return `${STATUS_LABEL[action.status] ?? action.status ?? ''} · ${text(action.taskTitle)}`.trim()
}

const timeOf = at => {
  try { return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

const RELATION_LABEL = {
  manages: '管理', reports_to: '汇报给', member_of: '隶属', collaborates: '协作',
  advisor_of: '顾问', project_lead: '负责项目', delegates_to: '委派',
}
const ICON_TABS = [
  { id: 'org', label: '组织', glyph: '♟' },
  { id: 'project', label: '项目', glyph: '▤' },
  { id: 'task', label: '任务', glyph: '◇' },
  { id: 'knowledge', label: '知识', glyph: '▧' },
  { id: 'settings', label: '设置', glyph: '⚙' },
]

function useOrg(useRoster) {
  const roster = useRoster(value => value)
  return { roster, org: roster.organization ?? {} }
}

const Avatar = ({ bot, size = 28 }) => bot
  ? h(BotAvatar, { bot, size, live: false, badge: false })
  : h('span', { className: 'cb-avatar cb-avatar-fallback', style: { width: size, height: size } }, '?')

const Progress = ({ value, tone = 'accent' }) => h('span', { className: `cb-bar cb-bar-${tone}` },
  h('span', { className: 'cb-bar-fill', style: { width: `${pct(value)}%` } }))

function StatusDot({ kind }) { return h('span', { className: `cb-dot cb-dot-${kind}`, 'aria-hidden': true }) }

// -------------------------------------------------------------------------
// Left column: organization navigation.

export function OrganizationNav({ useRoster, actions }) {
  const { roster, org } = useOrg(useRoster)
  const [tab, setTab] = useState('org')
  const [openDepartments, setOpenDepartments] = useState({})
  const [query, setQuery] = useState('')
  const [compose, setCompose] = useState(false)
  const [draft, setDraft] = useState('')
  const [deptDraft, setDeptDraft] = useState(null)
  const [deptBusy, setDeptBusy] = useState(false)
  const [deptError, setDeptError] = useState('')
  const employees = useMemo(() => org.employees ?? [], [org])
  const departments = org.departments ?? []
  const projects = org.projects ?? []
  const tasks = org.tasks ?? []
  const stats = org.stats ?? {}
  const currentActions = org.currentActions ?? {}
  const ceo = roster.byId?.[roster.mainBotId] ?? employees.find(employee => employee.main)
  const ceoEmployee = employees.find(employee => employee.id === roster.mainBotId) ?? employees.find(employee => employee.main)
  const q = clean(query).toLowerCase()
  const matches = item => !q || text(item.name ?? item.title).toLowerCase().includes(q)

  const subject = (kind, id) => actions.setOrgSubject?.({ kind, id })
  const openEmployee = (bot) => {
    if (!bot) return
    subject('employee', bot.id)
    actions.openSession?.(bot.id)
  }
  const statusOfEmployee = (employee) => {
    const own = tasks.filter(task => task.assigneeId === employee.id)
    if (own.some(task => task.status === 'blocked')) return 'blocked'
    if (own.some(task => task.status === 'running')) return 'running'
    if (own.some(task => task.status === 'review')) return 'review'
    return 'idle'
  }
  const grouped = employees.filter(employee => !employee.main)
  const groupCounts = {
    running: grouped.filter(employee => statusOfEmployee(employee) === 'running').length,
    review: grouped.filter(employee => statusOfEmployee(employee) === 'review').length,
    blocked: grouped.filter(employee => statusOfEmployee(employee) === 'blocked').length,
    idle: grouped.filter(employee => statusOfEmployee(employee) === 'idle').length,
  }
  const [filter, setFilter] = useState(null)
  const listed = filter ? grouped.filter(employee => statusOfEmployee(employee) === filter) : []

  const submitTask = () => {
    const title = clean(draft)
    if (!title) return
    const project = projects[0]
    void Promise.resolve(actions.organizationUpdate?.('organization-task', {
      action: 'add', title, ...(project ? { projectId: project.id } : {}),
    })).catch(() => {})
    setDraft('')
    setCompose(false)
  }

  // A department may own sub-departments; children sit under their parent, indented.
  const depthOf = (department) => {
    let depth = 0
    let cursor = department
    for (let guard = 0; guard < 8 && cursor?.parentId; guard += 1) {
      cursor = departments.find(item => item.id === cursor.parentId)
      if (!cursor) break
      depth += 1
    }
    return depth
  }
  const orderedDepartments = [...departments.filter(matches)].sort((a, b) => depthOf(a) - depthOf(b))

  const createDepartment = () => {
    const name = clean(deptDraft?.name)
    if (!name || deptBusy) return
    if (departments.some(item => item.name === name)) { setDeptError('已经有同名部门'); return }
    setDeptBusy(true)
    setDeptError('')
    Promise.resolve(actions.organizationUpdate?.('organization-department', {
      name,
      description: clean(deptDraft?.description) || undefined,
      parentId: deptDraft?.parentId || undefined,
    })).then((view) => {
      const created = (view?.departments ?? []).find(item => item.name === name)
      setDeptDraft(null)
      if (created) subject('department', created.id)
    }).catch(error => setDeptError(error?.message ?? String(error))).finally(() => setDeptBusy(false))
  }

  return h('div', { className: 'cb-nav' },
    h('div', { className: 'cb-nav-tabs', role: 'tablist', 'aria-label': '组织导航' },
      ICON_TABS.map(item => h('button', {
        key: item.id, type: 'button', role: 'tab', 'aria-selected': tab === item.id,
        className: `cb-nav-tab${tab === item.id ? ' is-current' : ''}`,
        onClick: () => setTab(item.id),
      }, h('span', { className: 'cb-nav-glyph' }, item.glyph), h('span', null, item.label)))),
    h('div', { className: 'cb-search' }, h('span', { className: 'cb-search-icon' }, '⌕'),
      h('input', {
        type: 'search', value: query, placeholder: '搜索员工、部门、项目…',
        'aria-label': '搜索组织', onChange: event => setQuery(event.target.value),
      })),
    ceo ? h('button', { type: 'button', className: 'cb-ceo-card', onClick: () => openEmployee(ceo) },
      h(Avatar, { bot: ceo, size: 40 }),
      h('span', { className: 'cb-ceo-copy' },
        h('span', { className: 'cb-ceo-name' }, text(ceo.name || 'CEO'),
          h(LevelTag, { level: ceoEmployee?.level }), h(StatusDot, { kind: 'online' }),
          h('small', null, '在线')),
        h('small', { className: 'cb-ceo-role' }, `${ceoEmployee?.organizationRole || ceo.organizationRole || ceo.role || 'Chief Executive Officer'} · 全局调度`)),
      h('span', { className: 'cb-chevron' }, '›')) : null,
    h('section', { className: 'cb-block' },
      h('div', { className: 'cb-block-head' }, h('strong', null, '组织概览'), h('span', { className: 'cb-link' }, '查看详情 ›')),
      h('div', { className: 'cb-stats' }, [
        { value: employees.length, label: '员工总数' },
        { value: stats.running ?? groupCounts.running, label: '工作中', tone: 'green' },
        { value: stats.review ?? groupCounts.review, label: '待处理', tone: 'amber' },
        { value: stats.blocked ?? groupCounts.blocked, label: '阻塞', tone: 'red' },
      ].map(item => h('div', { className: 'cb-stat', key: item.label },
        h('strong', { className: item.tone ? `cb-ink-${item.tone}` : '' }, String(item.value ?? 0)),
        h('small', null, item.tone ? h(Fragment, null, h(StatusDot, { kind: item.tone === 'green' ? 'online' : item.tone }), item.label) : item.label))))),
    tab !== 'task' ? h('section', { className: 'cb-block' },
      h('div', { className: 'cb-block-head' },
        h('button', { type: 'button', className: 'cb-block-toggle', onClick: () => setOpenDepartments(state => ({ ...state, all: !state.all })) },
          h('strong', null, '部门导航'), h('span', { className: 'cb-chevron' }, openDepartments.all ? '⌄' : '›')),
        h('button', {
          type: 'button', className: 'cb-block-add', 'aria-label': '新建部门', title: '新建部门',
          onClick: () => { setDeptError(''); setDeptDraft(state => state ? null : { name: '', description: '', parentId: '' }) },
        }, deptDraft ? '×' : '＋')),
      deptDraft ? h('div', { className: 'cb-dept-form' },
        h('input', {
          className: 'cb-dept-input', autoFocus: true, value: deptDraft.name, placeholder: '部门名称，如 技术部',
          'aria-label': '部门名称', maxLength: 40, required: true,
          onChange: event => setDeptDraft(state => ({ ...state, name: event.target.value })),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.nativeEvent?.isComposing) createDepartment()
            if (event.key === 'Escape') setDeptDraft(null)
          },
        }),
        h('input', {
          className: 'cb-dept-input', value: deptDraft.description, placeholder: '负责什么（可选）',
          'aria-label': '部门职责', maxLength: 120,
          onChange: event => setDeptDraft(state => ({ ...state, description: event.target.value })),
        }),
        h(OrgSelect, {
          label: '上级部门', className: 'cb-dept-select', value: deptDraft.parentId, none: '直属管理层',
          options: departments.map(item => ({ value: item.id, label: item.name })),
          onChange: parentId => setDeptDraft(state => ({ ...state, parentId })),
        }),
        h('div', { className: 'cb-dept-form-row' },
          h('button', { type: 'button', className: 'cb-dept-create', disabled: !clean(deptDraft.name) || deptBusy, onClick: createDepartment },
            deptBusy ? '创建中…' : '创建部门'),
          h('button', { type: 'button', className: 'cb-dept-cancel', onClick: () => setDeptDraft(null) }, '取消')),
        deptError ? h('div', { className: 'cb-dept-error', role: 'alert' }, deptError) : null) : null,
      openDepartments.all !== false ? h('div', { className: 'cb-dept-list' },
        orderedDepartments.map(department => {
          const members = grouped.filter(employee => employee.departmentId === department.id)
          const open = openDepartments[department.id]
          const depth = depthOf(department)
          return h('div', { key: department.id, className: `cb-dept${depth ? ' is-child' : ''}` },
            h('button', { type: 'button', className: 'cb-dept-row', onClick: () => { setOpenDepartments(state => ({ ...state, [department.id]: !open })); subject('department', department.id) } },
              h('span', { className: 'cb-dept-icon' }, text(department.icon || '◈').slice(0, 2)),
              h('span', { className: 'cb-dept-name' }, text(department.name)),
              h('span', { className: 'cb-count' }, String(members.length || department.memberCount || 0))),
            open ? h('div', { className: 'cb-dept-members' }, members.length
              ? members.map(employee => h('button', { type: 'button', className: 'cb-employee', key: employee.id, onClick: () => openEmployee(employee) },
                h(Avatar, { bot: roster.byId?.[employee.id], size: 22 }),
                h('span', { className: 'cb-employee-copy' },
                  h('span', { className: 'cb-employee-line' }, text(employee.name), h(LevelTag, { level: employee.level })),
                  h('small', { className: 'cb-employee-do' }, actionText(currentActions[employee.id])
                    || text(employee.organizationRole || employee.role || '待命'))),
                h(StatusDot, { kind: statusOfEmployee(employee) })))
              : h('div', { className: 'cb-empty' }, '暂无员工')) : null)
        }),
        departments.length === 0 ? h('div', { className: 'cb-empty' }, 'CEO 会在接到目标后组建部门') : null) : null) : null,
    tab !== 'project' ? h('section', { className: 'cb-block' },
      h('div', { className: 'cb-block-head' }, h('strong', null, '快速分组'), h('span', { className: 'cb-link' }, '＋')),
      h('div', { className: 'cb-groups' }, [
        { id: 'running', label: '工作中', count: groupCounts.running },
        { id: 'review', label: '待处理', count: groupCounts.review },
        { id: 'blocked', label: '需要关注', count: groupCounts.blocked },
        { id: 'idle', label: '空闲', count: groupCounts.idle },
      ].map(item => h('button', {
        type: 'button', key: item.id, className: `cb-group${filter === item.id ? ' is-current' : ''}`,
        onClick: () => setFilter(filter === item.id ? null : item.id),
      }, h(StatusDot, { kind: item.id === 'running' ? 'online' : item.id }), h('span', null, item.label), h('span', { className: 'cb-count' }, String(item.count)))),
      filter ? h('div', { className: 'cb-dept-members' }, listed.map(employee => h('button', { type: 'button', className: 'cb-employee', key: employee.id, onClick: () => openEmployee(employee) },
        h(Avatar, { bot: roster.byId?.[employee.id], size: 22 }),
        h('span', { className: 'cb-employee-copy' },
          h('span', { className: 'cb-employee-line' }, text(employee.name), h(LevelTag, { level: employee.level })),
          h('small', { className: 'cb-employee-do' }, actionText(currentActions[employee.id]) || '待命'))))) : null)) : null,
    tab !== 'task' ? h('section', { className: 'cb-block' },
      h('div', { className: 'cb-block-head' }, h('strong', null, '项目'), h('span', { className: 'cb-chevron' }, '⌄')),
      h('div', { className: 'cb-project-list' }, projects.filter(matches).slice(0, 8).map(project => h('button', { type: 'button', className: 'cb-project', key: project.id, onClick: () => subject('project', project.id) },
        h('span', { className: 'cb-project-icon' }, '▱'),
        h('span', { className: 'cb-project-name' }, text(project.name)),
        h(Progress, { value: project.progress ?? 0 }))),
        projects.length === 0 ? h('div', { className: 'cb-empty' }, '还没有项目') : null)) : null,
    tab === 'task' ? h('section', { className: 'cb-block' },
      h('div', { className: 'cb-block-head' }, h('strong', null, '任务流'), h('span', { className: 'cb-count' }, String(tasks.length))),
      h('div', { className: 'cb-task-list' }, tasks.slice(0, 14).map(task => h('div', { className: 'cb-task', key: task.id },
        h('span', { className: `cb-task-status cb-task-${STATUS_CLASS[task.status] ?? 'pending'}` }, STATUS_LABEL[task.status] ?? text(task.status)),
        h('span', { className: 'cb-task-title' }, text(task.title)),
        h('small', null, `${pct(task.progress)}% · ${text(task.assignment?.status ?? 'unassigned')}`))),
        tasks.length === 0 ? h('div', { className: 'cb-empty' }, '等待 CEO 拆解目标') : null)) : null,
    h('div', { className: 'cb-nav-foot' },
      compose ? h('div', { className: 'cb-compose' },
        h('input', {
          type: 'text', value: draft, placeholder: '新任务名称', autoFocus: true,
          onChange: event => setDraft(event.target.value),
          onKeyDown: event => { if (event.key === 'Enter') submitTask(); if (event.key === 'Escape') setCompose(false) },
        }),
        h('button', { type: 'button', className: 'cb-compose-send', onClick: submitTask }, '添加'))
        : h('button', { type: 'button', className: 'cb-new-task', onClick: () => setCompose(true) }, '＋ 新建任务')))
}

// -------------------------------------------------------------------------
// Right column: context inspector.

function InfoRows({ rows }) {
  return h('div', { className: 'cb-info' }, rows.map(([label, value, tone]) => h('div', { className: 'cb-info-row', key: label },
    h('span', { className: 'cb-info-label' }, label),
    h('span', { className: `cb-info-value${tone ? ` cb-ink-${tone}` : ''}` }, value))))
}

// A department as its own subject: what it owns, who is in it, and the moves the
// org chart needs most often — putting a Bot in, renaming, and closing it down.
export function DepartmentPanel({ department, members, parent, childCount, departments, employees, roster, actions }) {
  const [pick, setPick] = useState('')
  const [edit, setEdit] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const blocked = members.length > 0 || childCount > 0
  const join = (botId) => {
    setPick('')
    if (!botId) return
    void Promise.resolve(actions.organizationUpdate?.('organization-employee', { botId, departmentId: department.id })).catch(() => {})
  }
  const save = () => {
    const name = clean(edit?.name)
    if (!name) { setError('部门名称不能为空'); return }
    setError('')
    Promise.resolve(actions.organizationUpdate?.('organization-department', {
      action: 'update', departmentId: department.id, name,
      description: clean(edit?.description), parentId: edit?.parentId ?? '',
    })).then(() => setEdit(null)).catch(failure => setError(failure?.message ?? String(failure)))
  }
  const remove = () => {
    if (blocked) return
    if (!confirming) { setConfirming(true); return }
    setError('')
    Promise.resolve(actions.organizationUpdate?.('organization-department', { action: 'remove', departmentId: department.id }))
      .then(() => { setConfirming(false); actions.setOrgSubject?.({ kind: 'employee', id: roster.mainBotId }) })
      .catch(failure => { setConfirming(false); setError(failure?.message ?? String(failure)) })
  }
  return h(Fragment, null,
    h('section', { className: 'cb-section' }, h('h4', null, '部门信息'),
      h(InfoRows, { rows: [
        ['名称', text(department.name)],
        ['上级部门', parent ? text(parent.name) : '直属管理层'],
        ['成员', `${members.length} 位`],
        ['下级部门', childCount ? `${childCount} 个` : '无'],
        ['职责', text(department.description) || '未填写'],
      ] })),
    h('section', { className: 'cb-section' },
      h('div', { className: 'cb-section-head' }, h('h4', null, '部门设置'),
        h('button', {
          type: 'button', className: 'cb-link cb-link-button',
          onClick: () => setEdit(edit ? null : { name: department.name, description: department.description ?? '', parentId: department.parentId ?? '' }),
        }, edit ? '收起' : '编辑')),
      edit ? h('div', { className: 'cb-dept-form' },
        h('input', {
          className: 'cb-dept-input', value: edit.name, placeholder: '部门名称', 'aria-label': '部门名称', maxLength: 40, required: true,
          onChange: event => setEdit(state => ({ ...state, name: event.target.value })),
        }),
        h('input', {
          className: 'cb-dept-input', value: edit.description, placeholder: '负责什么（可选）', 'aria-label': '部门职责', maxLength: 120,
          onChange: event => setEdit(state => ({ ...state, description: event.target.value })),
        }),
        h(OrgSelect, {
          label: '上级部门', className: 'cb-dept-select', value: edit.parentId, none: '直属管理层',
          options: departments.filter(item => item.id !== department.id).map(item => ({ value: item.id, label: item.name })),
          onChange: parentId => setEdit(state => ({ ...state, parentId })),
        }),
        h('div', { className: 'cb-dept-form-row' },
          h('button', { type: 'button', className: 'cb-dept-create', onClick: save }, '保存'),
          h('button', { type: 'button', className: 'cb-dept-cancel', onClick: () => { setEdit(null); setError('') } }, '取消'))) : null,
      h('button', {
        type: 'button', className: 'cb-dept-delete', disabled: blocked,
        'data-confirm': confirming || undefined, onClick: remove,
      }, confirming ? '再次点击确认删除' : '删除部门'),
      blocked
        ? h('div', { className: 'cb-dept-hint' }, members.length ? '先把部门成员移到别处，再删除' : '先删除它的下级部门')
        : null,
      error ? h('div', { className: 'cb-dept-error', role: 'alert' }, error) : null),
    h('section', { className: 'cb-section' },
      h('div', { className: 'cb-section-head' }, h('h4', null, `部门成员 (${members.length})`)),
      members.length
        ? h('div', { className: 'cb-dept-members cb-dept-members-flat' }, members.map(employee => h('button', {
          type: 'button', className: 'cb-employee', key: employee.id,
          onClick: () => { actions.setOrgSubject?.({ kind: 'employee', id: employee.id }); actions.openSession?.(employee.id) },
        },
        h(Avatar, { bot: roster.byId?.[employee.id], size: 22 }),
        h('span', { className: 'cb-employee-copy' },
          h('span', { className: 'cb-employee-line' }, text(employee.name), h(LevelTag, { level: employee.level })),
          h('small', { className: 'cb-employee-do' }, text(employee.organizationRole || employee.role || '待命'))))))
        : h('div', { className: 'cb-empty' }, '这个部门还没有成员'),
      h('label', { className: 'cb-dept-add' },
        h('span', null, '把成员加入本部门'),
        h(OrgSelect, {
          label: '加入本部门的成员', className: 'cob-select', value: pick, none: '选择一位 Bot',
          options: employees.filter(employee => employee.departmentId !== department.id)
            .map(employee => ({ value: employee.id, label: `${employee.name}${employee.organizationRole ? ` · ${employee.organizationRole}` : ''}` })),
          onChange: join,
        }))))
}

export function OrganizationInspector({ useRoster, useUi, actions }) {
  const { roster, org } = useOrg(useRoster)
  const subject = useUi(state => state.orgSubject ?? null)
  const details = useUi(state => state.details)
  const [tab, setTab] = useState('status')
  const employees = org.employees ?? []
  const departments = org.departments ?? []
  const projects = org.projects ?? []
  const tasks = org.tasks ?? []
  const edges = org.edges ?? []
  const orgActions = org.actions ?? []
  const currentActions = org.currentActions ?? {}
  const ceoId = roster.mainBotId
  const visible = details === null || details === undefined

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (visible && window.innerWidth > 1100) {
      document.body.dataset.cbInspector = 'on'
      chatRoom.setRight(INSPECTOR_WIDTH)
    } else {
      delete document.body.dataset.cbInspector
      chatRoom.setRight(null)
    }
    const onResize = () => {
      if (visible && window.innerWidth > 1100) {
        document.body.dataset.cbInspector = 'on'
        chatRoom.setRight(INSPECTOR_WIDTH)
      } else {
        delete document.body.dataset.cbInspector
        chatRoom.setRight(null)
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      delete document.body.dataset.cbInspector
      chatRoom.setRight(null)
    }
  }, [visible])

  const kind = subject?.kind ?? 'employee'
  const id = subject?.id ?? ceoId
  const employee = employees.find(item => item.id === id) ?? employees.find(item => item.main) ?? employees[0]
  const department = departments.find(item => item.id === id)
  const project = projects.find(item => item.id === id)
  const bot = employee ? roster.byId?.[employee.id] : undefined
  const name = kind === 'department' ? (department?.name ?? '部门')
    : kind === 'project' ? (project?.name ?? '项目')
      : (employee?.name ?? 'CEO')
  const role = kind === 'department' ? '部门' : kind === 'project' ? '项目'
    : (employee?.main ? 'CEO' : employee?.organizationRole || employee?.role || '专家 Bot')
  // The CEO oversees every project, not only the ones it is named as lead of.
  const ownProjects = kind === 'project' ? (project ? [project] : [])
    : id === ceoId ? projects : projects.filter(item => item.leadId === id)
  const leadProjects = ownProjects.slice(0, 4)
  const reports = edges.filter(edge => edge.type === 'manages' && edge.from === (employee?.id ?? ceoId))
  const subordinates = reports.map(edge => employees.find(item => item.id === edge.to)).filter(Boolean)
  const team = subordinates.length ? subordinates : employees.filter(item => !item.main).slice(0, 6)
  const ownTasks = kind === 'project' ? tasks.filter(task => task.projectId === id) : tasks.filter(task => task.assigneeId === id)
  const relations = edges.filter(edge => edge.from === id || edge.to === id).slice(0, 10)
  const nameOf = value => value === 'owner' ? '老板' : (employees.find(item => item.id === value)?.name ?? text(value))
  const joined = employee?.joinedAt ? new Date(employee.joinedAt).toISOString().slice(0, 10) : '2026-11-13'
  const ownActions = orgActions.filter(action => action.botId === id).slice(-8).reverse()
  const current = currentActions[id]
  const level = employee?.level
  // A department is a subject of its own: it has no status, no actions and no model.
  const isDepartment = kind === 'department' && Boolean(department)
  const departmentMembers = isDepartment ? employees.filter(item => item.departmentId === department.id) : []
  const departmentParent = isDepartment ? departments.find(item => item.id === department.parentId) : undefined

  if (!visible) return null

  return h('aside', { className: 'cb-inspector', 'aria-label': '组织上下文' },
    h('div', { className: 'cb-inspector-hero' },
      h('div', { className: 'cb-hero-top' },
        isDepartment
          ? h('span', { className: 'cb-hero-glyph' }, text(department.icon || '◈').slice(0, 2))
          : h(Avatar, { bot, size: 52 }),
        h('div', { className: 'cb-hero-copy' },
          h('div', { className: 'cb-hero-name' }, text(name),
            isDepartment ? null : h(Fragment, null, h(StatusDot, { kind: 'online' }), h('small', null, '在线'))),
          h('small', null, isDepartment ? `${departmentMembers.length} 位成员` : text(role)))),
      h('div', { className: 'cb-hero-quote' }, '「 让 AI 成为更强大的生产力 」')),
    isDepartment ? null : h('div', { className: 'cb-tabs', role: 'tablist' }, ['status', 'relation', 'task', 'ability'].map((key, index) => h('button', {
      type: 'button', key, role: 'tab', 'aria-selected': tab === key,
      className: `cb-tab${tab === key ? ' is-current' : ''}`, onClick: () => setTab(key),
    }, ['状态', '关系', '任务', '能力'][index]))),
    h('div', { className: 'cb-inspector-body' },
      isDepartment ? h(DepartmentPanel, {
        department, members: departmentMembers, parent: departmentParent,
        childCount: departments.filter(item => item.parentId === department.id).length,
        departments, employees, roster, actions,
      }) : null,
      isDepartment ? null : h(Fragment, null,
      tab === 'status' ? h(Fragment, null,
        h('section', { className: 'cb-section' }, h('h4', null, '基本信息'),
          h(InfoRows, { rows: [
            ['部门', department?.name ?? (employee?.departmentId ? departments.find(item => item.id === employee.departmentId)?.name ?? '管理层' : '管理层')],
            ['岗位', kind === 'project' ? '项目负责人' : text(role)],
            ['职级', level ? `L${level} · ${LEVEL_LABEL[level] ?? ''}` : '未设定'],
            ['入职', text(joined)],
            ['状态', h(Fragment, null, h(StatusDot, { kind: 'online' }), current ? STATUS_LABEL[current.status] ?? current.status : '在线'), 'green'],
          ] })),
        h('section', { className: 'cb-section' },
          h('div', { className: 'cb-section-head' }, h('h4', null, '当前动作'),
            h('span', { className: 'cb-link' }, current ? text(current.taskTitle) : '')),
          ownActions.length ? h('div', { className: 'cb-actions' }, ownActions.map(action => h('div', { className: 'cb-action', key: action.id },
            h('span', { className: `cb-action-kind cb-action-${STATUS_CLASS[action.kind] ?? 'step'}` }, ACTION_LABEL[action.kind] ?? action.kind),
            h('span', { className: 'cb-action-text' }, text(action.text)),
            h('small', null, timeOf(action.at))))) : h('div', { className: 'cb-empty' }, 'DSH 开始执行后，这里会显示它实际做的每一步')),
        h('section', { className: 'cb-section' },
          h('div', { className: 'cb-section-head' }, h('h4', null, `下属团队 (${team.length})`), h('span', { className: 'cb-link' }, '查看全部 ›')),
          h('div', { className: 'cb-team-avatars' }, team.slice(0, 6).map(item => h('button', { type: 'button', key: item.id, className: 'cb-team-avatar', title: item.name, onClick: () => actions.setOrgSubject?.({ kind: 'employee', id: item.id }) },
            h(Avatar, { bot: roster.byId?.[item.id], size: 26 }))), team.length > 6 ? h('span', { className: 'cb-more' }, '…') : null)),
        h('section', { className: 'cb-section' },
          h('h4', null, `管理项目 (${projects.length})`),
          h('div', { className: 'cb-managed' }, leadProjects.map(item => h('button', { type: 'button', className: 'cb-managed-row', key: item.id, onClick: () => actions.setOrgSubject?.({ kind: 'project', id: item.id }) },
            h('span', { className: 'cb-project-icon' }, '▱'),
            h('span', { className: 'cb-managed-name' }, text(item.name)),
            h(Progress, { value: item.progress ?? 0 }),
            h('small', null, `${pct(item.progress)}%`))),
            leadProjects.length === 0 ? h('div', { className: 'cb-empty' }, '暂无项目') : null)),
        h('section', { className: 'cb-section' },
          h('div', { className: 'cb-section-head' }, h('h4', null, '组织关系图'), h('span', { className: 'cb-link' }, '查看大图 ›')),
          h('div', { className: 'cb-graph' },
            h('div', { className: 'cb-graph-root' }, '♛ ', text(name)),
            h('div', { className: 'cb-graph-line' }),
            h('div', { className: 'cb-graph-nodes' }, (team.length ? team.slice(0, 3) : [{ id: 'owner', name: '老板' }]).map(item => h('div', { className: 'cb-graph-node', key: item.id },
              h('strong', null, text(item.organizationRole || item.role || item.name)),
              h('div', { className: 'cb-graph-people' }, h(Avatar, { bot: roster.byId?.[item.id], size: 20 })))))))) : null,
      tab === 'relation' ? h('section', { className: 'cb-section' }, h('h4', null, '关系网络'),
        relations.length ? h('div', { className: 'cb-relations' }, relations.map((edge, index) => h('div', { className: 'cb-relation', key: edge.id ?? index },
          h('span', null, nameOf(edge.from)), h('b', null, RELATION_LABEL[edge.type] ?? edge.type), h('span', null, nameOf(edge.to))))) : h('div', { className: 'cb-empty' }, '关系会在 CEO 委派时形成')) : null,
      tab === 'task' ? h('section', { className: 'cb-section' }, h('h4', null, `任务 (${ownTasks.length})`),
        ownTasks.length ? h('div', { className: 'cb-task-list' }, ownTasks.slice(0, 12).map(task => h('div', { className: 'cb-task', key: task.id },
          h('span', { className: `cb-task-status cb-task-${STATUS_CLASS[task.status] ?? 'pending'}` }, STATUS_LABEL[task.status] ?? text(task.status)),
          h('span', { className: 'cb-task-title' }, text(task.title)),
          h('small', null, `${pct(task.progress)}% · ${text(task.assignment?.status ?? 'unassigned')}`),
          Array.isArray(task.history) && task.history.length
            ? h('div', { className: 'cb-task-history' }, task.history.slice(-3).reverse().map(entry => h('div', { className: 'cb-task-event', key: entry.id }, text(entry.text))))
            : null))) : h('div', { className: 'cb-empty' }, '暂无任务')) : null,
      tab === 'ability' ? h('section', { className: 'cb-section' }, h('h4', null, '能力'), h(InfoRows, { rows: [
        ['类型', employee?.main ? 'Main Bot · CEO' : '专家 Bot'],
        ['模型', text(employee?.model ?? 'DSH 默认')],
        ['组织角色', text(role)],
        ['参与项目', String(projects.filter(item => item.leadId === id).length)],
      ] })) : null)))
}
