/**
 * Self-contained web console for the CompbotOrg product facade.
 *
 * The page is a single HTML string with inline CSS and vanilla JS: no CDN, no
 * build step, no external assets. It only talks to the JSON routes exposed by
 * `dispatch`, so it can be served from any host without changing the domain
 * layer.
 *
 * @module @compbotorg/api/web
 */

/** Human-readable labels for the numeric fields returned by `GET /stats`. */
export const WEB_CONSOLE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CompbotOrg · AI 组织操作系统</title>
<style>
  :root{
    --bg:#0b1017;--panel:#131b26;--panel2:#18222f;--line:#243244;
    --text:#e6edf5;--muted:#8a9bb0;--accent:#5eead4;--accent2:#7c9cff;
    --ok:#4ade80;--warn:#fbbf24;--bad:#f87171;
  }
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 15% -10%,#16303a 0%,var(--bg) 55%) no-repeat,var(--bg);
    color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  a{color:var(--accent2)}
  .wrap{max-width:1280px;margin:0 auto;padding:28px 22px 60px}
  header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-bottom:22px;border-bottom:1px solid var(--line)}
  .logo{width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,#5eead4,#3b82f6);
    display:grid;place-items:center;color:#07131a;font-weight:800;font-size:17px;letter-spacing:-1px}
  h1{font-size:21px;margin:0;letter-spacing:.3px}
  .sub{color:var(--muted);font-size:12.5px;margin-top:1px}
  .spacer{flex:1}
  .pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--panel);
    border-radius:999px;padding:6px 13px;font-size:12px;color:var(--muted)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 9px var(--ok)}
  .dot.off{background:var(--bad);box-shadow:0 0 9px var(--bad)}
  button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--line);
    background:var(--panel2);color:var(--text);padding:8px 14px;transition:.15s}
  button:hover{border-color:var(--accent);color:var(--accent)}
  button.primary{background:linear-gradient(135deg,#5eead4,#38bdf8);color:#06131a;border:0;font-weight:700}
  button.primary:hover{filter:brightness(1.1);color:#06131a}
  input,textarea{font:inherit;width:100%;background:#0e1620;border:1px solid var(--line);border-radius:8px;
    padding:9px 11px;color:var(--text);outline:none}
  input:focus,textarea:focus{border-color:var(--accent)}
  label{display:block;color:var(--muted);font-size:12px;margin:0 0 6px}
  .hero{margin:26px 0 20px}
  .hero h2{font-size:25px;margin:0 0 8px;font-weight:700;letter-spacing:.2px}
  .hero p{color:var(--muted);margin:0;max-width:760px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0}
  .kpi{background:linear-gradient(160deg,var(--panel2),var(--panel));border:1px solid var(--line);
    border-radius:12px;padding:14px 16px}
  .kpi b{display:block;font-size:25px;line-height:1.25;color:var(--accent);font-variant-numeric:tabular-nums}
  .kpi span{color:var(--muted);font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(228px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px 16px;min-width:0}
  .card h3{margin:0 0 10px;font-size:13px;letter-spacing:.6px;text-transform:uppercase;color:var(--accent2)}
  .kv{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12.5px;border-bottom:1px dashed rgba(255,255,255,.045)}
  .kv:last-child{border-bottom:0}
  .kv span{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kv b{font-variant-numeric:tabular-nums;font-weight:600}
  .cols{display:grid;grid-template-columns:1.05fr .95fr;gap:16px;margin-top:16px}
  @media(max-width:900px){.cols{grid-template-columns:1fr}}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
  .panel h3{margin:0 0 12px;font-size:14px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:var(--muted);font-weight:500;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
  td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top}
  tr:last-child td{border-bottom:0}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--muted);word-break:break-all}
  .tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;border:1px solid var(--line);background:var(--panel2)}
  .tag.ok{color:var(--ok);border-color:rgba(74,222,128,.35)}
  .tag.warn{color:var(--warn);border-color:rgba(251,191,36,.35)}
  .tag.bad{color:var(--bad);border-color:rgba(248,113,113,.35)}
  .field{margin-bottom:11px}
  .row{display:flex;gap:8px;align-items:center;margin-bottom:7px}
  .row input{flex:1}
  .hint{color:var(--muted);font-size:11.5px;margin-top:6px}
  .msg{margin-top:11px;padding:10px 12px;border-radius:8px;font-size:12.5px;display:none;word-break:break-word}
  .msg.show{display:block}
  .msg.ok{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:var(--ok)}
  .msg.bad{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:var(--bad)}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:22px 0 12px}
  .tabs button{padding:6px 12px;font-size:12.5px;color:var(--muted)}
  .tabs button.on{color:var(--accent);border-color:var(--accent);background:rgba(94,234,212,.07)}
  pre{background:#0c141d;border:1px solid var(--line);border-radius:10px;padding:14px;overflow:auto;
    max-height:420px;font-size:11.5px;line-height:1.55;color:#c8d6e5;margin:0}
  .timeline{display:grid;gap:6px;max-height:320px;overflow:auto}
  .ev{display:flex;gap:10px;align-items:baseline;padding:6px 9px;background:var(--panel2);border-radius:7px;font-size:12px}
  .ev i{font-style:normal;color:var(--accent2);min-width:88px;font-size:11px}
  .ev em{font-style:normal;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ev small{color:var(--muted);margin-left:auto;white-space:nowrap;font-size:11px}
  footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  .empty{color:var(--muted);font-size:12.5px;padding:12px 0}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">CO</div>
    <div><h1>CompbotOrg</h1><div class="sub">AI 组织操作系统 · v1.0 · 事件溯源 / 九条独立日志</div></div>
    <div class="spacer"></div>
    <div class="pill"><span class="dot" id="dot"></span><span id="health">连接中…</span></div>
    <button onclick="refreshAll()">刷新数据</button>
  </header>

  <div class="hero">
    <h2>一家会自己运转的 AI 公司</h2>
    <p>给一个目标，组织自动分解、派活、执行、产出 Artifact、走策略与审批，并把全过程写进事件日志。
       下面所有数字都来自当前运行中的真实实例，你可以在右侧直接下达新目标。</p>
  </div>

  <div class="kpis" id="kpis"></div>
  <div class="grid" id="cards"></div>

  <div class="cols">
    <div class="panel">
      <h3>组织架构 · 成员与汇报线</h3>
      <div id="members"><div class="empty">加载中…</div></div>
    </div>
    <div class="panel">
      <h3>目标运行器 · 给组织派一个活</h3>
      <div class="field"><label>目标标题</label><input id="goalTitle" placeholder="例如：完成 Q4 客户交付复盘"></div>
      <div class="field"><label>子任务（每行一个，可留空）</label>
        <textarea id="goalSubtasks" rows="3" placeholder="收集交付数据&#10;撰写复盘报告"></textarea></div>
      <button class="primary" id="runBtn" onclick="runGoal()">运行目标</button>
      <div class="hint">提交后会真实执行：分解 → 委派 → 模拟执行 → 产物 → 审批 → 落盘快照。</div>
      <div class="msg" id="msg"></div>
      <h3 style="margin-top:20px">已有目标</h3>
      <div id="goals"><div class="empty">加载中…</div></div>
    </div>
  </div>

  <div class="tabs" id="tabs"></div>
  <div class="panel"><h3 id="tabTitle">领域视图</h3><div id="tabBody"></div></div>

  <div class="cols" style="margin-top:16px">
    <div class="panel"><h3>事件日志 · 九条流</h3><div id="logs"></div></div>
    <div class="panel"><h3>最近事件</h3><div class="timeline" id="timeline"></div></div>
  </div>

  <footer>CompbotOrg v1.0 · 纯 TypeScript 事件溯源 · JSON 快照持久化 · HTTP/CLI 传输层可替换。
    页面不依赖任何外部资源，数据全部来自同源 REST 接口。</footer>
</div>

<script>
'use strict';
var LABELS={
  memberCount:'成员数',departmentCount:'部门数',activeMemberCount:'在职成员',leafCount:'叶子成员',depth:'汇报层级',
  taskCount:'任务总数',openTaskCount:'进行中',completedTaskCount:'已完成',blockedTaskCount:'已阻塞',
  reportCount:'报告数',pendingReportCount:'待审报告',pendingDecisionCount:'待决策',pendingApprovalCount:'待审批',escalationCount:'升级次数',
  executionCount:'执行总数',runningCount:'运行中',succeededCount:'成功',failedCount:'失败',successRate:'成功率',averageConfidence:'平均置信度',toolCallCount:'工具调用',
  artifactCount:'产物数',versionCount:'版本数',activeCount:'有效',archivedCount:'归档',sharedCount:'已共享',
  entryCount:'记忆条目',organizationCount:'组织级',botCount:'Bot 级',tagCount:'标签数',
  skillCount:'技能数',connectorCount:'连接器',installedCount:'安装数',enabledCount:'已启用',highRiskCount:'高风险',
  policyCount:'策略数',evaluationCount:'评估次数',approvalRequiredCount:'需审批',auditCount:'审计记录',deniedCount:'拒绝次数',
  listingCount:'上架数',publishedCount:'已发布',installCount:'安装数',ratingCount:'评分数',averageRating:'平均评分',
  goalCount:'目标数',inProgressCount:'进行中',completedCount:'已完成',subtaskCount:'子任务',linkedTaskCount:'关联任务',averageQuality:'平均质量',
  eventCount:'事件总数'
};
var GROUPS=[
  ['organization','组织'],['task','任务协议'],['runtime','执行运行时'],['artifact','产物'],['memory','三层记忆'],
  ['skill','技能'],['policy','策略与审计'],['registry','市场'],['goal','目标']
];
var TABS=[
  ['任务','/tasks'],['报告','/reports'],['产物','/artifacts'],['执行','/executions'],
  ['策略','/policies'],['审计','/audit'],['市场','/listings'],['技能','/skills'],['记忆','/memory'],['原始快照','/state']
];
var LOGS=[['organization','组织'],['task','任务'],['runtime','执行'],['artifact','产物'],['memory','记忆'],
  ['skill','技能'],['policy','策略'],['registry','市场'],['goal','目标']];
var activeTab=0;

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function label(k){return LABELS[k]||String(k).replace(/([A-Z])/g,' $1').replace(/^./,function(c){return c.toUpperCase();});}
function fmt(k,v){
  if(typeof v==='number'){
    if(/Rate|Confidence|Quality|Rating/.test(k)) return (v*100).toFixed(1)+'%';
    return v.toLocaleString('zh-CN');
  }
  if(typeof v==='boolean') return v?'是':'否';
  return esc(v);
}
function statusTag(v){
  var s=String(v==null?'':v).toLowerCase();
  var c=/complet|succeed|active|enabled|approv|published|ok/.test(s)?'ok':
        /block|fail|deni|reject|error|archiv/.test(s)?'bad':
        /pending|progress|running|waiting|in_/.test(s)?'warn':'';
  return '<span class="tag '+c+'">'+esc(v)+'</span>';
}
function get(p){return fetch(p,{headers:{'accept':'application/json'}}).then(function(r){
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();});}
function showMsg(text,ok){
  var el=document.getElementById('msg');
  el.className='msg show '+(ok?'ok':'bad');
  el.textContent=text;
}
function renderKpis(stats){
  var picks=[['成员','organization.memberCount'],['部门','organization.departmentCount'],
    ['任务','task.taskCount'],['目标','goal.goalCount'],['产物','artifact.artifactCount'],['事件总数',null]];
  var html='';
  picks.forEach(function(p){
    var v;
    if(p[1]===null) v=stats.eventCount;
    else {var parts=p[1].split('.');v=stats[parts[0]]&&stats[parts[0]][parts[1]];}
    html+='<div class="kpi"><b>'+(v==null?'—':Number(v).toLocaleString('zh-CN'))+'</b><span>'+esc(p[0])+'</span></div>';
  });
  document.getElementById('kpis').innerHTML=html;
}
function renderCards(stats){
  var html='';
  GROUPS.forEach(function(g){
    var obj=stats[g[0]]||{};
    var rows='';
    Object.keys(obj).forEach(function(k){
      if(typeof obj[k]==='object') return;
      rows+='<div class="kv"><span>'+esc(label(k))+'</span><b>'+fmt(k,obj[k])+'</b></div>';
    });
    html+='<div class="card"><h3>'+esc(g[1])+'</h3>'+(rows||'<div class="empty">暂无数据</div>')+'</div>';
  });
  document.getElementById('cards').innerHTML=html;
}
function renderMembers(list){
  if(!Array.isArray(list)||!list.length){document.getElementById('members').innerHTML='<div class="empty">暂无成员</div>';return;}
  var h='<table><thead><tr><th>成员</th><th>角色</th><th>部门</th><th>职级</th><th>状态</th></tr></thead><tbody>';
  list.forEach(function(m){
    h+='<tr><td><b>'+esc(m.displayName||m.botId)+'</b><div class="mono">'+esc(m.botId||'')+'</div></td>'+
      '<td>'+esc(m.roleId||'—')+'</td><td class="mono">'+esc(m.departmentId||'—')+'</td>'+
      '<td>'+esc(m.rank==null?'—':m.rank)+'</td><td>'+statusTag(m.status)+'</td></tr>';
  });
  document.getElementById('members').innerHTML=h+'</tbody></table>';
}
function renderGoals(list){
  if(!Array.isArray(list)||!list.length){document.getElementById('goals').innerHTML='<div class="empty">还没有目标，试着在上方运行一个。</div>';return;}
  var h='<table><thead><tr><th>目标</th><th>状态</th><th>子任务</th><th>关联任务</th></tr></thead><tbody>';
  list.slice().reverse().forEach(function(g){
    h+='<tr><td>'+esc(g.title)+'<div class="mono">'+esc(g.id)+'</div></td><td>'+statusTag(g.status)+'</td>'+
      '<td>'+(g.subtasks?g.subtasks.length:0)+'</td><td>'+(g.taskIds?g.taskIds.length:0)+'</td></tr>';
  });
  document.getElementById('goals').innerHTML=h+'</tbody></table>';
}
function renderLogs(snapshot){
  var logs=(snapshot&&snapshot.logs)||{};
  var h='<table><thead><tr><th>事件流</th><th>事件数</th></tr></thead><tbody>',total=0,all=[];
  LOGS.forEach(function(l){
    var arr=Array.isArray(logs[l[0]])?logs[l[0]]:[];
    total+=arr.length;
    h+='<tr><td>'+esc(l[1])+' <span class="mono">'+esc(l[0])+'</span></td><td><b>'+arr.length+'</b></td></tr>';
    arr.forEach(function(e){all.push({stream:l[1],e:e});});
  });
  h+='<tr><td><b>合计</b></td><td><b style="color:var(--accent)">'+total+'</b></td></tr></tbody></table>';
  document.getElementById('logs').innerHTML=h;
  var recent=all.slice(-14).reverse();
  document.getElementById('timeline').innerHTML=recent.length?recent.map(function(x){
    var e=x.e||{},type=e.type||e.kind||e.eventType||'(event)';
    var detail=e.title||e.id||e.goalId||e.taskId||e.reason||e.decision||'';
    var when=e.occurredAt||e.at||e.timestamp||e.createdAt||'';
    return '<div class="ev"><i>'+esc(x.stream)+'</i><em>'+esc(type)+(detail?' · '+esc(detail):'')+'</em><small>'+esc(String(when).slice(0,19).replace('T',' '))+'</small></div>';
  }).join(''):'<div class="empty">暂无事件</div>';
}
function pickCols(rows){
  var keys=[],seen={};
  (rows||[]).slice(0,20).forEach(function(r){
    if(!r||typeof r!=='object') return;
    Object.keys(r).forEach(function(k){
      if(seen[k]||keys.length>=6) return;
      var v=r[k];
      if(v==null||typeof v!=='object') {seen[k]=1;keys.push(k);}
    });
  });
  return keys.length?keys:['id','title','status'];
}
function renderTab(data,url){
  var body=document.getElementById('tabBody');
  if(url==='/state'){body.innerHTML='<pre>'+esc(JSON.stringify(data,null,2))+'</pre>';return;}
  if(url==='/memory'){body.innerHTML='<pre>'+esc(data.markdown||'(空)')+'</pre>';return;}
  if(!Array.isArray(data)||!data.length){body.innerHTML='<div class="empty">暂无记录</div>';return;}
  var keys=pickCols(data);
  var h='<table><thead><tr>'+keys.map(function(k){return '<th>'+esc(label(k))+'</th>';}).join('')+'</tr></thead><tbody>';
  data.slice(0,60).forEach(function(r){
    h+='<tr>'+keys.map(function(k){
      var v=r&&r[k];
      if(/status|state|decision|kind|priority|outcome|layer/.test(k)&&typeof v==='string') return '<td>'+statusTag(v)+'</td>';
      if(typeof v==='object'&&v!==null) v=JSON.stringify(v);
      if(v==null) v='—';
      var s=String(v);
      return '<td'+(s.length>28?' class="mono"':'')+'>'+esc(s.length>90?s.slice(0,90)+'…':s)+'</td>';
    }).join('')+'</tr>';
  });
  body.innerHTML=h+'</tbody></table><div class="hint">共 '+data.length+' 条，最多展示 60 条。</div>';
}
function loadTab(){
  var t=TABS[activeTab];
  document.getElementById('tabTitle').textContent=t[0]+' · '+t[1];
  document.getElementById('tabBody').innerHTML='<div class="empty">加载中…</div>';
  get(t[1]).then(function(d){renderTab(d,t[1]);}).catch(function(e){
    document.getElementById('tabBody').innerHTML='<div class="empty">加载失败：'+esc(e.message)+'</div>';});
}
function buildTabs(){
  document.getElementById('tabs').innerHTML=TABS.map(function(t,i){
    return '<button class="'+(i===activeTab?'on':'')+'" onclick="setTab('+i+')">'+esc(t[0])+'</button>';
  }).join('');
}
function setTab(i){activeTab=i;buildTabs();loadTab();}
function refreshAll(){
  get('/health').then(function(){
    document.getElementById('dot').className='dot';
    document.getElementById('health').textContent='服务在线 · v1.0';
  }).catch(function(e){
    document.getElementById('dot').className='dot off';
    document.getElementById('health').textContent='服务不可用：'+e.message;
  });
  get('/stats').then(function(s){renderKpis(s);renderCards(s);}).catch(function(e){showMsg('统计加载失败：'+e.message,false);});
  get('/organization/members').then(renderMembers).catch(function(){});
  get('/goals').then(renderGoals).catch(function(){});
  get('/state').then(renderLogs).catch(function(){});
  loadTab();
}
function runGoal(){
  var btn=document.getElementById('runBtn');
  var title=document.getElementById('goalTitle').value.trim();
  if(!title){showMsg('请填写目标标题。',false);return;}
  var lines=document.getElementById('goalSubtasks').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean);
  btn.disabled=true;btn.textContent='运行中…';
  showMsg('组织正在分解并执行目标…',true);
  fetch('/goals',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({title:title,subtasks:lines.map(function(t){return {title:t};})})})
  .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
  .then(function(res){
    btn.disabled=false;btn.textContent='运行目标';
    if(!res.ok){showMsg('执行失败：'+esc(res.d.error||'')+' '+(res.d.message?esc(res.d.message):''),false);return;}
    var d=res.d;
    var n=d.tasks?d.tasks.length:0,a=d.artifacts?d.artifacts.length:0;
    showMsg('目标已完成：生成 '+n+' 个任务、'+a+' 个产物，事件已落盘。',true);
    document.getElementById('goalTitle').value='';
    document.getElementById('goalSubtasks').value='';
    refreshAll();
  }).catch(function(e){btn.disabled=false;btn.textContent='运行目标';showMsg('请求失败：'+e.message,false);});
}
buildTabs();
refreshAll();
</script>
</body>
</html>
`
