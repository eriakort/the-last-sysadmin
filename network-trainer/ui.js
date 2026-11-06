// Networking Trainer — UI. Runs in the browser on top of the SAME tested modules
// (loaded via the require() shim the build injects). Topology + config panels +
// terminal + mission flow, now with saved progress, XP, ranks, a hints economy,
// themes, and settings — the sysadmin game's "feel".
const M = require('./net-model');
const { startMission } = require('./net-mission');
const { chapters } = require('./net-chapters');
const { makeCLI } = require('./net-cli');
const B = require('./net-builder');
const S = require('./net-scenario');
const NC = require('./net-classroom');

const REWARD = 100, HINT_COST = 25;
const RANKS = [[0, 'Cadet'], [120, 'Apprentice'], [280, 'Technician'], [460, 'Engineer'], [640, 'Senior Engineer'], [820, 'Network Architect']];
const THEMES = [['', 'Network Ops (cyan)'], ['halcyon', 'Halcyon Dark'], ['amber', 'Amber CRT'], ['green', 'Green Phosphor'], ['paper', 'Paper (light)']];

let RUN = null, SEL = null, HINTS = 0, PROG = loadProg();
let TSTART = 0, TICK = null, SOLVED_NOW = false;   // per-ticket timer
let DIAGNOSED = false;                              // diagnosis gate cleared?
let HIST = [], HISTI = -1;                         // terminal command history
let MODE = 'play';                                 // 'play' | 'build' (authoring)
let AUTHOR = null;                                 // { title, objective, ticket, hints, success:[] } while authoring
let WIRE = null;                                   // first endpoint picked while wiring a link
let SB = null, AUTHUSER = null, PLAYING_DBID = null; // cloud/classroom (shared Supabase project)
let LASTPOS = {}, DRAG = null;                     // last rendered node positions + active drag
// Builder controls show while authoring, or while a student plays a build-from-scratch scenario.
function canBuild() { return MODE === 'build' || !!(RUN && RUN.mission && RUN.mission.authored && RUN.mission.mode === 'build'); }
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- persistence ---------- */
function loadProg() { try { const p = JSON.parse(localStorage.getItem('nettrainer') || '{}'); return { done: p.done || {}, xp: p.xp || 0, theme: p.theme || '', journal: Array.isArray(p.journal) ? p.journal : [], tickets: p.tickets && typeof p.tickets === 'object' ? p.tickets : {} }; } catch (e) { return { done: {}, xp: 0, theme: '', journal: [], tickets: {} }; } }
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
function renderFlows() {
  const flows = (RUN && RUN.cli && RUN.cli.flows) || [];
  if (!flows.length) return '<div id="flows"><div class="fl-h">Flows</div><div class="fl-empty">No packets yet — ping or traceroute to capture evidence.</div></div>';
  const rows = flows.slice(0, 8).map(f => {
    const ok = f.ok ? 'ok' : 'bad';
    const proto = (f.proto || 'icmp').toUpperCase() + (f.dport ? ':' + f.dport : '');
    const path = (f.path || []).join(' → ');
    return `<div class="fl-row ${ok}"><span class="fl-proto">${proto}</span><span>${M.ipStr(f.src)} → ${M.ipStr(f.dst)}</span><span class="fl-path">${path}</span><span class="fl-st">${f.ok ? 'delivered' : 'dropped'}</span></div>`;
  }).join('');
  return `<div id="flows"><div class="fl-h">Flows <span class="dim">${flows.length}</span></div>${rows}</div>`;
}
function renderTopo() {
  const net = RUN.net;
  if (!Object.keys(net.devices).length) return '<div class="canvas-empty">Empty canvas — add a device from the <b>Build</b> panel on the right.</div>';
  const auto = layout(net);
  const pos = {};                                    // hand-placed position wins; otherwise auto-layout
  for (const id in net.devices) pos[id] = (net.pos && net.pos[id]) ? net.pos[id] : auto[id];
  LASTPOS = pos;
  const maxX = Math.max(...Object.values(pos).map(p => p[0])) + 100, maxY = Math.max(...Object.values(pos).map(p => p[1])) + 80;
  const cx = id => pos[id][0] + 24, cy = id => pos[id][1] + 18;
  let s = `<svg id="topo" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="network topology">`;
  for (const l of net.links) s += `<line data-a="${l.a[0]}" data-b="${l.b[0]}" x1="${cx(l.a[0])}" y1="${cy(l.a[0])}" x2="${cx(l.b[0])}" y2="${cy(l.b[0])}" class="edge${linkDown(net, l) ? ' down' : ''}"/>`;
  for (const id in net.devices) {
    const d = net.devices[id], [x, y] = pos[id], ip = primaryIp(d);
    const kindKey = d.kind === 'switch' ? 'switch' : d.kind === 'router' ? 'router' : d.kind === 'firewall' ? 'firewall' : ((d.services || /^(srv|web|db|dns|www|site)/.test(id)) ? 'server' : 'host');
    const ico = NODE_ICONS[kindKey] || NODE_ICONS.host;
    s += `<g class="node ${KINDCLASS[d.kind]||''} k-${kindKey} ${id === SEL ? 'sel' : ''}" data-dev="${id}" transform="translate(${x},${y})"><rect class="hit" x="-4" y="-4" width="56" height="70" rx="6" fill="transparent"/>${ico}<text x="24" y="48" text-anchor="middle" class="n-id">${id}</text><text x="24" y="60" text-anchor="middle" class="n-sub">${ip || d.kind}</text></g>`;
  }
  return s + '</svg>';
}

