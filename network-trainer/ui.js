// Networking Trainer — UI. Runs in the browser on top of the SAME tested modules
// (loaded via the require() shim the build injects). Topology + config panels +
// terminal + mission flow, now with saved progress, XP, ranks, a hints economy,
// themes, and settings — the sysadmin game's "feel".
const M = require('./net-model');
const { startMission } = require('./net-mission');
const { chapters } = require('./net-chapters');

const REWARD = 100, HINT_COST = 25;
const RANKS = [[0, 'Cadet'], [120, 'Apprentice'], [280, 'Technician'], [460, 'Engineer'], [640, 'Senior Engineer'], [820, 'Network Architect']];
const THEMES = [['', 'Network Ops (cyan)'], ['halcyon', 'Halcyon Dark'], ['amber', 'Amber CRT'], ['green', 'Green Phosphor'], ['paper', 'Paper (light)']];

let RUN = null, SEL = null, HINTS = 0, PROG = loadProg();
let TSTART = 0, TICK = null, SOLVED_NOW = false;   // per-ticket timer
let DIAGNOSED = false;                              // diagnosis gate cleared?
let HIST = [], HISTI = -1;                         // terminal command history
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- persistence ---------- */
function loadProg() { try { const p = JSON.parse(localStorage.getItem('nettrainer') || '{}'); return { done: p.done || {}, xp: p.xp || 0, theme: p.theme || '' }; } catch (e) { return { done: {}, xp: 0, theme: '' }; } }
function saveProg() { try { localStorage.setItem('nettrainer', JSON.stringify(PROG)); } catch (e) {} }
const rankFor = xp => { let r = RANKS[0][1]; for (const [t, n] of RANKS) if (xp >= t) r = n; return r; };
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); PROG.theme = t; saveProg(); }

