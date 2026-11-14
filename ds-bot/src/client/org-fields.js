// The CompBotOrg placement controls: 岗位 / 职级 / 部门 / 汇报对象.
//
// Asked wherever a Bot joins the org — the Create Bot form, the Bot's own settings,
// a department's member list — so the four fields look and behave the same there.
import { createElement as h } from 'react'
import { departmentOptions, levelOptions, peerOptions } from './org-model.js'

export function OrgSelect({ label, value, onChange, options, none = '未指定', className = 'cob-select', disabled = false }) {
  return h('select', {
    className, value: value ?? '', 'aria-label': label, disabled,
    onChange: event => onChange(event.target.value),
  },
  none === null ? null : h('option', { value: '' }, none),
  options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
}

// The four answers as a compact two-column block, for the Create Bot form.
export function PlacementFields({ roster, org, botId, value, onChange, hint = '只影响组织图与汇报关系，不改变 DSH 权限' }) {
  const set = patch => onChange({ ...value, ...patch })
  const reports = peerOptions(roster, botId)
  return h('div', { className: 'cob' },
    h('div', { className: 'cob-grid' },
      h('label', { className: 'cob-field' },
        h('span', { className: 'cob-label' }, '岗位'),
        h('input', {
          className: 'cob-input', value: value.title ?? '', maxLength: 40, placeholder: '技术负责人',
          'aria-label': '岗位', onChange: event => set({ title: event.target.value }),
        })),
      h('label', { className: 'cob-field' },
        h('span', { className: 'cob-label' }, '职级'),
        h(OrgSelect, {
          label: '职级', value: value.level ? String(value.level) : '', options: levelOptions(), none: '未设定',
          onChange: picked => set({ level: picked ? Number(picked) : undefined }),
        })),
      h('label', { className: 'cob-field' },
        h('span', { className: 'cob-label' }, '部门'),
        h(OrgSelect, {
          label: '部门', value: value.departmentId ?? '', none: '暂不分配', options: departmentOptions(org),
          onChange: departmentId => set({ departmentId }),
        })),
      reports.length ? h('label', { className: 'cob-field' },
        h('span', { className: 'cob-label' }, '汇报对象'),
        h(OrgSelect, {
          label: '汇报对象', value: value.reportsTo ?? '', none: '直接向老板汇报', options: reports,
          onChange: reportsTo => set({ reportsTo }),
        })) : null),
    hint ? h('span', { className: 'cob-hint' }, hint) : null)
}
