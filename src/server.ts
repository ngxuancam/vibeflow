import { type Server, createServer } from "node:http";
import { type WorkflowState, c, readState } from "./core.js";

// UI: dark-tech operator dashboard. Design read → VARIANCE 5 / MOTION 5 / DENSITY 6.
// Native CSS (no framework); GSAP core enhances entrances and the resource meter only.
// Content renders fully without JS — GSAP is progressive, gated on prefers-reduced-motion.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
  @media (max-width: 760px) { .meter { grid-template-columns: repeat(2,1fr); } }
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
  <section class="meter" id="meter" hidden></section>
  <section>
    <div class="section-label">work units</div>
    <div class="board" id="board"></div>
  </section>
</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
<script>
(function(){
  var GATES = ['build','lint','test','review'];
  var prev = {}, firstPaint = true, motion = false;

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

  function countUp(el){
    var target = parseFloat(el.getAttribute('data-num')) || 0;
    var pre = el.getAttribute('data-prefix')||'', suf = el.getAttribute('data-suffix')||'';
    var decimals = (String(target).split('.')[1]||'').length;
    if (!motion || !window.gsap){ el.textContent = pre+target+suf; return; }
    var o = { v: 0 };
    gsap.to(o, { v: target, duration: 0.9, ease: 'power3.out', onUpdate: function(){
      el.textContent = pre + (decimals ? o.v.toFixed(decimals) : Math.round(o.v)) + suf;
    }});
  }

  function render(s){
    var meter = document.getElementById('meter');
    var board = document.getElementById('board');
    if (!s){
      meter.hidden = true;
      board.innerHTML = '<p class="empty">No <code>vibeflow/WORKFLOW_STATE.json</code> yet — run <code>vf init</code>.</p>';
      return;
    }
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
      board.innerHTML = '<p class="empty">No work units — single-concern tasks run without them.</p>';
      return;
    }
    board.innerHTML = units.map(card).join('');

    if (motion && window.gsap){
      var cards = board.querySelectorAll('.card');
      if (firstPaint){
        gsap.from('header > *', { autoAlpha: 0, y: -8, duration: 0.5, ease: 'power3.out', stagger: 0.06 });
        gsap.from('#meter .tile', { autoAlpha: 0, y: 12, duration: 0.5, ease: 'power3.out', stagger: 0.05, delay: 0.05 });
        gsap.from(cards, { autoAlpha: 0, y: 16, scale: 0.98, duration: 0.55, ease: 'power3.out', stagger: { each: 0.05, from: 'start' }, delay: 0.1 });
      } else {
        units.forEach(function(u){
          if (JSON.stringify(u) !== prev[u.name]){
            var el = board.querySelector('.card[data-name="'+CSS.escape(u.name)+'"]');
            if (el) gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 0.4, ease: 'back.out(1.6)', clearProps: 'transform' });
          }
        });
      }
    }
    prev = {}; units.forEach(function(u){ prev[u.name] = JSON.stringify(u); });
    firstPaint = false;
  }

  function boot(){
    if (window.gsap){
      var mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', function(){
        motion = true;
        // one purposeful live indicator — not ambient noise
        gsap.to('#dot', { boxShadow: '0 0 0 6px rgba(126,231,135,0)', opacity: 0.45, duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      });
    }
    var es = new EventSource('/events');
    es.onmessage = function(e){ render(JSON.parse(e.data)); };
    fetch('/state').then(function(r){ return r.json(); }).then(render).catch(function(){ render(null); });
  }
  // GSAP is deferred; boot after load so window.gsap is ready (degrades gracefully if blocked).
  window.addEventListener('load', boot);
})();
</script>
</body>
</html>`;

export function startServer(port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const url = req.url || "/";
    if (url === "/" || url.startsWith("/index")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (url === "/state") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(readState()));
      return;
    }
    if (url === "/events") {
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