/* ---------- topology (unchanged engine; just drawing) ---------- */
function layout(net) {
  const ids = Object.keys(net.devices), adj = {};
  ids.forEach(i => adj[i] = new Set());
  net.links.forEach(l => { adj[l.a[0]].add(l.b[0]); adj[l.b[0]].add(l.a[0]); });
  const anchor = ids.find(i => net.devices[i].kind === 'host') || ids[0];
  const layer = { [anchor]: 0 }, q = [anchor];
  while (q.length) { const n = q.shift(); adj[n].forEach(m => { if (layer[m] == null) { layer[m] = layer[n] + 1; q.push(m); } }); }
  ids.forEach(i => { if (layer[i] == null) layer[i] = 0; });
  const byLayer = {}; ids.forEach(i => (byLayer[layer[i]] = byLayer[layer[i]] || []).push(i));
  const pos = {};
  Object.keys(byLayer).map(Number).sort((a, b) => a - b).forEach(L => byLayer[L].forEach((id, idx) => { pos[id] = [90 + L * 160, 50 + idx * 100]; }));
  return pos;
}
const primaryIp = dev => { for (const n in dev.ifaces) { const f = dev.ifaces[n]; if (f.up !== false && f.ip != null) return M.ipStr(f.ip); } return null; };
const NODE_ICONS = {
  host: `<g class="ico" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <rect x="6" y="2" width="36" height="22" rx="2"/>
    <path d="M18 24v6M30 24v6M14 30h20"/>
    <path d="M12 8h24M12 13h16" opacity=".5"/>
  </g>`,
  server: `<g class="ico" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <rect x="14" y="1" width="20" height="34" rx="2"/>
    <path d="M18 7h12M18 12h12M18 17h12"/>
    <circle cx="20" cy="26" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="26" cy="26" r="1.4" fill="currentColor" stroke="none"/>
  </g>`,
  switch: `<g class="ico" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <rect x="4" y="10" width="40" height="16" rx="2"/>
    <circle cx="12" cy="18" r="2" fill="currentColor" stroke="none"/>
    <circle cx="20" cy="18" r="2" fill="currentColor" stroke="none"/>
    <circle cx="28" cy="18" r="2" fill="currentColor" stroke="none"/>
    <circle cx="36" cy="18" r="2" fill="currentColor" stroke="none"/>
    <path d="M24 4v6M20 6l4-4 4 4M24 26v6M20 30l4 4 4-4"/>
  </g>`,
  router: `<g class="ico" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="18" r="9"/>
    <path d="M24 2v7M24 27v7M8 18h7M33 18h7"/>
    <path d="M24 5l-3 3h6zM24 31l-3-3h6zM11 18l3-3v6zM37 18l-3-3v6z" fill="currentColor" stroke="none"/>
  </g>`,
  firewall: `<g class="ico" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <rect x="6" y="4" width="36" height="28" rx="1"/>
    <path d="M6 13h36M6 22h36"/>
    <path d="M16 4v9M28 13v9M18 22v10"/>
  </g>`
};
const KINDCLASS = { host: 'k-host', switch: 'k-switch', router: 'k-router', firewall: 'k-fw' };
function linkDown(net, l) { if (l.up === false) return true; const up = (d, i) => { const f = net.devices[d] && net.devices[d].ifaces[i]; return f && f.up !== false; }; return !(up(l.a[0], l.a[1]) && up(l.b[0], l.b[1])); }
function renderTopo() {
  const net = RUN.net, pos = layout(net);
  const maxX = Math.max(...Object.values(pos).map(p => p[0])) + 100, maxY = Math.max(...Object.values(pos).map(p => p[1])) + 80;
  const cx = id => pos[id][0] + 24, cy = id => pos[id][1] + 18;
  let s = `<svg id="topo" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="network topology">`;
  for (const l of net.links) s += `<line x1="${cx(l.a[0])}" y1="${cy(l.a[0])}" x2="${cx(l.b[0])}" y2="${cy(l.b[0])}" class="edge${linkDown(net, l) ? ' down' : ''}"/>`;
  for (const id in net.devices) {
    const d = net.devices[id], [x, y] = pos[id], ip = primaryIp(d);
    const kindKey = d.kind === 'switch' ? 'switch' : d.kind === 'router' ? 'router' : d.kind === 'firewall' ? 'firewall' : ((d.services || /^(srv|web|db|dns|www|site)/.test(id)) ? 'server' : 'host');
    const ico = NODE_ICONS[kindKey] || NODE_ICONS.host;
    s += `<g class="node ${KINDCLASS[d.kind]||''} k-${kindKey} ${id === SEL ? 'sel' : ''}" data-dev="${id}" transform="translate(${x},${y})">${ico}<text x="24" y="48" text-anchor="middle" class="n-id">${id}</text><text x="24" y="60" text-anchor="middle" class="n-sub">${ip || d.kind}</text></g>`;
  }
  return s + '</svg>';
}

