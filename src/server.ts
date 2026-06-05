import { randomUUID } from "node:crypto";
import { type IncomingMessage, type Server, createServer } from "node:http";
import { applyDispatch, applyIntake } from "./commands.js";
import { type WorkflowState, c, readState } from "./core.js";

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
  <details class="intake" id="intake" open>
    <summary>new workflow — initialize here</summary>
    <form class="form" id="intakeForm">
      <label>Goal / task
        <textarea name="goal" rows="2" placeholder="What should the agents accomplish?"></textarea>
      </label>
      <fieldset class="engines">
        <legend>Engines</legend>
        <label class="chk"><input type="checkbox" name="engine" value="claude" checked /> Claude Code</label>
        <label class="chk"><input type="checkbox" name="engine" value="codex" checked /> Codex</label>
        <label class="chk"><input type="checkbox" name="engine" value="copilot" checked /> Copilot CLI</label>
      </fieldset>
      <div class="grid2">
        <label>Project docs source<input name="docSource" placeholder="GitHub / Drive / Notion / local path" /></label>
        <label>Task / issue source<input name="taskSource" placeholder="Jira / Linear / GitHub Issues" /></label>
        <label>File types<input name="fileTypes" placeholder="md, docx, xlsx, pdf" /></label>
        <label>Sample / reference<input name="sample" placeholder="link or path to a template" /></label>
      </div>
      <label>Expected result (Definition of Done)
        <textarea name="expectedResult" rows="2" placeholder="How will we know it is done?"></textarea>
      </label>
      <div class="actions">
        <button type="submit" class="btn primary">Generate workflow</button>
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
      <span class="hint" id="dispatchHint"></span>
    </div>
    <pre class="out" id="dispatchOut" hidden></pre>
  </section>
  <section>
    <div class="section-label">work units</div>
    <div class="board" id="board"></div>
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
    return '<div class="card" data-name="'+esc(u.name)+'">'
      + '<div class="top"><h3>'+esc(u.name)+'</h3><span class="pill '+esc(u.status)+'">'+esc(u.status)+'</span></div>'
      + '<div class="gates">'+GATES.map(function(k){var st=g[k]||'pending';return '<span class="gate '+st+'">'+k+'</span>';}).join('')+'</div>'
      + '<div class="res">conf <b>'+(u.confidence)+'</b> · <b>'+(r.tokens||0)+'</b> tok · <b>$'+(r.cost_usd||0)+'</b> · <b>'+(r.wall_seconds||0)+'</b>s</div>'
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
    if (!s){
      meter.hidden = true; dispatchSec.hidden = true;
      board.innerHTML = '<p class="empty">No workflow yet — fill in <b>new workflow</b> above to initialize.</p>';
      return;
    }
    dispatchSec.hidden = false;
    var t = s.totals || {};
    meter.hidden = false;
    meter.innerHTML =
        tile('units', { num: t.units||0, text: (t.done||0)+'/'+(t.units||0) }, true)
      + tile('tokens', { num: t.tokens||0, text: (t.tokens||0) })
      + tile('est. cost', { num: t.cost_usd||0, text: (t.cost_usd||0), prefix: '$' })
      + tile('elapsed', { num: t.wall_seconds||0, text: (t.wall_seconds||0), suffix: 's' });
    Array.prototype.forEach.call(meter.querySelectorAll('.v'), countUp);

    var units = s.work_units || [];
    if (!units.length){
      board.innerHTML = '<p class="empty">Goal set: <b>'+esc(s.goal||'')+'</b>. No work units yet — single-concern tasks run without them.</p>';
      return;
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

  function post(path, body){
    return fetch(path, { method:'POST', headers:{'content-type':'application/json','x-vibeflow-token':CSRF}, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }, function(){ return { ok:false, j:{} }; }); });
  }

  function wire(){
    var form = document.getElementById('intakeForm');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var fd = new FormData(form);
      var body = {
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
        if (res.ok){ hint.textContent = 'Generated '+(res.j.files||[]).length+' files.'; render(res.j.state); document.getElementById('intake').open = false; }
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
  }

  function boot(){
    wire();
    var es = new EventSource('/events');
    es.onmessage = function(e){ render(JSON.parse(e.data)); };
    fetch('/state').then(function(r){ return r.json(); }).then(render).catch(function(){ render(null); });
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

function sendJson(res: import("node:http").ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

export function startServer(port = 0): Promise<{ server: Server; url: string }> {
  // Per-process CSRF token: embedded in the page, required on every write request.
  const token = randomUUID();
  const html = PAGE.replace(/__CSRF__/g, token);

  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = (req.url || "/").split("?")[0] || "/";

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
      sendJson(res, 200, readState());
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
        const state: WorkflowState | null = readState();
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
    if (method === "POST" && (url === "/api/init" || url === "/api/dispatch")) {
      if (!hostAllowed(req) || !originAllowed(req) || req.headers["x-vibeflow-token"] !== token) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { error: (err as Error).message });
        return;
      }
      try {
        if (url === "/api/init") {
          // useAi:false — a browser request must never shell out to $VIBEFLOW_AI.
          const { files, state } = applyIntake(payload, { useAi: false });
          sendJson(res, 200, { ok: true, files, state });
        } else {
          const result = applyDispatch(String(payload.engine ?? ""));
          if (!result) {
            sendJson(res, 400, { error: "invalid engine" });
            return;
          }
          sendJson(res, 200, { ok: true, ...result });
        }
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
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