/* ---------- operations overview ---------- */
function dashboardSnapshot() {
  const devices = Object.entries((RUN && RUN.net && RUN.net.devices) || {}).map(([id, d]) => {
    const ports = Object.values(d.ifaces || {});
    const up = ports.filter(p => p.up !== false && p.errDisabled !== true).length;
    const down = ports.length - up;
    const status = !ports.length || up === 0 ? 'offline' : down ? 'degraded' : 'healthy';
    return { id, kind: d.kind || 'device', ip: primaryIp(d), status, up, total: ports.length };
  });
  const links = (RUN && RUN.net && RUN.net.links) || [];
  const tickets = allTickets();
  const priority = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const active = tickets.filter(t => t.status !== 'resolved').sort((a,b) => (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9));
  return {
    devices, linksUp: links.filter(l => !linkDown(RUN.net, l)).length, linksTotal: links.length,
    active, resolved: tickets.filter(t => t.status === 'resolved').length,
    flows: ((RUN && RUN.cli && RUN.cli.flows) || []).slice(0, 5),
    activity: (PROG.journal || []).slice(0, 6),
    solved: chapters.filter(c => PROG.done[c.id]).length, total: chapters.length
  };
}
function showWorkspaceView(view) {
  const overview = $('#overview'), cols = $('#cols');
  if (!overview || !cols) return;
  const isOverview = view === 'overview';
  overview.hidden = !isOverview;
  cols.hidden = isOverview;
  document.querySelectorAll('#navRail .nav-item[data-view]').forEach(b => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (!isOverview && view === 'workbench') setTimeout(() => $('#tin') && $('#tin').focus(), 0);
}
function renderOverview() {
  const root = $('#overview'); if (!root || !RUN) return;
  const d = dashboardSnapshot();
  const count = status => d.devices.filter(x => x.status === status).length;
  const priorityClass = p => 'tk-' + String(p || 'p3').toLowerCase();
  const deviceRows = d.devices.map(x => `<tr><td><b>${esc(x.id)}</b><small>${esc(x.kind)}</small></td><td class="mono">${esc(x.ip || 'No address')}</td><td><span class="health health-${x.status}"><i></i>${x.status}</span></td><td class="mono">${x.up}/${x.total}</td></tr>`).join('');
  const incidentRows = d.active.slice(0, 5).map(t => `<article class="overview-incident"><div class="oi-head"><b>${esc(t.id)}</b><span class="tk-pri ${priorityClass(t.priority)}">${esc(t.priority)}</span><span class="ticket-state state-${esc(t.status)}">${esc(t.status)}</span></div><strong>${esc(t.title)}</strong><p>${esc(t.symptom)}</p><div class="oi-foot"><span>${esc(t.service)}</span><button class="btn sm" data-overview-ticket="${esc(t.id)}">Investigate →</button></div></article>`).join('');
  const activityRows = d.activity.map(e => `<article class="overview-activity"><span class="activity-dot"></span><div><b>${esc(e.type || 'Activity')}</b><p>${esc([e.ticket,e.device,e.text].filter(Boolean).join(' · ') || e.command || 'Recorded in engineering journal')}</p><time>${esc(new Date(e.at).toLocaleString())}</time></div></article>`).join('');
  const flowRows = d.flows.map(f => `<div class="overview-flow ${f.ok ? 'flow-ok' : 'flow-bad'}"><b>${esc((f.proto || 'icmp').toUpperCase())}</b><span>${esc(M.ipStr(f.src))} → ${esc(M.ipStr(f.dst))}</span><strong>${f.ok ? 'Delivered' : 'Dropped'}</strong></div>`).join('');
  root.innerHTML = `
    <div class="overview-heading"><div><div class="eyebrow">Network operations · training lab</div><h1>Operations overview</h1><p>Start your shift here. Review the simulated network, take ownership of incidents and continue hands-on work.</p></div><div class="overview-live"><i></i> SIMULATION DATA · LIVE</div></div>
    <div class="overview-actions"><button class="btn primary" id="overviewWorkbench">⌘ Open workbench</button><button class="btn" id="overviewIncidents">◈ Incident queue <span class="overview-count">${d.active.length}</span></button><button class="btn" id="overviewHelp">? Command help</button><button class="btn" id="overviewJournal">▧ Work journal</button></div>
    <section class="overview-metrics" aria-label="Network summary">
      <article class="overview-metric"><span>Devices healthy</span><strong>${count('healthy')}<small> / ${d.devices.length}</small></strong><em>${count('degraded')} degraded · ${count('offline')} offline</em></article>
      <article class="overview-metric"><span>Links operational</span><strong>${d.linksUp}<small> / ${d.linksTotal}</small></strong><em>${d.linksTotal - d.linksUp} links down</em></article>
      <article class="overview-metric metric-alert"><span>Open incidents</span><strong>${d.active.length}</strong><em>${d.active.filter(t => t.priority === 'P1' || t.priority === 'P2').length} priority 1–2</em></article>
      <article class="overview-metric"><span>Resolved tickets</span><strong>${d.resolved}<small> / ${d.total}</small></strong><em>${PROG.xp} XP · ${esc(rankFor(PROG.xp))}</em></article>
    </section>
    <div class="overview-grid">
      <section class="overview-panel inventory-panel"><div class="overview-panel-head"><div><span class="eyebrow">Current lab topology</span><h2>Device health</h2></div><button class="text-action" id="healthWorkbench">Inspect topology →</button></div>
        <div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Device</th><th>Primary IP</th><th>Status</th><th>Ports up</th></tr></thead><tbody>${deviceRows || '<tr><td colspan="4">No devices in this scenario.</td></tr>'}</tbody></table></div>
        <p class="overview-footnote">Health is calculated from the active simulator scenario and interface/link state. It is not external monitoring.</p>
      </section>
      <section class="overview-panel incident-panel"><div class="overview-panel-head"><div><span class="eyebrow">Service desk</span><h2>Active incidents <span class="panel-count">${d.active.length}</span></h2></div><button class="text-action" id="allIncidents">View queue →</button></div>
        <div class="overview-incident-list">${incidentRows || '<div class="overview-empty">No open incidents. The queue is clear.</div>'}</div>
      </section>
      <section class="overview-panel traffic-panel"><div class="overview-panel-head"><div><span class="eyebrow">Simulator evidence</span><h2>Recent traffic</h2></div><button class="text-action" id="trafficWorkbench">Open console →</button></div>
        <div class="overview-flow-list">${flowRows || '<div class="overview-empty">No traffic captured yet. Run ping or traceroute in the Workbench to create evidence.</div>'}</div>
      </section>
      <section class="overview-panel activity-panel"><div class="overview-panel-head"><div><span class="eyebrow">Engineering records</span><h2>Recent activity</h2></div><button class="text-action" id="allJournal">Open journal →</button></div>
        <div class="overview-activity-list">${activityRows || '<div class="overview-empty">No activity recorded yet. Commands, ticket actions and notes will appear here.</div>'}</div>
      </section>
      <section class="overview-panel progress-panel"><div class="overview-panel-head"><div><span class="eyebrow">Skills progression</span><h2>Shift progress</h2></div><button class="text-action" id="progressStats">View stats →</button></div>
        <div class="progress-number"><strong>${d.solved}</strong><span>of ${d.total} training tickets resolved</span></div><div class="progress-track"><i style="width:${d.total ? Math.round(d.solved / d.total * 100) : 0}%"></i></div>
        <p class="overview-footnote">Progress supports learning; operational work remains the focus.</p>
      </section>
    </div>`;
  const click = (id, fn) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
  ['overviewWorkbench','healthWorkbench','trafficWorkbench'].forEach(id => click(id, () => showWorkspaceView('workbench')));
  ['overviewIncidents','allIncidents'].forEach(id => click(id, openTicketQueue));
  ['overviewHelp'].forEach(id => click(id, openHelp));
  ['overviewJournal','allJournal'].forEach(id => click(id, openJournal));
  click('progressStats', openStats);
  root.querySelectorAll('[data-overview-ticket]').forEach(btn => btn.addEventListener('click', () => {
    const t = d.active.find(x => x.id === btn.dataset.overviewTicket); if (!t) return;
    setTicketState(t.id, 'investigating', 'You'); showWorkspaceView('workbench'); reloadMission(t.index);
    addJournalEntry({ type: 'investigation started', ticket: t.id, text: 'Started investigation from the Operations Overview.' });
  }));
}
function refreshOverview() { if ($('#overview') && !$('#overview').hidden) renderOverview(); }

/* ---------- panels ---------- */
function updateHud() { const q = $('#queueOpenCount'); if (q) q.textContent = allTickets().filter(t => t.status !== 'resolved').length; $('#xp').textContent = PROG.xp; $('#rank').textContent = rankFor(PROG.xp); const n = chapters.filter(c => PROG.done[c.id]).length; $('#prog').textContent = `${n}/${chapters.length}`; refreshOverview(); }
/* ---------- service desk / ticket workflow ---------- */
const TICKET_STATES = ['new', 'acknowledged', 'investigating', 'resolved'];
const SLA_TARGET = { P1: '1 hour', P2: '4 hours', P3: '1 business day', P4: '3 business days' };
function ticketRecord(m, index) {
  const t = m.ticket || {};
  const id = t.id || ('NET-' + String(index + 1).padStart(4, '0'));
  const state = PROG.tickets[id] || {};
  const resolved = !!PROG.done[m.id];
  return {
    id, missionId: m.id, index, title: m.title, chapter: m.chapter,
    priority: t.priority || 'P3', from: t.from || 'Network Operations',
    symptom: t.symptom || m.objective, status: resolved ? 'resolved' : (state.status || 'new'),
    impact: t.impact || (t.priority === 'P1' ? 'Multiple users / critical service' : 'Single user or team'),
    service: t.service || (m.title.match(/DNS|DHCP|VLAN|routing|firewall|internet|server/i) || ['Network connectivity'])[0],
    assigned: state.assigned || 'Unassigned', updatedAt: state.updatedAt || null,
    sla: SLA_TARGET[t.priority] || SLA_TARGET.P3
  };
}
function allTickets() { return chapters.map((m, i) => ticketRecord(m, i)); }
function setTicketState(id, status, assigned) {
  if (!TICKET_STATES.includes(status)) return;
  PROG.tickets = PROG.tickets || {};
  PROG.tickets[id] = { ...(PROG.tickets[id] || {}), status, assigned: assigned || (status === 'new' ? 'Unassigned' : 'You'), updatedAt: new Date().toISOString() };
  saveProg(); refreshOverview();
}
function openTicketQueue() {
  const tickets = allTickets();
  const counts = TICKET_STATES.reduce((o, st) => (o[st] = tickets.filter(t => t.status === st).length, o), {});
  const rows = tickets.map(t => `<article class="queue-ticket" data-ticket="${esc(t.id)}">
    <div class="qt-main"><div class="qt-top"><b>${esc(t.id)}</b><span class="tk-pri tk-${esc(t.priority.toLowerCase())}">${esc(t.priority)}</span><span class="ticket-state state-${esc(t.status)}">${esc(t.status)}</span></div>
    <h3>${esc(t.title)}</h3><p>${esc(t.symptom)}</p><div class="qt-meta"><span>◈ ${esc(t.service)}</span><span>Impact: ${esc(t.impact)}</span><span>SLA target: ${esc(t.sla)}</span><span>Assigned: ${esc(t.assigned)}</span></div></div>
    <div class="qt-actions">${t.status === 'new' ? `<button class="btn sm primary" data-ack="${esc(t.id)}">Acknowledge</button>` : ''}
    ${t.status !== 'resolved' ? `<button class="btn sm" data-work="${esc(t.id)}">${t.status === 'investigating' ? 'Continue work' : 'Investigate'}</button>` : `<button class="btn sm" data-review="${esc(t.id)}">Review</button>`}</div>
  </article>`).join('');
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet sheet-wide ticket-desk"><div class="modal-head"><div><div class="eyebrow">Service desk · shift ${new Date().toLocaleDateString()}</div><h2>Incident queue</h2><p class="dim">Prioritize the impact, acknowledge ownership, investigate with evidence and resolve only after verification.</p></div><span class="help-key">NOC / L1</span></div>
  <div class="queue-metrics"><div><b>${counts.new}</b><span>New</span></div><div><b>${counts.acknowledged}</b><span>Acknowledged</span></div><div><b>${counts.investigating}</b><span>In progress</span></div><div><b>${counts.resolved}</b><span>Resolved</span></div></div>
  <div class="queue-toolbar"><label for="queueFilter">Filter tickets</label><select id="queueFilter"><option value="all">All tickets</option><option value="open">Open tickets</option><option value="new">New</option><option value="acknowledged">Acknowledged</option><option value="investigating">In progress</option><option value="resolved">Resolved</option></select><span class="dim">${tickets.length} incidents in this training shift</span></div>
  <div class="queue-list" id="queueList">${rows || '<p class="dim">No tickets in the queue.</p>'}</div>
  <div class="help-note"><b>Shift discipline:</b> Acknowledge first. Read the symptom and impact. Gather evidence before changing configuration. Verify the affected service, then add a resolution note to your work journal.</div>
  <div class="row"><button class="btn" id="closeS">Close queue</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.querySelector('#closeS').addEventListener('click', () => wrap.remove());
  const filter = () => { const value = wrap.querySelector('#queueFilter').value; wrap.querySelectorAll('.queue-ticket').forEach(row => { const t = tickets.find(x => x.id === row.dataset.ticket); row.hidden = value === 'open' ? t.status === 'resolved' : value !== 'all' && t.status !== value; }); };
  wrap.querySelector('#queueFilter').addEventListener('change', filter);
  wrap.querySelectorAll('[data-ack]').forEach(btn => btn.addEventListener('click', () => {
    const t = tickets.find(x => x.id === btn.dataset.ack); setTicketState(t.id, 'acknowledged', 'You');
    addJournalEntry({ type: 'ticket acknowledged', ticket: t.id, text: 'Accepted ownership. Reviewing impact and beginning triage.' });
    wrap.remove(); openTicketQueue();
  }));
  wrap.querySelectorAll('[data-work],[data-review]').forEach(btn => btn.addEventListener('click', () => {
    const t = tickets.find(x => x.id === (btn.dataset.work || btn.dataset.review));
    if (t.status !== 'resolved') setTicketState(t.id, 'investigating', 'You');
    closeModal(); MODE = 'play'; reloadMission(t.index);
    if (t.status !== 'resolved') addJournalEntry({ type: 'investigation started', ticket: t.id, text: 'Started investigation from the incident queue.' });
  }));
}
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
function renderReview(m) {
  const r = m.review;
  const sel = RUN.selectedFindings || new Set();
  const rows = r.findings.map(f => `<label class="rev-row"><input type="checkbox" data-fid="${esc(f.id)}"${sel.has(f.id)?' checked':''}> ${esc(f.text)}</label>`).join('');
  return `<div class="label">Design review — check every real problem</div>
    <p class="dim">Inspect the topology and the terminal. Check the statements that are true faults. Leave the distractors unchecked.</p>
    <div class="rev-list">${rows}</div>`;
}
function renderFaults(m) {
  const sel = RUN.foundFaults || new Set();
  const rows = m.faults.map(f => `<label class="rev-row"><input type="checkbox" data-fault="${esc(f.id)}"${sel.has(f.id)?' checked':''}> ${esc(f.text)}</label>`).join('');
  return `<div class="label">Localize — check every real fault</div>
    <p class="dim">This ticket has more than one problem. Investigate, then check each real fault. Fix them all before Check.</p>
    <div class="rev-list">${rows}</div>`;
}
function renderBrief() {
  const m = RUN.mission, solved = !!PROG.done[m.id];
  const opts = chapters.map((c, i) => `<option value="${i}"${c.id === m.id ? ' selected' : ''}>${PROG.done[c.id] ? '✓ ' : ''}${c.chapter} — ${c.title}</option>`).join('');
  const hints = m.hints.slice(0, HINTS).map(h => `<li>${esc(h)}</li>`).join('');
  const hintBtn = HINTS >= m.hints.length ? '<button class="btn" disabled>No more hints</button>' : `<button id="hint" class="btn">Show hint · −${HINT_COST} XP</button>`;
  const gated = RUN.requiresDiagnosis && !DIAGNOSED;
  const review = m.review ? renderReview(m) : '';
  const faults = m.faults ? renderFaults(m) : '';
  const body = gated
    ? renderDiagnose(m)
    : `${m.diagnose ? `<div class="diag-done">✓ Diagnosed — ${esc(m.diagnose.because)}</div>` : ''}
    ${review}
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
  const pal = renderPalette();
  if (!SEL || !RUN.net.devices[SEL]) return pal + '<p class="dim">Click a device to configure it.</p>';
  const d = RUN.net.devices[SEL];
  let h = pal + `<div class="label">${SEL} · ${d.kind}</div>`;
  if (d.kind !== 'switch') {
    h += `<div class="label2">Reachability</div>
      <div class="addrow"><input class="pingto" placeholder="host or ip" size="14"/><button class="btn sm" id="doping">Ping</button><button class="btn sm" id="dotrace">Traceroute</button></div>
      <div id="pingout" class="dim" style="margin:4px 0 8px;white-space:pre-wrap"></div>`;
  }
  if (d.kind === 'switch') {
    const vlans = [...new Set([1, ...(d.vlans || [])])].sort((a,b)=>a-b);
    h += `<div class="label2">VLAN database</div><div class="dim">${vlans.map(v=>'VLAN '+v).join(' · ')}</div><div class="label2">Switch ports</div>`;
    for (const n in d.ifaces) {
      const f = d.ifaces[n], mode = f.mode === 'trunk' ? 'trunk' : 'access';
      h += `<div class="rrow">${n} · ${mode} · ${mode === 'trunk' ? 'native '+Number(f.nativeVlan ?? 1)+' · allowed '+(Array.isArray(f.allowedVlans)?f.allowedVlans.join(','):'all') : 'VLAN '+Number(f.accessVlan ?? f.vlan ?? 1)} · ${f.up === false ? 'DOWN' : 'UP'}</div>`;
    }
    const activeVlan = Object.values(d.ifaces).map(p => p.mode === 'trunk' ? (Array.isArray(p.allowedVlans) ? p.allowedVlans[0] : Number(p.nativeVlan ?? 1)) : Number(p.accessVlan ?? p.vlan ?? 1)).find(v => v !== 1) || vlans.find(v => v !== 1) || 1, tree = M.spanningTree(RUN.net, activeVlan), st = tree.switches[SEL];
    const blocked = st ? Object.entries(st.ports).filter(([,p]) => p.state === 'blocking').map(([port]) => port) : [];
    h += `<div class="label2">Spanning Tree · VLAN ${activeVlan}</div><div class="dim">Root bridge: ${esc(st ? st.root : '—')} · Priority: ${st ? st.priority : '—'}<br>Blocked ports: ${blocked.length ? blocked.join(', ') : 'none'}</div>`;
    const learned = M.switchMacTable(RUN.net, SEL, activeVlan);
    h += '<div class="label2">Learned MAC addresses</div>' + (learned.length
      ? learned.slice(0,8).map(e => `<div class="rrow">${esc(e.mac)} · ${esc(e.device)} · ${esc(e.port)} · VLAN ${e.vlan}</div>`).join('')
      : '<div class="dim">(no learned MAC addresses)</div>');
    h += '<p class="dim pal-hint">Configure: vlan 10 · interface p1 · switchport access vlan 10 · spanning-tree vlan 10 priority 4096 · show spanning-tree · show mac address-table dynamic</p>';
  } else {
    h += `<div class="label2">Interfaces</div>`;
    for (const n in d.ifaces) {
      const f = d.ifaces[n];
      h += `<div class="ifrow" data-if="${n}"><span class="ifn">${n}</span><input class="ip" value="${f.ip != null ? M.ipStr(f.ip) : ''}" placeholder="address"/><span>/</span><input class="pfx" value="${f.mask != null ? f.mask : ''}" placeholder="24" size="2"/><label class="up"><input type="checkbox" class="upc"${f.up !== false ? ' checked' : ''}/>up</label></div>`;
    }
  }
  if (d.kind !== 'switch') {
    h += '<div class="label2">Routes</div>';
    (d.routes || []).forEach((r, i) => { const dest = r.mask === 0 ? 'default' : M.ipStr(r.dest) + '/' + r.mask; h += `<div class="rrow">${dest} via ${M.ipStr(r.via)} <button class="x" data-rt="${i}">✕</button></div>`; });
    h += `<div class="addrow"><input class="rdest" placeholder="default or 10.0.3.0/24"/><input class="rvia" placeholder="via gateway"/><button class="btn sm" id="addrt">Add route</button></div>`;
  }
  if (d.kind === 'router') {
    const ospfIfs = Object.entries(d.ifaces).filter(([,f]) => f.ospf != null).map(([n,f]) => `${n} area ${f.ospf}`).join(', ') || '(none)';
    const ons = (typeof M.ospfNeighbors === 'function') ? M.ospfNeighbors(RUN.net, SEL) : [];
    const ost = ons.map(n => `${n.id} ${M.ipStr(n.ip)} area ${n.area}`).join(' · ') || 'no neighbors';
    const ifopts = Object.keys(d.ifaces).map(n => `<option>${n}</option>`).join('');
    h += `<div class="label2">OSPF</div>
      <div class="dim" style="margin-bottom:6px">Enabled: ${esc(ospfIfs)}<br>Neighbors: ${esc(ost)}</div>
      <div class="addrow"><select class="oif">${ifopts}</select><input class="oarea" placeholder="area" value="0" size="4"/><button class="btn sm" id="ospfen">Enable</button></div>`;
    const b = d.bgp || { asn: '', neighbors: [], networks: [] };
    const neigh = (b.neighbors || []).map(n => `${M.ipStr(n.ip)} AS${n.remoteAs}`).join(', ') || '(none)';
    const nets = (b.networks || []).join(', ') || '(none)';
    const sess = (typeof M.bgpSessions === 'function') ? M.bgpSessions(RUN.net, SEL) : [];
    const st = sess.map(s => `${M.ipStr(s.ip)} ${s.up ? 'Established' : s.reason}`).join(' · ') || 'no session';
    h += `<div class="label2">BGP</div>
      <div class="dim" style="margin-bottom:6px">Neighbors: ${esc(neigh)}<br>Networks: ${esc(nets)}<br>Session: ${esc(st)}</div>
      <div class="addrow"><input class="basn" placeholder="local ASN" value="${b.asn != null ? b.asn : ''}" size="6"/><button class="btn sm" id="bgpasn">Set ASN</button></div>
      <div class="addrow"><input class="bnip" placeholder="neighbor ip" size="10"/><input class="bnas" placeholder="remote AS" size="6"/><button class="btn sm" id="bgpnei">Add neighbor</button></div>
      <div class="addrow"><input class="bnet" placeholder="10.0.8.0/24" size="12"/><button class="btn sm" id="bgpnet">Advertise</button></div>`;
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
function refreshFlows() { const fw = $('#flows'); if (fw) fw.outerHTML = renderFlows(); }
function refresh() { $('#topoWrap').innerHTML = renderTopo(); refreshFlows(); $('#config').innerHTML = renderConfig(); wireTopo(); wireConfig(); const target = $('#termTarget'); if (target) target.textContent = SEL || 'NO DEVICE'; refreshOverview(); }
function runMission(m, solvedKey) { showWorkspaceView('workbench'); RUN = startMission(m); SEL = RUN.mission.console; HINTS = 0; SOLVED_NOW = false; DIAGNOSED = !RUN.requiresDiagnosis || !!(solvedKey && PROG.done[solvedKey]); HIST = []; HISTI = -1; startTimer(); $('#brief').innerHTML = renderBrief(); wireBrief(); refresh(); updateHud(); termClear(); termEcho(`— ${RUN.mission.title} — you are on ${SEL || '(pick or add a device)'}. Try: ping, traceroute, ip addr, nmap`); }
function reloadMission(i) { MODE = 'play'; PLAYING_DBID = null; showWorkspaceView('workbench'); runMission(chapters[i], chapters[i].id); }
function startTimer() { if (TICK) clearInterval(TICK); TSTART = Date.now(); const t = $('#time'); if (t) t.textContent = '0:00'; TICK = setInterval(() => { const el = $('#time'); if (el && !SOLVED_NOW) el.textContent = fmtTime(Date.now() - TSTART); }, 1000); }
function stopTimer() { if (TICK) { clearInterval(TICK); TICK = null; } }
function termEcho(s) { const o = $('#tout'); o.textContent += s + '\n'; o.scrollTop = o.scrollHeight; }
function termClear() { $('#tout').textContent = ''; }
function nextUnsolved() { const cur = chapters.findIndex(c => c.id === RUN.mission.id); for (let k = 1; k <= chapters.length; k++) { const i = (cur + k) % chapters.length; if (!PROG.done[chapters[i].id]) return i; } return -1; }
function doCheck() {
  const box = $('#status'); const done = RUN.done();
  if (RUN.mission.authored) {                         // authored scenario: no XP / progress, just pass/fail
    box.className = done ? 'ok' : 'bad';
    box.innerHTML = done ? '✓ Scenario complete — the network meets every objective.'
      : 'Not there yet:<ul>' + RUN.results().filter(r => !r.ok).map(r => `<li>${esc(r.reason)}</li>`).join('') + '</ul>';
    if (done && AUTHUSER && PLAYING_DBID) {           // an assigned scenario: record the attempt for the teacher
      const dbid = PLAYING_DBID, ms = Date.now() - TSTART;
      getSB().then(sb => { if (sb) NC.recordAttempt(sb, AUTHUSER.id, dbid, { passed: true, ms, hints: HINTS }); });
      box.innerHTML += ' <span class="dim">· attempt recorded</span>';
    }
    return;
  }
  if (done) {
    const id = RUN.mission.id, ms = Date.now() - TSTART;
    if (!SOLVED_NOW) { SOLVED_NOW = true; stopTimer(); }
    const ticketId = RUN.mission.ticket && RUN.mission.ticket.id; if (ticketId) setTicketState(ticketId, 'resolved', 'You');
    let msg = '✓ All objectives met — ticket resolved.';
    if (!PROG.done[id]) {
      const reward = Math.max(25, REWARD - HINT_COST * HINTS);
      PROG.done[id] = { xp: reward, hints: HINTS, ms }; PROG.xp += reward; saveProg(); updateHud();
      addJournalEntry({ type: 'ticket resolved', device: SEL || '', text: `Resolved ${RUN.mission.ticket && RUN.mission.ticket.id || RUN.mission.id} in ${fmtTime(ms)}. Earned ${reward} XP.` });
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
// Map a client (screen) point into the topology SVG's own coordinate space,
// accounting for the viewBox scaling that fits the canvas to its column.
function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
  const m = svg.getScreenCTM(); if (!m) return [clientX, clientY];
  const p = pt.matrixTransform(m.inverse()); return [p.x, p.y];
}
const nodePos = id => (RUN.net.pos && RUN.net.pos[id]) || LASTPOS[id] || [90, 50];
function setPos(id, x, y) { RUN.net.pos = RUN.net.pos || {}; RUN.net.pos[id] = [Math.max(4, x), Math.max(4, y)]; }

function wireTopo() {
  document.querySelectorAll('#topo .node').forEach(n => {
    n.addEventListener('pointerdown', e => {
      const id = n.dataset.dev;
      if (WIRE) {                                      // wiring: connect the armed device to this one
        if (WIRE !== id) { try { B.addLink(RUN.net, WIRE, id); } catch (err) { flashStatus(err.message); } }
        WIRE = null; refresh(); return;
      }
      e.preventDefault();
      const svg = $('#topo'); const [px, py] = svgPoint(svg, e.clientX, e.clientY);
      const cur = nodePos(id);
      DRAG = { id, offX: px - cur[0], offY: py - cur[1], moved: false };
      try { n.setPointerCapture(e.pointerId); } catch (_) {}
    });
  });
}
function onDragMove(e) {
  if (!DRAG) return;
  const svg = $('#topo'); if (!svg) return;
  const [px, py] = svgPoint(svg, e.clientX, e.clientY);
  const nx = px - DRAG.offX, ny = py - DRAG.offY;
  const prev = nodePos(DRAG.id);
  if (!DRAG.moved && Math.hypot(nx - prev[0], ny - prev[1]) > 3) DRAG.moved = true;
  setPos(DRAG.id, nx, ny);
  const p = nodePos(DRAG.id), cx = p[0] + 24, cy = p[1] + 18;         // live DOM update: node + its links
  const g = document.querySelector(`#topo .node[data-dev="${DRAG.id}"]`);
  if (g) g.setAttribute('transform', `translate(${p[0]},${p[1]})`);
  document.querySelectorAll(`#topo line[data-a="${DRAG.id}"]`).forEach(l => { l.setAttribute('x1', cx); l.setAttribute('y1', cy); });
  document.querySelectorAll(`#topo line[data-b="${DRAG.id}"]`).forEach(l => { l.setAttribute('x2', cx); l.setAttribute('y2', cy); });
}
function onDragUp() {
  if (!DRAG) return;
  const d = DRAG; DRAG = null;
  if (!d.moved) { SEL = d.id; refresh(); }            // a click, not a drag: select the device
  else refresh();                                     // settle: re-render cleanly from the new positions
}
function autoArrange() { if (RUN && RUN.net) { delete RUN.net.pos; refresh(); } }
function flashStatus(msg) { const b = $('#status'); if (b) { b.className = 'bad'; b.textContent = msg; } }
function wireBrief() {
  if (MODE === 'build') {                              // authoring panel
    renderCheckArgs();
    $('#chkType').addEventListener('change', renderCheckArgs);
    $('#addChk').addEventListener('click', addCheckFromForm);
    document.querySelectorAll('#brief [data-delchk]').forEach(b => b.addEventListener('click', () => { AUTHOR.success.splice(+b.dataset.delchk, 1); $('#brief').innerHTML = renderAuthor(); wireBrief(); }));
    $('#aTitle').addEventListener('input', e => { AUTHOR.title = e.target.value; });
    $('#aObj').addEventListener('input', e => { AUTHOR.objective = e.target.value; });
    $('#exportScn').addEventListener('click', exportScenario);
    $('#importScn').addEventListener('change', e => { if (e.target.files[0]) importScenario(e.target.files[0]); });
    $('#playScn').addEventListener('click', playAuthored);
    $('#exitBuild').addEventListener('click', exitBuild);
    const sl = $('#saveLib'); if (sl) sl.addEventListener('click', saveToLibrary);
    return;
  }
  document.querySelectorAll('#brief [data-fault]').forEach(cb => cb.addEventListener('change', () => {
    RUN.toggleFault(cb.dataset.fault);
  }));
  document.querySelectorAll('#brief [data-fid]').forEach(cb => cb.addEventListener('change', () => {
    RUN.toggleFinding(cb.dataset.fid);
  }));
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
  document.querySelectorAll('#config .pal[data-add]').forEach(b => b.addEventListener('click', () => {
    const id = B.addDevice(RUN.net, b.dataset.add); SEL = id; WIRE = null; refresh();
  }));
  const wb = $('#wireBtn'); if (wb) wb.addEventListener('click', () => {
    if (WIRE) { WIRE = null; } else if (SEL) { WIRE = SEL; } else { flashStatus('Select a device first, then Wire.'); }
    refresh();
  });
  const dd = $('#delDev'); if (dd) dd.addEventListener('click', () => { if (SEL) { B.removeDevice(RUN.net, SEL); SEL = null; WIRE = null; refresh(); } });
  const ab = $('#arrangeBtn'); if (ab) ab.addEventListener('click', autoArrange);
  function runProbe(cmd) {
    const to = ($('#config .pingto')||{}).value?.trim();
    const out = $('#pingout');
    if (!to) { if (out) out.textContent = 'Enter a host or IP.'; return; }
    const r = RUN.cli.on(SEL).run(cmd + ' ' + to);
    if (out) { out.textContent = r.out || ''; out.style.color = r.code === 0 ? 'var(--good)' : 'var(--bad)'; }
    refreshFlows();
  }
  const pingBtn = $('#doping');
  if (pingBtn) pingBtn.addEventListener('click', () => runProbe('ping'));
  const traceBtn = $('#dotrace');
  if (traceBtn) traceBtn.addEventListener('click', () => runProbe('traceroute'));
  const oBtn = $('#ospfen');
  if (oBtn) oBtn.addEventListener('click', () => {
    const d = RUN.net.devices[SEL];
    const ifn = $('#config .oif').value, area = $('#config .oarea').value;
    if (!ifn || !d.ifaces[ifn]) return;
    d.ifaces[ifn].ospf = Number(area);
    refresh();
  });
  const bAsn = $('#bgpasn');
  if (bAsn) bAsn.addEventListener('click', () => {
    const d = RUN.net.devices[SEL]; d.bgp = d.bgp || { asn: null, neighbors: [], networks: [] };
    d.bgp.asn = Number($('#config .basn').value);
    refresh();
  });
  const bNei = $('#bgpnei');
  if (bNei) bNei.addEventListener('click', () => {
    const d = RUN.net.devices[SEL]; d.bgp = d.bgp || { asn: null, neighbors: [], networks: [] };
    const ip = $('#config .bnip').value.trim(), as = $('#config .bnas').value.trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !as) return;
    const n = M.ip(ip);
    d.bgp.neighbors = (d.bgp.neighbors || []).filter(x => x.ip !== n).concat([{ ip: n, remoteAs: Number(as) }]);
    refresh();
  });
  const bNet = $('#bgpnet');
  if (bNet) bNet.addEventListener('click', () => {
    const d = RUN.net.devices[SEL]; d.bgp = d.bgp || { asn: null, neighbors: [], networks: [] };
    const c = $('#config .bnet').value.trim();
    if (!c) return;
    if (!(d.bgp.networks || []).includes(c)) d.bgp.networks.push(c);
    refresh();
  });
  if (!SEL) return; const d = RUN.net.devices[SEL];
  document.querySelectorAll('#config .ifrow').forEach(row => {
    const n = row.dataset.if;
    const apply = () => {
      const ipv = row.querySelector('.ip').value.trim(), pfx = row.querySelector('.pfx').value.trim();
      d.ifaces[n].up = row.querySelector('.upc').checked;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv) && pfx) { d.ifaces[n].ip = M.ip(ipv); d.ifaces[n].mask = +pfx; refresh(); }
      else if (!ipv) { delete d.ifaces[n].ip; delete d.ifaces[n].mask; refresh(); }
      // partial entry (address without a prefix yet): keep what's typed, don't re-render and wipe it
    };
    row.querySelector('.ip').addEventListener('change', apply); row.querySelector('.pfx').addEventListener('change', apply); row.querySelector('.upc').addEventListener('change', apply);
  });
  const addrt = $('#addrt'); if (addrt) addrt.addEventListener('click', () => { const dest = $('#config .rdest').value.trim(), via = $('#config .rvia').value.trim(); if (!/^\d+\.\d+\.\d+\.\d+$/.test(via)) return; d.routes = d.routes || []; if (dest === 'default' || dest === '') d.routes.push({ dest: 0, mask: 0, via: M.ip(via) }); else { const c = M.cidr(dest); d.routes.push({ dest: c.net, mask: c.prefix, via: M.ip(via) }); } refresh(); });
  document.querySelectorAll('#config [data-rt]').forEach(b => b.addEventListener('click', () => { d.routes.splice(+b.dataset.rt, 1); refresh(); }));
  const addacl = $('#addacl'); if (addacl) addacl.addEventListener('click', () => { const g = s => $('#config ' + s).value.trim(); const rule = { dir: 'in', dev: g('.aif') || undefined, action: g('.aact') }; if (g('.aproto')) rule.proto = g('.aproto'); if (g('.adport')) rule.dport = +g('.adport'); if (/^\d+\.\d+\.\d+\.\d+$/.test(g('.asrc'))) rule.src = M.ip(g('.asrc')); const dv = g('.adst'); if (dv.includes('/')) rule.dstnet = M.cidr(dv); else if (/^\d+\.\d+\.\d+\.\d+$/.test(dv)) rule.dst = M.ip(dv); d.acls = d.acls || []; d.acls.push(rule); refresh(); });
  document.querySelectorAll('#config [data-acl]').forEach(b => b.addEventListener('click', () => { d.acls.splice(+b.dataset.acl, 1); refresh(); }));
}
function addJournalEntry(entry) {
  PROG.journal = Array.isArray(PROG.journal) ? PROG.journal : [];
  PROG.journal.unshift({ at: new Date().toISOString(), ticket: RUN && RUN.mission ? RUN.mission.ticket && RUN.mission.ticket.id : '', mission: RUN && RUN.mission ? RUN.mission.title : '', ...entry });
  PROG.journal = PROG.journal.slice(0, 250); saveProg(); refreshOverview();
}
function openJournal() {
  const rows = (PROG.journal || []).map(e => `<article class="journal-entry"><div class="journal-meta"><b>${esc(e.type || 'activity')}</b>${e.result ? `<span class="journal-result ${esc(e.result)}">${esc(e.result)}</span>` : ''}<time>${esc(new Date(e.at).toLocaleString())}</time></div><div class="journal-context">${esc([e.ticket, e.mission, e.device].filter(Boolean).join(' · '))}</div>${e.command ? `<code class="journal-command">${esc(e.command)}</code>` : ''}${e.text ? `<p>${esc(e.text)}</p>` : ''}${e.output ? `<pre>${esc(e.output)}</pre>` : ''}</article>`).join('');
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet sheet-wide"><div class="modal-head"><div><div class="eyebrow">Personal engineering record</div><h2>Work journal</h2><p class="dim">Your commands, investigation notes and ticket outcomes stay in this browser.</p></div><button class="btn" id="exportJournal">Export</button></div><div class="journal-compose"><label for="journalNote">Add an investigation note</label><textarea id="journalNote" class="wide" rows="3" placeholder="What did you observe? What did you rule out? What would you check next time?"></textarea><div class="row"><button class="btn primary" id="saveJournalNote">Save note</button></div></div><div class="journal-list">${rows || '<p class="dim">No activity recorded yet. Run commands or add a note to start your work journal.</p>'}</div><div class="row"><button class="btn" id="closeS">Close</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.querySelector('#closeS').addEventListener('click', () => wrap.remove());
  wrap.querySelector('#saveJournalNote').addEventListener('click', () => { const note = wrap.querySelector('#journalNote').value.trim(); if (!note) return; addJournalEntry({ type: 'engineer note', device: SEL || '', text: note }); wrap.remove(); openJournal(); });
  wrap.querySelector('#exportJournal').addEventListener('click', () => {
    const lines = ['# Network engineering work journal', '', ...(PROG.journal || []).slice().reverse().map(e => `## ${e.type || 'Activity'} — ${new Date(e.at).toLocaleString()}\n${[e.ticket, e.mission, e.device].filter(Boolean).join(' · ')}\n${e.command ? `\n\`${e.command}\`\n` : ''}${e.text || ''}${e.output ? `\n\n\`\`\`text\n${e.output}\n\`\`\`` : ''}`)];
    const blob = new Blob([lines.join('\n\n')], { type: 'text/markdown;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'network-work-journal.md'; a.click(); URL.revokeObjectURL(url);
  });
}
function openHelp() {
  const groups = [
    { name: 'Start here', items: [['help', 'List commands available on the selected device.'], ['man <command>', 'Open the built-in manual for a supported command.'], ['ip addr', 'Inspect interface state and IPv4 addressing.'], ['ip route', 'Inspect the routing table.'], ['ping <host|ip>', 'Test end-to-end reachability.'], ['traceroute <host|ip>', 'Identify the path and the hop where traffic stops.'], ['arp', 'Inspect the ARP neighbour table.'], ['tcpdump', 'Inspect simulated packet evidence.']] },
    { name: 'Cisco IOS · access and verification', items: [['enable', 'Enter privileged EXEC mode.'], ['configure terminal', 'Enter global configuration from privileged EXEC.'], ['show version', 'Identify the simulated device and supported command profile.'], ['show running-config', 'Inspect the active device configuration.'], ['show startup-config', 'Inspect the last saved configuration snapshot.'], ['show ip interface brief', 'Review interface addressing and line state.'], ['show ip route', 'Verify connected and static routes.'], ['write memory', 'Save the running configuration snapshot.'], ['end', 'Return to privileged EXEC from configuration mode.'], ['disable', 'Return to user EXEC mode.']] },
    { name: 'Cisco IOS · switching', items: [['conf t', 'Enter global configuration mode.'], ['vlan 20', 'Create VLAN 20 on a switch.'], ['name STAFF', 'Name the VLAN in VLAN configuration mode.'], ['interface <port>', 'Select a switch interface for configuration.'], ['switchport mode access', 'Make the selected port an access port.'], ['switchport access vlan 20', 'Assign the access port to VLAN 20.'], ['switchport mode trunk', 'Configure a trunk link.'], ['switchport trunk native vlan 10', 'Set the native VLAN on a trunk.'], ['switchport trunk allowed vlan 10,20', 'Restrict the trunk to selected VLANs.'], ['show vlan brief', 'Verify VLANs and access-port membership.'], ['show interfaces status', 'Review switch port state and VLAN.'], ['show interfaces trunk', 'Verify operational trunk state.'], ['show spanning-tree vlan 10', 'Inspect STP roles and states for VLAN 10.'], ['show mac address-table dynamic', 'Inspect dynamically learned MAC addresses.']] },
    { name: 'Cisco IOS · routing', items: [['interface <name>', 'Enter a router interface context from global configuration.'], ['ip address 10.0.1.1 255.255.255.0', 'Assign an IPv4 address and dotted subnet mask in interface mode.'], ['no shutdown', 'Administratively enable the selected interface.'], ['ip route 10.0.2.0 255.255.255.0 10.0.1.254', 'Install a static route using a reachable next hop.'], ['show ip interface brief', 'Verify interface state after a change.'], ['show ip route', 'Verify the routing table after a change.']] },
    { name: 'Routing and troubleshooting', items: [['ip route add default via <gateway>', 'Add a default route on a supported host or router.'], ['ospf <interface> area <id>', 'Enable the simulator OSPF process on an interface.'], ['ospf neighbor', 'Inspect discovered OSPF neighbours.'], ['bgp asn <number>', 'Set the local BGP autonomous system number.'], ['bgp neighbor <ip> remote-as <asn>', 'Configure a BGP peer.'], ['bgp summary', 'Inspect BGP session state.'], ['bgp network <prefix>', 'Advertise a configured network.']] },
    { name: 'Work safely', items: [['clear mac address-table dynamic', 'Clear learned switch entries after a topology change.'], ['exit', 'Leave the current interface configuration context.'], ['help', 'List the commands currently available in this simulator.']] }
  ];
  const selectedKind = RUN && RUN.net.devices[SEL] ? RUN.net.devices[SEL].kind : 'no device selected';
  const all = groups.flatMap(g => g.items.map(([cmd, desc]) => ({ group: g.name, cmd, desc })));
  const render = q => { const term = q.trim().toLowerCase(), found = all.filter(x => !term || (x.cmd + ' ' + x.desc + ' ' + x.group).toLowerCase().includes(term)); return found.length ? found.map(x => `<button class="help-command" data-help-cmd="${esc(x.cmd)}"><span><b>${esc(x.cmd)}</b><small>${esc(x.group)}</small></span><span>${esc(x.desc)}</span></button>`).join('') : '<p class="dim">No matching help entry. Try a protocol, command or symptom.</p>'; };
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet sheet-wide help-sheet"><div class="eyebrow">Field guide · selected device: ${esc(SEL || 'none')} (${esc(selectedKind)})</div><div class="modal-head"><div><h2>Engineering help desk</h2><p class="dim">Search command examples and procedures. Select a command to place it in the terminal.</p></div><span class="help-key">? HELP</span></div><input id="helpSearch" class="wide" type="search" placeholder="Search commands, VLANs, routing, interfaces, symptoms…"/><div class="help-groups" id="helpResults">${render('')}</div><div class="help-note"><b>Learning note:</b> This reference distinguishes commands modelled by the current simulator from advanced Cisco IOS/IOS XE commands planned for later releases. If a command is not implemented yet, the device will report that clearly rather than pretending it worked.</div><div class="row"><button class="btn" id="closeS">Close</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.querySelector('#closeS').addEventListener('click', () => wrap.remove());
  wrap.querySelector('#helpSearch').addEventListener('input', e => { wrap.querySelector('#helpResults').innerHTML = render(e.target.value); });
  wrap.querySelector('#helpResults').addEventListener('click', e => { const b = e.target.closest('[data-help-cmd]'); if (!b) return; const inp = $('#tin'); inp.value = b.dataset.helpCmd; wrap.remove(); inp.focus(); });
}
function wireTerm() {
  const inp = $('#tin');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const line = inp.value; inp.value = ''; if (!line.trim()) return; HIST.push(line); HISTI = HIST.length; const cli = RUN.cli.on(SEL); const dev = RUN.net.devices[SEL]; const suffix = dev.firewallOS === 'asa' ? (cli.asaMode === 'interface' ? '(config-if)#' : cli.asaMode === 'object' ? '(config-network-object)#' : cli.asaMode === 'config' ? '(config)#' : cli.asaMode === 'privileged' ? '#' : '>') : (cli.iosMode === 'interface' ? '(config-if)#' : cli.iosMode === 'vlan' ? '(config-vlan)#' : cli.iosMode === 'acl' ? '(config-ext-nacl)#' : cli.iosMode === 'config' ? '(config)#' : cli.iosMode === 'privileged' ? '#' : '>'); termEcho(`${dev.hostname || SEL}${suffix} ${line}`); const r = cli.run(line); if (r.out) termEcho(r.out); addJournalEntry({ type: 'command', device: SEL || '', command: line, result: r.code === 0 ? 'success' : 'error', output: r.out || (r.code === 0 ? 'Command completed without output.' : 'Command failed.') }); refresh(); return; }
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

/* ---------- build mode: scenario authoring + design canvas ---------- */
const PALETTE = [['host', 'Host'], ['server', 'Server'], ['switch', 'Switch'], ['router', 'Router'], ['firewall', 'Firewall']];
function renderPalette() {
  if (!canBuild()) return '';
  const add = PALETTE.map(([k, n]) => `<button class="btn sm pal" data-add="${k}">＋ ${n}</button>`).join('');
  const wiring = WIRE ? `<span class="wire-on">click another device to connect <b>${esc(WIRE)}</b></span>` : '';
  return `<div class="builder"><div class="label">Build</div>
    <div class="pal-row">${add}</div>
    <div class="pal-row"><button class="btn sm" id="wireBtn">${WIRE ? '✕ cancel' : '🔗 Wire'}</button>${SEL && RUN.net.devices[SEL] ? `<button class="btn sm" id="delDev">🗑 ${esc(SEL)}</button>` : ''}<button class="btn sm" id="arrangeBtn" title="Reset to an automatic layout">⤢ Arrange</button>${wiring}</div>
    <div class="pal-hint dim">Drag any device to reposition it; links follow.</div></div>`;
}
function describeCheck(s) {
  switch (s.type) {
    case 'reachable': return `${s.a} can reach ${s.b}`;
    case 'not_reachable': return `${s.a} must NOT reach ${s.b}`;
    case 'subnet_correct': return `${s.dev}/${s.iface} in ${s.cidr}`;
    case 'route_exists': return `${s.dev} has a route to ${s.cidr}`;
    case 'acl_blocks': return `${s.src} blocked from ${s.dst}`;
    case 'service_up': return `${s.dev} serves port ${s.port}`;
    case 'resolves': return `${s.dev} resolves ${s.name}`;
    case 'ospf_neighbor': return `${s.dev} OSPF-neighbors ${s.peer}`;
    case 'ospf_route': return `${s.dev} learns ${s.cidr} (OSPF)`;
    case 'bgp_session': return `${s.dev} BGP session with ${s.peer}`;
    case 'bgp_route': return `${s.dev} learns ${s.cidr} (BGP)`;
    case 'port_forward': return `${s.from} reaches ${s.server} via ${s.public}:${s.dport}`;
    case 'mac_entry': return `${s.dev} learns ${s.device} on ${s.port} (VLAN ${s.vlan})`;
    case 'stp_root': return `${s.root} is root for VLAN ${s.vlan}`;
    case 'stp_blocked': return `${s.dev}/${s.port} blocks in VLAN ${s.vlan}`;
    default: return s.type;
  }
}
function renderAuthor() {
  const a = AUTHOR;
  const checkRows = a.success.length
    ? a.success.map((s, i) => `<div class="rrow">${esc(describeCheck(s))} <button class="x" data-delchk="${i}">✕</button></div>`).join('')
    : '<p class="dim">No objectives yet — add at least one.</p>';
  const typeOpts = Object.keys(S.CHECKS).map(t => `<option value="${t}">${t}</option>`).join('');
  return `<div class="eyebrow">Author · design a scenario</div>
    <h1>Build a scenario</h1>
    <p class="dim">Place the devices the student starts with and address what they're given. Then set the objectives they must build toward. ▶ Play to test it yourself.</p>
    <div class="label">Title</div><input id="aTitle" class="wide" value="${esc(a.title)}"/>
    <div class="label">Objective / brief</div><textarea id="aObj" class="wide" rows="2" placeholder="What the student must achieve">${esc(a.objective)}</textarea>
    <div class="label">Objectives (success checks)</div>
    <div class="rev-list">${checkRows}</div>
    <div class="addrow"><select id="chkType">${typeOpts}</select></div>
    <div class="addrow" id="chkArgs"></div>
    <div class="addrow"><button class="btn sm" id="addChk">＋ Add objective</button></div>
    <div class="row"><button class="btn" id="exportScn">⬇ Export</button>
      <label class="btn" style="cursor:pointer">⬆ Import<input id="importScn" type="file" accept="application/json,.json" style="display:none"></label>
      <button class="btn primary" id="playScn">▶ Play / test</button></div>
    <div class="row"><button class="btn" id="exitBuild">← Exit build</button>${AUTHUSER ? '<button class="btn" id="saveLib">💾 Save to class</button>' : ''}</div>
    <div id="status"></div>`;
}
function renderCheckArgs() {
  const sel = $('#chkType'); if (!sel) return;
  const fields = S.CHECKS[sel.value] || [];
  $('#chkArgs').innerHTML = fields.map(f => `<input class="chkarg" data-arg="${f}" placeholder="${f}" size="9"/>`).join('');
}
function addCheckFromForm() {
  const type = $('#chkType').value; const s = { type };
  document.querySelectorAll('#chkArgs .chkarg').forEach(inp => { const v = inp.value.trim(); if (v) s[inp.dataset.arg] = /^\d+$/.test(v) ? Number(v) : v; });
  const missing = (S.CHECKS[type] || []).filter(f => s[f] == null);
  if (missing.length) { flashStatus('Missing: ' + missing.join(', ')); return; }
  AUTHOR.success.push(s); $('#brief').innerHTML = renderAuthor(); wireBrief();
}
function builderRun(net) { return { net, cli: makeCLI(net, null), mission: { authored: true, mode: 'build' }, done: () => false, results: () => [] }; }
function renderAll() { $('#brief').innerHTML = MODE === 'build' ? renderAuthor() : renderBrief(); wireBrief(); refresh(); updateHud(); }
function enterBuild() {
  showWorkspaceView('workbench');
  MODE = 'build'; WIRE = null; SEL = null; HINTS = 0; PLAYING_DBID = null; stopTimer();
  AUTHOR = { title: 'My scenario', objective: '', ticket: null, hints: [], success: [] };
  RUN = builderRun(B.blank());
  renderAll();
  termClear(); termEcho('— Build mode. Add devices, 🔗 Wire them, set addresses, then add objectives. ▶ Play to test.');
}
function exitBuild() { reloadMission(0); }
function currentScenario() {
  return {
    id: 'authored-' + (AUTHOR.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: AUTHOR.title, mode: 'build', objective: AUTHOR.objective, hints: AUTHOR.hints, ticket: AUTHOR.ticket,
    start: S.fromTopology(RUN.net), success: AUTHOR.success
  };
}
function showErrors(errs, verb) { const b = $('#status'); b.className = 'bad'; b.innerHTML = `Fix before ${verb}:<ul>` + errs.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>'; }
function exportScenario() {
  const scn = currentScenario(); const v = S.validate(scn);
  if (!v.ok) return showErrors(v.errors, 'export');
  const blob = new Blob([S.toJSON(scn)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = scn.id + '.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  const b = $('#status'); b.className = 'ok'; b.textContent = 'Exported ' + scn.id + '.json';
}
function importScenario(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const scn = S.fromJSON(reader.result);
      MODE = 'build'; WIRE = null; SEL = null;
      AUTHOR = { title: scn.title, objective: scn.objective || '', ticket: scn.ticket || null, hints: scn.hints || [], success: scn.success || [] };
      RUN = builderRun(S.clone(scn.start || { devices: {}, links: [] }));
      renderAll();
    } catch (e) { flashStatus('Import failed: ' + e.message); }
  };
  reader.readAsText(file);
}
function playAuthored() {
  const scn = currentScenario(); const v = S.validate(scn);
  if (!v.ok) return showErrors(v.errors, 'playing');
  MODE = 'play'; WIRE = null; runMission(S.toMission(scn));
}

/* ---------- cloud / classroom (shared Supabase project with the Linux game) ---------- */
function sbConfig() { try { return { url: localStorage.getItem('lsa-sb-url') || '', key: localStorage.getItem('lsa-sb-key') || '' }; } catch (e) { return { url: '', key: '' }; } }
function loadSupabaseLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function getSB() {
  if (SB) return SB;
  const cfg = sbConfig(); if (!cfg.url || !cfg.key) return null;
  try { await loadSupabaseLib(); } catch (e) { return null; }
  if (!(window.supabase && window.supabase.createClient)) return null;
  SB = window.supabase.createClient(cfg.url, cfg.key);
  return SB;
}
async function initCloud() {
  const sb = await getSB(); if (!sb) return;
  try { const { data } = await sb.auth.getSession(); AUTHUSER = data && data.session ? data.session.user : null; } catch (e) {}
  try { sb.auth.onAuthStateChange((_e, session) => { AUTHUSER = session ? session.user : null; updateClassBtn(); }); } catch (e) {}
  updateClassBtn();
}
function updateClassBtn() { const b = $('#btnClass'); if (b) b.classList.toggle('on', !!AUTHUSER); }
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function modalShell(title) {
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet"><h2>${esc(title)}</h2><div class="cx-body"></div><div class="row" style="margin-top:14px"><button class="btn primary" id="closeS">Done</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.querySelector('#closeS').addEventListener('click', () => wrap.remove());
  return wrap;
}
function saveToLibrary() {
  const scn = currentScenario(); const v = S.validate(scn);
  if (!v.ok) return showErrors(v.errors, 'saving');
  getSB().then(sb => {
    if (!sb || !AUTHUSER) { flashStatus('Open 🎓 Class and sign in first.'); return; }
    NC.saveScenario(sb, AUTHUSER.id, scn).then(() => { const b = $('#status'); if (b) { b.className = 'ok'; b.textContent = 'Saved to your class library.'; } })
      .catch(e => flashStatus('Save failed: ' + (e && e.message)));
  });
}
async function openClassroom() {
  const wrap = modalShell('Classroom'); const body = wrap.querySelector('.cx-body');
  body.innerHTML = '<p class="dim">Connecting…</p>';
  const sb = await getSB();
  if (!sb) {
    body.innerHTML = `<p class="dim">Connect your class account — the same Supabase project the Linux Sysadmin game uses.</p>
      <div class="addrow"><input id="cfgUrl" class="wide" placeholder="https://xxxx.supabase.co"/></div>
      <div class="addrow"><input id="cfgKey" class="wide" placeholder="anon public key"/></div>
      <div class="addrow"><button class="btn sm" id="cfgSave">Save & connect</button></div><div id="cfgOut" class="dim"></div>`;
    body.querySelector('#cfgSave').addEventListener('click', () => {
      const u = body.querySelector('#cfgUrl').value.trim(), k = body.querySelector('#cfgKey').value.trim();
      if (!u || !k) return;
      try { localStorage.setItem('lsa-sb-url', u); localStorage.setItem('lsa-sb-key', k); } catch (e) {}
      SB = null; closeModal(); openClassroom();
    });
    return;
  }
  if (!AUTHUSER) {
    body.innerHTML = `<p class="dim">Sign in to see your classes. We'll email you a magic link.</p>
      <div class="addrow"><input id="siEmail" class="wide" placeholder="you@school.edu"/></div>
      <div class="addrow"><button class="btn sm" id="siSend">Send magic link</button></div><div id="siOut" class="dim"></div>
      <p class="dim" style="margin-top:8px">Already signed in on the Linux Sysadmin game? Reload — the session is shared.</p>`;
    body.querySelector('#siSend').addEventListener('click', async () => {
      const email = body.querySelector('#siEmail').value.trim(); const out = body.querySelector('#siOut');
      if (!email) return; out.textContent = 'Sending…';
      try { const r = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } }); out.textContent = r.error ? ('Error: ' + r.error.message) : '✓ Check your email for the link.'; }
      catch (e) { out.textContent = 'Error: ' + (e && e.message); }
    });
    return;
  }
  renderClassroom(sb, body);
}
async function renderClassroom(sb, body) {
  body.innerHTML = '<p class="dim">Loading your classes…</p>';
  let isTeacher = false, enrolled = [], owned = [];
  try { const { data } = await sb.from('profiles').select('is_teacher').eq('id', AUTHUSER.id).maybeSingle(); isTeacher = !!(data && data.is_teacher); } catch (e) {}
  try { const { data } = await sb.from('enrollments').select('class_id, classes(name)').eq('user_id', AUTHUSER.id); enrolled = data || []; } catch (e) {}
  try { const { data } = await sb.from('classes').select('id, name').eq('owner_id', AUTHUSER.id); owned = data || []; } catch (e) {}
  let student = '';
  for (const e of enrolled) {
    let scns = []; try { const { data } = await NC.assignedScenarios(sb, e.class_id); scns = data || []; } catch (_) {}
    const cname = (e.classes && e.classes.name) || 'Class';
    student += `<div class="rlabel">${esc(cname)}</div>` + (scns.length
      ? scns.map(s => `<div class="cx-item"><span>${esc(s.title)}</span><button class="btn sm playScn" data-id="${esc(s.id)}" data-scn='${esc(JSON.stringify(s.data))}'>▶ Play</button></div>`).join('')
      : '<p class="dim">No network scenarios assigned yet.</p>');
  }
  let teacher = '';
  if (isTeacher) {
    let mine = []; try { const { data } = await NC.myScenarios(sb, AUTHUSER.id); mine = data || []; } catch (_) {}
    const scnOpts = mine.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('') || '<option value="">(save a scenario first)</option>';
    const clsOpts = owned.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">(no classes — create one in the Linux game)</option>';
    teacher = `<div class="rlabel" style="margin-top:12px">Teach — assign a scenario</div>
      <div class="addrow"><select id="asgScn" class="wide">${scnOpts}</select></div>
      <div class="addrow"><select id="asgCls">${clsOpts}</select><input id="asgTitle" placeholder="assignment title" size="12"/><button class="btn sm" id="doAssign">Assign</button></div>
      <div id="asgOut" class="dim"></div>`;
  }
  body.innerHTML = (student || '') + (teacher || '') + (!enrolled.length && !isTeacher ? '<p class="dim">Join a class in the Linux Sysadmin game, then return here for assigned scenarios.</p>' : '');
  body.querySelectorAll('.playScn').forEach(b => b.addEventListener('click', () => {
    try { const scn = JSON.parse(b.dataset.scn); closeModal(); MODE = 'play'; PLAYING_DBID = b.dataset.id || null; runMission(S.toMission(scn)); } catch (e) { flashStatus('Could not open scenario.'); }
  }));
  const asg = body.querySelector('#doAssign');
  if (asg) asg.addEventListener('click', async () => {
    const scnId = body.querySelector('#asgScn').value, clsId = body.querySelector('#asgCls').value;
    const title = body.querySelector('#asgTitle').value.trim() || 'Network scenario';
    const out = body.querySelector('#asgOut');
    if (!scnId || !clsId) { out.textContent = 'Pick a scenario and a class.'; return; }
    try { await NC.assignScenarios(sb, clsId, title, [scnId], null); out.textContent = '✓ Assigned to the class.'; }
    catch (e) { out.textContent = 'Assign failed: ' + (e && e.message); }
  });
}

/* ---------- boot ---------- */
function boot() {
  applyTheme(PROG.theme);
  document.getElementById('app').innerHTML = `
    <div id="shell">
      <aside id="navRail" aria-label="Network workspace navigation">
        <div class="nav-brand"><span class="nav-brand-mark" aria-hidden="true">N</span><div><strong>NETWORK OPS</strong><small>Engineering workstation</small></div></div>
        <div class="nav-section">Workspace</div>
        <button class="nav-item" id="navOverview" data-view="overview" type="button" aria-current="page"><span class="nav-glyph">▦</span>Overview</button>
        <button class="nav-item" id="navIncidents" type="button"><span class="nav-glyph">◈</span>Incidents</button>
        <button class="nav-item" id="navWorkbench" data-view="workbench" type="button"><span class="nav-glyph">⌘</span>Workbench</button>
        <button class="nav-item" type="button" disabled title="Infrastructure inventory is in a later implementation phase"><span class="nav-glyph">▤</span>Infrastructure<span class="nav-soon">Next</span></button>
        <div class="nav-section">Reference & records</div>
        <button class="nav-item" type="button" disabled title="Knowledge centre is in a later implementation phase"><span class="nav-glyph">⌕</span>Knowledge<span class="nav-soon">Next</span></button>
        <button class="nav-item" id="navJournal" type="button"><span class="nav-glyph">▧</span>Journal</button>
        <div class="nav-spacer"></div><div class="nav-foot">LAB STATUS · SIMULATED<br>LOCAL PROGRESS ENABLED</div>
      </aside>
      <div id="mainArea">
    <header id="top">
      <div class="apphdr">
        <div class="brand"><span class="mark" aria-hidden="true"></span><div><div class="name">THE LAST SYSADMIN</div><div class="sub">Learn Network Administration</div></div></div>
        <nav class="apptabs" role="tablist">
          <a class="apptab" href="../" role="tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 16h4"/></svg>Linux Sysadmin</a>
          <a class="apptab on" href="#" role="tab" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 7h8M7.4 7.8 11 16M16.6 7.8 13 16"/></svg>Network Sysadmin</a>
        </nav>
      </div>
      <div class="hud"><span>Time <b id="time">0:00</b></span><span>XP <b id="xp">0</b></span><span>Rank <b id="rank">Cadet</b></span><span>Solved <b id="prog">0/0</b></span>
        <button id="btnQueue" class="btn queue-launch" title="Daily incident queue">▤ Tickets <span id="queueOpenCount"></span></button>
        <button id="btnHelp" class="btn help-launch" title="Help and command reference">? Help</button>
        <button id="btnJournal" class="btn" title="Personal work journal">▤ Journal</button>
        <button id="btnBuild" class="btn" title="Build a scenario">🛠 Build</button>
        <button id="btnClass" class="btn" title="Classroom — classes & assigned scenarios">🎓 Class</button>
        <button id="btnStats" class="btn" title="Stats">📊</button>
        <button id="btnSet" class="btn" title="Settings">⚙</button></div>
    </header>
    <section id="overview" aria-label="Operations overview"></section>
    <div id="cols" hidden>
      <aside id="brief"></aside>
      <main class="workbench"><div class="deskbar"><div><span class="eyebrow">Operations floor</span><strong>Live network topology</strong><span class="desk-hint">Select a device to inspect it · run commands to collect evidence</span></div><span class="live-indicator"><i></i> SIMULATION LIVE</span></div><div id="topoWrap"></div><div id="flows"></div><section id="term"><div class="term-head"><b>DEVICE CONSOLE</b><span>CLI · command history enabled</span><button class="btn sm" id="termHelp">Command help</button></div><pre id="tout"></pre><div class="tline"><span id="termTarget">—</span><input id="tin" autocomplete="off" placeholder="Enter a command for the selected device…"/></div></section></main>
      <aside id="config"></aside>
    </div>
      </div>
    </div>`;
  wireTerm();
  $('#navOverview').addEventListener('click', () => showWorkspaceView('overview'));
  $('#navWorkbench').addEventListener('click', () => showWorkspaceView('workbench'));
  $('#navIncidents').addEventListener('click', openTicketQueue);
  $('#navJournal').addEventListener('click', openJournal);
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnQueue').addEventListener('click', openTicketQueue);
  $('#termHelp').addEventListener('click', openHelp);
  $('#btnJournal').addEventListener('click', openJournal);
  $('#btnSet').addEventListener('click', openSettings);
  $('#btnStats').addEventListener('click', openStats);
  $('#btnBuild').addEventListener('click', enterBuild);
  $('#btnClass').addEventListener('click', openClassroom);
  document.addEventListener('pointermove', onDragMove);   // node dragging (attached once)
  document.addEventListener('pointerup', onDragUp);
  document.addEventListener('pointercancel', onDragUp);
  reloadMission(0);
  showWorkspaceView('overview');
  renderOverview();
  initCloud();
}
if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