/* ---------- panels ---------- */
function updateHud() { $('#xp').textContent = PROG.xp; $('#rank').textContent = rankFor(PROG.xp); const n = chapters.filter(c => PROG.done[c.id]).length; $('#prog').textContent = `${n}/${chapters.length}`; }
function renderTicket(m) {
  const t = m.ticket; if (!t) return '';
  const pc = 'tk-' + String(t.priority || '').toLowerCase();
  return `<div class="ticket">
    <div class="tk-top"><span class="tk-id">${esc(t.id)}</span><span class="tk-pri ${pc}">${esc(t.priority)}</span></div>
    <div class="tk-from">${esc(t.from)}</div>
    <div class="tk-sym">“${esc(t.symptom)}”</div>
  </div>`;
}
function renderDiagnose(m) {
  const d = m.diagnose;
  const opts = d.options.map((o, i) => `<button class="diag-opt" data-di="${i}">${esc(o)}</button>`).join('');
  return `<div class="label">Triage — locate the fault before you touch anything</div>
    <p class="diag-q">${esc(d.q)}</p>
    <div class="diag-opts">${opts}</div>
    <div id="diagfb" class="diag-fb"></div>
    <p class="dim diag-tip">Use the terminal (<b>ping</b>, <b>traceroute</b>, <b>ip addr</b>, <b>nmap</b>) to see what's really happening, then choose.</p>`;
}
function renderBrief() {
  const m = RUN.mission, solved = !!PROG.done[m.id];
  const opts = chapters.map((c, i) => `<option value="${i}"${c.id === m.id ? ' selected' : ''}>${PROG.done[c.id] ? '✓ ' : ''}${c.chapter} — ${c.title}</option>`).join('');
  const hints = m.hints.slice(0, HINTS).map(h => `<li>${esc(h)}</li>`).join('');
  const hintBtn = HINTS >= m.hints.length ? '<button class="btn" disabled>No more hints</button>' : `<button id="hint" class="btn">Show hint · −${HINT_COST} XP</button>`;
  const gated = RUN.requiresDiagnosis && !DIAGNOSED;
  const body = gated
    ? renderDiagnose(m)
    : `${m.diagnose ? `<div class="diag-done">✓ Diagnosed — ${esc(m.diagnose.because)}</div>` : ''}
    <div class="label">Objective</div><p>${esc(m.objective)}</p>
    <div class="label">Hints</div><ol>${hints}</ol>
    <div class="row">${hintBtn}<button id="check" class="btn primary">Check</button></div>`;
  return `<select id="pick">${opts}</select>
    <div class="eyebrow">${esc(m.chapter)}${solved ? ' · <span class="done">solved</span>' : ''}</div>
    <h1>${esc(m.title)}</h1>
    ${renderTicket(m)}
    <div class="label">What you know</div><p class="story">${esc(m.story)}</p>
    ${body}
    <div id="status"></div>`;
}
function renderConfig() {
  if (!SEL) return '<p class="dim">Click a device to configure it.</p>';
  const d = RUN.net.devices[SEL];
  let h = `<div class="label">${SEL} · ${d.kind}</div><div class="label2">Interfaces</div>`;
  for (const n in d.ifaces) {
    const f = d.ifaces[n];
    h += `<div class="ifrow" data-if="${n}"><span class="ifn">${n}</span><input class="ip" value="${f.ip != null ? M.ipStr(f.ip) : ''}" placeholder="address"/><span>/</span><input class="pfx" value="${f.mask != null ? f.mask : ''}" placeholder="24" size="2"/><label class="up"><input type="checkbox" class="upc"${f.up !== false ? ' checked' : ''}/>up</label></div>`;
  }
  if (d.kind !== 'switch') {
    h += '<div class="label2">Routes</div>';
    (d.routes || []).forEach((r, i) => { const dest = r.mask === 0 ? 'default' : M.ipStr(r.dest) + '/' + r.mask; h += `<div class="rrow">${dest} via ${M.ipStr(r.via)} <button class="x" data-rt="${i}">✕</button></div>`; });
    h += `<div class="addrow"><input class="rdest" placeholder="default or 10.0.3.0/24"/><input class="rvia" placeholder="via gateway"/><button class="btn sm" id="addrt">Add route</button></div>`;
  }
  if (d.kind === 'router' || d.kind === 'firewall') {
    h += '<div class="label2">Firewall (inbound)</div>';
    const dstTxt = r => r.dst != null ? ' dst:' + M.ipStr(r.dst) : r.dstnet ? ' dst:' + M.ipStr(r.dstnet.net) + '/' + r.dstnet.prefix : '';
    (d.acls || []).forEach((r, i) => { h += `<div class="rrow">${r.action === 'deny' ? 'DROP' : 'ALLOW'} ${r.proto || 'all'} in:${r.dev || 'any'}${r.src != null ? ' src:' + M.ipStr(r.src) : ''}${dstTxt(r)}${r.dport != null ? ' dpt:' + r.dport : ''} <button class="x" data-acl="${i}">✕</button></div>`; });
    const ifopts = Object.keys(d.ifaces).map(n => `<option>${n}</option>`).join('');
    h += `<div class="addrow"><select class="aif">${ifopts}</select><select class="aproto"><option value="">any</option><option>tcp</option><option>udp</option><option>icmp</option></select><input class="adport" placeholder="dport" size="4"/><input class="asrc" placeholder="src ip" size="8"/><input class="adst" placeholder="dst ip/cidr" size="10"/><select class="aact"><option value="deny">DROP</option><option value="allow">ALLOW</option></select><button class="btn sm" id="addacl">Add</button></div>`;
  }
  return h;
}

