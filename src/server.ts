import { randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { basename, join, resolve, sep } from "node:path";
import {
  applyDispatch,
  applyIntake,
  detectRepo,
  mutateUnits,
  orchestrate,
  resolveRepo,
  skillForFile,
} from "./commands.js";
import {
  type Attachment,
  CTX_DIR,
  ENGINES,
  type Engine,
  type WorkflowState,
  c,
  cwd,
  readState,
  writeState,
} from "./core.js";
import { type EngineReadiness, type PreflightOpts, anyReady, preflightAll } from "./preflight.js";
import { scanRepo } from "./scanner.js";
import { type VibeSettings, readSettings, writeSettings } from "./settings.js";
import { discoverSkills } from "./skills/registry.js";
import { resolveSkillNeeds } from "./skills/resolver.js";
import { TOOLS, TOOL_ORDER } from "./tools/index.js";

// UI: dark-tech operator dashboard. Design read → VARIANCE 5 / MOTION 5 / DENSITY 6.
// Native CSS (no framework); GSAP core enhances entrances and the resource meter only.
// Content renders fully without JS — GSAP is progressive, gated on prefers-reduced-motion.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="csrf" content="__CSRF__" />
<title>VibeFlow — orchestration</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0a0c10; --panel: #11141b; --panel-2: #0e1117; --line: #1c2230;
    --ink: #c9d3e0; --muted: #6b7689; --accent: #7ee787;
    --pass: #57d364; --fail: #f78166; --run: #58a6ff; --pend: #475061; --warn: #e3b341;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    --sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background:
      radial-gradient(900px 500px at 85% -10%, #11161f 0%, transparent 60%),
      var(--bg);
    color: var(--ink); font: 14px/1.55 var(--sans); -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  header {
    display: flex; align-items: center; gap: 14px;
    padding: 18px 28px; border-bottom: 1px solid var(--line);
    position: sticky; top: 0; backdrop-filter: blur(8px);
    background: color-mix(in oklab, var(--bg) 80%, transparent);
  }
  .logo { font-size: 20px; }
  h1 { font: 600 16px/1 var(--sans); margin: 0; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font: 12px/1 var(--mono); letter-spacing: 0.02em; }
  .live { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--muted); font: 11px/1 var(--mono); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 var(--accent); }
  main { padding: 28px; max-width: 1180px; margin: 0 auto; display: grid; gap: 22px; }
  .meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .tile {
    border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px;
    background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
  }
  .tile .k { color: var(--muted); font: 11px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.08em; }
  .tile .v { margin-top: 8px; font: 600 26px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .tile.accent .v { color: var(--accent); }
  .section-label { color: var(--muted); font: 11px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.1em; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-top: 10px; }
  .card {
    border: 1px solid var(--line); border-radius: 12px; padding: 16px; background: var(--panel);
    display: grid; gap: 10px; will-change: transform;
  }
  .card .top { display: flex; align-items: center; gap: 8px; }
  .card h3 { margin: 0; font: 600 14px/1.2 var(--mono); letter-spacing: -0.01em; }
  .pill { margin-left: auto; font: 10px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted); border: 1px solid var(--line); padding: 3px 8px; border-radius: 999px; }
  .pill.done { color: var(--pass); border-color: color-mix(in oklab, var(--pass) 40%, var(--line)); }
  .pill.running, .pill.verifying { color: var(--run); border-color: color-mix(in oklab, var(--run) 40%, var(--line)); }
  .pill.blocked { color: var(--fail); border-color: color-mix(in oklab, var(--fail) 40%, var(--line)); }
  .gates { display: flex; gap: 6px; flex-wrap: wrap; }
  .gate { font: 10px/1 var(--mono); padding: 4px 8px; border-radius: 7px; border: 1px solid var(--line); color: var(--pend); }
  .gate.pass { color: var(--pass); border-color: color-mix(in oklab, var(--pass) 35%, var(--line)); }
  .gate.fail { color: var(--fail); border-color: color-mix(in oklab, var(--fail) 35%, var(--line)); }
  .gate.running { color: var(--run); border-color: color-mix(in oklab, var(--run) 35%, var(--line)); }
  .res { color: var(--muted); font: 12px/1.4 var(--mono); font-variant-numeric: tabular-nums; }
  .res b { color: var(--ink); font-weight: 600; }
  .empty { color: var(--muted); font: 13px/1.6 var(--mono); border: 1px dashed var(--line); border-radius: 12px; padding: 22px; text-align: center; }
  .empty code { color: var(--accent); }
  details.intake { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 0 18px; }
  details.intake > summary { list-style: none; cursor: pointer; padding: 16px 0; display: flex; align-items: center; gap: 10px;
    color: var(--muted); font: 11px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.1em; }
  details.intake > summary::-webkit-details-marker { display: none; }
  details.intake > summary::before { content: "+"; color: var(--accent); font-weight: 700; }
  details.intake[open] > summary::before { content: "–"; }
  .form { display: grid; gap: 14px; padding: 4px 0 20px; }
  .form label { display: grid; gap: 6px; color: var(--muted); font: 11px/1.2 var(--mono); text-transform: uppercase; letter-spacing: 0.06em; }
  .form input, .form textarea, .form select {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; color: var(--ink);
    font: 13px/1.5 var(--sans); padding: 9px 11px; width: 100%; resize: vertical;
  }
  .form input:focus, .form textarea:focus, .form select:focus { outline: none; border-color: color-mix(in oklab, var(--accent) 50%, var(--line)); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  fieldset.engines { border: 1px solid var(--line); border-radius: 8px; display: flex; gap: 16px; flex-wrap: wrap; padding: 10px 12px; }
  fieldset.engines legend { color: var(--muted); font: 11px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.06em; padding: 0 4px; }
  .chk { display: flex !important; flex-direction: row; align-items: center; gap: 6px; text-transform: none !important; letter-spacing: 0 !important; color: var(--ink) !important; font-family: var(--mono) !important; }
  .chk input { width: auto; }
  .actions, .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .btn { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); border-radius: 8px;
    font: 600 12px/1 var(--mono); padding: 10px 16px; cursor: pointer; letter-spacing: 0.02em; }
  .btn:hover { border-color: color-mix(in oklab, var(--accent) 45%, var(--line)); }
  .btn.primary { background: color-mix(in oklab, var(--accent) 16%, var(--panel-2)); color: var(--accent); border-color: color-mix(in oklab, var(--accent) 45%, var(--line)); }
  .hint { color: var(--muted); font: 11px/1.4 var(--mono); }
  .attachments { display: grid; gap: 6px; }
  .att { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--panel-2); font: 12px/1.3 var(--mono); }
  .att .nm { color: var(--ink); }
  .att .sk { color: var(--accent); }
  .att .sz { color: var(--muted); margin-left: auto; }
  .att .del { cursor: pointer; color: var(--fail); border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; background: none; font: 11px/1 var(--mono); }
  .card .ctl { display: flex; gap: 6px; margin-top: 2px; }
  .card .ctl button, .card .ctl select { font: 10px/1 var(--mono); padding: 4px 7px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); cursor: pointer; }
  .card .ctl .del { color: var(--fail); }
  .out { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 12px; color: var(--ink);
    font: 11px/1.5 var(--mono); white-space: pre-wrap; max-height: 240px; overflow: auto; margin-top: 10px; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .rise { animation: rise 0.45s cubic-bezier(0.22,0.61,0.36,1) both; }
  @media (prefers-reduced-motion: reduce) { .rise { animation: none; } }
  @media (max-width: 760px) { .meter { grid-template-columns: repeat(2,1fr); } .grid2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <span class="logo">🐙</span>
  <h1>VibeFlow</h1>
  <span class="sub">orchestration</span>
  <span class="live"><span class="dot" id="dot"></span> live</span>
</header>
<main>
  <div id="triage" hidden></div>
  <details class="intake" id="intake" open>
    <summary>new workflow — initialize here</summary>
    <form class="form" id="intakeForm">
      <label>Repository path
        <div class="row">
          <input name="repoPath" id="repoPath" list="recentRepos" placeholder="/path/to/your/repo (defaults to current dir)" style="flex:1" />
          <button type="button" class="btn" id="detectBtn">Detect</button>
          <span class="hint" id="detectHint"></span>
        </div>
        <datalist id="recentRepos"></datalist>
      </label>
      <label>Goal / task
        <textarea name="goal" rows="2" placeholder="What should the agents accomplish?"></textarea>
      </label>
      <fieldset class="engines">
        <legend>Engines <span class="hint" id="engHint"></span></legend>
        <label class="chk"><input type="checkbox" name="engine" value="claude" id="eng-claude" checked /> Claude Code</label>
        <label class="chk"><input type="checkbox" name="engine" value="codex" id="eng-codex" checked /> Codex</label>
        <label class="chk"><input type="checkbox" name="engine" value="copilot" id="eng-copilot" checked /> Copilot CLI</label>
      </fieldset>
      <div class="row">
        <button type="button" class="btn" id="checkEnginesBtn">Check engines</button>
        <span class="hint" id="engineStatusHint">Probe runs locally — readiness gates Generate.</span>
      </div>
      <div id="engineStatus" class="attachments" aria-live="polite"></div>
      <div class="grid2">
        <label>Project docs source<input name="docSource" list="docSources" placeholder="GitHub / Drive / Notion / local path" /></label>
        <label>Task / issue source<input name="taskSource" list="taskSources" placeholder="Jira / Linear / GitHub Issues" /></label>
        <label>File types<input name="fileTypes" list="fileTypeOpts" placeholder="md, docx, xlsx, pdf" /></label>
        <label>Sample / reference<input name="sample" placeholder="link or path to a template" /></label>
      </div>
      <datalist id="docSources"><option value="GitHub"><option value="GitLab"><option value="Google Drive"><option value="Confluence"><option value="Notion"><option value="Local folder"><option value="S3"></datalist>
      <datalist id="taskSources"><option value="Jira"><option value="Linear"><option value="GitHub Issues"><option value="Trello"><option value="Asana"><option value="Slack"></datalist>
      <datalist id="fileTypeOpts"><option value="md"><option value="docx"><option value="xlsx"><option value="pptx"><option value="pdf"><option value="csv"><option value="json"><option value="png"></datalist>
      <label>Sample files (attach any number — AI picks a reader skill per file)
        <input type="file" id="attachInput" multiple />
      </label>
      <div id="attachList" class="attachments"></div>
      <label>Expected result (Definition of Done)
        <textarea name="expectedResult" rows="2" placeholder="How will we know it is done?"></textarea>
      </label>
      <div class="actions">
        <button type="submit" class="btn primary" id="intakeSubmit">Generate workflow</button>
        <span class="hint" id="intakeHint"></span>
      </div>
    </form>
  </details>
  <section class="meter" id="meter" hidden></section>
  <section id="dispatchSec" hidden>
    <div class="section-label">dispatch</div>
    <div class="row" style="margin-top:10px">
      <select id="dispatchEngine">
        <option value="claude">claude</option>
        <option value="codex">codex</option>
        <option value="copilot">copilot</option>
      </select>
      <button class="btn" id="dispatchBtn">Write dispatch prompt</button>
      <button class="btn primary" id="orchestrateBtn">Orchestrate (dry)</button>
      <span class="hint" id="dispatchHint"></span>
    </div>
    <pre class="out" id="dispatchOut" hidden></pre>
  </section>
  <section id="unitsSec" hidden>
    <div class="section-label">work units <span class="hint">— add / edit / delete</span></div>
    <div class="board" id="board"></div>
    <form class="row" id="unitForm" style="margin-top:12px">
      <input id="unitName" placeholder="new unit name" />
      <select id="unitStatus">
        <option value="pending">pending</option>
        <option value="running">running</option>
        <option value="verifying">verifying</option>
        <option value="done">done</option>
        <option value="blocked">blocked</option>
      </select>
      <input id="unitConf" type="number" step="0.05" min="0" max="1" value="0" style="width:90px" title="confidence" />
      <input id="unitScope" placeholder="scope (a.ts,b.ts)" style="flex:1" title="comma-separated file scope" />
      <input id="unitSpec" placeholder="spec — what to build (injected into the dispatch prompt)" style="flex:2" title="build spec" />
      <button class="btn" type="submit">+ add unit</button>
      <span class="hint" id="unitHint"></span>
    </form>
  </section>
  <section id="skillsSec" hidden>
    <div class="section-label">skills <span class="hint">— discovered locally · needs resolved on demand</span></div>
    <div id="skillsBox" class="attachments" style="margin-top:10px"></div>
    <div id="needsBox" class="attachments" style="margin-top:8px"></div>
  </section>
  <details class="intake" id="optionsSec">
    <summary>optional tools — code navigation</summary>
    <div class="form" id="toolOptions">
      <p class="hint">Opt-in MCP tools give agents better code navigation. Toggling saves to
        <code>.viteflow/SETTINGS.json</code>. Installing system software is high-risk, so the
        UI only saves the toggle and shows the exact terminal command to run — it never installs
        for you.</p>
      <div class="hint">priority: <span id="toolPriority">codegraph &gt; lsp &gt; native</span></div>
      <div id="toolList" class="attachments"></div>
      <span class="hint" id="optionsHint"></span>
    </div>
  </details>
  <section id="discoverSec">
    <div class="section-label">discovery <span class="hint">— Context7 docs / skills (network requires approval)</span></div>
    <form class="row" id="discoverForm" style="margin-top:10px">
      <select id="discoverKind"><option value="docs">docs</option><option value="skills">skills</option></select>
      <input id="discoverQuery" placeholder="library or capability, e.g. next.js" style="flex:1" />
      <label class="chk"><input type="checkbox" id="discoverApprove" /> approve network</label>
      <button class="btn" type="submit">Search</button>
      <span class="hint" id="discoverHint"></span>
    </form>
    <pre class="out" id="discoverOut" hidden></pre>
  </section>
</main>
<script>
(function(){
  var GATES = ['build','lint','test','review'];
  var prev = {}, firstPaint = true;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CSRF = (document.querySelector('meta[name="csrf"]')||{}).content || '';

  function esc(s){ return String(s).replace(/[&<>]/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m];}); }

  function tile(k, v, accent){
    return '<div class="tile'+(accent?' accent':'')+'"><div class="k">'+k+'</div>'
      + '<div class="v" data-num="'+v.num+'" data-prefix="'+(v.prefix||'')+'" data-suffix="'+(v.suffix||'')+'">'
      + (v.prefix||'')+v.text+(v.suffix||'')+'</div></div>';
  }
  function card(u){
    var g = u.gates || {}, r = u.resources || {};
    var statusOpts = ['pending','running','verifying','done','blocked'].map(function(s){
      return '<option value="'+s+'"'+(s===u.status?' selected':'')+'>'+s+'</option>';
    }).join('');
    return '<div class="card" data-name="'+esc(u.name)+'">'
      + '<div class="top"><h3>'+esc(u.name)+'</h3><span class="pill '+esc(u.status)+'">'+esc(u.status)+'</span></div>'
      + '<div class="gates">'+GATES.map(function(k){var st=g[k]||'pending';return '<span class="gate '+st+'">'+k+'</span>';}).join('')+'</div>'
      + '<div class="res">conf <b>'+(u.confidence)+'</b> · <b>'+(r.tokens||0)+'</b> tok · <b>$'+(r.cost_usd||0)+'</b> · <b>'+(r.wall_seconds||0)+'</b>s</div>'
      + ((u.evidence&&u.evidence.length)?'<div class="res">evidence: '+u.evidence.map(function(e){return '<b>'+esc(e)+'</b>';}).join(' · ')+'</div>':'')
      + ((u.scope&&u.scope.length)?'<div class="res">scope: '+u.scope.map(function(p){return '<b>'+esc(p)+'</b>';}).join(' · ')+'</div>':'')
      + (u.spec?'<div class="res">spec: '+esc(u.spec)+'</div>':'')
      + '<div class="ctl"><select class="u-status" title="status">'+statusOpts+'</select>'
      + '<button type="button" class="u-conf" title="edit confidence">conf</button>'
      + '<button type="button" class="del u-del">delete</button></div>'
      + '</div>';
  }

  // Inline count-up — small rAF tween, no external library.
  function countUp(el){
    var target = parseFloat(el.getAttribute('data-num')) || 0;
    var pre = el.getAttribute('data-prefix')||'', suf = el.getAttribute('data-suffix')||'';
    var decimals = (String(target).split('.')[1]||'').length;
    function show(v){ el.textContent = pre + (decimals ? v.toFixed(decimals) : Math.round(v)) + suf; }
    if (reduce){ show(target); return; }
    var start = 0, t0 = 0;
    function step(ts){ if(!t0)t0=ts; var p=Math.min((ts-t0)/700,1); show(start + (target-start)*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  function render(s){
    var meter = document.getElementById('meter');
    var board = document.getElementById('board');
    var dispatchSec = document.getElementById('dispatchSec');
    var unitsSec = document.getElementById('unitsSec');
    if (!s){
      meter.hidden = true; dispatchSec.hidden = true; unitsSec.hidden = true;
      return;
    }
    dispatchSec.hidden = false; unitsSec.hidden = false;
    var t = s.totals || {};
    meter.hidden = false;
    meter.innerHTML =
        tile('units', { num: t.units||0, text: (t.done||0)+'/'+(t.units||0) }, true)
      + tile('tokens', { num: t.tokens||0, text: (t.tokens||0) })
      + tile('est. cost', { num: t.cost_usd||0, text: (t.cost_usd||0), prefix: '$' })
      + tile('elapsed', { num: t.wall_seconds||0, text: (t.wall_seconds||0), suffix: 's' });
    Array.prototype.forEach.call(meter.querySelectorAll('.v'), countUp);

    if (Array.isArray(s.attachments)) renderAttachments(s.attachments);

    var units = s.work_units || [];
    renderTriage(units);
    if (!units.length){
      board.innerHTML = '<p class="empty">Goal set: <b>'+esc(s.goal||'')+'</b>. No work units yet — add one below.</p>';
      prev = {}; firstPaint = false; return;
    }
    board.innerHTML = units.map(card).join('');
    if (!reduce){
      var cards = board.querySelectorAll('.card');
      if (firstPaint){ Array.prototype.forEach.call(cards, function(el,i){ el.classList.add('rise'); el.style.animationDelay = (i*0.05)+'s'; }); }
      else { units.forEach(function(u){ if (JSON.stringify(u) !== prev[u.name]){ var el = board.querySelector('.card[data-name="'+(window.CSS&&CSS.escape?CSS.escape(u.name):u.name)+'"]'); if (el){ el.classList.remove('rise'); void el.offsetWidth; el.classList.add('rise'); } } }); }
    }
    prev = {}; units.forEach(function(u){ prev[u.name] = JSON.stringify(u); });
    firstPaint = false;
  }

  function renderAttachments(items){
    var box = document.getElementById('attachList');
    if (!items || !items.length){ box.innerHTML = ''; return; }
    box.innerHTML = items.map(function(a){
      var kb = a.size>1024 ? Math.round(a.size/1024)+' KB' : (a.size||0)+' B';
      return '<div class="att" data-name="'+esc(a.name)+'"><span class="nm">'+esc(a.name)+'</span>'
        + '<span class="sk">→ '+esc(a.skill)+'</span><span class="sz">'+kb+'</span>'
        + '<button type="button" class="del a-del">remove</button></div>';
    }).join('');
  }

  function renderTriage(units){
    var box = document.getElementById('triage');
    if (!box) return;
    var TRIAGE = { blocked: 1 };
    var flagged = (units||[]).filter(function(u){ return TRIAGE[u.status]; });
    if (!flagged.length){ box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.className = 'empty';
    box.style.borderColor = 'var(--fail)';
    box.style.color = 'var(--fail)';
    box.innerHTML = '⚠ triage: '+flagged.map(function(u){ return esc(u.name)+' ('+esc(u.status)+')'; }).join(' · ')
      + ' — resolve before closing the goal.';
  }

  function renderSkills(j){
    var sb = document.getElementById('skillsBox');
    var nb = document.getElementById('needsBox');
    var sec = document.getElementById('skillsSec');
    var skills = (j&&j.skills)||[], needs = (j&&j.needs)||[];
    if (!skills.length && !needs.length){ if(sec) sec.hidden = true; return; }
    if (sec) sec.hidden = false;
    sb.innerHTML = skills.map(function(s){
      return '<div class="att"><span class="nm">'+esc(s.name)+'</span><span class="sk">'+esc(s.status)+'</span>'
        + '<span class="sz">'+esc((s.capabilities||[]).join(', '))+'</span></div>';
    }).join('') || '<div class="hint">no local skills — needs are resolved on demand below</div>';
    nb.innerHTML = needs.map(function(n){
      var ok = n.status==='satisfied';
      return '<div class="att"><span class="nm">'+(ok?'✓ ':'• ')+esc(n.need)+'</span>'
        + '<span class="sk">'+esc(n.reason)+'</span>'
        + '<span class="sz">'+(ok?('by '+esc(n.satisfiedBy||'')):esc(n.acquire||'missing'))+'</span></div>';
    }).join('');
  }

  function loadSkills(){
    fetch('/api/skills').then(function(r){return r.json();}).then(renderSkills).catch(function(){});
  }

  function post(path, body){
    return fetch(path, { method:'POST', headers:{'content-type':'application/json','x-vibeflow-token':CSRF}, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }, function(){ return { ok:false, j:{} }; }); });
  }
  function send(method, path, body, isJson){
    var headers = { 'x-vibeflow-token': CSRF };
    if (isJson) headers['content-type'] = 'application/json';
    return fetch(path, { method: method, headers: headers, body: body })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }, function(){ return { ok:false, j:{} }; }); });
  }

  function loadAttachments(){
    fetch('/api/attachments').then(function(r){return r.json();}).then(function(j){ renderAttachments(j.attachments||[]); }).catch(function(){});
  }

  function setEngines(map){
    ['claude','codex','copilot'].forEach(function(e){
      var cb = document.getElementById('eng-'+e);
      if (cb && map && typeof map[e] === 'boolean') cb.checked = map[e];
    });
  }

  // Readiness gate: the web reflection of the CLI's hard preflight gate. The browser /api/init
  // path runs with useAi:false (auto-exempt server-side), so the UI is the gate on the web side.
  var READY_GLYPH = { ready: '✓', 'no-auth': '•' };
  function readyGlyph(level){ return READY_GLYPH[level] || '✗'; }
  function checkedEngines(){
    return ['claude','codex','copilot'].filter(function(e){
      var cb = document.getElementById('eng-'+e); return cb && cb.checked;
    });
  }
  function renderReadiness(list){
    var box = document.getElementById('engineStatus');
    if (!box) return;
    box.innerHTML = (list||[]).map(function(r){
      return '<div class="att"><span class="nm">'+readyGlyph(r.level)+' '+esc(r.engine)+'</span>'
        + '<span class="sk">'+esc(r.level)+'</span>'
        + '<span class="sz">'+esc(r.detail)+'</span></div>';
    }).join('');
  }
  // Progressive enhancement: the submit starts enabled (no-JS baseline), JS disables it
  // until at least one engine probes ready.
  function gateSubmit(anyReady){
    var btn = document.getElementById('intakeSubmit');
    if (!btn) return;
    btn.disabled = !anyReady;
    btn.title = anyReady ? '' : 'No engine is ready — check engines and fix the hints first.';
  }
  function checkEngines(){
    var hint = document.getElementById('engineStatusHint');
    var engines = checkedEngines();
    if (!engines.length){ if (hint) hint.textContent = 'Select at least one engine.'; return; }
    if (hint) hint.textContent = 'Checking… (probing engines locally, may take a few seconds)';
    post('/api/preflight', { engines: engines, probe: true }).then(function(res){
      if (!res.ok){ if (hint) hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed'); return; }
      renderReadiness(res.j.readiness||[]);
      gateSubmit(!!res.j.anyReady);
      if (hint) hint.textContent = res.j.anyReady
        ? 'Ready — Generate enabled.'
        : 'No engine ready — fix the hints above, then re-check.';
    });
  }

  function renderTools(view){
    var list = document.getElementById('toolList');
    if (!list) return;
    var settings = (view&&view.settings)||{ tools:{} };
    var tools = (view&&view.tools)||[];
    var prio = document.getElementById('toolPriority');
    if (prio && settings.toolPriority) prio.textContent = settings.toolPriority.join(' > ');
    list.innerHTML = tools.map(function(t){
      var on = !!(settings.tools && settings.tools[t.name]);
      return '<div class="att" data-tool="'+esc(t.name)+'" style="flex-wrap:wrap">'
        + '<label class="chk"><input type="checkbox" class="tool-toggle"'+(on?' checked':'')
        + ' data-tool="'+esc(t.name)+'" /> '+esc(t.title)+'</label>'
        + '<span class="sk">'+(t.installed?'installed':'not installed')+'</span>'
        + '<span class="sz">'+esc(t.description)+'</span>'
        + (t.installed?'':'<div class="hint" style="flex-basis:100%">install: <code>'
            + esc(t.command)+'</code></div>')
        + '</div>';
    }).join('');
  }
  function loadSettings(){
    fetch('/api/settings').then(function(r){return r.json();}).then(renderTools).catch(function(){});
  }
  function toggleTool(name, on){
    var hint = document.getElementById('optionsHint');
    if (hint) hint.textContent = 'Saving…';
    var body = { tools: {} }; body.tools[name] = on;
    post('/api/settings', body).then(function(res){
      if (res.ok){ renderTools(res.j); if (hint) hint.textContent = 'Saved to SETTINGS.json — re-run vf init to apply.'; }
      else if (hint) hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed');
    });
  }

  function wire(){
    var form = document.getElementById('intakeForm');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var body = {
        repoPath: fd.get('repoPath'),
        goal: fd.get('goal'),
        engines: fd.getAll('engine'),
        docSource: fd.get('docSource'),
        taskSource: fd.get('taskSource'),
        fileTypes: String(fd.get('fileTypes')||'').split(',').map(function(x){return x.trim();}).filter(Boolean),
        expectedResult: fd.get('expectedResult'),
        sample: fd.get('sample')
      };
      var hint = document.getElementById('intakeHint');
      hint.textContent = 'Generating…';
      post('/api/init', body).then(function(res){
        if (res.ok){ hint.textContent = 'Generated '+(res.j.files||[]).length+' files.'; render(res.j.state); loadAttachments(); document.getElementById('intake').open = false; }
        else hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed');
      });
    });

    document.getElementById('detectBtn').addEventListener('click', function(){
      var path = document.getElementById('repoPath').value;
      var hint = document.getElementById('detectHint');
      hint.textContent = 'Detecting…';
      post('/api/detect', { path: path }).then(function(res){
        if (!res.ok){ hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed'); return; }
        setEngines(res.j.engines);
        var found = ['claude','codex','copilot'].filter(function(e){ return res.j.engines[e]; });
        var dl = document.getElementById('recentRepos');
        if (res.j.repo && !dl.querySelector('option[value="'+res.j.repo.replace(/"/g,'')+'"]')){ var o=document.createElement('option'); o.value=res.j.repo; dl.appendChild(o); }
        document.getElementById('repoPath').value = res.j.repo || path;
        document.getElementById('engHint').textContent = found.length ? '(found: '+found.join(', ')+')' : '(none detected)';
        hint.textContent = res.j.isGit ? 'git repo ✓' : 'not a git repo';
        render(res.j.state);
        loadAttachments();
      });
    });

    document.getElementById('checkEnginesBtn').addEventListener('click', checkEngines);
    document.getElementById('toolList').addEventListener('change', function(e){
      var cb = e.target.closest('.tool-toggle'); if (!cb) return;
      toggleTool(cb.getAttribute('data-tool'), cb.checked);
    });

    document.getElementById('attachInput').addEventListener('change', function(e){
      var files = e.target.files; if (!files || !files.length) return;
      var hint = document.getElementById('intakeHint');
      var done = 0, total = files.length;
      hint.textContent = 'Uploading 0/'+total+'…';
      Array.prototype.forEach.call(files, function(f){
        send('POST', '/api/upload?name='+encodeURIComponent(f.name), f, false).then(function(res){
          done++; hint.textContent = 'Uploading '+done+'/'+total+'…';
          if (res.ok && res.j.attachments) renderAttachments(res.j.attachments);
          if (done===total){ hint.textContent = total+' file(s) attached.'; e.target.value=''; }
        });
      });
    });

    document.getElementById('attachList').addEventListener('click', function(e){
      var btn = e.target.closest('.a-del'); if (!btn) return;
      var name = btn.closest('.att').getAttribute('data-name');
      send('DELETE', '/api/upload?name='+encodeURIComponent(name), null, false).then(function(res){
        if (res.ok) renderAttachments(res.j.attachments||[]);
      });
    });

    var board = document.getElementById('board');
    board.addEventListener('click', function(e){
      var card = e.target.closest('.card'); if (!card) return;
      var name = card.getAttribute('data-name');
      if (e.target.closest('.u-del')){
        post('/api/units', { action:'delete', unit:{ name:name } }).then(function(res){ if (res.ok) render(res.j.state); });
      } else if (e.target.closest('.u-conf')){
        var v = prompt('Confidence (0–1) for '+name, '1'); if (v===null) return;
        post('/api/units', { action:'update', unit:{ name:name, confidence: parseFloat(v)||0 } }).then(function(res){ if (res.ok) render(res.j.state); });
      }
    });
    board.addEventListener('change', function(e){
      if (!e.target.classList.contains('u-status')) return;
      var name = e.target.closest('.card').getAttribute('data-name');
      post('/api/units', { action:'update', unit:{ name:name, status: e.target.value } }).then(function(res){ if (res.ok) render(res.j.state); });
    });

    document.getElementById('unitForm').addEventListener('submit', function(e){
      e.preventDefault();
      var name = document.getElementById('unitName').value.trim();
      var hint = document.getElementById('unitHint');
      if (!name){ hint.textContent = 'name required'; return; }
      var unit = { name:name, status: document.getElementById('unitStatus').value, confidence: parseFloat(document.getElementById('unitConf').value)||0 };
      var scopeRaw = document.getElementById('unitScope').value.trim();
      if (scopeRaw) unit.scope = scopeRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
      var specRaw = document.getElementById('unitSpec').value.trim();
      if (specRaw) unit.spec = specRaw;
      post('/api/units', { action:'add', unit:unit }).then(function(res){
        if (res.ok){ render(res.j.state); document.getElementById('unitName').value=''; document.getElementById('unitScope').value=''; document.getElementById('unitSpec').value=''; hint.textContent=''; }
        else hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed');
      });
    });

    document.getElementById('dispatchBtn').addEventListener('click', function(){
      var eng = document.getElementById('dispatchEngine').value;
      var hint = document.getElementById('dispatchHint');
      hint.textContent = 'Writing…';
      post('/api/dispatch', { engine: eng }).then(function(res){
        if (res.ok){ hint.textContent = 'Wrote '+res.j.file; var o = document.getElementById('dispatchOut'); o.hidden = false; o.textContent = res.j.prompt; }
        else hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed');
      });
    });

    document.getElementById('orchestrateBtn').addEventListener('click', function(){
      var eng = document.getElementById('dispatchEngine').value;
      var hint = document.getElementById('dispatchHint');
      hint.textContent = 'Orchestrating (dry)…';
      post('/api/orchestrate', { engine: eng }).then(function(res){
        if (res.ok){ hint.textContent = 'Orchestrated — prompts written under ${CTX_DIR}/workunits/*'; render(res.j.state); loadSkills(); }
        else hint.textContent = 'Error: '+((res.j&&res.j.error)||'failed');
      });
    });

    document.getElementById('discoverForm').addEventListener('submit', function(e){
      e.preventDefault();
      var kind = document.getElementById('discoverKind').value;
      var query = document.getElementById('discoverQuery').value.trim();
      var approved = document.getElementById('discoverApprove').checked;
      var hint = document.getElementById('discoverHint');
      if (!query){ hint.textContent = 'query required'; return; }
      hint.textContent = 'Searching…';
      post('/api/discover', { kind: kind, query: query, approved: approved }).then(function(res){
        var out = document.getElementById('discoverOut');
        if (res.j && res.j.approvalRequired){ hint.textContent = ''; out.hidden = false; out.textContent = res.j.reason + '\\nTick “approve network” to run the lookup.'; return; }
        if (res.ok && res.j.ok){ hint.textContent = (res.j.results||[]).length+' result(s)'; out.hidden = false; out.textContent = (res.j.results||[]).map(function(r){ return '['+(r.status||r.kind)+'] '+r.title+' — '+r.snippet; }).join('\\n') || '(no results)'; }
        else { hint.textContent = ''; out.hidden = false; out.textContent = (res.j&&res.j.reason)||'discovery failed'; }
      });
    });
  }

  function boot(){
    wire();
    var es = new EventSource('/events');
    es.onmessage = function(e){ render(JSON.parse(e.data)); };
    fetch('/state').then(function(r){ return r.json(); }).then(function(s){ render(s); loadAttachments(); loadSkills(); }).catch(function(){ render(null); });
    loadSettings();
  }
  window.addEventListener('load', boot);
})();
</script>
</body>
</html>`;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Exact host/origin match — guards against DNS-rebinding and cross-origin writes. */
function hostAllowed(req: IncomingMessage): boolean {
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  return LOOPBACK.has(host);
}
function originAllowed(req: IncomingMessage): boolean {
  const o = req.headers.origin || req.headers.referer;
  if (!o) return true; // same-origin fetch may omit Origin; token + host still apply
  try {
    return LOOPBACK.has(new URL(o).hostname);
  } catch {
    return false;
  }
}

function readJsonBody(req: IncomingMessage, cap = 65536): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > cap) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

const ATTACH_CAP = 50 * 1024 * 1024; // 50 MB per file

function attachDir(repo: string): string {
  return join(repo, CTX_DIR, "attachments");
}

/**
 * Sanitize an upload name to a single safe path segment within the attachments dir.
 * Rejects path separators, traversal, control/null bytes, dotfiles, and over-long names.
 */
function safeAttachName(raw: string): string | null {
  const base = basename(String(raw || "").trim());
  if (!base || base === "." || base === "..") return null;
  if (base.startsWith(".")) return null;
  if (/[\\/\0]/.test(base)) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control bytes in filenames
  if (/[\u0000-\u001f]/.test(base)) return null;
  if (base.length > 200) return null;
  return base;
}

function listAttachments(repo: string): Attachment[] {
  const dir = attachDir(repo);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith("."))
    .map((n) => {
      let size = 0;
      try {
        size = statSync(join(dir, n)).size;
      } catch {
        /* ignore */
      }
      return {
        name: n,
        size,
        type: n.split(".").pop()?.toLowerCase() ?? "",
        skill: skillForFile(n),
      };
    });
}

/** Mirror the on-disk attachment list into the saved ledger so the dashboard reflects it. */
function syncAttachments(repo: string): Attachment[] {
  const items = listAttachments(repo);
  const state = readState(repo);
  if (state) {
    state.attachments = items;
    writeState(repo, state);
  }
  return items;
}

/** Stream a raw request body to a capped, sanitized file under the attachments dir. */
function saveUpload(req: IncomingMessage, repo: string, rawName: string): Promise<Attachment> {
  return new Promise((resolvePromise, reject) => {
    const safe = safeAttachName(rawName);
    if (!safe) {
      reject(new Error("invalid filename"));
      return;
    }
    const dir = attachDir(repo);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, safe);
    // Defense in depth: ensure the resolved path stays inside the attachments dir.
    if (!resolve(dest).startsWith(resolve(dir) + sep)) {
      reject(new Error("invalid path"));
      return;
    }
    let size = 0;
    let aborted = false;
    const out = createWriteStream(dest);
    const fail = (msg: string) => {
      if (aborted) return;
      aborted = true;
      out.destroy();
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      reject(new Error(msg));
    };
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > ATTACH_CAP) {
        fail("file too large");
        req.destroy();
        return;
      }
      out.write(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      out.end(() =>
        resolvePromise({
          name: safe,
          size,
          type: safe.split(".").pop()?.toLowerCase() ?? "",
          skill: skillForFile(safe),
        }),
      );
    });
    req.on("error", () => fail("upload error"));
    out.on("error", () => fail("write error"));
  });
}

/** Read the engine list a preflight request asks about; default to all known engines. */
function requestedEngines(payload: Record<string, unknown>): Engine[] {
  const raw = payload.engines;
  if (!Array.isArray(raw)) return [...ENGINES];
  const want = new Set(raw.filter((e): e is string => typeof e === "string"));
  const picked = ENGINES.filter((e) => want.has(e));
  return picked.length ? picked : [...ENGINES];
}

/**
 * Run the readiness check for the requested engines. Probing spawns real engines locally
 * (acceptable on the loopback server, off the hot path — only on explicit request). The
 * client may pass `probe:false` for a fast presence/auth pass with no engine spawn.
 */
function runPreflight(payload: Record<string, unknown>): {
  ok: boolean;
  readiness: EngineReadiness[];
  anyReady: boolean;
} {
  const opts: PreflightOpts = { probe: payload.probe !== false };
  const readiness = preflightAll(requestedEngines(payload), opts);
  return { ok: true, readiness, anyReady: anyReady(readiness) };
}

/** Languages detected in the active repo, used to build per-tool install plans. */
function repoLanguages(repo: string): string[] {
  try {
    return scanRepo(repo).languages;
  } catch {
    return [];
  }
}

/** One optional tool's view: current install state + the plan text (commands the user runs). */
interface ToolView {
  name: string;
  title: string;
  description: string;
  installed: boolean;
  plan: string[];
  command: string;
}

/** Build the optional-tools view (codegraph + lsp). Pure: detection only, no installs. */
function toolViews(repo: string): ToolView[] {
  const languages = repoLanguages(repo);
  return TOOL_ORDER.map((name) => {
    const tool = TOOLS[name];
    const plan = tool.installPlan({ workspace: repo, languages });
    return {
      name,
      title: tool.title,
      description: tool.description,
      installed: tool.detect(),
      plan: plan.steps.map((s) => `${s.cmd} ${s.args.join(" ")}`),
      command: `vf tools install ${name} --yes`,
    };
  });
}

/** GET /api/settings payload: persisted settings + the optional-tools view. */
function settingsView(repo: string): { settings: VibeSettings; tools: ToolView[] } {
  return { settings: readSettings(repo), tools: toolViews(repo) };
}

/** Apply a settings toggle from the browser (codegraph/lsp only); never installs software. */
function applySettings(repo: string, payload: Record<string, unknown>): VibeSettings {
  const raw = (payload.tools ?? {}) as Record<string, unknown>;
  const tools = { ...readSettings(repo).tools };
  if (typeof raw.codegraph === "boolean") tools.codegraph = raw.codegraph;
  if (typeof raw.lsp === "boolean") tools.lsp = raw.lsp;
  return writeSettings(repo, { tools });
}

export function startServer(port = 0): Promise<{ server: Server; url: string }> {
  // Per-process CSRF token: embedded in the page, required on every write request.
  const token = randomUUID();
  const html = PAGE.replace(/__CSRF__/g, token);
  // Single active repo for this server; updated by POST /api/detect (default: cwd).
  let activeRepo = cwd();

  const guarded = (req: IncomingMessage): boolean =>
    hostAllowed(req) && originAllowed(req) && req.headers["x-vibeflow-token"] === token;

  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const fullUrl = req.url || "/";
    const url = fullUrl.split("?")[0] || "/";
    const query = new URLSearchParams(fullUrl.split("?")[1] || "");

    if (method === "GET" && (url === "/" || url.startsWith("/index"))) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
        "x-content-type-options": "nosniff",
      });
      res.end(html);
      return;
    }
    if (method === "GET" && url === "/state") {
      sendJson(res, 200, readState(activeRepo));
      return;
    }
    if (method === "GET" && url === "/api/attachments") {
      sendJson(res, 200, { attachments: listAttachments(activeRepo) });
      return;
    }
    if (method === "GET" && url === "/api/skills") {
      const state = readState(activeRepo);
      const needs = resolveSkillNeeds({
        repo: activeRepo,
        attachments: (state?.attachments ?? []).map((a) => a.name),
        task: state?.goal,
        profile: scanRepo(activeRepo),
      });
      sendJson(res, 200, { skills: discoverSkills(activeRepo), needs });
      return;
    }
    if (method === "GET" && url === "/api/settings") {
      sendJson(res, 200, settingsView(activeRepo));
      return;
    }
    if (method === "GET" && url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      let last = "";
      const tick = () => {
        const state: WorkflowState | null = readState(activeRepo);
        const json = JSON.stringify(state);
        if (json !== last) {
          last = json;
          res.write(`data: ${json}\n\n`);
        }
      };
      tick();
      const timer = setInterval(tick, 1000);
      req.on("close", () => clearInterval(timer));
      return;
    }

    // --- Write surface: all guarded by CSRF token + loopback Host/Origin ---
    const isWrite =
      (method === "POST" &&
        (url === "/api/init" ||
          url === "/api/dispatch" ||
          url === "/api/detect" ||
          url === "/api/units" ||
          url === "/api/orchestrate" ||
          url === "/api/discover" ||
          url === "/api/preflight" ||
          url === "/api/settings" ||
          url === "/api/upload")) ||
      (method === "DELETE" && url === "/api/upload");
    if (isWrite) {
      if (!guarded(req)) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      try {
        // Raw binary upload — streamed, not JSON-parsed.
        if (method === "POST" && url === "/api/upload") {
          const att = await saveUpload(req, activeRepo, query.get("name") || "");
          const attachments = syncAttachments(activeRepo);
          sendJson(res, 200, { ok: true, attachment: att, attachments });
          return;
        }
        if (method === "DELETE" && url === "/api/upload") {
          const safe = safeAttachName(query.get("name") || "");
          if (!safe) {
            sendJson(res, 400, { error: "invalid filename" });
            return;
          }
          const target = join(attachDir(activeRepo), safe);
          if (existsSync(target)) unlinkSync(target);
          const attachments = syncAttachments(activeRepo);
          sendJson(res, 200, { ok: true, attachments });
          return;
        }

        const payload = await readJsonBody(req);
        if (url === "/api/detect") {
          const det = detectRepo(typeof payload.path === "string" ? payload.path : undefined);
          activeRepo = det.repo;
          sendJson(res, 200, { ok: true, ...det, state: readState(activeRepo) });
        } else if (url === "/api/init") {
          if (typeof payload.repoPath === "string") activeRepo = resolveRepo(payload.repoPath);
          // useAi:false — a browser request must never shell out to $VIBEFLOW_AI.
          const { files, state } = applyIntake(payload, { useAi: false, base: activeRepo });
          sendJson(res, 200, { ok: true, files, state });
        } else if (url === "/api/dispatch") {
          const result = applyDispatch(String(payload.engine ?? ""), activeRepo);
          if (!result) {
            sendJson(res, 400, { error: "invalid engine" });
            return;
          }
          sendJson(res, 200, { ok: true, ...result });
        } else if (url === "/api/orchestrate") {
          // Browser-initiated orchestration is always dry (prompts only) — it must never
          // shell out to a real engine or $VIBEFLOW_AI from a web request.
          const engine = typeof payload.engine === "string" ? payload.engine : "claude";
          await orchestrate({ engine, dry: true }, activeRepo);
          sendJson(res, 200, { ok: true, state: readState(activeRepo) });
        } else if (url === "/api/discover") {
          const kind = payload.kind === "skills" ? "skills" : "docs";
          const query = String(payload.query ?? "").trim();
          const approved = payload.approved === true;
          if (!query) {
            sendJson(res, 400, { error: "query required" });
            return;
          }
          const { lookupDocsHttp: lookup, searchSkillsHttp: search } = await import(
            "./discovery/context7.js"
          );
          const outcome =
            kind === "docs" ? await lookup(query, { approved }) : await search(query, { approved });
          sendJson(res, 200, { ...outcome });
        } else if (url === "/api/units") {
          const action = String(payload.action ?? "");
          if (action !== "add" && action !== "update" && action !== "delete") {
            sendJson(res, 400, { error: "invalid action" });
            return;
          }
          const unit = (payload.unit ?? {}) as {
            name?: string;
            spec?: string;
            scope?: string[];
          };
          const state = mutateUnits(activeRepo, action, unit);
          if (!state) {
            sendJson(res, 400, { error: "no workflow or unit not found" });
            return;
          }
          sendJson(res, 200, { ok: true, state });
        } else if (url === "/api/preflight") {
          sendJson(res, 200, runPreflight(payload));
        } else if (url === "/api/settings") {
          applySettings(activeRepo, payload);
          sendJson(res, 200, { ok: true, ...settingsView(activeRepo) });
        }
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolvePromise) => {
    // Bind to loopback only — never expose publicly (SECURITY_MODEL).
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      const url = `http://127.0.0.1:${boundPort}`;
      console.log(`${c.cyan("VibeFlow UI")} → ${c.bold(url)}  ${c.dim("(Ctrl+C to stop)")}`);
      resolvePromise({ server, url });
    });
  });
}
