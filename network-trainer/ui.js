// Networking Trainer — UI. Runs in the browser on top of the SAME tested modules
// (loaded via the require() shim the build injects). Topology + config panels +
// terminal + mission flow, now with saved progress, XP, ranks, a hints economy,
// themes, and settings — the sysadmin game's "feel".
const M = require('./net-model');
const { startMission } = require('./net-mission');
const { chapters } = require('./net-chapters');

const REWARD = 100, HINT_COST = 25;
const RANKS = [[0, 'Cadet'], [120, 'Apprentice'], [280, 'Technician'], [460, 'Engineer'], [640, 'Senior Engineer'], [820, 'Network Architect']];
const THEMES = [['', 'Halcyon Dark'], ['amber', 'Amber CRT'], ['green', 'Green Phosphor'], ['paper', 'Paper (light)']];

let RUN = null, SEL = null, HINTS = 0, PROG = loadProg();
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  Object.keys(byLayer).map(Number).sort((a, b) => a - b).forEach(L => byLayer[L].forEach((id, idx) => { pos[id] = [90 + L * 150, 60 + idx * 86]; }));
  return pos;
}
const primaryIp = dev => { for (const n in dev.ifaces) { const f = dev.ifaces[n]; if (f.up !== false && f.ip != null) return M.ipStr(f.ip); } return null; };
const KINDCLASS = { host: 'k-host', switch: 'k-switch', router: 'k-router', firewall: 'k-fw' };
function linkDown(net, l) { if (l.up === false) return true; const up = (d, i) => { const f = net.devices[d] && net.devices[d].ifaces[i]; return f && f.up !== false; }; return !(up(l.a[0], l.a[1]) && up(l.b[0], l.b[1])); }
function renderTopo() {
  const net = RUN.net, pos = layout(net);
  const maxX = Math.max(...Object.values(pos).map(p => p[0])) + 130, maxY = Math.max(...Object.values(pos).map(p => p[1])) + 70;
  const cx = id => pos[id][0] + 48, cy = id => pos[id][1] + 22;
  let s = `<svg id="topo" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="network topology">`;
  for (const l of net.links) s += `<line x1="${cx(l.a[0])}" y1="${cy(l.a[0])}" x2="${cx(l.b[0])}" y2="${cy(l.b[0])}" class="edge${linkDown(net, l) ? ' down' : ''}"/>`;
  for (const id in net.devices) {
    const d = net.devices[id], [x, y] = pos[id], ip = primaryIp(d);
    s += `<g class="node ${KINDCLASS[d.kind]} ${id === SEL ? 'sel' : ''}" data-dev="${id}" transform="translate(${x},${y})"><rect width="96" height="44" rx="8"/><text x="48" y="19" text-anchor="middle" class="n-id">${id}</text><text x="48" y="34" text-anchor="middle" class="n-sub">${ip || d.kind}</text></g>`;
  }
  return s + '</svg>';
}

