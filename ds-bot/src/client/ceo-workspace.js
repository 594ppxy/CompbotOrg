import { createElement as h, Fragment } from 'react'

const text = value => typeof value === 'string' ? value : (value == null ? '' : String(value))

export function CEOWorkspace({ useRoster, useSessions }) {
  const roster = useRoster(value => value)
  const current = useSessions(list => Object.values(list.byId ?? {}).find(session => (session?.retainedBy?.mainView ?? 0) > 0)?.id ?? null)
  const org = roster.organization ?? {}
  const isCeo = current === roster.mainBotId
  if (!isCeo) return null

  const employees = Array.isArray(org.employees) ? org.employees : Object.values(roster.byId ?? {}).map(bot => ({ id: bot.id, name: bot.name, role: bot.role }))
  const departments = Array.isArray(org.departments) ? org.departments : []
  const projects = Array.isArray(org.projects) ? org.projects : []
  const active = employees.filter(employee => employee.id !== roster.mainBotId).slice(0, 6)
  const projectCards = projects.slice(0, 3)

  return h(Fragment, null,
    h('section', { className: 'cb-ceo-workspace', 'aria-label': 'CEO Workspace' },
      h('div', { className: 'cb-ceo-head' },
        h('div', null,
          h('div', { className: 'cb-ceo-kicker' }, 'COMPBOTORG · CEO WORKSPACE'),
          h('div', { className: 'cb-ceo-title' }, 'CEO 指挥台'),
          h('div', { className: 'cb-ceo-subtitle' }, '目标 → 拆解 → 委派 → 协同 → 验收 → 汇报')
        ),
        h('div', { className: 'cb-ceo-metrics' },
          h('span', null, `${employees.length} 员工`),
          h('span', null, `${departments.length} 部门`),
          h('span', null, `${projects.length} 项目`)
        )
      ),
      h('div', { className: 'cb-ceo-cards' },
        h('article', { className: 'cb-ceo-card cb-ceo-card-goal' },
          h('div', { className: 'cb-ceo-card-label' }, '当前执行'),
          h('strong', null, '等待老板下达目标'),
          h('span', null, 'CEO 将自动拆解任务并分派给部门负责人')
        ),
        ...projectCards.map(project => h('article', { className: 'cb-ceo-card', key: project.id ?? project.name },
          h('div', { className: 'cb-ceo-card-label' }, '项目'),
          h('strong', null, text(project.name || '未命名项目')),
          h('span', null, text(project.status || '规划中'))
        )),
        active.length ? h('article', { className: 'cb-ceo-card cb-ceo-card-team' },
          h('div', { className: 'cb-ceo-card-label' }, '团队'),
          h('div', { className: 'cb-ceo-team-list' }, active.map(employee => h('span', { key: employee.id }, employee.name)))
        ) : null
      )
    ),
    h('aside', { className: 'cb-ceo-inspector', 'aria-label': '组织信息' },
      h('div', { className: 'cb-ceo-inspector-title' }, '组织概览'),
      h('div', { className: 'cb-ceo-inspector-row' }, h('span', null, 'CEO'), h('strong', null, 'Main Bot')),
      h('div', { className: 'cb-ceo-inspector-row' }, h('span', null, '部门'), h('strong', null, String(departments.length))),
      h('div', { className: 'cb-ceo-inspector-row' }, h('span', null, '员工'), h('strong', null, String(employees.length))),
      h('div', { className: 'cb-ceo-inspector-title cb-ceo-inspector-rel' }, '协作关系'),
      h('div', { className: 'cb-ceo-relations' }, employees.slice(0, 5).map(employee => h('div', { key: employee.id },
        h('span', { className: 'cb-ceo-dot' }), h('span', null, employee.name), h('small', null, employee.organizationRole || employee.role || '成员')
      )))
    )
  )
}