/* ---------- actions ---------- */
function refresh() { $('#topoWrap').innerHTML = renderTopo(); $('#config').innerHTML = renderConfig(); wireTopo(); wireConfig(); }
function reloadMission(i) { RUN = startMission(chapters[i]); SEL = RUN.mission.console; HINTS = 0; SOLVED_NOW = false; DIAGNOSED = !RUN.requiresDiagnosis || !!PROG.done[chapters[i].id]; HIST = []; HISTI = -1; startTimer(); $('#brief').innerHTML = renderBrief(); wireBrief(); refresh(); updateHud(); termClear(); termEcho(`— ${RUN.mission.title} — you are on ${SEL}. Try: ping, traceroute, ip addr, nmap`); }
function startTimer() { if (TICK) clearInterval(TICK); TSTART = Date.now(); const t = $('#time'); if (t) t.textContent = '0:00'; TICK = setInterval(() => { const el = $('#time'); if (el && !SOLVED_NOW) el.textContent = fmtTime(Date.now() - TSTART); }, 1000); }
function stopTimer() { if (TICK) { clearInterval(TICK); TICK = null; } }
function termEcho(s) { const o = $('#tout'); o.textContent += s + '\n'; o.scrollTop = o.scrollHeight; }
function termClear() { $('#tout').textContent = ''; }
function nextUnsolved() { const cur = chapters.findIndex(c => c.id === RUN.mission.id); for (let k = 1; k <= chapters.length; k++) { const i = (cur + k) % chapters.length; if (!PROG.done[chapters[i].id]) return i; } return -1; }
function doCheck() {
  const box = $('#status'); const done = RUN.done();
  if (done) {
    const id = RUN.mission.id, ms = Date.now() - TSTART;
    if (!SOLVED_NOW) { SOLVED_NOW = true; stopTimer(); }
    let msg = '✓ All objectives met — ticket resolved.';
    if (!PROG.done[id]) {
      const reward = Math.max(25, REWARD - HINT_COST * HINTS);
      PROG.done[id] = { xp: reward, hints: HINTS, ms }; PROG.xp += reward; saveProg(); updateHud();
      msg = `✓ Ticket resolved in <b>${fmtTime(ms)}</b> — <b>+${reward} XP</b>${HINTS ? ` (−${HINT_COST * HINTS} for hints)` : ''}.`;
      const eb = $('#brief').querySelector('.eyebrow'); if (eb) eb.innerHTML += ' · <span class="done">solved</span>';
    } else if (PROG.done[id].ms == null || ms < PROG.done[id].ms) { PROG.done[id].ms = ms; saveProg(); }
    const ni = nextUnsolved(), allDone = chapters.every(c => PROG.done[c.id]);
    box.className = 'ok';
    box.innerHTML = msg + (ni >= 0 ? ' <button class="btn sm" id="next">Next ticket →</button>' : (allDone ? `<div class="finale">🎓 All ${chapters.length} tickets cleared — final rank <b>${rankFor(PROG.xp)}</b>, ${PROG.xp} XP.</div>` : ''));
    const nb = $('#next'); if (nb) nb.addEventListener('click', () => reloadMission(ni));
  } else {
    box.className = 'bad'; box.innerHTML = 'Not resolved yet:<ul>' + RUN.results().filter(r => !r.ok).map(r => `<li>${esc(r.reason)}</li>`).join('') + '</ul>';
  }
}

