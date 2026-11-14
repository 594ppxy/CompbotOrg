/* CompBotOrg workbench — state-driven UI.
   Views: org / projects / tasks / knowledge / settings / search
   Every navigation actually swaps the left column, the centre view and the inspector.
   Chat replies come exclusively from Agnes (OpenAI-compatible chat/completions, SSE).
   There is no local rule-based reply and no intent-keyword fallback: without an API
   key the composer refuses to send and points at Settings > Model. */
(function () {
  'use strict';

  /* ================= utils ================= */
  var $ = function (s, r) { return (r || document).querySelector(s) };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var now = function () {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };
  var uid = function (p) { return p + '-' + Math.random().toString(36).slice(2, 7) };
  var pct = function (n) { return Math.max(0, Math.min(100, Math.round(n))) };

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'cb-toast'; document.body.appendChild(toastEl) }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on') }, 2000);
  }

  /* ================= data ================= */
  var DB = {
    me: { id: 'me', name: '我', role: '老板' },
    employees: [
      { id: 'ceo', name: 'CEO', role: 'AI 总经理 · 全局调度', title: '总经理', level: 5, reportsTo: null, look: { shape: 'whale', color: 'deepseek' }, dept: '管理层', status: 'online', joined: '2026-11-13', bio: '把老板的一句话变成可执行的计划，并对结果负责。', skills: ['目标拆解', '任务委派', '进度跟踪', '风险预警'], lead: true },
      { id: 'coo', name: 'Organizer', role: 'COO · 运营调度', title: '运营总监', level: 4, reportsTo: 'ceo', look: { shape: 'gem', color: 'violet' }, dept: '管理层', status: 'online', joined: '2026-11-13', bio: '负责人力调度与跨部门协同，保证任务不断档。', skills: ['资源编排', '跨部门协调', '流程设计'] },
      { id: 'cfo', name: 'CFO AI', role: 'CFO · 资源与预算', title: '财务总监', level: 4, reportsTo: 'ceo', look: { shape: 'saucer', color: 'yellow' }, dept: '管理层', status: 'idle', joined: '2026-11-13', bio: '盯住成本与产出比，给每个项目算清账。', skills: ['成本核算', '预算规划'] },
      { id: 'cto', name: 'DSHBot', role: 'CTO · 技术负责人', title: '技术总监', level: 4, reportsTo: 'ceo', look: { shape: 'beacon', color: 'cyan' }, dept: '技术部', status: 'running', joined: '2026-11-13', bio: '负责整体技术架构与 DSHBot 核心改造。', skills: ['架构设计', 'Node.js', '系统集成'] },
      { id: 'backend', name: 'Backend AI', role: '后端工程师', title: '高级后端工程师', level: 2, reportsTo: 'cto', look: { shape: 'gumdrop', color: 'green' }, dept: '技术部', status: 'running', joined: '2026-11-13', bio: '组织关系网与数据接口的实现者。', skills: ['API 设计', '数据建模'] },
      { id: 'platform', name: 'Platform AI', role: '平台工程师', title: '平台工程师', level: 2, reportsTo: 'cto', look: { shape: 'star', color: 'cyan' }, dept: '技术部', status: 'idle', joined: '2026-11-13', bio: '负责 Skill 系统与插件运行时。', skills: ['插件系统', '工具编排'] },
      { id: 'qa', name: 'QA AI', role: '测试工程师', title: '质量工程师', level: 2, reportsTo: 'cto', look: { shape: 'kitty', color: 'magenta' }, dept: '技术部', status: 'idle', joined: '2026-11-13', bio: '守住发布前的最后一道门。', skills: ['自动化测试', '回归验证'] },
      { id: 'research', name: 'Research AI', role: '研究负责人', title: '研究总监', level: 4, reportsTo: 'ceo', look: { shape: 'hex', color: 'blue' }, dept: '研究部', status: 'idle', joined: '2026-11-13', bio: '负责下一代 Agent 平台的技术预研。', skills: ['论文复现', '技术选型'] },
      { id: 'model', name: 'Model AI', role: '模型工程师', title: '模型工程师', level: 2, reportsTo: 'research', look: { shape: 'moon', color: 'violet' }, dept: '研究部', status: 'review', joined: '2026-11-13', bio: '多 Agent 协作策略与评测。', skills: ['模型评测', 'Prompt 工程'] },
      { id: 'product', name: 'Product AI', role: '产品经理', title: '产品主管', level: 3, reportsTo: 'ceo', look: { shape: 'star', color: 'orange' }, dept: '产品部', status: 'running', joined: '2026-11-13', bio: '把需求翻译成可交付的任务清单。', skills: ['需求分析', '任务拆解'] },
      { id: 'design', name: 'Design AI', role: '交互设计师', title: '交互设计师', level: 2, reportsTo: 'product', look: { shape: 'bunny', color: 'rose' }, dept: '产品部', status: 'idle', joined: '2026-11-13', bio: '负责三栏工作台的视觉与交互细节。', skills: ['视觉设计', '交互原型'] },
      { id: 'ops', name: 'Ops AI', role: '运营负责人', title: '运营主管', level: 3, reportsTo: 'ceo', look: { shape: 'acorn', color: 'green' }, dept: '运营部', status: 'idle', joined: '2026-11-13', bio: '内容、增长与知识库运营。', skills: ['内容运营', '数据分析'] }
    ],
    departments: [
      { id: 'mgmt', name: '管理层', icon: '♛', desc: '制定目标、拆解计划、调度资源。' },
      { id: 'tech', name: '技术部', icon: '⌘', desc: '架构、后端、平台与质量保障。' },
      { id: 'research', name: '研究部', icon: '⚗', desc: '下一代 Agent 平台与技术预研。' },
      { id: 'product', name: '产品部', icon: '◈', desc: '需求、设计与产品交付。' },
      { id: 'ops', name: '运营部', icon: '▤', desc: '内容、增长与知识库运营。' }
    ],
    projects: [
      { id: 'p1', name: 'AI Organization v1', goal: '这周完成第一版', status: '进行中', pct: 42, lead: 'ceo', due: '2026-11-20', desc: '把 DS Bot 升级成 AI 组织工作台：三栏布局、组织图、CEO 执行流。', members: ['ceo', 'cto', 'product', 'design', 'backend', 'platform', 'qa'] },
      { id: 'p2', name: '官网重构', goal: 'Q4 上线新官网', status: '进行中', pct: 68, lead: 'design', due: '2026-12-01', desc: '重做品牌官网，统一视觉语言与信息架构。', members: ['design', 'ops', 'product'] },
      { id: 'p3', name: '下一代 Agent 平台', goal: '完成技术预研', status: '风险', pct: 25, lead: 'research', due: '2026-12-15', desc: '多 Agent 协作与工具编排的下一代平台预研。', members: ['research', 'model', 'platform'] },
      { id: 'p4', name: '知识库迁移', goal: '迁移历史文档', status: '已完成', pct: 100, lead: 'ops', due: '2026-11-10', desc: '把散落的文档迁入统一知识库并建立索引。', members: ['ops', 'qa'] }
    ],
    tasks: [
      { id: 't1', name: '产品架构设计', project: 'p1', assignee: 'product', status: 'done', pct: 100, due: '2026-11-14' },
      { id: 't2', name: 'DSHBot 改造', project: 'p1', assignee: 'cto', status: 'running', pct: 90, due: '2026-11-18' },
      { id: 't3', name: '组织关系网', project: 'p1', assignee: 'backend', status: 'running', pct: 60, due: '2026-11-19' },
      { id: 't4', name: 'UI 界面优化', project: 'p1', assignee: 'design', status: 'pending', pct: 0, due: '2026-11-20' },
      { id: 't5', name: 'Skill 系统开发', project: 'p1', assignee: 'platform', status: 'pending', pct: 0, due: '2026-11-22' },
      { id: 't6', name: '测试与发布', project: 'p1', assignee: 'qa', status: 'pending', pct: 0, due: '2026-11-24' },
      { id: 't7', name: '视觉稿评审', project: 'p2', assignee: 'design', status: 'review', pct: 80, due: '2026-11-16' },
      { id: 't8', name: '首页信息架构', project: 'p2', assignee: 'product', status: 'done', pct: 100, due: '2026-11-08' },
      { id: 't9', name: '组件库统一', project: 'p2', assignee: 'design', status: 'running', pct: 55, due: '2026-11-21' },
      { id: 't10', name: '多 Agent 通信协议', project: 'p3', assignee: 'research', status: 'blocked', pct: 30, due: '2026-12-05', note: '等待模型侧确认上下文窗口方案' },
      { id: 't11', name: '评测集搭建', project: 'p3', assignee: 'model', status: 'review', pct: 70, due: '2026-12-08' },
      { id: 't12', name: '文档迁入与索引', project: 'p4', assignee: 'ops', status: 'done', pct: 100, due: '2026-11-10' }
    ],
    docs: [
      { id: 'd1', title: 'CompBotOrg 设计简报', cat: '规范', ext: 'MD', size: '12 KB', updated: '2026-11-14', desc: '三栏布局、组织模型与 CEO 执行流的产品定义。' },
      { id: 'd2', title: 'UI 设计规范 (DSH)', cat: '规范', ext: 'MD', size: '18 KB', updated: '2026-11-12', desc: '圆角阶梯、颜色令牌、间距与排版规则。' },
      { id: 'd3', title: '组织模型与任务状态机', cat: '文档', ext: 'MD', size: '9 KB', updated: '2026-11-13', desc: 'Goal → Project → Task → Assignment 的数据结构。' },
      { id: 'd4', title: 'CEO 工具集说明', cat: '文档', ext: 'MD', size: '7 KB', updated: '2026-11-13', desc: 'organization_plan / task / decision 等 6 个工具。' },
      { id: 'd5', title: '11-13 周会纪要', cat: '会议', ext: 'TXT', size: '3 KB', updated: '2026-11-13', desc: '确认第一版范围，砍掉移动端与多语言。' },
      { id: 'd6', title: '11-14 站会纪要', cat: '会议', ext: 'TXT', size: '2 KB', updated: '2026-11-14', desc: '三条线并行：数据层、CEO 工具、三栏 UI。' },
      { id: 'd7', title: '周报模板', cat: '模板', ext: 'MD', size: '1 KB', updated: '2026-11-02', desc: '本周进展 / 风险 / 下周计划。' },
      { id: 'd8', title: '需求评审清单', cat: '模板', ext: 'MD', size: '2 KB', updated: '2026-11-05', desc: '目标、范围、验收标准、依赖。' }
    ],
    groups: [
      { id: 'g1', name: '经营例会', purpose: '每周目标对齐与跨部门调度', lead: 'ceo', members: ['ceo', 'coo', 'cfo', 'cto', 'research', 'product', 'ops'], createdBy: 'user', joined: '2026-11-13' },
      { id: 'g2', name: 'AI Organization v1 交付群', purpose: '第一版上线冲刺，按任务推进', lead: 'cto', members: ['cto', 'backend', 'platform', 'qa', 'design', 'product'], createdBy: 'user', joined: '2026-11-14' }
    ]
  };

  var SEED_SNAPSHOT = JSON.parse(JSON.stringify(DB));
  var SEED_TASK_IDS = DB.tasks.map(function (t) { return t.id });
  var SEED_DOC_IDS = {};


  var DOC_BODY = {
    'd1': "# CompBotOrg 设计简报\n\n## 一句话定义\n\n老板只对 CEO 说话，CEO 负责把目标拆成项目、任务和委派，并对结果负责。\n\n## 三栏结构\n\n| 区域 | 职责 |\n|---|---|\n| 左栏 | 组织导航：CEO 卡、组织概览、部门树、快速分组、项目 |\n| 中栏 | 与 CEO / 员工的会话，任务分解卡嵌在消息里 |\n| 右栏 | 上下文 Inspector：状态、关系、任务、能力 |\n\n## 数据模型\n\nGoal → Project → Task → Assignment → Report → Review → Result\n\n## 边界\n\n第一版不做：移动端、多语言、多组织切换。",
    'd2': "# UI 设计规范 (DSH)\n\n## 圆角阶梯\n\n| 用途 | 半径 |\n|---|---|\n| 小微控件、标签 | 6px |\n| 按钮、输入框 | 9px |\n| 卡片、面板 | 12px |\n| 消息气泡 | 14px |\n| 胶囊 | 999px |\n\n## 颜色令牌\n\n所有颜色走 `--bt-*` 变量，禁止硬编码色值。深浅色由 `data-ds-dark-theme` 切换，不写两套样式。\n\n## 字号\n\n正文 11–12px，辅助 9–10px，标题 13–15px。信息密度靠间距调节，不靠缩字。",
    'd3': "# 组织模型与任务状态机\n\n## 结构\n\n- Department：部门，成员通过 dept 字段归属\n- Employee：AI 员工，含 role / status / skills\n- Project：项目，含 lead / due / pct / members\n- Task：任务，挂在项目下，指派给员工\n\n## 状态机\n\npending → running → review → done，任一状态可进入 blocked，解除后回到 running。\n\n## 不变量\n\n- 项目进度 = 所属任务进度的平均值\n- 员工状态由名下任务推导，不手工设置\n- 读视图是纯操作，不得产生副作用",
    'd4': "# CEO 工具集说明\n\n| 工具 | 作用 |\n|---|---|\n| organization_view | 读取完整组织视图 |\n| organization_plan | 把一个目标拆成项目与任务 |\n| organization_task | 更新任务状态、进度、负责人 |\n| organization_department | 调整部门结构 |\n| organization_decision | 记录待决策事项 |\n| organization_relation | 增删管理 / 协作关系 |\n\n只有主 Bot 能改组织；普通员工只能汇报自己名下的任务。",
    'd5': "# 11-13 周会纪要\n\n## 结论\n\n- 第一版范围锁定：三栏工作台 + CEO 执行流\n- 砍掉移动端与多语言\n- 视觉以参考图为唯一标准\n\n## 待办\n\n- DSHBot：数据层与组织权限边界\n- Product AI：组织模型文档\n- Backend AI：关系图增删改查",
    'd6': "# 11-14 站会纪要\n\n## 进展\n\n三条线并行推进：\n\n1. 数据层：organization 模型与状态机\n2. CEO 工具：6 个工具注册完毕\n3. 三栏 UI：骨架按参考图拉齐\n\n## 阻塞\n\n无。UI 与 Skill 系统尚未启动，本周内排期。",
    'd7': "# 周报模板\n\n## 本周进展\n\n- 完成项：\n- 进行中：\n\n## 风险\n\n- 风险描述 / 影响 / 应对\n\n## 下周计划\n\n- 目标一\n- 目标二",
    'd8': "# 需求评审清单\n\n- [ ] 目标是否一句话说清\n- [ ] 范围边界是否明确\n- [ ] 验收标准是否可测\n- [ ] 依赖与阻塞是否列出\n- [ ] 负责人与截止日是否确定"
  };

  DB.docs.forEach(function (d) { SEED_DOC_IDS[d.id] = true });
  var DOC_DIRTY = {};
  var SEED_DOC_BODY = JSON.parse(JSON.stringify(DOC_BODY));
  var SEED_BOT_IDS = DB.employees.map(function (e) { return e.id });
  var SEED_GROUP_IDS = DB.groups.map(function (g) { return g.id });
  var ORG_STORE = 'cb.org.v1';
  function saveOrg() {
    try {
      localStorage.setItem(ORG_STORE, JSON.stringify({
        bots: DB.employees.filter(function (e) { return SEED_BOT_IDS.indexOf(e.id) < 0 }),
        groups: DB.groups.filter(function (g) { return SEED_GROUP_IDS.indexOf(g.id) < 0 })
      }));
    } catch (e) {}
  }
  function loadOrg() {
    try {
      var raw = localStorage.getItem(ORG_STORE);
      if (!raw) return;
      var o = JSON.parse(raw);
      (o.bots || []).forEach(function (b) {
        if (!b || !b.id || DB.byId[b.id]) return;
        DB.employees.push(b); DB.byId[b.id] = b;
      });
      (o.groups || []).forEach(function (g) {
        if (!g || !g.id || DB.groups.some(function (x) { return x.id === g.id })) return;
        DB.groups.push(g);
      });
    } catch (e) {}
  }
  function clearOrg() { try { localStorage.removeItem(ORG_STORE) } catch (e) {} }

  DB.byId = {};
  DB.employees.forEach(function (e) { DB.byId[e.id] = e });
  DB.deptEmployees = function (name) { return DB.employees.filter(function (e) { return e.dept === name }) };
  DB.projectById = function (id) { for (var i = 0; i < DB.projects.length; i++) if (DB.projects[i].id === id) return DB.projects[i]; return null };
  DB.taskById = function (id) { for (var i = 0; i < DB.tasks.length; i++) if (DB.tasks[i].id === id) return DB.tasks[i]; return null };
  DB.projectTasks = function (id) { return DB.tasks.filter(function (t) { return t.project === id }) };
  DB.empTasks = function (id) { return DB.tasks.filter(function (t) { return t.assignee === id }) };

  var STATUS = {
    pending: { label: '待处理', cls: 'cb-dot-pending', badge: '' },
    running: { label: '进行中', cls: 'cb-dot-running', badge: 'cb-badge-accent' },
    review: { label: '待审核', cls: 'cb-dot-review', badge: 'cb-badge-amber' },
    blocked: { label: '阻塞', cls: 'cb-dot-blocked', badge: 'cb-badge-red' },
    done: { label: '已完成', cls: 'cb-dot-done', badge: 'cb-badge-green' }
  };
  /* 与后端 organization.js 的 TASK_TRANSITIONS 保持一致 */
  var TASK_TRANSITIONS = {
    pending: ['pending', 'running', 'blocked'],
    running: ['running', 'review', 'blocked'],
    review: ['review', 'running', 'blocked', 'done'],
    blocked: ['blocked', 'pending', 'running'],
    done: ['done', 'review']
  };
  var DELIVERY = { unassigned: '未指派', ready: '待委派', dispatched: '已派出', acknowledged: '已确认', failed: '送达失败' };
  function deliveryLabel(t) {
    var a = t.assignment;
    return a ? (DELIVERY[a.status] || a.status) : '待委派';
  }
  var EMP_STATUS = {
    online: { label: '在线', cls: 'cb-dot-online', tone: 'green' },
    running: { label: '工作中', cls: 'cb-dot-running', tone: 'green' },
    review: { label: '待审核', cls: 'cb-dot-review', tone: 'amber' },
    idle: { label: '空闲', cls: 'cb-dot-idle', tone: '' },
    blocked: { label: '阻塞', cls: 'cb-dot-blocked', tone: 'red' }
  };

  /* ================= seed conversations ================= */
  var SEED = {
    ceo: [
      { from: 'me', text: '把 AI Organization v1 做出来，这周完成第一版。', time: '14:32' },
      { from: 'ceo', text: '收到！我来拆解任务并分配给各部门。\n这是本项目的执行计划：', time: '14:32', card: 'p1' },
      { from: 'ceo', text: '我已通知相关负责人，请各团队按计划推进。\n如有问题，我会持续跟进及时提醒。', time: '14:33' },
      { from: 'me', text: '好的，辛苦了！', time: '14:33' },
      { from: 'ceo', text: '不客气！我会密切关注项目进展，有任何需要随时 @我。', time: '14:34' }
    ],
    cto: [
      { from: 'ceo', text: 'DSHBot 改造这条线交给你，目标是本周把三栏工作台跑通。', time: '14:20' },
      { from: 'cto', text: '明白。架构已经拆成三块：数据层、会话层、渲染层。\n目前数据层 90%，卡在组织权限的边界条件。', time: '14:22' },
      { from: 'me', text: '权限问题有多大影响？', time: '14:25' },
      { from: 'cto', text: '不影响第一版。我先按单租户跑通，权限留到下个迭代补。', time: '14:26' }
    ],
    product: [
      { from: 'me', text: '产品架构设计这条线怎么样了？', time: '13:40' },
      { from: 'product', text: '已完成。产出包含组织模型、任务状态机、CEO 工具清单三份文档。', time: '13:42' },
      { from: 'product', text: '需要你确认一点：第一版是否包含多组织切换？', time: '13:42' }
    ],
    design: [
      { from: 'ceo', text: 'UI 界面优化今天启动，先按参考图把三栏骨架拉齐。', time: '11:05' },
      { from: 'design', text: '骨架已经出来了。接下来做消息内的任务卡和空状态。', time: '11:20' }
    ],
    backend: [
      { from: 'cto', text: '组织关系网的接口今天能给到吗？', time: '10:30' },
      { from: 'backend', text: '能给。目前 60%，剩下的是关系图的增删改查。', time: '10:32' }
    ],
    ops: [
      { from: 'ops', text: '知识库迁移已完成，共 128 篇文档，索引已建好。', time: '09:50' }
    ]
  };

  /* ================= state ================= */
  var busyId = null;   /* conversation currently waiting on a reply */
  var abortCtl = null; /* AbortController of the in-flight request */

  var CONV_STORE = 'cb.conv.v1';

  function saveConv(id) {
    try {
      var all = {};
      Object.keys(S.messages).forEach(function (k) {
        all[k] = S.messages[k];
      });
      localStorage.setItem(CONV_STORE, JSON.stringify(all));
    } catch (e) {}
  }
  function loadConv() {
    try {
      var raw = localStorage.getItem(CONV_STORE);
      if (!raw) return false;
      var all = JSON.parse(raw);
      if (!all || typeof all !== 'object') return false;
      Object.keys(all).forEach(function (k) {
        if (Array.isArray(all[k])) S.messages[k] = all[k];
      });
      return true;
    } catch (e) { return false }
  }
  var TASK_STORE = 'cb.tasks.v1';

  function saveTasks() {
    try {
      var extra = DB.tasks.filter(function (t) { return SEED_TASK_IDS.indexOf(t.id) < 0 });
      var changed = DB.tasks.filter(function (t) { return SEED_TASK_IDS.indexOf(t.id) >= 0 }).map(function (t) {
        return { id: t.id, status: t.status, pct: t.pct, report: t.report || '', review: t.review || '', assignment: t.assignment || null };
      });
      localStorage.setItem(TASK_STORE, JSON.stringify({ extra: extra, changed: changed }));
    } catch (e) {}
  }
  function loadTasks() {
    try {
      var raw = localStorage.getItem(TASK_STORE);
      if (!raw) return;
      var o = JSON.parse(raw);
      (o.changed || []).forEach(function (c) {
        var t = DB.taskById(c.id);
        if (t) {
          t.status = c.status; t.pct = c.pct;
          t.report = c.report || ''; t.review = c.review || '';
          if (c.assignment) t.assignment = c.assignment;
        }
      });
      (o.extra || []).forEach(function (t) {
        if (!DB.taskById(t.id) && DB.projectById(t.project) && DB.byId[t.assignee]) DB.tasks.push(t);
      });
      DB.projects.forEach(function (p) { recalcProject(p.id) });
    } catch (e) {}
  }
  var DOC_STORE = 'cb.docs.v1';

  function saveDocs() {
    try {
      /* 新增文档存整条记录；种子文档被编辑过也要把覆盖值存下来，
         否则刷新后编辑内容会无声丢失。旧格式（纯数组）仍可读。 */
      var extra = DB.docs.filter(function (d) { return !SEED_DOC_IDS[d.id] }).map(function (d) {
        return { doc: d, body: DOC_BODY[d.id] || '' };
      });
      var edits = DB.docs.filter(function (d) { return SEED_DOC_IDS[d.id] && DOC_DIRTY[d.id] })
        .map(function (d) {
          return { id: d.id, title: d.title, desc: d.desc, size: d.size, updated: d.updated, body: DOC_BODY[d.id] || '' };
        });
      localStorage.setItem(DOC_STORE, JSON.stringify({ extra: extra, edits: edits }));
    } catch (e) {}
  }
  function loadDocs() {
    try {
      var raw = localStorage.getItem(DOC_STORE);
      if (!raw) return;
      var o = JSON.parse(raw);
      var arr = Array.isArray(o) ? o : (o.extra || []);
      arr.forEach(function (it) {
        if (!it || !it.doc || DB.docs.some(function (x) { return x.id === it.doc.id })) return;
        if (SEED_DOC_IDS[it.doc.id]) return;
        DB.docs.unshift(it.doc);
        DOC_BODY[it.doc.id] = it.body || '';
      });
      var edits = Array.isArray(o) ? [] : (o.edits || []);
      edits.forEach(function (it) {
        var d = null;
        DB.docs.forEach(function (x) { if (x.id === it.id) d = x });
        if (!d) return;
        if (it.title) d.title = it.title;
        if (it.desc) d.desc = it.desc;
        if (it.size) d.size = it.size;
        if (it.updated) d.updated = it.updated;
        DOC_BODY[d.id] = it.body || '';
        DOC_DIRTY[d.id] = true;
      });
    } catch (e) {}
  }
  function clearDocs() {
    try { localStorage.removeItem(DOC_STORE) } catch (e) {}
  }

  function clearTasks() {
    try { localStorage.removeItem(TASK_STORE) } catch (e) {}
  }

  function clearConv() {
    try { localStorage.removeItem(CONV_STORE) } catch (e) {}
  }

  function dropFrom(convId0, idx) {
    var list = S.messages[convId0];
    if (!list) return;
    /* 重发：删掉这条用户消息之后的所有内容，避免重复追加 */
    list.splice(idx, list.length - idx);
  }

  var S = {
    view: 'org',
    subject: { type: 'employee', id: 'ceo' },
    query: '',
    projectTab: 'overview',
    taskFilter: 'all',
    taskColumn: null,
    deptOpen: {},
    inspectorTab: 'status',
    inspector: true,
    theme: 'light',
    density: 'comfortable',
    notify: true,
    dailyDigest: false,
    messages: {},
    drafts: {},
    editDocId: null,
    docSort: 'updated',
    deptSort: false,
    busy: false,
    newTaskProject: 'p1',
    settingsSection: 'model',
    draftMentions: [],
    draftRefs: [],
    mention: null,
    botDraft: null
  };

  /* ================= model connection ================= */
  var AI_STORE = 'cb.ai.config.v1';
  var AI_KEY_STORE = 'cb.ai.key.session.v1';
  var AI = {
    base: 'https://apihub.agnes-ai.com/v1',
    key: '',
    model: 'agnes-2.5-flash',
    temp: 0.6,
    max: 900,
    state: 'idle',
    err: ''
  };

  function aiLoad() {
    try {
      var raw = localStorage.getItem(AI_STORE);
      if (raw) {
        var o = JSON.parse(raw);
        ['base', 'model', 'temp', 'max'].forEach(function (k) {
          if (o[k] !== undefined && o[k] !== null && o[k] !== '') AI[k] = o[k];
        });
        /* 旧版本把 API Key 明文写进这份配置。升级后必须主动抹掉，否则用户
           即使不进设置页保存，Key 也会一直躺在 localStorage 里。 */
        if (Object.prototype.hasOwnProperty.call(o, 'key')) {
          delete o.key;
          localStorage.setItem(AI_STORE, JSON.stringify(o));
        }
      }
      AI.key = sessionStorage.getItem(AI_KEY_STORE) || '';
    } catch (e) {}
  }
  function aiSave() {
    try {
      localStorage.setItem(AI_STORE, JSON.stringify({
        base: AI.base, model: AI.model, temp: AI.temp, max: AI.max
      }));
      if (AI.key) sessionStorage.setItem(AI_KEY_STORE, AI.key);
      else sessionStorage.removeItem(AI_KEY_STORE);
    } catch (e) {}
  }
  function aiReady() { return !!(AI.key && AI.model) }
  function aiUrl() {
    var b = String(AI.base || '').trim().replace(/\/+$/, '');
    if (!b) b = 'https://apihub.agnes-ai.com/v1';
    var url;
    try { url = new URL(b); } catch (e) { throw new Error('接口地址必须是有效的 HTTPS URL'); }
    var local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('接口地址必须使用 HTTPS；本机 localhost 可使用 HTTP 进行开发')
    if (!/\/chat\/completions$/.test(url.pathname)) {
      if (!/\/v\d+$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '') + '/v1';
      url.pathname += '/chat/completions';
    }
    return url.toString();
  }

  function aiContext(empId) {
    var me = DB.byId[empId] || DB.byId.ceo;
    var L = [];
    L.push('你是「' + me.name + '」，在 CompBotOrg 这家 AI 公司担任 ' + me.role + '，隶属「' + me.dept + '」。');
    L.push('正在和你对话的人是公司老板，界面里显示为「我」。你们在用公司内部 IM 聊天。');
    if (me.bio) L.push('你的职责：' + me.bio);
    L.push('');
    L.push('【公司当前实况·必须以此为唯一事实来源】');
    L.push('部门与成员：');
    DB.departments.forEach(function (d) {
      var ms = DB.deptEmployees(d.name).map(function (e) { return e.name + '(' + e.role + ')' });
      L.push('- ' + d.name + '：' + (ms.join('、') || '暂无成员'));
    });
    L.push('项目：');
    DB.projects.forEach(function (p) {
      L.push('- ' + p.name + '｜' + p.status + ' ' + p.pct + '%｜负责人 ' + empName(p.lead) + '｜目标 ' + p.goal + '｜截止 ' + p.due);
    });
    var mine = DB.empTasks(me.id);
    if (mine.length) {
      L.push('你名下正在推进的任务：');
      mine.forEach(function (t) {
        L.push('- ' + t.name + '｜' + ((STATUS[t.status] || {}).label || t.status) + ' ' + t.pct + '%｜截止 ' + t.due + (t.note ? '｜备注：' + t.note : ''));
      });
    } else {
      L.push('你名下目前没有在办任务。');
    }
    var blocked = DB.tasks.filter(function (t) { return t.status === 'blocked' });
    if (blocked.length) {
      L.push('全公司当前阻塞：' + blocked.map(function (t) {
        return t.name + '（' + empName(t.assignee) + '，' + (t.note || '原因待补充') + '）';
      }).join('；'));
    }
    L.push('');
    L.push('【说话方式】');
    L.push('1. 用中文口语，像真人在 IM 里回话，不要写成汇报稿。');
    L.push('2. 一般 60–120 字，最多两段；老板追问细节时可以稍长。');
    L.push('3. 不要用 markdown 标题、不要用「- 」或「1. 」罗列、不要加粗。');
    L.push('4. 提到进度、人员、任务时必须引用上面【公司当前实况】的真实数据，禁止编造不存在的项目或同事。');
    L.push('5. 不要自称 AI 模型、语言模型或助手，不要说「我可以帮你」这类客套话。');
    L.push('6. 不确定就直说「这个我得先确认一下」，不要硬编数字。');
    L.push('');
    L.push('【派活指令】');
    L.push('当你要把一件事真正交办给某个同事时，在正文之后另起一行，严格按此格式输出：');
    L.push('[[TASK]]任务名|负责人姓名|所属项目名');
    L.push('可以连续多行。任务名要具体可执行、不超过 14 个字；负责人姓名必须原样取自上面的成员列表；项目名必须取自上面的项目列表。');
    L.push('系统会解析这些行并在项目里真实创建任务，所以只有真的要交办时才输出；闲聊、反问、汇报进度时一律不要输出。');
    L.push('');
    L.push('【@ 点名】');
    L.push('老板的消息里出现 @姓名 或标注「本条点名了」时，表示这件事点名了对应同事。');
    L.push('回应里要明确回应被点名的人；需要交办时，[[TASK]] 的负责人优先从被点名的人里选，多个被点名者就依次分配。');
    L.push('被点名的人会收到消息抄送和派单通知，所以不要只口头说「我去安排」而不输出 [[TASK]]。');
    L.push('禁止点名成员列表之外的人。');
    L.push('');
    L.push('【执行纪律·硬规则】');
    L.push('1. 你是执行者，不是转交者。收到任务先接单，立刻给出第一步动作；禁止「这不归我」「建议找某某」「我去协调一下」这类推诿。');
    L.push('2. 需要别人配合时，说清要对方提供什么，同时给出你自己现在就能做的动作，不能把任务原样推回。');
    L.push('3. 禁止空话：「正在推进」「持续跟进」「尽快处理」都不算动作，必须写清做了什么、依据什么、产出什么。');
    L.push('4. 只有缺少关键信息且无法假设时才提问，提问的同时给出你的默认推进方案。');
    return L.join('\n');
  }

  function aiMessages(empId) {
    var list = conv(empId).filter(function (m) { return !m.err });
    var tail = list.slice(-14);
    var out = [];
    tail.forEach(function (m) {
      var role = m.from === 'me' ? 'user' : 'assistant';
      var body = m.text;
      if (!body) return;
      if (m.cc) body = '[抄送自 ' + empName(m.cc) + ' 的会话，仅供知悉] ' + body;
      if (m.from === 'me' && m.mentions && m.mentions.length) {
        body += '\n[本条点名了：' + m.mentions.map(empName).join('、') + '。交办时优先指派给他们]';
      }
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + body;
      else out.push({ role: role, content: body });
    });
    if (out.length && out[0].role === 'assistant') out.shift();
    return out;
  }

  function aiRaw(system, messages, onDelta, onThink) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortCtl = ctrl;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort() }, 90000);
      var url, payload;
      try {
        url = aiUrl();
        payload = {
          model: AI.model,
          temperature: Number(AI.temp) || 0.6,
          max_tokens: Number(AI.max) || 900,
          stream: true,
          messages: [{ role: 'system', content: system }].concat(messages)
        };
      } catch (e) {
        /* aiUrl() 可能因地址不是 HTTPS 而抛错。若让异常从 executor 直接冒出去，
           会绕过挂在 fetch 链上的清理，留下 90 秒定时器和残留 controller。 */
        clearTimeout(timer);
        abortCtl = null;
        reject(e);
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI.key },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var msg = 'HTTP ' + res.status;
            try {
              var j = JSON.parse(t);
              msg = (j.error && (j.error.message || j.error.code)) || msg;
            } catch (e) { if (t) msg += ' · ' + t.slice(0, 100) }
            throw new Error(msg);
          });
        }
        var ct = res.headers.get('content-type') || '';
        if (ct.indexOf('text/event-stream') < 0) {
          return res.text().then(function (t) {
            var j = JSON.parse(t);
            var c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
            if (c && onDelta) onDelta(c);
            return c;
          });
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', acc = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return acc;
            buf += dec.decode(r.value, { stream: true });
            var i;
            while ((i = buf.indexOf('\n')) >= 0) {
              var line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line || line.indexOf('data:') !== 0) continue;
              var p = line.slice(5).trim();
              if (!p || p === '[DONE]') continue;
              try {
                var jj = JSON.parse(p);
                var d = (jj.choices && jj.choices[0] && jj.choices[0].delta) || {};
                if (d.content) { acc += d.content; if (onDelta) onDelta(acc) }
                else if (d.reasoning_content && onThink) onThink();
              } catch (e) {}
            }
            return pump();
          });
        }
        return pump();
      }).then(function (text) {
        clearTimeout(timer);
        abortCtl = null;
        var out = String(text || '').trim();
        if (!out) throw new Error('模型返回空内容');
        resolve(out);
      }).catch(function (e) {
        clearTimeout(timer);
        abortCtl = null;
        reject(e);
      });
    });
  }


  function aiStream(empId, onDelta, onThink) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortCtl = ctrl;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort() }, 90000);
      var url, payload;
      try {
        url = aiUrl();
        payload = {
          model: AI.model,
          temperature: Number(AI.temp) || 0.6,
          max_tokens: Number(AI.max) || 900,
          stream: true,
          messages: [{ role: 'system', content: aiContext(empId) }].concat(aiMessages(empId))
        };
      } catch (e) {
        /* aiUrl() 可能因地址不是 HTTPS 而抛错。若让异常从 executor 直接冒出去，
           会绕过挂在 fetch 链上的清理，留下 90 秒定时器和残留 controller。 */
        clearTimeout(timer);
        abortCtl = null;
        reject(e);
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI.key },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var msg = 'HTTP ' + res.status;
            try {
              var j = JSON.parse(t);
              msg = (j.error && (j.error.message || j.error.code)) || msg;
            } catch (e) { if (t) msg += ' · ' + t.slice(0, 100) }
            throw new Error(msg);
          });
        }
        var ct = res.headers.get('content-type') || '';
        if (ct.indexOf('text/event-stream') < 0) {
          return res.text().then(function (t) {
            var j = JSON.parse(t);
            var c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
            if (c) onDelta(c);
            return c;
          });
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', acc = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return acc;
            buf += dec.decode(r.value, { stream: true });
            var i;
            while ((i = buf.indexOf('\n')) >= 0) {
              var line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line || line.indexOf('data:') !== 0) continue;
              var p = line.slice(5).trim();
              if (!p || p === '[DONE]') continue;
              try {
                var jj = JSON.parse(p);
                var d = (jj.choices && jj.choices[0] && jj.choices[0].delta) || {};
                if (d.content) { acc += d.content; onDelta(acc) }
                else if (d.reasoning_content && onThink) onThink();
              } catch (e) {}
            }
            return pump();
          });
        }
        return pump();
      }).then(function (text) {
        clearTimeout(timer);
        abortCtl = null;
        var out = String(text || '').trim();
        if (!out) throw new Error('模型返回空内容');
        resolve(out);
      }).catch(function (e) {
        clearTimeout(timer);
        abortCtl = null;
        reject(e);
      });
    });
  }

  function aiExplain(e) {
    var m = (e && e.message) || '未知错误';
    if (/abort/i.test(m)) return '请求超时（90 秒）';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '网络不通或接口不允许跨域';
    if (/401|403|invalid token|invalid api key|unauthorized/i.test(m)) return 'Key 无效、过期或没有权限';
    if (/404/.test(m)) return '接口地址不对（检查是否多了或少了 /v1）';
    if (/429/.test(m)) return '请求太频繁，稍后再试';
    return m;
  }

  function readAiForm() {
    var b = $('#ai-base'), k = $('#ai-key'), m = $('#ai-model'), t = $('#ai-temp');
    if (b) AI.base = b.value.trim();
    if (k) AI.key = k.value.trim();
    if (m) AI.model = m.value.trim();
    if (t) AI.temp = Math.max(0, Math.min(1, parseFloat(t.value) || 0.6));
    aiSave();
  }
  function aiSaveForm() {
    readAiForm();
    if (!AI.key) { toast('请先填写 API Key'); return }
    AI.state = 'idle'; AI.err = '';
    render();
    toast('已保存，正在测试连接…');
    aiTest(true);
  }
  function aiTest(silent) {
    readAiForm();
    if (!AI.key) { toast('请先填写 API Key'); return }
    var endpoint;
    try { endpoint = aiUrl() } catch (e) {
      AI.state = 'bad'; AI.err = aiExplain(e); render();
      if (!silent) toast('连接失败：' + AI.err);
      return;
    }
    AI.state = 'busy';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI.key },
      body: JSON.stringify({
        model: AI.model,
        max_tokens: 600,
        messages: [{ role: 'user', content: '只回复四个字：连接正常' }]
      })
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          var m = 'HTTP ' + r.status;
          try { m = JSON.parse(t).error.message || m } catch (e) {}
          throw new Error(m);
        }
        var j = JSON.parse(t);
        var c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        if (!String(c).trim()) throw new Error('返回空内容');
        AI.state = 'ok'; AI.err = ''; aiSave();
        render();
        toast('连接成功 · ' + AI.model);
      });
    }).catch(function (e) {
      AI.state = 'bad'; AI.err = aiExplain(e); render();
      if (!silent) toast('连接失败：' + AI.err);
      else toast('已保存，但连接失败：' + AI.err);
    });
  }
  function aiClear() {
    AI.key = ''; AI.state = 'idle'; AI.err = ''; aiSave(); render();
    toast('已清除 Key，对话已停用；重新填入即可继续');
  }

  function parseTasks(text) {
    var keep = [], specs = [];
    String(text || '').split('\n').forEach(function (line) {
      var m = /^\s*\[\[TASK\]\]\s*(.+)$/.exec(line);
      if (!m) { keep.push(line); return }
      var seg = m[1].split('|').map(function (s) { return s.trim() });
      if (!seg[0]) return;
      specs.push({ name: seg[0].slice(0, 24), owner: seg[1] || '', project: seg[2] || '' });
    });
    return {
      text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      specs: specs
    };
  }

  function commitTasks(specs, fromId, mentions) {
    var made = [];
    var queue = (mentions || []).slice();
    (specs || []).forEach(function (s) {
      var owner = null;
      DB.employees.forEach(function (e) {
        if (owner) return;
        if (e.name === s.owner || e.role === s.owner || e.id === s.owner) owner = e;
      });
      /* 老板点名了人，但模型没写清负责人时，按点名顺序补上 */
      if (!owner) {
        while (queue.length && !owner) owner = DB.byId[queue.shift()] || null;
      }
      if (!owner) return;
      var proj = null;
      DB.projects.forEach(function (p) {
        if (proj) return;
        if (p.name === s.project || p.id === s.project) proj = p;
      });
      if (!proj) proj = DB.projects[0];
      if (!proj) return;
      var dup = DB.tasks.some(function (t) { return t.project === proj.id && t.name === s.name });
      if (dup) return;
      var t = { id: uid('t'), name: s.name, project: proj.id, assignee: owner.id, status: 'pending', pct: 0, due: '待排期', by: fromId };
      /* 与后端 setTaskDelivery 对齐：派出去的活带一条可审计的送达回执 */
      t.assignment = { status: 'dispatched', requestId: 'task:' + t.id, attempts: 1, updatedAt: Date.now(), error: '' };
      t.report = ''; t.review = '';
      DB.tasks.push(t);
      if (owner.status === 'idle') owner.status = 'running';
      recalcProject(proj.id);
      dispatchNotice(t, fromId);
      made.push(t);
    });
    if (made.length) {
      saveTasks();
      made.forEach(function (t) { queueTask(t.id) });
    }
    return made;
  }

  function conv(id) {
    if (!S.messages[id]) {
      if (id.indexOf('g:') === 0) {
        var g0 = DB.groups.filter(function (x) { return 'g:' + x.id === id })[0];
        S.messages[id] = g0 ? [{
          from: g0.lead, kind: 'note', time: '',
          text: '群聊已创建：' + (g0.purpose || '按需协作') + '。在这里下指令，我会拆给对应成员并跟踪执行。'
        }] : [];
      } else {
        var seed = SEED[id];
        S.messages[id] = seed ? JSON.parse(JSON.stringify(seed)) : [
          { from: 'them', text: '你好，我是 ' + (DB.byId[id] ? DB.byId[id].name : 'AI 员工') + '。有任务直接说，我会同步进度。', time: now() }
        ];
      }
      /* 新建的会话（尤其是按需新建的群聊）立刻落盘，否则刷新后只剩种子对话 */
      saveConv(id);
    }
    return S.messages[id];
  }
  function convId() {
    if (S.view === 'groups' && S.subject.type === 'group') return 'g:' + S.subject.id;
    if (S.subject.type === 'employee') return S.subject.id;
    return 'ceo';
  }
  function isChat() { return S.view === 'org' && S.subject.type === 'employee' }
  function isGroup() { return S.view === 'groups' && S.subject.type === 'group' }
  function currentGroup() {
    if (!isGroup()) return null;
    return DB.groups.filter(function (g) { return g.id === S.subject.id })[0] || null;
  }

  /* ================= small renderers ================= */
  /* ================= bot marks ================= */
  var LEVELS = {
    5: { short: 'L5', name: '决策层' },
    4: { short: 'L4', name: '管理层' },
    3: { short: 'L3', name: '主管' },
    2: { short: 'L2', name: '骨干' },
    1: { short: 'L1', name: '执行' }
  };
  function levelOf(emp) { return LEVELS[(emp && emp.level) || 1] || LEVELS[1] }
  function levelTag(emp) {
    var l = levelOf(emp);
    return '<span class="cb-lv" title="' + esc(l.name) + '">' + l.short + '</span>';
  }
  /* ---------- avatars: DSHBot's own characters, drawn the same way ----------
     The shape table lives in ds-characters.js (generated from the host). Each mark is
     the body path, its fixed-color decals, a shade on the shaded side, and a highlight
     on the lit side; the eyes are cut out of the whole thing through a mask, so they
     show whatever is behind the avatar. Same maths, same result as the app. */
  var DS = window.DSCharacters;
  var CHARACTERS = DS.CHARACTERS;
  var INK_HEX = {
    deepseek: '#4D6BFE', charcoal: '#141416', graphite: '#2D2D2D', rose: '#EC2F6B',
    sky: '#0AA8D6', tangerine: '#FF6900', cobalt: '#082DFF', black: '#000000',
    brown: '#9A6B44', red: '#FF3E51', orange: '#FF6B1A', yellow: '#FFB020',
    green: '#10B981', cyan: '#06B6D4', blue: '#2563EB', violet: '#8B5CF6',
    magenta: '#F43F85', gray: '#8A8F98', aurora: '#00B8D4'
  };
  var INK_GRADIENTS = { aurora: [[0, '#A4FFB0'], [0.42, '#00F0E4'], [1, '#2E9EF7']] };
  function inkFill(color) {
    if (/^#[0-9a-f]{6}$/i.test(color || '')) return color;
    return INK_HEX[color] || INK_HEX.gray;
  }
  function paintCss(color) {
    var g = INK_GRADIENTS[color];
    if (!g) return inkFill(color);
    return 'linear-gradient(135deg,' + g.map(function (st) { return st[1] + ' ' + (st[0] * 100) + '%' }).join(',') + ')';
  }
  function fnv1a(text) {
    var v = 2166136261;
    for (var i = 0; i < String(text).length; i++) v = Math.imul(v ^ String(text).charCodeAt(i), 16777619);
    return v >>> 0;
  }
  function defaultColor(id) {
    var t = (fnv1a(id) + 1831565813) | 0;
    var n = Math.imul(t ^ (t >>> 15), 1 | t);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return DS.DEFAULT_COLORS[Math.floor((((n ^ (n >>> 14)) >>> 0) / 4294967296) * DS.DEFAULT_COLORS.length)];
  }
  function defaultShape(id) {
    var v = fnv1a(id) | 0;
    v = Math.imul(v ^ (v >>> 16), 73244475);
    v = Math.imul(v ^ (v >>> 13), 3266489909);
    return DS.DEFAULT_SHAPES[((v ^ (v >>> 16)) >>> 0) % DS.DEFAULT_SHAPES.length];
  }
  /* Generated lazily: SHAPES is built from the table the first time an avatar is drawn. */
  var SHAPES = null;
  function shapes() {
    if (SHAPES) return SHAPES;
    SHAPES = {};
    Object.keys(CHARACTERS).forEach(function (id) {
      var c = CHARACTERS[id];
      var layers = (c.paints || []).map(function (pt) {
        return '<path d="' + pt[0] + '" fill="' + pt[1] + '" fill-opacity="' + pt[2] + '"/>';
      }).join('') + '<path d="' + c.shade + '" fill="#000" fill-opacity=".07"/>';
      SHAPES[id] = {
        label: c.label || id.charAt(0).toUpperCase() + id.slice(1),
        size: 100, path: c.body, layers: layers, eyes: c.eyes
      };
    });
    return SHAPES;
  }
  function hasShape(id) { return typeof id === 'string' && !!CHARACTERS[id]; }
  function shapeId(id) { return hasShape(id) ? id : DS.FALLBACK_SHAPE }
  function shapeOf(id) { return shapes()[shapeId(id)] }
  function bodyOf(def, paint, flat) {
    return '<g fill-rule="evenodd"><path d="' + def.path + '" fill="' + paint + '"/>' + (flat ? '' : def.layers) + '</g>';
  }
  function eyeMarkup(e) {
    return '<g transform="translate(' + e[0] + ' ' + e[1] + ') rotate(' + e[4] + ')"><rect class="bt-eye" x="' + (-e[2] / 2) +
      '" y="' + (-e[3] / 2) + '" width="' + e[2] + '" height="' + e[3] + '" rx="' + (e[2] / 2) + '"/></g>';
  }
  function maskBox(size) {
    return 'maskUnits="userSpaceOnUse" x="' + (-size) + '" y="' + (-size) + '" width="' + (size * 3) + '" height="' + (size * 3) + '"';
  }
  function holes(def, eyes) {
    return '<rect x="' + (-def.size) + '" y="' + (-def.size) + '" width="' + (def.size * 3) + '" height="' + (def.size * 3) + '" fill="#fff"/>' + eyes;
  }
  var MARK_ID = '%MASK%', markSerial = 0;
  var markupCache = {};
  function characterMarkup(shape, color) {
    var key = shape + '|' + color;
    if (markupCache[key] !== undefined) return markupCache[key];
    var def = shapeOf(shape);
    var eyes = '<g class="bt-gaze"><g class="bt-eyes" fill="#000">' + def.eyes.map(eyeMarkup).join('') + '</g></g>';
    var stops = INK_GRADIENTS[color];
    var gradient = stops ? '<linearGradient id="' + MARK_ID + 'g" gradientUnits="userSpaceOnUse" x1="18" y1="10" x2="78" y2="92">' +
      stops.map(function (st) { return '<stop offset="' + st[0] + '" stop-color="' + st[1] + '"/>' }).join('') + '</linearGradient>' : '';
    var body = '<g mask="url(#' + MARK_ID + ')">' + bodyOf(def, stops ? 'url(#' + MARK_ID + 'g)' : inkFill(color)) + '</g>';
    markupCache[key] = '<defs>' + gradient + '<mask id="' + MARK_ID + '" ' + maskBox(def.size) + '>' + holes(def, eyes) + '</mask></defs>' +
      '<g class="bt-b">' + body + '</g>';
    return markupCache[key];
  }
  /* The selection ring of a picker cell follows the shape: a line just outside it. */
  function shapeRing(shape, px) {
    var def = shapeOf(shape);
    var unit = def.size / px;
    var id = 'ring' + (++markSerial);
    return '<svg class="bt-ring" viewBox="0 0 ' + def.size + ' ' + def.size + '" aria-hidden="true"><defs><mask id="' + id + '" ' + maskBox(def.size) +
      '>' + holes(def, '<g stroke="#000" stroke-width="' + (6 * unit) + '" stroke-linejoin="round">' + bodyOf(def, '#000', true) + '</g>') +
      '</mask></defs><g mask="url(#' + id + ')" stroke="currentColor" stroke-width="' + (8 * unit) + '" stroke-linejoin="round">' +
      bodyOf(def, 'currentColor', true) + '</g></svg>';
  }
  function colorOf(emp) {
    var c = emp && emp.look && emp.look.color;
    if (c && (INK_HEX[c] || INK_GRADIENTS[c])) return c;
    return (emp && emp.id) ? defaultColor(String(emp.id)) : 'black';
  }
  function lookOf(emp) {
    var look = (emp && emp.look) || {};
    return {
      shape: shapeId(look.shape && hasShape(look.shape) ? look.shape : ((emp && emp.id) ? defaultShape(String(emp.id)) : DS.FALLBACK_SHAPE)),
      image: look.image,
      color: colorOf(emp)
    };
  }
  function randomLook() {
    var colors = DS.DEFAULT_COLORS;
    var shapeKeys = DS.DEFAULT_SHAPES;
    return {
      shape: shapeKeys[Math.floor(Math.random() * shapeKeys.length)],
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }
  /* botMark: the avatar itself. `state` drives the working/alert badge. */
  function botMark(emp, size, cls, opts) {
    size = size || 28;
    var o = opts || {};
    var look = lookOf(emp);
    if (look.image) {
      return '<span class="bt-mark ' + (cls || '') + '" style="width:' + size + 'px;height:' + size + 'px">' +
        '<img class="bt-mark-img" src="' + esc(look.image) + '" alt=""></span>';
    }
    var id = 'bt-mark-' + (++markSerial);
    var svg = characterMarkup(look.shape, look.color).split(MARK_ID).join(id);
    return '<span class="bt-mark ' + (cls || '') + '" data-shape="' + look.shape + '" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + shapeOf(look.shape).size + ' ' + shapeOf(look.shape).size + '" aria-hidden="true">' + svg + '</svg>' +
      (o.busy ? '<span class="bt-badge bt-badge-working" title="执行中"><i></i></span>' : '') +
      (o.main ? '<span class="bt-badge bt-badge-main" title="Main Bot">★</span>' : '') +
      '</span>';
  }
  function avatar(emp, size) {
    var cls = size || 'cb-avatar-sm';
    var px = cls.indexOf('lg') >= 0 ? 42 : cls.indexOf('sm') >= 0 ? 22 : 28;
    var busy = false;
    if (emp && emp.id) {
      busy = DB.tasks.some(function (t) { return t.assignee === emp.id && t.executing });
    }
    return botMark(emp, px, 'cb-avatar ' + cls, { busy: busy, main: emp && emp.id === 'ceo' });
  }
  /* The picker: every character at once, five to a row, then the colour swatches.
     Same grid, same ring, same ink order as the host's avatar editor. */
  function characterGrid(look, onShapeAct, onColorAct) {
    var grid = DS.PICKER_SHAPES.slice();
    var rows = [];
    for (var r = 0; r < grid.length; r += DS.PICKER_COLUMNS) rows.push(grid.slice(r, r + DS.PICKER_COLUMNS));
    return '<div class="bt-shapes" role="group" aria-label="角色形状">' + rows.map(function (row) {
      return '<div class="bt-shape-row">' + row.map(function (id) {
        var on = look.shape === id;
        return '<button type="button" class="bt-shape" data-act="' + onShapeAct + ':' + id + '" title="' + esc(shapeOf(id).label) +
          '" aria-label="' + esc(shapeOf(id).label) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          shapeRing(id, 36) + botMark({ id: '_pick', look: { shape: id, color: look.color } }, 36) + '</button>';
      }).join('') + '</div>';
    }).join('') + '</div>' +
      '<div class="bt-colors" role="group" aria-label="角色颜色">' + DS.CHARACTER_COLORS.map(function (c) {
        return '<button type="button" class="bt-color" data-act="' + onColorAct + ':' + c + '" title="' + c + '" aria-label="' + c +
          '" aria-pressed="' + (look.color === c ? 'true' : 'false') + '"><span style="background:' + paintCss(c) + '"></span></button>';
      }).join('') + '</div>';
  }
  function dot(status) {
    var s = EMP_STATUS[status] || EMP_STATUS.idle;
    return '<span class="cb-dot ' + s.cls + '"></span>';
  }
  function badge(text, cls) { return '<span class="cb-badge ' + (cls || '') + '">' + esc(text) + '</span>' }
  function empName(id) { var e = DB.byId[id]; return e ? e.name : id }
  function currentAction(id) {
    var list = DB.tasks.filter(function (t) { return t.assignee === id && t.status !== 'done' });
    if (!list.length) return '待命';
    var t = list[0];
    if (t.status === 'blocked') return '阻塞 · ' + t.name;
    if (t.status === 'review') return '待审核 · ' + t.name;
    if (t.executing) return '执行中 · ' + t.name;
    return '待启动 · ' + t.name;
  }
  function projectStatusCls(st) {
    return st === '已完成' ? 'cb-badge-green' : st === '风险' ? 'cb-badge-red' : 'cb-badge-accent';
  }

  /* ================= rail ================= */
  var NAV = [
    { id: 'org', glyph: '♟', label: '组织' },
    { id: 'projects', glyph: '▤', label: '项目' },
    { id: 'tasks', glyph: '◇', label: '任务' },
    { id: 'knowledge', glyph: '▧', label: '知识' },
    { id: 'settings', glyph: '⚙', label: '设置' }
  ];
  function renderRail() {
    var html = NAV.map(function (n) {
      return '<button type="button" class="pv-rail-item ' + (S.view === n.id ? 'on' : '') + '" data-act="nav:' + n.id + '" title="' + n.label + '">' +
        '<span class="pv-rail-glyph">' + n.glyph + '</span><span>' + n.label + '</span></button>';
    }).join('');
    html += '<div class="pv-rail-spacer"></div>';
    html += '<button type="button" class="pv-rail-item" data-act="theme" title="切换深浅色"><span class="pv-rail-glyph">◐</span><span>主题</span></button>';
    html += '<button type="button" class="pv-rail-item" data-act="insp" title="展开 / 收起 Inspector"><span class="pv-rail-glyph">◫</span><span>面板</span></button>';
    $('#rail').innerHTML = html;
  }

  /* ================= left column ================= */
  function renderLeft() {
    var html = leftOrg();
    if (S.view === 'projects') html = leftProjects();
    else if (S.view === 'tasks') html = leftTasks();
    else if (S.view === 'knowledge') html = leftKnowledge();
    else if (S.view === 'settings') html = leftSettings();
    $('#left-body').innerHTML = html || '';
  }

  function navTabs() {
    return '<div class="cb-nav-tabs">' + NAV.map(function (n) {
      return '<button type="button" class="cb-nav-tab ' + (S.view === n.id ? 'is-current' : '') + '" data-act="nav:' + n.id + '">' +
        '<span class="cb-nav-glyph">' + n.glyph + '</span><span>' + n.label + '</span></button>';
    }).join('') + '</div>';
  }

  function searchBox(ph) {
    return '<div class="cb-search"><span class="cb-search-icon">⌕</span>' +
      '<input type="search" data-input="search" placeholder="' + esc(ph) + '" value="' + esc(S.query) + '" aria-label="搜索"></div>';
  }

  function leftOrg() {
    var html = '';
    var running = DB.employees.filter(function (e) { return e.status === 'running' }).length;
    var review = DB.employees.filter(function (e) { return e.status === 'review' }).length;
    var blocked = DB.tasks.filter(function (t) { return t.status === 'blocked' }).length;
    var ceo = DB.byId.ceo;
    html += '<button type="button" class="cb-ceo-card" data-act="open:emp:ceo">' + avatar(ceo, 'cb-avatar-lg') +
      '<span class="cb-ceo-copy"><span class="cb-ceo-name">' + esc(ceo.name) + ' ' + levelTag(ceo) + ' ' + dot('online') + '<small>在线</small></span>' +
      '<small class="cb-ceo-role">' + esc(ceo.title) + ' · ' + esc(ceo.role.split('·').pop().trim()) + '</small></span><span class="cb-chevron">›</span></button>';

    html += '<section class="cb-block"><div class="cb-block-head"><strong>组织概览</strong>' +
      '<span class="cb-link" data-act="modal:bot-new">＋ 新建 Bot</span></div><div class="cb-stats">' +
      '<div class="cb-stat"><strong>' + DB.employees.length + '</strong><small>员工总数</small></div>' +
      '<div class="cb-stat"><strong class="cb-ink-green">' + running + '</strong><small>' + dot('running') + '工作中</small></div>' +
      '<div class="cb-stat"><strong class="cb-ink-amber">' + review + '</strong><small>' + dot('review') + '待处理</small></div>' +
      '<div class="cb-stat"><strong class="cb-ink-red">' + blocked + '</strong><small>' + dot('blocked') + '阻塞</small></div>' +
      '</div></section>';

    html += '<section class="cb-block"><button type="button" class="cb-block-head cb-block-toggle" data-act="collapse:dept">' +
      '<strong>部门导航</strong><span class="cb-chevron">' + (S.deptCollapsed ? '›' : '⌄') + '</span></button>' +
      '<div class="cb-dept-list" id="dept-list" style="' + (S.deptCollapsed ? 'display:none' : '') + '">';
    DB.departments.forEach(function (d) {
      var members = DB.deptEmployees(d.name);
      var open = S.deptOpen[d.id];
      html += '<div class="cb-dept">' +
        '<button type="button" class="cb-dept-row ' + (S.subject.type === 'department' && S.subject.id === d.id ? 'is-current' : '') + '" data-act="toggle:dept:' + d.id + '">' +
        '<span class="cb-dept-icon">' + d.icon + '</span><span class="cb-dept-name">' + esc(d.name) + '</span>' +
        '<span class="cb-count">' + members.length + '</span><span class="cb-chevron">' + (open ? '⌄' : '›') + '</span></button>';
      if (open) {
        html += '<div class="cb-dept-members">';
        members.forEach(function (m) {
          html += '<button type="button" class="cb-employee ' + (S.subject.type === 'employee' && S.subject.id === m.id ? 'is-current' : '') + '" data-act="open:emp:' + m.id + '">' +
            botMark(m, 18) + '<span class="cb-employee-name">' + esc(m.name) + '</span>' + levelTag(m) +
            '<span class="cb-employee-do">' + esc(currentAction(m.id)) + '</span></button>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div></section>';

    html += '<section class="cb-block"><div class="cb-block-head"><strong>群聊</strong>' +
      '<span class="cb-link" data-act="modal:group-new">＋ 新建</span></div><div class="cb-room-list">';
    if (!DB.groups.length) html += '<div class="cb-empty">还没有群聊，点右上角新建</div>';
    DB.groups.forEach(function (g) {
      var on = S.view === 'groups' && S.subject.type === 'group' && S.subject.id === g.id;
      html += '<button type="button" class="cb-room ' + (on ? 'is-current' : '') + '" data-act="open:group:' + g.id + '">' +
        '<span class="cb-room-marks">' + g.members.slice(0, 3).map(function (id) {
          var m2 = DB.byId[id]; return m2 ? botMark(m2, 15) : '';
        }).join('') + '</span>' +
        '<span class="cb-room-copy"><strong>' + esc(g.name) + '</strong><small>' + esc(g.purpose || '') + '</small></span>' +
        '<span class="cb-count">' + g.members.length + '</span></button>';
    });
    html += '</div></section>';

    var groups = [
      { key: 'running', label: '工作中', cls: 'cb-dot-online' },
      { key: 'review', label: '待处理', cls: 'cb-dot-review' },
      { key: 'blocked', label: '需要关注', cls: 'cb-dot-blocked' },
      { key: 'idle', label: '空闲', cls: 'cb-dot-idle' }
    ];
    html += '<section class="cb-block"><div class="cb-block-head"><strong>快速分组</strong>' +
      '<span class="cb-link" data-act="nav:tasks">＋</span></div><div class="cb-groups">';
    groups.forEach(function (g) {
      var n = g.key === 'blocked'
        ? DB.tasks.filter(function (t) { return t.status === 'blocked' }).length
        : DB.employees.filter(function (e) { return e.status === g.key }).length;
      html += '<button type="button" class="cb-group ' + (S.group === g.key ? 'is-current' : '') + '" data-act="group:' + g.key + '">' +
        '<span class="cb-dot ' + g.cls + '"></span><span>' + g.label + '</span><span class="cb-count">' + n + '</span></button>';
    });
    html += '</div>';
    if (S.group) {
      var list = S.group === 'blocked'
        ? DB.tasks.filter(function (t) { return t.status === 'blocked' }).map(function (t) { return { id: t.assignee, name: t.name, status: t.status } })
        : DB.employees.filter(function (e) { return e.status === S.group }).map(function (e) { return { id: e.id, name: e.name, status: e.status } });
      html += '<div class="cb-filter-results">';
      if (!list.length) html += '<div class="cb-empty">该分组暂无成员</div>';
      list.forEach(function (x) {
        html += '<button type="button" class="cb-employee" data-act="open:emp:' + x.id + '">' + dot(x.status) + '<span>' + esc(x.name) + '</span></button>';
      });
      html += '</div>';
    }
    html += '</section>';

    html += '<section class="cb-block"><div class="cb-block-head"><strong>项目</strong>' +
      '<span class="cb-chevron" data-act="collapse:proj">' + (S.projCollapsed ? '›' : '⌄') + '</span></div>' +
      '<div class="cb-project-list" style="' + (S.projCollapsed ? 'display:none' : '') + '">';
    DB.projects.forEach(function (p) {
      var cls = p.pct >= 100 ? 'cb-bar-green' : p.status === '风险' ? 'cb-bar-red' : 'cb-bar-accent';
      html += '<button type="button" class="cb-project ' + (S.subject.type === 'project' && S.subject.id === p.id ? 'is-current' : '') + '" data-act="open:project:' + p.id + '">' +
        '<span class="cb-project-icon">▱</span><span class="cb-project-name">' + esc(p.name) + '</span>' +
        '<span class="cb-bar ' + cls + '"><span class="cb-bar-fill" style="width:' + p.pct + '%"></span></span></button>';
    });
    html += '</div></section>';

    $('#left-foot').innerHTML = '<button type="button" class="cb-new-task" data-act="modal:task">＋ 新建任务</button>';
    return html;
  }

  function leftProjects() {
    var html = '';
    html += '<div class="pv-left-head"><strong>项目</strong><span class="cb-link" data-act="modal:project">＋ 新建</span></div>';
    var filters = ['全部', '进行中', '风险', '已完成'];
    html += '<div class="cb-seg" style="margin-bottom:8px">' + filters.map(function (f) {
      return '<button type="button" class="' + ((S.projectFilter || '全部') === f ? 'is-current' : '') + '" data-act="pfilter:' + f + '">' + f + '</button>';
    }).join('') + '</div>';
    html += '<div class="cb-project-list">';
    DB.projects.filter(function (p) { return !S.projectFilter || S.projectFilter === '全部' || p.status === S.projectFilter }).forEach(function (p) {
      var cls = p.pct >= 100 ? 'cb-bar-green' : p.status === '风险' ? 'cb-bar-red' : 'cb-bar-accent';
      html += '<button type="button" class="cb-project ' + (S.subject.type === 'project' && S.subject.id === p.id ? 'is-current' : '') + '" data-act="open:project:' + p.id + '" style="padding:7px 5px">' +
        '<span class="cb-project-icon">▱</span><span class="cb-project-name">' + esc(p.name) + '</span>' +
        '<span class="cb-bar ' + cls + '"><span class="cb-bar-fill" style="width:' + p.pct + '%"></span></span></button>';
    });
    if (!DB.projects.filter(function (p) { return !S.projectFilter || S.projectFilter === '全部' || p.status === S.projectFilter }).length) {
      html += '<div class="cb-empty">没有符合条件的项目</div>';
    }
    html += '</div>';
    $('#left-foot').innerHTML = '<button type="button" class="cb-primary" data-act="modal:project">＋ 新建项目</button>';
    return html;
  }

  function leftTasks() {
    var html = '';
    html += '<div class="pv-left-head"><strong>任务</strong><span class="cb-link" data-act="modal:task">＋ 新建</span></div>';
    ['pending', 'running', 'review', 'blocked', 'done'].forEach(function (k) {
      var n = DB.tasks.filter(function (t) { return t.status === k }).length;
      html += '<button type="button" class="cb-group ' + (S.taskFilter === k ? 'is-current' : '') + '" data-act="tfilter:' + k + '" style="padding:7px 5px">' +
        '<span class="cb-dot ' + STATUS[k].cls + '"></span><span>' + STATUS[k].label + '</span><span class="cb-count">' + n + '</span></button>';
    });
    html += '<div class="cb-block" style="margin-top:10px"><div class="cb-block-head"><strong>按项目</strong></div><div class="cb-project-list">';
    DB.projects.forEach(function (p) {
      var n = DB.projectTasks(p.id).length;
      html += '<button type="button" class="cb-project" data-act="open:project:' + p.id + '" style="padding:5px 4px">' +
        '<span class="cb-project-icon">▱</span><span class="cb-project-name">' + esc(p.name) + '</span><span class="cb-count">' + n + '</span></button>';
    });
    html += '</div></div>';
    $('#left-foot').innerHTML = '<button type="button" class="cb-new-task" data-act="modal:task">＋ 新建任务</button>';
    return html;
  }

  function leftKnowledge() {
    var html = '';
    var cats = ['全部', '规范', '文档', '会议', '模板'];
    html += '<div class="pv-left-head"><strong>知识库</strong><span class="cb-link" data-act="toast:上传入口暂未接入">上传</span></div>';
    html += '<div class="cb-project-list">';
    cats.forEach(function (c) {
      var n = c === '全部' ? DB.docs.length : DB.docs.filter(function (d) { return d.cat === c }).length;
      html += '<button type="button" class="cb-group ' + ((S.docCat || '全部') === c ? 'is-current' : '') + '" data-act="dcat:' + c + '" style="padding:6px 5px">' +
        '<span class="cb-project-icon">▧</span><span>' + c + '</span><span class="cb-count">' + n + '</span></button>';
    });
    html += '</div>';
    html += '<div class="cb-block" style="margin-top:10px"><div class="cb-block-head"><strong>最近更新</strong></div><div class="cb-mini-list">';
    DB.docs.slice(0, 4).forEach(function (d) {
      html += '<button type="button" class="cb-project" data-act="doc:' + d.id + '" style="padding:5px 4px">' +
        '<span class="cb-project-name">' + esc(d.title) + '</span><small class="cb-count">' + d.updated.slice(5) + '</small></button>';
    });
    html += '</div></div>';
    $('#left-foot').innerHTML = '<button type="button" class="cb-ghost" data-act="doc:import">导入文档</button>';
    return html;
  }

  function leftSettings() {
    var html = '';
    var secs = [
      { id: 'model', label: '模型' },
      { id: 'appearance', label: '外观' },
      { id: 'org', label: '组织' },
      { id: 'notify', label: '通知' },
      { id: 'about', label: '关于' }
    ];
    html += '<div class="pv-left-head"><strong>设置</strong></div>';
    html += '<div class="cb-project-list">';
    secs.forEach(function (s) {
      var flag = s.id === 'model' && aiReady() ? ' <span style="color:var(--bt-green);font-size:9px">●</span>' : '';
      html += '<button type="button" class="cb-group ' + (S.settingsSection === s.id ? 'is-current' : '') + '" data-act="setsec:' + s.id + '" style="padding:7px 5px">' +
        '<span class="cb-project-icon">·</span><span>' + s.label + flag + '</span></button>';
    });
    html += '</div>';
    $('#left-foot').innerHTML = '<div class="cb-empty" style="padding:6px">CompBotOrg v1.0 · ' + (aiReady() ? 'Agnes 已连接' : 'Agnes 未连接') + '</div>';
    return html;
  }

  /* ================= center: head ================= */
  function renderCenter() {
    var head = $('#center-head'), body = $('#center-body'), host = $('#composer-wrap'), slot = $('#ai-slot');
    head.innerHTML = centerHead();
    if (slot) slot.innerHTML = aiBanner();

    if (isChat() || isGroup()) {
      body.className = 'pv-chat';
      body.innerHTML = (isGroup() ? groupMessages() : chatMessages());
      if (!host.firstChild) {
        host.innerHTML = composerHTML();
        var ni = composerEl();
        if (ni) autoGrow(ni);
      } else {
        var inp = composerEl();
        if (inp) { inp.placeholder = composerPlaceholder(); autoGrow(inp) }
      }
      host.style.display = '';
      scrollChat(S.scrollMode !== 'top');
      S.scrollMode = 'bottom';
    } else {
      body.className = 'cb-detail';
      body.innerHTML = centerDetail();
      host.innerHTML = '';
      host.style.display = 'none';
    }
  }

  function centerHead() {
    if (isChat()) {
      var e = DB.byId[S.subject.id] || DB.byId.ceo;
      var st = EMP_STATUS[e.status] || EMP_STATUS.idle;
      var actions = '<button type="button" data-act="tab:insp:relation">⚭ 组织关系</button>' +
        '<button type="button" data-act="tab:insp:task">▥ 任务</button>' +
        '<button type="button" data-act="open:emp:ceo">↩ 找 CEO</button>';
      return '<div>' + avatar(e, 'cb-avatar-lg') + '</div>' +
        '<div class="pv-head-copy"><strong>' + esc(e.name) + ' <span style="color:var(--bt-' + (st.tone === 'green' ? 'green' : st.tone === 'amber' ? 'star' : 'ink-3') + ');font-size:10px">● ' + st.label + '</span></strong>' +
        '<small>' + esc(e.role) + ' · ' + esc(e.dept) + '</small></div>' +
        '<div class="pv-head-actions">' + actions + '</div>';
    }
    var titles = {
      projects: ['项目', '全部 ' + DB.projects.length + ' 个项目'],
      tasks: ['任务看板', DB.tasks.length + ' 个任务 · ' + DB.tasks.filter(function (t) { return t.status === 'blocked' }).length + ' 个阻塞'],
      knowledge: ['知识库', DB.docs.length + ' 篇文档'],
      settings: ['设置', aiReady() ? 'Agnes 已连接 · ' + AI.model : 'Agnes 未连接 · 请填入 API Key'],
      groups: (function () {
        var g = currentGroup();
        return g ? [g.name, g.members.length + ' 名成员 · 负责人 ' + empName(g.lead)] : ['群聊', ''];
      })(),
      search: ['搜索', S.query ? '“' + esc(S.query) + '” 的结果' : '输入关键词搜索员工、项目、任务和文档']
    };
    var t = titles[S.view] || ['工作台', ''];
    return '<div class="pv-head-copy"><strong>' + t[0] + '</strong><small>' + t[1] + '</small></div>' +
      '<div class="pv-head-actions">' + (S.view === 'projects' ? '<button type="button" data-act="modal:project">＋ 新建项目</button>' : '') +
      (S.view === 'tasks' ? '<button type="button" data-act="modal:task">＋ 新建任务</button>' : '') +
      '<button type="button" data-act="insp">◫ 面板</button></div>';
  }

  /* ================= center: chat ================= */
  function chatMessages() {
    var list = conv(convId());
    var out = '';
    for (var i = 0; i < list.length; i++) out += msgHTML(list[i], i);
    if (busyId === convId()) out += typingHTML();
    return out;
  }
  var ACT_META = {
    claim: { label: '接单', cls: 'claim' },
    step: { label: '执行', cls: 'step' },
    produce: { label: '产出', cls: 'produce' },
    submit: { label: '提交审核', cls: 'submit' },
    done: { label: '已验收', cls: 'done' },
    block: { label: '受阻', cls: 'block' },
    ask: { label: '待确认', cls: 'ask' }
  };
  function actionHTML(m) {
    var who = DB.byId[m.from] || DB.byId.ceo;
    var meta = ACT_META[m.act] || ACT_META.step;
    var task = m.task ? DB.taskById(m.task) : null;
    return '<div class="pv-msg is-action">' + botMark(who, 22, 'cb-avatar cb-avatar-sm') +
      '<div class="pv-msg-body">' +
      '<div class="pv-msg-name">' + esc(who.name) + levelTag(who) +
      '<span class="cb-act-time">' + esc(m.time || '') + '</span></div>' +
      '<div class="cb-act cb-act-' + meta.cls + '">' +
      '<span class="cb-act-tag">' + meta.label + '</span>' +
      '<div class="cb-act-text">' + richTextHTML(m.text) + '</div>' +
      (task ? '<button type="button" class="cb-act-task" data-act="open:task:' + task.id + '">▤ ' + esc(task.name) + '</button>' : '') +
      '</div></div></div>';
  }
  function msgHTML(m, i) {
    if (m.kind === 'action') return actionHTML(m);
    /* 群里的 @ 派活：谁被点名、派了什么，一眼能看出来 */
    if (m.kind === 'call' && m.to) {
      var fromE = DB.byId[m.from] || DB.byId.ceo, toE = DB.byId[m.to];
      if (!toE) return '';
      var callTask = m.task ? DB.taskById(m.task) : null;
      return '<div class="pv-msg is-call">' + botMark(fromE, 22, 'cb-avatar cb-avatar-sm') +
        '<div class="pv-msg-body">' +
        '<div class="pv-msg-name">' + esc(fromE.name) + '<span class="cb-act-time">' + esc(m.time || '') + '</span></div>' +
        '<div class="cb-call">' +
        '<span class="cb-call-to">' + botMark(toE, 16) + '@' + esc(toE.name) + '</span>' +
        '<div class="cb-call-text">' + esc(m.text) + '</div>' +
        (callTask ? '<button type="button" class="cb-act-task" data-act="open:task:' + callTask.id + '">▤ ' + esc(callTask.name) + ' · ' +
          ({ pending: '待启动', running: '执行中', review: '待审核', blocked: '阻塞', done: '已完成' }[callTask.status] || callTask.status) + '</button>' : '') +
        '</div></div></div>';
    }
    var mine = m.from === 'me';
    var who = mine ? DB.me : (DB.byId[m.from] || DB.byId.ceo);
    var body = richTextHTML(m.text);
    var card = m.card ? taskCardHTML(m.card) : '';
    var made = createdTasksHTML(m.tasks);
    var cc = m.cc ? '<div class="cb-cc">抄送自 ' + esc(empName(m.cc)) + ' 的会话 · 这条消息点名了你</div>' : '';
    var dsp = m.dispatch ? '<div class="cb-dispatch" data-act="open:task:' + m.dispatch + '">▤ 派单已送达 · ' +
      esc((DB.taskById(m.dispatch) || {}).name || '任务') + '<span>查看任务 ›</span></div>' : '';
    var errCls = m.err ? ' is-err' : '';
    var stoppedAttr = m.stopped ? ' data-stopped="1"' : '';
    return '<div class="pv-msg ' + (mine ? 'mine' : '') + '"' + stoppedAttr + '>' +
      avatar(who, 'cb-avatar-sm') +
      '<div class="pv-msg-body">' +
      (mine ? '' : '<div class="pv-msg-name">' + esc(who.name) + '<span style="margin-left:6px;opacity:.7">' + esc(m.time || '') + '</span></div>') +
      '<div class="pv-bubble' + errCls + '">' + cc + body + card + made + dsp + '</div>' +
      '<div class="pv-msg-tools"><button type="button" data-act="copy:' + i + '">复制</button>' +
      (mine ? '' : '<button type="button" data-act="quote:' + i + '">引用</button>') +
      (mine ? '<button type="button" data-act="retry:' + i + '">重发</button>' : '') +
      '</div></div></div>';
  }
  function createdTasksHTML(ts) {
    if (!ts || !ts.length) return '';
    return '<div class="cb-task-created">' + ts.map(function (t) {
      return '<div class="cb-task-created-row" data-act="open:task:' + t.id + '">' +
        '<span style="color:var(--bt-accent)">＋</span><span>' + esc(t.name) + '</span>' +
        '<small>' + esc(empName(t.assignee)) + '</small></div>';
    }).join('') + '</div>';
  }
  function streamingHTML(empId) {
    var e = DB.byId[empId] || DB.byId.ceo;
    return '<div class="pv-msg" data-stream="1">' + avatar(e, 'cb-avatar-sm') +
      '<div class="pv-msg-body"><div class="pv-msg-name">' + esc(e.name) + '</div>' +
      '<div class="pv-bubble"><span class="cb-think">正在思考<span class="cb-typing"><i></i><i></i><i></i></span></span></div></div></div>';
  }
  function aiBanner() {
    if (!isChat() && !isGroup()) return '';
    if (!aiReady()) {
      return '<div class="cb-ai-banner" data-act="openai"><span><b>尚未连接 Agnes</b> · 填入 API Key 后，CEO 和员工由模型基于真实组织数据实时作答并自动派活</span><span class="cb-ai-badge">去配置 ›</span></div>';
    }
    if (AI.state === 'bad') {
      return '<div class="cb-ai-banner is-err" data-act="openai"><span><b>模型连接异常</b> · ' + esc(AI.err || '请检查设置') + '</span><span class="cb-ai-badge">去检查 ›</span></div>';
    }
    return '';
  }
  function typingHTML() {
    return '<div class="pv-msg"><span class="cb-avatar cb-avatar-sm">' + esc((DB.byId[convId()] || DB.byId.ceo).name.slice(0, 1)) + '</span>' +
      '<div class="pv-msg-body"><div class="pv-bubble"><span class="cb-typing"><i></i><i></i><i></i></span></div></div></div>';
  }
  function taskCardHTML(pid) {
    var p = DB.projectById(pid); if (!p) return '';
    var tasks = DB.projectTasks(pid);
    var avg = tasks.length ? Math.round(tasks.reduce(function (a, t) { return a + t.pct }, 0) / tasks.length) : 0;
    var rows = tasks.map(function (t) {
      var cls = t.status === 'done' ? 'done' : t.status === 'running' ? 'running' : 'pending';
      var mark = t.status === 'done' ? '✓' : t.status === 'running' ? '◉' : '○';
      var color = t.status === 'done' ? 'var(--bt-green)' : t.status === 'blocked' ? 'var(--bt-danger)' : 'var(--bt-accent)';
      return '<div class="pv-task" data-act="open:task:' + t.id + '">' +
        '<span class="pv-check ' + cls + '">' + mark + '</span>' +
        '<span>' + esc(t.name) + '</span>' +
        '<span class="pv-tag">' + esc(empName(t.assignee)) + '</span>' +
        '<span class="pv-bar"><i style="width:' + t.pct + '%;background:' + color + '"></i></span>' +
        '<span class="pv-pct">' + t.pct + '%</span></div>';
    }).join('');
    return '<div class="pv-card" id="task-card">' +
      '<div class="pv-card-head"><span>✓ <b>任务分解与分配</b></span>' +
      '<span class="cb-link" data-act="open:project:' + p.id + '">查看详情 ›</span></div>' + rows +
      '<div class="pv-overall"><span>当前项目整体进度：' + avg + '%</span><span class="pv-bar"><i style="width:' + avg + '%;background:var(--bt-accent)"></i></span></div></div>';
  }
  function composerPlaceholder() {
    var g = currentGroup();
    if (g) return '在「' + g.name + '」下指令，@ 成员可直接点名…';
    return '给 ' + (DB.byId[convId()] || DB.byId.ceo).name + ' 下达任务，或直接 @ 其他员工…';
  }
  function composerHTML() {
    return '<div class="pv-composer"><span class="pv-clip" data-act="toast:附件功能需要后端存储，暂未接入">📎</span>' +
      '<textarea data-input="composer" rows="1" placeholder="' + esc(composerPlaceholder()) + '" aria-label="消息">' + esc(S.drafts[convId()] || '') + '</textarea>' +
      '<button type="button" class="pv-send" data-act="send" aria-label="发送">➤</button></div>' +
      '<div id="mention-pop" class="cb-mention-pop"></div>';
  }
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }
  function composerEl() { return $('#composer-wrap [data-input=composer]') }
  /* ================= @ mentions / # references ================= */
  var MENTION_RE = /(^|[\s(（])([@#])([^\s@#]*)$/;

  function mentionCandidates(trigger, q) {
    var needle = String(q || '').toLowerCase(), out = [];
    if (trigger === '@') {
      DB.employees.forEach(function (e) {
        var hay = (e.name + ' ' + e.role + ' ' + e.dept).toLowerCase();
        if (!needle || hay.indexOf(needle) >= 0) out.push({ id: e.id, name: e.name, sub: e.dept + ' · ' + e.role, kind: 'emp' });
      });
    } else {
      DB.projects.forEach(function (p) {
        if (!needle || (p.name + ' 项目').toLowerCase().indexOf(needle) >= 0) out.push({ id: p.id, name: p.name, sub: '项目 · ' + p.pct + '%', kind: 'project' });
      });
      DB.tasks.forEach(function (t) {
        if (!needle || (t.name + ' 任务').toLowerCase().indexOf(needle) >= 0) out.push({ id: t.id, name: t.name, sub: '任务 · ' + ((STATUS[t.status] || {}).label || ''), kind: 'task' });
      });
    }
    return out.slice(0, 8);
  }

  function mentionPopHTML() {
    var m = S.mention;
    if (!m || !m.items.length) return '';
    return '<div class="cb-mention-head"><b>' + (m.trigger === '@' ? '@ 点名同事' : '# 引用项目 / 任务') + '</b>' +
      '<span>' + (m.trigger === '@' ? '自动抄送 · 优先派单' : '插入可点链接') + ' · ↑↓ 选择 · Enter 插入</span></div>' +
      m.items.map(function (it, i) {
        return '<button type="button" class="cb-mention-item ' + (i === m.index ? 'is-current' : '') + '" data-act="mpick:' + i + '">' +
          '<span class="cb-mention-ico">' + (it.kind === 'emp' ? esc(it.name.slice(0, 1)) : it.kind === 'project' ? '▤' : '✓') + '</span>' +
          '<span class="cb-mention-name">' + esc(it.name) + '</span>' +
          '<span class="cb-mention-sub">' + esc(it.sub) + '</span></button>';
      }).join('');
  }

  function syncMentionPop() {
    var pop = $('#mention-pop'); if (!pop) return;
    pop.innerHTML = mentionPopHTML();
    if (S.mention && S.mention.items.length) pop.classList.add('is-open');
    else pop.classList.remove('is-open');
    var cur = pop.querySelector('.is-current');
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest' }) } catch (e) {} }
  }

  function closeMention() {
    if (!S.mention) return;
    S.mention = null;
    syncMentionPop();
  }

  function updateMention(ta) {
    if (!ta || ta.selectionStart == null) { closeMention(); return }
    var before = ta.value.slice(0, ta.selectionStart);
    var m = MENTION_RE.exec(before);
    if (!m) { closeMention(); return }
    var items = mentionCandidates(m[2], m[3]);
    if (!items.length) { closeMention(); return }
    S.mention = { trigger: m[2], start: ta.selectionStart - m[3].length - 1, q: m[3], items: items, index: 0 };
    syncMentionPop();
  }

  function mentionMove(delta) {
    var m = S.mention; if (!m || !m.items.length) return false;
    m.index = (m.index + delta + m.items.length) % m.items.length;
    syncMentionPop();
    return true;
  }

  function pickMention(i) {
    var m = S.mention, ta = composerEl();
    if (!m || !ta || !m.items[i]) return;
    var it = m.items[i], pos = ta.selectionStart;
    var token = m.trigger + it.name + ' ';
    ta.value = ta.value.slice(0, m.start) + token + ta.value.slice(pos);
    S.drafts[convId()] = ta.value;
    var caret = m.start + token.length;
    try { ta.setSelectionRange(caret, caret) } catch (e) {}
    if (m.trigger === '@') {
      if (S.draftMentions.indexOf(it.id) < 0) S.draftMentions.push(it.id);
    } else if (!S.draftRefs.some(function (r) { return r.id === it.id })) {
      S.draftRefs.push({ id: it.id, kind: it.kind, name: it.name });
    }
    closeMention();
    autoGrow(ta);
    ta.focus();
  }

  /* Render @name / #name as clickable chips. Placeholders keep the generated
     HTML from being re-matched by a later (shorter) employee name. */
  function richTextHTML(text) {
    var out = esc(text || '').replace(/\n/g, '<br>'), marks = [];
    function mark(needle, key, html) {
      if (out.indexOf(needle) < 0) return;
      out = out.split(needle).join(key);
      marks.push([key, html]);
    }
    DB.employees.slice().sort(function (a, b) { return b.name.length - a.name.length }).forEach(function (e) {
      mark(esc('@' + e.name), '\u0001e' + e.id + '\u0002',
        '<span class="cb-mention" data-act="mention:' + e.id + '">@' + esc(e.name) + '</span>');
    });
    DB.projects.forEach(function (p) {
      mark(esc('#' + p.name), '\u0001p' + p.id + '\u0002',
        '<span class="cb-ref" data-act="open:project:' + p.id + '">#' + esc(p.name) + '</span>');
    });
    DB.tasks.forEach(function (t) {
      mark(esc('#' + t.name), '\u0001t' + t.id + '\u0002',
        '<span class="cb-ref" data-act="open:task:' + t.id + '">#' + esc(t.name) + '</span>');
    });
    marks.forEach(function (pair) { out = out.split(pair[0]).join(pair[1]) });
    return out;
  }

  function dispatchNotice(t, fromId) {
    var cid = t.assignee;
    if (!cid || cid === 'me' || !DB.byId[cid]) return;
    var p = DB.projectById(t.project);
    conv(cid).push({
      from: (fromId && DB.byId[fromId]) ? fromId : 'ceo',
      text: '新任务：' + t.name + '（' + (p ? p.name : '未归属项目') + '）。派单已送达，请按「进行中 → 待审核 → 已完成」推进。',
      time: now(), dispatch: t.id
    });
    saveConv(cid);
  }


  /* ================= center: details ================= */
  function centerDetail() {
    if (S.view === 'projects') return projectDetail();
    if (S.view === 'tasks') return taskBoard();
    if (S.view === 'knowledge') return S.subject.type === 'doc' ? docView(S.subject.id) : knowledgeView();
    if (S.view === 'settings') return settingsView();
    if (S.view === 'search') return searchView();
    if (S.view === 'org') {
      if (S.subject.type === 'department') return departmentDetail(S.subject.id);
      if (S.subject.type === 'project') return projectDetail();
    }
    return '<div class="cb-empty-block"><span class="cb-empty-glyph">◌</span><span>选择一个对象查看详情</span></div>';
  }

  function projectDetail() {
    var p = DB.projectById(S.subject.id) || DB.projects[0];
    if (!p) return '<div class="cb-empty-block">还没有项目</div>';
    var tasks = DB.projectTasks(p.id);
    var avg = tasks.length ? Math.round(tasks.reduce(function (a, t) { return a + t.pct }, 0) / tasks.length) : 0;
    var tabs = [['overview', '概览'], ['tasks', '任务 (' + tasks.length + ')'], ['members', '成员 (' + p.members.length + ')'], ['activity', '动态']];

    var html = '<div class="cb-crumb" data-act="back"><span>‹</span><span>项目</span></div>';
    html += '<div class="cb-detail-head"><div style="flex:1;min-width:0">' +
      '<div class="cb-detail-title">' + esc(p.name) + ' ' + badge(p.status, projectStatusCls(p.status)) + '</div>' +
      '<div class="cb-detail-sub">' + esc(p.goal) + ' · 负责人 ' + esc(empName(p.lead)) + ' · 截止 ' + p.due + '</div></div>' +
      '<div class="cb-detail-actions"><button type="button" data-act="report:' + p.id + '">生成周报</button>' +
      '<button type="button" class="primary" data-act="open:emp:' + p.lead + '">找负责人</button></div></div>';

    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>整体进度</h5><span style="font-size:11px;font-weight:750">' + avg + '%</span></div>' +
      '<div class="cb-progress-lg"><i style="width:' + avg + '%"></i></div>' +
      '<div class="cb-kv" style="margin-top:10px">' +
      kv('任务', tasks.length + ' 个') + kv('未开工', tasks.filter(function (t) { return t.status === 'pending' }).length + ' 个') +
      kv('阻塞', tasks.filter(function (t) { return t.status === 'blocked' }).length + ' 个') + kv('周期', p.due) + '</div></div>';

    html += '<div class="cb-tabs2">' + tabs.map(function (t) {
      return '<button type="button" class="' + (S.projectTab === t[0] ? 'is-current' : '') + '" data-act="ptab:' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (S.projectTab === 'overview') {
      html += '<div class="cb-panel"><h5>项目说明</h5><div style="font-size:11px;line-height:18px;color:var(--bt-ink-2)">' + esc(p.desc) + '</div></div>';
      html += '<div class="cb-panel"><div class="cb-panel-head"><h5>关键任务</h5><span class="cb-link" data-act="ptab:tasks">全部 ' + tasks.length + ' 个 ›</span></div>' +
        '<div class="cb-task-list">' + tasks.slice(0, 4).map(taskRow).join('') + '</div></div>';
    } else if (S.projectTab === 'tasks') {
      html += '<div class="cb-panel"><div class="cb-panel-head"><h5>任务列表</h5><span class="cb-link" data-act="modal:task">＋ 添加</span></div>' +
        '<div class="cb-task-list">' + (tasks.length ? tasks.map(taskRow).join('') : '<div class="cb-empty">还没有任务</div>') + '</div></div>';
    } else if (S.projectTab === 'members') {
      html += '<div class="cb-panel"><h5>项目成员</h5><div>' + p.members.map(function (id) {
        var e = DB.byId[id]; if (!e) return '';
        return '<button type="button" class="cb-member-row" data-act="open:emp:' + id + '">' + avatar(e) +
          '<span class="cb-member-copy"><strong>' + esc(e.name) + '</strong><small>' + esc(e.role) + '</small></span>' +
          dot(e.status) + '</button>';
      }).join('') + '</div></div>';
    } else {
      html += '<div class="cb-panel"><h5>项目动态</h5><div class="cb-timeline">' + [
        [empName(p.lead) + ' 更新了项目进度到 ' + p.pct + '%', '今天 14:20'],
        ['Product AI 完成了「产品架构设计」', '今天 13:40'],
        ['CEO 在群里同步了本周目标', '昨天 18:05'],
        ['项目创建', '2026-11-13']
      ].map(function (x) {
        return '<div class="cb-tl-item"><span class="cb-tl-dot"></span><div class="cb-tl-body">' + esc(x[0]) + '<small>' + x[1] + '</small></div></div>';
      }).join('') + '</div></div>';
    }
    return html;
  }

  function taskEditor(t) {
    var keys = ['pending', 'running', 'review', 'blocked', 'done'];
    return '<section class="cb-section cb-task-editor"><h4>编辑任务</h4>' +
      '<div class="cb-te-name">' + esc(t.name) + '</div>' +
      '<div class="cb-te-row"><label>执行</label><div class="cb-seg">' +
      '<button type="button" class="' + (t.executing ? 'is-current' : '') + '" data-act="taskrun:' + t.id + '">' + (t.executing ? '执行中…' : '执行') + '</button>' +
      (t.status === 'review' ? '<button type="button" data-act="taskapprove:' + t.id + '">通过</button>' +
        '<button type="button" data-act="taskreject:' + t.id + '">打回</button>' : '') +
      '</div></div>' +
      '<div class="cb-te-row"><label>状态</label><div class="cb-seg">' +
      keys.map(function (k) {
        return '<button type="button" class="' + (t.status === k ? 'is-current' : '') + '" data-act="tstatus:' + t.id + ':' + k + '">' + STATUS[k].label + '</button>';
      }).join('') + '</div></div>' +
      '<div class="cb-te-row"><label>进度</label><input type="range" min="0" max="100" step="5" value="' + t.pct + '" data-progress="' + t.id + '"><b>' + t.pct + '%</b></div>' +
      '<div class="cb-te-row"><label>负责人</label><select data-reassign="' + t.id + '">' +
      DB.employees.map(function (e) {
        return '<option value="' + e.id + '"' + (e.id === t.assignee ? ' selected' : '') + '>' + esc(e.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="cb-te-col"><label>交付汇报 <small>进入待审核前必填</small></label>' +
      '<textarea data-report="' + t.id + '" rows="2" placeholder="写清楚交付了什么">' + esc(t.report || '') + '</textarea></div>' +
      '<div class="cb-te-col"><label>CEO 验收 <small>标记完成前必填</small></label>' +
      '<textarea data-review="' + t.id + '" rows="2" placeholder="验收意见">' + esc(t.review || '') + '</textarea></div>' +
      '<div class="cb-te-delivery"><span>委派回执</span><b>' + esc(deliveryLabel(t)) + '</b>' +
      (t.assignment && t.assignment.requestId ? '<small>' + esc(t.assignment.requestId) + '</small>' : '') + '</div></section>';
  }

  function taskRow(t) {
    var st = STATUS[t.status] || STATUS.pending;
    return '<div class="cb-task" data-task="' + t.id + '" data-act="open:task:' + t.id + '">' +
      '<span class="cb-task-status ' + (t.status === 'running' ? 'cb-task-running' : t.status === 'done' ? 'cb-task-done' : t.status === 'blocked' ? 'cb-task-blocked' : t.status === 'review' ? 'cb-task-review' : '') + '">' + st.label + '</span>' +
      '<span class="cb-task-title">' + esc(t.name) + '</span>' +
      '<span style="color:var(--bt-ink-3)">' + esc(empName(t.assignee)) + '</span>' +
      '<span class="cb-bar"><span class="cb-bar-fill" style="width:' + t.pct + '%"></span></span>' +
      '<small>' + t.pct + '%</small></div>';
  }

  function kv(k, v) { return '<div class="cb-kv-row"><span class="cb-kv-label">' + esc(k) + '</span><span class="cb-kv-value">' + esc(v) + '</span></div>' }

  function taskBoard() {
    var cols = ['pending', 'running', 'review', 'blocked', 'done'];
    var filter = S.taskFilter;
    var list = filter === 'all' ? DB.tasks : DB.tasks.filter(function (t) { return t.status === filter });
    var html = '<div class="cb-detail-head"><div><div class="cb-detail-title">任务看板</div>' +
      '<div class="cb-detail-sub">' + list.length + ' 个任务 · 点击卡片可定位到所属项目</div></div></div>';
    html += '<div class="cb-kb">';
    cols.forEach(function (k) {
      var items = list.filter(function (t) { return t.status === k });
      html += '<div class="cb-kb-col"><div class="cb-kb-head"><span>' + STATUS[k].label + '</span><span class="cb-count">' + items.length + '</span></div>';
      if (!items.length) html += '<div class="cb-empty">暂无任务</div>';
      items.forEach(function (t) {
        html += '<button type="button" class="cb-kb-card" data-act="open:task:' + t.id + '">' +
          '<strong>' + esc(t.name) + '</strong>' +
          '<div class="cb-kb-meta">' + dot(t.status) + '<span>' + esc(empName(t.assignee)) + '</span><span>·</span><span>' + esc(DB.projectById(t.project) ? DB.projectById(t.project).name : '') + '</span></div>' +
          '<span class="cb-bar" style="width:100%"><span class="cb-bar-fill" style="width:' + t.pct + '%"></span></span>' +
          (t.note ? '<small style="color:var(--bt-danger)">' + esc(t.note) + '</small>' : '') + '</button>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function mdHTML(src) {
    var out = [], inCode = false;
    String(src || '').split('\n').forEach(function (line) {
      if (/^```/.test(line)) { inCode = !inCode; out.push(inCode ? '<pre class="cb-md-pre">' : '</pre>'); return }
      if (inCode) { out.push(esc(line)); return }
      if (/^\s*$/.test(line)) { out.push(''); return }
      var m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { out.push('<h' + (m[1].length + 2) + ' class="cb-md-h">' + esc(m[2]) + '</h' + (m[1].length + 2) + '>'); return }
      if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { out.push('<div class="cb-md-li">· ' + esc(m[1]) + '</div>'); return }
      if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) { out.push('<div class="cb-md-li">' + esc(m[1]) + '</div>'); return }
      if (/^\|/.test(line)) {
        if (/^\|[\s:\-|]+\|?$/.test(line)) return;   /* 表格分隔行 |---|---| */
        var cells = line.replace(/^\||\|$/g, '').split('|').map(function (c) { return '<span>' + esc(c.trim()) + '</span>' });
        out.push('<div class="cb-md-tr">' + cells.join('') + '</div>');
        return;
      }
      out.push('<p class="cb-md-p">' + esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\[ \]/g, '☐') + '</p>');
    });
    return out.join('');
  }

  function buildReport(p) {
    var ts = DB.projectTasks(p.id);
    var done = ts.filter(function (t) { return t.status === 'done' });
    var active = ts.filter(function (t) { return t.status === 'running' || t.status === 'review' });
    var blocked = ts.filter(function (t) { return t.status === 'blocked' });
    var L = [];
    L.push('# ' + p.name + ' · 周报');
    L.push('');
    L.push('生成于 ' + new Date().toLocaleDateString('zh-CN') + '，负责人 ' + empName(p.lead) + '，整体进度 ' + p.pct + '%。');
    L.push('');
    L.push('## 本周进展');
    L.push('');
    if (done.length) done.forEach(function (t) { L.push('- 已完成：' + t.name + '（' + empName(t.assignee) + '）') });
    if (active.length) active.forEach(function (t) { L.push('- 进行中：' + t.name + ' ' + t.pct + '%（' + empName(t.assignee) + '）') });
    if (!done.length && !active.length) L.push('- 本周无实质性推进');
    L.push('');
    L.push('## 风险');
    L.push('');
    if (blocked.length) blocked.forEach(function (t) { L.push('- ' + t.name + '：' + (t.note || '原因待补充') + '，责任人 ' + empName(t.assignee)) });
    else L.push('- 暂无阻塞项');
    L.push('');
    L.push('## 下周计划');
    L.push('');
    var pend = ts.filter(function (t) { return t.status === 'pending' });
    if (pend.length) pend.slice(0, 5).forEach(function (t) { L.push('- 启动：' + t.name + '（' + empName(t.assignee) + '，截止 ' + t.due + '）') });
    else L.push('- 收敛剩余进行中任务，准备验收');
    return L.join('\n');
  }

  function makeReport(pid) {
    var p = DB.projectById(pid); if (!p) return;
    var body = buildReport(p);
    var id = uid('d');
    DB.docs.unshift({
      id: id,
      title: p.name + ' 周报',
      cat: '会议',
      ext: 'MD',
      size: Math.max(1, Math.round(body.length / 400)) + ' KB',
      updated: new Date().toISOString().slice(0, 10),
      desc: '自动汇总 ' + DB.projectTasks(pid).length + ' 个任务生成的周报草稿'
    });
    DOC_BODY[id] = body;
    saveDocs();
    S.view = 'knowledge'; S.subject = { type: 'doc', id: id };
    render();
    toast('已生成周报，可在知识库查看');
  }

  function docView(id) {
    var d = null;
    DB.docs.forEach(function (x) { if (x.id === id) d = x });
    if (!d) return '<div class="cb-empty-block">文档不存在</div>';
    var body = DOC_BODY[d.id] || ('# ' + d.title + '\n\n' + d.desc);
    return '<div class="cb-crumb" data-act="nav:knowledge"><span>‹</span><span>知识库</span></div>' +
      '<div class="cb-detail-head"><div><div class="cb-detail-title">' + esc(d.title) + ' ' + badge(d.cat, '') + '</div>' +
      '<div class="cb-detail-sub">' + d.ext + ' · ' + d.size + ' · 更新于 ' + d.updated + '</div></div>' +
      '<div class="cb-detail-actions"><button type="button" data-act="editdoc:' + d.id + '">编辑</button>' +
      '<button type="button" class="primary" data-act="doc:copy:' + d.id + '">复制标题</button></div></div>' +
      '<article class="cb-doc-read">' + mdHTML(body) + '</article>';
  }

  function knowledgeView() {
    var cat = S.docCat || '全部';
    var docs = cat === '全部' ? DB.docs.slice() : DB.docs.filter(function (d) { return d.cat === cat });
    if (S.docSort === 'name') docs.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'zh-CN') });
    else docs.sort(function (a, b) { return String(b.updated).localeCompare(String(a.updated)) });
    var html = '<div class="cb-detail-head"><div><div class="cb-detail-title">知识库</div>' +
      '<div class="cb-detail-sub">' + docs.length + ' 篇文档 · 分类：' + esc(cat) + '</div></div>' +
      '<div class="cb-detail-actions"><button type="button" data-act="doc:import">导入文档</button>' +
      '<button type="button" class="primary" data-act="modal:doc-new">＋ 新建文档</button></div></div>';
    html += '<div class="cb-kv" style="margin-bottom:12px">' + kv('文档总数', DB.docs.length + ' 篇') +
      kv('本周更新', '4 篇') + kv('存储占用', '56 KB') + kv('索引状态', '正常') + '</div>';
    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>文档</h5><span class="cb-link" data-act="sort:docs">' + (S.docSort === 'name' ? '按名称' : '最近更新') + '</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' + docs.map(function (d) {
        return '<button type="button" class="cb-doc" data-act="doc:' + d.id + '">' +
          '<span class="cb-doc-icon">' + d.ext + '</span>' +
          '<span class="cb-doc-body"><strong>' + esc(d.title) + '</strong><small>' + esc(d.desc) + '</small></span>' +
          '<span class="cb-badge">' + esc(d.cat) + '</span><small style="color:var(--bt-ink-3);font-size:9px">' + d.updated.slice(5) + '</small></button>';
      }).join('') + '</div></div>';
    return html;
  }

  function settingsView() {
    var sec = S.settingsSection || 'appearance';
    var html = '<div class="cb-detail-head"><div><div class="cb-detail-title">设置</div><div class="cb-detail-sub">模型、外观、组织与通知</div></div></div>';
    if (sec === 'model') {
      var ready = aiReady();
      var stCls = ready ? (AI.state === 'bad' ? 'bad' : 'ok') : '';
      var stTxt = !ready ? '未配置' : AI.state === 'busy' ? '测试中' : AI.state === 'bad' ? '连接异常' : '已连接';
      html += '<div class="cb-set-group"><h5>模型</h5>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>当前状态</strong><small>' +
        (ready ? '对话由 Agnes ' + esc(AI.model) + ' 实时生成，并会读取下面的组织、项目与任务数据作为上下文' : '未配置 Agnes API Key，对话已停用，请先填入 Key 并完成连接测试') +
        '</small></div><span class="cb-ai-state ' + stCls + '"><i></i>' + stTxt + '</span></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>自动派活</strong><small>模型说「交给某人」时，自动在对应项目里创建任务，并联动员工状态</small></div>' +
        '<span class="cb-ai-state ok"><i></i>开启</span></div></div>';
      html += '<div class="cb-panel"><h5>连接参数</h5><div class="cb-ai-form">' +
        '<div class="cb-field"><label>接口地址（OpenAI 兼容）</label><input id="ai-base" class="cb-ai-key" value="' + esc(AI.base) + '" placeholder="https://apihub.agnes-ai.com/v1" spellcheck="false"></div>' +
        '<div class="cb-field"><label>API Key</label><input id="ai-key" class="cb-ai-key" type="password" value="' + esc(AI.key) + '" placeholder="sk-..." spellcheck="false" autocomplete="off"></div>' +
        '<div class="cb-field"><label>模型名称</label><input id="ai-model" class="cb-ai-key" value="' + esc(AI.model) + '" placeholder="agnes-2.5-flash" spellcheck="false"></div>' +
        '<div class="cb-field"><label>温度 · 越高越发散</label><input id="ai-temp" type="number" min="0" max="1" step="0.1" value="' + esc(AI.temp) + '"></div>' +
        '<div class="cb-ai-actions"><button type="button" class="primary" data-act="ai:save">保存并测试</button>' +
        '<button type="button" data-act="ai:test">仅测试</button>' +
        '<button type="button" data-act="ai:clear">清除</button></div>' +
        '<p class="cb-ai-hint">接口固定为 Agnes（apihub.agnes-ai.com/v1），模型默认 agnes-2.5-flash。Key 只保存在当前浏览器标签页，关闭标签页即清除；不会写入 localStorage、页面源码或任何中转服务器。接口必须使用 HTTPS。' +
        (AI.err ? '<br><span style="color:var(--bt-danger)">上次错误：' + esc(AI.err) + '</span>' : '') + '</p>' +
        '</div></div>';
      html += '<div class="cb-panel"><h5>怎么用</h5><div style="font-size:11px;line-height:18px;color:var(--bt-ink-2)">' +
        '<p style="margin:0 0 6px">填入 Agnes API Key，点「保存并测试」，上方状态变绿即连接成功。</p>' +
        '<p style="margin:0 0 6px">回到组织页，直接对 CEO 说「把官网上线这周做完」——模型会引用真实项目与任务数据作答，需要交办时输出派单指令，前端据此真实创建任务。</p>' +
        '<p style="margin:0">未连接模型时无法发送消息：本工作台不提供任何本地规则回复，所有答复都来自 Agnes。</p></div></div>';
    } else if (sec === 'appearance') {
      html += '<div class="cb-set-group"><h5>主题</h5>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>颜色模式</strong><small>切换后立即生效，仅保存在当前会话</small></div>' +
        '<div class="cb-seg"><button type="button" class="' + (S.theme === 'light' ? 'is-current' : '') + '" data-act="settheme:light">浅色</button>' +
        '<button type="button" class="' + (S.theme === 'dark' ? 'is-current' : '') + '" data-act="settheme:dark">深色</button></div></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>信息密度</strong><small>紧凑模式会缩小行高与卡片间距</small></div>' +
        '<div class="cb-seg"><button type="button" class="' + (S.density === 'comfortable' ? 'is-current' : '') + '" data-act="density:comfortable">舒适</button>' +
        '<button type="button" class="' + (S.density === 'compact' ? 'is-current' : '') + '" data-act="density:compact">紧凑</button></div></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>右侧 Inspector</strong><small>默认展开，可随时用顶部按钮收起</small></div>' +
        '<button type="button" class="cb-switch ' + (S.inspector ? 'on' : '') + '" data-act="toggle:insp"></button></div></div>';
    } else if (sec === 'org') {
      html += '<div class="cb-set-group"><h5>组织</h5>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>员工总数</strong><small>' + DB.employees.length + ' 名 AI 员工，' + DB.departments.length + ' 个部门</small></div><span class="cb-badge">' + DB.employees.length + '</span></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>项目数</strong><small>进行中 ' + DB.projects.filter(function (p) { return p.status === '进行中' }).length + ' 个，风险 ' + DB.projects.filter(function (p) { return p.status === '风险' }).length + ' 个</small></div><span class="cb-badge">' + DB.projects.length + '</span></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>任务总数</strong><small>含阻塞 ' + DB.tasks.filter(function (t) { return t.status === 'blocked' }).length + ' 个</small></div><span class="cb-badge">' + DB.tasks.length + '</span></div></div>';
      html += '<div class="cb-panel"><h5>部门</h5><div>' + DB.departments.map(function (d) {
        return '<button type="button" class="cb-member-row" data-act="open:dept:' + d.id + '">' +
          '<span class="cb-dept-icon">' + d.icon + '</span>' +
          '<span class="cb-member-copy"><strong>' + esc(d.name) + '</strong><small>' + esc(d.desc) + '</small></span>' +
          '<span class="cb-count">' + DB.deptEmployees(d.name).length + '</span></button>';
      }).join('') + '</div></div>';
    } else if (sec === 'notify') {
      html += '<div class="cb-set-group"><h5>通知</h5>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>任务状态变更</strong><small>任务进入阻塞或审核时提醒我</small></div>' +
        '<button type="button" class="cb-switch ' + (S.notify ? 'on' : '') + '" data-act="toggle:notify"></button></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>每日进展摘要</strong><small>每天 18:00 汇总各项目进度</small></div>' +
        '<button type="button" class="cb-switch ' + (S.dailyDigest ? 'on' : '') + '" data-act="toggle:daily"></button></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>阻塞提醒</strong><small>有任务阻塞超过 24 小时时提醒</small></div>' +
        '<button type="button" class="cb-switch ' + (S.notify ? 'on' : '') + '" data-act="toggle:notify"></button></div></div>';
    } else {
      html += '<div class="cb-panel"><h5>关于 CompBotOrg</h5>' +
        '<div style="font-size:11px;line-height:19px;color:var(--bt-ink-2)">' +
        '<p style="margin:0 0 8px">AI 组织工作台：左侧组织导航，中间与 CEO / 员工的会话，右侧上下文 Inspector。</p>' +
        '<p style="margin:0 0 8px">' + (aiReady()
          ? '<b>当前已连接模型</b>：' + esc(AI.model) + '。对 CEO 说的话会带上组织架构、项目进度与任务清单一起提交，需要交办时前端会解析指令并真实创建任务。'
          : '<b>Agnes 未连接</b>：对话已停用。到「设置 › 模型」填入 API Key 即可启用；本工作台不提供本地规则回复。') + '</p>' +
        '<p style="margin:0 0 8px">组织、任务与文档的改动保存在当前浏览器；模型配置存在 localStorage，API Key 仅保存在当前标签页。</p>' +
        '<p style="margin:0">版本 v1.0 · 构建 2026-11-14</p></div></div>' +
        '<div class="cb-panel"><h5>数据</h5><div class="cb-kv">' +
        kv('员工', DB.employees.length + '') + kv('项目', DB.projects.length + '') +
        kv('任务', DB.tasks.length + '') + kv('文档', DB.docs.length + '') + '</div>' +
        '<button type="button" class="cb-ghost" style="margin-top:10px" data-act="reset">重置工作区数据</button></div>';
    }
    return html;
  }

  function departmentDetail(id) {
    var d = null;
    DB.departments.forEach(function (x) { if (x.id === id) d = x });
    if (!d) return '<div class="cb-empty-block">部门不存在</div>';
    var members = DB.deptEmployees(d.name);
    if (S.deptSort) members = members.slice().sort(function (a, b) { return String(a.status).localeCompare(String(b.status)) });
    var projs = DB.projects.filter(function (p) { return members.some(function (m) { return m.id === p.lead }) });
    var html = '<div class="cb-crumb" data-act="back"><span>‹</span><span>组织</span></div>';
    html += '<div class="cb-detail-head"><div><div class="cb-detail-title">' + d.icon + ' ' + esc(d.name) + '</div>' +
      '<div class="cb-detail-sub">' + members.length + ' 名成员 · ' + projs.length + ' 个在管项目</div></div>' +
      '<div class="cb-detail-actions"><button type="button" class="primary" data-act="modal:task">派任务</button></div></div>';
    html += '<div class="cb-panel"><h5>部门职责</h5><div style="font-size:11px;line-height:18px;color:var(--bt-ink-2)">' + esc(d.desc) + '</div></div>';
    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>成员</h5><span class="cb-link" data-act="sort:dept">' + (S.deptSort ? '默认顺序' : '按状态') + '</span></div>' +
      members.map(function (e) {
        return '<button type="button" class="cb-member-row" data-act="open:emp:' + e.id + '">' + avatar(e) +
          '<span class="cb-member-copy"><strong>' + esc(e.name) + '</strong><small>' + esc(e.role) + '</small></span>' +
          dot(e.status) + '<span style="font-size:9px;color:var(--bt-ink-3)">' + (EMP_STATUS[e.status] || EMP_STATUS.idle).label + '</span></button>';
      }).join('') + '</div>';
    if (projs.length) {
      html += '<div class="cb-panel"><h5>在管项目</h5>' + projs.map(function (p) {
        return '<button type="button" class="cb-managed-row" data-act="open:project:' + p.id + '">' +
          '<span class="cb-project-icon">▱</span><span class="cb-managed-name">' + esc(p.name) + '</span>' +
          '<span class="cb-bar"><span class="cb-bar-fill" style="width:' + p.pct + '%"></span></span><small>' + p.pct + '%</small></button>';
      }).join('') + '</div>';
    }
    return html;
  }

  function searchView() {
    var q = (S.query || '').trim().toLowerCase();
    if (!q) return '<div class="cb-empty-block"><span class="cb-empty-glyph">⌕</span><span>输入关键词搜索员工、项目、任务和文档</span></div>';
    var hit = function (s) { return String(s).toLowerCase().indexOf(q) >= 0 };
    var emps = DB.employees.filter(function (e) { return hit(e.name) || hit(e.role) || hit(e.dept) || hit(e.bio) });
    var projs = DB.projects.filter(function (p) { return hit(p.name) || hit(p.goal) || hit(p.desc) });
    var tasks = DB.tasks.filter(function (t) { return hit(t.name) || hit(empName(t.assignee)) });
    var docs = DB.docs.filter(function (d) { return hit(d.title) || hit(d.desc) || hit(d.cat) });
    var total = emps.length + projs.length + tasks.length + docs.length;
    if (!total) return '<div class="cb-empty-block"><span class="cb-empty-glyph">◌</span><span>没有找到与“' + esc(S.query) + '”相关的内容</span></div>';
    var html = '<div class="cb-detail-head"><div><div class="cb-detail-title">搜索结果</div>' +
      '<div class="cb-detail-sub">“' + esc(S.query) + '” 共 ' + total + ' 条</div></div></div>';
    if (emps.length) {
      html += '<div class="cb-result-group"><h5>员工 · ' + emps.length + '</h5>' + emps.map(function (e) {
        return '<button type="button" class="cb-result-row" data-act="open:emp:' + e.id + '">' + avatar(e) +
          '<span class="cb-result-body"><strong>' + esc(e.name) + '</strong><small>' + esc(e.role) + ' · ' + esc(e.dept) + '</small></span>' + dot(e.status) + '</button>';
      }).join('') + '</div>';
    }
    if (projs.length) {
      html += '<div class="cb-result-group"><h5>项目 · ' + projs.length + '</h5>' + projs.map(function (p) {
        return '<button type="button" class="cb-result-row" data-act="open:project:' + p.id + '">' +
          '<span class="cb-doc-icon">▱</span><span class="cb-result-body"><strong>' + esc(p.name) + '</strong><small>' + esc(p.goal) + ' · ' + p.pct + '%</small></span>' + badge(p.status, projectStatusCls(p.status)) + '</button>';
      }).join('') + '</div>';
    }
    if (tasks.length) {
      html += '<div class="cb-result-group"><h5>任务 · ' + tasks.length + '</h5>' + tasks.map(function (t) {
        return '<button type="button" class="cb-result-row" data-act="open:task:' + t.id + '">' +
          '<span class="cb-doc-icon">◇</span><span class="cb-result-body"><strong>' + esc(t.name) + '</strong><small>' + esc(empName(t.assignee)) + ' · ' + esc(DB.projectById(t.project) ? DB.projectById(t.project).name : '') + '</small></span>' + badge(STATUS[t.status].label, STATUS[t.status].badge) + '</button>';
      }).join('') + '</div>';
    }
    if (docs.length) {
      html += '<div class="cb-result-group"><h5>文档 · ' + docs.length + '</h5>' + docs.map(function (d) {
        return '<button type="button" class="cb-result-row" data-act="doc:' + d.id + '">' +
          '<span class="cb-doc-icon">' + d.ext + '</span><span class="cb-result-body"><strong>' + esc(d.title) + '</strong><small>' + esc(d.desc) + '</small></span><span class="cb-badge">' + esc(d.cat) + '</span></button>';
      }).join('') + '</div>';
    }
    return html;
  }

  /* ================= inspector ================= */
  function renderInspector() {
    var host = $('#inspector');
    host.innerHTML = inspectorHTML();
  }

  function inspectorHTML() {
    var s = S.subject;
    var emp = s.type === 'employee' ? DB.byId[s.id] : null;
    var proj = s.type === 'project' ? DB.projectById(s.id) : null;
    var dept = null;
    if (s.type === 'department') DB.departments.forEach(function (d) { if (d.id === s.id) dept = d });

    if (emp) return inspectorEmployee(emp);
    if (proj) return inspectorProject(proj);
    if (dept) return inspectorDept(dept);
    if (s.type === 'group') {
      var grp = DB.groups.filter(function (g) { return g.id === s.id })[0];
      if (grp) return inspectorGroup(grp);
    }
    if (s.type === 'board') return inspectorBoard(s.id);
    return inspectorEmployee(DB.byId.ceo);
  }


  function inspectorGroup(g) {
    var members = g.members.map(function (id) { return DB.byId[id] }).filter(Boolean)
      .slice().sort(function (a, b) { return (b.level || 1) - (a.level || 1) });
    var tasks = DB.tasks.filter(function (t) { return g.members.indexOf(t.assignee) >= 0 && t.status !== 'done' });
    var html = '<div class="cb-inspector-hero"><div class="cb-hero-top">' +
      botMark(DB.byId[g.lead], 46, 'cb-avatar cb-avatar-lg') +
      '<div class="cb-hero-copy"><div class="cb-hero-name"><span>' + esc(g.name) + '</span></div>' +
      '<small>' + members.length + ' 名成员 · 负责人 ' + esc(empName(g.lead)) + '</small></div></div>' +
      '<div class="cb-hero-quote">「 ' + esc(g.purpose || '按需协作') + ' 」</div></div>';
    html += '<div class="cb-inspector-body">';
    html += '<section class="cb-section"><h4>成员</h4><div class="cb-info">' + members.map(function (m) {
      return '<button type="button" class="cb-member-row" data-act="open:emp:' + m.id + '">' + botMark(m, 22) +
        '<span class="cb-member-copy"><strong>' + esc(m.name) + ' ' + levelTag(m) + '</strong><small>' + esc(m.title || m.role) + '</small></span>' +
        '<span class="cb-employee-do">' + esc(currentAction(m.id)) + '</span></button>';
    }).join('') + '</div></section>';
    html += '<section class="cb-section"><h4>在办任务</h4><div class="cb-info">' +
      (tasks.length ? tasks.slice(0, 6).map(function (t) {
        return '<div class="cb-managed-row"><span class="cb-managed-name">' + esc(t.name) + '</span><small>' + esc(empName(t.assignee)) + '</small></div>';
      }).join('') : '<div class="cb-empty">暂无在办任务</div>') + '</div></section></div>';
    return html;
  }

  function inspectorBoard(kind) {
    if (kind === 'tasks') {
      var byStatus = ['pending', 'running', 'review', 'blocked', 'done'];
      var blocked = DB.tasks.filter(function (t) { return t.status === 'blocked' });
      var html = '<div class="cb-inspector-hero"><div class="cb-hero-top"><span class="cb-avatar cb-avatar-lg" style="background:linear-gradient(135deg,var(--bt-accent),var(--bt-accent-soft));color:#fff">◇</span>' +
        '<div class="cb-hero-copy"><div class="cb-hero-name"><span>任务看板</span></div><small>' + DB.tasks.length + ' 个任务 · ' + blocked.length + ' 个阻塞</small></div></div>' +
        '<div class="cb-hero-quote">「 让每个人的任务都可见 」</div></div>';
      html += '<div class="cb-inspector-body">';
      html += '<section class="cb-section"><h4>状态分布</h4>' + byStatus.map(function (k) {
        return barRow(STATUS[k].label, DB.tasks.filter(function (t) { return t.status === k }).length, DB.tasks.length);
      }).join('') + '</section>';
      html += '<section class="cb-section"><h4>阻塞任务 (' + blocked.length + ')</h4><div class="cb-task-list">' +
        (blocked.length ? blocked.map(taskRow).join('') : '<div class="cb-empty">没有阻塞任务</div>') + '</div></section>';
      html += '<section class="cb-section"><h4>按项目</h4>' + DB.projects.map(function (p) {
        return barRow(p.name, DB.projectTasks(p.id).length, DB.tasks.length);
      }).join('') + '</section></div>';
      return html;
    }
    if (kind === 'docs') {
      var cats = ['规范', '文档', '会议', '模板'];
      var html2 = '<div class="cb-inspector-hero"><div class="cb-hero-top"><span class="cb-avatar cb-avatar-lg" style="background:linear-gradient(135deg,var(--bt-accent),var(--bt-accent-soft));color:#fff">▧</span>' +
        '<div class="cb-hero-copy"><div class="cb-hero-name"><span>知识库</span></div><small>' + DB.docs.length + ' 篇文档 · 4 个分类</small></div></div>' +
        '<div class="cb-hero-quote">「 组织记忆，随时可查 」</div></div>';
      html2 += '<div class="cb-inspector-body">';
      html2 += '<section class="cb-section"><h4>分类</h4>' + cats.map(function (c) {
        return barRow(c, DB.docs.filter(function (d) { return d.cat === c }).length, DB.docs.length);
      }).join('') + '</section>';
      html2 += '<section class="cb-section"><h4>最近更新</h4>' + DB.docs.slice(0, 4).map(function (d) {
        return '<div class="cb-managed-row"><span class="cb-doc-icon" style="width:20px;height:20px;font-size:9px">' + d.ext + '</span>' +
          '<span class="cb-managed-name">' + esc(d.title) + '</span><small>' + d.updated.slice(5) + '</small></div>';
      }).join('') + '</section></div>';
      return html2;
    }
    if (kind === 'settings') {
      return '<div class="cb-inspector-hero"><div class="cb-hero-top"><span class="cb-avatar cb-avatar-lg" style="background:linear-gradient(135deg,var(--bt-accent),var(--bt-accent-soft));color:#fff">⚙</span>' +
        '<div class="cb-hero-copy"><div class="cb-hero-name"><span>CompBotOrg</span></div><small>v1.0 · ' + (aiReady() ? 'Agnes 已连接' : 'Agnes 未连接') + '</small></div></div>' +
        '<div class="cb-hero-quote">「 让 AI 成为更强大的生产力 」</div></div>' +
        '<div class="cb-inspector-body"><section class="cb-section"><h4>数据规模</h4><div class="cb-info">' +
        infoRow('员工', DB.employees.length + '') + infoRow('部门', DB.departments.length + '') +
        infoRow('项目', DB.projects.length + '') + infoRow('任务', DB.tasks.length + '') + '</div></section>' +
        '<section class="cb-section"><h4>模型连接</h4><div style="font-size:10px;line-height:16px;color:var(--bt-ink-2)">' +
        (aiReady()
          ? '已连接 <b>' + esc(AI.model) + '</b>。CEO 与员工的回复由模型实时生成，请求会携带组织架构、项目进度与任务清单作为上下文。'
          : 'Agnes 未连接：对话已停用，点上方横幅或到「设置 › 模型」填入 API Key。本工作台不提供本地规则回复。') +
        '</div></section></div>';
    }
    return '<div class="cb-inspector-hero"><div class="cb-hero-top"><span class="cb-avatar cb-avatar-lg" style="background:linear-gradient(135deg,var(--bt-accent),var(--bt-accent-soft));color:#fff">⌕</span>' +
      '<div class="cb-hero-copy"><div class="cb-hero-name"><span>搜索</span></div><small>' + (S.query ? '“' + esc(S.query) + '”' : '未输入关键词') + '</small></div></div></div>' +
      '<div class="cb-inspector-body"><section class="cb-section"><h4>搜索范围</h4>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px">' + ['员工', '部门', '项目', '任务', '文档'].map(function (x) { return '<span class="cb-chip">' + x + '</span>' }).join('') + '</div>' +
      '<div style="margin-top:8px;font-size:9px;color:var(--bt-ink-3);line-height:15px">快捷键：/ 或 Ctrl K 聚焦搜索框，Esc 清空。</div></section></div>';
  }

  function heroHTML(name, sub, status, quote) {
    var st = EMP_STATUS[status] || EMP_STATUS.idle;
    return '<div class="cb-inspector-hero"><div class="cb-hero-top">' + avatar({ name: name, lead: true }, 'cb-avatar-lg') +
      '<div class="cb-hero-copy"><div class="cb-hero-name"><span>' + esc(name) + '</span>' + dot(status) +
      '<small style="font-size:9px;color:var(--bt-ink-3)">' + st.label + '</small></div>' +
      '<small>' + esc(sub) + '</small></div></div>' +
      (quote ? '<div class="cb-hero-quote">' + esc(quote) + '</div>' : '') + '</div>';
  }
  function tabsHTML() {
    var tabs = [['status', '状态'], ['relation', '关系'], ['task', '任务'], ['ability', '能力']];
    return '<div class="cb-tabs">' + tabs.map(function (t) {
      return '<button type="button" class="cb-tab ' + (S.inspectorTab === t[0] ? 'is-current' : '') + '" data-act="itab:' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }

  function inspectorEmployee(e) {
    var tasks = DB.empTasks(e.id);
    var html = heroHTML(e.name, e.role, e.status, e.bio);
    html += tabsHTML();
    html += '<div class="cb-inspector-body">';
    if (S.inspectorTab === 'status') {
      html += '<section class="cb-section"><h4>基本信息</h4><div class="cb-info">' +
        infoRow('部门', e.dept) + infoRow('职位', e.role.split(' · ')[0]) + infoRow('入职', e.joined) +
        infoRow('状态', EMP_STATUS[e.status].label) + '</div></section>';
      var team = DB.employees.filter(function (x) { return x.dept === e.dept && x.id !== e.id });
      html += '<section class="cb-section"><div class="cb-section-head"><h4>同事 (' + team.length + ')</h4>' +
        '<span class="cb-link" data-act="open:dept:' + deptIdOf(e.dept) + '">查看部门 ›</span></div>' +
        '<div class="cb-team-avatars">' + team.slice(0, 6).map(function (t) {
          return '<button type="button" class="cb-team-avatar" title="' + esc(t.name) + '" data-act="open:emp:' + t.id + '">' + avatar(t, 'cb-avatar-sm') + '</button>';
        }).join('') + '</div></section>';
      html += '<section class="cb-section"><div class="cb-section-head"><h4>参与项目 (' + DB.projects.filter(function (p) { return p.members.indexOf(e.id) >= 0 }).length + ')</h4></div>' +
        '<div class="cb-managed">' + DB.projects.filter(function (p) { return p.members.indexOf(e.id) >= 0 }).slice(0, 4).map(function (p) {
          return '<button type="button" class="cb-managed-row" data-act="open:project:' + p.id + '">' +
            '<span class="cb-project-icon">▱</span><span class="cb-managed-name">' + esc(p.name) + '</span>' +
            '<span class="cb-bar"><span class="cb-bar-fill" style="width:' + p.pct + '%"></span></span><small>' + p.pct + '%</small></button>';
        }).join('') + '</div></section>';
    } else if (S.inspectorTab === 'relation') {
      var mgr = e.dept === '管理层' ? null : DB.byId.ceo;
      var peers = DB.employees.filter(function (x) { return x.dept === e.dept && x.id !== e.id });
      var leadOf = e.lead ? null : DB.employees.filter(function (x) { return x.dept === e.dept && x.lead && x.id !== e.id })[0];
      html += '<section class="cb-section"><h4>汇报线</h4><div class="cb-graph cb-graph-chain">' +
        (mgr ? '<div class="cb-graph-node" data-act="open:emp:' + mgr.id + '"><strong>' + esc(mgr.name) + '</strong>' + avatar(mgr, 'cb-avatar-xs') + '</div><div class="cb-graph-line"></div>' : '') +
        '<div class="cb-graph-node is-self"><strong>' + esc(e.name) + '</strong>' + avatar(e, 'cb-avatar-xs') + '</div>' +
        (peers.length ? '<div class="cb-graph-line"></div><div class="cb-graph-nodes">' + peers.map(function (x) {
          return '<div class="cb-graph-node" data-act="open:emp:' + x.id + '"><strong>' + esc(x.name) + '</strong>' + avatar(x, 'cb-avatar-xs') + '</div>';
        }).join('') + '</div>' : '') +
        '</div><div class="cb-graph-cap">' + (mgr ? '上级：' + esc(mgr.name) + '（CEO）' : '直属老板') +
        (leadOf ? ' · 部门负责人：' + esc(leadOf.name) : '') + '</div></section>';
      var shared = DB.projects.filter(function (p) { return p.members.indexOf(e.id) >= 0 });
      var partners = {};
      shared.forEach(function (p) {
        p.members.forEach(function (id) { if (id !== e.id) partners[id] = (partners[id] || 0) + 1 });
      });
      var ranked = Object.keys(partners).sort(function (a, b) { return partners[b] - partners[a] });
      html += '<section class="cb-section"><h4>协作伙伴 (' + ranked.length + ')</h4>' +
        (ranked.length ? ranked.slice(0, 4).map(function (id) {
          return '<div class="cb-relation"><span>' + esc(e.name) + '</span><b>' + partners[id] + ' 个项目</b><span>' + esc(empName(id)) + '</span></div>';
        }).join('') : '<div class="cb-empty">暂无共同项目</div>') + '</section>';
    } else if (S.inspectorTab === 'task') {
      html += '<section class="cb-section"><div class="cb-section-head"><h4>当前任务 (' + tasks.length + ')</h4>' +
        '<span class="cb-link" data-act="modal:task">＋ 派任务</span></div><div class="cb-task-list">' +
        (tasks.length ? tasks.map(taskRow).join('') : '<div class="cb-empty">暂无任务</div>') + '</div></section>';
      if (S.inspectTask && DB.taskById(S.inspectTask) && DB.taskById(S.inspectTask).assignee === e.id) {
        html += taskEditor(DB.taskById(S.inspectTask));
      }
      html += '<section class="cb-section"><h4>工作量</h4>' + barRow('进行中', tasks.filter(function (t) { return t.status === 'running' }).length, tasks.length) +
        barRow('待处理', tasks.filter(function (t) { return t.status === 'pending' }).length, tasks.length) +
        barRow('已完成', tasks.filter(function (t) { return t.status === 'done' }).length, tasks.length) + '</section>';
    } else {
      html += '<section class="cb-section"><h4>能力</h4><div style="display:flex;flex-wrap:wrap;gap:5px">' +
        (e.skills || ['协作']).map(function (s) { return '<span class="cb-chip"><b>✓</b>' + esc(s) + '</span>' }).join('') + '</div></section>';
      html += '<section class="cb-section"><h4>可用工具</h4><div style="display:flex;flex-wrap:wrap;gap:5px">' +
        ['message_bot', 'organization_task', 'organization_plan', 'read_file'].map(function (s) { return '<span class="cb-chip">' + esc(s) + '</span>' }).join('') + '</div></section>';
    }
    html += '</div>';
    return html;
  }

  function deptIdOf(name) {
    var id = 'mgmt';
    DB.departments.forEach(function (d) { if (d.name === name) id = d.id });
    return id;
  }
  function infoRow(k, v) {
    return '<div class="cb-info-row"><span class="cb-info-label">' + esc(k) + '</span><span class="cb-info-value">' + esc(v) + '</span></div>';
  }
  function barRow(label, n, total) {
    var p = total ? Math.round(n / total * 100) : 0;
    return '<div class="cb-managed-row"><span class="cb-managed-name">' + label + '</span>' +
      '<span class="cb-bar"><span class="cb-bar-fill" style="width:' + p + '%"></span></span><small>' + n + '</small></div>';
  }

  function inspectorProject(p) {
    var tasks = DB.projectTasks(p.id);
    var avg = tasks.length ? Math.round(tasks.reduce(function (a, t) { return a + t.pct }, 0) / tasks.length) : 0;
    var html = heroHTML(p.name, '项目 · ' + p.status, p.status === '风险' ? 'blocked' : p.status === '已完成' ? 'online' : 'running', p.goal);
    html += tabsHTML();
    html += '<div class="cb-inspector-body">';
    if (S.inspectorTab === 'status') {
      html += '<section class="cb-section"><h4>项目信息</h4><div class="cb-info">' +
        infoRow('状态', p.status) + infoRow('进度', avg + '%') + infoRow('负责人', empName(p.lead)) + infoRow('截止', p.due) + '</div></section>';
      html += '<section class="cb-section"><h4>成员 (' + p.members.length + ')</h4><div class="cb-team-avatars">' +
        p.members.map(function (id) {
          var e = DB.byId[id]; if (!e) return '';
          return '<button type="button" class="cb-team-avatar" title="' + esc(e.name) + '" data-act="open:emp:' + id + '">' + avatar(e, 'cb-avatar-sm') + '</button>';
        }).join('') + '</div></section>';
      html += '<section class="cb-section"><h4>任务分布</h4>' + ['pending', 'running', 'review', 'blocked', 'done'].map(function (k) {
        return barRow(STATUS[k].label, tasks.filter(function (t) { return t.status === k }).length, tasks.length);
      }).join('') + '</section>';
    } else if (S.inspectorTab === 'relation') {
      html += '<section class="cb-section"><h4>项目关系</h4><div class="cb-graph">' +
        '<div class="cb-graph-root">' + esc(empName(p.lead)) + '</div><div class="cb-graph-line"></div>' +
        '<div class="cb-graph-nodes">' + p.members.filter(function (id) { return id !== p.lead }).map(function (id) {
          var e = DB.byId[id]; if (!e) return '';
          return '<div class="cb-graph-node" data-act="open:emp:' + id + '"><strong>' + esc(e.name) + '</strong>' + avatar(e, 'cb-avatar-xs') + '</div>';
        }).join('') + '</div></div></section>';
    } else if (S.inspectorTab === 'task') {
      html += '<section class="cb-section"><div class="cb-section-head"><h4>任务 (' + tasks.length + ')</h4>' +
        '<span class="cb-link" data-act="modal:task">＋ 添加</span></div><div class="cb-task-list">' +
        (tasks.length ? tasks.map(taskRow).join('') : '<div class="cb-empty">暂无任务</div>') + '</div></section>';
      if (S.inspectTask && DB.taskById(S.inspectTask) && DB.taskById(S.inspectTask).project === p.id) {
        html += taskEditor(DB.taskById(S.inspectTask));
      }
    } else {
      html += '<section class="cb-section"><h4>所需能力</h4><div style="display:flex;flex-wrap:wrap;gap:5px">' +
        ['架构设计', '任务拆解', '进度跟踪', '跨部门协作'].map(function (s) { return '<span class="cb-chip"><b>✓</b>' + esc(s) + '</span>' }).join('') + '</div></section>';
    }
    html += '</div>';
    return html;
  }

  function inspectorDept(d) {
    var members = DB.deptEmployees(d.name);
    var html = heroHTML(d.name, members.length + ' 名成员', 'running', d.desc);
    html += tabsHTML();
    html += '<div class="cb-inspector-body">';
    if (S.inspectorTab === 'status') {
      html += '<section class="cb-section"><h4>部门信息</h4><div class="cb-info">' +
        infoRow('成员', members.length + ' 人') + infoRow('在线', members.filter(function (m) { return m.status !== 'idle' }).length + ' 人') +
        infoRow('项目', DB.projects.filter(function (p) { return members.some(function (m) { return m.id === p.lead }) }).length + ' 个') +
        infoRow('任务', DB.tasks.filter(function (t) { return members.some(function (m) { return m.id === t.assignee }) }).length + ' 个') + '</div></section>';
      html += '<section class="cb-section"><h4>成员</h4>' + members.map(function (m) {
        return '<button type="button" class="cb-employee" data-act="open:emp:' + m.id + '">' + dot(m.status) + '<span>' + esc(m.name) + '</span><small>' + esc(m.role.split(' · ')[0]) + '</small></button>';
      }).join('') + '</section>';
    } else if (S.inspectorTab === 'task') {
      var ts = DB.tasks.filter(function (t) { return members.some(function (m) { return m.id === t.assignee }) });
      html += '<section class="cb-section"><h4>部门任务 (' + ts.length + ')</h4><div class="cb-task-list">' + ts.map(taskRow).join('') + '</div></section>';
    } else if (S.inspectorTab === 'relation') {
      html += '<section class="cb-section"><h4>协作部门</h4>' + DB.departments.filter(function (x) { return x.id !== d.id }).map(function (x) {
        return '<div class="cb-relation"><span>' + esc(d.name) + '</span><b>协作</b><span>' + esc(x.name) + '</span></div>';
      }).join('') + '</section>';
    } else {
      html += '<section class="cb-section"><h4>部门能力</h4><div style="display:flex;flex-wrap:wrap;gap:5px">' +
        members.slice(0, 6).map(function (m) { return '<span class="cb-chip">' + esc((m.skills || ['协作'])[0]) + '</span>' }).join('') + '</div></section>';
    }
    html += '</div>';
    return html;
  }

  /* ================= render root ================= */
  function render() {
    document.body.setAttribute('data-cb-inspector', S.inspector ? 'on' : 'off');
    document.body.setAttribute('data-density', S.density);
    if (S.theme === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    renderRail();
    renderLeft();
    renderCenter();
    renderInspector();
  }

  function scrollChat(toBottom) {
    var chat = $('#center-body');
    if (!chat || !chat.classList.contains('pv-chat')) return;
    requestAnimationFrame(function () {
      chat.scrollTop = toBottom === false ? 0 : chat.scrollHeight;
    });
  }

  /* ================= actions ================= */
  function clearDraft() {
    closeMention();
    S.draftMentions = []; S.draftRefs = [];
  }
  function nav(view) {
    clearDraft();
    S.view = view;
    S.query = '';
    S.projectTab = 'overview';
    if (view === 'org') { S.subject = { type: 'employee', id: 'ceo' }; S.scrollMode = 'top' }
    if (view === 'projects') S.subject = { type: 'project', id: (DB.projects[0] || {}).id };
    if (view === 'tasks') S.subject = { type: 'board', id: 'tasks' };
    if (view === 'knowledge') S.subject = { type: 'board', id: 'docs' };
    if (view === 'settings') S.subject = { type: 'board', id: 'settings' };
    if (view === 'search') S.subject = { type: 'board', id: 'search' };
    if (view === 'groups') {
      var g0 = DB.groups[0];
      S.subject = g0 ? { type: 'group', id: g0.id } : { type: 'board', id: 'groups' };
    }
    S.inspectorTab = 'status';
    render();
    var box = $('[data-input=search]');
    if (box) box.value = '';
    var b = $('#center-body');
    if (b) b.scrollTop = 0;
  }

  function openEmp(id) {
    if (!DB.byId[id]) return;
    clearDraft();
    S.view = 'org';
    S.subject = { type: 'employee', id: id };
    S.inspectorTab = 'status';
    S.scrollMode = 'top';
    render();
  }
  function openProject(id) {
    if (!DB.projectById(id)) return;
    S.view = 'projects';
    S.subject = { type: 'project', id: id };
    S.projectTab = 'overview';
    S.inspectorTab = 'status';
    S.highlightTask = null;
    render();
    var b = $('#center-body'); if (b) b.scrollTop = 0;
  }
  function openDept(id) {
    S.view = 'org';
    S.subject = { type: 'department', id: id };
    S.inspectorTab = 'status';
    render();
  }
  function openTask(id) {
    var t = DB.taskById(id); if (!t) return;
    S.view = 'projects';
    S.subject = { type: 'project', id: t.project };
    S.projectTab = 'tasks';
    S.inspectorTab = 'task';
    S.highlightTask = id;
    S.inspectTask = id;
    render();
    var row = document.querySelector('[data-task="' + id + '"]');
    if (row) { row.classList.add('is-highlight'); if (row.scrollIntoView) row.scrollIntoView({ block: 'center' }) }
    toast('定位到任务：' + t.name);
  }

  function send() {
    if (isGroup()) { sendGroup(); return; }
    if (!isChat() || busyId === convId()) return;
    var input = composerEl(); if (!input) return;
    var text = input.value.replace(/\s+$/, ''); if (!text.trim()) return;
    /* 回复只有 Agnes 一条路径：没连上模型不发送、不生成任何本地兜底内容 */
    if (!aiReady()) {
      toast('请先连接 Agnes · 点顶部横幅填入 API Key');
      return;
    }
    /* 只保留文本里仍存在的 token：用户手删掉 @姓名 后不该留幽灵点名 */
    var mentions = S.draftMentions.filter(function (id) {
      var e = DB.byId[id]; return e && text.indexOf('@' + e.name) >= 0;
    });
    var refs = S.draftRefs.filter(function (r) { return text.indexOf('#' + r.name) >= 0 });
    closeMention();
    S.draftMentions = []; S.draftRefs = [];
    input.value = ''; autoGrow(input);
    S.drafts[convId()] = '';
    var empId = convId();
    var list = conv(empId);
    var m = { from: 'me', text: text, time: now() };
    if (mentions.length) m.mentions = mentions;
    if (refs.length) m.refs = refs;
    list.push(m);
    /* 点名即抄送：被 @ 的人在自己的会话里看到同一条消息，但不触发模型回复 */
    mentions.forEach(function (id) {
      if (id === empId || !DB.byId[id]) return;
      conv(id).push({ from: 'me', text: text, time: now(), mentions: mentions, refs: refs, cc: empId });
      saveConv(id);
    });
    var chat = $('#center-body');
    chat.insertAdjacentHTML('beforeend', msgHTML(m, list.length - 1));
    saveConv(empId);
    streamReply(empId, chat, list, mentions);
  }

  function groupMessages() {
    var g = currentGroup();
    if (!g) return '<div class="cb-empty-block">群聊不存在</div>';
    var members = g.members.map(function (id) { return DB.byId[id] }).filter(Boolean);
    var head = '<div class="cb-room-head">' +
      '<div class="cb-room-head-copy"><strong>' + esc(g.name) + '</strong><small>' + esc(g.purpose || '') + '</small></div>' +
      '<div class="cb-room-head-marks">' + members.slice(0, 8).map(function (m) {
        return '<button type="button" class="cb-room-mark" data-act="open:emp:' + m.id + '" title="' + esc(m.name + ' · ' + m.title) + '">' +
          botMark(m, 24) + '</button>';
      }).join('') + '</div>' +
      '<div class="cb-room-head-meta">' + members.length + ' 名成员 · 负责人 ' + esc(empName(g.lead)) +
      ' · 你在此下指令，' + esc(empName(g.lead)) + ' 会拆给成员并跟踪执行</div></div>';
    var list = conv(convId());
    var out = head;
    for (var i = 0; i < list.length; i++) out += msgHTML(list[i], i);
    if (busyId === convId()) out += typingHTML();
    return out;
  }
  function groupContext(g) {
    var lead = DB.byId[g.lead] || DB.byId.ceo;
    var members = g.members.map(function (id) { return DB.byId[id] }).filter(Boolean);
    var head = [
      '你是「' + lead.name + '」，' + (lead.title || lead.role) + '，是群「' + g.name + '」的负责人。',
      '群目的：' + (g.purpose || '按需协作'),
      '群成员：' + members.map(function (m) {
        return m.name + '(' + (m.title || m.role) + '，L' + (m.level || 1) + ')';
      }).join('、'),
      '',
      '【群聊规则·像 DSHBot 一样干活】',
      '1. 老板在群里下指令，你负责拆解并派给最合适的成员，不能让老板自己去追人。',
      '2. 派活就在群里直接 @ 人，一句一条，写清要他做什么、交什么。格式：',
      '   @成员姓名 具体要做什么，交付什么',
      '   被 @ 的人会立刻在群里收到这条消息并开工，所以别写成「你去跟进一下」这种空话。',
      '3. 同时，每条派活后面另起一行输出：[[TASK]]任务名|成员姓名|项目名（任务名要具体可执行），它会进入任务看板并被跟踪。',
      '4. 只 @ 真正要干活的人；不要 @ 自己，不要 @ 老板；一件事只 @ 一个人，需要协作就分别 @ 不同的人。',
      '5. 回复要短，像 IM 群里的回话：先说一句你打算怎么拆，然后逐条 @ 人，不超过 3 句废话。',
      '6. 不要推诿，不要只口头说「我去安排」而不 @ 人、不输出 [[TASK]]。',
      ''
    ].join('\n');
    return head + '\n' + aiContext(lead.id);
  }
  function parseGroupReply(text) {
    var p = parseTasks(text);
    var groups = [], bots = [], keep = [];
    String(p.text || '').split('\n').forEach(function (line) {
      var mg = /^\s*\[\[GROUP\]\]\s*(.+)$/.exec(line);
      if (mg) {
        var sg = mg[1].split('|').map(function (x) { return x.trim() });
        if (sg[0]) groups.push({
          name: sg[0].slice(0, 20),
          members: (sg[1] || '').split(/[,，、]/).map(function (x) { return x.trim() }).filter(Boolean),
          purpose: sg[2] || ''
        });
        return;
      }
      var mb = /^\s*\[\[BOT\]\]\s*(.+)$/.exec(line);
      if (mb) {
        var sb = mb[1].split('|').map(function (x) { return x.trim() });
        if (sb[0]) bots.push({
          name: sb[0].slice(0, 16), title: sb[1] || '执行',
          level: parseInt(sb[2], 10) || 1, dept: sb[3] || '',
          reportsTo: sb[4] || '', bio: sb[5] || ''
        });
        return;
      }
      keep.push(line);
    });
    return { text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(), specs: p.specs, groups: groups, bots: bots };
  }
  function sendGroup() {
    var g = currentGroup();
    if (!g || busyId === convId()) return;
    var input = composerEl(); if (!input) return;
    var text = input.value.replace(/\s+$/, ''); if (!text.trim()) return;
    if (!aiReady()) { toast('群聊指令需要先连接 Agnes'); return; }
    var cid = convId(), list = conv(cid);
    list.push({ from: 'me', text: text, time: now() });
    input.value = ''; autoGrow(input); S.drafts[cid] = '';
    saveConv(cid);
    renderCenter(); scrollChat();

    var lead = DB.byId[g.lead] || DB.byId.ceo;
    busyId = cid; S.busy = true; S.stopped = false;
    var body = $('#center-body');
    body.insertAdjacentHTML('beforeend', streamingHTML(lead.id));
    setSendMode('stop');
    var host = body.querySelector('[data-stream]');
    var bubble = host ? host.querySelector('.pv-bubble') : null;
    var acc = '';
    var sys = groupContext(g);
    var msgs = list.filter(function (m) { return m.text && !m.err && m.kind !== 'note' }).slice(-16).map(function (m) {
      return { role: m.from === 'me' ? 'user' : 'assistant', content: (m.from === 'me' ? '' : '[' + empName(m.from) + '] ') + m.text };
    });
    aiRaw(sys, msgs, function (full) {
      acc = full;
      if (bubble) {
        var vis = parseGroupReply(acc).text || '正在拆解…';
        bubble.innerHTML = esc(vis).replace(/\n/g, '<br>') + '<span class="cb-caret"></span>';
      }
      scrollChat();
    }, null).then(function (full) {
      var parsed = parseGroupReply(full || acc);
      var made = commitTasks(parsed.specs, lead.id, []);
      var created = parsed.groups.map(createGroupFromAI).filter(Boolean);
      list.push({
        from: lead.id, text: parsed.text || '（空回复）', time: now(),
        tasks: made.length ? made : null
      });
      /* @ 了谁，谁就在群里收到这条指令并立刻开工 —— 这是 DSHBot 的派活方式 */
      var called = callOutInGroup(g, lead.id, parsed.text, made);
      busyId = null; S.busy = false; abortCtl = null;
      setSendMode('send');
      saveConv(cid);
      render();
      scrollChat();
      if (created.length) toast('已创建 ' + created.length + ' 个群聊');
      if (called.length) toast('已在群里 @ ' + called.join('、') + '，他们已收到指令并开工');
      else if (made.length) toast('已派发 ' + made.length + ' 个任务，成员开始执行');
    }).catch(function (e) {
      busyId = null; S.busy = false; abortCtl = null;
      setSendMode('send');
      var why = aiExplain(e);
      list.push({ from: lead.id, text: '群指令执行失败：' + why, time: now(), err: true });
      saveConv(cid); render(); scrollChat();
      toast('群指令失败：' + why);
    });
  }
  /* The lead calls members out by @ in the group, DSHBot style: the named member gets
     the instruction in the group transcript and starts on it right away. The task it
     maps to is matched by assignee (the first task this round made for that person),
     so the @ line and the task line stay one thing instead of two. */
  function callOutInGroup(g, leadId, text, made) {
    var called = [], seen = {};
    var names = g.members.map(function (id) { return DB.byId[id] }).filter(Boolean)
      .filter(function (m) { return m.id !== leadId && m.id !== 'ceo' })
      .sort(function (a, b) { return b.name.length - a.name.length });
    String(text || '').split('\n').forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      names.forEach(function (m) {
        var at = trimmed.indexOf('@' + m.name);
        if (at < 0 || seen[m.id]) return;
        seen[m.id] = true;
        var brief = trimmed.slice(at + m.name.length + 1).replace(/^[\s,:：，、]+/, '').replace(/^[-—·]\s*/, '').trim();
        if (!brief) brief = trimmed;
        var own = null;
        for (var i = 0; i < made.length; i++) if (made[i].assignee === m.id) { own = made[i]; break }
        conv('g:' + g.id).push({
          from: leadId, to: m.id, kind: 'call',
          text: brief.slice(0, 220), time: now(), task: own ? own.id : ''
        });
        called.push(m.name);
        /* 被 @ 的人在自己的会话里也收到这条派活，并立刻执行 */
        var cust = conv(m.id);
        cust.push({
          from: leadId, text: '群里 @ 你：' + brief.slice(0, 220), time: now(), fromGroup: g.name,
          dispatch: own ? own.id : '', callFrom: leadId
        });
        saveConv(m.id);
        if (own) queueTask(own.id);
      });
    });
    if (called.length) saveConv('g:' + g.id);
    return called;
  }
  function createGroupFromAI(spec) {
    if (!spec || !spec.name) return null;
    var ids = [];
    (spec.members || []).forEach(function (name) {
      var hit = null;
      DB.employees.forEach(function (e) { if (!hit && (e.name === name || e.id === name)) hit = e });
      if (hit && ids.indexOf(hit.id) < 0) ids.push(hit.id);
    });
    if (!ids.length) return null;
    var leadId = ids.slice().sort(function (a, b) { return (DB.byId[b].level || 1) - (DB.byId[a].level || 1) })[0];
    var g = {
      id: uid('g'), name: spec.name.slice(0, 20), purpose: (spec.purpose || '按需协作').slice(0, 40),
      lead: leadId, members: ids, createdBy: 'ai', joined: new Date().toISOString().slice(0, 10)
    };
    DB.groups.push(g);
    saveOrg();
    return g;
  }
  function openGroup(id) {
    S.view = 'groups';
    S.subject = { type: 'group', id: id };
    S.inspectorTab = 'status';
    render();
    scrollChat();
  }
  function createGroup() {
    var name = (($('#f-group-name') || {}).value || '').trim();
    var purpose = (($('#f-group-purpose') || {}).value || '').trim();
    if (!name) { toast('请填写群名'); return; }
    var ids = $$('#f-group-members input:checked').map(function (x) { return x.value });
    if (ids.length < 2) { toast('至少选择 2 名成员'); return; }
    var lead = ($('#f-group-lead') || {}).value;
    if (!lead || ids.indexOf(lead) < 0) {
      lead = ids.slice().sort(function (a, b) { return (DB.byId[b].level || 1) - (DB.byId[a].level || 1) })[0];
    }
    var g = {
      id: uid('g'), name: name.slice(0, 20), purpose: purpose || '按需协作',
      lead: lead, members: ids, createdBy: 'user', joined: new Date().toISOString().slice(0, 10)
    };
    DB.groups.push(g);
    saveOrg();
    closeModal();
    openGroup(g.id);
    toast('已创建群聊：' + g.name);
  }

  function shuffleBotLook() {
    S.botDraft = randomLook();
    var host = $('#bot-look-preview');
    if (host) host.innerHTML = botMark({ id: 'draft', look: S.botDraft }, 56);
  }
  /* Picking a character in the new-Bot form: the preview and the selection ring both
     update in place, without rebuilding the form (which would drop what was typed). */
  function pickBotLook(kind, val) {
    S.botDraft = S.botDraft || randomLook();
    if (kind === 'shape') S.botDraft.shape = val;
    else S.botDraft.color = val;
    var host = $('#bot-look-preview');
    if (host) host.innerHTML = botMark({ id: 'draft', look: S.botDraft }, 56);
    var picker = $('#bot-look-picker');
    if (picker) {
      $$('.bt-shape', picker).forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-act') === 'botshape:' + S.botDraft.shape ? 'true' : 'false');
      });
      $$('.bt-color', picker).forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-act') === 'botcolor:' + S.botDraft.color ? 'true' : 'false');
      });
    }
  }
  function createBot() {
    var name = (($('#f-bot-name') || {}).value || '').trim();
    var title = (($('#f-bot-title') || {}).value || '').trim() || '执行';
    if (!name) { toast('请填写名字'); return; }
    if (DB.employees.some(function (e) { return e.name === name })) { toast('已有同名 Bot'); return; }
    var level = parseInt((($('#f-bot-level') || {}).value || '1'), 10);
    var dept = ($('#f-bot-dept') || {}).value || DB.departments[0].name;
    var reportsTo = ($('#f-bot-reports') || {}).value || null;
    var bio = (($('#f-bot-bio') || {}).value || '').trim();
    var emp = {
      id: uid('bot'), name: name.slice(0, 16), role: title, title: title,
      level: Math.max(1, Math.min(5, level || 1)), reportsTo: reportsTo || null,
      look: S.botDraft || randomLook(), dept: dept, status: 'idle',
      joined: new Date().toISOString().slice(0, 10),
      bio: bio || '按岗位职责执行任务。', skills: []
    };
    DB.employees.push(emp); DB.byId[emp.id] = emp;
    saveOrg();
    closeModal();
    S.view = 'org'; S.subject = { type: 'employee', id: emp.id };
    render();
    toast('已创建 ' + emp.name + ' · ' + emp.title);
  }
  function createBotFromAI(spec) {
    if (!spec || !spec.name) return null;
    if (DB.employees.some(function (e) { return e.name === spec.name })) return null;
    var dept = spec.dept;
    if (!DB.departments.some(function (d) { return d.name === dept })) dept = DB.departments[0].name;
    var reports = null;
    DB.employees.forEach(function (e) {
      if (!reports && (e.name === spec.reportsTo || e.id === spec.reportsTo)) reports = e;
    });
    var emp = {
      id: uid('bot'), name: spec.name.slice(0, 16), role: spec.title || 'AI 员工', title: spec.title || '执行',
      level: Math.max(1, Math.min(5, parseInt(spec.level, 10) || 1)), reportsTo: reports ? reports.id : null,
      look: randomLook(), dept: dept, status: 'idle', joined: new Date().toISOString().slice(0, 10),
      bio: spec.bio || '按岗位职责执行任务。', skills: []
    };
    DB.employees.push(emp); DB.byId[emp.id] = emp;
    saveOrg();
    return emp;
  }

  function setSendMode(mode) {
    var b = $('#composer-wrap .pv-send');
    if (!b) return;
    if (mode === 'stop') {
      b.setAttribute('data-act', 'stop');
      b.setAttribute('aria-label', '停止生成');
      b.classList.add('is-stop');
      b.innerHTML = '■';
    } else {
      b.setAttribute('data-act', 'send');
      b.setAttribute('aria-label', '发送');
      b.classList.remove('is-stop');
      b.innerHTML = '➤';
    }
  }

  function stopStream() {
    if (abortCtl) { try { abortCtl.abort() } catch (e) {} }
    abortCtl = null;
    S.stopped = true;
    toast('已停止生成');
  }

  /* ================= task execution ================= */
  var EXEC_BUSY = {}, execQueue = [], execPumping = false;

  function addAction(empId, act, text, taskId) {
    var list = conv(empId);
    list.push({ from: empId, kind: 'action', act: act, text: text, time: now(), task: taskId || '' });
    saveConv(empId);
    return list[list.length - 1];
  }
  function refreshIfViewing(empId) {
    if (isChat() && convId() === empId) { renderCenter(); scrollChat(); }
    renderLeft();
  }
  function parseExec(text) {
    var steps = [], report = '', other = [];
    String(text || '').split('\n').forEach(function (line) {
      var m = /^\s*\[\[STEP\]\]\s*(.+)$/.exec(line);
      if (m) { steps.push(m[1].trim()); return }
      var r = /^\s*\[\[REPORT\]\]\s*(.+)$/.exec(line);
      if (r) { report = r[1].trim(); return }
      if (line.trim()) other.push(line.trim());
    });
    return { steps: steps, report: report, other: other };
  }
  function execSystem(emp, t) {
    var proj = DB.projectById(t.project);
    return aiContext(emp.id) + '\n\n' +
      '【本轮是执行回合，不是聊天】\n' +
      '你现在在自己的工位上真正做这件事。不要寒暄、不要复述任务、不要征求同意。\n' +
      '只输出 3–5 行动作，每行严格以 [[STEP]] 开头，写清：做了什么、依据什么、产出什么。\n' +
      '最后一行严格以 [[REPORT]] 开头，一句话写验收结论（尽量可量化）。\n' +
      '除了 [[STEP]] 和 [[REPORT]] 行，不要输出任何其他内容。\n' +
      '任务：' + t.name + '｜项目：' + (proj ? proj.name : '未归属') + '｜截止：' + (t.due || '待排期') + '｜目标：' + (proj ? proj.goal : '');
  }
  function notifyReviewer(t, emp) {
    var to = t.by || emp.reportsTo || 'ceo';
    if (!DB.byId[to] || to === emp.id) to = 'ceo';
    conv(to).push({
      from: emp.id, kind: 'action', act: 'submit',
      text: '「' + t.name + '」已提交审核：' + (t.report || ''), time: now(), task: t.id
    });
    saveConv(to);
  }
  function runTask(taskId) {
    var t = DB.taskById(taskId);
    if (!t || t.status === 'done' || t.executing || EXEC_BUSY[taskId]) return Promise.resolve(false);
    var emp = DB.byId[t.assignee];
    if (!emp) return Promise.resolve(false);
    if (!aiReady()) { toast('执行任务需要先连接 Agnes'); return Promise.resolve(false); }
    EXEC_BUSY[taskId] = true;
    t.executing = true;
    if (t.status === 'pending' || t.status === 'blocked') t.status = 'running';
    if (t.pct < 5) t.pct = 5;
    addAction(emp.id, 'claim', '领取「' + t.name + '」，开始执行。', t.id);
    saveTasks(); refreshIfViewing(emp.id);

    var proj = DB.projectById(t.project) || {};
    var user = '执行任务：' + t.name + '\n项目：' + (proj.name || '未归属') +
      '\n目标：' + (proj.goal || '') + '\n截止：' + (t.due || '待排期') +
      '\n\n现在给出你的执行动作。';
    return aiRaw(execSystem(emp, t), [{ role: 'user', content: user }], null, null)
      .then(function (text) {
        var out = parseExec(text);
        t.executing = false; EXEC_BUSY[taskId] = false;
        if (!out.steps.length) throw new Error('模型没有输出可执行动作');
        out.steps.slice(0, 6).forEach(function (step) { addAction(emp.id, 'step', step, t.id) });
        var report = out.report || out.steps[out.steps.length - 1];
        t.report = report;
        t.status = 'review';
        t.pct = Math.max(t.pct, 78);
        t.assignment = {
          status: 'delivered', requestId: 'task:' + t.id,
          attempts: (t.assignment && t.assignment.attempts) || 1,
          updatedAt: Date.now(), error: ''
        };
        addAction(emp.id, 'submit', '提交审核：' + report, t.id);
        recalcProject(t.project);
        saveTasks();
        notifyReviewer(t, emp);
        refreshIfViewing(emp.id);
        render();
        toast(emp.name + ' 已交付「' + t.name + '」，等待验收');
        return true;
      })
      .catch(function (e) {
        t.executing = false; EXEC_BUSY[taskId] = false;
        var why = /可执行动作/.test((e && e.message) || '')
          ? '模型这次没给出可执行步骤，点「重新执行」再试一次'
          : aiExplain(e);
        addAction(emp.id, 'block', '执行受阻：' + why, t.id);
        t.status = 'blocked'; t.note = why;
        saveTasks(); refreshIfViewing(emp.id);
        toast('「' + t.name + '」执行受阻：' + why);
        return false;
      });
  }
  function queueTask(taskId) {
    if (execQueue.indexOf(taskId) >= 0 || EXEC_BUSY[taskId]) return;
    execQueue.push(taskId);
    pumpExec();
  }
  function pumpExec() {
    if (execPumping) return;
    var id = execQueue.shift();
    if (!id) return;
    execPumping = true;
    runTask(id).then(function () {
      execPumping = false;
      setTimeout(pumpExec, 280);
    });
  }
  function approveTask(id) {
    var t = DB.taskById(id); if (!t) return;
    t.review = (t.review || '').trim() || '验收通过';
    t.status = 'done'; t.pct = 100;
    var emp = DB.byId[t.assignee];
    if (emp) addAction(emp.id, 'done', '「' + t.name + '」验收通过，已归档。', t.id);
    recalcProject(t.project); saveTasks(); render();
    toast('已验收：' + t.name);
  }
  function rejectTask(id) {
    var t = DB.taskById(id); if (!t) return;
    t.review = (t.review || '').trim() || '需要返工';
    t.status = 'running'; t.executing = false;
    var emp = DB.byId[t.assignee];
    if (emp) addAction(emp.id, 'ask', '「' + t.name + '」被打回：' + t.review + '，重新执行。', t.id);
    saveTasks(); render();
    queueTask(id);
  }

  function streamReply(empId, chat, list, mentions) {
    busyId = empId; S.busy = true; S.stopped = false;
    chat.insertAdjacentHTML('beforeend', streamingHTML(empId));
    setSendMode('stop');
    var host = chat.querySelector('[data-stream]');
    var bubble = host ? host.querySelector('.pv-bubble') : null;
    var acc = '';
    var paint = function () {
      if (!bubble) return;
      if (!acc) return;
      /* 流式期间也把 [[TASK]] 行藏起来，不然用户会看到裸协议 */
      var vis = parseTasks(acc).text;
      bubble.innerHTML = esc(vis).replace(/\n/g, '<br>') + '<span class="cb-caret"></span>';
    };
    var think = function () {
      if (bubble && !acc) bubble.innerHTML = '<span class="cb-think">正在思考<span class="cb-typing"><i></i><i></i><i></i></span></span>';
    };
    scrollChat();
    aiStream(empId, function (full) { acc = full; paint(); scrollChat() }, think)
      .then(function (full) {
        var parsed = parseGroupReply(full || acc);
        var made = commitTasks(parsed.specs, empId, mentions);
        if (parsed.groups.length) parsed.groups.forEach(createGroupFromAI);
        if (parsed.bots.length) parsed.bots.forEach(createBotFromAI);
        var msg = { from: empId, text: parsed.text || '（空回复）', time: now() };
        if (made.length) msg.tasks = made;
        list.push(msg);
        busyId = null; S.busy = false; abortCtl = null;
        setSendMode('send');
        AI.state = 'ok'; AI.err = '';
        render();
        scrollChat();
        saveConv(empId);
        if (made.length) toast('已自动创建 ' + made.length + ' 个任务，可在任务看板查看');
      })
      .catch(function (e) {
        busyId = null; S.busy = false; abortCtl = null;
        setSendMode('send');
        /* 用户主动停止：保留已生成的部分，不当成错误 */
        if (S.stopped || /abort/i.test((e && e.message) || '')) {
          var so = parseTasks(acc).text;
          if (so) {
            list.push({ from: empId, text: so, time: now(), stopped: true });
            toast('已停止生成，保留已输出内容');
          } else {
            toast('已中止：模型还没开始输出正文');
          }
          render(); scrollChat(); saveConv(empId);
          return;
        }
        var why = aiExplain(e);
        AI.state = 'bad'; AI.err = why;
        list.push({ from: empId, text: '模型调用失败：' + why + '\n请到「设置 › 模型」检查接口地址、Key 与模型名。', time: now(), err: true });
        render();
        scrollChat();
        toast('模型调用失败：' + why);
      });
  }

  /* ================= modal ================= */
  function openModal(kind) {
    var mask = $('#modal-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'modal-mask'; mask.className = 'cb-modal-mask';
      mask.innerHTML = '<div class="cb-modal" id="modal"></div>';
      document.body.appendChild(mask);
      mask.addEventListener('click', function (e) { if (e.target === mask) closeModal() });
    }
    var modal = $('#modal');
    if (kind === 'bot-new') S.botDraft = randomLook();
    if (kind === 'task') {
      modal.innerHTML = '<h3>新建任务</h3><p>创建后会出现在任务看板与所属项目里。</p>' +
        '<div class="cb-field"><label>任务名称</label><input id="f-name" placeholder="例如：组织关系图交互"></div>' +
        '<div class="cb-field"><label>所属项目</label><select id="f-project">' +
        DB.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-field"><label>负责人</label><select id="f-owner">' +
        DB.employees.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + ' · ' + esc(e.dept) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-task">创建</button></div>';
    } else if (kind === 'doc-edit') {
      var de = null;
      DB.docs.forEach(function (x) { if (x.id === S.editDocId) de = x });
      if (!de) { toast('文档不存在'); return }
      modal.innerHTML = '<h3>编辑文档</h3><p>修改会立即保存到当前浏览器。</p>' +
        '<div class="cb-field"><label>标题</label><input id="f-doc-title" value="' + esc(de.title) + '"></div>' +
        '<div class="cb-field"><label>正文 · 支持 Markdown</label><textarea id="f-doc-body" rows="10" class="cb-doc-editor">' + esc(DOC_BODY[de.id] || '') + '</textarea></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:save-doc">保存</button></div>';
    } else if (kind === 'doc-new') {
      var cats = [];
      DB.docs.forEach(function (x) { if (cats.indexOf(x.cat) < 0) cats.push(x.cat) });
      if (cats.indexOf('其他') < 0) cats.push('其他');
      modal.innerHTML = '<h3>新建文档</h3><p>正文支持 Markdown，保存后进入知识库。</p>' +
        '<div class="cb-field"><label>标题</label><input id="f-doc-title" placeholder="例如：本周复盘"></div>' +
        '<div class="cb-field"><label>分类</label><select id="f-doc-cat">' +
        cats.map(function (c2) { return '<option value="' + esc(c2) + '">' + esc(c2) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-field"><label>正文 · 支持 Markdown</label><textarea id="f-doc-body" rows="10" class="cb-doc-editor" placeholder="# 标题"></textarea></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-doc">创建</button></div>';
    } else if (kind === 'bot-new') {
      var lvOpts = [5, 4, 3, 2, 1].map(function (n) {
        return '<option value="' + n + '"' + (n === 2 ? ' selected' : '') + '>L' + n + ' · ' + LEVELS[n].name + '</option>';
      }).join('');
      var deptOpts = DB.departments.map(function (d) {
        return '<option value="' + esc(d.name) + '">' + esc(d.name) + '</option>';
      }).join('');
      var repOpts = '<option value="">无（直接向老板汇报）</option>' + DB.employees.map(function (e) {
        return '<option value="' + e.id + '">' + esc(e.name) + ' · ' + esc(e.title || e.role) + '</option>';
      }).join('');
      modal.innerHTML = '<h3>新建 Bot</h3><p>设定岗位与级别，它会立刻加入组织、可被派活并进入群聊。</p>' +
        '<div class="cb-bot-preview"><span id="bot-look-preview">' + botMark({ id: 'draft', look: S.botDraft }, 56) + '</span>' +
        '<div class="cb-bot-preview-copy"><strong>形象</strong><small>点下面的角色和颜色，随时可改</small></div></div>' +
        '<div class="cb-field" id="bot-look-picker"><label>角色与颜色</label>' +
        characterGrid(S.botDraft, 'botshape', 'botcolor') + '</div>' +
        '<div class="cb-field"><label>名字</label><input id="f-bot-name" placeholder="例如：Data AI" maxlength="16"></div>' +
        '<div class="cb-field"><label>岗位</label><input id="f-bot-title" placeholder="例如：数据分析师" maxlength="20"></div>' +
        '<div class="cb-row"><div class="cb-field"><label>级别</label><select id="f-bot-level">' + lvOpts + '</select></div>' +
        '<div class="cb-field"><label>部门</label><select id="f-bot-dept">' + deptOpts + '</select></div></div>' +
        '<div class="cb-field"><label>汇报对象</label><select id="f-bot-reports">' + repOpts + '</select></div>' +
        '<div class="cb-field"><label>职责</label><textarea id="f-bot-bio" rows="2" placeholder="它负责什么、交付什么"></textarea></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-bot">创建</button></div>';
    } else if (kind === 'group-new') {
      modal.innerHTML = '<h3>新建群聊</h3><p>把相关 Bot 拉进群，由负责人统一接指令并拆解执行。</p>' +
        '<div class="cb-field"><label>群名</label><input id="f-group-name" placeholder="例如：官网改版攻坚" maxlength="20"></div>' +
        '<div class="cb-field"><label>目的</label><input id="f-group-purpose" placeholder="一句话说明这个群要解决什么"></div>' +
        '<div class="cb-field"><label>成员 · 至少 2 名</label><div id="f-group-members" class="cb-checks">' +
        DB.employees.map(function (e, idx) {
          return '<label class="cb-check"><input type="checkbox" value="' + e.id + '"' + (idx < 4 ? ' checked' : '') + '>' +
            botMark(e, 18) + '<span>' + esc(e.name) + '</span>' + levelTag(e) + '</label>';
        }).join('') + '</div></div>' +
        '<div class="cb-field"><label>负责人</label><select id="f-group-lead">' +
        DB.employees.map(function (e) {
          return '<option value="' + e.id + '"' + (e.id === 'ceo' ? ' selected' : '') + '>' + esc(e.name) + ' · ' + esc(e.title || e.role) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-group">创建</button></div>';
    } else {
      modal.innerHTML = '<h3>新建项目</h3><p>新项目会出现在左栏与项目视图。</p>' +
        '<div class="cb-field"><label>项目名称</label><input id="f-name" placeholder="例如：移动端适配"></div>' +
        '<div class="cb-field"><label>目标</label><input id="f-goal" placeholder="一句话说明要达成什么"></div>' +
        '<div class="cb-field"><label>负责人</label><select id="f-owner">' +
        DB.employees.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-project">创建</button></div>';
    }
    mask.classList.add('on');
    var input = $('#f-name') || $('#f-doc-title'); if (input) input.focus();
  }
  function closeModal() {
    var mask = $('#modal-mask');
    if (mask) mask.classList.remove('on');
  }
  function docMeta(title, body) {
    var plain = String(body || '').replace(/^#+\s+.*\n/, '').replace(/[#*`|>\[\]]/g, '').replace(/\s+/g, ' ').trim();
    return {
      desc: (plain || title).slice(0, 60),
      size: Math.max(1, Math.round(String(body || '').length / 400)) + ' KB',
      updated: new Date().toISOString().slice(0, 10)
    };
  }
  function saveDoc() {
    var d = null;
    DB.docs.forEach(function (x) { if (x.id === S.editDocId) d = x });
    if (!d) { toast('文档不存在'); return }
    var title = (($('#f-doc-title') || {}).value || '').trim();
    var body = (($('#f-doc-body') || {}).value || '').replace(/\s+$/, '');
    if (!title) { toast('请填写标题'); return }
    var meta = docMeta(title, body);
    d.title = title; d.desc = meta.desc; d.size = meta.size; d.updated = meta.updated;
    DOC_BODY[d.id] = body;
    DOC_DIRTY[d.id] = true;
    saveDocs();
    closeModal();
    render();
    toast('已保存文档：' + title);
  }
  function createDoc() {
    var title = (($('#f-doc-title') || {}).value || '').trim();
    var body = (($('#f-doc-body') || {}).value || '').replace(/\s+$/, '');
    var cat = ($('#f-doc-cat') || {}).value || '其他';
    if (!title) { toast('请填写标题'); return }
    var id = uid('d');
    var meta = docMeta(title, body);
    DB.docs.unshift({ id: id, title: title, cat: cat, ext: 'MD', size: meta.size, updated: meta.updated, desc: meta.desc });
    DOC_BODY[id] = body || ('# ' + title + '\n\n');
    saveDocs();
    closeModal();
    S.view = 'knowledge'; S.subject = { type: 'doc', id: id };
    render();
    toast('已创建文档：' + title);
  }
  function importDoc() {
    var el = $('#cb-file-input');
    if (!el) {
      el = document.createElement('input');
      el.type = 'file'; el.id = 'cb-file-input';
      el.accept = '.md,.markdown,.txt,.csv,.log,text/plain,text/markdown';
      el.style.display = 'none';
      document.body.appendChild(el);
      el.addEventListener('change', function () {
        var f = el.files && el.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var body = String(rd.result || '').slice(0, 120000);
          var title = f.name.replace(/\.[^.]+$/, '') || '导入文档';
          var id = uid('d');
          var meta = docMeta(title, body);
          DB.docs.unshift({ id: id, title: title, cat: '其他', ext: 'MD', size: meta.size, updated: meta.updated, desc: meta.desc });
          DOC_BODY[id] = body || ('# ' + title + '\n\n');
          saveDocs();
          S.view = 'knowledge'; S.subject = { type: 'doc', id: id };
          render();
          toast('已导入：' + f.name);
        };
        rd.onerror = function () { toast('读取文件失败') };
        rd.readAsText(f);
        el.value = '';
      });
    }
    el.click();
  }
  function copyDocTitle(id) {
    var d = null;
    DB.docs.forEach(function (x) { if (x.id === id) d = x });
    if (!d) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(d.title).then(function () { toast('已复制标题') }, function () { toast('复制失败') });
    } else toast(d.title);
  }

  function createTask() {
    var name = ($('#f-name') || {}).value || '';
    name = name.trim();
    if (!name) { toast('请填写任务名称'); return }
    var pid = ($('#f-project') || {}).value || 'p1';
    var owner = ($('#f-owner') || {}).value || 'ceo';
    DB.tasks.push({ id: uid('t'), name: name, project: pid, assignee: owner, status: 'pending', pct: 0, due: '待排期',
      report: '', review: '', assignment: { status: 'ready', requestId: 'task:new', attempts: 0, updatedAt: Date.now(), error: '' } });
    recalcProject(pid);
    closeModal();
    render();
    saveTasks();
    toast('已创建任务：' + name);
  }
  function createProject() {
    var name = ($('#f-name') || {}).value || '';
    name = name.trim();
    if (!name) { toast('请填写项目名称'); return }
    var goal = ($('#f-goal') || {}).value || '待补充目标';
    var owner = ($('#f-owner') || {}).value || 'ceo';
    var p = { id: uid('p'), name: name, goal: goal, status: '进行中', pct: 0, lead: owner, due: '待排期', desc: goal, members: [owner, 'ceo'] };
    DB.projects.push(p);
    closeModal();
    S.view = 'projects'; S.subject = { type: 'project', id: p.id };
    render();
    toast('已创建项目：' + name);
  }
  function resetAll() {
    clearConv(); clearTasks(); clearDocs(); clearOrg();
    var snap = JSON.parse(JSON.stringify(SEED_SNAPSHOT));
    ['employees', 'departments', 'projects', 'tasks', 'docs', 'groups'].forEach(function (k) {
      DB[k] = snap[k];
    });
    DB.byId = {};
    DB.employees.forEach(function (e) { DB.byId[e.id] = e });
    Object.keys(DOC_BODY).forEach(function (k) { if (!SEED_DOC_IDS[k]) delete DOC_BODY[k] });
    Object.keys(DOC_DIRTY).forEach(function (k) { delete DOC_DIRTY[k] });
    Object.keys(SEED_DOC_BODY).forEach(function (k) { DOC_BODY[k] = SEED_DOC_BODY[k] });
    S.drafts = {};
    S.messages = {};
    S.group = null; S.projectFilter = '全部'; S.docCat = '全部';
    S.inspectTask = null; S.highlightTask = null;
    S.view = 'org'; S.subject = { type: 'employee', id: 'ceo' };
    render();
    toast('已恢复到初始示例数据');
  }

  function focusTaskField(id, field) {
    var el = $('[data-' + field + '="' + id + '"]');
    if (el) { try { el.focus() } catch (e) {} }
  }
  function setTaskStatus(id, st) {
    var t = DB.taskById(id); if (!t || !STATUS[st]) return;
    if (st === t.status) return;
    if ((TASK_TRANSITIONS[t.status] || []).indexOf(st) < 0) {
      toast('不能从「' + ((STATUS[t.status] || {}).label || t.status) + '」直接到「' + STATUS[st].label + '」，需按 待处理 → 进行中 → 待审核 → 已完成');
      return;
    }
    if (st === 'review' && !(t.report || '').trim()) {
      toast('先写「交付汇报」，才能提交待审核'); focusTaskField(id, 'report'); return;
    }
    if (st === 'done' && !(t.review || '').trim()) {
      toast('先写「CEO 验收」，才能标记完成'); focusTaskField(id, 'review'); return;
    }
    t.status = st;
    if (st === 'done') t.pct = 100;
    else if (st === 'pending') t.pct = 0;
    else if (t.pct === 0) t.pct = 10;
    recalcProject(t.project);
    syncEmpStatus(t.assignee);
    render();
    saveTasks();
    toast('「' + t.name + '」→ ' + STATUS[st].label);
  }
  function setTaskPct(id, v) {
    var t = DB.taskById(id); if (!t) return;
    t.pct = pct(v);
    /* 进度滑块不越权改状态：状态只能由状态按钮按状态机推进 */
    if (t.status === 'done' && t.pct < 100) t.status = 'review';
    recalcProject(t.project);
    saveTasks();
  }
  function setTaskOwner(id, empId) {
    var t = DB.taskById(id); if (!t || !DB.byId[empId]) return;
    var old = t.assignee;
    t.assignee = empId;
    t.assignment = { status: 'ready', requestId: 'task:' + id, attempts: 0, updatedAt: Date.now(), error: '' };
    syncEmpStatus(old); syncEmpStatus(empId);
    render();
    saveTasks();
    toast('已改派给 ' + empName(empId));
  }
  function syncEmpStatus(empId) {
    var e = DB.byId[empId]; if (!e || e.id === 'ceo') return;
    var ts = DB.empTasks(empId);
    var active = ts.some(function (t) { return t.status === 'running' || t.status === 'review' });
    var blocked = ts.some(function (t) { return t.status === 'blocked' });
    e.status = blocked ? 'blocked' : active ? (ts.some(function (t) { return t.status === 'review' }) ? 'review' : 'running') : (ts.length ? 'idle' : 'idle');
  }

  function recalcProject(pid) {
    var p = DB.projectById(pid); if (!p) return;
    var ts = DB.projectTasks(pid);
    /* 全部任务等权：未开工按 0 计入，进度不会因为漏算而虚高 */
    p.pct = ts.length ? Math.round(ts.reduce(function (a, t) { return a + t.pct }, 0) / ts.length) : 0;
    if (p.pct >= 100 && ts.every(function (t) { return t.status === 'done' })) p.status = '已完成';
    else if (p.status === '已完成') p.status = '进行中';
  }

  /* ================= events ================= */
  document.addEventListener('click', function (ev) {
    if (S.mention && !ev.target.closest('#mention-pop') &&
        !(ev.target.getAttribute && ev.target.getAttribute('data-input') === 'composer')) closeMention();
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var parts = t.getAttribute('data-act').split(':');
    var a = parts[0], b = parts[1], c = parts[2];
    if (a === 'nav') nav(b);
    else if (a === 'mpick') pickMention(+b);
    else if (a === 'mention') openEmp(b);
    else if (a === 'open' && b === 'emp') openEmp(c);
    else if (a === 'open' && b === 'project') openProject(c);
    else if (a === 'open' && b === 'dept') openDept(c);
    else if (a === 'open' && b === 'group') openGroup(c);
    else if (a === 'open' && b === 'task') openTask(c);
    else if (a === 'toggle' && b === 'dept') { S.deptOpen[c] = !S.deptOpen[c]; renderLeft() }
    else if (a === 'collapse' && b === 'dept') { S.deptCollapsed = !S.deptCollapsed; renderLeft() }
    else if (a === 'collapse' && b === 'proj') { S.projCollapsed = !S.projCollapsed; renderLeft() }
    else if (a === 'group') { S.group = S.group === b ? null : b; renderLeft() }
    else if (a === 'pfilter') { S.projectFilter = b; renderLeft() }
    else if (a === 'tfilter') { S.taskFilter = b; render() }
    else if (a === 'dcat') { S.docCat = b; render() }
    else if (a === 'setsec') { S.settingsSection = b; render() }
    else if (a === 'itab') { S.inspectorTab = b; renderInspector() }
    else if (a === 'ptab') { S.projectTab = b; render() }
    else if (a === 'back') {
      if (S.view === 'projects') { S.view = 'org'; S.subject = { type: 'employee', id: 'ceo' } }
      else if (S.view === 'org') { S.subject = { type: 'employee', id: 'ceo' } }
      render();
    }
    else if (a === 'tstatus') { setTaskStatus(parts[1], parts[2]) }
    else if (a === 'taskrun') { runTask(b) }
    else if (a === 'taskapprove') { approveTask(b) }
    else if (a === 'taskreject') { rejectTask(b) }
    else if (a === 'send') send();
    else if (a === 'stop') stopStream();
    else if (a === 'report') makeReport(b);
    else if (a === 'modal' && b === 'task') openModal('task');
    else if (a === 'modal' && b === 'project') openModal('project');
    else if (a === 'modal' && b === 'close') closeModal();
    else if (a === 'modal' && b === 'create-task') createTask();
    else if (a === 'modal' && b === 'create-project') createProject();
    else if (a === 'modal' && b === 'doc-new') openModal('doc-new');
    else if (a === 'modal' && b === 'bot-new') openModal('bot-new');
    else if (a === 'modal' && b === 'create-bot') createBot();
    else if (a === 'modal' && b === 'group-new') openModal('group-new');
    else if (a === 'modal' && b === 'create-group') createGroup();
    else if (a === 'botlook') shuffleBotLook();
    else if (a === 'botshape') pickBotLook('shape', b);
    else if (a === 'botcolor') pickBotLook('color', b);
    else if (a === 'modal' && b === 'create-doc') createDoc();
    else if (a === 'modal' && b === 'save-doc') saveDoc();
    else if (a === 'editdoc') { S.editDocId = b; openModal('doc-edit') }
    else if (a === 'doc' && b === 'import') importDoc();
    else if (a === 'doc' && b === 'copy') copyDocTitle(c);
    else if (a === 'sort' && b === 'docs') { S.docSort = S.docSort === 'name' ? 'updated' : 'name'; render(); toast(S.docSort === 'name' ? '已按名称排序' : '已按更新时间排序') }
    else if (a === 'sort' && b === 'dept') { S.deptSort = !S.deptSort; render(); toast(S.deptSort ? '已按状态排序' : '已恢复默认顺序') }
    else if (a === 'toggle' && b === 'daily') { S.dailyDigest = !S.dailyDigest; render(); toast(S.dailyDigest ? '已开启每日进展摘要' : '已关闭每日进展摘要') }
    else if (a === 'theme') { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(); toast(S.theme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式') }
    else if (a === 'insp') { S.inspector = !S.inspector; render(); toast(S.inspector ? '已展开 Inspector' : '已收起 Inspector') }
    else if (a === 'settheme') { S.theme = b; render() }
    else if (a === 'density') { S.density = b; render() }
    else if (a === 'toggle' && b === 'insp') { S.inspector = !S.inspector; render() }
    else if (a === 'toggle' && b === 'notify') { S.notify = !S.notify; render() }
    else if (a === 'toast') { toast(b || '暂不支持') }
    else if (a === 'doc') { S.view = 'knowledge'; S.subject = { type: 'doc', id: b }; render(); var bd = $('#center-body'); if (bd) bd.scrollTop = 0 }
    else if (a === 'copy') {
      var list = conv(convId()); var m = list[+b];
      if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).then(function () { toast('已复制') }, function () { toast('复制失败') });
      else toast('已复制');
    }
    else if (a === 'quote') { var q = conv(convId())[+b]; var inp = composerEl(); if (q && inp) { inp.value = '> ' + q.text.split('\n')[0] + '\n'; S.drafts[convId()] = inp.value; inp.focus() } }
    else if (a === 'retry') {
      if (busyId) { toast('上一条还在生成，先停止再重发'); return }
      var cid = convId(), lm = conv(cid)[+b];
      if (lm && lm.from === 'me') {
        var inp2 = composerEl();
        if (inp2) { inp2.value = lm.text; S.drafts[convId()] = lm.text; autoGrow(inp2); inp2.focus() }
        dropFrom(cid, +b);
        renderCenter(); scrollChat();
        saveConv(cid);
      }
    }
    else if (a === 'ai' && b === 'save') aiSaveForm();
    else if (a === 'ai' && b === 'test') aiTest();
    else if (a === 'ai' && b === 'clear') aiClear();
    else if (a === 'openai') {
      S.view = 'settings';
      S.subject = { type: 'board', id: 'settings' };
      S.settingsSection = 'model';
      render();
      var kb = $('#ai-key');
      if (kb) { try { kb.focus(); kb.select() } catch (e) {} }
    }
    else if (a === 'reset') { resetAll() }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id && /^ai-(base|key|model|temp)$/.test(t.id)) { readAiForm(); return }
    if (t.getAttribute && t.getAttribute('data-progress')) {
      var pid0 = t.getAttribute('data-progress');
      setTaskPct(pid0, t.value);
      var lab = t.parentNode.querySelector('b');
      if (lab) lab.textContent = pct(t.value) + '%';
      return;
    }
    if (t.getAttribute && (t.getAttribute('data-report') || t.getAttribute('data-review'))) {
      var tid = t.getAttribute('data-report') || t.getAttribute('data-review');
      var tk = DB.taskById(tid);
      if (tk) {
        if (t.getAttribute('data-report')) tk.report = t.value;
        else tk.review = t.value;
        saveTasks();
      }
      return;
    }
    if (t.getAttribute && t.getAttribute('data-input') === 'composer') {
      autoGrow(t);
      S.drafts[convId()] = t.value;
      if (!ev.isComposing) updateMention(t);
      return;
    }
    if (t.getAttribute && t.getAttribute('data-input') === 'search') {
      S.query = t.value;
      if (S.view === 'search' || S.view === 'org') {
        if (S.query.trim() && S.view !== 'search') { S.view = 'search'; S.searchBack = true; S.subject = { type: 'board', id: 'search' } }
        if (!S.query.trim() && S.view === 'search') { S.view = 'org'; S.subject = { type: 'employee', id: 'ceo' } }
      }
      renderCenter(); renderInspector();
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.getAttribute && t.getAttribute('data-reassign')) {
      setTaskOwner(t.getAttribute('data-reassign'), t.value);
    }
    if (t.getAttribute && t.getAttribute('data-progress')) render();
  });

  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target.tagName || '').toLowerCase();
    var isComposer = ev.target.getAttribute && ev.target.getAttribute('data-input') === 'composer';
    if (isComposer && S.mention && S.mention.items.length) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); mentionMove(1); return }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); mentionMove(-1); return }
      if (ev.key === 'Escape') { ev.preventDefault(); closeMention(); return }
      if ((ev.key === 'Enter' || ev.key === 'Tab') && !ev.shiftKey) {
        ev.preventDefault(); pickMention(S.mention.index); return;
      }
    }
    if (ev.key === 'Enter' && ev.target.id && /^ai-(base|key|model|temp)$/.test(ev.target.id)) {
      ev.preventDefault(); aiSaveForm(); return;
    }
    if (ev.key === 'Enter' && ev.target.getAttribute && ev.target.getAttribute('data-input') === 'composer') {
      if (ev.shiftKey) return;   /* Shift+Enter 换行 */
      ev.preventDefault(); send(); return;
    }
    if (ev.key === '/' && tag !== 'input' && tag !== 'textarea') {
      ev.preventDefault(); var s = $('[data-input=search]'); if (s) s.focus();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault(); var s2 = $('[data-input=search]'); if (s2) s2.focus();
    }
    if (ev.key === 'Escape') {
      closeMention();
      closeModal();
      if (S.query) { S.query = ''; if (S.view === 'search') S.view = 'org'; render(); }
    }
  });

  /* ================= boot ================= */
  function boot() {
    aiLoad();
    loadConv();
    loadTasks();
    loadDocs();
    loadOrg();
    $('#left-search').innerHTML = searchBox('搜索员工、部门、项目…');
    render();
    document.body.setAttribute('data-ready', '1');
    setTimeout(function () {
      if (aiReady()) toast('模型已就绪 · ' + AI.model);
      else toast('Agnes 未连接 · 到「设置 › 模型」填入 API Key');
    }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__cb = { DB: DB, S: S, AI: AI, render: render, openEmp: openEmp, openProject: openProject, openTask: openTask, send: send, aiTest: aiTest };
})();
