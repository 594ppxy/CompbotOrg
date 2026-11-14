// CompBotOrg action feed: the organization layer mirrors work the Bots really do in
// DSH. It never runs a turn and never invents a step — it listens to the Session's
// own tool calls and to the group @ mentions that start a member's turn.
import { recordAction } from './organization.js'

// Lookups and prompt bookkeeping are not work. Everything else a Bot does is.
const META_CALLS = new Set([
  'organization_view', 'list_bots', 'list_bot_models', 'list_capabilities', 'list_secrets',
  'read_own_chat', 'read_group_chat', 'recall', 'remember', 'forget', 'user',
])

const cut = (value, max = 110) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const firstText = (args, keys) => {
  for (const key of keys) if (typeof args[key] === 'string' && args[key].trim()) return cut(args[key])
  return ''
}

function describe(name, args) {
  switch (name) {
    case 'organization_plan':
      return `拆解目标「${cut(args.goal, 60)}」，派出 ${Array.isArray(args.tasks) ? args.tasks.length : 0} 项任务`
    case 'organization_task': {
      const bits = [args.task, args.status, args.delivery].filter(Boolean).map(value => cut(value, 40))
      return `更新任务${bits.length ? `「${bits.join(' · ')}」` : ''}${args.report ? `：${cut(args.report, 80)}` : ''}`
    }
    case 'organization_department':
      return args.name ? `新建部门「${cut(args.name, 40)}」` : `调整 ${cut(args.bot, 30)} 的岗位与汇报关系`
    case 'organization_relation':
      return `建立关系 ${cut(args.from, 24)} ${cut(args.type, 20)} ${cut(args.to, 24)}`
    case 'organization_decision':
      return args.answer ? `关闭待决策「${cut(args.title, 50)}」` : `提出待决策「${cut(args.title, 50)}」`
    case 'message_bot':
      return `给 ${cut(args.to, 30)} 下指令：${cut(args.message, 100)}`
    case 'post_to_group':
      return `在「${cut(args.group, 30)}」群下达指令：${cut(args.message, 100)}`
    case 'create_group':
      return `创建群聊「${cut(args.name, 40)}」`
    case 'update_group':
      return `调整群聊「${cut(args.group, 40)}」`
    case 'create_bot':
      return `新建 Bot「${cut(args.name, 30)}」· ${cut(args.role, 40)}`
    case 'update_bot':
      return `调整 Bot「${cut(args.bot, 30)}」的设置`
    case 'group_goal':
      return `在群里设定并推进目标：${cut(args.goal, 80)}`
    case 'ask_user':
      return `向老板确认：${cut(args.question ?? args.message, 80)}`
    case 'show_view':
      return `展示结果卡片：${cut(args.title ?? args.text, 80)}`
    default: {
      const hint = firstText(args, ['path', 'file_path', 'command', 'query', 'url', 'title', 'name', 'text', 'content'])
      return hint ? `${name} · ${hint}` : name
    }
  }
}

function taskForMessage(state, botId, requestId) {
  const tasks = state.organization?.tasks ?? []
  if (requestId) {
    const exact = tasks.find(task => task.assignment?.requestId === requestId)
    if (exact) return exact
  }
  return tasks
    .filter(task => task.assigneeId === botId && ['pending', 'running', 'blocked'].includes(task.status))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
}

export function install(rt) {
  let pending = null
  const schedule = () => {
    if (pending !== null) return
    pending = setTimeout(() => {
      pending = null
      void rt.save().catch(() => {})
    }, 300)
  }

  const note = (input) => {
    if (!recordAction(rt.state, input)) return
    schedule()
  }

  rt.ctx.on('session/event', (session, event) => {
    const sessionId = session?.id
    if (sessionId === undefined || !rt.isBotSession(sessionId)) return
    const botId = rt.selfOf(sessionId)
    if (!botId) return

    if (event.type === 'tool/call') {
      const name = String(event.data?.name ?? '')
      if (!name || META_CALLS.has(name)) return
      let args = {}
      try { args = JSON.parse(event.data?.arguments ?? '{}') ?? {} } catch { /* unparseable args still name the tool */ }
      const text = describe(name, args)
      const task = name === 'message_bot' && args.request_id
        ? taskForMessage(rt.state, null, args.request_id)
        : taskForMessage(rt.state, botId)
      note({ botId, kind: name, text, taskId: task?.id ?? null, source: 'dsh' })

      // A group post that calls members with @Name is a dispatch to those members:
      // record it on each of them so the instruction and the work stay together.
      if (name === 'post_to_group' || name === 'message_bot') {
        const message = String(args.message ?? '')
        const mentioned = [...message.matchAll(/@([^\s@,，。:：]+)/g)].map(match => match[1])
        for (const raw of mentioned) {
          const target = rt.findBot(raw)
          if (!target || target.id === botId) continue
          const own = taskForMessage(rt.state, target.id)
          note({
            botId: target.id, kind: 'call', source: 'group',
            text: `群里 @ 你：${cut(message.replace(/@[^\s@,，。:：]+/g, '').trim(), 130)}`,
            taskId: own?.id ?? null,
          })
        }
      }
      return
    }

    // A member that answers in a group chat without a @ does no work; a @ in its
    // reply still hands the work on, so mirror those too.
    if (event.type === 'assistant/message' && rt.groupOwners.has(sessionId)) {
      const text = typeof event.data?.text === 'string' ? event.data.text : ''
      const mentioned = [...text.matchAll(/@([^\s@,，。:：]+)/g)].map(match => match[1])
      for (const raw of mentioned) {
        const target = rt.findBot(raw)
        if (!target || target.id === botId) continue
        const own = taskForMessage(rt.state, target.id)
        note({
          botId: target.id, kind: 'call', source: 'group',
          text: `群里 @ 你：${cut(text.replace(/@[^\s@,，。:：]+/g, '').trim(), 130)}`,
          taskId: own?.id ?? null,
        })
      }
    }
  })
}