/* ---------- settings ---------- */
function openSettings() {
  const cur = PROG.theme || '';
  const rows = THEMES.map(([id, name]) => `<button class="tm${id === cur ? ' sel' : ''}" data-th="${id}">${name}${id === cur ? ' ✓' : ''}</button>`).join('');
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet"><h2>Settings</h2><div class="label">Theme</div><div class="themes">${rows}</div>
    <div class="label">Progress</div><p class="dim">XP ${PROG.xp} · ${chapters.filter(c => PROG.done[c.id]).length}/${chapters.length} tickets solved.</p>
    <button class="btn" id="reset">Reset progress</button>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="closeS">Done</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.querySelectorAll('.tm').forEach(b => b.addEventListener('click', () => { applyTheme(b.dataset.th); wrap.remove(); openSettings(); }));
  $('#reset').addEventListener('click', () => { if (confirm('Erase all progress and XP?')) { PROG = { done: {}, xp: 0, theme: PROG.theme }; saveProg(); updateHud(); $('#brief').innerHTML = renderBrief(); wireBrief(); wrap.remove(); } });
  $('#closeS').addEventListener('click', () => wrap.remove());
}

/* ---------- wiring ---------- */
function wireTopo() { document.querySelectorAll('#topo .node').forEach(n => n.addEventListener('click', () => { SEL = n.dataset.dev; refresh(); })); }
function wireBrief() {
  $('#pick').addEventListener('change', e => reloadMission(+e.target.value));
  const hb = $('#hint'); if (hb) hb.addEventListener('click', () => { if (HINTS < RUN.mission.hints.length) HINTS++; $('#brief').innerHTML = renderBrief(); wireBrief(); });
  const cb = $('#check'); if (cb) cb.addEventListener('click', doCheck);
  document.querySelectorAll('#brief .diag-opt').forEach(b => b.addEventListener('click', () => {
    const res = RUN.gradeDiagnosis(+b.dataset.di);
    if (res.ok) { DIAGNOSED = true; $('#brief').innerHTML = renderBrief(); wireBrief(); }
    else { b.classList.add('wrong'); const fb = $('#diagfb'); if (fb) { fb.className = 'diag-fb bad'; fb.textContent = "Not quite — that's not where it's failing. Investigate with the terminal tools and pick again."; } }
  }));
}
function wireConfig() {
  if (!SEL) return; const d = RUN.net.devices[SEL];
  document.querySelectorAll('#config .ifrow').forEach(row => {
    const n = row.dataset.if;
    const apply = () => { const ipv = row.querySelector('.ip').value.trim(), pfx = row.querySelector('.pfx').value.trim(); d.ifaces[n].up = row.querySelector('.upc').checked; if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv) && pfx) { d.ifaces[n].ip = M.ip(ipv); d.ifaces[n].mask = +pfx; } else if (!ipv) { delete d.ifaces[n].ip; delete d.ifaces[n].mask; } refresh(); };
    row.querySelector('.ip').addEventListener('change', apply); row.querySelector('.pfx').addEventListener('change', apply); row.querySelector('.upc').addEventListener('change', apply);
  });
  const addrt = $('#addrt'); if (addrt) addrt.addEventListener('click', () => { const dest = $('#config .rdest').value.trim(), via = $('#config .rvia').value.trim(); if (!/^\d+\.\d+\.\d+\.\d+$/.test(via)) return; d.routes = d.routes || []; if (dest === 'default' || dest === '') d.routes.push({ dest: 0, mask: 0, via: M.ip(via) }); else { const c = M.cidr(dest); d.routes.push({ dest: c.net, mask: c.prefix, via: M.ip(via) }); } refresh(); });
  document.querySelectorAll('#config [data-rt]').forEach(b => b.addEventListener('click', () => { d.routes.splice(+b.dataset.rt, 1); refresh(); }));
  const addacl = $('#addacl'); if (addacl) addacl.addEventListener('click', () => { const g = s => $('#config ' + s).value.trim(); const rule = { dir: 'in', dev: g('.aif') || undefined, action: g('.aact') }; if (g('.aproto')) rule.proto = g('.aproto'); if (g('.adport')) rule.dport = +g('.adport'); if (/^\d+\.\d+\.\d+\.\d+$/.test(g('.asrc'))) rule.src = M.ip(g('.asrc')); const dv = g('.adst'); if (dv.includes('/')) rule.dstnet = M.cidr(dv); else if (/^\d+\.\d+\.\d+\.\d+$/.test(dv)) rule.dst = M.ip(dv); d.acls = d.acls || []; d.acls.push(rule); refresh(); });
  document.querySelectorAll('#config [data-acl]').forEach(b => b.addEventListener('click', () => { d.acls.splice(+b.dataset.acl, 1); refresh(); }));
}
function wireTerm() {
  const inp = $('#tin');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const line = inp.value; inp.value = ''; if (!line.trim()) return; HIST.push(line); HISTI = HIST.length; termEcho(`${SEL}:~$ ${line}`); const r = RUN.cli.on(SEL).run(line); if (r.out) termEcho(r.out); refresh(); return; }
    if (e.key === 'ArrowUp' && HIST.length) { HISTI = Math.max(0, HISTI - 1); inp.value = HIST[HISTI] || ''; e.preventDefault(); }
    if (e.key === 'ArrowDown' && HIST.length) { HISTI = Math.min(HIST.length, HISTI + 1); inp.value = HIST[HISTI] || ''; e.preventDefault(); }
  });
}
function openStats() {
  const rows = chapters.map(c => { const d = PROG.done[c.id]; return `<tr><td>${esc(c.title)}</td><td>${d ? '✓' : '·'}</td><td>${d && d.ms != null ? fmtTime(d.ms) : '—'}</td><td>${d ? d.hints : '—'}</td></tr>`; }).join('');
  const times = chapters.map(c => PROG.done[c.id]).filter(d => d && d.ms != null).map(d => d.ms);
  const solved = chapters.filter(c => PROG.done[c.id]).length;
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0, fastest = times.length ? Math.min(...times) : 0;
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet"><h2>Stats</h2>
    <p class="dim">Solved ${solved}/${chapters.length} · ${PROG.xp} XP · rank ${rankFor(PROG.xp)}${times.length ? ` · avg ${fmtTime(avg)} · fastest ${fmtTime(fastest)}` : ''}</p>
    <table class="stats"><thead><tr><th>Ticket</th><th>Done</th><th>Time</th><th>Hints</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="closeS">Done</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  $('#closeS').addEventListener('click', () => wrap.remove());
}

