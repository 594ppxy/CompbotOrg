/* CompBotOrg workbench — state-driven UI.
   Views: org / projects / tasks / knowledge / settings / search
   Every navigation actually swaps the left column, the centre view and the inspector.
   Chat replies are rule-based demo responses (no model API is connected). */
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
      { id: 'ceo', name: 'CEO', role: 'AI 总经理 · 全局调度', dept: '管理层', status: 'online', joined: '2026-11-13', bio: '把老板的一句话变成可执行的计划，并对结果负责。', skills: ['目标拆解', '任务委派', '进度跟踪', '风险预警'], lead: true },
      { id: 'coo', name: 'Organizer', role: 'COO · 运营调度', dept: '管理层', status: 'online', joined: '2026-11-13', bio: '负责人力调度与跨部门协同，保证任务不断档。', skills: ['资源编排', '跨部门协调', '流程设计'] },
      { id: 'cfo', name: 'CFO AI', role: 'CFO · 资源与预算', dept: '管理层', status: 'idle', joined: '2026-11-13', bio: '盯住成本与产出比，给每个项目算清账。', skills: ['成本核算', '预算规划'] },
      { id: 'cto', name: 'DSHBot', role: 'CTO · 技术负责人', dept: '技术部', status: 'running', joined: '2026-11-13', bio: '负责整体技术架构与 DSHBot 核心改造。', skills: ['架构设计', 'Node.js', '系统集成'] },
      { id: 'backend', name: 'Backend AI', role: '后端工程师', dept: '技术部', status: 'running', joined: '2026-11-13', bio: '组织关系网与数据接口的实现者。', skills: ['API 设计', '数据建模'] },
      { id: 'platform', name: 'Platform AI', role: '平台工程师', dept: '技术部', status: 'idle', joined: '2026-11-13', bio: '负责 Skill 系统与插件运行时。', skills: ['插件系统', '工具编排'] },
      { id: 'qa', name: 'QA AI', role: '测试工程师', dept: '技术部', status: 'idle', joined: '2026-11-13', bio: '守住发布前的最后一道门。', skills: ['自动化测试', '回归验证'] },
      { id: 'research', name: 'Research AI', role: '研究负责人', dept: '研究部', status: 'idle', joined: '2026-11-13', bio: '负责下一代 Agent 平台的技术预研。', skills: ['论文复现', '技术选型'] },
      { id: 'model', name: 'Model AI', role: '模型工程师', dept: '研究部', status: 'review', joined: '2026-11-13', bio: '多 Agent 协作策略与评测。', skills: ['模型评测', 'Prompt 工程'] },
      { id: 'product', name: 'Product AI', role: '产品经理', dept: '产品部', status: 'running', joined: '2026-11-13', bio: '把需求翻译成可交付的任务清单。', skills: ['需求分析', '任务拆解'] },
      { id: 'design', name: 'Design AI', role: '交互设计师', dept: '产品部', status: 'idle', joined: '2026-11-13', bio: '负责三栏工作台的视觉与交互细节。', skills: ['视觉设计', '交互原型'] },
      { id: 'ops', name: 'Ops AI', role: '运营负责人', dept: '运营部', status: 'idle', joined: '2026-11-13', bio: '内容、增长与知识库运营。', skills: ['内容运营', '数据分析'] }
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
    ]
  };

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
    messages: {},
    busy: false,
    newTaskProject: 'p1',
    settingsSection: 'model'
  };

  /* ================= model connection ================= */
  var AI_STORE = 'cb.ai.config.v1';
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
        ['base', 'key', 'model', 'temp', 'max'].forEach(function (k) {
          if (o[k] !== undefined && o[k] !== null && o[k] !== '') AI[k] = o[k];
        });
      }
    } catch (e) {}
    /* one-shot key import via #k=sk-... — the fragment never reaches the server */
    var mm = /(?:^|[#&])k=([^&]+)/.exec(location.hash || '');
    if (mm) {
      try {
        AI.key = decodeURIComponent(mm[1]).trim();
        aiSave();
        try { history.replaceState(null, '', location.pathname + location.search) } catch (e) {}
        setTimeout(function () { toast('已导入 API Key，模型已启用') }, 700);
      } catch (e) {}
    }
  }
  function aiSave() {
    try {
      localStorage.setItem(AI_STORE, JSON.stringify({
        base: AI.base, key: AI.key, model: AI.model, temp: AI.temp, max: AI.max
      }));
    } catch (e) {}
  }
  function aiReady() { return !!(AI.key && AI.model) }
  function aiUrl() {
    var b = String(AI.base || '').trim().replace(/\/+$/, '');
    if (!b) b = 'https://apihub.agnes-ai.com/v1';
    if (/\/chat\/completions$/.test(b)) return b;
    if (!/\/v\d+$/.test(b)) b += '/v1';
    return b + '/chat/completions';
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
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + body;
      else out.push({ role: role, content: body });
    });
    if (out.length && out[0].role === 'assistant') out.shift();
    return out;
  }

  function aiStream(empId, onDelta, onThink) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort() }, 90000);
      var payload = {
        model: AI.model,
        temperature: Number(AI.temp) || 0.6,
        max_tokens: Number(AI.max) || 900,
        stream: true,
        messages: [{ role: 'system', content: aiContext(empId) }].concat(aiMessages(empId))
      };
      fetch(aiUrl(), {
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
        var out = String(text || '').trim();
        if (!out) throw new Error('模型返回空内容');
        resolve(out);
      }).catch(function (e) {
        clearTimeout(timer);
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
    AI.state = 'busy';
    fetch(aiUrl(), {
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
    toast('已清除 Key，回到本地演示回复');
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

  function commitTasks(specs, fromId) {
    var made = [];
    (specs || []).forEach(function (s) {
      var owner = null;
      DB.employees.forEach(function (e) {
        if (owner) return;
        if (e.name === s.owner || e.role === s.owner || e.id === s.owner) owner = e;
      });
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
      DB.tasks.push(t);
      if (owner.status === 'idle') owner.status = 'running';
      recalcProject(proj.id);
      made.push(t);
    });
    return made;
  }

  function conv(id) {
    if (!S.messages[id]) {
      var seed = SEED[id];
      S.messages[id] = seed ? JSON.parse(JSON.stringify(seed)) : [
        { from: 'them', text: '你好，我是 ' + (DB.byId[id] ? DB.byId[id].name : 'AI 员工') + '。有任务直接说，我会同步进度。', time: now() }
      ];
    }
    return S.messages[id];
  }
  function convId() {
    if (S.subject.type === 'employee') return S.subject.id;
    return 'ceo';
  }
  function isChat() { return S.view === 'org' && S.subject.type === 'employee' }

  /* ================= small renderers ================= */
  function avatar(emp, size) {
    var cls = 'cb-avatar ' + (size || 'cb-avatar-sm');
    var ch = emp && emp.lead ? '♛' : (emp && emp.name ? emp.name.slice(0, 1) : '?');
    var color = emp && emp.lead ? 'background:linear-gradient(135deg,var(--bt-accent),var(--bt-accent-soft));color:#fff' : '';
    return '<span class="' + cls + '" style="' + color + '">' + esc(ch) + '</span>';
  }
  function dot(status) {
    var s = EMP_STATUS[status] || EMP_STATUS.idle;
    return '<span class="cb-dot ' + s.cls + '"></span>';
  }
  function badge(text, cls) { return '<span class="cb-badge ' + (cls || '') + '">' + esc(text) + '</span>' }
  function empName(id) { var e = DB.byId[id]; return e ? e.name : id }
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
    html += '<button type="button" class="cb-ceo-card" data-act="open:emp:ceo">' + avatar(DB.byId.ceo, 'cb-avatar-lg') +
      '<span class="cb-ceo-copy"><span class="cb-ceo-name">CEO ' + dot('online') + '<small>在线</small></span>' +
      '<small class="cb-ceo-role">AI 总经理 · 全局调度</small></span><span class="cb-chevron">›</span></button>';

    html += '<section class="cb-block"><div class="cb-block-head"><strong>组织概览</strong>' +
      '<span class="cb-link" data-act="nav:settings">查看详情 ›</span></div><div class="cb-stats">' +
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
            dot(m.status) + '<span>' + esc(m.name) + '</span></button>';
        });
        html += '</div>';
      }
      html += '</div>';
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
    $('#left-foot').innerHTML = '<button type="button" class="cb-ghost" data-act="toast:演示版不含文件上传">导入文档</button>';
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
    $('#left-foot').innerHTML = '<div class="cb-empty" style="padding:6px">CompBotOrg v1.0 · ' + (aiReady() ? '模型已连接' : '演示') + '</div>';
    return html;
  }

  /* ================= center: head ================= */
  function renderCenter() {
    var head = $('#center-head'), body = $('#center-body'), host = $('#composer-wrap'), slot = $('#ai-slot');
    head.innerHTML = centerHead();
    if (slot) slot.innerHTML = aiBanner();

    if (isChat()) {
      body.className = 'pv-chat';
      body.innerHTML = chatMessages();
      if (!host.firstChild) host.innerHTML = composerHTML();
      else {
        var inp = host.querySelector('input');
        if (inp) inp.placeholder = composerPlaceholder();
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
      settings: ['设置', aiReady() ? '模型已连接 · ' + AI.model : '模型未连接 · 当前为演示回复'],
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
  function msgHTML(m, i) {
    var mine = m.from === 'me';
    var who = mine ? DB.me : (DB.byId[m.from] || DB.byId.ceo);
    var body = esc(m.text).replace(/\n/g, '<br>');
    var card = m.card ? taskCardHTML(m.card) : '';
    var made = createdTasksHTML(m.tasks);
    var errCls = m.err ? ' is-err' : '';
    return '<div class="pv-msg ' + (mine ? 'mine' : '') + '">' +
      avatar(who, 'cb-avatar-sm') +
      '<div class="pv-msg-body">' +
      (mine ? '' : '<div class="pv-msg-name">' + esc(who.name) + '<span style="margin-left:6px;opacity:.7">' + esc(m.time || '') + '</span></div>') +
      '<div class="pv-bubble' + errCls + '">' + body + card + made + '</div>' +
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
    if (!isChat()) return '';
    if (!aiReady()) {
      return '<div class="cb-ai-banner" data-act="openai"><span><b>当前是演示回复</b> · 接上模型后，CEO 和员工会基于真实组织数据实时作答，并自动派活</span><span class="cb-ai-badge">去配置 ›</span></div>';
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
    return '给 ' + (DB.byId[convId()] || DB.byId.ceo).name + ' 下达任务，或直接 @ 其他员工…';
  }
  function composerHTML() {
    return '<div class="pv-composer"><span class="pv-clip">📎</span>' +
      '<input type="text" data-input="composer" placeholder="' + esc(composerPlaceholder()) + '" aria-label="消息">' +
      '<button type="button" class="pv-send" data-act="send" aria-label="发送">➤</button></div>';
  }

  /* ================= center: details ================= */
  function centerDetail() {
    if (S.view === 'projects') return projectDetail();
    if (S.view === 'tasks') return taskBoard();
    if (S.view === 'knowledge') return knowledgeView();
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
      '<div class="cb-detail-actions"><button type="button" data-act="toast:已生成周报草稿">生成周报</button>' +
      '<button type="button" class="primary" data-act="open:emp:' + p.lead + '">找负责人</button></div></div>';

    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>整体进度</h5><span style="font-size:11px;font-weight:750">' + avg + '%</span></div>' +
      '<div class="cb-progress-lg"><i style="width:' + avg + '%"></i></div>' +
      '<div class="cb-kv" style="margin-top:10px">' +
      kv('任务', tasks.length + ' 个') + kv('已完成', tasks.filter(function (t) { return t.status === 'done' }).length + ' 个') +
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

  function knowledgeView() {
    var cat = S.docCat || '全部';
    var docs = cat === '全部' ? DB.docs : DB.docs.filter(function (d) { return d.cat === cat });
    var html = '<div class="cb-detail-head"><div><div class="cb-detail-title">知识库</div>' +
      '<div class="cb-detail-sub">' + docs.length + ' 篇文档 · 分类：' + esc(cat) + '</div></div>' +
      '<div class="cb-detail-actions"><button type="button" class="primary" data-act="toast:演示版不含文件上传">＋ 新建文档</button></div></div>';
    html += '<div class="cb-kv" style="margin-bottom:12px">' + kv('文档总数', DB.docs.length + ' 篇') +
      kv('本周更新', '4 篇') + kv('存储占用', '56 KB') + kv('索引状态', '正常') + '</div>';
    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>文档</h5><span class="cb-link" data-act="toast:已按更新时间排序">最近更新</span></div>' +
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
        (ready ? '对话由 ' + esc(AI.model) + ' 实时生成，并会读取下面的组织、项目与任务数据作为上下文' : '未配置 Key，对话走本地规则回复（演示模式）') +
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
        '<p class="cb-ai-hint">Key 只写在这台设备的 localStorage，不进入页面源码、不经过任何中转服务器。换设备或清缓存后需重新填写。' +
        (AI.err ? '<br><span style="color:var(--bt-danger)">上次错误：' + esc(AI.err) + '</span>' : '') + '</p>' +
        '</div></div>';
      html += '<div class="cb-panel"><h5>怎么用</h5><div style="font-size:11px;line-height:18px;color:var(--bt-ink-2)">' +
        '<p style="margin:0 0 6px">填好地址和 Key，点「保存并测试」，看到上方状态变绿就通了。</p>' +
        '<p style="margin:0 0 6px">回到组织页，直接对 CEO 说「把官网上线这周做完」——它会引用真实项目与任务数据回答，需要交办时自动建任务。</p>' +
        '<p style="margin:0">任何 OpenAI 兼容服务都能用：DeepSeek、Kimi、OpenAI、本地 Ollama 等，只改地址与模型名。</p></div></div>';
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
        '<button type="button" class="cb-switch on" data-act="toast:演示版仅保留开关状态"></button></div>' +
        '<div class="cb-set-row"><div class="cb-set-copy"><strong>阻塞提醒</strong><small>有任务阻塞超过 24 小时时提醒</small></div>' +
        '<button type="button" class="cb-switch ' + (S.notify ? 'on' : '') + '" data-act="toggle:notify"></button></div></div>';
    } else {
      html += '<div class="cb-panel"><h5>关于 CompBotOrg</h5>' +
        '<div style="font-size:11px;line-height:19px;color:var(--bt-ink-2)">' +
        '<p style="margin:0 0 8px">AI 组织工作台：左侧组织导航，中间与 CEO / 员工的会话，右侧上下文 Inspector。</p>' +
        '<p style="margin:0 0 8px">' + (aiReady()
          ? '<b>当前已连接模型</b>：' + esc(AI.model) + '。对 CEO 说的话会带上组织架构、项目进度与任务清单一起提交，需要交办时前端会解析指令并真实创建任务。'
          : '<b>当前为演示模式</b>：组织、项目、任务数据为本地示例；对话回复由规则生成，<b>尚未连接模型</b>。到「设置 › 模型」填上 Key 即可切换为真实 AI。') + '</p>' +
        '<p style="margin:0 0 8px">组织数据存在当前浏览器内存里，刷新会回到初始示例；模型配置存在 localStorage，刷新后保留。</p>' +
        '<p style="margin:0">版本 v1.0 · 构建 2026-11-14</p></div></div>' +
        '<div class="cb-panel"><h5>数据</h5><div class="cb-kv">' +
        kv('员工', DB.employees.length + '') + kv('项目', DB.projects.length + '') +
        kv('任务', DB.tasks.length + '') + kv('文档', DB.docs.length + '') + '</div>' +
        '<button type="button" class="cb-ghost" style="margin-top:10px" data-act="reset">重置演示数据</button></div>';
    }
    return html;
  }

  function departmentDetail(id) {
    var d = null;
    DB.departments.forEach(function (x) { if (x.id === id) d = x });
    if (!d) return '<div class="cb-empty-block">部门不存在</div>';
    var members = DB.deptEmployees(d.name);
    var projs = DB.projects.filter(function (p) { return members.some(function (m) { return m.id === p.lead }) });
    var html = '<div class="cb-crumb" data-act="back"><span>‹</span><span>组织</span></div>';
    html += '<div class="cb-detail-head"><div><div class="cb-detail-title">' + d.icon + ' ' + esc(d.name) + '</div>' +
      '<div class="cb-detail-sub">' + members.length + ' 名成员 · ' + projs.length + ' 个在管项目</div></div>' +
      '<div class="cb-detail-actions"><button type="button" data-act="toast:演示版不支持调整组织架构">调整架构</button>' +
      '<button type="button" class="primary" data-act="modal:task">派任务</button></div></div>';
    html += '<div class="cb-panel"><h5>部门职责</h5><div style="font-size:11px;line-height:18px;color:var(--bt-ink-2)">' + esc(d.desc) + '</div></div>';
    html += '<div class="cb-panel"><div class="cb-panel-head"><h5>成员</h5><span class="cb-link" data-act="toast:已按状态排序">按状态</span></div>' +
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
    if (s.type === 'board') return inspectorBoard(s.id);
    return inspectorEmployee(DB.byId.ceo);
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
        '<div class="cb-hero-copy"><div class="cb-hero-name"><span>CompBotOrg</span></div><small>v1.0 · ' + (aiReady() ? '模型已连接' : '演示构建') + '</small></div></div>' +
        '<div class="cb-hero-quote">「 让 AI 成为更强大的生产力 」</div></div>' +
        '<div class="cb-inspector-body"><section class="cb-section"><h4>数据规模</h4><div class="cb-info">' +
        infoRow('员工', DB.employees.length + '') + infoRow('部门', DB.departments.length + '') +
        infoRow('项目', DB.projects.length + '') + infoRow('任务', DB.tasks.length + '') + '</div></section>' +
        '<section class="cb-section"><h4>当前模式</h4><div style="font-size:10px;line-height:16px;color:var(--bt-ink-2)">' +
        (aiReady()
          ? '已连接 <b>' + esc(AI.model) + '</b>。CEO 与员工的回复由模型实时生成，请求会携带组织架构、项目进度与任务清单作为上下文。'
          : '演示模式：数据为本地示例，对话回复由规则生成，未连接模型。点上方横幅或到「设置 › 模型」填入 Key 即可切换到真实 AI。') +
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
      html += '<section class="cb-section"><h4>汇报关系</h4><div class="cb-graph">' +
        '<div class="cb-graph-root">CEO</div><div class="cb-graph-line"></div>' +
        '<div class="cb-graph-nodes">' + DB.employees.filter(function (x) { return x.dept === e.dept }).map(function (x) {
          return '<div class="cb-graph-node" data-act="open:emp:' + x.id + '"><strong>' + esc(x.name) + '</strong>' + avatar(x, 'cb-avatar-xs') + '</div>';
        }).join('') + '</div></div></section>';
      html += '<section class="cb-section"><h4>协作频次</h4>' + DB.employees.filter(function (x) { return x.id !== e.id }).slice(0, 3).map(function (x, i) {
        return '<div class="cb-relation"><span>' + esc(e.name) + '</span><b>' + ['每日', '每周', '按需'][i] + '</b><span>' + esc(x.name) + '</span></div>';
      }).join('') + '</section>';
    } else if (S.inspectorTab === 'task') {
      html += '<section class="cb-section"><div class="cb-section-head"><h4>当前任务 (' + tasks.length + ')</h4>' +
        '<span class="cb-link" data-act="modal:task">＋ 派任务</span></div><div class="cb-task-list">' +
        (tasks.length ? tasks.map(taskRow).join('') : '<div class="cb-empty">暂无任务</div>') + '</div></section>';
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
  function nav(view) {
    S.view = view;
    S.query = '';
    S.projectTab = 'overview';
    if (view === 'org') { S.subject = { type: 'employee', id: 'ceo' }; S.scrollMode = 'top' }
    if (view === 'projects') S.subject = { type: 'project', id: (DB.projects[0] || {}).id };
    if (view === 'tasks') S.subject = { type: 'board', id: 'tasks' };
    if (view === 'knowledge') S.subject = { type: 'board', id: 'docs' };
    if (view === 'settings') S.subject = { type: 'board', id: 'settings' };
    if (view === 'search') S.subject = { type: 'board', id: 'search' };
    S.inspectorTab = 'status';
    render();
    var box = $('[data-input=search]');
    if (box) box.value = '';
    var b = $('#center-body');
    if (b) b.scrollTop = 0;
  }

  function openEmp(id) {
    if (!DB.byId[id]) return;
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
    render();
    var row = document.querySelector('[data-task="' + id + '"]');
    if (row) { row.classList.add('is-highlight'); if (row.scrollIntoView) row.scrollIntoView({ block: 'center' }) }
    toast('定位到任务：' + t.name);
  }

  function send() {
    if (!isChat() || busyId === convId()) return;
    var input = $('#composer-wrap input'); if (!input) return;
    var text = input.value.trim(); if (!text) return;
    input.value = '';
    var empId = convId();
    var list = conv(empId);
    var m = { from: 'me', text: text, time: now() };
    list.push(m);
    var chat = $('#center-body');
    chat.insertAdjacentHTML('beforeend', msgHTML(m, list.length - 1));
    if (aiReady()) streamReply(empId, chat, list, text);
    else localReply(empId, chat, list, text);
  }

  function localReply(empId, chat, list, text) {
    chat.insertAdjacentHTML('beforeend', typingHTML());
    scrollChat();
    busyId = empId; S.busy = true;
    setTimeout(function () {
      busyId = null; S.busy = false;
      list.push({ from: empId, text: replyFor(empId, text), time: now() });
      renderCenter();
      scrollChat();
    }, 900);
  }

  function streamReply(empId, chat, list) {
    busyId = empId; S.busy = true;
    chat.insertAdjacentHTML('beforeend', streamingHTML(empId));
    var host = chat.querySelector('[data-stream]');
    var bubble = host ? host.querySelector('.pv-bubble') : null;
    var acc = '';
    var paint = function () {
      if (!bubble) return;
      if (acc) bubble.innerHTML = esc(acc).replace(/\n/g, '<br>') + '<span class="cb-caret"></span>';
    };
    scrollChat();
    aiStream(empId, function (full) { acc = full; paint(); scrollChat() }, function () {})
      .then(function (full) {
        var parsed = parseTasks(full || acc);
        var made = commitTasks(parsed.specs, empId);
        var msg = { from: empId, text: parsed.text || '（空回复）', time: now() };
        if (made.length) msg.tasks = made;
        list.push(msg);
        busyId = null; S.busy = false;
        AI.state = 'ok'; AI.err = '';
        render();
        scrollChat();
        if (made.length) toast('已自动创建 ' + made.length + ' 个任务，可在任务看板查看');
      })
      .catch(function (e) {
        busyId = null; S.busy = false;
        var why = aiExplain(e);
        AI.state = 'bad'; AI.err = why;
        list.push({ from: empId, text: '模型调用失败：' + why + '\n请到「设置 › 模型」检查接口地址、Key 与模型名。', time: now(), err: true });
        render();
        scrollChat();
        toast('模型调用失败：' + why);
      });
  }

  function replyFor(id, text) {
    var e = DB.byId[id] || DB.byId.ceo;
    if (/进度|怎么样|如何/.test(text)) {
      var mine = DB.empTasks(id);
      if (mine.length) {
        var avg = Math.round(mine.reduce(function (a, t) { return a + t.pct }, 0) / mine.length);
        return '我手上的 ' + mine.length + ' 个任务平均进度 ' + avg + '%。' +
          mine.slice(0, 2).map(function (t) { return '「' + t.name + '」' + t.pct + '%' }).join('，') + '，其余按计划推进。';
      }
      if (id === 'ceo') return 'AI Organization v1 整体进度 42%，6 个任务里 1 个已完成、2 个进行中，没有阻塞。';
      return '我这边暂时没有在办任务，可以随时接新的。';
    }
    if (/谁负责|分配|分工/.test(text)) {
      return '分工：产品架构 Product AI，DSHBot 改造 DSHBot，组织关系网 Backend AI，界面 Design AI，Skill 系统 Platform AI，测试发布 QA AI。';
    }
    if (/风险|阻塞|问题/.test(text)) {
      var blocked = DB.tasks.filter(function (t) { return t.status === 'blocked' });
      if (blocked.length) return '有 ' + blocked.length + ' 个阻塞：' + blocked.map(function (t) { return '「' + t.name + '」(' + t.note + ')' }).join('；') + '。我建议先解这个。';
      return '目前没有阻塞项。风险是 UI 和 Skill 系统还没启动，我会优先调度。';
    }
    if (/谢谢|辛苦|好的|收到/.test(text)) return '不客气，有进展我第一时间同步。';
    if (/你好|在吗|hi|hello/i.test(text)) return '在。老板有什么安排？';
    var pool = [
      '收到，我把这条记到「' + (DB.projects[0].name) + '」的任务流里，稍后同步进展。',
      '明白。我先拆成两三个可执行步骤，完成后向你汇报。',
      '这件事我可以接，预计今天内给第一版结果。',
      '好的，需要我拉上 ' + (DB.employees.filter(function (x) { return x.dept === e.dept && x.id !== e.id })[0] || { name: '相关同事' }).name + ' 一起吗？'
    ];
    return pool[Math.floor(Math.random() * pool.length)];
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
    if (kind === 'task') {
      modal.innerHTML = '<h3>新建任务</h3><p>创建后会出现在任务看板与所属项目里。</p>' +
        '<div class="cb-field"><label>任务名称</label><input id="f-name" placeholder="例如：组织关系图交互"></div>' +
        '<div class="cb-field"><label>所属项目</label><select id="f-project">' +
        DB.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-field"><label>负责人</label><select id="f-owner">' +
        DB.employees.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + ' · ' + esc(e.dept) + '</option>' }).join('') + '</select></div>' +
        '<div class="cb-modal-foot"><button type="button" data-act="modal:close">取消</button>' +
        '<button type="button" class="primary" data-act="modal:create-task">创建</button></div>';
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
    var input = $('#f-name'); if (input) input.focus();
  }
  function closeModal() {
    var mask = $('#modal-mask');
    if (mask) mask.classList.remove('on');
  }
  function createTask() {
    var name = ($('#f-name') || {}).value || '';
    name = name.trim();
    if (!name) { toast('请填写任务名称'); return }
    var pid = ($('#f-project') || {}).value || 'p1';
    var owner = ($('#f-owner') || {}).value || 'ceo';
    DB.tasks.push({ id: uid('t'), name: name, project: pid, assignee: owner, status: 'pending', pct: 0, due: '待排期' });
    recalcProject(pid);
    closeModal();
    render();
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
  function recalcProject(pid) {
    var p = DB.projectById(pid); if (!p) return;
    var ts = DB.projectTasks(pid);
    p.pct = ts.length ? Math.round(ts.reduce(function (a, t) { return a + t.pct }, 0) / ts.length) : 0;
    if (p.pct >= 100) p.status = '已完成';
  }

  /* ================= events ================= */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var parts = t.getAttribute('data-act').split(':');
    var a = parts[0], b = parts[1], c = parts[2];
    if (a === 'nav') nav(b);
    else if (a === 'open' && b === 'emp') openEmp(c);
    else if (a === 'open' && b === 'project') openProject(c);
    else if (a === 'open' && b === 'dept') openDept(c);
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
    else if (a === 'send') send();
    else if (a === 'modal' && b === 'task') openModal('task');
    else if (a === 'modal' && b === 'project') openModal('project');
    else if (a === 'modal' && b === 'close') closeModal();
    else if (a === 'modal' && b === 'create-task') createTask();
    else if (a === 'modal' && b === 'create-project') createProject();
    else if (a === 'theme') { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(); toast(S.theme === 'dark' ? '已切换到深色模式' : '已切换到浅色模式') }
    else if (a === 'insp') { S.inspector = !S.inspector; render(); toast(S.inspector ? '已展开 Inspector' : '已收起 Inspector') }
    else if (a === 'settheme') { S.theme = b; render() }
    else if (a === 'density') { S.density = b; render() }
    else if (a === 'toggle' && b === 'insp') { S.inspector = !S.inspector; render() }
    else if (a === 'toggle' && b === 'notify') { S.notify = !S.notify; render() }
    else if (a === 'toast') { toast(b || '演示版暂不支持') }
    else if (a === 'doc') { var d = null; DB.docs.forEach(function (x) { if (x.id === b) d = x }); if (d) toast('打开文档：' + d.title) }
    else if (a === 'copy') {
      var list = conv(convId()); var m = list[+b];
      if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).then(function () { toast('已复制') }, function () { toast('复制失败') });
      else toast('已复制');
    }
    else if (a === 'quote') { var q = conv(convId())[+b]; var inp = $('#composer-wrap input'); if (q && inp) { inp.value = '> ' + q.text.split('\n')[0] + '\n'; inp.focus() } }
    else if (a === 'retry') { var inp2 = $('#composer-wrap input'); var lm = conv(convId())[+b]; if (lm && inp2) { inp2.value = lm.text; send() } }
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
    else if (a === 'reset') { S.messages = {}; S.group = null; S.projectFilter = '全部'; S.docCat = '全部'; render(); toast('演示数据已重置') }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id && /^ai-(base|key|model|temp)$/.test(t.id)) { readAiForm(); return }
    if (t.getAttribute && t.getAttribute('data-input') === 'search') {
      S.query = t.value;
      if (S.view === 'search' || S.view === 'org') {
        if (S.query.trim() && S.view !== 'search') { S.view = 'search'; S.searchBack = true; S.subject = { type: 'board', id: 'search' } }
        if (!S.query.trim() && S.view === 'search') { S.view = 'org'; S.subject = { type: 'employee', id: 'ceo' } }
      }
      renderCenter(); renderInspector();
    }
  });

  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target.tagName || '').toLowerCase();
    if (ev.key === 'Enter' && ev.target.id && /^ai-(base|key|model|temp)$/.test(ev.target.id)) {
      ev.preventDefault(); aiSaveForm(); return;
    }
    if (ev.key === 'Enter' && ev.target.getAttribute && ev.target.getAttribute('data-input') === 'composer') {
      ev.preventDefault(); send(); return;
    }
    if (ev.key === '/' && tag !== 'input' && tag !== 'textarea') {
      ev.preventDefault(); var s = $('[data-input=search]'); if (s) s.focus();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault(); var s2 = $('[data-input=search]'); if (s2) s2.focus();
    }
    if (ev.key === 'Escape') {
      closeModal();
      if (S.query) { S.query = ''; if (S.view === 'search') S.view = 'org'; render(); }
    }
  });

  /* ================= boot ================= */
  function boot() {
    aiLoad();
    $('#left-search').innerHTML = searchBox('搜索员工、部门、项目…');
    render();
    document.body.setAttribute('data-ready', '1');
    setTimeout(function () {
      if (aiReady()) toast('模型已就绪 · ' + AI.model);
      else toast('演示模式 · 数据与回复均为本地示例');
    }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__cb = { DB: DB, S: S, AI: AI, render: render, openEmp: openEmp, openProject: openProject, send: send, aiTest: aiTest };
})();