/* ---------- panels ---------- */
function updateHud() { $('#xp').textContent = PROG.xp; $('#rank').textContent = rankFor(PROG.xp); const n = chapters.filter(c => PROG.done[c.id]).length; $('#prog').textContent = `${n}/${chapters.length}`; }
function renderBrief() {
  const m = RUN.mission, solved = !!PROG.done[m.id];
  const opts = chapters.map((c, i) => `<option value="${i}"${c.id === m.id ? ' selected' : ''}>${PROG.done[c.id] ? '✓ ' : ''}${c.chapter} — ${c.title}</option>`).join('');
  const hints = m.hints.slice(0, HINTS).map(h => `<li>${esc(h)}</li>`).join('');
  const hintBtn = HINTS >= m.hints.length ? '<button class="btn" disabled>No more hints</button>' : `<button id="hint" class="btn">Show hint · −${HINT_COST} XP</button>`;
  return `<select id="pick">${opts}</select>
    <div class="eyebrow">${esc(m.chapter)}${solved ? ' · <span class="done">solved</span>' : ''}</div>
    <h1>${esc(m.title)}</h1>
    <p class="story">${esc(m.story)}</p>
    <div class="label">Objective</div><p>${esc(m.objective)}</p>
    <div class="label">Hints</div><ol>${hints}</ol>
    <div class="row">${hintBtn}<button id="check" class="btn primary">Check</button></div>
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
    (d.acls || []).forEach((r, i) => { h += `<div class="rrow">${r.action === 'deny' ? 'DROP' : 'ALLOW'} ${r.proto || 'all'} in:${r.dev || 'any'}${r.src != null ? ' src:' + M.ipStr(r.src) : ''}${r.dport != null ? ' dpt:' + r.dport : ''} <button class="x" data-acl="${i}">✕</button></div>`; });
    const ifopts = Object.keys(d.ifaces).map(n => `<option>${n}</option>`).join('');
    h += `<div class="addrow"><select class="aif">${ifopts}</select><select class="aproto"><option value="">any</option><option>tcp</option><option>udp</option><option>icmp</option></select><input class="adport" placeholder="dport" size="4"/><input class="asrc" placeholder="src ip" size="8"/><select class="aact"><option value="deny">DROP</option><option value="allow">ALLOW</option></select><button class="btn sm" id="addacl">Add</button></div>`;
  }
  return h;
}

/* ---------- actions ---------- */
function refresh() { $('#topoWrap').innerHTML = renderTopo(); $('#config').innerHTML = renderConfig(); wireTopo(); wireConfig(); }
function reloadMission(i) { RUN = startMission(chapters[i]); SEL = RUN.mission.console; HINTS = 0; $('#brief').innerHTML = renderBrief(); wireBrief(); refresh(); updateHud(); termClear(); termEcho(`— ${RUN.mission.title} — you are on ${SEL}. Try: ping, ip addr, ip route`); }
function termEcho(s) { const o = $('#tout'); o.textContent += s + '\n'; o.scrollTop = o.scrollHeight; }
function termClear() { $('#tout').textContent = ''; }
function nextUnsolved() { const cur = chapters.findIndex(c => c.id === RUN.mission.id); for (let k = 1; k <= chapters.length; k++) { const i = (cur + k) % chapters.length; if (!PROG.done[chapters[i].id]) return i; } return -1; }
function doCheck() {
  const box = $('#status'); const done = RUN.done();
  if (done) {
    const id = RUN.mission.id; let msg = '✓ All objectives met — ticket resolved.';
    if (!PROG.done[id]) { const reward = Math.max(25, REWARD - HINT_COST * HINTS); PROG.done[id] = { xp: reward, hints: HINTS }; PROG.xp += reward; saveProg(); updateHud(); msg = `✓ Ticket resolved — <b>+${reward} XP</b>${HINTS ? ` (−${HINT_COST * HINTS} for hints)` : ''}.`; $('#brief').querySelector('.eyebrow').innerHTML += ' · <span class="done">solved</span>'; }
    const ni = nextUnsolved();
    box.className = 'ok'; box.innerHTML = msg + (ni >= 0 ? ' <button class="btn sm" id="next">Next ticket →</button>' : ' <b>All tickets cleared!</b>');
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
  $('#check').addEventListener('click', doCheck);
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
  const addacl = $('#addacl'); if (addacl) addacl.addEventListener('click', () => { const g = s => $('#config ' + s).value.trim(); const rule = { dir: 'in', dev: g('.aif') || undefined, action: g('.aact') }; if (g('.aproto')) rule.proto = g('.aproto'); if (g('.adport')) rule.dport = +g('.adport'); if (/^\d+\.\d+\.\d+\.\d+$/.test(g('.asrc'))) rule.src = M.ip(g('.asrc')); d.acls = d.acls || []; d.acls.push(rule); refresh(); });
  document.querySelectorAll('#config [data-acl]').forEach(b => b.addEventListener('click', () => { d.acls.splice(+b.dataset.acl, 1); refresh(); }));
}
function wireTerm() {
  $('#tin').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const line = e.target.value; e.target.value = ''; if (!line.trim()) return; termEcho(`${SEL}:~$ ${line}`); const r = RUN.cli.on(SEL).run(line); if (r.out) termEcho(r.out); refresh(); });
}

/* ---------- boot ---------- */
function boot() {
  applyTheme(PROG.theme);
  document.getElementById('app').innerHTML = `
    <header id="top">
      <div class="brand">Networking Trainer <span class="dim">· networking &amp; security fundamentals</span></div>
      <div class="hud"><span>XP <b id="xp">0</b></span><span>Rank <b id="rank">Cadet</b></span><span>Solved <b id="prog">0/0</b></span>
        <button id="btnSet" class="btn" title="Settings">⚙</button>
        <a class="xlink" href="../" title="Back to the Linux game">The Last Sysadmin ↗</a></div>
    </header>
    <div id="cols">
      <aside id="brief"></aside>
      <main><div id="topoWrap"></div><div id="term"><pre id="tout"></pre><div class="tline"><span>$</span><input id="tin" autocomplete="off" placeholder="type a command — ping, ip addr, ip route add…"/></div></div></main>
      <aside id="config"></aside>
    </div>`;
  wireTerm();
  $('#btnSet').addEventListener('click', openSettings);
  reloadMission(0);
}
if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
