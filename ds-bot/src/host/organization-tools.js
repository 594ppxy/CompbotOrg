// CEO tools for the CompBotOrg layer. These only write organization metadata;
// the actual work still goes through message_bot / post_to_group and the DSH
// agent loop. A Main Bot is the only Bot allowed to change the organization.
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  RELATION_TYPES, addDecision, addDepartment, assignEmployee, organizationSummary,
  planGoal, removeDepartment, resolveDecision, setRelation, setTask, setTaskDelivery,
} from './organization.js'

const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
const TASK_ENUM = ['pending', 'running', 'review', 'blocked', 'done']

export function install(rt) {
  const { state } = rt
  const main = (exec) => {
    const self = rt.selfOf(exec.agent?.id)
    return rt.isMain(self) ? self : null
  }
  const botIdOf = (name) => rt.findBot(String(name ?? '').trim())?.id ?? null
  const persist = async () => { await rt.save() }

  rt.teamTools.push(defineTool({
    name: 'organization_view',
    description: 'Read the current CompBotOrg organization: departments, projects, tasks with their status and progress, assignments, relations and pending decisions. Use this instead of guessing who owns what.',
    parameters: {},
    output,
    async execute() {
      await rt.load()
      return organizationSummary(state)
    },
  }))

  rt.teamTools.push(defineTool({
    name: 'organization_plan',
    description: 'Turn one Owner goal into a project, its task breakdown and assignments. Every assigned task gets a stable delivery request id. After planning, send each task with message_bot using that id, then record it as dispatched with organization_task. Reusing the same project name adds tasks to that project instead of making a second one.',
    parameters: {
      goal: { type: 'string', required: true, description: 'The Owner\'s goal, in their words' },
      project: { type: 'string', description: 'Short project name; defaults to the first line of the goal' },
      lead: { type: 'string', description: 'Exact Bot name of the project lead; defaults to you, the CEO' },
      tasks: {
        type: 'array',
        required: true,
        description: 'Task breakdown. Each item is one piece of work with an owner.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Short task title' },
            assignee: { type: 'string', description: 'Exact Bot name from list_bots who owns this task' },
            label: { type: 'string', description: 'Optional team or specialty tag, e.g. "Product AI"' },
            progress: { type: 'number', description: 'Optional starting progress 0-100' },
            status: { type: 'string', enum: TASK_ENUM, description: 'Optional starting status' },
          },
        },
      },
    },
    output,
    async execute(args, exec) {
      const self = main(exec)
      if (!self) return 'Only the CEO (Main Bot) can change the organization.'
      await rt.load()
      if (args.lead && !botIdOf(args.lead)) return `No Bot named ${args.lead}. Check list_bots for an exact name.`
      const rows = []
      for (const item of (Array.isArray(args.tasks) ? args.tasks : [])) {
        const assigneeId = item?.assignee ? botIdOf(item.assignee) : null
        if (item?.assignee && !assigneeId) return `No Bot named ${item.assignee}. Check list_bots for an exact name.`
        rows.push({
          title: item?.title,
          assigneeId,
          label: item?.label,
          progress: item?.progress,
          status: item?.status,
        })
      }
      try {
        const { project, tasks } = planGoal(state, {
          goal: args.goal,
          project: args.project,
          leadId: args.lead ? botIdOf(args.lead) : self,
          tasks: rows,
        })
        await persist()
        const lines = tasks.map(task => `- ${task.title} [${task.id}] → ${state.bots[task.assigneeId]?.name ?? 'unassigned'}${task.assignment?.requestId ? ` (request_id ${task.assignment.requestId})` : ''}`)
        return `Project "${project.name}" [${project.id}] has ${tasks.length} tasks.\n${lines.join('\n')}\nSend each assigned task once with message_bot using its request_id, then call organization_task with delivery "dispatched". The assignee acknowledges it with delivery "acknowledged" before reporting progress.`
      } catch (error) { return error.message }
    },
  }))

  rt.teamTools.push(defineTool({
    name: 'organization_task',
    description: 'Update one organization task as work moves along: status, progress, an assignee, an employee\'s report, or the CEO\'s review. Use "review" when a Bot reports back and "done" once you accept the result. Look the task up by its exact id or title from organization_view.',
    parameters: {
      task: { type: 'string', required: true, description: 'Task id or exact title from organization_view' },
      status: { type: 'string', enum: TASK_ENUM, description: 'New status' },
      progress: { type: 'number', description: 'Progress 0-100' },
      assignee: { type: 'string', description: 'Exact Bot name to own this task' },
      report: { type: 'string', description: 'The employee\'s result or report' },
      review: { type: 'string', description: 'Your review note as CEO' },
      note: { type: 'string', description: 'Short note, e.g. why a task is blocked' },
      delivery: { type: 'string', enum: ['dispatched', 'acknowledged', 'failed'], description: 'Record delegation delivery. CEO records dispatched or failed after message_bot; the assigned employee records acknowledged before work.' },
      request_id: { type: 'string', description: 'The message_bot request_id for this task delivery' },
      delivery_error: { type: 'string', description: 'Why delivery failed, when delivery is failed' },
    },
    output,
    async execute(args, exec) {
      const self = main(exec)
      await rt.load()
      const current = state.organization?.tasks?.find(task => task.id === String(args.task ?? '').trim()
        || task.title.toLowerCase() === String(args.task ?? '').trim().toLowerCase())
      // An employee may report on its own task; only the CEO may review or reassign.
      if (!self && current?.assigneeId !== rt.selfOf(exec.agent?.id)) return 'Only the CEO or the task\'s owner can change this task.'
      try {
        if (args.delivery !== undefined) {
          if (!self && args.delivery !== 'acknowledged') return 'Only the CEO can record a dispatched or failed delivery.'
          const task = setTaskDelivery(state, {
            taskId: args.task, status: args.delivery, requestId: args.request_id, error: args.delivery_error,
          })
          await persist()
          return `Task "${task.title}" delegation is ${task.assignment.status}.`
        }
        const task = setTask(state, {
          taskId: args.task,
          ...(args.status !== undefined && !self ? { status: args.status === 'done' ? 'review' : args.status } : { status: args.status }),
          progress: args.progress,
          ...(self && args.assignee !== undefined ? { assigneeId: botIdOf(args.assignee) } : {}),
          ...(self && args.review !== undefined ? { review: args.review } : {}),
          report: args.report,
          note: args.note,
        })
        await persist()
        return `Task "${task.title}" is ${task.status} at ${task.progress}%.`
      } catch (error) { return error.message }
    },
  }))

  rt.teamTools.push(defineTool({
    name: 'organization_department',
    description: 'Create a department in the organization, or place a Bot in one and set who it reports to. Only the CEO can change the organization.',
    parameters: {
      name: { type: 'string', description: 'Department name to create' },
      description: { type: 'string', description: 'What this department owns' },
      parent: { type: 'string', description: 'Optional parent department id' },
      bot: { type: 'string', description: 'Exact Bot name to place in a department' },
      department: { type: 'string', description: 'Department name or id to place the Bot in' },
      role: { type: 'string', description: 'The Bot\'s organization role / job title, e.g. "技术负责人"' },
      level: { type: 'number', enum: [1, 2, 3, 4, 5], description: 'Job level: 5 决策层, 4 管理层, 3 主管, 2 骨干, 1 执行. It describes the org chart only and never changes DSH permissions.' },
      reports_to: { type: 'string', description: 'Exact Bot name this Bot reports to' },
      remove: { type: 'string', description: 'Department name or id to delete. Only an empty department can go: move its members and sub-departments first.' },
    },
    output,
    async execute(args, exec) {
      if (!main(exec)) return 'Only the CEO (Main Bot) can change the organization.'
      await rt.load()
      try {
        if (args.remove) {
          const department = removeDepartment(state, { departmentId: String(args.remove).trim() })
          await persist()
          return `Department "${department.name}" is gone.`
        }
        if (args.name) {
          const department = addDepartment(state, { name: args.name, description: args.description, parentId: args.parent })
          await persist()
          return `Department "${department.name}" [${department.id}] is ready.`
        }
        if (!args.bot) return 'Name a department to create, or a Bot to place.'
        const bot = rt.findBot(String(args.bot).trim())
        if (!bot) return `No Bot named ${args.bot}. Team: ${Object.values(state.bots).map(item => item.name).join(', ')}`
        const org = state.organization
        const departmentName = String(args.department ?? '').trim()
        const department = org?.departments?.find(item => item.id === departmentName || item.name === departmentName)
        assignEmployee(state, {
          botId: bot.id,
          departmentId: department?.id ?? null,
          role: args.role,
          level: args.level,
          reportsTo: args.reports_to ? botIdOf(args.reports_to) : undefined,
        })
        await persist()
        const level = state.bots[bot.id]?.level
        return `${bot.name} is ${department ? `in ${department.name}` : 'unassigned'}${level ? ` at L${level}` : ''}.`
      } catch (error) { return error.message }
    },
  }))

  rt.teamTools.push(defineTool({
    name: 'organization_decision',
    description: 'Record something that needs the Owner\'s decision, or close one after the Owner answers. Blocked tasks and open questions belong here so the executive report can list them.',
    parameters: {
      title: { type: 'string', description: 'The decision or question, short' },
      detail: { type: 'string', description: 'Context and the options' },
      project: { type: 'string', description: 'Exact project name' },
      answer: { type: 'string', description: 'The Owner\'s answer; giving one closes the decision' },
    },
    output,
    async execute(args, exec) {
      if (!main(exec)) return 'Only the CEO (Main Bot) can change the organization.'
      await rt.load()
      const title = String(args.title ?? '').trim()
      if (!title) return 'A decision title is required.'
      const project = state.organization?.projects?.find(item => item.name === String(args.project ?? '').trim())
      try {
        if (args.answer !== undefined) {
          resolveDecision(state, { title, answer: args.answer })
          await persist()
          return `Decision "${title}" closed.`
        }
        addDecision(state, { title, detail: args.detail, projectId: project?.id ?? null })
        await persist()
        return `Decision "${title}" is pending. Ask the Owner with ask_user, then report the outcome.`
      } catch (error) { return error.message }
    },
  }))

  // Relations remain a graph: a Bot may report to one lead and collaborate with
  // several others. The CEO adds a typed edge between two Bots by name.
  rt.teamTools.push(defineTool({
    name: 'organization_relation',
    description: 'Add a typed organization relation between two Bots by their exact names. Types: manages, reports_to, member_of, collaborates, advisor_of, project_lead, delegates_to.',
    parameters: {
      from: { type: 'string', required: true, description: 'Exact Bot name' },
      to: { type: 'string', required: true, description: 'Exact Bot name' },
      type: { type: 'string', required: true, enum: [...RELATION_TYPES], description: 'Relation type' },
    },
    output,
    async execute(args, exec) {
      if (!main(exec)) return 'Only the CEO (Main Bot) can change the organization.'
      await rt.load()
      const from = botIdOf(args.from)
      const to = botIdOf(args.to)
      if (!from || !to) return 'Both Bots must exist. Check list_bots for exact names.'
      try {
        setRelation(state, { from, to, type: String(args.type ?? '').trim() })
        await persist()
        return `${args.from} ${args.type} ${args.to}.`
      } catch (error) { return error.message }
    },
  }))
}
