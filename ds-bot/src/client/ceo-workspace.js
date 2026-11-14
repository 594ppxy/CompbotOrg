import { createElement as h, Fragment, useMemo } from 'react'
import { currentPart } from './text.js'

const text = value => typeof value === 'string' ? value : (value == null ? '' : String(value))
const statusLabel = status => ({ active: '执行中', planning: '规划中', paused: '已暂停', done: '已完成', completed: '已完成' })[status] || text(status || '待启动')
const initials = name => text(name || '?').trim().slice(0, 2)

export function CEOWorkspace({ useRoster, useSessions }) {
  const roster = useRoster(value => value)
  const current = useSessions(list => Object.values(list.byId ?? {}).find(session => (session?.retainedBy?.mainView ?? 0) > 0)?.id ?? null)
  const org = roster.organization ?? {}
  const mainBot = roster.byId?.[roster.mainBotId]
  const mainPart = mainBot ? currentPart(mainBot) : roster.mainBotId
  if (current !== mainPart) return null
  const employees = Array.isArray(org.employees) ? org.employees : Object.values(roster.byId ?? {}).map(bot => ({ id: bot.id, name: bot.name, role: bot.role }))
  const departments = Array.isArray(org.departments) ? org.departments : []
  const projects = Array.isArray(org.projects) ? org.projects : []
  const edges = Array.isArray(org.edges) ? org.edges : []
  const ceo = employees.find(employee => employee.id === roster.mainBotId)
  const workers = employees.filter(employee => employee.id !== roster.mainBotId)
  const departmentMap = useMemo(() => new Map(departments.map(department => [department.id, department])), [departments])
  const stateOf = project => text(project.status || 'active').toLowerCase()
  const activeProjects = projects.filter(project => ['active', 'running', 'executing'].includes(stateOf(project))).length
  const completedProjects = projects.filter(project => ['done', 'completed'].includes(stateOf(project))).length
  const managerEdges = edges.filter(edge => edge.type === 'manages')
  const collaborationEdges = edges.filter(edge => edge.type === 'collaborates')
  const leadIds = new Set(projects.map(project => project.leadId).filter(Boolean))
  const departmentRows = departments.slice(0, 6).map(department => ({ ...department, members: workers.filter(employee => employee.departmentId === department.id) }))
  const unassigned = workers.filter(employee => !employee.departmentId)
  const leadName = project => employees.find(employee => employee.id === project.leadId)?.name || '待分配'
  return h(Fragment, null,
    h('section', { className: 'cb-ceo-workspace', 'aria-label': 'CEO Workspace' },
      h('div', { className: 'cb-ceo-head' },
        h('div', { className: 'cb-ceo-head-copy' }, h('div', { className: 'cb-ceo-kicker' }, 'COMPBOTORG · CEO WORKSPACE'), h('div', { className: 'cb-ceo-title' }, 'CEO 指挥台'), h('div', { className: 'cb-ceo-subtitle' }, '老板只下达目标，CEO 负责拆解、委派、协调、验收与汇报')),
        h('div', { className: 'cb-ceo-flow' }, ['目标', '拆解', '委派', '协同', '验收', '汇报'].map((step, index) => h(Fragment, { key: step }, index ? h('span', { className: 'cb-ceo-flow-arrow' }, '→') : null, h('span', { className: index === 0 ? 'is-current' : '' }, step))))
      ),
      h('div', { className: 'cb-ceo-kpis' },
        h('div', { className: 'cb-ceo-kpi cb-ceo-kpi-primary' }, h('span', null, '组织成员'), h('strong', null, String(employees.length)), h('small', null, 'CEO + 专家 Bots')),
        h('div', { className: 'cb-ceo-kpi' }, h('span', null, '部门'), h('strong', null, String(departments.length)), h('small', null, '可继续扩展层级')),
        h('div', { className: 'cb-ceo-kpi' }, h('span', null, '执行中项目'), h('strong', null, String(activeProjects)), h('small', null, completedProjects + ' 个已完成')),
        h('div', { className: 'cb-ceo-kpi' }, h('span', null, '组织关系'), h('strong', null, String(edges.length)), h('small', null, collaborationEdges.length + ' 个协作关系'))
      ),
      h('div', { className: 'cb-ceo-main-grid' },
        h('div', { className: 'cb-ceo-primary-column' },
          h('section', { className: 'cb-ceo-panel cb-ceo-command' },
            h('div', { className: 'cb-ceo-panel-head' }, h('div', null, h('div', { className: 'cb-ceo-panel-kicker' }, 'COMMAND CENTER'), h('h3', null, '当前指挥状态')), h('span', { className: 'cb-ceo-live' }, '● LIVE')),
            h('div', { className: 'cb-ceo-command-body' }, h('div', { className: 'cb-ceo-command-icon' }, '⌁'), h('div', null, h('strong', null, projects.length ? 'CEO 正在等待新的优先级' : '等待老板下达第一个目标'), h('p', null, projects.length ? '目标进入后，CEO 会把工作拆成项目与任务，再沿组织关系委派给负责人。' : '直接在 CEO 聊天中告诉我“要做什么”。不需要你手动创建任务或逐个安排员工。')))
          ),
          h('section', { className: 'cb-ceo-panel' },
            h('div', { className: 'cb-ceo-panel-head' }, h('div', null, h('div', { className: 'cb-ceo-panel-kicker' }, 'PROJECTS'), h('h3', null, '项目与执行流')), h('span', { className: 'cb-ceo-panel-count' }, projects.length + ' 项')),
            projects.length ? h('div', { className: 'cb-ceo-project-list' }, projects.slice(0, 8).map(project => h('article', { className: 'cb-ceo-project', key: project.id || project.name },
              h('div', { className: 'cb-ceo-project-top' }, h('div', { className: 'cb-ceo-project-mark' }, initials(project.name)), h('div', { className: 'cb-ceo-project-title' }, h('strong', null, text(project.name || '未命名项目')), h('span', null, leadName(project))), h('span', { className: 'cb-ceo-status cb-ceo-status-' + stateOf(project) }, statusLabel(stateOf(project)))),
              project.goal ? h('p', { className: 'cb-ceo-project-goal' }, text(project.goal)) : null,
              h('div', { className: 'cb-ceo-progress' }, h('span', { style: { width: ['done', 'completed'].includes(stateOf(project)) ? '100%' : ['active', 'running', 'executing'].includes(stateOf(project)) ? '58%' : '18%' } })),
              h('div', { className: 'cb-ceo-project-meta' }, h('span', null, '负责人 · ' + leadName(project)), h('span', null, departmentMap.get(employees.find(employee => employee.id === project.leadId)?.departmentId)?.name || '跨部门'))
            ))) : h('div', { className: 'cb-ceo-empty' }, '还没有项目。老板的下一条目标会从这里开始形成执行流。')
          ),
          h('section', { className: 'cb-ceo-panel' },
            h('div', { className: 'cb-ceo-panel-head' }, h('div', null, h('div', { className: 'cb-ceo-panel-kicker' }, 'ORGANIZATION'), h('h3', null, '组织链路')), h('span', { className: 'cb-ceo-panel-count' }, managerEdges.length + ' 管理关系')),
            h('div', { className: 'cb-ceo-org-flow' },
              h('div', { className: 'cb-ceo-org-node cb-ceo-org-owner' }, h('span', null, '老板'), h('small', null, 'Owner')),
              h('div', { className: 'cb-ceo-org-line' }, '↓'),
              h('div', { className: 'cb-ceo-org-node cb-ceo-org-ceo' }, h('span', null, ceo?.name || 'Main Bot'), h('small', null, 'CEO')),
              h('div', { className: 'cb-ceo-org-line' }, '↓'),
              h('div', { className: 'cb-ceo-org-departments' }, departmentRows.map(department => h('div', { className: 'cb-ceo-org-dept', key: department.id }, h('strong', null, department.name), h('span', null, department.members.length + ' 人'), department.members.slice(0, 3).map(member => h('small', { key: member.id }, member.name)))), unassigned.length ? h('div', { className: 'cb-ceo-org-dept cb-ceo-org-unassigned', key: 'unassigned' }, h('strong', null, '未分配'), h('span', null, unassigned.length + ' 人')) : null)
            )
          )
        ),
        h('aside', { className: 'cb-ceo-side-column' },
          h('section', { className: 'cb-ceo-panel cb-ceo-team-panel' },
            h('div', { className: 'cb-ceo-panel-head' }, h('div', null, h('div', { className: 'cb-ceo-panel-kicker' }, 'TEAM'), h('h3', null, '员工与负责人')), h('span', { className: 'cb-ceo-panel-count' }, workers.length + ' 人')),
            h('div', { className: 'cb-ceo-employee-list' }, workers.slice(0, 10).map(employee => h('div', { className: 'cb-ceo-employee', key: employee.id }, h('div', { className: 'cb-ceo-avatar' }, initials(employee.name)), h('div', { className: 'cb-ceo-employee-copy' }, h('strong', null, employee.name), h('span', null, employee.organizationRole || employee.role || '专家')), leadIds.has(employee.id) ? h('span', { className: 'cb-ceo-lead-badge' }, 'Lead') : null)), workers.length > 10 ? h('div', { className: 'cb-ceo-more' }, '+' + (workers.length - 10) + ' 名员工') : null)
          ),
          h('section', { className: 'cb-ceo-panel' },
            h('div', { className: 'cb-ceo-panel-head' }, h('div', null, h('div', { className: 'cb-ceo-panel-kicker' }, 'RELATIONS'), h('h3', null, '协作网络')), h('span', { className: 'cb-ceo-panel-count' }, edges.length + ' 条')),
            h('div', { className: 'cb-ceo-relations' }, edges.slice(0, 8).map(edge => {
              const from = employees.find(employee => employee.id === edge.from)?.name || (edge.from === 'owner' ? '老板' : edge.from)
              const to = employees.find(employee => employee.id === edge.to)?.name || edge.to
              return h('div', { className: 'cb-ceo-relation', key: edge.id || edge.from + '-' + edge.to + '-' + edge.type }, h('span', null, from), h('b', null, edge.type), h('span', null, to))
            }), edges.length === 0 ? h('div', { className: 'cb-ceo-empty' }, '组织关系会随着 CEO 委派和协作自动形成。') : null)
          ),
          h('section', { className: 'cb-ceo-panel cb-ceo-next' }, h('div', { className: 'cb-ceo-panel-kicker' }, 'NEXT'), h('strong', null, '老板下一步只需要说目标'), h('p', null, '例如：“做一个面向开发者的 AI 产品。” CEO 会负责把它变成可执行的组织任务。'))
        )
      )
    )
  )
}