/* ---------- boot ---------- */
function boot() {
  applyTheme(PROG.theme);
  document.getElementById('app').innerHTML = `
    <header id="top">
      <div class="apphdr">
        <div class="brand"><span class="mark"></span>THE LAST SYSADMIN</div>
        <nav class="apptabs" role="tablist">
          <a class="apptab" href="../" role="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 16h4"/></svg>Linux Sysadmin</a>
          <a class="apptab on" href="#" role="tab" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 7h8M7.4 7.8 11 16M16.6 7.8 13 16"/></svg>Network Sysadmin</a>
        </nav>
      </div>
      <div class="hud"><span>Time <b id="time">0:00</b></span><span>XP <b id="xp">0</b></span><span>Rank <b id="rank">Cadet</b></span><span>Solved <b id="prog">0/0</b></span>
        <button id="btnStats" class="btn" title="Stats">📊</button>
        <button id="btnSet" class="btn" title="Settings">⚙</button></div>
    </header>
    <div id="cols">
      <aside id="brief"></aside>
      <main><div id="topoWrap"></div><div id="term"><pre id="tout"></pre><div class="tline"><span>$</span><input id="tin" autocomplete="off" placeholder="type a command — ping, ip addr, ip route add…"/></div></div></main>
      <aside id="config"></aside>
    </div>`;
  wireTerm();
  $('#btnSet').addEventListener('click', openSettings);
  $('#btnStats').addEventListener('click', openStats);
  reloadMission(0);
}
if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
