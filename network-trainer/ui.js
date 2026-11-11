// Networking Trainer — UI. Runs in the browser on top of the SAME tested modules
// (loaded via the require() shim the build injects). Topology + config panels +
// terminal + mission flow, now with saved progress, XP, ranks, a hints economy,
// themes, and settings — the sysadmin game's "feel".
const M = require('./net-model');
const F = require('./src/feedback');
const { startMission } = require('./net-mission');
const { chapters, TIERS, missionsInTier } = require('./net-chapters');
const LC = require('./net-learning-coach');
const NR = require('./net-spaced-recall');
const { makeCLI, BRANDS, brandsForKind, completions } = require('./net-cli');
const B = require('./net-builder');
const D = require('./net-design-academy');
const AW = require('./net-automation-workshop');
const S = require('./net-scenario');
const NC = require('./net-classroom');

const REWARD = 100, HINT_COST = 25;
const RANKS = [[0, 'Cadet'], [120, 'Apprentice'], [280, 'Technician'], [460, 'Engineer'], [640, 'Senior Engineer'], [820, 'Network Architect']];
const THEMES = [['', 'Network Ops (cyan)'], ['halcyon', 'Halcyon Dark'], ['amber', 'Amber CRT'], ['green', 'Green Phosphor'], ['paper', 'Paper (light)']];

let RUN = null, SEL = null, HINTS = 0, PROG = loadProg(), LAST_COMMAND = null;
let TSTART = 0, TICK = null, SOLVED_NOW = false;   // per-ticket timer
let DIAGNOSED = false;                              // diagnosis gate cleared?
let HIST = [], HISTI = -1;                         // terminal command history
let MODE = 'play';                                 // 'play' | 'build' (authoring)
let AUTHOR = null;                                 // { title, objective, ticket, hints, success:[] } while authoring
let WIRE = null;                                   // first endpoint picked while wiring a link
let SB = null, AUTHUSER = null, PLAYING_DBID = null; // cloud/classroom (shared Supabase project)
let LASTPOS = {}, DRAG = null, PAN = null, BOX = null, TOPO_VIEW = null, TOPO_SHOW_PORTS = false, TOPO_GRID = true, TOPO_SNAP = true, LINK_SEL = null;
let TOPO_SELECTED = new Set(), TOPO_UNDO = [], TOPO_REDO = [], TOPO_CLIPBOARD = null; // topology interaction state
let TEXT_SELECTED = new Set(), LABEL_SELECTED = new Set(); // text indices and "id:kind" for labels
let TOPO_CAPTURE_SELECT = true, TOPO_DELETE_KEY_BOUND = false;
let TOPO_LAYERS = { zones:true, links:true, notes:true, devices:true, drawings:true, texts:true };
let DRAW_TOOL = 'select', DRAWING = null, DRAWING_SEL = null, DRAWING_DRAG = null, NOTE_DRAG = null, ANNOTATION_DRAG = null, RESIZE_DRAG = null, TEXT_INSERT_MODE = false, TEXT_INSERT_CANCEL_BOUND = false;
let LAST_NODE_ACTIVATION = { id:null, at:0 }; // double-click detection survives SVG refreshes
let INSPECTOR_TAB = 'overview', TERM_SESSIONS = {};          // device inspector + per-device console sessions
let INCIDENT_SELECTED = null, INCIDENT_FILTERS = { query:'', status:'open', priority:'all' };
let INFRA_SELECTED = null, INFRA_FILTERS = { query:'', kind:'all', status:'all' };
let JOURNAL_FILTERS = { query:'', type:'all', range:'all' };
// Builder controls show while authoring, or while a student plays a build-from-scratch scenario.
function canBuild() { return MODE === 'build' || !!(RUN && RUN.mission && (RUN.mission.mode === 'design' || (RUN.mission.authored && RUN.mission.mode === 'build'))); }
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- persistence ---------- */
function loadProg() { try { const p = JSON.parse(localStorage.getItem('nettrainer') || '{}'); return { done: p.done || {}, xp: p.xp || 0, theme: p.theme || '', journal: Array.isArray(p.journal) ? p.journal : [], configArchives: Array.isArray(p.configArchives) ? p.configArchives : [], tickets: p.tickets && typeof p.tickets === 'object' ? p.tickets : {}, changes: Array.isArray(p.changes) ? p.changes : [], designAcademy: p.designAcademy && typeof p.designAcademy === 'object' ? p.designAcademy : {}, automationWorkshop: p.automationWorkshop && typeof p.automationWorkshop === 'object' ? p.automationWorkshop : {}, changeSequence: Number(p.changeSequence) || 0 }; } catch (e) { return { done: {}, xp: 0, theme: '', journal: [], tickets: {} }; } }
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
  host: "<g class=\"ico device-art\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.15\"><path class=\"iso-side\" d=\"M25 13 44 5v20l-19 9z\"/><path class=\"iso-front\" d=\"m7 5 18 8v21L7 26z\"/><path class=\"iso-top\" d=\"M7 5 26 -3 44 5 25 13z\"/><path class=\"iso-screen\" d=\"m11 7 13 6v13l-13-6z\"/><path class=\"iso-screen-glint\" d=\"m13 9 9 4v7l-9-4z\"/><path class=\"iso-stand\" d=\"m24 34 4 2v3l-4-2zM18 38l8-4 8 4-8 4z\"/><path class=\"iso-detail\" d=\"m30 16 10-4M30 21l10-4\"/></g>",
  server: "<g class=\"ico device-art\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.15\"><path class=\"iso-side\" d=\"m26 5 16-7v29l-16 8z\"/><path class=\"iso-front\" d=\"m9-2 17 7v30L9 27z\"/><path class=\"iso-top\" d=\"m9-2 17-8 16 8-16 7z\"/><path class=\"iso-detail\" d=\"m13 2 10 4v5L13 7zM13 11l10 4v5l-10-4zM13 20l10 4v5l-10-4z\"/><circle class=\"iso-led\" cx=\"22\" cy=\"9\" r=\"1.15\"/><circle class=\"iso-led\" cx=\"22\" cy=\"18\" r=\"1.15\"/><circle class=\"iso-led\" cx=\"22\" cy=\"27\" r=\"1.15\"/><path class=\"iso-detail\" d=\"m31 7 7-3M31 13l7-3M31 19l7-3M31 25l7-3\"/></g>",
  switch: "<g class=\"ico device-art\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.15\"><path class=\"iso-side\" d=\"m25 12 20-9v14l-20 9z\"/><path class=\"iso-front\" d=\"m4 3 21 9v14L4 17z\"/><path class=\"iso-top\" d=\"m4 3 20-9 21 9-20 9z\"/><path class=\"iso-port\" d=\"m9 7 3 1.5v3L9 10zM15 9.5l3 1.5v3L15 12zM21 12l3 1.5v3L21 15z\"/><path class=\"iso-port-side\" d=\"m29 13 3-1.4v3L29 16zM35 10.3l3-1.4v3L35 13z\"/><path class=\"iso-detail\" d=\"m9 14 12 5M29 20l12-5\"/></g>",
  router: "<g class=\"ico device-art\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.15\"><path class=\"iso-side\" d=\"m25 16 20-9v13l-20 9z\"/><path class=\"iso-front\" d=\"m4 7 21 9v13L4 20z\"/><path class=\"iso-top\" d=\"m4 7 20-9 21 9-20 9z\"/><path class=\"iso-antenna\" d=\"m11 3-1-8M37 5l3-9\"/><path class=\"iso-port\" d=\"m9 12 3 1.3v3L9 15zM16 15l3 1.3v3L16 18zM23 18l3 1.3v3L23 21z\"/><path class=\"iso-detail\" d=\"m31 19 10-4\"/></g>",
  firewall: "<g class=\"ico device-art\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.15\"><path class=\"iso-side\" d=\"m25 13 20-9v20l-20 9z\"/><path class=\"iso-front\" d=\"m4 4 21 9v20L4 24z\"/><path class=\"iso-top\" d=\"m4 4 20-9 21 9-20 9z\"/><path class=\"iso-brick\" d=\"m7 8 8 3.5v5L7 13zM17 12.5l6 2.5v5l-6-2.5zM7 17l8 3.5v5L7 22zM17 21.5l6 2.5v5l-6-2.5z\"/><path class=\"iso-shield\" d=\"m32 11 6-2.5v6l-6 3z\"/><path class=\"iso-detail\" d=\"m34 12 1.5 1.5 3-4\"/></g>"
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
function drawingMarkup(d, index) {
  const selected = DRAWING_SEL === index ? ' selected' : '';
  const color = esc(d.color || '#e5b85c');
  const hitFill = d.type === "rect" || d.type === "ellipse" ? "transparent" : "none";
  const common = `class="topo-drawing${selected}" data-drawing-index="${index}" role="button" tabindex="0" aria-label="${esc((d.type || 'topology') + ' drawing ' + (index + 1))}" aria-keyshortcuts="Enter Space Shift+F10 Delete" fill="${hitFill}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
  if (d.type === 'freehand') { const points=Array.isArray(d.points)?d.points:[]; return `<path ${common} d="${points.map((p,i)=>(i?'L':'M')+(Number(p[0])||0)+' '+(Number(p[1])||0)).join(' ')}"/>`; }
  const x1=Number(d.x1)||0,y1=Number(d.y1)||0,x2=Number(d.x2)||0,y2=Number(d.y2)||0;
  const handles = selected ? `<circle class="topo-drawing-handle" data-drawing-index="${index}" data-drawing-handle="start" cx="${x1}" cy="${y1}" r="5" fill="#38bdf8" stroke="#eafaff" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="all"/><circle class="topo-drawing-handle" data-drawing-index="${index}" data-drawing-handle="end" cx="${x2}" cy="${y2}" r="5" fill="#38bdf8" stroke="#eafaff" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="all"/>` : '';
  if (d.type === 'rect') return `<g>${`<rect ${common} x="${Math.min(x1,x2)}" y="${Math.min(y1,y2)}" width="${Math.abs(x2-x1)}" height="${Math.abs(y2-y1)}" rx="3"/>`}${handles}</g>`;
  if (d.type === 'ellipse') return `<g>${`<ellipse ${common} cx="${(x1+x2)/2}" cy="${(y1+y2)/2}" rx="${Math.abs(x2-x1)/2}" ry="${Math.abs(y2-y1)/2}"/>`}${handles}</g>`;
  return `<g>${`<line ${common} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${d.type==='arrow'?'marker-end="url(#topoArrow)"':''}/>`}${handles}</g>`;
}
function hitTestTopologyDrawing(point) {
  const drawings = RUN && RUN.net && RUN.net.drawings || [];
  const segmentDistance = (p,a,b) => {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    const t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;
    return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
  };
  let best=null,bestDistance=14;
  drawings.forEach((d,index)=>{
    let distance=Infinity;
    if(d.type==='freehand'){
      const pts=Array.isArray(d.points)?d.points:[];
      for(let i=1;i<pts.length;i++)distance=Math.min(distance,segmentDistance(point,pts[i-1],pts[i]));
      if(pts.length===1)distance=Math.hypot(point[0]-pts[0][0],point[1]-pts[0][1]);
    }else{
      const a=[Number(d.x1)||0,Number(d.y1)||0],b=[Number(d.x2)||0,Number(d.y2)||0];
      if(d.type==='rect'){
        const x1=Math.min(a[0],b[0]),x2=Math.max(a[0],b[0]),y1=Math.min(a[1],b[1]),y2=Math.max(a[1],b[1]);
        if(point[0]>=x1&&point[0]<=x2&&point[1]>=y1&&point[1]<=y2)distance=0;
        else distance=Math.min(segmentDistance(point,[x1,y1],[x2,y1]),segmentDistance(point,[x2,y1],[x2,y2]),segmentDistance(point,[x2,y2],[x1,y2]),segmentDistance(point,[x1,y2],[x1,y1]));
      }else if(d.type==='ellipse'){
        const cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,rx=Math.max(1,Math.abs(b[0]-a[0])/2),ry=Math.max(1,Math.abs(b[1]-a[1])/2);
        const normalized=Math.abs(Math.hypot((point[0]-cx)/rx,(point[1]-cy)/ry)-1)*Math.min(rx,ry);
        distance=normalized;
      }else distance=segmentDistance(point,a,b);
    }
    if(distance<bestDistance){bestDistance=distance;best=index;}
  });
  return best;
}
function updateDrawingPreview(d) {
  const el=d.el, x1=d.start[0],y1=d.start[1],p=d.current||d.start,x2=p[0],y2=p[1];
  if(d.type==='freehand') el.setAttribute('d',d.points.map((q,i)=>(i?'L':'M')+q[0]+' '+q[1]).join(' '));
  else if(d.type==='rect'){el.setAttribute('x',Math.min(x1,x2));el.setAttribute('y',Math.min(y1,y2));el.setAttribute('width',Math.abs(x2-x1));el.setAttribute('height',Math.abs(y2-y1));}
  else if(d.type==='ellipse'){el.setAttribute('cx',(x1+x2)/2);el.setAttribute('cy',(y1+y2)/2);el.setAttribute('rx',Math.abs(x2-x1)/2);el.setAttribute('ry',Math.abs(y2-y1)/2);}
  else {el.setAttribute('x1',x1);el.setAttribute('y1',y1);el.setAttribute('x2',x2);el.setAttribute('y2',y2);}
}
function beginTopologyDrawing(svg, e) {
  const p=svgPoint(svg,e.clientX,e.clientY), type=DRAW_TOOL;
  const tag=type==='rect'?'rect':type==='ellipse'?'ellipse':type==='freehand'?'path':'line';
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  el.setAttribute('class','topo-drawing draft');el.setAttribute('stroke','#e5b85c');el.setAttribute('stroke-width','2.5');el.setAttribute('fill','none');el.setAttribute('stroke-linecap','round');el.setAttribute('stroke-linejoin','round');el.setAttribute('vector-effect','non-scaling-stroke');
  if(type==='arrow')el.setAttribute('marker-end','url(#topoArrow)');
  svg.appendChild(el);DRAWING={type,start:p,current:p,points:[p],before:topologySnapshot(),el};
  try{svg.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault();
}
function updateTopologyDrawing(e) {
  if(!DRAWING)return;
  const p=svgPoint($('#topo'),e.clientX,e.clientY);DRAWING.current=p;
  if(DRAWING.type==='freehand'&&Math.hypot(p[0]-DRAWING.points[DRAWING.points.length-1][0],p[1]-DRAWING.points[DRAWING.points.length-1][1])>=2)DRAWING.points.push(p);
  updateDrawingPreview(DRAWING);
}
function finishTopologyDrawing() {
  if(!DRAWING)return;
  const d=DRAWING;DRAWING=null;if(d.el)d.el.remove();
  const p=d.current||d.start;if(Math.hypot(p[0]-d.start[0],p[1]-d.start[1])<4)return;
  const saved={type:d.type,color:'#e5b85c'};
  if(d.type==='freehand')saved.points=d.points;
  else {saved.x1=d.start[0];saved.y1=d.start[1];saved.x2=p[0];saved.y2=p[1];}
  rememberTopology(d.before);RUN.net.drawings=RUN.net.drawings||[];RUN.net.drawings.push(saved);DRAWING_SEL=RUN.net.drawings.length-1;refresh();
}
function renderTopo() {
  const net = RUN.net;
  const layers = Object.assign({}, TOPO_LAYERS, net.layerVisibility || {});
  const deviceIds = Object.keys(net.devices || {});
  const auto = deviceIds.length ? layout(net) : {};
  const pos = {};
  for (const id of deviceIds) pos[id] = (net.pos && net.pos[id]) ? net.pos[id] : auto[id];
  LASTPOS = pos;
  // Expand viewBox so free canvas text, independent labels, notes and drawings stay fully inside the interactive SVG area.
  let minX = 0, minY = 0;
  let maxX = deviceIds.length ? Math.max(...Object.values(pos).map(p => p[0])) + 100 : 800;
  let maxY = deviceIds.length ? Math.max(...Object.values(pos).map(p => p[1])) + 80 : 600;
  const pad = 100;
  (net.texts || []).forEach(t => {
    const x = Number(t.x) || 0, y = Number(t.y) || 0;
    const fs = Math.max(9, Math.min(36, Number(t.fontSize) || 14));
    const approxW = Math.max(48, String(t.text || "Text").length * fs * 0.62);
    minX = Math.min(minX, x - approxW / 2 - pad);
    maxX = Math.max(maxX, x + approxW / 2 + pad);
    minY = Math.min(minY, y - fs - pad);
    maxY = Math.max(maxY, y + fs * 0.4 + pad);
  });
  Object.values(net.deviceLabelPositions || {}).forEach(lp => {
    ["name", "type"].forEach(k => {
      if (Array.isArray(lp[k])) {
        minX = Math.min(minX, lp[k][0] - pad);
        maxX = Math.max(maxX, lp[k][0] + pad);
        minY = Math.min(minY, lp[k][1] - pad);
        maxY = Math.max(maxY, lp[k][1] + pad);
      }
    });
  });
  (net.notes || []).forEach(n => {
    if (n && n.x != null) {
      minX = Math.min(minX, Number(n.x) - pad);
      maxX = Math.max(maxX, Number(n.x) + 140 + pad);
      minY = Math.min(minY, Number(n.y) - pad);
      maxY = Math.max(maxY, Number(n.y) + 48 + pad);
    }
  });
  (net.drawings || []).forEach(d => {
    if (d.type === "freehand" && Array.isArray(d.points)) {
      d.points.forEach(pt => {
        minX = Math.min(minX, Number(pt[0]) - pad);
        maxX = Math.max(maxX, Number(pt[0]) + pad);
        minY = Math.min(minY, Number(pt[1]) - pad);
        maxY = Math.max(maxY, Number(pt[1]) + pad);
      });
    } else if (d.x1 != null) {
      const xs = [Number(d.x1), Number(d.x2)], ys = [Number(d.y1), Number(d.y2)];
      minX = Math.min(minX, Math.min(...xs) - pad);
      maxX = Math.max(maxX, Math.max(...xs) + pad);
      minY = Math.min(minY, Math.min(...ys) - pad);
      maxY = Math.max(maxY, Math.max(...ys) + pad);
    }
  });
  const view = TOPO_VIEW || [Math.min(0, minX), Math.min(0, minY), Math.max(maxX - Math.min(0, minX), 800), Math.max(maxY - Math.min(0, minY), 600)];
  const cx = id => pos[id][0] + 24, cy = id => pos[id][1] + 18;
  let s = `<svg id="topo" viewBox="${view.join(' ')}" role="group" aria-label="Network topology">${TOPO_GRID ? '<defs><pattern id="topoGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width=".7"/></pattern></defs><rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#topoGrid)" pointer-events="none"/>' : ''}<defs><marker id="topoArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L6,3 z" fill="#e5b85c"/></marker></defs>`;
  if (!deviceIds.length && !(net.drawings||[]).length && !(net.texts||[]).length) s += '<text class="canvas-empty" x="400" y="300" text-anchor="middle" fill="var(--muted)" font-size="14">Empty canvas — add a device or draw a network diagram.</text>';
  if (layers.drawings) for (let di=0; di<(net.drawings||[]).length; di++) s += drawingMarkup(net.drawings[di], di);
  if (layers.zones) for (let zi=0; zi<(net.zones||[]).length; zi++) { const z=net.zones[zi]; s += `<g class="topo-zone" data-zone-index="${zi}" pointer-events="none"><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="10" fill="${z.color||'#2563eb'}" fill-opacity=".09" stroke="${z.color||'#60a5fa'}" stroke-opacity=".72" stroke-width="1.5" stroke-dasharray="7 5"/><text x="${z.x+12}" y="${z.y+20}" fill="${z.color||'#93c5fd'}" font-size="12" font-weight="700">${esc(z.name||'Network zone')}</text></g>`; }
  if (layers.links) for (let li=0; li<net.links.length; li++) { const l=net.links[li], x1=cx(l.a[0]), y1=cy(l.a[0]), x2=cx(l.b[0]), y2=cy(l.b[0]); s += `<line data-link-index="${li}" data-a="${l.a[0]}" data-b="${l.b[0]}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge${linkDown(net, l) ? ' down' : ''}${LINK_SEL===li ? ' selected' : ''}" role="button" tabindex="0" aria-label="${esc('Connection ' + l.a[0] + ' ' + l.a[1] + ' to ' + l.b[0] + ' ' + l.b[1] + (linkDown(net,l) ? ', down' : ', up'))}" aria-keyshortcuts="Enter Space Shift+F10 Delete" stroke-width="${LINK_SEL===li ? 4 : 2}"/>`; if (TOPO_SHOW_PORTS) s += `<text class="edge-label" data-link-index="${li}" x="${(x1+x2)/2}" y="${(y1+y2)/2-6}" text-anchor="middle">${esc(l.a[0]+':'+l.a[1]+' ↔ '+l.b[0]+':'+l.b[1])}</text>`; }
  if (layers.notes) for (let ni=0; ni<(net.notes||[]).length; ni++) { const n=net.notes[ni], w=Math.max(110,Math.min(260,String(n.text||'').length*7+18)); s += `<g class="topo-note" data-note-index="${ni}" role="button" tabindex="0" aria-label="${esc('Topology note: ' + (n.text || 'Note'))}" aria-keyshortcuts="Enter Space Shift+F10 Delete" transform="translate(${n.x||40},${n.y||40})" style="cursor:pointer"><rect width="${w}" height="30" rx="5" fill="#243746" fill-opacity=".96" stroke="#e5b85c" stroke-width="1.2"/><text x="9" y="19" fill="#fff0c2" font-size="11">${esc(n.text||'Note')}</text></g>`; }
  if (layers.texts) for (let ti=0; ti<(net.texts||[]).length; ti++) {
    const t=net.texts[ti];
    const tx=Number(t.x)||0, ty=Number(t.y)||0, fs=Math.max(9,Math.min(36,Number(t.fontSize)||14));
    const approxW=Math.max(48, String(t.text||"Text").length*fs*0.62);
    s += `<g class="topo-text-group" data-text-index="${ti}"><rect class="topo-text-hit" x="${tx-approxW/2}" y="${ty-fs*1.1}" width="${approxW}" height="${fs*1.6}" fill="transparent" pointer-events="all"/><text class="topo-text${TEXT_INSERT_MODE?' insert-ready':''}${TEXT_SELECTED.has(ti)?' selected':''}" data-text-index="${ti}" x="${tx}" y="${ty}" fill="${esc(t.color||'#e5b85c')}" font-size="${fs}" text-anchor="middle" role="button" tabindex="0" aria-label="${esc('Canvas text: '+(t.text||'Text'))}" aria-keyshortcuts="Enter Space Shift+F10 Delete" style="cursor:move;user-select:none" pointer-events="bounding-box">${esc(t.text||'Text')}</text></g>`;
  }

  if (layers.devices) for (const id in net.devices) {
    const d = net.devices[id], [x, y] = pos[id], ip = primaryIp(d);
    const kindKey = d.kind === 'switch' ? 'switch' : d.kind === 'router' ? 'router' : d.kind === 'firewall' ? 'firewall' : ((d.services || /^(srv|web|db|dns|www|site)/.test(id)) ? 'server' : 'host');
    const ico = NODE_ICONS[kindKey] || NODE_ICONS.host;
    const devSelected = TOPO_SELECTED.has(id) || id === SEL;
    s += `<g class="node ${KINDCLASS[d.kind]||''} k-${kindKey} ${id === SEL ? 'sel' : ''} ${TOPO_SELECTED.has(id) ? 'multi-selected' : ''}" data-dev="${esc(id)}" role="button" tabindex="0" aria-label="${esc((d.label || id) + ", " + d.kind + (ip ? ", " + ip : "") + ", network device")}" aria-pressed="${TOPO_SELECTED.has(id) ? "true" : "false"}" transform="translate(${x},${y})"><rect class="hit" x="-4" y="-4" width="60" height="48" rx="6" fill="transparent"/><g class="device-art-scale" transform="translate(24 18) scale(${Math.max(.5,Math.min(2.5,Number((net.deviceSizes||{})[id])||1))}) translate(-24 -18)">${ico}</g></g>${devSelected?`<circle class="topo-device-resize" data-resize-kind="device" data-dev="${esc(id)}" cx="${x+68}" cy="${y+50}" r="7" role="button" tabindex="0" aria-label="Resize device ${esc(id)}" fill="#38bdf8" stroke="#eafaff" stroke-width="1.5" pointer-events="all"/>`:''}`;
    const labelPositions=(net.deviceLabelPositions&&net.deviceLabelPositions[id])||{};
    const labelSizes=(net.deviceLabelSizes&&net.deviceLabelSizes[id])||{}, hiddenLabels=(net.hiddenDeviceLabels&&net.hiddenDeviceLabels[id])||{};
    const nameAt=labelPositions.name||[x+24,y+48], typeAt=labelPositions.type||[x+24,y+62];
    const typeText=d.displayType||(d.services||/^(srv|web|db|dns|www|site)/.test(id)?'server':d.kind);
    const nameW=Math.max(40, String(d.label||id).length*7.5), typeW=Math.max(40, String(typeText+(ip?' · '+ip:'')).length*6.5);
    if(!hiddenLabels.name){const fs=Math.max(7,Math.min(32,Number(labelSizes.name)||12)),w=Math.max(40,String(d.label||id).length*fs*.62),nameSel=LABEL_SELECTED.has(id+':name')||id===SEL||TOPO_SELECTED.has(id);s += `<g class="device-label-group" data-device-label="${esc(id)}" data-label-kind="name"><rect class="device-label-hit" x="${nameAt[0]-w/2}" y="${nameAt[1]-fs*1.1}" width="${w}" height="${fs*1.6}" fill="transparent" pointer-events="all"/><text class="device-label name-label${nameSel?' selected':''}" data-device-label="${esc(id)}" data-label-kind="name" x="${nameAt[0]}" y="${nameAt[1]}" font-size="${fs}" text-anchor="middle" role="button" tabindex="0" aria-label="${esc('Device name label: '+(d.label||id))}" aria-keyshortcuts="Enter Space Shift+F10 Delete" style="cursor:move" pointer-events="bounding-box">${esc(d.label||id)}</text>${nameSel?`<circle class="topo-label-resize" data-resize-kind="label" data-device-label="${esc(id)}" data-label-kind="name" cx="${nameAt[0]+w/2+5}" cy="${nameAt[1]-fs/2}" r="4.5" fill="#38bdf8" stroke="#eafaff" stroke-width="1.3" role="button" tabindex="0" aria-label="Resize device name label"/>`:''}</g>`;}
    if(!hiddenLabels.type){const fs=Math.max(7,Math.min(28,Number(labelSizes.type)||10)),w=Math.max(40,String(typeText+(ip?' · '+ip:'')).length*fs*.62),typeSel=LABEL_SELECTED.has(id+':type')||id===SEL||TOPO_SELECTED.has(id);s += `<g class="device-label-group" data-device-label="${esc(id)}" data-label-kind="type"><rect class="device-label-hit" x="${typeAt[0]-w/2}" y="${typeAt[1]-fs*1.1}" width="${w}" height="${fs*1.6}" fill="transparent" pointer-events="all"/><text class="device-label type-label${typeSel?' selected':''}" data-device-label="${esc(id)}" data-label-kind="type" x="${typeAt[0]}" y="${typeAt[1]}" font-size="${fs}" text-anchor="middle" role="button" tabindex="0" aria-label="${esc('Device type label: '+typeText)}" aria-keyshortcuts="Enter Space Shift+F10 Delete" style="cursor:move" pointer-events="bounding-box">${esc(typeText+(ip?' · '+ip:''))}</text>${typeSel?`<circle class="topo-label-resize" data-resize-kind="label" data-device-label="${esc(id)}" data-label-kind="type" cx="${typeAt[0]+w/2+5}" cy="${typeAt[1]-fs/2}" r="4.5" fill="#38bdf8" stroke="#eafaff" stroke-width="1.3" role="button" tabindex="0" aria-label="Resize device type label"/>`:''}</g>`;}
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
const WORKSPACE_VIEWS = new Set(['overview', 'incidents', 'workbench', 'build', 'infrastructure', 'protocols', 'design', 'automation', 'knowledge', 'journal', 'changes']);
function workspaceViewFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('view');
  return WORKSPACE_VIEWS.has(requested) ? requested : 'overview';
}
function showWorkspaceView(view, options = {}) {
  if (!WORKSPACE_VIEWS.has(view)) view = 'overview';
  const historyMode = options.historyMode || 'push';
  if (historyMode !== 'none') {
    const url = new URL(window.location.href);
    const current = url.searchParams.get('view');
    url.searchParams.set('view', view);
    if (historyMode === 'replace') window.history.replaceState({ networkWorkspaceView: view }, '', url);
    else if (current !== view) window.history.pushState({ networkWorkspaceView: view }, '', url);
  }
  const overview = $('#overview'), incidents = $('#incidentsView'), infrastructure = $('#infrastructureView'), protocols = $('#protocolsView'), design = $('#designView'), automation = $('#automationView'), knowledge = $('#knowledgeView'), journal = $('#journalView'), changes = $('#changeView'), cols = $('#cols');
  if (!overview || !incidents || !infrastructure || !protocols || !design || !automation || !knowledge || !journal || !changes || !cols) return;
  overview.hidden = view !== 'overview';
  incidents.hidden = view !== 'incidents';
  infrastructure.hidden = view !== 'infrastructure';
  protocols.hidden = view !== 'protocols';
  design.hidden = view !== 'design';
  automation.hidden = view !== 'automation';
  knowledge.hidden = view !== 'knowledge';
  journal.hidden = view !== 'journal';
  changes.hidden = view !== 'changes';
  cols.hidden = view !== 'workbench' && view !== 'build';
  // The console is docked inside #cols, so it hides with the workspace. Its opener
  // lives in the fixed top-bar "Build ▾" menu, which is always in a stable place.
  if (cols.hidden) collapseTerminalWindow();
  document.querySelectorAll('#navRail .nav-item[data-view]').forEach(b => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const buildButton = $('#btnBuild');
  if (buildButton) { if (view === 'build') buildButton.setAttribute('aria-current', 'page'); else buildButton.removeAttribute('aria-current'); }
  if (view === 'workbench') setTimeout(() => $('#tin') && $('#tin').focus(), 0);
  if (view === 'incidents') renderIncidentCenter();
  if (view === 'infrastructure') renderInfrastructureView();
  if (view === 'protocols') renderProtocolLab();
  if (view === 'design') renderDesignAcademy();
  if (view === 'automation') renderAutomationWorkshop();
  if (view === 'knowledge') renderKnowledgeCenter();
  if (view === 'journal') renderJournalPage();
  if (view === 'changes') renderChangeManagement();
}

const CROSS_TRACK_KEY = 'lsa-cross-track-web-availability-v1';
function crossTrackProgress() { try { const value = JSON.parse(localStorage.getItem(CROSS_TRACK_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (e) { return {}; } }
function markCrossTrackProgress(track) { const value = crossTrackProgress(); value[track] = true; value.updatedAt = new Date().toISOString(); try { localStorage.setItem(CROSS_TRACK_KEY, JSON.stringify(value)); } catch (e) {} }

function renderOverview() {
  const root = $('#overview'); if (!root || !RUN) return;
  const d = dashboardSnapshot();
  const count = status => d.devices.filter(x => x.status === status).length;
  const priorityClass = p => 'tk-' + String(p || 'p3').toLowerCase();
  const deviceRows = d.devices.map(x => `<tr><td><b>${esc(x.id)}</b><small>${esc(x.kind)}</small></td><td class="mono">${esc(x.ip || 'No address')}</td><td><span class="health health-${x.status}"><i></i>${x.status}</span></td><td class="mono">${x.up}/${x.total}</td></tr>`).join('');
  const incidentRows = d.active.slice(0, 5).map(t => `<article class="overview-incident"><div class="oi-head"><b>${esc(t.id)}</b><span class="tk-pri ${priorityClass(t.priority)}">${esc(t.priority)}</span><span class="ticket-state state-${esc(t.status)}">${esc(t.status)}</span></div><strong>${esc(t.title)}</strong><p>${esc(t.symptom)}</p><div class="oi-foot"><span>${esc(t.service)}</span><button class="btn sm" data-overview-ticket="${esc(t.id)}">Investigate →</button></div></article>`).join('');
  const activityRows = d.activity.map(e => `<article class="overview-activity"><span class="activity-dot"></span><div><b>${esc(e.type || 'Activity')}</b><p>${esc([e.ticket,e.device,e.text].filter(Boolean).join(' · ') || e.command || 'Recorded in engineering journal')}</p><time>${esc(new Date(e.at).toLocaleString())}</time></div></article>`).join('');
  const flowRows = d.flows.map(f => `<div class="overview-flow ${f.ok ? 'flow-ok' : 'flow-bad'}"><b>${esc((f.proto || 'icmp').toUpperCase())}</b><span>${esc(M.ipStr(f.src))} → ${esc(M.ipStr(f.dst))}</span><strong>${f.ok ? 'Delivered' : 'Dropped'}</strong></div>`).join('');
  const crossTrack = crossTrackProgress();
  const crossIndex = chapters.findIndex(m => m.id === 'cross-track-web-availability-network');
  // Curriculum progression (soft-gated: nothing is locked; this is guidance).
  const tierState = TIERS.map(t => {
    const ms = missionsInTier(t.id);
    const done = ms.filter(c => PROG.done[c.id]).length;
    const nextMission = ms.find(c => !PROG.done[c.id]) || null;
    return { tier: t, ms, done, total: ms.length, complete: done === ms.length && ms.length > 0,
      capstoneDone: !!PROG.done[t.capstone], nextMission };
  });
  const activeTierState = tierState.find(s => !s.complete) || null; // lowest incomplete tier
  const recMission = activeTierState && activeTierState.nextMission;
  const recIndex = recMission ? chapters.findIndex(c => c.id === recMission.id) : -1;
  const tierCards = tierState.map(s => {
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    const isActive = activeTierState && s.tier.id === activeTierState.tier.id;
    const cap = chapters.find(c => c.id === s.tier.capstone);
    const status = s.complete ? 'complete' : (isActive ? 'active' : (s.done > 0 ? 'started' : 'upcoming'));
    return `<article class="curriculum-tier tier-${status}">
      <div class="ct-head"><span class="ct-badge">Tier ${s.tier.order}</span><b>${esc(s.tier.name)}</b><span class="ct-count">${s.done}/${s.total}</span></div>
      <div class="ct-track"><i style="width:${pct}%"></i></div>
      <p class="ct-blurb">${esc(s.tier.blurb)}</p>
      <div class="ct-capstone ${s.capstoneDone ? 'cap-done' : ''}">${s.capstoneDone ? '✓' : '◍'} Capstone: ${esc(cap ? cap.title : s.tier.capstone)}</div>
    </article>`;
  }).join('');
  root.innerHTML = `
    <div class="overview-heading"><div><div class="eyebrow">Network operations · training lab</div><h1>Operations overview</h1><p>Start your shift here. Review the simulated network, take ownership of incidents and continue hands-on work.</p></div><div class="overview-live"><i></i> SIMULATION DATA · LIVE</div></div>
    <div class="overview-actions"><button class="btn primary" id="overviewWorkbench">⌘ Open workbench</button><button class="btn" id="overviewIncidents">◈ Incident queue <span class="overview-count">${d.active.length}</span></button><button class="btn" id="overviewInfrastructure">▤ Infrastructure</button><button class="btn" id="overviewHelp">? Command help</button><button class="btn" id="overviewJournal">▧ Work journal</button></div>
    <section class="overview-metrics" aria-label="Network summary">
      <article class="overview-metric"><span>Devices healthy</span><strong>${count('healthy')}<small> / ${d.devices.length}</small></strong><em>${count('degraded')} degraded · ${count('offline')} offline</em></article>
      <article class="overview-metric"><span>Links operational</span><strong>${d.linksUp}<small> / ${d.linksTotal}</small></strong><em>${d.linksTotal - d.linksUp} links down</em></article>
      <article class="overview-metric metric-alert"><span>Open incidents</span><strong>${d.active.length}</strong><em>${d.active.filter(t => t.priority === 'P1' || t.priority === 'P2').length} priority 1–2</em></article>
      <article class="overview-metric"><span>Resolved tickets</span><strong>${d.resolved}<small> / ${d.total}</small></strong><em>${PROG.xp} XP · ${esc(rankFor(PROG.xp))}</em></article>
    </section>
    <section class="curriculum-panel" aria-label="Curriculum progression">
      <div class="curriculum-head">
        <div><span class="eyebrow">Skills curriculum · recommended path</span><h2>Progression roadmap</h2><p>Five tiers from Foundations to Integrated Operations. Everything stays unlocked — this is the suggested order, not a gate.</p></div>
        ${recMission ? `<div class="curriculum-next"><span class="eyebrow">Recommended next · Tier ${activeTierState.tier.order}</span><strong>${esc(recMission.chapter)} — ${esc(recMission.title)}</strong><button class="btn sm primary" id="curriculumResume">Resume training →</button></div>` : `<div class="curriculum-next curriculum-done"><strong>🎓 All ${chapters.length} missions cleared</strong><span>Final rank ${esc(rankFor(PROG.xp))} · ${PROG.xp} XP</span></div>`}
      </div>
      <div class="curriculum-tiers">${tierCards}</div>
    </section>
    <div class="overview-grid">
      <section class="overview-panel"><div class="overview-panel-head"><div><span class="eyebrow">Integrated operations · P1 case</span><h2>The unavailable Halcyon portal</h2></div><span class="ticket-state ${crossTrack.linux && crossTrack.network ? 'state-resolved' : 'state-investigating'}">${crossTrack.linux && crossTrack.network ? 'case complete' : 'two-track case'}</span></div><p>Coordinate Linux service recovery with network name-resolution and reachability checks. Each discipline is verified in its own simulator.</p><div class="cross-track-status"><span>${crossTrack.linux ? '✓' : '○'} Linux service recovery</span><span>${crossTrack.network ? '✓' : '○'} Network access recovery</span></div><div class="oi-foot"><button class="btn sm primary" id="crossTrackStart">Start network task</button><button class="btn sm" id="crossTrackLinux">Open Linux case</button></div></section>
      <section class="overview-panel"><div class="overview-panel-head"><div><span class="eyebrow">Integrated operations · P1 case</span><h2>Restore secure remote administration</h2></div><span class="ticket-state ${crossTrack.remoteLinux && crossTrack.remoteNetwork ? 'state-resolved' : 'state-investigating'}">${crossTrack.remoteLinux && crossTrack.remoteNetwork ? 'case complete' : 'two-track case'}</span></div><p>Restore the SSH daemon on Linux and repair the network management ACL without exposing unrelated services.</p><div class="cross-track-status"><span>${crossTrack.remoteLinux ? '✓' : '○'} Linux SSH service</span><span>${crossTrack.remoteNetwork ? '✓' : '○'} Network SSH policy</span></div><div class="oi-foot"><button class="btn sm primary" id="remoteAdminStart">Start network task</button><button class="btn sm" id="remoteAdminLinux">Open Linux task</button></div></section>
      <section class="overview-panel"><div class="overview-panel-head"><div><span class="eyebrow">Integrated operations · P1 case</span><h2>Harden remote administration</h2></div><span class="ticket-state ${crossTrack.hardeningLinux && crossTrack.hardeningNetwork ? 'state-resolved' : 'state-investigating'}">${crossTrack.hardeningLinux && crossTrack.hardeningNetwork ? 'case complete' : 'two-track case'}</span></div><p>Restore host-level brute-force protection and restrict SSH at the network boundary without interrupting user web traffic.</p><div class="cross-track-status"><span>${crossTrack.hardeningLinux ? '✓' : '○'} Linux Fail2Ban service</span><span>${crossTrack.hardeningNetwork ? '✓' : '○'} Network least-privilege ACL</span></div><div class="oi-foot"><button class="btn sm primary" id="sshHardeningStart">Start network task</button><button class="btn sm" id="sshHardeningLinux">Open Linux task</button></div></section>
      <section class="overview-panel"><div class="overview-panel-head"><div><span class="eyebrow">Integrated operations · P1 case</span><h2>Contain compromised contractor access</h2></div><span class="ticket-state ${crossTrack.contractorLinux && crossTrack.contractorNetwork ? 'state-resolved' : 'state-investigating'}">${crossTrack.contractorLinux && crossTrack.contractorNetwork ? 'case complete' : 'two-track case'}</span></div><p>Remove unnecessary Linux sudo access and contain the confirmed SSH source at the network boundary, while preserving legitimate administration and HTTPS.</p><div class="cross-track-status"><span>${crossTrack.contractorLinux ? '✓' : '○'} Linux account privilege removal</span><span>${crossTrack.contractorNetwork ? '✓' : '○'} Network source containment</span></div><div class="oi-foot"><button class="btn sm primary" id="contractorContainmentStart">Start network task</button><button class="btn sm" id="contractorContainmentLinux">Open Linux task</button></div></section>
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
  ['overviewIncidents','allIncidents'].forEach(id => click(id, () => showWorkspaceView('incidents')));
  click('overviewInfrastructure', () => showWorkspaceView('infrastructure'));
  ['overviewHelp'].forEach(id => click(id, openHelp));
  ['overviewJournal','allJournal'].forEach(id => click(id, openJournal));
  click('progressStats', openStats);
  click('curriculumResume', () => { if (recIndex >= 0) { showWorkspaceView('workbench'); reloadMission(recIndex); } });
  click('crossTrackStart', () => { if (crossIndex >= 0) reloadMission(crossIndex); });
  click('crossTrackLinux', () => { window.location.href='../index.html?crossTrack=web-availability'; });
  click('remoteAdminStart', () => { const index=chapters.findIndex(m => m.id === 'cross-track-remote-admin-network'); if(index>=0) reloadMission(index); });
  click('remoteAdminLinux', () => { window.location.href='../index.html?crossTrack=remote-admin'; });
  click('sshHardeningStart', () => { const index=chapters.findIndex(m => m.id === 'cross-track-ssh-hardening-network'); if(index>=0) reloadMission(index); });
  click('sshHardeningLinux', () => { window.location.href='../index.html?crossTrack=remote-admin'; });
  click('contractorContainmentStart', () => { const index=chapters.findIndex(m => m.id === 'cross-track-contractor-containment-network'); if(index>=0) reloadMission(index); });
  click('contractorContainmentLinux', () => { window.location.href='../index.html?crossTrack=contractor-containment'; });
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
  saveProg(); refreshOverview(); refreshIncidentCenter();
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
  wireModalDialog(wrap,'#closeS');
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  wrap.querySelector('#closeS').addEventListener('click', closeModal);
  const filter = () => { const value = wrap.querySelector('#queueFilter').value; wrap.querySelectorAll('.queue-ticket').forEach(row => { const t = tickets.find(x => x.id === row.dataset.ticket); row.hidden = value === 'open' ? t.status === 'resolved' : value !== 'all' && t.status !== value; }); };
  wrap.querySelector('#queueFilter').addEventListener('change', filter);
  wrap.querySelectorAll('[data-ack]').forEach(btn => btn.addEventListener('click', () => {
    const t = tickets.find(x => x.id === btn.dataset.ack); setTicketState(t.id, 'acknowledged', 'You');
    addJournalEntry({ type: 'ticket acknowledged', ticket: t.id, text: 'Accepted ownership. Reviewing impact and beginning triage.' });
    closeModal(); openTicketQueue();
  }));
  wrap.querySelectorAll('[data-work],[data-review]').forEach(btn => btn.addEventListener('click', () => {
    const t = tickets.find(x => x.id === (btn.dataset.work || btn.dataset.review));
    if (t.status !== 'resolved') setTicketState(t.id, 'investigating', 'You');
    closeModal(); MODE = 'play'; reloadMission(t.index);
    if (t.status !== 'resolved') addJournalEntry({ type: 'investigation started', ticket: t.id, text: 'Started investigation from the incident queue.' });
  }));
}
function incidentPriorityRank(p) { return ({ P1:0, P2:1, P3:2, P4:3 })[p] ?? 9; }
function renderIncidentCenter() {
  const root = $('#incidentsView'); if (!root) return;
  const tickets = allTickets().sort((a,b) => incidentPriorityRank(a.priority)-incidentPriorityRank(b.priority) || a.index-b.index);
  const counts = TICKET_STATES.reduce((o, state) => (o[state] = tickets.filter(t => t.status === state).length, o), {});
  const matches = tickets.filter(t => {
    const q = INCIDENT_FILTERS.query.toLowerCase();
    const text = [t.id,t.title,t.symptom,t.service,t.assigned].join(' ').toLowerCase();
    return (!q || text.includes(q)) &&
      (INCIDENT_FILTERS.status === 'all' || (INCIDENT_FILTERS.status === 'open' ? t.status !== 'resolved' : t.status === INCIDENT_FILTERS.status)) &&
      (INCIDENT_FILTERS.priority === 'all' || t.priority === INCIDENT_FILTERS.priority);
  });
  let selected = matches.find(t => t.id === INCIDENT_SELECTED) || matches[0] || null;
  INCIDENT_SELECTED = selected ? selected.id : null;
  const list = matches.map(t => `<button type="button" class="incident-row${selected && selected.id === t.id ? ' active' : ''}" data-incident-select="${esc(t.id)}">
    <span class="incident-row-top"><b>${esc(t.id)}</b><span class="tk-pri tk-${esc(t.priority.toLowerCase())}">${esc(t.priority)}</span><span class="ticket-state state-${esc(t.status)}">${esc(t.status)}</span></span>
    <strong>${esc(t.title)}</strong><small>${esc(t.service)} · ${esc(t.assigned)}</small>
  </button>`).join('');
  const timeline = selected ? (PROG.journal || []).filter(e => e.ticket === selected.id).sort((a,b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0,8).map(e => `<article class="incident-timeline-item"><i></i><div><b>${esc(e.type || 'Activity')}</b><time>${esc(new Date(e.at).toLocaleString())}</time><p>${esc(e.text || e.command || e.output || 'Recorded activity')}</p>${e.command ? `<code>${esc(e.command)}</code>` : ''}</div></article>`).join('') : '';
  const detail = selected ? `
    <div class="incident-detail-head"><div><div class="eyebrow">Incident record · ${esc(selected.id)}</div><h2>${esc(selected.title)}</h2><div class="incident-detail-badges"><span class="tk-pri tk-${esc(selected.priority.toLowerCase())}">${esc(selected.priority)}</span><span class="ticket-state state-${esc(selected.status)}">${esc(selected.status)}</span></div></div><span class="incident-sla">SLA target <b>${esc(selected.sla)}</b></span></div>
    <div class="incident-symptom"><span class="label2">Reported symptom</span><p>${esc(selected.symptom)}</p></div>
    <div class="incident-facts"><div><small>Service</small><b>${esc(selected.service)}</b></div><div><small>Impact</small><b>${esc(selected.impact)}</b></div><div><small>Reported by</small><b>${esc(selected.from)}</b></div><div><small>Assigned to</small><b>${esc(selected.assigned)}</b></div><div><small>Last updated</small><b>${selected.updatedAt ? esc(new Date(selected.updatedAt).toLocaleString()) : 'Not updated'}</b></div><div><small>Training scenario</small><b>${esc(selected.chapter)}</b></div></div>
    <div class="incident-assignment"><label for="incidentAssignee">Ownership</label><select id="incidentAssignee"><option${selected.assigned === 'You' ? ' selected' : ''}>You</option><option${selected.assigned === 'Network Operations' ? ' selected' : ''}>Network Operations</option><option${selected.assigned === 'L2 Network Engineering' ? ' selected' : ''}>L2 Network Engineering</option></select><button class="btn sm" id="incidentAssignSave">Update owner</button></div>
    <div class="incident-actions"><button class="btn" id="incidentExportReport">Export incident report</button>${selected.status === 'new' ? '<button class="btn primary" id="incidentAcknowledge">Acknowledge</button>' : ''}
      ${selected.status === 'resolved' ? '<button class="btn" id="incidentReview">Review in Workbench</button>' : '<button class="btn primary" id="incidentInvestigate">Investigate in Workbench →</button>'}
    </div>
    <div class="incident-timeline"><div class="label2">Investigation timeline</div>${timeline || '<p class="dim">No ticket-linked activity yet. Acknowledge the incident or start an investigation to create the first record.</p>'}</div>
    ${selected.status === 'resolved' ? (() => {
      const evidence = (PROG.journal || []).filter(e => e.ticket === selected.id);
      const commands = evidence.filter(e => e.command).length;
      const outputs = evidence.filter(e => e.output || e.result).length;
      const evidenceRecords = evidence.filter(e => e.command || e.output || e.result).length;
      return `<section class="incident-timeline incident-closure-review" aria-labelledby="incidentClosureHeading">
        <div class="label2" id="incidentClosureHeading">Closure review · evidence and handover</div>
        <p>Use this review to assess the quality of the incident record. Activity counts are indicators only; they do not prove that service recovery or business impact was independently verified.</p>
        <div class="incident-facts">
          <div><small>Timeline entries</small><b>${evidence.length}</b></div>
          <div><small>Command records</small><b>${commands}</b></div>
          <div><small>Output / result records</small><b>${outputs}</b></div>
          <div><small>Evidence-bearing entries</small><b>${evidenceRecords}</b></div>
        </div>
        <h3>Before closing the record</h3>
        <ul>
          <li>Attach the before-and-after state and the exact command or test used to validate recovery.</li>
          <li>Confirm the affected user or service path works, and record any remaining limitations.</li>
          <li>Record the root cause separately from symptoms, contributing factors and assumptions.</li>
          <li>Identify the owner for follow-up actions, monitoring and rollback if the fault returns.</li>
        </ul>
        <h3>Handover questions</h3>
        <ol>
          <li>What evidence rules out the most plausible alternative cause?</li>
          <li>Which change restored service, and how was its scope kept minimal?</li>
          <li>What should the next shift monitor, and what condition requires escalation?</li>
        </ol>
      </section>`;
    })() : ''}`
    : '<div class="incident-detail-empty"><b>No incidents match these filters</b><p>Adjust the filters to see more of the queue.</p></div>';
  root.innerHTML = `
    <div class="incident-page-heading"><div><div class="eyebrow">Network operations · service desk</div><h1>Incident management</h1><p>Own the ticket lifecycle: prioritize, acknowledge, investigate with evidence and verify before resolution.</p></div><button class="btn" id="incidentOverviewBack">← Operations overview</button></div>
    <div class="incident-summary"><article><b>${counts.new}</b><span>New</span></article><article><b>${counts.acknowledged}</b><span>Acknowledged</span></article><article><b>${counts.investigating}</b><span>Investigating</span></article><article><b>${counts.resolved}</b><span>Resolved</span></article><article class="incident-summary-open"><b>${tickets.filter(t => t.status !== 'resolved').length}</b><span>Open incidents</span></article></div>
    <div class="incident-workspace">
      <section class="incident-queue-panel"><div class="incident-queue-heading"><div><span class="eyebrow">Service desk queue</span><h2>All incidents <small>${matches.length} shown</small></h2></div></div>
        <div class="incident-filters"><input id="incidentSearch" type="search" value="${esc(INCIDENT_FILTERS.query)}" placeholder="Search ID, symptom, service…"/><div><select id="incidentStatus"><option value="open"${INCIDENT_FILTERS.status==='open'?' selected':''}>Open incidents</option><option value="all"${INCIDENT_FILTERS.status==='all'?' selected':''}>All statuses</option><option value="new"${INCIDENT_FILTERS.status==='new'?' selected':''}>New</option><option value="acknowledged"${INCIDENT_FILTERS.status==='acknowledged'?' selected':''}>Acknowledged</option><option value="investigating"${INCIDENT_FILTERS.status==='investigating'?' selected':''}>Investigating</option><option value="resolved"${INCIDENT_FILTERS.status==='resolved'?' selected':''}>Resolved</option></select><select id="incidentPriority"><option value="all"${INCIDENT_FILTERS.priority==='all'?' selected':''}>All priorities</option><option value="P1"${INCIDENT_FILTERS.priority==='P1'?' selected':''}>P1 · Critical</option><option value="P2"${INCIDENT_FILTERS.priority==='P2'?' selected':''}>P2 · High</option><option value="P3"${INCIDENT_FILTERS.priority==='P3'?' selected':''}>P3 · Medium</option><option value="P4"${INCIDENT_FILTERS.priority==='P4'?' selected':''}>P4 · Low</option></select></div></div>
        <div class="incident-list" id="incidentList">${list || '<div class="overview-empty">No incidents match your filters.</div>'}</div>
      </section>
      <section class="incident-detail-panel" id="incidentDetail">${detail}</section>
    </div>`;
  root.querySelector('#incidentOverviewBack').addEventListener('click', () => showWorkspaceView('overview'));
  root.querySelector('#incidentSearch').addEventListener('input', e => { INCIDENT_FILTERS.query = e.target.value; renderIncidentCenter(); const el=$('#incidentSearch'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); });
  root.querySelector('#incidentStatus').addEventListener('change', e => { INCIDENT_FILTERS.status=e.target.value; renderIncidentCenter(); });
  root.querySelector('#incidentPriority').addEventListener('change', e => { INCIDENT_FILTERS.priority=e.target.value; renderIncidentCenter(); });
  root.querySelectorAll('[data-incident-select]').forEach(b => b.addEventListener('click', () => { INCIDENT_SELECTED=b.dataset.incidentSelect; renderIncidentCenter(); }));
  const exportReport = root.querySelector('#incidentExportReport');
  if (exportReport) exportReport.addEventListener('click', () => exportIncidentReport(selected));
  const acknowledge = root.querySelector('#incidentAcknowledge');
  if (acknowledge) acknowledge.addEventListener('click', () => {
    setTicketState(selected.id, 'acknowledged', 'You');
    addJournalEntry({ type:'ticket acknowledged', ticket:selected.id, text:'Accepted ownership and began incident triage.' });
    renderIncidentCenter();
  });
  const assign = root.querySelector('#incidentAssignSave');
  if (assign) assign.addEventListener('click', () => {
    const owner = root.querySelector('#incidentAssignee').value;
    setTicketState(selected.id, selected.status, owner);
    addJournalEntry({ type:'ownership updated', ticket:selected.id, text:'Assigned to '+owner+'.' });
    renderIncidentCenter();
  });
  const investigate = root.querySelector('#incidentInvestigate');
  if (investigate) investigate.addEventListener('click', () => {
    setTicketState(selected.id, 'investigating', 'You');
    addJournalEntry({ type:'investigation started', ticket:selected.id, text:'Opened the incident scenario in the Workbench.' });
    MODE='play'; reloadMission(selected.index);
  });
  const review = root.querySelector('#incidentReview');
  if (review) review.addEventListener('click', () => { MODE='play'; reloadMission(selected.index); });
}
function exportIncidentReport(ticket) {
  if (!ticket) return;
  const entries = (PROG.journal || []).filter(e => e.ticket === ticket.id).slice().sort((a,b) => new Date(a.at || 0) - new Date(b.at || 0));
  const fence = String.fromCharCode(96).repeat(3);
  const lines = [
    '# Incident investigation report', '',
    '- Incident: '+ticket.id, '- Title: '+ticket.title, '- Status: '+ticket.status,
    '- Priority: '+ticket.priority, '- Service: '+ticket.service, '- Impact: '+ticket.impact,
    '- Reported by: '+ticket.from, '- Assigned to: '+ticket.assigned, '- SLA target: '+ticket.sla,
    '- Scenario: '+ticket.chapter, '- Exported: '+new Date().toISOString(), '',
    '## Reported symptom', ticket.symptom || 'Not recorded', '', '## Investigation timeline',
    ...(entries.length ? entries.map(e => [
      '### '+(e.type || 'Activity')+' — '+new Date(e.at || 0).toLocaleString(), e.text || '',
      e.command ? 'Command: '+e.command : '', e.device ? 'Device: '+e.device : '', e.result ? 'Result: '+e.result : '',
      e.output ? 'Output:\n\n'+fence+'text\n'+e.output+'\n'+fence : ''
    ].filter(Boolean).join('\n\n')) : ['No ticket-linked activity recorded.']),
    '', '## Closure review',
    'Evidence-bearing journal entries: '+entries.filter(e => e.command || e.output || e.result).length,
    'Command records: '+entries.filter(e => e.command).length,
    'Output / result records: '+entries.filter(e => e.output || e.result).length,
    '', '### Closure checklist',
    '- Confirm recovery with a user-visible service test and preserve before/after evidence.',
    '- Separate the confirmed root cause from symptoms, contributing factors and assumptions.',
    '- Record residual risk, monitoring, follow-up owner and rollback criteria.',
    '', '### Handover prompts',
    '- What evidence rules out the most plausible alternative cause?',
    '- Which minimal change restored service, and how was its scope validated?',
    '- What should the next shift monitor, and what condition requires escalation?'
  ];
  const blob = new Blob([lines.join('\n')], {type:'text/markdown;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='incident-'+String(ticket.id).toLowerCase()+'-report.md'; a.click(); URL.revokeObjectURL(url);
}
function refreshIncidentCenter() { if ($('#incidentsView') && !$('#incidentsView').hidden) renderIncidentCenter(); }

function infrastructureSnapshot() {
  return Object.entries((RUN && RUN.net && RUN.net.devices) || {}).map(([id,d]) => {
    const ports = Object.entries(d.ifaces || {}), up = ports.filter(([,f]) => f.up !== false && f.errDisabled !== true).length;
    const attached = (RUN.net.links || []).filter(l => l.a[0] === id || l.b[0] === id);
    const linksUp = attached.filter(l => !linkDown(RUN.net,l)).length;
    const status = !ports.length || up === 0 ? 'offline' : up < ports.length || linksUp < attached.length ? 'degraded' : 'healthy';
    const addresses = ports.filter(([,f]) => f.ip != null && f.up !== false).map(([name,f]) => ({ name, address:M.ipStr(f.ip)+'/'+(f.mask ?? 24) }));
    const vlans = d.kind === 'switch' ? [...new Set([1,...(d.vlans || []),...ports.map(([,f]) => Number(f.mode === 'trunk' ? f.nativeVlan ?? 1 : f.accessVlan ?? f.vlan ?? 1))])].sort((a,b)=>a-b) : [];
    return { id, device:d, kind:d.kind || 'device', ports, up, total:ports.length, attached:attached.length, linksUp, status, addresses, vlans };
  });
}
function renderInfrastructureView() {
  const root = $('#infrastructureView'); if (!root || !RUN) return;
  const devices = infrastructureSnapshot();
  const counts = { hosts:0, switches:0, routers:0, firewalls:0, down:0 };
  devices.forEach(d => { if (d.kind === 'switch') counts.switches++; else if (d.kind === 'router') counts.routers++; else if (d.kind === 'firewall') counts.firewalls++; else counts.hosts++; if (d.status !== 'healthy') counts.down++; });
  const matches = devices.filter(d => {
    const q = INFRA_FILTERS.query.toLowerCase(), text = [d.id,d.kind,...d.addresses.map(a=>a.address)].join(' ').toLowerCase();
    return (!q || text.includes(q)) && (INFRA_FILTERS.kind === 'all' || d.kind === INFRA_FILTERS.kind) && (INFRA_FILTERS.status === 'all' || d.status === INFRA_FILTERS.status);
  });
  const selected = matches.find(d => d.id === INFRA_SELECTED) || matches[0] || null;
  INFRA_SELECTED = selected ? selected.id : null;
  const rows = matches.map(d => `<button type="button" class="infra-device-row${selected && selected.id === d.id ? ' active' : ''}" data-infra-device="${esc(d.id)}">
    <span class="infra-kind-icon">${d.kind === 'switch' ? '▦' : d.kind === 'router' ? '⌁' : d.kind === 'firewall' ? '⬡' : '▣'}</span>
    <span class="infra-device-main"><b>${esc(d.id)}</b><small>${esc(d.kind)} · ${esc(d.addresses[0]?.address || 'No configured IP')}</small></span>
    <span class="health health-${d.status}"><i></i>${d.status}</span>
    <span class="infra-port-count">${d.up}/${d.total} ports</span>
  </button>`).join('');
  let detail = '<div class="infra-detail-empty"><b>Select a device</b><p>Choose an inventory record to inspect its interfaces, services and configuration.</p></div>';
  if (selected) {
    const d = selected.device;
    const interfaces = selected.ports.map(([name,f]) => {
      const state = f.errDisabled ? 'ERR-DISABLED' : f.up === false ? 'DOWN' : 'UP';
      const mode = f.mode === 'trunk' ? 'TRUNK' : d.kind === 'switch' ? 'ACCESS' : 'L3';
      const vlan = d.kind === 'switch' ? (f.mode === 'trunk' ? 'Native '+Number(f.nativeVlan ?? 1)+' · '+(Array.isArray(f.allowedVlans)?f.allowedVlans.join(', '):'all allowed') : 'VLAN '+Number(f.accessVlan ?? f.vlan ?? 1)) : '—';
      return `<tr><td><b>${esc(name)}</b></td><td class="mono">${f.ip != null ? esc(M.ipStr(f.ip)+'/'+(f.mask ?? 24)) : 'Unassigned'}</td><td><span class="health health-${state === 'UP' ? 'healthy' : 'offline'}">${state}</span></td><td>${mode}</td><td>${vlan}</td></tr>`;
    }).join('');
    const routes = (d.routes || []).map(r => `<tr><td class="mono">${r.mask === 0 ? '0.0.0.0/0' : esc(M.ipStr(r.dest)+'/'+r.mask)}</td><td class="mono">${esc(M.ipStr(r.via))}</td><td>Static</td></tr>`).join('');
    const acls = (d.acls || []).map((r,i) => `<tr><td>${i+1}</td><td>${esc((r.action || 'allow').toUpperCase())}</td><td>${esc(r.proto || 'any')}</td><td>${r.src != null ? esc(M.ipStr(r.src)) : 'any'}</td><td>${r.dst != null ? esc(M.ipStr(r.dst)) : r.dstnet ? esc(M.ipStr(r.dstnet.net)+'/'+r.dstnet.prefix) : 'any'}</td><td>${r.dport != null ? r.dport : 'any'}</td></tr>`).join('');
    const services = Object.entries(d.services || {}).map(([port,name]) => `<tr><td>${esc(port)}</td><td>${esc(typeof name === 'string' ? name : 'service')}</td><td><span class="health health-healthy">CONFIGURED</span></td></tr>`).join('');
    const protocolNotes = [];
    if (d.kind === 'router') {
      const ospfIfs = Object.entries(d.ifaces || {}).filter(([,f]) => f.ospf != null).map(([name,f]) => name+' · area '+f.ospf);
      if (ospfIfs.length) protocolNotes.push('OSPF: '+ospfIfs.join(', '));
      if (d.bgp && d.bgp.asn != null) protocolNotes.push('BGP: local AS '+d.bgp.asn+' · '+(d.bgp.neighbors || []).length+' peers configured');
    }
    if (d.ntp) {
      const ntp = M.ntpStatus(RUN.net,selected.id);
      protocolNotes.push('NTP: '+(ntp.synchronized ? 'synchronized · '+(ntp.source || 'local clock') : ntp.reason));
    }
    if (d.dhcp) protocolNotes.push('DHCP: server/pool configuration present');
    if (d.resolver != null) protocolNotes.push('DNS resolver: '+(typeof d.resolver === 'number' ? M.ipStr(d.resolver) : String(d.resolver)));
    if (d.dns && Object.keys(d.dns).length) protocolNotes.push('DNS zones: '+Object.keys(d.dns).join(', '));
    if (d.syslog) protocolNotes.push('Syslog: '+(d.syslog.enabled === false ? 'disabled' : 'enabled')+' · '+(d.syslog.hosts || []).length+' collectors');
    const vlanRows = selected.vlans.map(v => {
      const st = d.kind === 'switch' && typeof M.spanningTree === 'function' ? M.spanningTree(RUN.net,v).switches[selected.id] : null;
      return `<tr><td>VLAN ${v}</td><td>${st ? esc(st.root) : '—'}</td><td>${st ? st.priority : '—'}</td><td>${st ? Object.values(st.ports).filter(p=>p.state==='blocking').length : '—'}</td></tr>`;
    }).join('');
    const history = (PROG.journal || []).filter(e => e.device === selected.id || e.ticket && RUN.mission && RUN.mission.ticket && e.ticket === RUN.mission.ticket.id).slice(0,5).map(e => `<article class="infra-history-item"><b>${esc(e.type || 'Activity')}</b><time>${esc(new Date(e.at).toLocaleString())}</time><p>${esc(e.command || e.text || e.output || 'Configuration activity')}</p></article>`).join('');
    detail = `
      <div class="infra-detail-heading"><div><div class="eyebrow">Inventory record · ${esc(selected.id)}</div><h2>${esc(selected.id)} · ${esc(selected.kind)}</h2><p>${esc(selected.addresses.map(a=>a.address).join(' · ') || 'No configured management address')}</p></div><button class="btn primary" id="infraOpenWorkbench">Open in Workbench →</button></div>
      <div class="infra-detail-stats"><span><b>${selected.up}/${selected.total}</b> interfaces up</span><span><b>${selected.linksUp}/${selected.attached}</b> links operational</span><span><b>${(d.routes||[]).length}</b> routes</span><span><b>${(d.acls||[]).length}</b> ACL rules</span></div>
      <section class="infra-section"><div class="infra-section-head"><h3>Interfaces</h3><span>${selected.total} interfaces</span></div><div class="infra-table-wrap"><table class="infra-table"><thead><tr><th>Interface</th><th>Address</th><th>State</th><th>Mode</th><th>VLAN / trunk</th></tr></thead><tbody>${interfaces || '<tr><td colspan="5">No interfaces configured.</td></tr>'}</tbody></table></div></section>
      ${d.kind === 'switch' ? `<section class="infra-section"><div class="infra-section-head"><h3>VLAN and spanning-tree inventory</h3><span>${selected.vlans.length} VLANs</span></div><div class="infra-table-wrap"><table class="infra-table"><thead><tr><th>VLAN</th><th>Root bridge</th><th>Priority</th><th>Blocked ports</th></tr></thead><tbody>${vlanRows || '<tr><td colspan="4">No VLAN data.</td></tr>'}</tbody></table></div></section>` : ''}
      ${d.kind !== 'switch' ? `<section class="infra-section"><div class="infra-section-head"><h3>Routing table</h3><span>${(d.routes||[]).length} routes</span></div><div class="infra-table-wrap"><table class="infra-table"><thead><tr><th>Destination</th><th>Next hop</th><th>Type</th></tr></thead><tbody>${routes || '<tr><td colspan="3">No static routes configured.</td></tr>'}</tbody></table></div></section>` : ''}
      ${d.kind === 'router' || d.kind === 'firewall' ? `<section class="infra-section"><div class="infra-section-head"><h3>Security policy</h3><span>${(d.acls||[]).length} rules</span></div><div class="infra-table-wrap"><table class="infra-table"><thead><tr><th>#</th><th>Action</th><th>Protocol</th><th>Source</th><th>Destination</th><th>Port</th></tr></thead><tbody>${acls || '<tr><td colspan="6">No ACL rules configured.</td></tr>'}</tbody></table></div></section>` : ''}
      <section class="infra-section"><div class="infra-section-head"><h3>Configured services and protocols</h3></div><div class="infra-table-wrap"><table class="infra-table"><thead><tr><th>Port</th><th>Service</th><th>State</th></tr></thead><tbody>${services || '<tr><td colspan="3">No listening services declared on this device.</td></tr>'}</tbody></table></div><ul class="infra-protocol-notes">${protocolNotes.map(x=>'<li>'+esc(x)+'</li>').join('') || '<li>No additional protocol/service configuration detected.</li>'}</ul></section>
      <section class="infra-section"><div class="infra-section-head"><h3>Recent configuration and activity history</h3><span>Local journal</span></div><div class="infra-history">${history || '<p class="dim">No device-specific journal entries yet.</p>'}</div></section>`;
  }
  root.innerHTML = `
      <div class="infra-page-heading"><div><div class="eyebrow">Network operations · current lab</div><h1>Infrastructure inventory</h1><p>Inspect the active scenario's devices, interface state, switching, routing, security and recorded engineering activity.</p></div><span class="overview-live"><i></i> CURRENT SCENARIO</span></div>
      <div class="infra-summary"><article><b>${devices.length}</b><span>Total devices</span></article><article><b>${counts.switches}</b><span>Switches</span></article><article><b>${counts.routers + counts.firewalls}</b><span>Routers / firewalls</span></article><article class="infra-summary-warn"><b>${counts.down}</b><span>Degraded / offline</span></article></div>
      <div class="infra-layout"><section class="infra-list-panel"><div class="infra-section-head"><div><span class="eyebrow">Device inventory</span><h2>All devices <small>${matches.length} shown</small></h2></div></div>
        <div class="infra-filters"><input id="infraSearch" type="search" value="${esc(INFRA_FILTERS.query)}" placeholder="Search hostname or IP…"/><div><select id="infraKind"><option value="all"${INFRA_FILTERS.kind==='all'?' selected':''}>All types</option><option value="host"${INFRA_FILTERS.kind==='host'?' selected':''}>Hosts / servers</option><option value="switch"${INFRA_FILTERS.kind==='switch'?' selected':''}>Switches</option><option value="router"${INFRA_FILTERS.kind==='router'?' selected':''}>Routers</option><option value="firewall"${INFRA_FILTERS.kind==='firewall'?' selected':''}>Firewalls</option></select><select id="infraStatus"><option value="all"${INFRA_FILTERS.status==='all'?' selected':''}>All states</option><option value="healthy"${INFRA_FILTERS.status==='healthy'?' selected':''}>Healthy</option><option value="degraded"${INFRA_FILTERS.status==='degraded'?' selected':''}>Degraded</option><option value="offline"${INFRA_FILTERS.status==='offline'?' selected':''}>Offline</option></select></div></div>
        <div class="infra-device-list">${rows || '<div class="overview-empty">No devices match these filters.</div>'}</div>
      </section><section class="infra-detail-panel">${detail}</section></div>`;
  root.querySelector('#infraSearch').addEventListener('input',e=>{INFRA_FILTERS.query=e.target.value;renderInfrastructureView();const el=$('#infraSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);});
  root.querySelector('#infraKind').addEventListener('change',e=>{INFRA_FILTERS.kind=e.target.value;renderInfrastructureView();});
  root.querySelector('#infraStatus').addEventListener('change',e=>{INFRA_FILTERS.status=e.target.value;renderInfrastructureView();});
  root.querySelectorAll('[data-infra-device]').forEach(b=>b.addEventListener('click',()=>{INFRA_SELECTED=b.dataset.infraDevice;renderInfrastructureView();}));
  const open=root.querySelector('#infraOpenWorkbench');
  if(open) open.addEventListener('click',()=>{showWorkspaceView('workbench');selectDevice(selected.id);});
}
function refreshInfrastructureView() { if ($('#infrastructureView') && !$('#infrastructureView').hidden) renderInfrastructureView(); }

function renderRequirements(m) {
  const items = (m.constraints || []).map(c => `<li>${esc(c)}</li>`).join('');
  return `<div class="design-brief-card">
    <div class="tk-top"><span class="tk-id">DESIGN BRIEF</span><span class="tk-pri design-tier">${esc(m.spec || 'design')}</span></div>
    <div class="label">Requirements</div>
    <ul class="req-list">${items}</ul>
    <p class="design-hint dim">Build it on the canvas: add devices from the library, use "Wire devices" to connect them, configure each from its console, then Check.</p>
  </div>`;
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
function renderDeviceExplorer() {
  const devices = Object.entries(RUN.net.devices || {});
  const rows = devices.map(([id, d]) => {
    const ports = Object.values(d.ifaces || {}), up = ports.filter(p => p.up !== false && p.errDisabled !== true).length;
    const state = !ports.length || up === 0 ? 'offline' : up < ports.length ? 'degraded' : 'healthy';
    return `<button type="button" class="explorer-device${id === SEL ? ' active' : ''}" data-explorer-dev="${esc(id)}" data-search="${esc((id+' '+d.kind+' '+(primaryIp(d)||'')).toLowerCase())}">
      <span class="explorer-device-icon">${d.kind === 'switch' ? '▦' : d.kind === 'router' ? '⌁' : d.kind === 'firewall' ? '⬡' : '▣'}</span>
      <span class="explorer-device-name"><b>${esc(id)}</b><small>${esc(d.kind)} · ${esc(primaryIp(d) || 'no IP')}</small></span>
      <i class="health-dot health-dot-${state}" title="${state}"></i>
    </button>`;
  }).join('');
  return `<section class="device-explorer"><div class="explorer-head"><div class="label">Device explorer <span>${devices.length}</span></div><input id="deviceSearch" type="search" placeholder="Filter devices…" aria-label="Filter devices"/></div><div class="explorer-list">${rows || '<p class="dim">No devices in this scenario.</p>'}</div></section>`;
}
function renderBrief() {
  const m = RUN.mission, solved = !!PROG.done[m.id];
  const indexOfMission = new Map(chapters.map((c, i) => [c.id, i]));
  const opt = c => `<option value="${indexOfMission.get(c.id)}"${c.id === m.id ? ' selected' : ''}>${PROG.done[c.id] ? '✓ ' : ''}${c.chapter} — ${c.title}</option>`;
  // Group the mission picker by curriculum tier so the recommended path is visible.
  const opts = TIERS.map(t => {
    const ms = missionsInTier(t.id);
    if (!ms.length) return '';
    const doneN = ms.filter(c => PROG.done[c.id]).length;
    return `<optgroup label="Tier ${t.order} · ${t.name} (${doneN}/${ms.length})">${ms.map(opt).join('')}</optgroup>`;
  }).join('');
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
  return `<select id="pick" aria-label="Select mission">${opts}</select>
    <div class="eyebrow">${esc(m.chapter)}${solved ? ' · <span class="done">solved</span>' : ''}</div>
    <h1>${esc(m.title)}</h1>
    ${m.mode === 'design' ? renderRequirements(m) : renderTicket(m)}
    <div class="label">What you know</div><p class="story">${esc(m.story)}</p>
    ${renderDeviceExplorer()}
    ${body}
    <div id="status" role="status" aria-live="polite" aria-atomic="true"></div>`;
}
function renderConfig() {
  const pal = renderPalette();
  if (!SEL || !RUN.net.devices[SEL]) return pal + '<div class="inspector-empty"><b>Device inspector</b><p class="dim">Select a device from the explorer or topology to inspect its interfaces, routes and policy.</p></div>';
  const d = RUN.net.devices[SEL];
  const panels = [];
  let overview = '';
  if (d.kind !== 'switch') {
    overview += `<div class="label2">Reachability</div>
      <div class="addrow"><input class="pingto" placeholder="host or IP" size="14"/><button class="btn sm" id="doping">Ping</button><button class="btn sm" id="dotrace">Traceroute</button></div>
      <div id="pingout" class="dim" style="margin:4px 0 8px;white-space:pre-wrap"></div><div class="label2">Interfaces</div>`;
    for (const n in d.ifaces) {
      const f = d.ifaces[n];
      overview += `<div class="ifrow" data-if="${esc(n)}"><span class="ifn">${esc(n)}</span><input class="ip" value="${f.ip != null ? M.ipStr(f.ip) : ''}" placeholder="address"/><span>/</span><input class="pfx" value="${f.mask != null ? f.mask : ''}" placeholder="24" size="2"/><label class="up"><input type="checkbox" class="upc"${f.up !== false ? ' checked' : ''}/>up</label></div>`;
    }
  } else {
    const vlans = [...new Set([1, ...(d.vlans || [])])].sort((a,b)=>a-b);
    overview += `<div class="label2">VLAN database</div><div class="dim">${vlans.map(v=>'VLAN '+v).join(' · ')}</div><div class="label2">Switch ports</div>`;
    for (const n in d.ifaces) {
      const f = d.ifaces[n], mode = f.mode === 'trunk' ? 'trunk' : 'access';
      overview += `<div class="rrow">${esc(n)} · ${mode} · ${mode === 'trunk' ? 'native '+Number(f.nativeVlan ?? 1)+' · allowed '+(Array.isArray(f.allowedVlans)?f.allowedVlans.join(','):'all') : 'VLAN '+Number(f.accessVlan ?? f.vlan ?? 1)} · ${f.up === false ? 'DOWN' : 'UP'}</div>`;
    }
    const activeVlan = Object.values(d.ifaces).map(p => p.mode === 'trunk' ? (Array.isArray(p.allowedVlans) ? p.allowedVlans[0] : Number(p.nativeVlan ?? 1)) : Number(p.accessVlan ?? p.vlan ?? 1)).find(v => v !== 1) || vlans.find(v => v !== 1) || 1;
    const tree = M.spanningTree(RUN.net, activeVlan), st = tree.switches[SEL];
    const blocked = st ? Object.entries(st.ports).filter(([,p]) => p.state === 'blocking').map(([port]) => port) : [];
    overview += `<div class="label2">Spanning Tree · VLAN ${activeVlan}</div><div class="dim">Root bridge: ${esc(st ? st.root : '—')} · Priority: ${st ? st.priority : '—'}<br>Blocked ports: ${blocked.length ? blocked.join(', ') : 'none'}</div>`;
    const learned = M.switchMacTable(RUN.net, SEL, activeVlan);
    overview += '<div class="label2">Learned MAC addresses</div>' + (learned.length
      ? learned.slice(0,8).map(e => `<div class="rrow">${esc(e.mac)} · ${esc(e.device)} · ${esc(e.port)} · VLAN ${e.vlan}</div>`).join('')
      : '<div class="dim">(no learned MAC addresses)</div>');
    overview += '<p class="dim pal-hint">Configure: vlan 10 · interface p1 · switchport access vlan 10 · spanning-tree vlan 10 priority 4096 · show spanning-tree · show mac address-table dynamic</p>';
  }
  panels.push({ id:'overview', label:d.kind === 'switch' ? 'Layer 2' : 'Overview', html:overview });

  // A consistent, read-only operational view of every interface on the selected device.
  let interfaces = '<div class="label2">Interface inventory</div><div class="iface-table-wrap"><table class="iface-table"><thead><tr><th>Interface</th><th>State</th><th>Address / VLAN</th><th>Connected peer</th><th>Operational details</th><th></th></tr></thead><tbody>';
  const stpTrees = d.kind === 'switch' ? (d.vlans || [1]).map(v => [v, M.spanningTree(RUN.net, v)]) : [];
  for (const [name, f] of Object.entries(d.ifaces || {})) {
    const state = f.errDisabled ? 'err-disabled' : f.up === false ? 'administratively down' : 'up';
    const peer = M.neighbor(RUN.net, SEL, name);
    const peerText = peer ? peer[0] + ' · ' + peer[1] : 'not connected';
    let address = f.ip != null ? M.ipStr(f.ip) + '/' + (f.mask ?? '—') : '—';
    if (d.kind === 'switch') address = f.mode === 'trunk'
      ? 'Trunk · native ' + Number(f.nativeVlan ?? 1) + ' · allowed ' + (Array.isArray(f.allowedVlans) ? f.allowedVlans.join(', ') : 'all')
      : 'Access · VLAN ' + Number(f.accessVlan ?? f.vlan ?? 1);
    const details = [];
    if (f.ospf != null) details.push('OSPF area ' + f.ospf);
    if (f.hsrp) details.push('HSRP ' + (M.hsrpStatus(RUN.net, SEL, name)?.state || 'configured'));
    const stp = stpTrees.map(([v, tree]) => ({v, port:tree.switches[SEL]?.ports?.[name]})).find(x => x.port);
    if (stp) details.push('STP VLAN ' + stp.v + ' ' + stp.port.state + (stp.port.role ? ' · ' + stp.port.role : ''));
    const ps = f.portSecurity;
    if (ps?.enabled) details.push('Port security · ' + (ps.secureMacs || []).length + '/' + Number(ps.maximum || 1) + ' MACs · ' + Number(ps.violations || 0) + ' violations');
    if (f.errDisabled) details.push('Err-disabled');
    interfaces += '<tr><td><b>' + esc(name) + '</b></td><td><span class="iface-state iface-' + (state === 'up' ? 'up' : 'down') + '">' + esc(state) + '</span></td><td class="mono">' + esc(address) + '</td><td>' + esc(peerText) + '</td><td>' + esc(details.join(' · ') || 'No additional protocol state') + '</td><td><button type="button" class="btn sm" data-iface-command="' + esc(name) + '">Inspect in CLI</button></td></tr>';
  }
  interfaces += '</tbody></table></div><p class="dim iface-note">This view reflects the active simulator state. Use the CLI action to inspect the device command output; this inventory does not represent live hardware.</p>';
  panels.push({ id:'interfaces', label:'Interfaces', html:interfaces });
  if (d.kind !== 'switch') {
    let routing = '<div class="label2">Static routes</div>';
    (d.routes || []).forEach((r, i) => { const dest = r.mask === 0 ? 'default' : M.ipStr(r.dest) + '/' + r.mask; routing += `<div class="rrow">${dest} via ${M.ipStr(r.via)} <button class="x" data-rt="${i}">✕</button></div>`; });
    routing += `<div class="addrow"><input class="rdest" placeholder="default or 10.0.3.0/24"/><input class="rvia" placeholder="via gateway"/><button class="btn sm" id="addrt">Add route</button></div>`;
    if (d.kind === 'router') {
      const ospfIfs = Object.entries(d.ifaces).filter(([,f]) => f.ospf != null).map(([n,f]) => `${n} area ${f.ospf}`).join(', ') || '(none)';
      const ons = (typeof M.ospfNeighbors === 'function') ? M.ospfNeighbors(RUN.net, SEL) : [];
      const ost = ons.map(n => `${n.id} ${M.ipStr(n.ip)} area ${n.area}`).join(' · ') || 'no neighbors';
      const ifopts = Object.keys(d.ifaces).map(n => `<option>${esc(n)}</option>`).join('');
      routing += `<div class="label2">OSPF</div><div class="dim" style="margin-bottom:6px">Enabled: ${esc(ospfIfs)}<br>Neighbors: ${esc(ost)}</div>
        <div class="addrow"><select class="oif">${ifopts}</select><input class="oarea" placeholder="area" value="0" size="4"/><button class="btn sm" id="ospfen">Enable</button></div>`;
      const b = d.bgp || { asn: '', neighbors: [], networks: [] };
      const neigh = (b.neighbors || []).map(n => `${M.ipStr(n.ip)} AS${n.remoteAs}`).join(', ') || '(none)';
      const nets = (b.networks || []).join(', ') || '(none)';
      const sess = (typeof M.bgpSessions === 'function') ? M.bgpSessions(RUN.net, SEL) : [];
      const st = sess.map(x => `${M.ipStr(x.ip)} ${x.up ? 'Established' : x.reason}`).join(' · ') || 'no session';
      routing += `<div class="label2">BGP</div><div class="dim" style="margin-bottom:6px">Neighbors: ${esc(neigh)}<br>Networks: ${esc(nets)}<br>Session: ${esc(st)}</div>
        <div class="addrow"><input class="basn" placeholder="local ASN" value="${b.asn != null ? b.asn : ''}" size="6"/><button class="btn sm" id="bgpasn">Set ASN</button></div>
        <div class="addrow"><input class="bnip" placeholder="neighbor IP" size="10"/><input class="bnas" placeholder="remote AS" size="6"/><button class="btn sm" id="bgpnei">Add neighbor</button></div>
        <div class="addrow"><input class="bnet" placeholder="10.0.8.0/24" size="12"/><button class="btn sm" id="bgpnet">Advertise</button></div>`;
    }
    panels.push({ id:'routing', label:'Routing', html:routing });
  }
  if (d.kind === 'router' || d.kind === 'firewall') {
    let security = '<div class="label2">Firewall policy · inbound</div>';
    const dstTxt = r => r.dst != null ? ' dst:' + M.ipStr(r.dst) : r.dstnet ? ' dst:' + M.ipStr(r.dstnet.net) + '/' + r.dstnet.prefix : '';
    (d.acls || []).forEach((r, i) => { security += `<div class="rrow">${r.action === 'deny' ? 'DROP' : 'ALLOW'} ${r.proto || 'all'} in:${r.dev || 'any'}${r.src != null ? ' src:' + M.ipStr(r.src) : ''}${dstTxt(r)}${r.dport != null ? ' dpt:' + r.dport : ''} <button class="x" data-acl="${i}">✕</button></div>`; });
    const ifopts = Object.keys(d.ifaces).map(n => `<option>${esc(n)}</option>`).join('');
    security += `<div class="addrow"><select class="aif">${ifopts}</select><select class="aproto"><option value="">any</option><option>tcp</option><option>udp</option><option>icmp</option></select><input class="adport" placeholder="dport" size="4"/><input class="asrc" placeholder="src IP" size="8"/><input class="adst" placeholder="dst IP/cidr" size="10"/><select class="aact"><option value="deny">DROP</option><option value="allow">ALLOW</option></select><button class="btn sm" id="addacl">Add</button></div>`;
    panels.push({ id:'security', label:'Security', html:security });
  }
  if (!panels.some(p => p.id === INSPECTOR_TAB)) INSPECTOR_TAB = 'overview';
  const tabs = panels.map(p => `<button type="button" class="inspector-tab${p.id === INSPECTOR_TAB ? ' active' : ''}" data-inspector-tab="${p.id}">${p.label}</button>`).join('');
  const panel = panels.find(p => p.id === INSPECTOR_TAB);
  // Command dialect / brand. 'generic' keeps the full hybrid command set; other
  // brands present a vendor command surface (help + guard live in net-cli.js).
  const brandOpts = brandsForKind(d.kind);
  const brand = BRANDS[d.brand] ? d.brand : 'generic';
  const brandable = brandOpts.length > 1;
  const brandChip = brand !== 'generic' ? ` <span class="brand-chip">${esc(BRANDS[brand].label)}</span>` : '';
  const brandRow = (canBuild() && brandable)
    ? `<label class="brand-row">Command set <select id="deviceBrand" aria-label="Device command set">${brandOpts.map(b => `<option value="${b}"${brand === b ? ' selected' : ''}>${esc(BRANDS[b].label)}</option>`).join('')}</select></label>`
    : '';
  return pal + `<div class="inspector-head"><div><span class="eyebrow">Selected device</span><h2>${esc(SEL)} · ${esc(d.kind)}${brandChip}</h2><p>${esc(primaryIp(d) || 'No primary IP')}</p></div><span class="inspector-state">${Object.values(d.ifaces || {}).filter(f => f.up !== false && f.errDisabled !== true).length}/${Object.keys(d.ifaces || {}).length} ports up</span></div>
    ${brandRow}
    <div class="inspector-tabs" role="group" aria-label="Device inspector sections">${tabs}</div>
    <section class="inspector-panel" role="region" aria-label="${esc(panel.label)}">${panel.html}</section>`;
}

/* ---------- actions ---------- */
function renderSessionTabs() {
  if (!RUN) return '';
  return Object.keys(RUN.net.devices).map(id => {
    const d=RUN.net.devices[id], session=TERM_SESSIONS[id] || {history:[],output:''};
    const label=d.hostname || id, count=(session.history || []).length;
    return `<button type="button" class="session-tab${id === SEL ? ' active' : ''}" data-session-device="${esc(id)}" aria-pressed="${id===SEL?'true':'false'}" title="${esc(label)} · ${esc(d.kind || 'device')} · ${count} commands in history"><span>${esc(label)}</span><small>${esc(d.kind || 'device')}</small></button>`;
  }).join('') || '<span class="dim">No device sessions</span>';
}
function cycleDeviceSession(direction) {
  if (!RUN) return;
  const ids=Object.keys(RUN.net.devices); if(ids.length<2)return;
  const current=Math.max(0,ids.indexOf(SEL));
  selectDevice(ids[(current+direction+ids.length)%ids.length]);
}
function clearActiveSessionOutput() {
  if (!SEL || !$('#tout')) return;
  $('#tout').textContent=`— Output cleared for ${SEL}. Command history is retained. —\n`;
  persistTerminalSession();
}

function refreshEvidenceTicketOptions() {
  const select=$('#termEvidenceTicket'); if(!select)return;
  const previous=select.value;
  const tickets=allTickets();
  select.innerHTML='<option value="">Unlinked evidence</option>'+tickets.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.id)+' · '+esc(t.title)+'</option>').join('');
  const preferred=previous || (RUN&&RUN.mission&&RUN.mission.ticket&&RUN.mission.ticket.id) || '';
  select.value=tickets.some(t=>t.id===preferred)?preferred:'';
}
function wireEvidenceTools() {
  const status = $('#termEvidenceStatus');
  const ticketSelect=$('#termEvidenceTicket');
  if(ticketSelect){ticketSelect.addEventListener('focus',refreshEvidenceTicketOptions);ticketSelect.addEventListener('change',()=>{if(status)status.textContent=ticketSelect.value?'Evidence will be linked to '+ticketSelect.value+'.':'Evidence will remain unlinked.';});}
  const copy = $('#termCopyOutput');
  if (copy) copy.addEventListener('click', async () => {
    const output = $('#tout')?.textContent || '';
    if (!output.trim()) { if(status)status.textContent='No output to copy.'; return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(output);
      else {
        const field=document.createElement('textarea'); field.value=output; field.style.position='fixed'; field.style.opacity='0'; document.body.appendChild(field); field.select();
        const copied=document.execCommand('copy'); field.remove(); if(!copied)throw new Error('Clipboard unavailable');
      }
      if(status)status.textContent='Console output copied.';
    } catch (_) { if(status)status.textContent='Clipboard access unavailable in this browser.'; }
  });
  const save = $('#termSaveEvidence');
  if (save) save.addEventListener('click', () => {
    const output=$('#tout')?.textContent || '';
    if (!SEL || !output.trim()) { if(status)status.textContent='Select a device and collect output first.'; return; }
    refreshEvidenceTicketOptions();
    const ticket=$('#termEvidenceTicket')?.value || '';
    addJournalEntry({type:'command evidence',ticket,device:SEL,command:HIST[HIST.length-1] || '',result:'captured',text:'Captured console transcript from the Workbench.'+(ticket?' and linked it to '+ticket+'.':'.'),output});
    if(status)status.textContent='Evidence saved to Engineering Journal.';
  });
  const download = $('#termDownload');
  if (download) download.addEventListener('click', () => {
    const output=$('#tout')?.textContent || '';
    if(!output.trim()){if(status)status.textContent='No output to download.';return;}
    const device=SEL || 'console', blob=new Blob([output],{type:'text/plain;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download='network-console-'+device+'.txt';a.click();URL.revokeObjectURL(url);
    if(status)status.textContent='Transcript download prepared.';
  });
}
function runningConfigForDevice(deviceId) {
  if (!deviceId || !RUN || !RUN.net.devices[deviceId] || !RUN.cli) return null;
  const cli=RUN.cli, prior={...cli};
  try { const result=cli.on(deviceId).run('show running-config'); return result.code===0 ? result.out : null; }
  finally { Object.assign(cli,prior); }
}
function currentRunningConfig() { return runningConfigForDevice(SEL); }
function openCaptureCheckpoint() {
  const device=SEL && RUN && RUN.net.devices[SEL], status=$('#termEvidenceStatus');
  if(!device){if(status)status.textContent='Select a device before saving a checkpoint.';return;}
  const output=currentRunningConfig();
  if(output==null || !output.trim()){if(status)status.textContent='Running configuration is unavailable for this device.';return;}
  const wrap=document.createElement('div');wrap.id='checkpointCaptureModal';wrap.className='config-history-overlay';
  const count=(PROG.configArchives||[]).filter(x=>x.device===SEL).length+1;
  wrap.innerHTML=`<form class="config-history-sheet checkpoint-capture-form"><div class="modal-head"><div><div class="eyebrow">Configuration assurance · local archive</div><h2>Save configuration checkpoint</h2><p class="dim">${esc(device.hostname||SEL)} · ${esc(SEL)}</p></div><button type="button" class="btn sm" id="cancelCheckpoint">Cancel</button></div><label>Checkpoint label<input name="label" maxlength="80" required value="Checkpoint ${count}" placeholder="e.g. Before VLAN rollout"></label><label>Operator note <span class="dim">(optional)</span><textarea name="note" rows="3" maxlength="500" placeholder="Known-good state, maintenance window, ticket reference…"></textarea></label><div class="checkpoint-capture-actions"><button type="submit" class="btn primary">Save checkpoint</button></div></form>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
  wrap.querySelector('#cancelCheckpoint').addEventListener('click',()=>wrap.remove());
  wrap.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.currentTarget);captureConfigCheckpoint(data.get('label'),data.get('note'));wrap.remove();});
  wrap.querySelector('[name="label"]').focus();
}
function captureConfigCheckpoint(label,note='') {
  const output=currentRunningConfig(), device=SEL && RUN && RUN.net.devices[SEL], status=$('#termEvidenceStatus');
  if(!device){if(status)status.textContent='Select a device before saving a checkpoint.';return;}
  if(output==null || !output.trim()){if(status)status.textContent='Running configuration is unavailable for this device.';return;}
  PROG.configArchives=Array.isArray(PROG.configArchives)?PROG.configArchives:[];
  const count=PROG.configArchives.filter(x=>x.device===SEL).length+1, cleanLabel=String(label||('Checkpoint '+count)).trim().slice(0,80);
  if(!cleanLabel){if(status)status.textContent='Enter a checkpoint label.';return;}
  const record={id:Date.now(),device:SEL,hostname:device.hostname||SEL,kind:device.kind||'device',at:new Date().toISOString(),label:cleanLabel,note:String(note||'').trim().slice(0,500),baseline:!PROG.configArchives.some(x=>x.device===SEL&&x.baseline),config:output};
  PROG.configArchives.unshift(record);PROG.configArchives=PROG.configArchives.slice(0,100);saveProg();
  addJournalEntry({type:'configuration checkpoint',device:SEL,command:'show running-config',result:'captured',text:'Saved checkpoint "'+cleanLabel+'".'});
  if(status)status.textContent='Configuration checkpoint "'+cleanLabel+'" saved locally.'+(record.baseline?' Marked as the known-good baseline.':'');
}
function setConfigBaseline(checkpointId) {
  const old=$('#configHistoryModal');if(old)old.remove();
  const records=(PROG.configArchives||[]).filter(x=>x.device===SEL), target=records.find(x=>String(x.id)===String(checkpointId));if(!target)return;
  records.forEach(x=>{x.baseline=x===target;});saveProg();openConfigHistory();
  const status=$('#termEvidenceStatus');if(status)status.textContent='Known-good baseline set to "'+(target.label||target.hostname||target.device)+'".';
}
function deleteConfigCheckpoint(checkpointId) {
  const old=$('#configHistoryModal');if(old)old.remove();
  const target=(PROG.configArchives||[]).find(x=>x.device===SEL&&String(x.id)===String(checkpointId));if(!target)return;
  if(target.baseline){const status=$('#termEvidenceStatus');if(status)status.textContent='Unpin this known-good baseline before deleting it.';return;}
  PROG.configArchives=PROG.configArchives.filter(x=>!(x.device===SEL&&String(x.id)===String(checkpointId)));saveProg();openConfigHistory();
  const status=$('#termEvidenceStatus');if(status)status.textContent='Checkpoint deleted from this browser-local archive.';
}
function reviewConfigDrift(checkpointId) {
  const device=SEL && RUN && RUN.net.devices[SEL], status=$('#termEvidenceStatus');
  if(!device){if(status)status.textContent='Select a device before reviewing configuration.';return;}
  const output=currentRunningConfig();
  if(output==null){if(status)status.textContent='Could not read the current running configuration.';return;}
  const snapshots=(PROG.configArchives||[]).filter(x=>x.device===SEL).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const latest=snapshots.find(x=>String(x.id)===String(checkpointId))||snapshots.find(x=>x.baseline)||snapshots[0], baseline=latest?latest.config:'';
  const oldLines=baseline.split('\n'), newLines=output.split('\n');
  const oldSet=new Set(oldLines), newSet=new Set(newLines);
  const removed=oldLines.filter(line=>line.trim()&&!newSet.has(line));
  const added=newLines.filter(line=>line.trim()&&!oldSet.has(line));
  const wrap=document.createElement('div');wrap.id='modal';
  const changes=removed.length||added.length, reviewedAt=new Date();
  const baselineLabel=latest?(latest.label||latest.hostname||latest.device):'No saved checkpoint';
  const reportText=[
    'NETWORK CONFIGURATION DRIFT REVIEW',
    'Device: '+(device.hostname||SEL)+' ('+SEL+')',
    'Reviewed: '+reviewedAt.toISOString(),
    'Baseline: '+baselineLabel,
    latest?'Baseline captured: '+new Date(latest.at).toISOString():'',
    latest?'Baseline checkpoint ID: '+latest.id:'',
    'Summary: '+added.length+' added; '+removed.length+' removed',
    '',
    'ADDED LINES',
    ...(added.length?added.map(line=>'+ '+line):['(none)']),
    '',
    'REMOVED LINES',
    ...(removed.length?removed.map(line=>'- '+line):['(none)'])
  ].join('\n');
  wrap.innerHTML=`<div class="sheet sheet-wide config-drift-sheet"><div class="modal-head"><div><div class="eyebrow">Configuration assurance · simulator</div><h2>Configuration drift review</h2><p class="dim">${esc(device.hostname||SEL)} · ${esc(SEL)}</p></div><button class="btn sm" id="closeConfigDrift">Close</button></div>
    <div class="config-drift-summary">${latest?`Baseline: ${esc(baselineLabel)} · captured ${esc(new Date(latest.at).toLocaleString())} · checkpoint ${esc(String(latest.id))}`:'No saved checkpoint for this device. Save one to establish a baseline.'} · ${added.length} added · ${removed.length} removed</div>
    ${!latest?'<div class="config-drift-empty">Capture a checkpoint, make a configuration change, then review drift here.</div>':!changes?'<div class="config-drift-empty">✓ No line-level configuration drift detected against this checkpoint.</div>':`<div class="config-drift-columns"><section><h3>Added lines <span>${added.length}</span></h3><pre class="config-drift-added">${esc(added.join('\n')||'No added lines')}</pre></section><section><h3>Removed lines <span>${removed.length}</span></h3><pre class="config-drift-removed">${esc(removed.join('\n')||'No removed lines')}</pre></section></div>`}
    <div class="row config-drift-actions"><button type="button" class="btn primary" id="saveConfigDriftEvidence" ${latest?'':'disabled'}>Save review to journal</button><button type="button" class="btn" id="downloadConfigDriftReport" ${latest?'':'disabled'}>Download report</button></div>
    <p class="dim config-drift-foot">Read-only comparison against the selected browser-local checkpoint. Saving records evidence locally; it does not apply, restore or validate configuration on physical equipment.</p></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
  wrap.querySelector('#closeConfigDrift').addEventListener('click',()=>wrap.remove());
  const saveEvidence=wrap.querySelector('#saveConfigDriftEvidence');
  if(saveEvidence&&latest)saveEvidence.addEventListener('click',()=>{
    addJournalEntry({type:'configuration drift review',device:SEL,command:'show running-config',result:changes?'drift detected':'no drift',text:'Compared current running configuration with "'+baselineLabel+'": '+added.length+' added and '+removed.length+' removed lines.',output:reportText});
    saveEvidence.textContent='Saved to journal';saveEvidence.disabled=true;
    if(status)status.textContent='Configuration drift review saved to the Engineering Journal.';
  });
  const downloadReport=wrap.querySelector('#downloadConfigDriftReport');
  if(downloadReport&&latest)downloadReport.addEventListener('click',()=>{
    const blob=new Blob([reportText+'\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='config-drift-'+SEL+'-'+reviewedAt.toISOString().slice(0,10)+'.txt';a.click();URL.revokeObjectURL(url);
    if(status)status.textContent='Configuration drift report downloaded.';
  });
}
function openConfigHistory() {
  const snapshots=(PROG.configArchives||[]).filter(x=>x.device===SEL).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const status=$('#termEvidenceStatus');
  if(!SEL){if(status)status.textContent='Select a device before viewing checkpoint history.';return;}
  const wrap=document.createElement('div');wrap.id='configHistoryModal';wrap.className='config-history-overlay';
  const rows=snapshots.map((x,i)=>`<article class="config-history-item"><div class="config-history-meta"><b>${x.baseline?'KNOWN-GOOD BASELINE':i===0?'LATEST CHECKPOINT':'CHECKPOINT '+(i+1)}</b><time>${esc(new Date(x.at).toLocaleString())}</time></div><strong>${esc(x.label||x.hostname||x.device)} · ${esc(x.kind||'device')}</strong><small>${String(x.config||'').split('\n').filter(line=>line.trim()).length} non-empty configuration lines · ID ${esc(String(x.id))}</small>${x.note?'<p class="config-history-note">'+esc(x.note)+'</p>':''}<div class="config-history-actions"><button type="button" class="btn sm" data-config-compare="${esc(String(x.id))}">Compare current</button><button type="button" class="btn sm" data-config-baseline="${esc(String(x.id))}" ${x.baseline?'disabled':''}>${x.baseline?'Pinned baseline':'Set as baseline'}</button><button type="button" class="btn sm danger" data-config-delete="${esc(String(x.id))}" ${x.baseline?'disabled':''}>Delete</button></div></article>`).join('');
  wrap.innerHTML=`<section class="config-history-sheet"><div class="modal-head"><div><div class="eyebrow">Configuration assurance · local archive</div><h2>Checkpoint history</h2><p class="dim">${esc(SEL)} · ${snapshots.length} saved checkpoint${snapshots.length===1?'':'s'}</p></div><button class="btn sm" id="closeConfigHistory">Close</button></div><div class="config-history-list">${rows||'<div class="config-drift-empty">No checkpoints saved for this device yet. Use Save checkpoint after establishing a known-good configuration.</div>'}</div><p class="dim config-drift-foot">Choose any historical snapshot as the baseline for a read-only comparison with the current running configuration.</p></section>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
  wrap.querySelector('#closeConfigHistory').addEventListener('click',()=>wrap.remove());
  wrap.querySelectorAll('[data-config-compare]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.configCompare;wrap.remove();reviewConfigDrift(id);}));
  wrap.querySelectorAll('[data-config-baseline]').forEach(button=>button.addEventListener('click',()=>setConfigBaseline(button.dataset.configBaseline)));
  wrap.querySelectorAll('[data-config-delete]').forEach(button=>button.addEventListener('click',()=>deleteConfigCheckpoint(button.dataset.configDelete)));
}
function scanConfigFleet() {
  if(!RUN||!RUN.net||!RUN.net.devices)return [];
  const archives=Array.isArray(PROG.configArchives)?PROG.configArchives:[];
  return Object.entries(RUN.net.devices).map(([id,device])=>{
    const snapshots=archives.filter(x=>x.device===id).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const baseline=snapshots.find(x=>x.baseline)||null, current=runningConfigForDevice(id);
    if(current==null)return {id,hostname:device.hostname||id,kind:device.kind||'device',state:'unavailable',baseline,snapshots,current:null,added:[],removed:[]};
    if(!baseline)return {id,hostname:device.hostname||id,kind:device.kind||'device',state:'no-baseline',baseline,snapshots,current,added:[],removed:[]};
    const before=new Set(String(baseline.config||'').split('\n')),after=new Set(current.split('\n'));
    const removed=[...before].filter(line=>line.trim()&&!after.has(line));
    const added=[...after].filter(line=>line.trim()&&!before.has(line));
    return {id,hostname:device.hostname||id,kind:device.kind||'device',state:added.length||removed.length?'drift':'clean',baseline,snapshots,current,added,removed};
  }).sort((a,b)=>{const order={drift:0,'no-baseline':1,unavailable:2,clean:3};return order[a.state]-order[b.state]||a.hostname.localeCompare(b.hostname);});
}
function openConfigFleetAssurance() {
  if(!RUN){const status=$('#termEvidenceStatus');if(status)status.textContent='Start a simulator scenario before scanning configuration.';return;}
  const wrap=document.createElement('div');wrap.id='configFleetModal';wrap.className='config-history-overlay';
  let rows=scanConfigFleet();
  const summary=()=>{const count=state=>rows.filter(x=>x.state===state).length;return '<div class="fleet-config-summary"><div><b>'+rows.length+'</b><span>Devices scanned</span></div><div class="drift"><b>'+count('drift')+'</b><span>Drift detected</span></div><div class="unbaselined"><b>'+count('no-baseline')+'</b><span>No baseline</span></div><div class="clean"><b>'+count('clean')+'</b><span>In baseline</span></div></div>';};
  const label=state=>({drift:'DRIFT',clean:'IN BASELINE','no-baseline':'NO BASELINE',unavailable:'UNAVAILABLE'}[state]||state);
  const renderRows=()=>rows.map(item=>`<article class="fleet-config-row state-${item.state}" data-state="${item.state}" data-device="${esc(item.id)}"><div class="fleet-config-row-head"><div><b>${esc(item.hostname)}</b><small>${esc(item.id)} · ${esc(item.kind)}</small></div><span class="fleet-state">${label(item.state)}</span></div><div class="fleet-config-detail">${item.baseline?'Baseline: '+esc(item.baseline.label||item.baseline.hostname||item.baseline.device)+' · '+esc(new Date(item.baseline.at).toLocaleString()):'No pinned baseline'} · ${item.snapshots.length} checkpoint(s)${item.state==='drift'?' · '+item.added.length+' added / '+item.removed.length+' removed':''}</div><div class="fleet-config-actions"><button class="btn sm primary" type="button" data-fleet-open="${esc(item.id)}">${item.baseline?'Review drift':'Save first baseline'}</button></div></article>`).join('')||'<div class="config-drift-empty">No devices are available in this scenario.</div>';
  const report=()=>['NETWORK CONFIGURATION FLEET ASSURANCE','Scanned: '+new Date().toISOString(),'','SUMMARY: '+rows.length+' devices; '+rows.filter(x=>x.state==='drift').length+' drift; '+rows.filter(x=>x.state==='clean').length+' clean; '+rows.filter(x=>x.state==='no-baseline').length+' without baseline; '+rows.filter(x=>x.state==='unavailable').length+' unavailable','',...rows.flatMap(x=>['DEVICE '+x.hostname+' ('+x.id+')','Status: '+label(x.state),'Baseline: '+(x.baseline?(x.baseline.label||x.baseline.id):'none'),'Checkpoints: '+x.snapshots.length,'Added lines: '+x.added.length,...x.added.map(v=>'+ '+v),'Removed lines: '+x.removed.length,...x.removed.map(v=>'- '+v),''])].join('\n');
  const render=()=>{wrap.innerHTML=`<section class="config-history-sheet fleet-config-sheet"><div class="modal-head"><div><div class="eyebrow">Configuration assurance · simulator fleet</div><h2>Fleet configuration overview</h2><p class="dim">Read-only running-config comparison against each device's pinned browser-local baseline</p></div><button class="btn sm" id="closeConfigFleet">Close</button></div>${summary()}<div class="fleet-config-toolbar"><input id="fleetConfigSearch" type="search" placeholder="Search device name or ID" aria-label="Search devices"><select id="fleetConfigFilter" aria-label="Filter configuration status"><option value="all">All statuses</option><option value="drift">Drift detected</option><option value="no-baseline">No baseline</option><option value="clean">In baseline</option><option value="unavailable">Unavailable</option></select><button type="button" class="btn sm" id="rescanConfigFleet">Rescan</button><button type="button" class="btn sm" id="exportConfigFleet">Export report</button><button type="button" class="btn sm primary" id="saveConfigFleet">Save scan to journal</button></div><div class="fleet-config-list" id="fleetConfigRows">${renderRows()}</div><p class="dim config-drift-foot">This scan reads the active simulator only. It does not poll physical equipment or apply configuration changes.</p></section>`;};
  const bind=()=>{wrap.querySelector('#closeConfigFleet').addEventListener('click',()=>wrap.remove());const apply=()=>{const q=wrap.querySelector('#fleetConfigSearch').value.trim().toLowerCase(),filter=wrap.querySelector('#fleetConfigFilter').value;wrap.querySelectorAll('.fleet-config-row').forEach(el=>{el.hidden=(filter!=='all'&&el.dataset.state!==filter)||!el.textContent.toLowerCase().includes(q);});};wrap.querySelector('#fleetConfigSearch').addEventListener('input',apply);wrap.querySelector('#fleetConfigFilter').addEventListener('change',apply);wrap.querySelector('#rescanConfigFleet').addEventListener('click',()=>{rows=scanConfigFleet();render();bind();});wrap.querySelector('#exportConfigFleet').addEventListener('click',()=>{const blob=new Blob([report()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='network-config-fleet-'+new Date().toISOString().slice(0,10)+'.txt';a.click();URL.revokeObjectURL(url);});wrap.querySelector('#saveConfigFleet').addEventListener('click',()=>{const drift=rows.filter(x=>x.state==='drift').length,clean=rows.filter(x=>x.state==='clean').length,unbaselined=rows.filter(x=>x.state==='no-baseline').length;addJournalEntry({type:'configuration fleet scan',device:'fleet',command:'show running-config',result:drift?'drift detected':'scan complete',text:'Scanned '+rows.length+' simulator devices: '+drift+' drift, '+clean+' in baseline, '+unbaselined+' without baseline.',output:report()});const btn=wrap.querySelector('#saveConfigFleet');btn.textContent='Saved to journal';btn.disabled=true;const status=$('#termEvidenceStatus');if(status)status.textContent='Fleet configuration scan saved to the Engineering Journal.';});wrap.querySelectorAll('[data-fleet-open]').forEach(btn=>btn.addEventListener('click',()=>{const item=rows.find(x=>x.id===btn.dataset.fleetOpen);if(!item)return;selectDevice(item.id);wrap.remove();if(item.baseline)reviewConfigDrift(item.baseline.id);else openCaptureCheckpoint();}));};
  document.body.appendChild(wrap);render();bind();wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
}
function exportConfigArchive() {
  const records=(PROG.configArchives||[]).filter(x=>!SEL||x.device===SEL);
  if(!records.length){const status=$('#termEvidenceStatus');if(status)status.textContent='No saved configuration checkpoints for this device.';return;}
  const blob=new Blob([JSON.stringify(records,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='network-config-checkpoints-'+(SEL||'archive')+'.json';a.click();URL.revokeObjectURL(url);
  const status=$('#termEvidenceStatus');if(status)status.textContent='Configuration checkpoint archive exported.';
}
function wireConfigArchiveTools() {
  $('#termConfigSave')?.addEventListener('click',openCaptureCheckpoint);
  $('#termConfigReview')?.addEventListener('click',reviewConfigDrift);
  $('#termConfigHistory')?.addEventListener('click',openConfigHistory);
  $('#termConfigExport')?.addEventListener('click',exportConfigArchive);
  const toolbar=$('.term-head');
  if(toolbar&&!$('#termConfigFleet')){const button=document.createElement('button');button.type='button';button.className='btn sm';button.id='termConfigFleet';button.textContent='Fleet assurance';button.title='Compare every simulator device with its pinned configuration baseline';toolbar.insertBefore(button,$('#termHelp'));button.addEventListener('click',openConfigFleetAssurance);}
}
function persistTerminalSession() {
  if (!SEL || !$('#tout')) return;
  TERM_SESSIONS[SEL] = { history: HIST.slice(), index: HISTI, output: $('#tout').textContent };
}
function selectDevice(id) {
  if (!RUN || !RUN.net.devices[id]) return;
  if (SEL === id) { refresh(); return; }
  persistTerminalSession();
  SEL = id; INSPECTOR_TAB = 'overview';
  const session = TERM_SESSIONS[id] || { history: [], index: -1, output: '' };
  HIST = session.history.slice(); HISTI = session.index;
  const out = $('#tout'); if (out) out.textContent = session.output || `— Console session for ${id}. Run help or show commands to begin. —\n`;
  document.querySelectorAll('#brief [data-explorer-dev]').forEach(b => b.classList.toggle('active', b.dataset.explorerDev === id));
  refresh();
}
function wireSessionTabs() {
  document.querySelectorAll('#sessionTabs [data-session-device]').forEach(b => b.addEventListener('click', () => selectDevice(b.dataset.sessionDevice)));
  const active=document.querySelector('#sessionTabs .session-tab.active'); if(active) active.scrollIntoView({block:'nearest',inline:'nearest'});
  const prev=$('#sessionPrev'), next=$('#sessionNext'), clear=$('#sessionClear');
  if(prev)prev.addEventListener('click',()=>cycleDeviceSession(-1));
  if(next)next.addEventListener('click',()=>cycleDeviceSession(1));
  if(clear)clear.addEventListener('click',clearActiveSessionOutput);
}
function refreshFlows() { const fw = $('#flows'); if (fw) fw.outerHTML = renderFlows(); }
function refresh() {
  $('#topoWrap').innerHTML = renderTopo();
  refreshFlows(); $('#config').innerHTML = renderConfig();
  const tabs = $('#sessionTabs'); if (tabs) tabs.innerHTML = renderSessionTabs();
  wireTopo(); wireConfig(); wireSessionTabs();
  const target = $('#termTarget'); if (target) target.textContent = SEL || 'NO DEVICE';
  refreshOverview(); refreshInfrastructureView();
  if (MODE === 'build') persistBuilderDraft();
}
function runMission(m, solvedKey, options = {}) {
  showWorkspaceView('workbench', options); RUN = startMission(m); SEL = RUN.mission.console;
  TERM_SESSIONS = {}; HIST = []; HISTI = -1; TOPO_VIEW = null; PAN = null; INSPECTOR_TAB = 'overview';
  TERM_SESSIONS[SEL] = { history: [], index: -1, output: '' };
  HINTS = 0; LAST_COMMAND = null; SOLVED_NOW = false; DIAGNOSED = !RUN.requiresDiagnosis || !!(solvedKey && PROG.done[solvedKey]);
  startTimer(); $('#brief').innerHTML = renderBrief(); wireBrief(); refresh(); updateHud(); termClear();
  termEcho(`— ${RUN.mission.title} — you are on ${SEL || '(pick or add a device)'}. Try: ping, traceroute, ip addr, nmap`);
}
function reloadMission(i, options = {}) { MODE = 'play'; PLAYING_DBID = null; showWorkspaceView('workbench', options); runMission(chapters[i], chapters[i].id, options); }
function startTimer() { if (TICK) clearInterval(TICK); TSTART = Date.now(); const t = $('#time'); if (t) t.textContent = '0:00'; TICK = setInterval(() => { const el = $('#time'); if (el && !SOLVED_NOW) el.textContent = fmtTime(Date.now() - TSTART); }, 1000); }
function stopTimer() { if (TICK) { clearInterval(TICK); TICK = null; } }
function termEcho(s) { const o = $('#tout'); o.textContent += s + '\n'; o.scrollTop = o.scrollHeight; persistTerminalSession(); }
function termClear() { const o = $('#tout'); if (o) o.textContent = ''; persistTerminalSession(); }
function nextUnsolved() { const cur = chapters.findIndex(c => c.id === RUN.mission.id); for (let k = 1; k <= chapters.length; k++) { const i = (cur + k) % chapters.length; if (!PROG.done[chapters[i].id]) return i; } return -1; }
function missionOutcomeFeedback(done) {
  const last = LAST_COMMAND;
  const configCommand = !!(last && /^(?:hostname|interface|ip address|ip route|ip access-list|access-list|switchport|vlan|router|network|router-id|passive-interface|bgp|standby|ntp|logging|no )\b/i.test(last.line.trim()));
  const result = F.classifyOutcome({ commandAccepted: !!(last && last.accepted && configCommand), configurationValid: !!(last && last.accepted && configCommand), objectiveMet: done });
  return '<div class="mission-feedback"><b>' + esc(result.title) + '</b><div>' + esc(result.reason) + '</div><div><b>Next step:</b> ' + esc(result.next) + '</div></div>';
}
function doCheck() {
  const box = $('#status'); const done = RUN.done(), feedback = missionOutcomeFeedback(done);
  if (RUN.mission.authored) {                         // authored scenario: no XP / progress, just pass/fail
    box.className = done ? 'ok' : 'bad';
    box.innerHTML = (done ? '✓ Scenario complete — the network meets every objective.' : 'Not there yet:') + feedback
      + (done ? '' : '<ul>' + RUN.results().filter(r => !r.ok).map(r => '<li>' + esc(r.reason) + '</li>').join('') + '</ul>');
    if (done && AUTHUSER && PLAYING_DBID) {           // an assigned scenario: record the attempt for the teacher
      const dbid = PLAYING_DBID, ms = Date.now() - TSTART;
      getSB().then(sb => { if (sb) NC.recordAttempt(sb, AUTHUSER.id, dbid, { passed: true, ms, hints: HINTS }); });
      box.innerHTML += ' <span class="dim">· attempt recorded</span>';
    }
    return;
  }
  if (done) {
    const id = RUN.mission.id, ms = Date.now() - TSTART;
    if (id === 'cross-track-web-availability-network') markCrossTrackProgress('network');
    if (id === 'cross-track-remote-admin-network') markCrossTrackProgress('remoteNetwork');
    if (id === 'cross-track-ssh-hardening-network') markCrossTrackProgress('hardeningNetwork');
    if (id === 'cross-track-contractor-containment-network') markCrossTrackProgress('contractorNetwork');
    if (!SOLVED_NOW) { SOLVED_NOW = true; stopTimer(); }
    const isDesign = RUN.mission.mode === 'design';
    const ticketId = RUN.mission.ticket && RUN.mission.ticket.id; if (ticketId) setTicketState(ticketId, 'resolved', 'You');
    let msg = isDesign ? '✓ All requirements met — design signed off.' : '✓ All objectives met — ticket resolved.';
    if (!PROG.done[id]) {
      const reward = Math.max(25, REWARD - HINT_COST * HINTS);
      PROG.done[id] = { xp: reward, hints: HINTS, ms }; PROG.xp += reward; saveProg(); updateHud();
      addJournalEntry({ type: isDesign ? 'design signed off' : 'ticket resolved', device: SEL || '', text: `${isDesign ? 'Built to spec' : 'Resolved'} ${RUN.mission.ticket && RUN.mission.ticket.id || RUN.mission.id} in ${fmtTime(ms)}. Earned ${reward} XP.` });
      msg = `✓ ${isDesign ? 'Built to spec' : 'Ticket resolved'} in <b>${fmtTime(ms)}</b> — <b>+${reward} XP</b>${HINTS ? ` (−${HINT_COST * HINTS} for hints)` : ''}.`;
      const eb = $('#brief').querySelector('.eyebrow'); if (eb) eb.innerHTML += ' · <span class="done">solved</span>';
    } else if (PROG.done[id].ms == null || ms < PROG.done[id].ms) { PROG.done[id].ms = ms; saveProg(); }
    const ni = nextUnsolved(), allDone = chapters.every(c => PROG.done[c.id]);
    box.className = 'ok';
    box.innerHTML = msg + feedback + (ni >= 0 ? ' <button class="btn sm" id="next">Next ticket →</button>' : (allDone ? `<div class="finale">🎓 All ${chapters.length} tickets cleared — final rank <b>${rankFor(PROG.xp)}</b>, ${PROG.xp} XP.</div>` : ''));
    const nb = $('#next'); if (nb) nb.addEventListener('click', () => reloadMission(ni));
  } else {
    box.className = 'bad'; box.innerHTML = 'Not resolved yet:' + feedback + '<ul>' + RUN.results().filter(r => !r.ok).map(r => '<li>' + esc(r.reason) + '</li>').join('') + '</ul>';
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
  wireModalDialog(wrap,'#closeS');
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  wrap.querySelectorAll('.tm').forEach(b => b.addEventListener('click', () => { applyTheme(b.dataset.th); closeModal(); openSettings(); }));
  $('#reset').addEventListener('click', () => { if (confirm('Erase all progress and XP?')) { PROG = { done: {}, xp: 0, theme: PROG.theme }; saveProg(); updateHud(); $('#brief').innerHTML = renderBrief(); wireBrief(); closeModal(); } });
  $('#closeS').addEventListener('click', closeModal);
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
function setPos(id, x, y) { RUN.net.pos = RUN.net.pos || {}; const snap = v => TOPO_SNAP ? Math.round(v / 24) * 24 : v; RUN.net.pos[id] = [Math.max(4, snap(x)), Math.max(4, snap(y))]; }

function topologySnapshot() { return JSON.parse(JSON.stringify(RUN.net)); }
function rememberTopology(snapshot) { TOPO_UNDO.push(snapshot || topologySnapshot()); if (TOPO_UNDO.length > 60) TOPO_UNDO.shift(); TOPO_REDO = []; }
function restoreTopology(snapshot) {
  for (const key of Object.keys(RUN.net)) delete RUN.net[key];
  Object.assign(RUN.net, JSON.parse(JSON.stringify(snapshot)));
  TOPO_SELECTED = new Set([...TOPO_SELECTED].filter(id => RUN.net.devices[id]));
  if (SEL && !RUN.net.devices[SEL]) SEL = null;
  LINK_SEL = null; WIRE = null; DRAWING = null; DRAWING_SEL = null; DRAWING_DRAG = null; NOTE_DRAG = null; ANNOTATION_DRAG = null; TEXT_INSERT_MODE = false; refresh();
}
function undoTopology() { if (!canBuild() || !TOPO_UNDO.length) return; TOPO_REDO.push(topologySnapshot()); restoreTopology(TOPO_UNDO.pop()); }
function redoTopology() { if (!canBuild() || !TOPO_REDO.length) return; TOPO_UNDO.push(topologySnapshot()); restoreTopology(TOPO_REDO.pop()); }
function copyTopologySelection() {
  const ids=[...TOPO_SELECTED].filter(id=>RUN.net.devices[id]); if(!ids.length && SEL)ids.push(SEL);
  if(!ids.length)return;
  const set=new Set(ids), pos=RUN.net.pos||{};
  TOPO_CLIPBOARD={devices:ids.map(id=>({id,device:JSON.parse(JSON.stringify(RUN.net.devices[id])),pos:pos[id]?pos[id].slice():nodePos(id),labelPositions:JSON.parse(JSON.stringify((RUN.net.deviceLabelPositions||{})[id]||{}))})),links:RUN.net.links.filter(l=>set.has(l.a[0])&&set.has(l.b[0])).map(l=>JSON.parse(JSON.stringify(l)))};
  refresh(); // update the Paste control immediately after the clipboard is populated
}
function pasteTopologySelection() {
  if(!canBuild()||!TOPO_CLIPBOARD||!TOPO_CLIPBOARD.devices.length)return;
  const before=topologySnapshot(), map={};
  TOPO_CLIPBOARD.devices.forEach(item=>{const kind=item.device.services?'server':item.device.kind;const prefix={host:'h',server:'srv',switch:'sw',router:'r',firewall:'fw'}[kind]||'h';let n=1;while(RUN.net.devices[prefix+n])n++;const newId=prefix+n;const copy=JSON.parse(JSON.stringify(item.device));copy.id=newId;if(copy.hostname===item.id)copy.hostname=newId;RUN.net.devices[newId]=copy;RUN.net.pos=RUN.net.pos||{};RUN.net.pos[newId]=[item.pos[0]+48,item.pos[1]+48];if(item.labelPositions&&Object.keys(item.labelPositions).length){RUN.net.deviceLabelPositions=RUN.net.deviceLabelPositions||{};RUN.net.deviceLabelPositions[newId]={};for(const key of Object.keys(item.labelPositions)){const p=item.labelPositions[key];RUN.net.deviceLabelPositions[newId][key]=[p[0]+48,p[1]+48];}}map[item.id]=newId;});
  TOPO_CLIPBOARD.links.forEach(l=>{if(map[l.a[0]]&&map[l.b[0]])try{B.addLink(RUN.net,map[l.a[0]],map[l.b[0]],l.a[1],l.b[1]);}catch(e){}});
  rememberTopology(before); TOPO_SELECTED=new Set(Object.values(map)); SEL=Object.values(map)[0]||SEL; refresh();
}
let TOPO_CONTEXT_MENU = null;
function closeTopologyContextMenu() {
  const menu = TOPO_CONTEXT_MENU;
  if (!menu) return;
  document.removeEventListener('pointerdown', menu.dismissOutside, true);
  document.removeEventListener('keydown', menu.dismissEscape, true);
  menu.remove();
  TOPO_CONTEXT_MENU = null;
  if (menu.returnFocus && menu.returnFocus.isConnected) menu.returnFocus.focus();
}
function runTopologyContextAction(action, target) {
  if (!canBuild() || !RUN || !RUN.net) return;
  if (action.startsWith('add:')) {
    rememberTopology();
    const id = B.addDevice(RUN.net, action.slice(4));
    TOPO_SELECTED = new Set([id]); LINK_SEL = null; WIRE = null;
    selectDevice(id); return;
  }
  switch (action) {
    case 'configure': if (target.id) selectDevice(target.id); break;
    case 'connect': WIRE = target.id; SEL = target.id; TOPO_SELECTED = new Set([target.id]); refresh(); break;
    case 'duplicate': {
      if (!target.id || !RUN.net.devices[target.id]) break;
      try { rememberTopology(); const id = B.cloneDevice(RUN.net, target.id); TOPO_SELECTED = new Set([id]); LINK_SEL = null; selectDevice(id); }
      catch (err) { flashStatus(err.message); }
      break;
    }
    case 'copy': copyTopologySelection(); break;
    case 'rename': {
      const d = RUN.net.devices[target.id]; if (!d) break;
      const value = prompt('Device display label (leave blank to use its ID):', d.label || '');
      if (value === null) break;
      rememberTopology(); if (value.trim()) d.label = value.trim().slice(0, 32); else delete d.label;
      refresh(); break;
    }
    case 'delete-device':
      if (target.id && RUN.net.devices[target.id] && confirm('Delete device ' + target.id + ' and its connected links?')) {
        rememberTopology(); B.removeDevice(RUN.net, target.id); TOPO_SELECTED.delete(target.id);
        delete TERM_SESSIONS[target.id]; if (SEL === target.id) SEL = null;
        if (WIRE === target.id) WIRE = null; LINK_SEL = null; refresh();
      }
      break;
    case 'focus': focusSelectedTopology(); break;
    case 'toggle-link': {
      const link = RUN.net.links[target.index]; if (!link) break;
      rememberTopology(); link.up = link.up === false; refresh(); break;
    }
    case 'delete-link':
      if (Number.isInteger(target.index) && RUN.net.links[target.index] && confirm('Remove this connection?')) {
        rememberTopology(); B.removeLink(RUN.net, target.index); LINK_SEL = null; refresh();
      }
      break;
    case 'delete-drawing':
      if (RUN.net.drawings && RUN.net.drawings[target.index]) {
        rememberTopology(); RUN.net.drawings.splice(target.index, 1); DRAWING_SEL = null; refresh();
      }
      break;
    case 'edit-note': {
      const note = RUN.net.notes && RUN.net.notes[target.index]; if (!note) break;
      const value = prompt('Edit topology note (leave blank to remove):', note.text || '');
      if (value === null) break;
      rememberTopology();
      if (!value.trim()) RUN.net.notes.splice(target.index, 1);
      else note.text = value.trim().slice(0, 120);
      refresh(); break;
    }
    case 'delete-note':
      if (RUN.net.notes && RUN.net.notes[target.index] && confirm('Remove this note?')) {
        rememberTopology(); RUN.net.notes.splice(target.index, 1); refresh();
      }
      break;
    case 'edit-device-label': editTopologyDeviceLabel(target.id,target.labelKind); break;
    case 'reset-device-label': { const positions=RUN.net.deviceLabelPositions&&RUN.net.deviceLabelPositions[target.id]; if(positions){rememberTopology();delete positions[target.labelKind];if(!Object.keys(positions).length)delete RUN.net.deviceLabelPositions[target.id];refresh();} break; }
    case 'edit-text': editTopologyText(target.index); break;
    case 'delete-text': if(RUN.net.texts&&RUN.net.texts[target.index]){rememberTopology();RUN.net.texts.splice(target.index,1);refresh();} break;
    case 'clear-device-label': { if(RUN.net.devices[target.id]){rememberTopology();RUN.net.hiddenDeviceLabels=RUN.net.hiddenDeviceLabels||{};RUN.net.hiddenDeviceLabels[target.id]=RUN.net.hiddenDeviceLabels[target.id]||{};RUN.net.hiddenDeviceLabels[target.id][target.labelKind]=true;refresh();} break; }
    case 'restore-device-label': case 'restore-device-label-name': case 'restore-device-label-type': { const kind=action.endsWith('-name')?'name':action.endsWith('-type')?'type':target.labelKind,hidden=RUN.net.hiddenDeviceLabels&&RUN.net.hiddenDeviceLabels[target.id];if(hidden){rememberTopology();delete hidden[kind];if(!Object.keys(hidden).length)delete RUN.net.hiddenDeviceLabels[target.id];refresh();}break; }
    case 'add-text': { const value=prompt('Canvas text (max 160 characters):','New text');if(value===null||!value.trim())break;const p=target.point||(TOPO_VIEW?[TOPO_VIEW[0]+TOPO_VIEW[2]/2,TOPO_VIEW[1]+TOPO_VIEW[3]/2]:[100,100]);rememberTopology();RUN.net.texts=RUN.net.texts||[];RUN.net.texts.push({text:value.trim().slice(0,160),x:p[0],y:p[1],fontSize:14,color:'#e5b85c'});refresh();break;}
    case 'paste': pasteTopologySelection(); break;
    case 'add-note': {
      const value = prompt('Topology note (max 120 characters):', 'Network note');
      if (value === null || !value.trim()) break;
      const p = target.point || (SEL ? nodePos(SEL) : [60, 60]);
      rememberTopology(); RUN.net.notes = RUN.net.notes || [];
      RUN.net.notes.push({ text: value.trim().slice(0, 120), x: p[0], y: p[1] }); refresh(); break;
    }
    case 'select-all': TOPO_SELECTED = new Set(Object.keys(RUN.net.devices)); SEL = [...TOPO_SELECTED][0] || null; refresh(); break;
    case 'fit': fitTopology(); break;
    case 'toggle-grid': TOPO_GRID = !TOPO_GRID; refresh(); break;
    case 'toggle-snap': TOPO_SNAP = !TOPO_SNAP; refresh(); break;
  }
}
function showTopologyContextMenu(e, kind, target = {}) {
  if (!canBuild()) return;
  e.preventDefault(); e.stopPropagation();
  closeTopologyContextMenu();
  if (kind === 'device-label') { LINK_SEL=null;DRAWING_SEL=null; }
  else if (kind === 'text') { LINK_SEL=null;DRAWING_SEL=null; }
  else if (kind === 'device') {
    if (!TOPO_SELECTED.has(target.id)) TOPO_SELECTED = new Set([target.id]);
    LINK_SEL = null; DRAWING_SEL = null;
    selectDevice(target.id);
  } else if (kind === 'link') {
    LINK_SEL = target.index; DRAWING_SEL = null;
  } else if (kind === 'drawing') {
    DRAWING_SEL = target.index; LINK_SEL = null;
  } else if (kind === 'note') {
    LINK_SEL = null; DRAWING_SEL = null;
  } else {
    LINK_SEL = null; DRAWING_SEL = null;
  }
  if (kind !== 'device') refresh();
  const hiddenLabel=RUN.net.hiddenDeviceLabels&&RUN.net.hiddenDeviceLabels[target.id]&&RUN.net.hiddenDeviceLabels[target.id][target.labelKind];
  const groups = {
    device: [
      ['Configure / inspect', 'configure'], ['Connect to another device', 'connect'], ['Duplicate device', 'duplicate'],
      ['Copy selection', 'copy'], ['Rename display label', 'rename'],
      ...(['name','type'].filter(k=>RUN.net.hiddenDeviceLabels&&RUN.net.hiddenDeviceLabels[target.id]&&RUN.net.hiddenDeviceLabels[target.id][k]).map(k=>['Restore '+k+' label','restore-device-label-'+k])),
      ['Center on device', 'focus'], ['Delete device', 'delete-device', true]
    ],
    link: [
      [RUN.net.links[target.index] && RUN.net.links[target.index].up === false ? 'Bring link up' : 'Take link down', 'toggle-link'],
      ['Remove connection', 'delete-link', true]
    ],
    drawing: [['Remove drawing', 'delete-drawing', true]],
    note: [['Edit note', 'edit-note'], ['Remove note', 'delete-note', true]],
    'device-label': hiddenLabel ? [['Restore label','restore-device-label']] : [['Edit label text','edit-device-label'],['Delete label','clear-device-label',true],['Reset label position','reset-device-label']],
    text: [['Edit text', 'edit-text'], ['Remove text', 'delete-text', true]],
    canvas: [
      ['Add host', 'add:host'], ['Add server', 'add:server'], ['Add switch', 'add:switch'], ['Add router', 'add:router'], ['Add firewall', 'add:firewall'],
      ['Add note here', 'add-note'], ['Add text here', 'add-text'], ['Paste selection', 'paste', false, !TOPO_CLIPBOARD],
      ['Select all devices', 'select-all'], ['Fit topology', 'fit'], [TOPO_GRID ? 'Hide grid' : 'Show grid', 'toggle-grid'], [TOPO_SNAP ? 'Disable snap' : 'Enable snap', 'toggle-snap']
    ]
  };
  const labels = groups[kind] || groups.canvas;
  const menu = document.createElement('div');
  menu.className = 'topo-context-menu'; menu.setAttribute('role', 'menu');
  menu.returnFocus = kind === 'device-label' ? document.querySelector('#topo .device-label[data-device-label="' + CSS.escape(target.id) + '"][data-label-kind="' + target.labelKind + '"]') : kind === 'text' ? document.querySelector('#topo .topo-text[data-text-index="' + target.index + '"]') : kind === 'device' ? document.querySelector('#topo .node[data-dev="' + CSS.escape(target.id) + '"]') : kind === 'link' ? document.querySelector('#topo .edge[data-link-index="' + target.index + '"]') : kind === 'drawing' ? document.querySelector('#topo .topo-drawing[data-drawing-index="' + target.index + '"]') : kind === 'note' ? document.querySelector('#topo .topo-note[data-note-index="' + target.index + '"]') : document.activeElement;
  TOPO_CONTEXT_MENU = menu;
  const heading = kind === 'device-label' ? target.id+' · '+target.labelKind+' label' : kind === 'text' ? 'Canvas text' : kind === 'device' ? target.id : kind === 'link' ? 'Connection' : kind === 'drawing' ? 'Drawing' : kind === 'note' ? 'Note' : 'Canvas';
  menu.innerHTML = '<div class="ctx-heading">' + esc(heading) + '</div>' + labels.map(([label, action, danger, disabled]) =>
    (action === 'add:host' || action === 'add-note' || action === 'paste' || action === 'select-all' || action === 'fit' || action === 'toggle-grid' ? '<div class="ctx-separator"></div>' : '') +
    '<button type="button" role="menuitem" data-action="' + action + '"' + (danger ? ' class="danger"' : '') + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>'
  ).join('');
  document.body.appendChild(menu);
  const x = Math.max(8, Math.min(e.clientX || 8, window.innerWidth - menu.offsetWidth - 8));
  const y = Math.max(8, Math.min(e.clientY || 8, window.innerHeight - menu.offsetHeight - 8));
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    closeTopologyContextMenu();
    runTopologyContextAction(action, target);
  });
  menu.dismissOutside = event => { if (!menu.contains(event.target)) closeTopologyContextMenu(); };
  menu.dismissEscape = event => {
    if (event.key === 'Escape') { event.preventDefault(); closeTopologyContextMenu(); }
    else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      if (!items.length) return;
      const current = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      event.preventDefault(); items[next].focus();
    }
  };
  document.addEventListener('pointerdown', menu.dismissOutside, true);
  document.addEventListener('keydown', menu.dismissEscape, true);
  const first = menu.querySelector('button:not(:disabled)'); if (first) first.focus();
}

function startInlineTextEdit(targetEl, currentText, onCommit) {
  if (!targetEl) return;
  const svg = $('#topo');
  if (!svg) return;
  const rect = targetEl.getBoundingClientRect();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText || '';
  input.style.position = 'fixed';
  input.style.left = rect.left + 'px';
  input.style.top = rect.top + 'px';
  input.style.width = Math.max(80, rect.width) + 'px';
  input.style.fontSize = (parseFloat(getComputedStyle(targetEl).fontSize) || 12) + 'px';
  input.style.zIndex = '10000';
  input.style.background = 'var(--raise)';
  input.style.color = 'var(--ink)';
  input.style.border = '1px solid var(--cyan)';
  input.style.padding = '2px 4px';
  input.style.borderRadius = '4px';
  document.body.appendChild(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const val = input.value;
    try { input.remove(); } catch (_) {}
    if (commit) onCommit(val);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}
function editTopologyDeviceLabel(id,kind) {
  const d=RUN&&RUN.net&&RUN.net.devices[id];if(!d)return;
  const isName=kind==='name',defaultType=d.services||/^(srv|web|db|dns|www|site)/.test(id)?'server':d.kind;
  const current=isName?(d.label||id):(d.displayType||defaultType);
  const el = document.querySelector(`.device-label[data-device-label="${CSS.escape(id)}"][data-label-kind="${kind}"]`);
  startInlineTextEdit(el, current, value => {
    rememberTopology();
    if(isName){if(value.trim())d.label=value.trim().slice(0,48);else delete d.label;}
    else{if(value.trim())d.displayType=value.trim().slice(0,48);else delete d.displayType;}
    refresh();
  });
}
function editTopologyText(index) {
  const item=RUN&&RUN.net&&RUN.net.texts&&RUN.net.texts[index];if(!item)return;
  const el = document.querySelector(`.topo-text[data-text-index="${index}"]`);
  startInlineTextEdit(el, item.text||'', value => {
    rememberTopology();
    if(!value.trim())RUN.net.texts.splice(index,1);
    else item.text=value.trim().slice(0,160);
    refresh();
  });
}
function wireTopo() {
  const svg = $('#topo');
  if(!TOPO_DELETE_KEY_BOUND){document.addEventListener('keydown',e=>{if(!canBuild()||!RUN||!['Delete','Backspace'].includes(e.key)||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||''))return;const text=e.target&&e.target.closest&&e.target.closest('.topo-text');if(text){e.preventDefault();runTopologyContextAction('delete-text',{index:Number(text.dataset.textIndex)});return;}const label=e.target&&e.target.closest&&e.target.closest('.device-label');if(label){e.preventDefault();runTopologyContextAction('clear-device-label',{id:label.dataset.deviceLabel,labelKind:label.dataset.labelKind});}});TOPO_DELETE_KEY_BOUND=true;}
  // Arrow-key movement for any selected or focused canvas objects
  if (!window._topoArrowBound) {
    document.addEventListener('keydown', e => {
      if (!canBuild() || !RUN || document.querySelector('.topo-context-menu,.context-menu') || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      const step = e.shiftKey ? 40 : 10;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      // Include the focused canvas element even if it is not yet in a selection set
      const focusedNode = e.target && e.target.closest && e.target.closest('.node');
      const focusedLabel = e.target && e.target.closest && e.target.closest('.device-label');
      const focusedText = e.target && e.target.closest && e.target.closest('.topo-text');
      const focusedNote = e.target && e.target.closest && e.target.closest('.topo-note');
      // A focused label/text/note should move only that item, not any selected devices
      const isolate = !!(focusedLabel || focusedText || focusedNote);
      const deviceIds = isolate ? new Set() : new Set(TOPO_SELECTED);
      if (focusedNode) deviceIds.add(focusedNode.dataset.dev);
      else if (!isolate && !deviceIds.size && !TEXT_SELECTED.size && !LABEL_SELECTED.size && SEL) deviceIds.add(SEL);
      const textIdx = isolate && !focusedText ? new Set() : new Set(TEXT_SELECTED);
      if (focusedText) textIdx.add(Number(focusedText.dataset.textIndex));
      const labelKeys = isolate && !focusedLabel ? new Set() : new Set(LABEL_SELECTED);
      if (focusedLabel) labelKeys.add(focusedLabel.dataset.deviceLabel + ':' + focusedLabel.dataset.labelKind);
      if (!deviceIds.size && !textIdx.size && !labelKeys.size && !focusedNote) return;
      e.preventDefault();
      e.stopPropagation();
      let moved = 0;
      rememberTopology();
      deviceIds.forEach(id => { if (RUN.net.devices[id]) { const p = nodePos(id); setPos(id, p[0]+dx, p[1]+dy); moved++; } });
      textIdx.forEach(ti => { const t = RUN.net.texts && RUN.net.texts[ti]; if (t) { t.x = (Number(t.x)||0) + dx; t.y = (Number(t.y)||0) + dy; moved++; } });
      labelKeys.forEach(key => {
        const [lid, kind] = key.split(':');
        RUN.net.deviceLabelPositions = RUN.net.deviceLabelPositions || {};
        RUN.net.deviceLabelPositions[lid] = RUN.net.deviceLabelPositions[lid] || {};
        const pos = RUN.net.deviceLabelPositions[lid][kind];
        if (pos) { pos[0] += dx; pos[1] += dy; }
        else {
          const el = document.querySelector('.device-label[data-device-label="'+CSS.escape(lid)+'"][data-label-kind="'+kind+'"]');
          const x = el ? Number(el.getAttribute('x')) : 0, y = el ? Number(el.getAttribute('y')) : 0;
          RUN.net.deviceLabelPositions[lid][kind] = [x + dx, y + dy];
        }
        moved++;
      });
      if (focusedNote) {
        const ni = Number(focusedNote.dataset.noteIndex);
        const note = RUN.net.notes && RUN.net.notes[ni];
        if (note) { note.x = (Number(note.x)||0) + dx; note.y = (Number(note.y)||0) + dy; moved++; }
      }
      if (moved) {
        refresh();
        // Restore focus so repeated arrow presses keep working
        const next = focusedNode ? $('#topo .node[data-dev="'+CSS.escape(focusedNode.dataset.dev)+'"]')
          : focusedLabel ? $('#topo .device-label[data-device-label="'+CSS.escape(focusedLabel.dataset.deviceLabel)+'"][data-label-kind="'+focusedLabel.dataset.labelKind+'"]')
          : focusedText ? $('#topo .topo-text[data-text-index="'+focusedText.dataset.textIndex+'"]')
          : focusedNote ? $('#topo .topo-note[data-note-index="'+focusedNote.dataset.noteIndex+'"]')
          : null;
        if (next) next.focus();
        flashStatus('Moved ' + moved + ' item' + (moved===1?'':'s') + ' with arrow keys.');
      }
    }, true);
    window._topoArrowBound = true;
  }

  if(!TEXT_INSERT_CANCEL_BOUND){document.addEventListener('keydown',e=>{if(TEXT_INSERT_MODE&&e.key==='Escape'){TEXT_INSERT_MODE=false;refresh();flashStatus('Text insertion cancelled.');}});TEXT_INSERT_CANCEL_BOUND=true;}
  if (svg) svg.oncontextmenu = e => {
    if (!canBuild()) return;
    const node = e.target.closest && e.target.closest('.node');
    const edge = e.target.closest && (e.target.closest('.edge') || e.target.closest('.edge-label'));
    const drawing = e.target.closest && e.target.closest('.topo-drawing');
    const note = e.target.closest && e.target.closest('.topo-note');
    const deviceLabel = e.target.closest && (e.target.closest('.device-label') || (e.target.closest('.device-label-group') && e.target.closest('.device-label-group').querySelector('.device-label')));
    const text = e.target.closest && (e.target.closest('.topo-text') || (e.target.closest('.topo-text-group') && e.target.closest('.topo-text-group').querySelector('.topo-text')));
    if (deviceLabel) showTopologyContextMenu(e, 'device-label', { id: deviceLabel.dataset.deviceLabel, labelKind: deviceLabel.dataset.labelKind });
    else if (text) showTopologyContextMenu(e, 'text', { index: Number(text.dataset.textIndex) });
    else if (node) showTopologyContextMenu(e, 'device', { id: node.dataset.dev });
    else if (edge) showTopologyContextMenu(e, 'link', { index: Number(edge.dataset.linkIndex) });
    else if (drawing) showTopologyContextMenu(e, 'drawing', { index: Number(drawing.dataset.drawingIndex) });
    else if (note) showTopologyContextMenu(e, 'note', { index: Number(note.dataset.noteIndex) });
    else {
      const point = svgPoint(svg, e.clientX, e.clientY);
      showTopologyContextMenu(e, 'canvas', { point });
    }
  };

  if (svg) svg.addEventListener('click', e => {
    if (TEXT_INSERT_MODE && canBuild()) { const point=svgPoint(svg,e.clientX,e.clientY), value=prompt('Canvas text (max 160 characters):','New text'); TEXT_INSERT_MODE=false; if(value!==null&&value.trim()){rememberTopology();RUN.net.texts=RUN.net.texts||[];RUN.net.texts.push({text:value.trim().slice(0,160),x:point[0],y:point[1],fontSize:14,color:'#e5b85c'});refresh();} else {refresh();} return; }
    if (DRAW_TOOL !== 'select' && canBuild()) return;
    const target = e.target;
    const note = target && target.closest ? target.closest('.topo-note') : null;
    if (note && canBuild()) { const i=Number(note.dataset.noteIndex), current=RUN.net.notes[i]; const value=prompt('Edit topology note (leave blank to remove):',current && current.text || ''); if(value===null)return; rememberTopology();if(!value.trim())RUN.net.notes.splice(i,1); else current.text=value.trim().slice(0,120); refresh(); return; }
  });
  if (svg) svg.querySelectorAll('.topo-drawing').forEach(shape => shape.addEventListener('click', e => { if(!canBuild())return; e.stopPropagation(); DRAWING_SEL=Number(shape.dataset.drawingIndex); refresh(); }));
  if (svg) svg.querySelectorAll('.edge').forEach(edge => edge.addEventListener('click', () => {
    if (!canBuild()) return;
    LINK_SEL = Number(edge.getAttribute('data-link-index'));
    refresh();
  }));
  if (svg) {
    const menuFor=(el,kind,index)=>{const r=el.getBoundingClientRect();showTopologyContextMenu({preventDefault(){},stopPropagation(){},clientX:r.left+r.width/2,clientY:r.bottom},kind,{index});};
    svg.querySelectorAll('.edge').forEach(el=>el.addEventListener('keydown',e=>{
      if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menuFor(el,'link',Number(el.dataset.linkIndex));}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();LINK_SEL=Number(el.dataset.linkIndex);refresh();const next=$('#topo .edge[data-link-index="'+LINK_SEL+'"]');if(next)next.focus();}
    }));
    svg.querySelectorAll('.topo-drawing').forEach(el=>el.addEventListener('keydown',e=>{
      const index=Number(el.dataset.drawingIndex), item=RUN.net.drawings&&RUN.net.drawings[index];
      if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menuFor(el,'drawing',index);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();DRAWING_SEL=index;refresh();const next=$('#topo .topo-drawing[data-drawing-index="'+index+'"]');if(next)next.focus();}
      else if(canBuild()&&item&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
        e.preventDefault();const step=e.shiftKey?40:10,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
        rememberTopology();if(item.type==='freehand')item.points=item.points.map(p=>[p[0]+dx,p[1]+dy]);else{item.x1=Number(item.x1)+dx;item.y1=Number(item.y1)+dy;item.x2=Number(item.x2)+dx;item.y2=Number(item.y2)+dy;}
        DRAWING_SEL=index;refresh();const next=$('#topo .topo-drawing[data-drawing-index="'+index+'"]');if(next)next.focus();
      }
    }));
    svg.querySelectorAll('.topo-note').forEach(el=>el.addEventListener('keydown',e=>{
      const index=Number(el.dataset.noteIndex);
      if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();menuFor(el,'note',index);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();const note=RUN.net.notes[index];if(!note)return;const value=prompt('Edit topology note (leave blank to remove):',note.text||'');if(value===null)return;rememberTopology();if(!value.trim())RUN.net.notes.splice(index,1);else note.text=value.trim().slice(0,120);refresh();const next=$('#topo .topo-note[data-note-index="'+index+'"]');if(next)next.focus();}
      else if(canBuild()&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const item=RUN.net.notes[index];if(!item)return;const step=e.shiftKey?40:10;rememberTopology();item.x=(Number(item.x)||0)+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0);item.y=(Number(item.y)||0)+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);refresh();const next=$('#topo .topo-note[data-note-index="'+index+'"]');if(next)next.focus();}
    }));
  }
  if (svg) svg.addEventListener('dblclick', e => { const labelEl=e.target.closest&&(e.target.closest('.device-label')||(e.target.closest('.device-label-group')&&e.target.closest('.device-label-group').querySelector('.device-label'))), textEl=e.target.closest&&(e.target.closest('.topo-text')||(e.target.closest('.topo-text-group')&&e.target.closest('.topo-text-group').querySelector('.topo-text'))); if(labelEl&&canBuild()){e.preventDefault();editTopologyDeviceLabel(labelEl.dataset.deviceLabel,labelEl.dataset.labelKind);} else if(textEl&&canBuild()){e.preventDefault();editTopologyText(Number(textEl.dataset.textIndex));} });
  if (svg) svg.querySelectorAll('.device-label,.topo-text').forEach(el=>el.addEventListener('keydown',e=>{const label=el.classList.contains('device-label'),id=el.dataset.deviceLabel,index=Number(el.dataset.textIndex),kind=el.dataset.labelKind;if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=el.getBoundingClientRect();showTopologyContextMenu({preventDefault(){},stopPropagation(){},clientX:r.left+r.width/2,clientY:r.bottom},label?'device-label':'text',label?{id,labelKind:kind}:{index});}else if(e.key==='Enter'||e.key===' '){e.preventDefault();label?editTopologyDeviceLabel(id,kind):editTopologyText(index);}}));
  if (svg) svg.addEventListener('wheel', e => { e.preventDefault(); zoomTopologyAt(svg,e.deltaY>0?1.12:.89,e.clientX,e.clientY); }, { passive:false });
  if (svg) svg.addEventListener('pointerdown', e => {
    const resolveLabel=el=>{if(!el||!el.closest)return null;const direct=el.closest('.device-label');if(direct)return direct;const g=el.closest('.device-label-group');return g?g.querySelector('.device-label'):null;};
    const resolveText=el=>{if(!el||!el.closest)return null;const direct=el.closest('.topo-text');if(direct)return direct;const g=el.closest('.topo-text-group');return g?g.querySelector('.topo-text'):null;};
    const label=resolveLabel(e.target), text=resolveText(e.target), note=e.target.closest&&e.target.closest('.topo-note');
    if(canBuild()&&!TEXT_INSERT_MODE&&e.button===0&&note){const index=Number(note.dataset.noteIndex),item=RUN.net.notes&&RUN.net.notes[index];if(item){const p=svgPoint(svg,e.clientX,e.clientY);NOTE_DRAG={index,start:p,x:Number(item.x)||40,y:Number(item.y)||40,before:topologySnapshot(),moved:false,el:note};try{svg.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();e.stopPropagation();return;}}
    // WebKit can target an overlapping SVG edge/label instead of the small device
    // resize circle. Resolve resize handles geometrically as a fallback so the
    // drag remains reliable even when SVG paint-order hit testing differs.
    let resizeTarget=e.target.closest&&e.target.closest('[data-resize-kind]');
    if(!resizeTarget&&e.button===0){
      resizeTarget=[...svg.querySelectorAll('[data-resize-kind]')].find(handle=>{
        const r=handle.getBoundingClientRect();
        return e.clientX>=r.left-5&&e.clientX<=r.right+5&&e.clientY>=r.top-5&&e.clientY<=r.bottom+5;
      })||null;
    }
    if(canBuild()&&e.button===0&&resizeTarget){const p=svgPoint(svg,e.clientX,e.clientY),kind=resizeTarget.dataset.resizeKind,id=resizeTarget.dataset.dev||resizeTarget.dataset.deviceLabel,labelKind=resizeTarget.dataset.labelKind;const initial=kind==='device'?Math.max(.5,Math.min(2.5,Number((RUN.net.deviceSizes||{})[id])||1)):Math.max(7,Math.min(32,Number((((RUN.net.deviceLabelSizes||{})[id]||{})[labelKind]))||(labelKind==='type'?10:12)));RESIZE_DRAG={kind,id,labelKind,start:p,initial,before:topologySnapshot(),moved:false};try{svg.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();e.stopPropagation();return;}
    if(canBuild()&&!TEXT_INSERT_MODE&&DRAW_TOOL==='select'&&e.button===0&&(label||text)){const kind=label?'device-label':'text',index=text?Number(text.dataset.textIndex):null,id=label?label.dataset.deviceLabel:null,labelKind=label?label.dataset.labelKind:null;const additive=e.ctrlKey||e.metaKey||e.shiftKey;if(label){const key=id+':'+labelKind;if(additive){if(LABEL_SELECTED.has(key))LABEL_SELECTED.delete(key);else LABEL_SELECTED.add(key);}else if(!LABEL_SELECTED.has(key)){LABEL_SELECTED=new Set([key]);TEXT_SELECTED=new Set();}}else if(text){if(additive){if(TEXT_SELECTED.has(index))TEXT_SELECTED.delete(index);else TEXT_SELECTED.add(index);}else if(!TEXT_SELECTED.has(index)){TEXT_SELECTED=new Set([index]);LABEL_SELECTED=new Set();}}const point=svgPoint(svg,e.clientX,e.clientY);const value=label?{x:Number(label.getAttribute('x')),y:Number(label.getAttribute('y'))}:{x:Number(text.getAttribute('x')),y:Number(text.getAttribute('y'))};ANNOTATION_DRAG={kind,index,id,labelKind,start:point,value,before:topologySnapshot(),moved:false,el:label||text};try{svg.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return;}
    if (TEXT_INSERT_MODE && canBuild() && e.button===0) return;
    const existingDrawing = e.target.closest('.topo-drawing');
    const existingHandle = e.target.closest('.topo-drawing-handle');
    const pointerDrawing = canBuild() && e.button === 0 && !existingDrawing && !existingHandle && !e.target.closest('.node')
      ? hitTestTopologyDrawing(svgPoint(svg,e.clientX,e.clientY)) : null;
    if (canBuild() && e.button === 0 && (existingDrawing || existingHandle || pointerDrawing !== null)) {
      const index = Number((existingHandle || existingDrawing) ? (existingHandle || existingDrawing).dataset.drawingIndex : pointerDrawing), item = RUN.net.drawings && RUN.net.drawings[index];
      if (item) {
        DRAWING_SEL = index; const p = svgPoint(svg,e.clientX,e.clientY), handle = e.target.closest('.topo-drawing-handle');
        DRAWING_DRAG = { index, handle: handle ? handle.dataset.drawingHandle : null, start:p, before:topologySnapshot(), original:JSON.parse(JSON.stringify(item)), moved:false };
        const shape = svg.querySelector('.topo-drawing[data-drawing-index="'+index+'"]'); if(shape)shape.classList.add('selected');
        try{svg.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); e.stopPropagation(); return;
      }
    }
    if (e.target.closest('.node') || WIRE) return;
    if (e.button===1 || e.altKey || e.button!==0) { const vb=svg.viewBox.baseVal,rect=svg.getBoundingClientRect();PAN={x:e.clientX,y:e.clientY,view:[vb.x,vb.y,vb.width,vb.height],width:rect.width,height:rect.height};svg.classList.add('panning');try{svg.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return; }
    if (DRAW_TOOL !== 'select' && canBuild()) { beginTopologyDrawing(svg,e); return; }
    if (canBuild() && (TOPO_CAPTURE_SELECT || e.shiftKey)) { const p=svgPoint(svg,e.clientX,e.clientY); BOX={start:p,current:p,additive:e.ctrlKey||e.metaKey||e.shiftKey}; const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('class','topo-selection-box');r.setAttribute('x',p[0]);r.setAttribute('y',p[1]);r.setAttribute('width',0);r.setAttribute('height',0);svg.appendChild(r);BOX.el=r;try{svg.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return; }
    const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    PAN = { x:e.clientX, y:e.clientY, view:[vb.x,vb.y,vb.width,vb.height], width:rect.width, height:rect.height };
    svg.classList.add('panning');
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  });
  document.querySelectorAll('#topo .node').forEach(n => {
    n.addEventListener('keydown', e => {
      const id=n.dataset.dev, rect=n.getBoundingClientRect();
      const openMenu=()=>showTopologyContextMenu({preventDefault(){},stopPropagation(){},clientX:rect.left+rect.width/2,clientY:rect.bottom},'device',{id});
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openMenu(); return; }

      if (canBuild() && (e.key==='c'||e.key==='C')) { e.preventDefault(); WIRE=id; flashStatus('Connection started from '+id+'. Focus another device and press Enter.'); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (canBuild() && WIRE) {
          if(WIRE!==id){try{rememberTopology();B.addLink(RUN.net,WIRE,id);flashStatus('Connected '+WIRE+' to '+id+'.');}catch(err){flashStatus(err.message);}}
          WIRE=null;refresh();const next=$('#topo .node[data-dev="'+CSS.escape(id)+'"]');if(next)next.focus();return;
        }
        selectDevice(id); const next=$('#topo .node[data-dev="'+CSS.escape(id)+'"]');if(next)next.focus();
      }
    });
    n.addEventListener('pointerdown', e => {
      const id = n.dataset.dev;
      // If a label or free text sits under the pointer, let that item handle the drag
      // (WebKit elementFromPoint can return the node even when the click is on a label).
      if (canBuild() && e.button === 0) {
        const over = [...document.querySelectorAll('#topo .device-label, #topo .topo-text')].find(el => {
          const r = el.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        if (over) return;
      }
      if ((e.ctrlKey || e.metaKey || e.shiftKey) && canBuild()) { e.preventDefault(); if(TOPO_SELECTED.has(id)){TOPO_SELECTED.delete(id);if(SEL===id){const next=[...TOPO_SELECTED][0]||null;if(next)selectDevice(next);else{persistTerminalSession();SEL=null;refresh();}}else refresh();}else{TOPO_SELECTED.add(id);selectDevice(id);} return; }
      if (WIRE) {                                      // wiring: connect the armed device to this one
        if (WIRE !== id) { try { rememberTopology(); B.addLink(RUN.net, WIRE, id); } catch (err) { flashStatus(err.message); } }
        WIRE = null; refresh(); return;
      }
      const clickAt = Date.now();
      if (LAST_NODE_ACTIVATION.id === id && clickAt - LAST_NODE_ACTIVATION.at < 450) {
        LAST_NODE_ACTIVATION = { id:null, at:0 };
        e.preventDefault();
        selectDevice(id);
        openTerminalWindow(true);
        return;
      }
      LAST_NODE_ACTIVATION = { id, at:clickAt };
      e.preventDefault();
      const svg = $('#topo'); const [px, py] = svgPoint(svg, e.clientX, e.clientY);
      const cur = nodePos(id);
      // Dragging a node that is part of the current multi-selection moves the whole
      // group; clicking a node outside the selection starts a fresh single-node drag.
      if(!TOPO_SELECTED.has(id))TOPO_SELECTED=new Set([id]);
      const ids=[...TOPO_SELECTED].filter(x=>RUN.net.devices[x]); const starts={};ids.forEach(x=>starts[x]=nodePos(x).slice());
      // Also capture currently selected texts and labels so the whole group moves
      const textStarts = {}; [...TEXT_SELECTED].forEach(ti => { const t = RUN.net.texts && RUN.net.texts[ti]; if(t) textStarts[ti] = [t.x, t.y]; });
      const labelStarts = {}; [...LABEL_SELECTED].forEach(key => { const [lid, kind] = key.split(':'); const pos = RUN.net.deviceLabelPositions && RUN.net.deviceLabelPositions[lid] && RUN.net.deviceLabelPositions[lid][kind]; if(pos) labelStarts[key] = pos.slice(); });
      DRAG = { id, ids, starts, textStarts, labelStarts, before:topologySnapshot(), offX: px - cur[0], offY: py - cur[1], moved: false };
      try { n.setPointerCapture(e.pointerId); } catch (_) {}
    });
  });
}
function onDragMove(e) {
  const svg = $('#topo'); if (!svg) return;
  if (DRAWING) { updateTopologyDrawing(e); return; }
  if(RESIZE_DRAG){const d=RESIZE_DRAG,p=svgPoint(svg,e.clientX,e.clientY),delta=p[0]-d.start[0];if(Math.abs(delta)>1)d.moved=true;const value=d.kind==='device'?Math.max(.5,Math.min(2.5,d.initial+delta/42)):Math.max(7,Math.min(32,d.initial+delta/5));if(d.kind==='device'){RUN.net.deviceSizes=RUN.net.deviceSizes||{};RUN.net.deviceSizes[d.id]=Math.round(value*100)/100;const art=svg.querySelector('.node[data-dev="'+CSS.escape(d.id)+'"] .device-art-scale');if(art)art.setAttribute('transform','translate(24 18) scale('+value+') translate(-24 -18)');}else{RUN.net.deviceLabelSizes=RUN.net.deviceLabelSizes||{};RUN.net.deviceLabelSizes[d.id]=RUN.net.deviceLabelSizes[d.id]||{};RUN.net.deviceLabelSizes[d.id][d.labelKind]=Math.round(value*10)/10;const labelEl=svg.querySelector('.device-label[data-device-label="'+CSS.escape(d.id)+'"][data-label-kind="'+d.labelKind+'"]');if(labelEl)labelEl.setAttribute('font-size',value);}return;}
  if (NOTE_DRAG) {const d=NOTE_DRAG,p=svgPoint(svg,e.clientX,e.clientY),dx=p[0]-d.start[0],dy=p[1]-d.start[1];if(Math.hypot(dx,dy)>1)d.moved=true;if(d.moved){d.nextX=d.x+dx;d.nextY=d.y+dy;d.el.setAttribute('transform','translate('+d.nextX+','+d.nextY+')');}return;}
  if (DRAWING_DRAG) {
    const d=DRAWING_DRAG,item=RUN.net.drawings[d.index],p=svgPoint(svg,e.clientX,e.clientY),dx=p[0]-d.start[0],dy=p[1]-d.start[1];
    if(Math.hypot(dx,dy)>1)d.moved=true;
    if(item&&d.moved){
      if(item.type==='freehand')item.points=d.original.points.map(pt=>[pt[0]+dx,pt[1]+dy]);
      else if(d.handle==='start'){item.x1=d.original.x1+dx;item.y1=d.original.y1+dy;}
      else if(d.handle==='end'){item.x2=d.original.x2+dx;item.y2=d.original.y2+dy;}
      else {item.x1=d.original.x1+dx;item.y1=d.original.y1+dy;item.x2=d.original.x2+dx;item.y2=d.original.y2+dy;}
      const shape=svg.querySelector('.topo-drawing[data-drawing-index="'+d.index+'"]');
      if(shape){if(item.type==='freehand')shape.setAttribute('d',item.points.map((pt,i)=>(i?'L':'M')+pt[0]+' '+pt[1]).join(' '));else if(item.type==='rect'){shape.setAttribute('x',Math.min(item.x1,item.x2));shape.setAttribute('y',Math.min(item.y1,item.y2));shape.setAttribute('width',Math.abs(item.x2-item.x1));shape.setAttribute('height',Math.abs(item.y2-item.y1));}else if(item.type==='ellipse'){shape.setAttribute('cx',(item.x1+item.x2)/2);shape.setAttribute('cy',(item.y1+item.y2)/2);shape.setAttribute('rx',Math.abs(item.x2-item.x1)/2);shape.setAttribute('ry',Math.abs(item.y2-item.y1)/2);}else{shape.setAttribute('x1',item.x1);shape.setAttribute('y1',item.y1);shape.setAttribute('x2',item.x2);shape.setAttribute('y2',item.y2);}}
      svg.querySelectorAll('.topo-drawing-handle[data-drawing-index="'+d.index+'"]').forEach(h=>{const start=h.dataset.drawingHandle==='start';h.setAttribute('cx',start?item.x1:item.x2);h.setAttribute('cy',start?item.y1:item.y2);});
    }
    return;
  }
  if (ANNOTATION_DRAG) { const p=svgPoint(svg,e.clientX,e.clientY),d=ANNOTATION_DRAG,dx=p[0]-d.start[0],dy=p[1]-d.start[1]; if(Math.hypot(dx,dy)>0.5)d.moved=true; const x=d.value.x+dx,y=d.value.y+dy;d.el.setAttribute('x',x);d.el.setAttribute('y',y);return; }
  if (BOX) { const p=svgPoint(svg,e.clientX,e.clientY);BOX.current=p;const x=Math.min(BOX.start[0],p[0]),y=Math.min(BOX.start[1],p[1]);BOX.el.setAttribute('x',x);BOX.el.setAttribute('y',y);BOX.el.setAttribute('width',Math.abs(p[0]-BOX.start[0]));BOX.el.setAttribute('height',Math.abs(p[1]-BOX.start[1]));return; }
  if (PAN) {
    const dx = (e.clientX - PAN.x) * PAN.view[2] / Math.max(1, PAN.width);
    const dy = (e.clientY - PAN.y) * PAN.view[3] / Math.max(1, PAN.height);
    TOPO_VIEW = [PAN.view[0] - dx, PAN.view[1] - dy, PAN.view[2], PAN.view[3]];
    svg.setAttribute('viewBox', TOPO_VIEW.join(' '));
    return;
  }
  if (!DRAG) return;
  const [px, py] = svgPoint(svg, e.clientX, e.clientY);
  const nx = px - DRAG.offX, ny = py - DRAG.offY;
  const prev = DRAG.starts[DRAG.id] || nodePos(DRAG.id);
  if (!DRAG.moved && Math.hypot(nx - prev[0], ny - prev[1]) > 3) DRAG.moved = true;
  const dx=nx-prev[0],dy=ny-prev[1];
  DRAG.ids.forEach(id=>{const start=DRAG.starts[id]||nodePos(id);setPos(id,start[0]+dx,start[1]+dy);const p=nodePos(id),cx=p[0]+24,cy=p[1]+18;const g=document.querySelector(`#topo .node[data-dev="${id}"]`);if(g)g.setAttribute('transform',`translate(${p[0]},${p[1]})`);document.querySelectorAll(`#topo line[data-a="${id}"]`).forEach(l=>{l.setAttribute('x1',cx);l.setAttribute('y1',cy);});document.querySelectorAll(`#topo line[data-b="${id}"]`).forEach(l=>{l.setAttribute('x2',cx);l.setAttribute('y2',cy);});});
  // Move selected texts and labels with the group
  if(DRAG.textStarts) Object.entries(DRAG.textStarts).forEach(([ti, start]) => { const t = RUN.net.texts && RUN.net.texts[ti]; if(t){ t.x = start[0]+dx; t.y = start[1]+dy; const el = document.querySelector(`.topo-text[data-text-index="${ti}"]`); if(el){el.setAttribute('x', t.x); el.setAttribute('y', t.y);} } });
  if(DRAG.labelStarts) Object.entries(DRAG.labelStarts).forEach(([key, start]) => { const [lid, kind] = key.split(':'); RUN.net.deviceLabelPositions = RUN.net.deviceLabelPositions || {}; RUN.net.deviceLabelPositions[lid] = RUN.net.deviceLabelPositions[lid] || {}; RUN.net.deviceLabelPositions[lid][kind] = [start[0]+dx, start[1]+dy]; const el = document.querySelector(`.device-label[data-device-label="${CSS.escape(lid)}"][data-label-kind="${kind}"]`); if(el){el.setAttribute('x', start[0]+dx); el.setAttribute('y', start[1]+dy);} });
}
function onDragUp() {
  if(DRAWING){finishTopologyDrawing();return;}
  if(RESIZE_DRAG){const d=RESIZE_DRAG;RESIZE_DRAG=null;if(d.moved)rememberTopology(d.before);refresh();return;}
  if(NOTE_DRAG){const d=NOTE_DRAG;NOTE_DRAG=null;if(d.moved){const item=RUN.net.notes&&RUN.net.notes[d.index];if(item){item.x=d.nextX;item.y=d.nextY;rememberTopology(d.before);}}refresh();return;}
  if(DRAWING_DRAG){const d=DRAWING_DRAG;DRAWING_DRAG=null;if(d.moved){rememberTopology(d.before);refresh();}else{refresh();}return;}
  if(ANNOTATION_DRAG){const d=ANNOTATION_DRAG;ANNOTATION_DRAG=null;if(d.moved){const dx=Number(d.el.getAttribute('x'))-d.value.x,dy=Number(d.el.getAttribute('y'))-d.value.y;rememberTopology(d.before);if(d.kind==='device-label'){RUN.net.deviceLabelPositions=RUN.net.deviceLabelPositions||{};RUN.net.deviceLabelPositions[d.id]=RUN.net.deviceLabelPositions[d.id]||{};RUN.net.deviceLabelPositions[d.id][d.labelKind]=[d.value.x+dx,d.value.y+dy];}else{const item=RUN.net.texts&&RUN.net.texts[d.index];if(item){item.x=d.value.x+dx;item.y=d.value.y+dy;}}}refresh();return;}
  if(BOX){const b=BOX;BOX=null;if(b.el)b.el.remove();const x1=Math.min(b.start[0],b.current[0]),x2=Math.max(b.start[0],b.current[0]),y1=Math.min(b.start[1],b.current[1]),y2=Math.max(b.start[1],b.current[1]);
const captured=Object.keys(RUN.net.devices).filter(id=>{const p=nodePos(id);return p[0]+48>=x1&&p[0]<=x2&&p[1]+36>=y1&&p[1]<=y2;});
const textCaptured=(RUN.net.texts||[]).map((t,i)=>[i,t]).filter(([,t])=>t.x>=x1&&t.x<=x2&&t.y>=y1&&t.y<=y2).map(([i])=>i);
const labelCaptured=[];
Object.entries(RUN.net.deviceLabelPositions||{}).forEach(([id,pos])=>{
  Object.entries(pos).forEach(([kind,xy])=>{if(xy&&xy[0]>=x1&&xy[0]<=x2&&xy[1]>=y1&&xy[1]<=y2)labelCaptured.push(id+':'+kind);});
});
TOPO_SELECTED=b.additive?new Set([...TOPO_SELECTED,...captured]):new Set(captured);
TEXT_SELECTED=b.additive?new Set([...TEXT_SELECTED,...textCaptured]):new Set(textCaptured);
LABEL_SELECTED=b.additive?new Set([...LABEL_SELECTED,...labelCaptured]):new Set(labelCaptured);
SEL=[...TOPO_SELECTED][0]||null;refresh();return;}
  if (PAN) { PAN = null; const svg = $('#topo'); if (svg) svg.classList.remove('panning'); return; }
  if (!DRAG) return;
  const d = DRAG; DRAG = null;
  // A press without movement is a plain click: collapse any multi-selection to the
  // clicked node. A real drag keeps the whole selection (every node already moved).
  if (!d.moved) { TOPO_SELECTED = new Set([d.id]); selectDevice(d.id); }
  else { if(SEL!==d.id)selectDevice(d.id); rememberTopology(d.before); refresh(); }
}
function zoomTopology(factor) {
  const svg = $('#topo'); if (!svg) return;
  const v = svg.viewBox.baseVal, w = Math.max(120, Math.min(5000, v.width * factor)), h = Math.max(90, Math.min(4000, v.height * factor));
  TOPO_VIEW = [v.x + (v.width - w) / 2, v.y + (v.height - h) / 2, w, h];
  svg.setAttribute('viewBox', TOPO_VIEW.join(' '));
}
function fitTopology() { TOPO_VIEW = null; refresh(); }
function focusSelectedTopology() {
  if (!SEL || !RUN || !RUN.net.devices[SEL]) return;
  const [x,y] = nodePos(SEL), svg=$('#topo'); if (!svg) return;
  const v=svg.viewBox.baseVal, w=Math.max(180,Math.min(900,v.width*.62)), h=Math.max(130,Math.min(650,v.height*.62));
  TOPO_VIEW=[x+24-w/2,y+30-h/2,w,h]; svg.setAttribute('viewBox',TOPO_VIEW.join(' '));
}
function toggleTopologyPorts() { TOPO_SHOW_PORTS=!TOPO_SHOW_PORTS; refresh(); }
function zoomTopologyAt(svg, factor, clientX, clientY) {
  const p=svgPoint(svg,clientX,clientY), v=svg.viewBox.baseVal;
  const w=Math.max(120,Math.min(5000,v.width*factor)), h=Math.max(90,Math.min(4000,v.height*factor));
  const rx=(p[0]-v.x)/v.width, ry=(p[1]-v.y)/v.height;
  TOPO_VIEW=[p[0]-rx*w,p[1]-ry*h,w,h]; svg.setAttribute('viewBox',TOPO_VIEW.join(' '));
}
function autoArrange() { if (RUN && RUN.net) { delete RUN.net.pos; TOPO_VIEW = null; refresh(); } }
function flashStatus(msg) { const b = $('#status'); if (b) { b.className = 'bad'; b.textContent = msg; } }
function wireBrief() {
  if (MODE === 'build') {                              // authoring panel
    renderCheckArgs();
    $('#chkType').addEventListener('change', renderCheckArgs);
    $('#addChk').addEventListener('click', addCheckFromForm);
    document.querySelectorAll('#brief [data-delchk]').forEach(b => b.addEventListener('click', () => { AUTHOR.success.splice(+b.dataset.delchk, 1); persistBuilderDraft(); $('#brief').innerHTML = renderAuthor(); wireBrief(); }));
    $('#aTitle').addEventListener('input', e => { AUTHOR.title = e.target.value; persistBuilderDraft(); });
    $('#aObj').addEventListener('input', e => { AUTHOR.objective = e.target.value; persistBuilderDraft(); });
    $('#exportScn').addEventListener('click', exportScenario);
    $('#importScn').addEventListener('change', e => { if (e.target.files[0]) importScenario(e.target.files[0]); });
    $('#playScn').addEventListener('click', playAuthored);
    $('#exitBuild').addEventListener('click', exitBuild);
    const sl = $('#saveLib'); if (sl) sl.addEventListener('click', saveToLibrary);
    return;
  }
  const deviceSearch = $('#deviceSearch');
  if (deviceSearch) deviceSearch.addEventListener('input', () => {
    const q = deviceSearch.value.trim().toLowerCase();
    document.querySelectorAll('#brief [data-explorer-dev]').forEach(b => { b.hidden = q && !b.dataset.search.includes(q); });
  });
  document.querySelectorAll('#brief [data-explorer-dev]').forEach(b => b.addEventListener('click', () => selectDevice(b.dataset.explorerDev)));
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
  document.querySelectorAll('#config [data-iface-command]').forEach(b => b.addEventListener('click', () => { const input = $('#tin'); if (input) { input.value = 'show interfaces ' + b.dataset.ifaceCommand; input.focus(); } }));
  document.querySelectorAll('#config .inspector-tab').forEach(b => b.addEventListener('click', () => { INSPECTOR_TAB = b.dataset.inspectorTab; refresh(); }));
  const brandSel = $('#deviceBrand'); if (brandSel) brandSel.addEventListener('change', () => {
    if (!SEL || !RUN.net.devices[SEL]) return;
    rememberTopology();
    if (brandSel.value === 'generic') delete RUN.net.devices[SEL].brand; else RUN.net.devices[SEL].brand = brandSel.value;
    flashStatus(SEL + ' now uses the ' + ((BRANDS[brandSel.value] || BRANDS.generic).label) + ' command set.');
    refresh();
  });
  document.querySelectorAll('#config .pal[data-add]').forEach(b => b.addEventListener('click', () => {
    rememberTopology(); const id = B.addDevice(RUN.net, b.dataset.add); TOPO_SELECTED=new Set([id]); LINK_SEL=null; selectDevice(id); WIRE = null; refresh();
  }));
  const dup=$('#duplicateDev'); if(dup)dup.addEventListener('click',()=>{if(!SEL)return;try{rememberTopology(); const id=B.cloneDevice(RUN.net,SEL);TOPO_SELECTED=new Set([id]);LINK_SEL=null;selectDevice(id);refresh();}catch(e){flashStatus(e.message);}});
  const noteBtn=$('#noteBtn'); if(noteBtn)noteBtn.addEventListener('click',()=>{const text=prompt('Topology note (max 120 characters):','Network note');if(text===null||!text.trim())return;rememberTopology();RUN.net.notes=RUN.net.notes||[];const p=SEL?nodePos(SEL):[60,60];RUN.net.notes.push({text:text.trim().slice(0,120),x:p[0]+70,y:p[1]});refresh();});
  const textBtn=$('#textBtn');if(textBtn)textBtn.addEventListener('click',()=>{TEXT_INSERT_MODE=!TEXT_INSERT_MODE;DRAW_TOOL='select';textBtn.classList.toggle('active',TEXT_INSERT_MODE);flashStatus(TEXT_INSERT_MODE?'Click anywhere on the topology canvas to place text.':'Text insertion cancelled.');});
  const labelDev=$('#labelDev');if(labelDev)labelDev.addEventListener('click',()=>{if(!SEL||!RUN.net.devices[SEL])return;const d=RUN.net.devices[SEL],value=prompt('Device display label (leave blank to use its ID):',d.label||'');if(value===null)return;rememberTopology();if(value.trim())d.label=value.trim().slice(0,32);else delete d.label;refresh();});
  const zoneBtn=$('#zoneBtn');if(zoneBtn)zoneBtn.addEventListener('click',()=>{const ids=[...TOPO_SELECTED].filter(id=>RUN.net.devices[id]);if(!ids.length&&SEL)ids.push(SEL);if(!ids.length)return;const name=prompt('Zone name (max 32 characters):','Core network');if(name===null||!name.trim())return;const points=ids.map(id=>nodePos(id));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const x=Math.max(0,Math.min(...xs)-24),y=Math.max(0,Math.min(...ys)-28),right=Math.max(...xs)+84,bottom=Math.max(...ys)+96;rememberTopology();RUN.net.zones=RUN.net.zones||[];RUN.net.zones.push({name:name.trim().slice(0,32),x,y,w:Math.max(140,right-x),h:Math.max(110,bottom-y),color:'#60a5fa',devices:ids});refresh();});
  document.querySelectorAll('#config [data-topo-layer]').forEach(c=>c.addEventListener('change',()=>{TOPO_LAYERS[c.dataset.topoLayer]=c.checked;RUN.net.layerVisibility=RUN.net.layerVisibility||{};RUN.net.layerVisibility[c.dataset.topoLayer]=c.checked;refresh();}));
  const captureBtn=$('#captureSelectBtn');if(captureBtn)captureBtn.addEventListener('click',()=>{TOPO_CAPTURE_SELECT=!TOPO_CAPTURE_SELECT;refresh();});
  const gridBtn=$('#gridBtn');if(gridBtn)gridBtn.addEventListener('click',()=>{TOPO_GRID=!TOPO_GRID;refresh();});
  const snapBtn=$('#snapBtn');if(snapBtn)snapBtn.addEventListener('click',()=>{TOPO_SNAP=!TOPO_SNAP;refresh();});
  const portsBtn=$('#portsBtn');if(portsBtn)portsBtn.addEventListener('click',()=>toggleTopologyPorts());
  document.querySelectorAll('#config [data-draw-tool]').forEach(b=>b.addEventListener('click',()=>{DRAW_TOOL=b.dataset.drawTool;DRAWING_SEL=null;refresh();}));
  const delDrawing=$('#delDrawing');if(delDrawing)delDrawing.addEventListener('click',()=>{if(DRAWING_SEL==null||!RUN.net.drawings||!RUN.net.drawings[DRAWING_SEL])return;rememberTopology();RUN.net.drawings.splice(DRAWING_SEL,1);DRAWING_SEL=null;refresh();});
  const delLink=$('#delLink');if(delLink)delLink.addEventListener('click',()=>{const index=Number(delLink.dataset.linkIndex);if(!Number.isInteger(index)||index<0)return;rememberTopology();B.removeLink(RUN.net,index);LINK_SEL=null;refresh();});
  const ub=$('#topoUndo');if(ub)ub.addEventListener('click',undoTopology);const rb=$('#topoRedo');if(rb)rb.addEventListener('click',redoTopology);const cp=$('#topoCopy');if(cp)cp.addEventListener('click',copyTopologySelection);const ps=$('#topoPaste');if(ps)ps.addEventListener('click',pasteTopologySelection);
  const wb = $('#wireBtn'); if (wb) wb.addEventListener('click', () => {
    if (WIRE) { WIRE = null; } else if (SEL) { WIRE = SEL; } else { flashStatus('Select a device first, then Wire.'); }
    refresh();
  });
  const dd = $('#delDev'); if (dd) dd.addEventListener('click', () => { if (SEL) { rememberTopology(); B.removeDevice(RUN.net, SEL); TOPO_SELECTED.delete(SEL); delete TERM_SESSIONS[SEL]; SEL = null; WIRE = null; LINK_SEL=null; refresh(); } });
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

const KNOWLEDGE_COMMANDS = [
  {cmd:'ip addr',cat:'Linux · basics',desc:'Inspect interface addresses and link state.'},
  {cmd:'ip route',cat:'Linux · basics',desc:'Inspect the host routing table and default gateway.'},
  {cmd:'ping 192.0.2.1',cat:'Linux · troubleshooting',desc:'Test reachability to a destination.'},
  {cmd:'traceroute 192.0.2.1',cat:'Linux · troubleshooting',desc:'Trace the routed path to a destination.'},
  {cmd:'show vlan brief',cat:'Cisco IOS · switching',desc:'Verify VLAN IDs, names and access-port membership.'},
  {cmd:'show interfaces status',cat:'Cisco IOS · switching',desc:'Review switch port state, speed, duplex and VLAN.'},
  {cmd:'show interfaces trunk',cat:'Cisco IOS · switching',desc:'Check trunk state and allowed VLANs.'},
  {cmd:'show spanning-tree',cat:'Cisco IOS · switching',desc:'Inspect STP root, roles and forwarding/blocking states.'},
  {cmd:'show mac address-table',cat:'Cisco IOS · switching',desc:'Find the switch port where a MAC address was learned.'},
  {cmd:'show ip interface brief',cat:'Cisco IOS · routing',desc:'Review router interface addressing and operational state.'},
  {cmd:'show ip route',cat:'Cisco IOS · routing',desc:'Inspect connected, static and learned routes.'},
  {cmd:'show ip ospf neighbor',cat:'Cisco IOS · routing',desc:'Verify OSPF neighbour adjacencies.'},
  {cmd:'show access-lists',cat:'Cisco IOS · security',desc:'Review configured access-control entries.'},
  {cmd:'show running-config',cat:'Cisco IOS · verification',desc:'Inspect active device configuration.'}
];
const KNOWLEDGE_PLAYBOOKS = [
  {title:'Endpoint cannot reach a resource',steps:['Confirm the endpoint interface is up and has the expected address and mask','Check the local route and default gateway','Test the gateway, then the destination; use traceroute to locate the failing hop','Check VLAN membership, routing and ACL policy along the path']},
  {title:'Switch port is not forwarding',steps:['Check physical link and administrative state','Verify access VLAN or trunk allowed VLAN configuration','Inspect spanning-tree role and state for the affected VLAN','Check port-security violations and interface counters']},
  {title:'Routed subnet is unreachable',steps:['Confirm both router interfaces are up/up and correctly addressed','Inspect the routing table for the destination prefix','Verify next-hop reachability and routing protocol neighbours','Review ACLs and return-path routing before changing configuration']},
  {title:'A recent change caused an outage',steps:['Identify the change window, affected service and scope','Compare current configuration with the last known-good record','Validate the smallest suspected change and its dependencies','Rollback safely if needed, then verify service and document evidence']}
];

/* ---------- packet journey explorer ---------- */
function renderPacketJourneyExplorer(scenario = 'dns', direction = 'request', step = 0) {
  const root = $('#protocolLabResult'); if (!root) return;
  const net = chapters.find(c => c.id === 'name-wont-resolve').build();
  let destination, proto, dport, sourceLabel, destinationLabel;
  if (scenario === 'http') {
    destination = '10.0.2.10'; proto = 'tcp'; dport = 80;
    sourceLabel = 'h1 · 10.0.1.10'; destinationLabel = 'www · 10.0.2.10';
  } else {
    const resolver = net.devices.dns1.ifaces.eth0.ip;
    net.devices.h1.resolver = resolver;
    destination = resolver; proto = 'udp'; dport = 53;
    sourceLabel = 'h1 · 10.0.1.10'; destinationLabel = 'dns1 · ' + M.ipStr(resolver);
  }
  const trace = M.packetJourney(net, 'h1', destination, { proto, dport });
  const path = direction === 'reply' ? trace.reply : trace.request;
  const current = Math.max(0, Math.min(Number(step) || 0, Math.max(0, path.length - 1)));
  const hop = path[current] || null;
  const pathButtons = path.length ? '<ol class="journey-steps" aria-label="' + esc(direction + ' packet steps') + '">' + path.map((item,index) =>
    '<li><button type="button" data-journey-step="' + index + '" class="' + (index === current ? 'is-current' : '') + '" ' + (index === current ? 'aria-current="step"' : '') + '><span>' + (index + 1) + '</span><b>' + esc(item.deviceName) + '</b><small>' + esc(item.kind + ' · ' + item.state) + '</small></button></li>').join('') + '</ol>' : '<p class="protocol-muted">The engine produced no hop path for this direction.</p>';
  const details = hop ? '<section class="journey-detail" aria-live="polite"><div class="eyebrow">HOP ' + (current + 1) + ' OF ' + path.length + '</div><h3>' + esc(hop.deviceName) + '</h3><p>' + esc(hop.kind + (hop.address ? ' · ' + hop.address : '')) + '</p><dl><div><dt>Ingress</dt><dd>' + esc(hop.ingressInterface || 'Local source') + (hop.ingressPeerInterface ? ' ← ' + esc(hop.ingressPeerInterface) : '') + '</dd></div><div><dt>Egress</dt><dd>' + esc(hop.egressInterface || (hop.state === 'delivered' ? 'Destination reached' : 'Not available')) + (hop.egressPeerInterface ? ' → ' + esc(hop.egressPeerInterface) : '') + '</dd></div><div><dt>Decision</dt><dd>' + esc(hop.detail) + '</dd></div><div><dt>Result</dt><dd>' + esc(hop.state) + '</dd></div></dl></section>' : '';
  root.innerHTML = '<style>.journey-toolbar,.journey-choice,.journey-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.journey-toolbar{justify-content:space-between;margin:16px 0}.journey-choice button{border:1px solid var(--line);background:var(--raise);color:var(--ink);border-radius:7px;padding:8px 11px;font:inherit;cursor:pointer}.journey-choice button[aria-pressed=true]{border-color:var(--amber);color:var(--amber)}.journey-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.journey-summary>div{padding:10px;background:var(--raise);border:1px solid var(--line);border-radius:8px;min-width:0}.journey-summary small,.journey-summary b{display:block}.journey-summary small{font-size:10px;color:var(--muted);text-transform:uppercase}.journey-summary b{font-size:12px;margin-top:4px;overflow-wrap:anywhere}.journey-layout{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.2fr);gap:14px;margin-top:16px}.journey-steps{list-style:none;padding:0;margin:0;display:grid;gap:6px}.journey-steps button{width:100%;display:grid;grid-template-columns:25px 1fr;gap:2px 8px;text-align:left;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--raise);color:var(--ink);cursor:pointer;font:inherit}.journey-steps button.is-current{border-color:var(--amber);box-shadow:inset 3px 0 var(--amber)}.journey-steps button>span{grid-row:span 2;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;background:var(--panel);color:var(--amber)}.journey-steps small{color:var(--muted);font-size:10px}.journey-detail{padding:15px;border:1px solid var(--line);border-radius:9px;background:var(--panel)}.journey-detail h3{margin:4px 0}.journey-detail p{margin:0;color:var(--muted);font-size:12px}.journey-detail dl{display:grid;gap:8px;margin:14px 0 0}.journey-detail dl>div{display:grid;grid-template-columns:90px 1fr;gap:8px;border-top:1px solid var(--line);padding-top:8px}.journey-detail dt{font-size:10px;text-transform:uppercase;color:var(--muted)}.journey-detail dd{margin:0;font-size:12px;overflow-wrap:anywhere}.journey-controls{justify-content:space-between;margin-top:10px;color:var(--muted);font-size:11px}.journey-controls button:disabled{opacity:.4;cursor:not-allowed}@media(max-width:760px){.journey-summary{grid-template-columns:1fr 1fr}.journey-layout{grid-template-columns:1fr}}@media(max-width:420px){.journey-summary{grid-template-columns:1fr}}</style>' +
    '<div class="journey-explorer"><div class="protocol-result-head"><div><div class="eyebrow">ENGINE-OBSERVED PACKET JOURNEY</div><h2>Follow a packet, hop by hop</h2><p>Choose a teaching flow, then step through the exact device path returned by the simulator. This is a deterministic simulation, not a live packet capture.</p></div><span class="protocol-status ' + (trace.ok ? 'is-ok' : 'is-note') + '">' + (trace.ok ? 'Delivered' : 'Path stopped') + '</span></div>' +
    '<div class="journey-toolbar"><div class="journey-choice" role="group" aria-label="Packet scenario"><button type="button" data-journey-scenario="dns" aria-pressed="' + (scenario === 'dns') + '">DNS lookup</button><button type="button" data-journey-scenario="http" aria-pressed="' + (scenario === 'http') + '">HTTP request</button></div><div class="journey-choice" role="group" aria-label="Packet direction"><button type="button" data-journey-direction="request" aria-pressed="' + (direction === 'request') + '">Request</button><button type="button" data-journey-direction="reply" aria-pressed="' + (direction === 'reply') + '">Reply</button></div></div>' +
    '<div class="journey-summary"><div><small>Source</small><b>' + esc(sourceLabel) + '</b></div><div><small>Destination</small><b>' + esc(destinationLabel) + '</b></div><div><small>Flow</small><b>' + (scenario === 'http' ? 'TCP / 80 · HTTP' : 'UDP / 53 · DNS') + '</b></div><div><small>Outcome</small><b>' + esc(direction === 'reply' ? trace.replyResult : trace.requestResult) + '</b></div></div>' +
    '<div class="journey-layout"><section><h3>' + (direction === 'reply' ? 'Return path' : 'Forward path') + '</h3>' + pathButtons + '</section><div>' + details + '<div class="journey-controls"><button type="button" class="btn" data-journey-prev ' + (current === 0 ? 'disabled' : '') + '>Previous hop</button><span>Step ' + (path.length ? current + 1 : 0) + ' / ' + path.length + '</span><button type="button" class="btn primary" data-journey-next ' + (current >= path.length - 1 ? 'disabled' : '') + '>Next hop</button></div></div></div>' +
    '<p class="protocol-note">Hop order, interface details and outcomes come from <code>packetJourney()</code> and the same forwarding engine used by the simulator. Devices not present in the engine trace are never invented.</p></div>';
  root.querySelectorAll('[data-journey-scenario]').forEach(button => button.addEventListener('click', () => renderPacketJourneyExplorer(button.dataset.journeyScenario, 'request', 0)));
  root.querySelectorAll('[data-journey-direction]').forEach(button => button.addEventListener('click', () => renderPacketJourneyExplorer(scenario, button.dataset.journeyDirection, 0)));
  root.querySelectorAll('[data-journey-step]').forEach(button => button.addEventListener('click', () => renderPacketJourneyExplorer(scenario, direction, Number(button.dataset.journeyStep))));
  const prev = root.querySelector('[data-journey-prev]'), next = root.querySelector('[data-journey-next]');
  if (prev) prev.addEventListener('click', () => renderPacketJourneyExplorer(scenario, direction, current - 1));
  if (next) next.addEventListener('click', () => renderPacketJourneyExplorer(scenario, direction, current + 1));
}

/* ---------- protocol visual labs ---------- */
// Each lab starts from an existing, authored mission topology and runs the
// same pure/headless model functions used by missions and CLI checks.
function protocolLabPathRows(path, direction) {
  if (!Array.isArray(path) || !path.length) return '<p class="protocol-muted">No hop evidence was produced for this direction.</p>';
  return '<ol class="protocol-path" aria-label="' + direction + ' packet path">' + path.map((hop, index) =>
    '<li><span class="protocol-hop-index">' + (index + 1) + '</span><div><strong>' + esc(hop.deviceName || hop.deviceId) + '</strong><small>' +
    esc([hop.kind, hop.address].filter(Boolean).join(' · ')) + '</small><p>' +
    esc([hop.ingressInterface ? 'in ' + hop.ingressInterface : '', hop.egressInterface ? 'out ' + hop.egressInterface : '', hop.detail].filter(Boolean).join(' · ')) +
    '</p></div><span class="protocol-hop-state">' + esc(hop.state || 'observed') + '</span></li>').join('') + '</ol>';
}
function renderLayer2ProtocolLab(kind) {
  const root = $('#protocolLabResult'); if (!root) return;
  let title='', intro='', facts='', rows=[], note='', completed=false;
  if (kind === 'arp') {
    const net=chapters.find(c=>c.id==='access-vlan-repair').build();
    const blocked=M.arpResolve(net,'h1','eth0','10.20.0.20');
    net.devices.sw1.ifaces.p1.accessVlan=20; net.devices.sw1.ifaces.p2.accessVlan=20;
    const resolved=M.arpResolve(net,'h1','eth0','10.20.0.20');
    title='ARP · resolve a neighbor on the local LAN';
    intro='A host broadcasts an address-resolution request inside its Layer 2 domain. Routers do not forward that broadcast into another VLAN.';
    facts='<div class="protocol-facts"><div><small>Requester</small><b>h1 · 10.20.0.10</b></div><div><small>Target</small><b>srv · 10.20.0.20</b></div><div><small>Broadcast</small><b>ff:ff:ff:ff:ff:ff</b></div><div><small>Resolved MAC</small><b>'+esc(resolved.targetMac||'Not resolved')+'</b></div></div>';
    rows=[['Before repair','VLAN 10 → VLAN 20','ARP broadcast stays inside the original VLAN; no reply is found'],['After repair','Both access ports · VLAN 20','The target is now in the same broadcast domain'],['ARP reply',resolved.targetMac||'Unavailable','Resolved from the target interface MAC in the canonical topology']];
    note='The ARP helper reports deterministic local-neighbor resolution from the topology and VLAN membership. It does not model ARP timers, cache expiry, gratuitous ARP or packet retransmission.';
    completed=!blocked.ok&&resolved.ok;
  } else if (kind === 'vlan') {
    const net=chapters.find(c=>c.id==='trunk-allowed-vlan').build(), a=net.devices.sw1.ifaces.p2, b=net.devices.sw2.ifaces.p1;
    const before=M.switchPortAllowsVlan(a,10)&&M.switchPortAllowsVlan(b,10);
    a.allowedVlans=[10,20]; b.allowedVlans=[10,20];
    const after=M.switchPortAllowsVlan(a,10)&&M.switchPortAllowsVlan(b,10);
    const tree=M.spanningTree(net,10);
    title='802.1Q · carry VLANs across a trunk';
    intro='Access ports classify untagged endpoint traffic. A trunk carries allowed VLANs between switches and tags non-native VLAN frames.';
    facts='<div class="protocol-facts"><div><small>VLAN</small><b>10 · Finance</b></div><div><small>Native VLAN</small><b>'+M.switchNativeVlan(a)+'</b></div><div><small>Wire tag</small><b>802.1Q · VLAN 10</b></div><div><small>Trunk state</small><b>'+(after?'Allowed on both ends':'Blocked')+'</b></div></div>';
    rows=[['Before','VLAN 20 only','VLAN 10 is excluded from both trunk allow-lists'],['After','Allowed VLANs 10,20','Both switch ports accept VLAN 10'],['Frame on wire','802.1Q tag · VID 10','Native VLAN 1 remains untagged in this model'],['Topology','sw1 ↔ sw2','VLAN 10 is carried across the inter-switch link']];
    note='Allowed-list and native-VLAN details come from switchPortAllowsVlan() and switchNativeVlan(). The model represents tag classification and forwarding eligibility, not serialized Ethernet frame bytes.';
    completed=!before&&after&&!!tree.switches.sw1;
  } else {
    const net=chapters.find(c=>c.id==='break-the-switching-loop').build();
    net.devices.sw3.stpPriorities={10:4096};
    const tree=M.spanningTree(net,10);
    M.learnMacOnSegment(net,'h1','eth0'); M.learnMacOnSegment(net,'srv','eth0');
    const root=tree.switches.sw1.root, blocked=tree.switches.sw2.ports.p1;
    const entries=M.switchMacTable(net,'sw1',10);
    title='STP · elect a root and block the redundant path';
    intro='Spanning Tree builds a loop-free forwarding tree while retaining the redundant physical link in a blocking role.';
    facts='<div class="protocol-facts"><div><small>VLAN</small><b>10</b></div><div><small>Root bridge</small><b>'+esc(root||'Not elected')+'</b></div><div><small>sw2 / p1</small><b>'+esc(blocked&&blocked.role+' · '+blocked.state)+'</b></div><div><small>Learned MACs</small><b>'+entries.length+' on sw1</b></div></div>';
    rows=[['Root bridge','sw3 · priority 4096','Lowest bridge priority wins this deterministic election'],['sw2 / p1',blocked&&blocked.role+' · '+blocked.state,'Redundant path is retained but not forwarding'],['sw1 MAC table',entries.length+' dynamic entries','Learning follows the active spanning-tree paths'],['Endpoint evidence',entries.some(e=>e.device==='h1')?'h1 learned':'h1 missing',entries.some(e=>e.device==='srv')?'srv learned':'srv missing']];
    note='STP roles and MAC entries come from spanningTree(), learnMacOnSegment() and switchMacTable(). This is a deterministic tree model, not a timed BPDU exchange or full 802.1D/RSTP state machine.';
    completed=root==='sw3'&&blocked&&blocked.state==='blocking'&&entries.some(e=>e.device==='h1')&&entries.some(e=>e.device==='srv');
  }
  const list='<div class="protocol-evidence"><h3>Observed configuration and state</h3><ul>'+rows.map(r=>'<li><b>'+esc(r[0])+'</b><span>'+esc(String(r[1]??''))+'</span><small>'+esc(String(r[2]??''))+'</small></li>').join('')+'</ul></div>';
  root.innerHTML='<div class="protocol-result-head"><div><div class="eyebrow">CANONICAL LAYER 2 MODEL EVIDENCE</div><h2>'+esc(title)+'</h2><p>'+esc(intro)+'</p></div><span class="protocol-status '+(completed?'is-ok':'is-note')+'">'+(completed?'Model completed':'Review evidence')+'</span></div>'+facts+list+'<p class="protocol-note">'+esc(note)+'</p>';
}

function renderAdvancedProtocolLab(kind) {
  const root = $('#protocolLabResult'); if (!root) return;
  let title = '', intro = '', facts = '', note = '', rows = [], completed = false;
  if (kind === 'ospf') {
    const net = chapters.find(c => c.id === 'ospf-neighbor').build();
    net.devices.r1.ifaces.eth1.ospf = '0'; net.devices.r2.ifaces.eth0.ospf = '0'; net.devices.r2.ifaces.eth1.ospf = '0';
    const neighbors = M.ospfNeighbors(net, 'r1'), routes = M.ospfLearned(net, 'r1');
    const route = routes.find(r => r.dest === M.ip('10.0.8.0') && r.mask === 24), reach = M.ping(net, 'hq', M.ip('10.0.8.10'));
    title = 'OSPF · neighbor and route learning'; intro = 'Enable matching area 0 on the transit link, then advertise the branch LAN through the same OSPF process.';
    facts = '<div class="protocol-facts"><div><small>Router</small><b>r1 · 10.0.12.1</b></div><div><small>Adjacency</small><b>' + (neighbors.some(n => n.id === 'r2') ? 'FULL · r2' : 'No neighbor') + '</b></div><div><small>Learned prefix</small><b>' + (route ? '10.0.8.0/24 · OSPF' : 'Not learned') + '</b></div><div><small>End-to-end</small><b>' + (reach.ok ? 'HQ → branch reachable' : 'Not reachable') + '</b></div></div>';
    rows = [['r1 eth1','Area 0 enabled','Transit adjacency'],['r2 eth0','Area 0 enabled','Matching area forms the neighbor relationship'],['r2 eth1','Area 0 enabled','Branch LAN is included in advertisements']];
    note = 'Observed from ospfNeighbors(), ospfLearned() and ping(). This teaching model uses a bounded single-area view; it does not simulate every OSPF packet or election.';
    completed = !!(route && reach.ok && neighbors.some(n => n.id === 'r2'));
  } else if (kind === 'bgp') {
    const net = chapters.find(c => c.id === 'bgp-neighbor').build();
    net.devices.r1.bgp = {asn:65001,neighbors:[{ip:M.ip('10.0.12.2'),remoteAs:65002}],networks:['10.0.1.0/24']};
    net.devices.r2.bgp = {asn:65002,neighbors:[{ip:M.ip('10.0.12.1'),remoteAs:65001}],networks:['10.0.8.0/24']};
    const session = M.bgpSessions(net,'r1').find(s => s.peer === 'r2'), routes = M.bgpLearned(net,'r1');
    const route = routes.find(r => r.dest === M.ip('10.0.8.0') && r.mask === 24), reach = M.ping(net,'hq',M.ip('10.0.8.10'));
    title = 'BGP · establish a peer and learn a prefix'; intro = 'A reachable neighbor is not enough: both autonomous systems need matching peer statements, and the remote router must advertise a valid network.';
    facts = '<div class="protocol-facts"><div><small>Local AS</small><b>r1 · 65001</b></div><div><small>Remote AS</small><b>r2 · 65002</b></div><div><small>Session</small><b>' + (session && session.up ? 'Established' : (session ? session.reason : 'Missing')) + '</b></div><div><small>Learned prefix</small><b>' + (route ? '10.0.8.0/24 · BGP' : 'Not learned') + '</b></div></div>';
    rows = [['r1','AS 65001 · neighbor 10.0.12.2 remote-as 65002','Local peer configuration'],['r2','AS 65002 · neighbor 10.0.12.1 remote-as 65001','Mutual neighbor configuration'],['r2','network 10.0.8.0/24','Advertises the branch LAN']];
    note = 'Observed from bgpSessions() and bgpLearned(). This deterministic model covers bounded eBGP peering and prefix learning, not the full BGP finite-state machine or path-selection policy.';
    completed = !!(session && session.up && route && reach.ok);
  } else {
    const net = chapters.find(c => c.id === 'wan-gateway-failover').build(), r1 = net.devices.r1, r2 = net.devices.r2;
    r1.ifaces.lan.hsrp = {group:10,virtualIp:M.ip('10.20.0.1'),priority:110,track:[{iface:'wan',decrement:30}]};
    r2.ifaces.lan.hsrp = {group:10,virtualIp:M.ip('10.20.0.1'),priority:100};
    r1.ifaces.wan.hsrp = {group:20,virtualIp:M.ip('203.0.113.254'),priority:110};
    r2.ifaces.wan.hsrp = {group:20,virtualIp:M.ip('203.0.113.254'),priority:100};
    const before=M.hsrpStatus(net,'r1','lan'), standby=M.hsrpStatus(net,'r2','lan');
    r1.ifaces.wan.up=false;
    const after=M.hsrpStatus(net,'r2','lan'), wanAfter=M.hsrpStatus(net,'r2','wan');
    title = 'HSRP · first-hop redundancy and failover'; intro = 'Two routers share a virtual gateway. The preferred router tracks its WAN interface; when that uplink fails, the standby takes over.';
    facts = '<div class="protocol-facts"><div><small>Virtual gateway</small><b>10.20.0.1</b></div><div><small>Before failure</small><b>' + (before&&before.state) + ' · r1 / ' + (standby&&standby.state) + ' · r2</b></div><div><small>Tracked fault</small><b>r1 WAN · down</b></div><div><small>After failure</small><b>' + (after&&after.state) + ' · r2 active</b></div></div>';
    rows = [['LAN group 10','10.20.0.1','Shared virtual gateway'],['Before fault','r1 Active · r2 Standby','Higher priority on r1'],['After r1 WAN failure','r2 Active','Tracked priority decrement allows takeover'],['WAN group 20','r2 · '+(wanAfter&&wanAfter.state),'Standby router remains eligible on the WAN segment']];
    note = 'Observed from hsrpStatus() before and after changing the simulated r1 WAN interface state. This models deterministic election and interface tracking, not HSRP hello timers or packet-level convergence.';
    completed = !!(before&&before.state==='Active'&&standby&&standby.state==='Standby'&&after&&after.state==='Active');
  }
  const table='<div class="protocol-evidence"><h3>Configuration and observed state</h3><ul>'+rows.map(row=>'<li><b>'+esc(row[0])+'</b><span>'+esc(row[1])+'</span><small>'+esc(row[2])+'</small></li>').join('')+'</ul></div>';
  root.innerHTML='<div class="protocol-result-head"><div><div class="eyebrow">CANONICAL MODEL EVIDENCE</div><h2>'+esc(title)+'</h2><p>'+esc(intro)+'</p></div><span class="protocol-status '+(completed?'is-ok':'is-note')+'">'+(completed?'Model completed':'Review evidence')+'</span></div>'+facts+table+'<p class="protocol-note">'+esc(note)+'</p>';
}

function renderProtocolLabResult(kind) {
  if (kind === 'arp' || kind === 'vlan' || kind === 'stp') return renderLayer2ProtocolLab(kind);
  if (kind === 'ospf' || kind === 'bgp' || kind === 'hsrp') return renderAdvancedProtocolLab(kind);
  const root = $('#protocolLabResult'); if (!root) return;
  let title = '', intro = '', facts = '', journey = null, note = '';
  if (kind === 'dns') {
    const mission = chapters.find(c => c.id === 'name-wont-resolve');
    const net = mission.build();
    const resolver = net.devices.dns1.ifaces.eth0.ip;
    // This is a successful teaching run: configure the resolver on an isolated
    // copy, then ask the real DNS resolver and packet-journey engine for evidence.
    net.devices.h1.resolver = resolver;
    const answer = M.resolveName(net, 'h1', 'intranet.corp.local');
    journey = M.packetJourney(net, 'h1', resolver, { proto: 'udp', dport: 53 });
    title = 'DNS · name resolution';
    intro = 'A client asks its configured resolver for the A record of intranet.corp.local.';
    facts = '<div class="protocol-facts"><div><small>Client</small><b>h1 · 10.0.1.10</b></div><div><small>Resolver</small><b>dns1 · ' + esc(M.ipStr(resolver)) + '</b></div><div><small>Query</small><b>A intranet.corp.local</b></div><div><small>Answer</small><b>' + (answer.ok ? esc(M.ipStr(answer.ip)) : esc(answer.reason)) + '</b></div></div>';
    note = answer.ok && journey.ok ? 'The model resolved the configured DNS record and delivered the UDP/53 request and reply across the simulated routed path.' : 'The model did not complete the lookup: ' + (answer.reason || journey.reason);
  } else if (kind === 'dhcp') {
    const mission = chapters.find(c => c.id === 'renew-the-lease');
    const net = mission.build();
    const lease = M.dhclient(net, 'h1', 'eth0');
    title = 'DHCP · obtain a lease';
    intro = 'A workstation with a stale address requests network configuration from the router DHCP pool.';
    const pool = net.devices.r1.dhcp;
    facts = '<div class="protocol-facts"><div><small>Client</small><b>h1 / eth0</b></div><div><small>DHCP server</small><b>r1 · ' + esc(M.ipStr(net.devices.r1.ifaces.eth0.ip)) + '</b></div><div><small>Lease address</small><b>' + (lease.ok ? esc(M.ipStr(lease.ip)) + '/' + lease.prefix : esc(lease.reason)) + '</b></div><div><small>Gateway / DNS</small><b>' + (lease.ok ? esc(M.ipStr(lease.gw)) + ' / ' + esc(M.ipStr(lease.dns)) : 'Not assigned') + '</b></div></div>';
    facts += '<ol class="protocol-dora"><li><b>Discover</b><span>Client broadcasts to find a DHCP server.</span></li><li><b>Offer</b><span>r1 has an available address in its configured pool.</span></li><li><b>Request</b><span>Client requests the offered configuration.</span></li><li><b>Acknowledge</b><span>' + (lease.ok ? 'The simulator applies the lease and installs gateway and resolver settings.' : 'The lease was not applied.') + '</span></li></ol>';
    note = lease.ok ? 'Lease allocation is observed from the DHCP model. The four DORA labels explain the protocol sequence; individual broadcast frames are not separately captured by this simulator.' : lease.reason;
  } else {
    const mission = chapters.find(c => c.id === 'name-wont-resolve');
    const net = mission.build();
    journey = M.packetJourney(net, 'h1', '10.0.2.10', { proto: 'tcp', dport: 80 });
    title = 'TCP · reach an HTTP service';
    intro = 'Follow a TCP connection attempt from h1 to the web service at www.';
    facts = '<div class="protocol-facts"><div><small>Client</small><b>h1 · 10.0.1.10</b></div><div><small>Server</small><b>www · 10.0.2.10</b></div><div><small>Transport</small><b>TCP / destination port 80</b></div><div><small>Service</small><b>HTTP listener in the mission topology</b></div></div>';
    note = journey.ok ? 'The forwarding engine confirms the TCP/80 path and return path. This lab visualizes reachability and service-port filtering, not individual TCP handshake flags.' : journey.reason;
  }
  const delivered = kind === 'dhcp' ? note.indexOf('Lease allocation is observed') === 0 : !!(journey && journey.ok);
  root.innerHTML = '<div class="protocol-result-head"><div><div class="eyebrow">SIMULATOR EVIDENCE</div><h2>' + esc(title) + '</h2><p>' + esc(intro) + '</p></div><span class="protocol-status ' + (delivered ? 'is-ok' : 'is-note') + '">' + (delivered ? 'Model completed' : 'Review evidence') + '</span></div>' +
    facts + '<p class="protocol-note">' + esc(note) + '</p>' +
    (journey ? '<div class="protocol-journey-grid"><section><h3>Request path · ' + esc(journey.protocol.toUpperCase() + (journey.destinationPort ? '/' + journey.destinationPort : '')) + '</h3>' + protocolLabPathRows(journey.request, 'Request') + '</section><section><h3>Reply path</h3>' + protocolLabPathRows(journey.reply, 'Reply') + '</section></div>' : '');
}
function renderProtocolLab() {
  const root = $('#protocolsView'); if (!root) return;
  root.innerHTML = '<div class="protocol-page"><style>' +
    '.protocol-page{padding:26px;max-width:1240px;margin:0 auto}.protocol-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px}.protocol-heading h1{font-size:30px;margin:3px 0 6px}.protocol-heading p{color:var(--muted);max-width:720px;margin:0}.protocol-sim-label{border:1px solid var(--line);border-radius:20px;padding:6px 10px;color:var(--muted);font-size:11px;letter-spacing:.08em}.protocol-lab-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.protocol-lab-tabs button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:10px 14px;font:inherit;cursor:pointer}.protocol-lab-tabs button[aria-pressed=true]{border-color:var(--amber);background:color-mix(in srgb,var(--amber) 13%,var(--panel));color:var(--amber)}.protocol-result{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}.protocol-result-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.protocol-result h2{margin:2px 0 5px;font-size:22px}.protocol-result h3{font-size:14px;margin:0 0 10px}.protocol-result p{color:var(--muted)}.protocol-status{border-radius:20px;padding:5px 9px;font-size:11px;border:1px solid var(--line)}.protocol-status.is-ok{color:var(--good);border-color:var(--good)}.protocol-status.is-note{color:var(--amber);border-color:var(--amber)}.protocol-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:18px 0}.protocol-facts>div{background:var(--raise);border:1px solid var(--line);border-radius:8px;padding:11px;min-width:0}.protocol-facts small,.protocol-facts b{display:block}.protocol-facts small{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.protocol-facts b{font-size:12px;margin-top:5px;overflow-wrap:anywhere}.protocol-note{border-left:3px solid var(--amber);padding:8px 12px;background:var(--raise);font-size:12px}.protocol-journey-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.protocol-path{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:7px}.protocol-path li{display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:9px;align-items:start;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--raise)}.protocol-hop-index{width:23px;height:23px;display:grid;place-items:center;border-radius:50%;background:var(--panel);color:var(--amber);font:12px var(--f-mono)}.protocol-path strong,.protocol-path small{display:block}.protocol-path small,.protocol-path p,.protocol-hop-state,.protocol-muted{color:var(--muted);font-size:11px}.protocol-path p{margin:4px 0 0;overflow-wrap:anywhere}.protocol-hop-state{white-space:nowrap}.protocol-dora{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;list-style:none;padding:0;margin:18px 0}.protocol-dora li{background:var(--raise);border:1px solid var(--line);border-radius:8px;padding:10px}.protocol-dora b,.protocol-dora span{display:block}.protocol-dora b{color:var(--amber);font-size:12px}.protocol-dora span{color:var(--muted);font-size:11px;margin-top:5px}@media(max-width:760px){.protocol-page{padding:16px}.protocol-facts{grid-template-columns:1fr 1fr}.protocol-journey-grid{grid-template-columns:1fr}.protocol-dora{grid-template-columns:1fr 1fr}}@media(max-width:420px){.protocol-facts,.protocol-dora{grid-template-columns:1fr}}' +
    '</style><div class="protocol-heading"><div><div class="eyebrow">Understand · observe · compare</div><h1>Network protocol labs</h1><p>Explore how network services exchange information. Each lab starts from a known teaching topology and calls the same network model used by missions and the Workbench.</p></div><span class="protocol-sim-label">SIMULATED NETWORK · NO LIVE TRAFFIC</span></div>' +
    '<div class="protocol-lab-tabs" role="group" aria-label="Choose a protocol lab"><button type="button" data-protocol-lab="dns" aria-pressed="true">DNS · Name lookup</button><button type="button" data-protocol-lab="dhcp" aria-pressed="false">DHCP · Address lease</button><button type="button" data-protocol-lab="http" aria-pressed="false">TCP · HTTP path</button><button type="button" data-protocol-lab="journey" aria-pressed="false">Packet journey · step through</button><button type="button" data-protocol-lab="ospf" aria-pressed="false">OSPF · routing</button><button type="button" data-protocol-lab="bgp" aria-pressed="false">BGP · peering</button><button type="button" data-protocol-lab="hsrp" aria-pressed="false">HSRP · failover</button><button type="button" data-protocol-lab="arp" aria-pressed="false">ARP · resolution</button><button type="button" data-protocol-lab="vlan" aria-pressed="false">802.1Q · VLANs</button><button type="button" data-protocol-lab="stp" aria-pressed="false">STP · loop prevention</button></div>' +
    '<section id="protocolLabResult" class="protocol-result" aria-live="polite" aria-label="Protocol lab evidence"></section></div>';
  root.querySelectorAll('[data-protocol-lab]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-protocol-lab]').forEach(item => item.setAttribute('aria-pressed', item === button ? 'true' : 'false'));
    if (button.dataset.protocolLab === 'journey') renderPacketJourneyExplorer(); else renderProtocolLabResult(button.dataset.protocolLab);
  }));
  renderProtocolLabResult('dns');
}

let KNOWLEDGE_COACH_MODE = 'guided';
let KNOWLEDGE_COACH_COMMAND = null;
function networkLearningRecommendation() {
  const completed = chapters.filter(chapter => !!PROG.done[chapter.id]).length;
  const total = chapters.length;
  const journal = Array.isArray(PROG.journal) ? PROG.journal : [];
  const commands = journal.filter(entry => entry && entry.type === 'command');
  const recent = commands.slice(0, 20);
  const errors = recent.filter(entry => entry.result === 'error' || /invalid input|unknown command|incomplete command|ambiguous command|not found/i.test(String(entry.output || '')));
  const signal = errors.map(entry => [entry.command, entry.output].filter(Boolean).join(' ')).join(' ').toLowerCase();
  let focus = { title: 'Command context and verification', command: 'show ip interface brief', reason: 'No repeated command-error pattern stands out yet. Practise checking device state before changing configuration.', source: 'Recommended starting point' };
  if (errors.length && /vlan|spanning|stp|trunk|switch/.test(signal)) focus = { title: 'Switching and VLAN verification', command: 'show vlan brief', reason: 'Recent command errors mention switching, VLANs or spanning-tree. Revisit VLAN membership and Layer 2 state before changing ports.', source: errors.length + ' recent command error' + (errors.length === 1 ? '' : 's') };
  else if (errors.length && /route|ospf|bgp|gateway/.test(signal)) focus = { title: 'Routing and path verification', command: 'show ip route', reason: 'Recent command errors mention routes, gateways or routing protocols. Practise confirming the routing table and next hop before troubleshooting end-to-end reachability.', source: errors.length + ' recent command error' + (errors.length === 1 ? '' : 's') };
  else if (errors.length && /acl|access-list|firewall|blocked|policy/.test(signal)) focus = { title: 'Traffic policy and ACLs', command: 'show access-lists', reason: 'Recent command errors mention filtering or policy. Review rule order, match conditions and the evidence needed to distinguish a policy drop from a path failure.', source: errors.length + ' recent command error' + (errors.length === 1 ? '' : 's') };
  else if (errors.length && /interface|link|port|ethernet/.test(signal)) focus = { title: 'Interface state and link diagnosis', command: 'show ip interface brief', reason: 'Recent command errors mention interfaces, links or ports. Practise checking administrative and operational state before changing interface settings.', source: errors.length + ' recent command error' + (errors.length === 1 ? '' : 's') };
  return { completed, total, journalCount: journal.length, commandCount: commands.length, errorCount: errors.length, focus };
}

/* ---------- network spaced recall ---------- */
const NETWORK_RECALL_KEY = 'nettrainer-recall-v1';
let NETWORK_RECALL_QUEUE = [];
let NETWORK_RECALL_INDEX = 0;
function networkRecallRead() {
  try {
    const value = JSON.parse(localStorage.getItem(NETWORK_RECALL_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) { return {}; }
}
function networkRecallWrite(value) {
  try { localStorage.setItem(NETWORK_RECALL_KEY, JSON.stringify(value)); } catch (e) {}
}
function networkRecallItems() {
  const state = networkRecallRead();
  return NR.items(state, command => LC.getGuide(command), Date.now());
}
function networkRecallDueCount(now = Date.now()) {
  return networkRecallItems().filter(item => item.dueAt <= now).length;
}
function networkRecallAdd(command) {
  const guide = LC.getGuide(command);
  if (!guide) return false;
  const state = NR.add(networkRecallRead(), command, Date.now());
  networkRecallWrite(state);
  return true;
}
function networkRecallReview(command, remembered) {
  const state = NR.review(networkRecallRead(), command, remembered, Date.now());
  if (!state) return false;
  networkRecallWrite(state);
  return true;
}
function networkRecallPanelMarkup() {
  const items = networkRecallItems(), due = items.filter(item => item.dueAt <= Date.now()).length;
  return '<section class="knowledge-playbooks" aria-label="Network spaced recall"><div class="knowledge-section-head"><div><h2>Spaced recall</h2><span>Bring network concepts back to mind over increasing intervals</span></div><span class="help-key" id="networkRecallDue">' + due + ' due · ' + items.length + ' saved</span></div><div class="knowledge-playbook-grid"><article class="knowledge-playbook"><div class="eyebrow">RECALL DECK</div><h3>' + items.length + ' concept' + (items.length === 1 ? '' : 's') + ' saved</h3><p>Save a command-coach challenge to revisit it tomorrow. Rate your recall honestly; concepts you remember return later, while difficult concepts return sooner.</p><button class="btn primary sm" id="networkRecallStart" type="button" ' + (due ? '' : 'disabled') + '>Start review' + (due ? ' · ' + due + ' due' : '') + '</button></article><article class="knowledge-playbook"><div class="eyebrow">HOW IT WORKS</div><h3>Recall before revealing</h3><p>Try to explain the answer from memory before revealing the explanation. This is self-assessed practice, not an automatic command or mission grade.</p></article></div><div id="networkRecallCard" aria-live="polite"></div></section>';
}
function renderNetworkRecallCard() {
  const root = $('#networkRecallCard'); if (!root) return;
  if (!NETWORK_RECALL_QUEUE.length) {
    const next = networkRecallItems()[0];
    root.innerHTML = next
      ? '<article class="knowledge-playbook"><b>No reviews due right now.</b><p>Your next saved concept is scheduled for ' + esc(new Date(next.dueAt).toLocaleString()) + '.</p></article>'
      : '<article class="knowledge-playbook"><b>Your recall deck is empty.</b><p>Open a command coach and choose “Add to recall deck” to save a concept for tomorrow.</p></article>';
    return;
  }
  const command = NETWORK_RECALL_QUEUE[NETWORK_RECALL_INDEX], item = networkRecallItems().find(x => x.command === command);
  if (!item) { NETWORK_RECALL_QUEUE = []; renderNetworkRecallCard(); return; }
  root.innerHTML = '<article class="knowledge-playbook"><div class="knowledge-section-head"><div><div class="eyebrow">RECALL CARD ' + (NETWORK_RECALL_INDEX + 1) + ' OF ' + NETWORK_RECALL_QUEUE.length + '</div><h3>' + esc(command) + '</h3></div><span class="help-key">' + ([1,3,7,14,30][Math.min(4, Math.max(0, Number(item.record.stage) || 0))]) + '-day interval</span></div><p class="diag-q">' + esc(item.guide.challenge) + '</p><div class="row"><button class="btn sm" id="networkRecallReveal" type="button">Reveal explanation</button></div><div id="networkRecallAnswer" class="coach-detail" hidden><b>Explanation</b><p>' + esc(item.guide.answer) + '</p><p class="dim">Rate how well you recalled the explanation without looking it up.</p><div class="row"><button class="btn primary sm" id="networkRecallRemembered" type="button">I recalled it</button><button class="btn sm" id="networkRecallAgain" type="button">I need more practice</button></div></div></article>';
}
function startNetworkRecall() {
  NETWORK_RECALL_QUEUE = networkRecallItems().filter(item => item.dueAt <= Date.now()).map(item => item.command);
  NETWORK_RECALL_INDEX = 0;
  renderNetworkRecallCard();
}

function renderNetworkLearningPlan() {
  const plan = networkLearningRecommendation();
  return `<section class="knowledge-playbooks" aria-label="Personal learning plan">
    <div class="knowledge-section-head"><div><h2>Your learning plan</h2><span>Evidence-led guidance from your saved missions and Workbench journal</span></div><span class="help-key">${plan.completed}/${plan.total} MISSIONS</span></div>
    <div class="knowledge-playbook-grid">
      <article class="knowledge-playbook"><div class="eyebrow">YOUR PROGRESS</div><h3>${plan.completed} of ${plan.total} missions complete</h3><p>${plan.total ? Math.round(plan.completed / plan.total * 100) : 0}% of the current network mission path completed.</p><p class="dim">${plan.journalCount} journal entries · ${plan.commandCount} recorded commands</p></article>
      <article class="knowledge-playbook"><div class="eyebrow">RECOMMENDED FOCUS</div><h3>${esc(plan.focus.title)}</h3><p>${esc(plan.focus.reason)}</p><p class="dim">Based on: ${esc(plan.focus.source)}</p><div class="row"><button class="btn primary sm" id="coachPracticeFocus" type="button">Practise ${esc(plan.focus.command)}</button></div></article>
      <article class="knowledge-playbook"><div class="eyebrow">INVESTIGATION HABIT</div><h3>Inspect → change → verify</h3><p>Capture the initial state, make one controlled change, then repeat the same check and record the result. A successful command is evidence of its own output, not proof of end-to-end recovery.</p><p class="dim">${plan.errorCount} recent command errors considered · no simulator state changed</p></article>
    </div>
  </section>`;
}
function renderKnowledgeCenter() {
  const root = $('#knowledgeView'); if (!root) return;
  root.innerHTML = `
    <div class="knowledge-page-heading"><div><div class="eyebrow">Field reference · network operations</div><h1>Network knowledge</h1><p>Practical command references and repeatable troubleshooting workflows. Select a command to send it to the active Workbench console, or open the coach to understand when and why to use it.</p></div><span class="help-key">L1 / L2 FIELD GUIDE</span></div>
    ${renderNetworkLearningPlan()}
    ${networkRecallPanelMarkup()}
    <section class="knowledge-playbooks"><div class="knowledge-section-head"><h2>Troubleshooting playbooks</h2><span>Work methodically · capture evidence</span></div><div class="knowledge-playbook-grid">${KNOWLEDGE_PLAYBOOKS.map((p,i)=>`<article class="knowledge-playbook"><div class="eyebrow">PLAYBOOK 0${i+1}</div><h3>${esc(p.title)}</h3><ol>${p.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></article>`).join('')}</div></section>
    <section class="knowledge-library"><div class="knowledge-section-head"><div><h2>Command reference</h2><p>Search by command, task or description. Availability depends on the selected simulator device and CLI mode.</p></div></div><div class="knowledge-toolbar"><input id="knowledgeSearch" type="search" placeholder="Search commands and tasks…" aria-label="Search commands"><select id="knowledgeCategory" aria-label="Filter command category"><option value="all">All categories</option>${[...new Set(KNOWLEDGE_COMMANDS.map(x=>x.cat))].map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="knowledgeCommands" class="knowledge-command-list">${renderKnowledgeCommands(KNOWLEDGE_COMMANDS)}</div>
      <section class="network-command-coach" id="networkCommandCoach" aria-live="polite" aria-label="Network command coach"><div class="coach-empty">Choose <b>Coach</b> beside a command to get a guided explanation and a safe practice prompt.</div></section>
    </section>
    <p class="knowledge-caveat">Simulator reference only: this is not a complete Cisco IOS / IOS XE command catalogue. Commands vary by device and CLI context; unsupported commands should be treated as unavailable, not assumed to work on production equipment.</p>`;
  const search=root.querySelector('#knowledgeSearch'), category=root.querySelector('#knowledgeCategory'), list=root.querySelector('#knowledgeCommands');
  root.addEventListener('click', event => {
    if (event.target.closest('#networkRecallStart')) startNetworkRecall();
    else if (event.target.closest('#networkRecallReveal')) { const answer = root.querySelector('#networkRecallAnswer'); if (answer) { answer.hidden = false; event.target.closest('#networkRecallReveal').disabled = true; } }
    else if (event.target.closest('#networkRecallRemembered') || event.target.closest('#networkRecallAgain')) {
      const remembered = !!event.target.closest('#networkRecallRemembered'), command = NETWORK_RECALL_QUEUE[NETWORK_RECALL_INDEX];
      if (command) networkRecallReview(command, remembered);
      NETWORK_RECALL_INDEX++;
      if (NETWORK_RECALL_INDEX >= NETWORK_RECALL_QUEUE.length) NETWORK_RECALL_QUEUE = [];
      const due = root.querySelector('#networkRecallDue'), start = root.querySelector('#networkRecallStart');
      if (due) due.textContent = networkRecallDueCount() + ' due · ' + networkRecallItems().length + ' saved';
      if (start) { const count = networkRecallDueCount(); start.disabled = !count; start.textContent = 'Start review' + (count ? ' · ' + count + ' due' : ''); }
      renderNetworkRecallCard();
    }
  });
  const filter=()=>{const q=search.value.trim().toLowerCase(), cat=category.value; const matches=KNOWLEDGE_COMMANDS.filter(x=>(cat==='all'||x.cat===cat)&&(!q||[x.cmd,x.cat,x.desc].join(' ').toLowerCase().includes(q))); list.innerHTML=renderKnowledgeCommands(matches); wireKnowledgeCommands(root);};
  search.addEventListener('input',filter); category.addEventListener('change',filter); wireKnowledgeCommands(root);
  const practice = root.querySelector('#coachPracticeFocus');
  if (practice) practice.addEventListener('click', () => { const command = networkLearningRecommendation().focus.command; showWorkspaceView('workbench'); const input = $('#tin'); if (input) { input.value = command; openTerminalWindow(true); } });
}
function renderKnowledgeCommands(items) {
  return items.map(x=>`<article class="knowledge-command-row"><button class="knowledge-command" type="button" data-knowledge-cmd="${esc(x.cmd)}"><span><code>${esc(x.cmd)}</code><small>${esc(x.cat)}</small></span><span>${esc(x.desc)}</span></button><button class="btn sm knowledge-coach-btn" type="button" data-knowledge-coach="${esc(x.cmd)}">Coach</button></article>`).join('') || '<p class="dim">No matching commands. Try a broader search.</p>';
}
function renderNetworkCommandCoach(command) {
  const root = $('#networkCommandCoach'), item = KNOWLEDGE_COMMANDS.find(x => x.cmd === command);
  const guide = LC.getGuide(command);
  if (!root || !item || !guide) return;
  KNOWLEDGE_COACH_COMMAND = command;
  const mode = KNOWLEDGE_COACH_MODE, challenge = mode === 'challenge';
  const guidance = mode === 'guided'
    ? '<ol><li>Start with the incident question: ' + esc(guide.purpose) + '</li><li>Run it on: ' + esc(guide.runOn) + '</li><li>Compare the evidence with the expected design before changing anything.</li></ol>'
    : mode === 'assisted'
      ? '<p><b>Where to run it:</b> ' + esc(guide.runOn) + '</p><p><b>What to look for:</b> ' + esc(guide.lookFor) + '</p>'
      : '<div class="coach-challenge"><b>Challenge</b><p>' + esc(guide.challenge) + '</p><button class="btn sm" id="networkCoachReveal" type="button">Reveal explanation</button><p id="networkCoachAnswer" hidden>' + esc(guide.answer) + '</p></div>';
  root.innerHTML = '<div class="coach-head"><div><div class="eyebrow">NETWORK LEARNING COACH</div><h3>' + esc(item.cmd) + '</h3><p>' + esc(guide.purpose) + '</p></div><label>Learning mode <select id="networkCoachMode" aria-label="Learning mode"><option value="guided" ' + (mode === 'guided' ? 'selected' : '') + '>Guided</option><option value="assisted" ' + (mode === 'assisted' ? 'selected' : '') + '>Assisted</option><option value="challenge" ' + (challenge ? 'selected' : '') + '>Challenge</option></select></label></div>' +
    '<div class="coach-content"><div><b>' + (challenge ? 'Test your understanding' : 'How to approach it') + '</b>' + guidance +
    '<div class="coach-detail"><b>How to interpret the output</b><p>' + esc(guide.interpret) + '</p><p><b>Evidence to look for:</b> ' + esc(guide.lookFor) + '</p></div>' +
    '<div class="coach-detail"><b>Common pitfall</b><p>' + esc(guide.pitfall) + '</p></div><div class="coach-detail"><b>Next step</b><p>' + esc(guide.next) + '</p></div></div></div>' +
    '<div class="row"><button class="btn primary" id="networkCoachPractice" type="button">Practice in Workbench</button><button class="btn" id="networkCoachRecallAdd" type="button">' + (networkRecallRead()[command] ? 'In recall deck' : 'Add to recall deck') + '</button><button class="btn" id="networkCoachClose" type="button">Close coach</button></div>';
  root.querySelector('#networkCoachMode').addEventListener('change', e => { KNOWLEDGE_COACH_MODE = e.target.value; renderNetworkCommandCoach(command); });
  const reveal = root.querySelector('#networkCoachReveal');
  if (reveal) reveal.addEventListener('click', () => { const answer = root.querySelector('#networkCoachAnswer'); answer.hidden = false; reveal.disabled = true; reveal.textContent = 'Explanation revealed'; });
  root.querySelector('#networkCoachPractice').addEventListener('click', () => { showWorkspaceView('workbench'); const input = $('#tin'); if (input) { input.value = item.cmd; openTerminalWindow(true); } });
  root.querySelector('#networkCoachRecallAdd').addEventListener('click', () => { networkRecallAdd(command); renderNetworkCommandCoach(command); const due = $('#networkRecallDue'); if (due) due.textContent = networkRecallDueCount() + ' due · ' + networkRecallItems().length + ' saved'; });
  root.querySelector('#networkCoachClose').addEventListener('click', () => { KNOWLEDGE_COACH_COMMAND = null; root.innerHTML = '<div class="coach-empty">Choose <b>Coach</b> beside a command to get a guided explanation and a safe practice prompt.</div>'; });
}
function wireKnowledgeCommands(root) {
  root.querySelectorAll('[data-knowledge-cmd]').forEach(b=>b.addEventListener('click',()=>{showWorkspaceView('workbench'); const input=$('#tin'); if(input){input.value=b.dataset.knowledgeCmd; openTerminalWindow(true);}}));
  root.querySelectorAll('[data-knowledge-coach]').forEach(b=>b.addEventListener('click',()=>renderNetworkCommandCoach(b.dataset.knowledgeCoach)));
}

function addJournalEntry(entry) {
  PROG.journal = Array.isArray(PROG.journal) ? PROG.journal : [];
  PROG.journal.unshift({ at: new Date().toISOString(), ticket: RUN && RUN.mission ? RUN.mission.ticket && RUN.mission.ticket.id : '', mission: RUN && RUN.mission ? RUN.mission.title : '', ...entry });
  PROG.journal = PROG.journal.slice(0, 250); saveProg(); refreshOverview(); refreshIncidentCenter();
}
function renderJournalPage() {
  const root = $('#journalView'); if (!root) return;
  const all = Array.isArray(PROG.journal) ? PROG.journal : [];
  const query = JOURNAL_FILTERS.query.trim().toLowerCase();
  const now = Date.now(), rangeMs = JOURNAL_FILTERS.range === '24h' ? 86400000 : JOURNAL_FILTERS.range === '7d' ? 604800000 : JOURNAL_FILTERS.range === '30d' ? 2592000000 : Infinity;
  const types = [...new Set(all.map(e => e.type || 'activity'))].sort();
  const matches = all.filter(e => {
    const hay = [e.type,e.ticket,e.mission,e.device,e.command,e.text,e.output,e.result].filter(Boolean).join(' ').toLowerCase();
    const at = Date.parse(e.at || '') || 0;
    return (!query || hay.includes(query)) && (JOURNAL_FILTERS.type === 'all' || (e.type || 'activity') === JOURNAL_FILTERS.type) && (rangeMs === Infinity || now - at <= rangeMs);
  });
  const rows = matches.map(e => `<article class="journal-entry"><div class="journal-meta"><b>${esc(e.type || 'activity')}</b>${e.result ? `<span class="journal-result ${esc(e.result)}">${esc(e.result)}</span>` : ''}<time>${esc(new Date(e.at).toLocaleString())}</time></div><div class="journal-context">${esc([e.ticket,e.mission,e.device].filter(Boolean).join(' · '))}</div>${e.command ? `<code class="journal-command">${esc(e.command)}</code>` : ''}${e.text ? `<p>${esc(e.text)}</p>` : ''}${e.output ? `<pre>${esc(e.output)}</pre>` : ''}</article>`).join('');
  root.innerHTML = `
    <div class="journal-page-heading"><div><div class="eyebrow">Personal engineering record · local to this browser</div><h1>Engineering journal</h1><p>Search and review the commands, evidence, investigation notes and outcomes you have recorded while working incidents.</p></div><button class="btn" id="journalExportPage">Export Markdown</button></div>
    <section class="journal-compose journal-page-compose"><label for="journalNotePage">Add an investigation note</label><textarea id="journalNotePage" class="wide" rows="3" placeholder="What did you observe? What did you rule out? What would you check next time?"></textarea><div class="row"><button class="btn primary" id="saveJournalNotePage">Save note</button></div></section>
    <div class="journal-page-toolbar"><input id="journalSearch" type="search" value="${esc(JOURNAL_FILTERS.query)}" placeholder="Search device, incident, command, note or output…" aria-label="Search journal"><select id="journalType" aria-label="Filter journal activity"><option value="all">All activity types</option>${types.map(t=>`<option value="${esc(t)}" ${JOURNAL_FILTERS.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select><select id="journalRange" aria-label="Filter journal date"><option value="all" ${JOURNAL_FILTERS.range==='all'?'selected':''}>Any time</option><option value="24h" ${JOURNAL_FILTERS.range==='24h'?'selected':''}>Last 24 hours</option><option value="7d" ${JOURNAL_FILTERS.range==='7d'?'selected':''}>Last 7 days</option><option value="30d" ${JOURNAL_FILTERS.range==='30d'?'selected':''}>Last 30 days</option></select><span>${matches.length} of ${all.length} records</span></div>
    <div class="journal-page-list">${rows || '<div class="journal-page-empty">No matching records. Commands and ticket actions will appear here, or add an investigation note above.</div>'}</div>`;
  root.querySelector('#journalSearch').addEventListener('input', e => { JOURNAL_FILTERS.query=e.target.value; renderJournalPage(); const field=root.querySelector('#journalSearch'); field.focus(); field.setSelectionRange(field.value.length,field.value.length); });
  root.querySelector('#journalType').addEventListener('change', e => { JOURNAL_FILTERS.type=e.target.value; renderJournalPage(); });
  root.querySelector('#journalRange').addEventListener('change', e => { JOURNAL_FILTERS.range=e.target.value; renderJournalPage(); });
  root.querySelector('#saveJournalNotePage').addEventListener('click', () => { const note=root.querySelector('#journalNotePage').value.trim(); if (!note) return; addJournalEntry({type:'engineer note',device:SEL||'',text:note}); JOURNAL_FILTERS.query=''; JOURNAL_FILTERS.type='all'; JOURNAL_FILTERS.range='all'; renderJournalPage(); });
  root.querySelector('#journalExportPage').addEventListener('click', exportJournal);
}
function exportJournal() {
  const lines = ['# Network engineering work journal', '', ...(PROG.journal || []).slice().reverse().map(e => `## ${e.type || 'Activity'} — ${new Date(e.at).toLocaleString()}\n${[e.ticket,e.mission,e.device].filter(Boolean).join(' · ')}\n${e.command ? `\n\x60${e.command}\x60\n` : ''}${e.text || ''}${e.output ? `\n\n\x60\x60\x60text\n${e.output}\n\x60\x60\x60` : ''}`)];
  const blob = new Blob([lines.join('\n\n')], {type:'text/markdown;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='network-work-journal.md'; a.click(); URL.revokeObjectURL(url);
}
function openJournal() { showWorkspaceView('journal'); }
function openHelp() { showWorkspaceView('knowledge'); }
function ensureBuildMenuStyles() {
  if (document.getElementById('buildMenuStyles')) return;
  const style = document.createElement('style');
  style.id = 'buildMenuStyles';
  style.textContent = `
    .build-menu { position: relative; display: inline-flex; }
    .build-menu-panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 2000;
      min-width: 220px;
      padding: 6px;
      background: var(--panel, #0f172a);
      border: 1px solid var(--line, #334155);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0,0,0,.4);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .build-menu-panel[hidden] { display: none !important; }
    .build-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      text-align: left;
      padding: 8px 10px;
      border: none;
      background: transparent;
      color: inherit;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .build-menu-item:hover, .build-menu-item:focus { background: rgba(255,255,255,.06); outline: none; }
  `;
  document.head.appendChild(style);
}
function mountTerminalWindow() {
  const term = $('#term');
  if (!term) return;
  const existing = $('#terminalWindow');
  if (existing) {
    // Already mounted; just ensure the terminal element is still inside it
    const content = existing.querySelector('.terminal-window-content');
    if (content && term.parentElement !== content) content.appendChild(term);
    return;
  }
  // Inject styles once
  if (!document.getElementById('terminalWindowStyles')) {
    const style = document.createElement('style');
    style.id = 'terminalWindowStyles';
    style.textContent = `
      #terminalWindow.terminal-window {
        position: fixed;
        z-index: 1000;
        width: 520px;
        height: 340px;
        min-width: 280px;
        min-height: 180px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        background: #0b1220;
        border: 1px solid #334155;
        border-radius: 10px;
        box-shadow: 0 12px 40px rgba(0,0,0,.45);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
        color: #e2e8f0;
      }
      #terminalWindow[hidden] { display: none !important; }
      #terminalWindow .terminal-window-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        background: #1e293b;
        cursor: move;
        user-select: none;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: .04em;
        border-bottom: 1px solid #334155;
      }
      #terminalWindow .terminal-window-titlebar small { opacity: .6; font-weight: 400; margin-left: 8px; }
      #terminalWindow .terminal-window-actions { display: flex; gap: 4px; }
      #terminalWindow .terminal-window-actions .btn { min-width: 28px; padding: 2px 8px; }
      #terminalWindow .terminal-window-content {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
      }
      #terminalWindow #term { flex: 1 !important; min-height: 0 !important; height: auto !important; border: none !important; width: 100%; }
    `;
    document.head.appendChild(style);
  }
  const win = document.createElement('section');
  win.id = 'terminalWindow';
  win.className = 'terminal-window';
  win.setAttribute('role', 'region');
  win.setAttribute('aria-label', 'Device terminal');
  win.innerHTML = '<header class="terminal-window-titlebar"><span><i></i> DEVICE TERMINAL <small>DRAG TO MOVE · RESIZE</small></span><span class="terminal-window-actions"><button type="button" class="btn sm" id="terminalMinimize" aria-label="Minimize device terminal" title="Minimize">—</button><button type="button" class="btn sm" id="terminalClose" aria-label="Close device terminal" title="Close">✕</button></span></header><div class="terminal-window-content"></div>';
  win.querySelector('.terminal-window-content').appendChild(term);
  // Critical layout as inline styles so the window floats even if the stylesheet is late or overridden
  Object.assign(win.style, {
    position: 'fixed',
    zIndex: '1000',
    width: '520px',
    height: '340px',
    minWidth: '280px',
    minHeight: '180px',
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'calc(100vh - 16px)',
    background: '#0b1220',
    border: '1px solid #334155',
    borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(0,0,0,.45)',
    flexDirection: 'column',
    overflow: 'hidden',
    resize: 'both',
    color: '#e2e8f0'
  });
  win.hidden = true;
  document.body.appendChild(win);
  // Position and size from saved or default
  try {
    const saved = JSON.parse(localStorage.getItem('network-terminal-window-v1') || '{}');
    if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      win.style.left = Math.max(0, Math.min(window.innerWidth - 260, saved.left)) + 'px';
      win.style.top = Math.max(0, Math.min(window.innerHeight - 120, saved.top)) + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    } else {
      win.style.right = '22px'; win.style.bottom = '18px';
    }
    if (Number.isFinite(saved.width) && saved.width >= 280) win.style.width = Math.min(saved.width, window.innerWidth - 16) + 'px';
    if (Number.isFinite(saved.height) && saved.height >= 180) win.style.height = Math.min(saved.height, window.innerHeight - 16) + 'px';
    if (saved.open === true) {
      win.hidden = false;
      win.style.display = 'flex';
    }
  } catch (_) {}
  $('#terminalMinimize').addEventListener('click', () => { win.hidden = true; win.style.display = 'none'; saveTerminalWindowState(win, false); });
  $('#terminalClose').addEventListener('click', () => { win.hidden = true; win.style.display = 'none'; saveTerminalWindowState(win, false); });
  const bar = win.querySelector('.terminal-window-titlebar');
  let drag = null;
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.button !== 0) return;
    const rect = win.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  bar.addEventListener('pointermove', e => {
    if (!drag) return;
    const left = Math.max(0, Math.min(window.innerWidth - 220, drag.left + e.clientX - drag.x));
    const top = Math.max(0, Math.min(window.innerHeight - 90, drag.top + e.clientY - drag.y));
    win.style.left = left + 'px'; win.style.top = top + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto';
  });
  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    saveTerminalWindowState(win);
  };
  bar.addEventListener('pointerup', finishDrag);
  bar.addEventListener('pointercancel', finishDrag);
  // Persist size on resize (CSS resize or window resize)
  const ro = new ResizeObserver(() => saveTerminalWindowState(win));
  ro.observe(win);
  window.addEventListener('resize', () => saveTerminalWindowState(win));
}
function saveTerminalWindowState(win, forceOpen) {
  if (!win) return;
  const open = forceOpen !== undefined ? forceOpen : !win.hidden;
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem('network-terminal-window-v1') || '{}'); } catch (_) {}
  const rect = win.getBoundingClientRect();
  try {
    localStorage.setItem('network-terminal-window-v1', JSON.stringify({
      left: open ? rect.left : (prev.left ?? rect.left),
      top: open ? rect.top : (prev.top ?? rect.top),
      width: open ? Math.round(rect.width) : (prev.width ?? Math.round(rect.width)),
      height: open ? Math.round(rect.height) : (prev.height ?? Math.round(rect.height)),
      open: open
    }));
  } catch (_) {}
}
function collapseTerminalWindow() {
  const win = $('#terminalWindow');
  if (win) { win.hidden = true; win.style.display = 'none'; saveTerminalWindowState(win, false); }
}
function openTerminalWindow(focusInput = false) {
  const win = $('#terminalWindow');
  if (!win) { mountTerminalWindow(); return openTerminalWindow(focusInput); }
  // Re-assert floating layout in case something cleared it
  if (win.style.position !== 'fixed') {
    win.style.position = 'fixed';
    win.style.zIndex = '1000';
    if (!win.style.width) win.style.width = '520px';
    if (!win.style.height) win.style.height = '340px';
  }
  win.hidden = false;
  win.style.display = 'flex';
  win.style.zIndex = String((Number(win.style.zIndex) || 1000) + 1);
  saveTerminalWindowState(win, true);
  if (focusInput) setTimeout(() => { const input=$('#tin'); if(input) input.focus(); }, 0);
}
// Top-bar "Build ▾" dropdown: a menu anchored in the fixed header, so its
// controls are always in a stable place and can never float over the page.
function toggleBuildMenu(force) {
  const menu = $('#buildMenu'), btn = $('#btnBuild');
  if (!menu || !btn) return;
  const show = force === undefined ? menu.hidden : !!force;
  menu.hidden = !show;
  btn.setAttribute('aria-expanded', show ? 'true' : 'false');
}
function closeBuildMenu() { toggleBuildMenu(false); }
function openDeviceTerminal() {
  closeBuildMenu();
  // Bring the workbench into view so the docked console is visible, then open it.
  const cols = $('#cols');
  if (!cols || cols.hidden) { if (MODE === 'build') enterBuild(); else showWorkspaceView('workbench'); }
  openTerminalWindow(true);
}
function wireBuildMenu() {
  const btn = $('#btnBuild'); if (!btn) return;
  btn.addEventListener('click', () => toggleBuildMenu());
  const open = $('#buildMenuOpen'); if (open) open.addEventListener('click', () => { closeBuildMenu(); enterBuild(); });
  const term = $('#terminalRestore'); if (term) term.addEventListener('click', openDeviceTerminal);
  document.addEventListener('click', e => { if (!e.target.closest('.build-menu')) closeBuildMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBuildMenu(); });
}
function explainNetworkMistake(command, output) {
  const panel = $('#networkMistakeCoach');
  if (!panel) return;
  const feedback = F.classifyCommandFailure({ discipline: 'network', command, output });
  panel.querySelector('[data-network-mistake-category]').textContent = feedback.title;
  panel.querySelector('[data-network-mistake-reason]').textContent = feedback.reason;
  panel.querySelector('[data-network-mistake-next]').textContent = feedback.next;
  panel.dataset.feedbackCategory = feedback.category;
  panel.hidden = false;
}
function clearNetworkMistake() {
  const panel = $('#networkMistakeCoach');
  if (panel) panel.hidden = true;
}
function wireTerm() {
  const inp = $('#tin');
  const mistakePanel = document.createElement('section');
  mistakePanel.id = 'networkMistakeCoach';
  mistakePanel.className = 'network-mistake-coach';
  mistakePanel.hidden = true;
  mistakePanel.setAttribute('aria-label', 'Command feedback');
  mistakePanel.setAttribute('aria-live', 'polite');
  mistakePanel.innerHTML = '<div class="network-mistake-title"><strong>Learn from this result</strong><span data-network-mistake-category></span></div><p data-network-mistake-reason></p><div class="network-mistake-next"><b>Try next</b><p data-network-mistake-next></p></div><small>Learning loop: Understand → Inspect → Correct → Verify</small>';
  const terminalInputRow = inp.closest('.tline');
  if (terminalInputRow) terminalInputRow.before(mistakePanel);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!SEL || !RUN.net.devices[SEL]) return;
      const cands = completions(RUN.cli.on(SEL), inp.value);
      if (!cands.length) return;
      const partial = (inp.value.match(/(\S*)$/) || [''])[0];
      const base = inp.value.slice(0, inp.value.length - partial.length);
      if (cands.length === 1) { inp.value = base + cands[0] + ' '; return; }
      const lcp = cands.reduce((a, b) => { let i = 0; while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++; return a.slice(0, i); });
      if (lcp.length > partial.length) inp.value = base + lcp;           // extend to common prefix
      else termEcho(cands.join('    '));                                // list the options
      return;
    }
    if ((e.altKey || e.ctrlKey) && e.key === 'ArrowLeft') { e.preventDefault(); cycleDeviceSession(-1); return; }
    if ((e.altKey || e.ctrlKey) && e.key === 'ArrowRight') { e.preventDefault(); cycleDeviceSession(1); return; }
    if (e.key === 'Enter') { const line = inp.value; inp.value = ''; if (!line.trim()) return; HIST.push(line); HISTI = HIST.length; const cli = RUN.cli.on(SEL); const dev = RUN.net.devices[SEL]; const suffix = dev.firewallOS === 'asa' ? (cli.asaMode === 'interface' ? '(config-if)#' : cli.asaMode === 'object' ? '(config-network-object)#' : cli.asaMode === 'config' ? '(config)#' : cli.asaMode === 'privileged' ? '#' : '>') : (cli.iosMode === 'interface' ? '(config-if)#' : cli.iosMode === 'vlan' ? '(config-vlan)#' : cli.iosMode === 'acl' ? '(config-ext-nacl)#' : cli.iosMode === 'config' ? '(config)#' : cli.iosMode === 'privileged' ? '#' : '>'); termEcho(`${dev.hostname || SEL}${suffix} ${line}`); const r = cli.run(line); LAST_COMMAND = { line, accepted: r.code === 0 }; if (r.out) termEcho(r.out); if (r.code !== 0) explainNetworkMistake(line, r.out); else clearNetworkMistake(); addJournalEntry({ type: 'command', device: SEL || '', command: line, result: r.code === 0 ? 'success' : 'error', output: r.out || (r.code === 0 ? 'Command completed without output.' : 'Command failed.') }); refresh(); return; }
    if (e.key === 'ArrowUp' && HIST.length) { HISTI = Math.max(0, HISTI - 1); inp.value = HIST[HISTI] || ''; e.preventDefault(); persistTerminalSession(); }
    if (e.key === 'ArrowDown' && HIST.length) { HISTI = Math.min(HIST.length, HISTI + 1); inp.value = HIST[HISTI] || ''; e.preventDefault(); persistTerminalSession(); }
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
  wireModalDialog(wrap,'#closeS');
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  $('#closeS').addEventListener('click', closeModal);
}

/* ---------- build mode: scenario authoring + design canvas ---------- */
const PALETTE = [['host', 'Host'], ['server', 'Server'], ['switch', 'Switch'], ['router', 'Router'], ['firewall', 'Firewall']];
function renderPalette() {
  if (!canBuild()) return '';
  const add = PALETTE.map(([k, n]) => '<button class="btn sm pal" data-add="' + k + '" title="Add a ' + n.toLowerCase() + ' to the topology canvas"><svg class="palette-device-icon" viewBox="0 -12 48 58" aria-hidden="true">' + NODE_ICONS[k] + '</svg><span>' + n + '</span><span class="palette-add" aria-hidden="true">＋</span></button>').join('');
  const wiring = WIRE ? '<span class="wire-on">click another device to connect <b>' + esc(WIRE) + '</b></span>' : '';
  const layerState = Object.assign({}, TOPO_LAYERS, RUN.net.layerVisibility || {});
  const drawingTools = [['select','Select'],['line','Line'],['arrow','Arrow'],['rect','Rectangle'],['ellipse','Ellipse'],['freehand','Freehand']];
  return '<div class="builder"><div class="builder-heading"><div><span class="builder-kicker">DESIGN WORKSPACE</span><h3>Topology builder</h3><p>Place infrastructure, then connect interfaces on the canvas.</p></div><span class="builder-step">01 <i>／</i> DESIGN</span></div>' +
    '<div class="builder-section-head"><span>Device library</span><small>Choose a device to add</small></div><div class="device-palette">' + add + '</div>' +
    '<div class="pal-row builder-history"><button class="btn sm" id="topoUndo" title="Undo the last topology change" ' + (TOPO_UNDO.length?'':'disabled') + '>↶ Undo</button><button class="btn sm" id="topoRedo" title="Redo the last undone topology change" ' + (TOPO_REDO.length?'':'disabled') + '>↷ Redo</button><button class="btn sm" id="topoCopy" title="Copy the selected device or group, including internal links" ' + (TOPO_SELECTED.size||SEL?'':'disabled') + '>Copy</button><button class="btn sm" id="topoPaste" title="Paste a copy of the last copied selection" ' + (TOPO_CLIPBOARD?'':'disabled') + '>Paste</button><span class="dim">' + TOPO_SELECTED.size + ' selected · Ctrl-click to add/remove · drag canvas to capture</span></div>' +
    '<div class="builder-section-head"><span>Canvas actions</span><small>Arrange and annotate</small></div><div class="pal-row">' + wiring + '<button class="btn sm" id="wireBtn" title="Connect the selected device to another device">' + (WIRE ? '✕ Cancel wire' : '↗ Wire devices') + '</button>' + (SEL && RUN.net.devices[SEL] ? '<button class="btn sm" id="delDev" title="Delete the selected device and its links">🗑 ' + esc(SEL) + '</button><button class="btn sm" id="duplicateDev" title="Duplicate the selected device without its links">⧉ Duplicate</button><button class="btn sm" id="labelDev" title="Change the selected device display label">Label</button>' : '') + (LINK_SEL!=null ? '<button class="btn sm" id="delLink" data-link-index="' + LINK_SEL + '">Remove selected link</button>' : '') + '<button class="btn sm" id="noteBtn" title="Add a note to the topology canvas">＋ Note</button><button class="btn sm" id="textBtn" title="Insert independently movable text anywhere on the canvas">＋ Text</button><button class="btn sm" id="zoneBtn" title="Group selected devices inside a named visual zone" ' + (TOPO_SELECTED.size||SEL?'':'disabled') + '>＋ Zone</button><button class="btn sm" id="arrangeBtn" title="Reset to an automatic layout">⤢ Arrange</button></div>' +
    '<div class="pal-row canvas-toggles"><button class="btn sm" id="captureSelectBtn" title="Enable or disable click-and-drag capture selection" aria-pressed="' + TOPO_CAPTURE_SELECT + '">' + (TOPO_CAPTURE_SELECT?'▣ Capture select on':'▣ Capture select off') + '</button><button class="btn sm" id="gridBtn" title="Show or hide the canvas alignment grid" aria-pressed="' + TOPO_GRID + '">' + (TOPO_GRID?'▦ Grid on':'▦ Grid off') + '</button><button class="btn sm" id="snapBtn" title="Snap moved devices to the grid" aria-pressed="' + TOPO_SNAP + '">' + (TOPO_SNAP?'⌖ Snap on':'⌖ Snap off') + '</button><button class="btn sm" id="portsBtn" title="Show or hide interface names on links">' + (TOPO_SHOW_PORTS?'Hide ports':'Show ports') + '</button></div>' +
    '<div class="builder-section-head"><span>Drawing tools</span><small>Document your design</small></div><div class="pal-row">' + drawingTools.map(([k,n]) => '<button class="btn sm draw-tool' + (DRAW_TOOL===k?' active':'') + '" data-draw-tool="' + k + '" aria-pressed="' + (DRAW_TOOL===k) + '" title="' + n + ' drawing tool">' + n + '</button>').join('') + '<button class="btn sm" id="delDrawing" title="Remove the selected drawing" ' + (DRAWING_SEL==null?'disabled':'') + '>Remove drawing</button></div>' +
    '<div class="builder-section-head"><span>Canvas layers</span><small>Show or hide detail</small></div><div class="pal-row layer-controls">' + Object.keys(layerState).map(k => '<label class="dim"><input type="checkbox" data-topo-layer="' + k + '"' + (layerState[k]?' checked':'') + '/> ' + k + '</label>').join('') + '</div>' +
    '<div class="pal-hint dim">Right-click a device, link or empty canvas for contextual actions · drag to move devices · ' + (TOPO_SNAP?'snap-to-grid enabled':'free positioning') + '.</div></div>';
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
    <label class="label" for="aTitle">Title</label><input id="aTitle" class="wide" value="${esc(a.title)}"/>
    <div class="label">Objective / brief</div><textarea id="aObj" class="wide" rows="2" placeholder="What the student must achieve">${esc(a.objective)}</textarea>
    <div class="label">Objectives (success checks)</div>
    <div class="rev-list">${checkRows}</div>
    <div class="addrow"><label class="sr-only" for="chkType">Objective check type</label><select id="chkType" aria-label="Objective check type">${typeOpts}</select></div>
    <div class="addrow" id="chkArgs"></div>
    <div class="addrow"><button class="btn sm" id="addChk">＋ Add objective</button></div>
    <div class="row"><button class="btn" id="exportScn">⬇ Export</button>
      <label class="btn" style="cursor:pointer">⬆ Import<input id="importScn" type="file" accept="application/json,.json" style="display:none"></label>
      <button class="btn primary" id="playScn">▶ Play / test</button></div>
    <div class="row"><button class="btn" id="exitBuild">← Exit build</button>${AUTHUSER ? '<button class="btn" id="saveLib">💾 Save to class</button>' : ''}</div>
    <div id="status" role="status" aria-live="polite" aria-atomic="true"></div>`;
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
  AUTHOR.success.push(s); persistBuilderDraft(); $('#brief').innerHTML = renderAuthor(); wireBrief();
}
function builderRun(net) { return { net, cli: makeCLI(net, null), mission: { authored: true, mode: 'build' }, done: () => false, results: () => [] }; }
const BUILDER_DRAFT_KEY = 'networkTrainerBuilderDraft';
function persistBuilderDraft() {
  if (MODE !== 'build' || !RUN || !RUN.net) return;
  try { localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify({ version:1, net:RUN.net, author:AUTHOR, selected:SEL, view:TOPO_VIEW })); } catch (e) {}
}
function loadBuilderDraft() {
  try {
    const d=JSON.parse(localStorage.getItem(BUILDER_DRAFT_KEY)||'null');
    if (!d || d.version!==1 || !d.net || typeof d.net.devices!=='object' || !Array.isArray(d.net.links)) return null;
    return d;
  } catch(e) { return null; }
}
function renderAll() { $('#brief').innerHTML = MODE === 'build' ? renderAuthor() : renderBrief(); wireBrief(); refresh(); updateHud(); }
function enterBuild(options = {}) {
  showWorkspaceView('build', options);
  MODE = 'build'; WIRE = null; SEL = null; DRAW_TOOL='select'; DRAWING=null; DRAWING_SEL=null; TOPO_SELECTED=new Set();TEXT_SELECTED=new Set();LABEL_SELECTED=new Set();TOPO_UNDO=[];TOPO_REDO=[];TOPO_CLIPBOARD=null; TERM_SESSIONS = {}; HIST = []; HISTI = -1; TOPO_VIEW = null; INSPECTOR_TAB = 'overview'; HINTS = 0; PLAYING_DBID = null; stopTimer();
  const draft=loadBuilderDraft();
  if (draft) { AUTHOR=draft.author || {title:'My scenario',objective:'',ticket:null,hints:[],success:[]}; RUN=builderRun(draft.net); SEL=draft.selected || null; TOPO_VIEW=Array.isArray(draft.view)?draft.view:null; }
  else { AUTHOR = { title: 'My scenario', objective: '', ticket: null, hints: [], success: [] }; RUN = builderRun(B.blank()); }
  renderAll();
  if (!draft) termClear();
  termEcho(draft ? '— Restored your saved Build workspace.' : '— Build mode. Add devices, 🔗 Wire them, set addresses, then add objectives. ▶ Play to test.');
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
      MODE = 'build'; WIRE = null; SEL = null;TOPO_SELECTED=new Set();TEXT_SELECTED=new Set();LABEL_SELECTED=new Set();TOPO_UNDO=[];TOPO_REDO=[];TOPO_CLIPBOARD=null;
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
let MODAL_RETURN_FOCUS = null;
function modalFocusable(wrap) {
  return [...wrap.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => !el.hidden && el.getClientRects().length);
}
function wireModalDialog(wrap, preferredFocus) {
  const dialog=wrap.querySelector('.sheet'), heading=dialog&&dialog.querySelector('h2,h1,[data-dialog-title]');
  if(!dialog)return;
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
  if(heading){if(!heading.id)heading.id='modal-title';dialog.setAttribute('aria-labelledby',heading.id);}else dialog.setAttribute('aria-label','Dialog');
  MODAL_RETURN_FOCUS=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const initial=typeof preferredFocus==='string'?wrap.querySelector(preferredFocus):preferredFocus;
  (initial||modalFocusable(wrap)[0]||dialog).focus();
  wrap.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeModal();return;}
    if(e.key!=='Tab')return;
    const items=modalFocusable(wrap);
    if(!items.length){e.preventDefault();dialog.focus();return;}
    const index=items.indexOf(document.activeElement);
    const next=e.shiftKey?(index<=0?items.length-1:index-1):(index<0||index===items.length-1?0:index+1);
    e.preventDefault();items[next].focus();
  });
  wrap.addEventListener('focusout',()=>queueMicrotask(()=>{if(wrap.isConnected&&!wrap.contains(document.activeElement)){const items=modalFocusable(wrap);(items[0]||dialog).focus();}}));
}
function closeModal() {
  const m=$('#modal');if(!m)return;m.remove();
  const target=MODAL_RETURN_FOCUS;MODAL_RETURN_FOCUS=null;
  if(target&&target.isConnected)target.focus();
}
function modalShell(title) {
  const wrap = document.createElement('div'); wrap.id = 'modal';
  wrap.innerHTML = `<div class="sheet"><h2>${esc(title)}</h2><div class="cx-body"></div><div class="row" style="margin-top:14px"><button class="btn primary" id="closeS">Done</button></div></div>`;
  document.body.appendChild(wrap);
  wireModalDialog(wrap,'#closeS');
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  wrap.querySelector('#closeS').addEventListener('click', closeModal);
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


/* ---------- network automation workshop ---------- */
let AUTOMATION_CASE='baseline', AUTOMATION_LAB=null;
function ensureAutomationLab(){if(!AUTOMATION_LAB||AUTOMATION_LAB.id!==AUTOMATION_CASE){const lab=AW.createLab(AUTOMATION_CASE);AUTOMATION_LAB={id:AUTOMATION_CASE,...lab};}}
function renderAutomationWorkshop(){
 const root=$('#automationView');if(!root)return;ensureAutomationLab();
 PROG.automationWorkshop=PROG.automationWorkshop&&typeof PROG.automationWorkshop==='object'?PROG.automationWorkshop:{};
 const playbook=AW.getPlaybook(AUTOMATION_CASE),saved=PROG.automationWorkshop[playbook.id],lab=AUTOMATION_LAB;
 const tabs=AW.PLAYBOOKS.map(p=>'<button type="button" class="auto-tab'+(p.id===playbook.id?' active':'')+'" data-auto-case="'+esc(p.id)+'" aria-pressed="'+(p.id===playbook.id?'true':'false')+'"><b>'+esc(p.title)+'</b><small>'+esc(p.level)+'</small></button>').join('');
 const deviceOptions=playbook.deviceIds.map(id=>'<option value="'+esc(id)+'"'+(lab.device===id?' selected':'')+'>'+esc(id)+'</option>').join('');
 const commandGroups=playbook.steps.map(step=>'<section class="auto-command-group"><h3>Device · '+esc(step.device)+'</h3><div class="auto-command-list">'+step.commands.map((cmd,i)=>'<button type="button" class="auto-command" data-auto-command="'+esc(cmd)+'" data-auto-device="'+esc(step.device)+'"><span>'+(i+1)+'.</span><code>'+esc(cmd)+'</code><small>Load</small></button>').join('')+'</div></section>').join('');
 const checks=saved&&saved.result?'<section class="auto-review" aria-live="polite"><div class="auto-review-head"><div><span class="eyebrow">Playbook verification</span><h2>'+saved.result.score+' / '+saved.result.total+' checks passed</h2></div><strong class="'+(saved.result.passed?'passed':'needs-work')+'">'+saved.result.percent+'%</strong></div><div class="auto-checks">'+saved.result.checks.map(x=>'<article class="'+(x.ok?'good':'gap')+'"><b>'+(x.ok?'✓ ':'↻ ')+esc(x.label)+'</b><p>'+esc(x.detail)+'</p></article>').join('')+'</div></section>':'<p class="auto-empty">Run the playbook in the isolated simulator, then verify the resulting device configuration and routing state.</p>';
 const history=lab.output.map(x=>'<div class="auto-output-line '+(x.code?'error':'')+'"><b>'+esc(x.device)+'#</b> '+esc(x.command)+(x.out?'\n'+esc(x.out):'')+'</div>').join('');
 root.innerHTML='<div class="automation-page"><style>'+ 
 '.automation-page{max-width:1240px;margin:0 auto;padding:26px}.auto-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}.auto-head h1{font-size:30px;margin:3px 0 6px}.auto-head p{color:var(--muted);max-width:760px;margin:0}.auto-sim-label{border:1px solid var(--line);border-radius:20px;padding:6px 10px;color:var(--muted);font-size:11px;letter-spacing:.07em}.auto-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:18px 0}.auto-tab{text-align:left;padding:12px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);cursor:pointer}.auto-tab.active{border-color:var(--amber);box-shadow:inset 0 -2px var(--amber);background:color-mix(in srgb,var(--amber) 8%,var(--panel))}.auto-tab b,.auto-tab small{display:block}.auto-tab small{color:var(--muted);font-size:11px;margin-top:4px}.auto-brief,.auto-console,.auto-review,.auto-recipes{border:1px solid var(--line);border-radius:11px;background:var(--panel);padding:17px;margin-top:12px}.auto-brief h2{font-size:21px;margin:3px 0 7px}.auto-brief p{color:var(--muted);margin:0}.auto-objectives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:13px}.auto-objectives span{padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--raise);font-size:12px}.auto-console-head,.auto-review-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.auto-console h2,.auto-review h2{margin:2px 0;font-size:18px}.auto-console select{min-width:130px}.auto-terminal{margin:12px 0;padding:12px;min-height:110px;max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#071016;color:#cfe;font:12px/1.5 ui-monospace,monospace;border-radius:7px}.auto-output-line{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)}.auto-output-line b{color:var(--amber)}.auto-output-line.error{color:#ffbcbc}.auto-command-form{display:flex;gap:8px;align-items:center}.auto-command-form input{flex:1;min-width:0;font:12px ui-monospace,monospace;padding:9px}.auto-recipes h2{font-size:17px;margin:0 0 10px}.auto-command-group{margin-top:12px}.auto-command-group h3{font-size:12px;color:var(--amber);margin:0 0 6px}.auto-command-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.auto-command{display:flex;align-items:center;gap:8px;text-align:left;min-width:0;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--raise);color:var(--ink);cursor:pointer}.auto-command span,.auto-command small{color:var(--muted);font-size:10px}.auto-command code{flex:1;min-width:0;overflow-wrap:anywhere;font:11px ui-monospace,monospace}.auto-command:hover{border-color:var(--amber)}.auto-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.auto-review-head>strong{font-size:24px;color:var(--amber)}.auto-review-head>strong.passed{color:var(--good)}.auto-review-head>strong.needs-work{color:var(--bad)}.auto-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.auto-checks article{padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--raise)}.auto-checks article.good{border-left:3px solid var(--good)}.auto-checks article.gap{border-left:3px solid var(--bad)}.auto-checks p,.auto-empty{font-size:12px;color:var(--muted);margin:5px 0}.auto-note{font-size:11px;color:var(--muted);margin-top:10px}.auto-change{border:1px solid var(--line);border-radius:11px;background:var(--panel);padding:17px;margin-top:12px}.auto-change h2{font-size:17px;margin:0 0 6px}.auto-change p{font-size:12px;color:var(--muted)}.auto-change-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.auto-change-output{min-height:42px;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border-radius:7px;background:#071016;color:#cfe;font:11px/1.5 ui-monospace,monospace}.auto-change-output:empty:before{content:"Capture a baseline and candidate to review configuration changes.";color:var(--muted)}@media(max-width:760px){.automation-page{padding:15px}.auto-tabs,.auto-objectives,.auto-checks,.auto-command-list{grid-template-columns:1fr}.auto-command-form{flex-wrap:wrap}.auto-command-form input{flex-basis:100%}}'+
 '</style><header class="auto-head"><div><div class="eyebrow">Network engineering · guided automation</div><h1>Network Automation Workshop</h1><p>Practise repeatable configuration workflows against an isolated network simulator. Learn to standardise, verify and safely re-run changes before applying the same discipline to real automation tools.</p></div><span class="auto-sim-label">SIMULATED · NO EXTERNAL DEVICES</span></header><nav class="auto-tabs" aria-label="Automation playbooks">'+tabs+'</nav><section class="auto-brief"><div class="eyebrow">'+esc(playbook.level)+' playbook</div><h2>'+esc(playbook.title)+'</h2><p>'+esc(playbook.summary)+'</p><div class="auto-objectives">'+playbook.objectives.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div></section><section class="auto-console"><div class="auto-console-head"><div><div class="eyebrow">Interactive command sandbox</div><h2>Run and inspect commands</h2></div><label>Active device <select id="autoDevice" aria-label="Active automation lab device">'+deviceOptions+'</select></label></div><pre class="auto-terminal" id="autoOutput" aria-live="polite">'+(history||'Sandbox ready. Select a command recipe below or enter a command.')+'</pre><form id="autoCommandForm" class="auto-command-form"><input id="autoCommandInput" autocomplete="off" aria-label="Network automation command" placeholder="Enter a simulated device command…"><button class="btn primary" type="submit">Run command</button></form><div class="auto-actions"><button class="btn primary" id="autoVerify" type="button">Verify playbook</button><button class="btn" id="autoReset" type="button">Reset sandbox</button></div><p class="auto-note">Commands execute only inside this playbook&#39;s isolated simulator. They do not affect the active Workbench mission or real network equipment.</p></section><section class="auto-recipes"><h2>Command recipe · select to load, then run</h2>'+commandGroups+'</section><section class="auto-change" aria-labelledby="autoChangeHeading"><h2 id="autoChangeHeading">Configuration change control</h2><p>Capture the current simulator state, compare a proposed change, check the playbook against its saved-configuration policy, or roll back to the captured baseline.</p><div class="auto-change-actions"><button class="btn" id="autoCaptureBaseline" type="button">Capture baseline</button><button class="btn" id="autoCaptureCandidate" type="button">Capture candidate</button><button class="btn" id="autoCompare" type="button">Compare snapshots</button><button class="btn" id="autoCompliance" type="button">Run compliance</button><button class="btn" id="autoRollback" type="button">Rollback to baseline</button></div><pre id="autoChangeOutput" class="auto-change-output" aria-live="polite"></pre></section>'+checks+'</div>';
 root.querySelectorAll('[data-auto-case]').forEach(b=>b.addEventListener('click',()=>{AUTOMATION_CASE=b.dataset.autoCase;AUTOMATION_LAB=null;renderAutomationWorkshop();}));
 root.querySelectorAll('[data-auto-command]').forEach(b=>b.addEventListener('click',()=>{root.querySelector('#autoDevice').value=b.dataset.autoDevice;lab.device=b.dataset.autoDevice;lab.cli.on(lab.device);root.querySelector('#autoCommandInput').value=b.dataset.autoCommand;root.querySelector('#autoCommandInput').focus();}));
 root.querySelector('#autoDevice').addEventListener('change',e=>{lab.device=e.target.value;lab.cli.on(lab.device);});
 root.querySelector('#autoCommandForm').addEventListener('submit',e=>{e.preventDefault();const field=root.querySelector('#autoCommandInput'),command=field.value.trim();if(!command)return;const device=lab.device;const result=lab.cli.on(device).run(command);lab.output.push({device,command,out:result.out||'',code:result.code});lab.output=lab.output.slice(-80);field.value='';root.querySelector('#autoOutput').innerHTML=lab.output.map(x=>'<div class="auto-output-line '+(x.code?'error':'')+'"><b>'+esc(x.device)+'#</b> '+esc(x.command)+(x.out?'\n'+esc(x.out):'')+'</div>').join('');root.querySelector('#autoOutput').scrollTop=root.querySelector('#autoOutput').scrollHeight;});
 root.querySelector('#autoVerify').addEventListener('click',()=>{const result=AW.evaluate(playbook.id,lab.net);PROG.automationWorkshop[playbook.id]={result,reviewedAt:new Date().toISOString()};saveProg();addJournalEntry({type:'automation playbook review',text:playbook.title+' · '+result.score+'/'+result.total+' checks passed'});renderAutomationWorkshop();});
 root.querySelector('#autoReset').addEventListener('click',()=>{AUTOMATION_LAB=null;renderAutomationWorkshop();});
 const changeState=()=>{PROG.automationWorkshop[playbook.id]=PROG.automationWorkshop[playbook.id]||{};return PROG.automationWorkshop[playbook.id];};
 const changeOut=root.querySelector('#autoChangeOutput');
 const printChanges=changes=>{changeOut.textContent=changes.length?changes.map(x=>x.device+' · '+x.path+'\n  before: '+JSON.stringify(x.before)+'\n  after:  '+JSON.stringify(x.after)).join('\n'):'No configuration differences found.';};
 root.querySelector('#autoCaptureBaseline').addEventListener('click',()=>{const state=changeState();state.baseline=AW.captureSnapshot(lab.net,'baseline');saveProg();changeOut.textContent='Baseline captured from '+Object.keys(lab.net.devices).length+' device(s).';});
 root.querySelector('#autoCaptureCandidate').addEventListener('click',()=>{const state=changeState();state.candidate=AW.captureSnapshot(lab.net,'candidate');saveProg();changeOut.textContent='Candidate snapshot captured. Compare it with the baseline before approving the change.';});
 root.querySelector('#autoCompare').addEventListener('click',()=>{const state=changeState();if(!state.baseline||!state.candidate){changeOut.textContent='Capture both a baseline and a candidate snapshot first.';return;}const diff=AW.diffSnapshots(state.baseline,state.candidate);changeOut.textContent=diff.count+' configuration change(s) detected.\n'+(diff.changes.length?diff.changes.map(x=>x.device+' · '+x.path+'\n  before: '+JSON.stringify(x.before)+'\n  after:  '+JSON.stringify(x.after)).join('\n'):'No differences.');});
 root.querySelector('#autoCompliance').addEventListener('click',()=>{const result=AW.evaluateCompliance(playbook.id,lab.net);changeOut.textContent='Compliance: '+result.score+'/'+result.total+' checks passed ('+result.percent+'%).\n'+result.checks.map(x=>(x.ok?'PASS ':'GAP  ')+x.label+' — '+x.detail).join('\n');});
 root.querySelector('#autoRollback').addEventListener('click',()=>{const state=changeState();if(!state.baseline){changeOut.textContent='No baseline exists. Capture a baseline before attempting rollback.';return;}if(!AW.restoreSnapshot(lab.net,state.baseline)){changeOut.textContent='Rollback rejected: the saved baseline is invalid.';return;}state.candidate=null;lab.output=[];saveProg();changeOut.textContent='Rollback completed in the isolated simulator. Re-run verification to confirm the restored state.';});
}

/* ---------- enterprise network design academy ---------- */
let DESIGN_CASE='small-office';
function renderDesignAcademy(){
 const root=$('#designView');if(!root)return;
 PROG.designAcademy=PROG.designAcademy&&typeof PROG.designAcademy==='object'?PROG.designAcademy:{};
 const selected=D.getCase(DESIGN_CASE),saved=PROG.designAcademy[selected.id]||{},answers=saved.answers||{};
 const tabs=D.CASES.map(c=>'<button type="button" class="design-case-tab'+(c.id===selected.id?' active':'')+'" data-design-case="'+esc(c.id)+'" aria-pressed="'+(c.id===selected.id?'true':'false')+'"><b>'+esc(c.title)+'</b><small>'+esc(c.level)+' · '+esc(c.duration)+'</small></button>').join('');
 const fields=selected.decisions.map(d=>'<label class="design-decision"><span><b>'+esc(d.label)+'</b><small>Choose the architecture decision that best meets the brief.</small></span><select name="'+esc(d.id)+'" required aria-label="'+esc(d.label)+'"><option value="">Select a design decision…</option>'+d.options.map(o=>'<option value="'+esc(o[0])+'"'+(answers[d.id]===o[0]?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select></label>').join('');
 const result=saved.result?'<section class="design-review" aria-live="polite"><div class="design-review-head"><div><span class="eyebrow">Design review</span><h2>'+saved.result.score+' / '+saved.result.total+' decisions aligned</h2></div><strong class="'+(saved.result.passed?'passed':'needs-work')+'">'+saved.result.percent+'%</strong></div><p>'+(saved.result.passed?'All decisions meet the stated design objectives. Review the rationale and consider how you would validate this architecture in a real change review.':'Review the gaps below, revise your decisions and submit another design review.')+'</p><div class="design-feedback">'+saved.result.feedback.map(f=>'<article class="'+(f.correct?'good':'gap')+'"><b>'+(f.correct?'✓ ':'↻ ')+esc(f.label)+'</b><p>'+esc(f.explanation)+'</p><small>'+(f.correct?'Aligned with the brief':'Revisit this decision; the current selection does not meet the design objective')+'</small></article>').join('')+'</div></section>':'<p class="design-empty">Complete the four architecture decisions and request a review. Your work is saved on this device.</p>';
 root.innerHTML='<div class="design-page"><style>'+
 '.design-page{max-width:1180px;margin:0 auto;padding:26px}.design-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}.design-head h1{font-size:30px;margin:3px 0 6px}.design-head p{color:var(--muted);max-width:760px;margin:0}.design-label{border:1px solid var(--line);border-radius:20px;padding:6px 10px;color:var(--muted);font-size:11px;letter-spacing:.07em}.design-case-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:18px 0}.design-case-tab{text-align:left;padding:12px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);cursor:pointer}.design-case-tab.active{border-color:var(--amber);box-shadow:inset 0 -2px var(--amber);background:color-mix(in srgb,var(--amber) 8%,var(--panel))}.design-case-tab b,.design-case-tab small{display:block}.design-case-tab small{color:var(--muted);font-size:11px;margin-top:4px}.design-brief,.design-form,.design-review{border:1px solid var(--line);border-radius:11px;background:var(--panel);padding:18px;margin-top:12px}.design-brief h2{margin:3px 0 7px;font-size:21px}.design-brief p{color:var(--muted);margin:0}.design-constraints{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:13px}.design-constraints span{padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--raise);font-size:12px}.design-form-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.design-form h2{margin:0;font-size:18px}.design-decision{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(0,1.3fr);gap:16px;align-items:center;padding:13px 0;border-top:1px solid var(--line)}.design-decision b,.design-decision small{display:block}.design-decision small{color:var(--muted);font-size:11px;margin-top:3px}.design-decision select{width:100%;min-width:0;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:10px;font:inherit}.design-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.design-review-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.design-review h2{margin:2px 0;font-size:20px}.design-review-head>strong{font-size:24px;color:var(--amber)}.design-review-head>strong.passed{color:var(--good)}.design-review-head>strong.needs-work{color:var(--bad)}.design-review>p,.design-empty{color:var(--muted)}.design-feedback{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.design-feedback article{padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--raise)}.design-feedback article.good{border-left:3px solid var(--good)}.design-feedback article.gap{border-left:3px solid var(--bad)}.design-feedback p{font-size:12px;color:var(--muted);margin:6px 0}.design-feedback small{font-size:10px;color:var(--muted)}@media(max-width:760px){.design-page{padding:15px}.design-case-tabs,.design-constraints,.design-feedback{grid-template-columns:1fr}.design-decision{grid-template-columns:1fr;gap:8px}}'+
 '</style><header class="design-head"><div><div class="eyebrow">Network architecture · guided academy</div><h1>Enterprise Network Design Academy</h1><p>Practise making defensible architecture decisions. Read the business brief, account for its constraints, then review your design against explicit engineering principles.</p></div><span class="design-label">SIMULATED DESIGN EXERCISES</span></header><nav class="design-case-tabs" aria-label="Design scenarios">'+tabs+'</nav><section class="design-brief"><div class="eyebrow">Design brief · '+esc(selected.level)+'</div><h2>'+esc(selected.title)+'</h2><p>'+esc(selected.brief)+'</p><div class="design-constraints">'+selected.constraints.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div></section><form id="designReviewForm" class="design-form"><div class="design-form-head"><h2>Architecture decisions</h2><span class="sub">Four decisions · evidence-based review</span></div>'+fields+'<div class="design-actions"><button type="submit" class="btn primary">Review my design</button><button type="button" class="btn" id="designReset">Reset this brief</button></div></form>'+result+'</div>';
 root.querySelectorAll('[data-design-case]').forEach(b=>b.addEventListener('click',()=>{DESIGN_CASE=b.dataset.designCase;renderDesignAcademy();}));
 root.querySelector('#designReviewForm').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.currentTarget),submitted={};selected.decisions.forEach(d=>submitted[d.id]=String(data.get(d.id)||''));if(selected.decisions.some(d=>!submitted[d.id])){flashStatus('Complete all four architecture decisions before review.');return;}const review=D.evaluate(selected.id,submitted);PROG.designAcademy[selected.id]={answers:submitted,result:review,reviewedAt:new Date().toISOString()};saveProg();addJournalEntry({type:'design review',text:selected.title+' · '+review.score+'/'+review.total+' decisions aligned'});renderDesignAcademy();});
 root.querySelector('#designReset').addEventListener('click',()=>{delete PROG.designAcademy[selected.id];saveProg();renderDesignAcademy();});
}

/* ---------- change management ---------- */
let CHANGE_SELECTED = null;
const CHANGE_STATES = ['draft','submitted','approved','implementing','verified','rolled-back'];
function changeStateLabel(state) { return ({draft:'Draft',submitted:'Awaiting approval',approved:'Approved',implementing:'In progress',verified:'Verified', 'rolled-back':'Rolled back'})[state] || state; }
function renderChangeManagement() {
  const root = $('#changeView'); if (!root) return;
  PROG.changes = Array.isArray(PROG.changes) ? PROG.changes : [];
  const records = [...PROG.changes].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const selected = records.find(x => x.id === CHANGE_SELECTED) || records[0] || null;
  if (selected) CHANGE_SELECTED = selected.id;
  const stateCounts = CHANGE_STATES.map(state => [state, records.filter(x=>x.status===state).length]);
  const list = records.map(x => `<button class="change-list-item ${selected&&selected.id===x.id?'selected':''}" data-change-select="${esc(x.id)}"><span class="change-list-top"><b>${esc(x.id)}</b><em class="change-state state-${esc(x.status)}">${esc(changeStateLabel(x.status))}</em></span><strong>${esc(x.title)}</strong><small>${esc(x.affected||'Scope not specified')} · ${esc(x.risk)} risk</small></button>`).join('');
  const deviceOptions = RUN && RUN.net ? Object.entries(RUN.net.devices || {}).map(([id,d]) => `<label class="change-device-option"><input type="checkbox" name="deviceIds" value="${esc(id)}"><span><b>${esc(id)}</b><small>${esc(d.kind)} · ${esc(primaryIp(d) || 'no IP')}</small></span></label>`).join('') : '';
  const detail = selected ? `<div class="change-detail-head"><div><div class="eyebrow">Change record · ${esc(selected.id)}</div><h2>${esc(selected.title)}</h2><p>${esc(selected.reason)}</p></div><em class="change-state state-${esc(selected.status)}">${esc(changeStateLabel(selected.status))}</em></div>
    ${Array.isArray(selected.deviceIds)&&selected.deviceIds.length?'<section class="change-device-links"><h3>Linked simulator devices</h3><div>'+selected.deviceIds.map(id=>'<button type="button" class="btn sm" data-change-device="'+esc(id)+'">Open '+esc(id)+' in Workbench →</button>').join('')+'</div></section>':''}
    <div class="change-facts"><div><small>Risk</small><b>${esc(selected.risk)}</b></div><div><small>Affected services / devices</small><b>${esc(selected.affected)}</b></div><div><small>Maintenance window</small><b>${esc(selected.window)}</b></div><div><small>Created</small><b>${esc(new Date(selected.createdAt).toLocaleString())}</b></div></div>
    <div class="change-plan-grid"><section><h3>Pre-change checks</h3><p>${esc(selected.prechecks)}</p></section><section><h3>Implementation plan</h3><p>${esc(selected.steps)}</p></section><section><h3>Rollback plan</h3><p>${esc(selected.rollback)}</p></section><section><h3>Success criteria</h3><p>${esc(selected.successCriteria)}</p></section></div>
    ${selected.validation?'<section class="change-validation"><h3>Post-change verification</h3><p>'+esc(selected.validation)+'</p></section>':''}
    ${selected.rollbackReason?'<section class="change-validation"><h3>Rollback record</h3><p>'+esc(selected.rollbackReason)+'</p></section>':''}
    <div class="change-actions">${selected.status==='draft'?'<button class="btn primary" id="changeSubmit">Submit for approval</button>':''}${selected.status==='submitted'?'<button class="btn primary" id="changeApprove">Approve change</button>':''}${selected.status==='approved'?'<button class="btn primary" id="changeStart">Start implementation</button>':''}${selected.status==='implementing'?'<textarea id="changeValidation" rows="3" placeholder="Record commands, evidence and post-change checks…"></textarea><button class="btn primary" id="changeVerify">Complete and verify</button><textarea id="changeRollbackReason" rows="2" placeholder="Why is rollback required?"></textarea><button class="btn danger" id="changeRollback">Record rollback</button>':''}</div>
    <div class="change-timeline"><h3>Change history</h3>${(selected.history||[]).map(h=>'<div><time>'+esc(new Date(h.at).toLocaleString())+'</time><b>'+esc(changeStateLabel(h.status))+'</b><p>'+esc(h.note)+'</p></div>').join('')}</div>` : '<div class="change-empty">No change records yet. Create a request before making a planned network change.</div>';
  root.innerHTML = `<div class="change-heading"><div><div class="eyebrow">Controlled network operations · local training records</div><h1>Change management</h1><p>Plan, review, implement and verify network changes. Every change needs a reason, impact assessment and rollback path.</p></div><button class="btn primary" id="changeNew">＋ New change</button></div>
    <div class="change-metrics">${stateCounts.map(([state,count])=>'<div><small>'+esc(changeStateLabel(state))+'</small><b>'+count+'</b></div>').join('')}</div>
    <div class="change-workspace"><section class="change-list-panel"><div class="change-list-heading"><h2>Change register</h2><span>${records.length} records</span></div><div class="change-list">${list||'<div class="change-empty">No requests recorded.</div>'}</div></section><section class="change-detail-panel" id="changeDetail">${detail}</section></div>
    <div class="change-form-wrap" id="changeFormWrap" hidden><form id="changeForm" class="change-form"><div class="change-form-heading"><div><div class="eyebrow">New change request</div><h2>Describe the proposed work</h2></div><button type="button" class="btn sm" id="changeFormClose">Close</button></div>
      <label>Change title<input name="title" required maxlength="120" placeholder="e.g. Add VLAN 30 to the access switch"></label>
      <div class="change-form-row"><label>Change category<select name="category"><option>Configuration</option><option>Firmware / maintenance</option><option>Routing</option><option>Switching</option><option>Firewall / security</option><option>Service change</option></select></label><label>Risk<select name="risk"><option>Low</option><option selected>Medium</option><option>High</option></select></label></div>
      <label>Reason and expected outcome<textarea name="reason" required rows="2"></textarea></label><label>Affected devices / services<input name="affected" required placeholder="e.g. SW-CORE, VLAN 30, Finance endpoints"></label>
      ${deviceOptions?'<fieldset class="change-device-picker"><legend>Link affected simulator devices (optional)</legend><div>'+deviceOptions+'</div><small>Links let you jump directly to the selected device during implementation.</small></fieldset>':''}
      <label>Maintenance window<input name="window" required placeholder="e.g. 2026-11-08 20:00–20:30 CET"></label>
      <label>Pre-change checks<textarea name="prechecks" required rows="3" placeholder="Current state, backups, reachability, baseline outputs…"></textarea></label>
      <label>Implementation steps<textarea name="steps" required rows="3" placeholder="Ordered commands and actions…"></textarea></label>
      <label>Rollback plan<textarea name="rollback" required rows="3" placeholder="Exact reversal steps and rollback trigger…"></textarea></label>
      <label>Success criteria<textarea name="successCriteria" required rows="2" placeholder="What evidence proves the change succeeded?"></textarea></label>
      <button class="btn primary" type="submit">Save draft change</button></form></div>`;
  root.querySelector('#changeNew').addEventListener('click',()=>{root.querySelector('#changeFormWrap').hidden=false;root.querySelector('[name="title"]').focus();});
  root.querySelector('#changeFormClose').addEventListener('click',()=>{root.querySelector('#changeFormWrap').hidden=true;});
  root.querySelector('#changeForm').addEventListener('submit',e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    const id='CHG-'+String((PROG.changeSequence||0)+1).padStart(4,'0');PROG.changeSequence=(PROG.changeSequence||0)+1;
    const record={...data,deviceIds:new FormData(e.currentTarget).getAll('deviceIds'),id,status:'draft',createdAt:new Date().toISOString(),history:[{at:new Date().toISOString(),status:'draft',note:'Change request created as a draft.'}]};
    PROG.changes.unshift(record);CHANGE_SELECTED=id;saveProg();addJournalEntry({type:'change created',text:id+' — '+record.title});renderChangeManagement();
  });
  root.querySelectorAll('[data-change-select]').forEach(b=>b.addEventListener('click',()=>{CHANGE_SELECTED=b.dataset.changeSelect;renderChangeManagement();}));
  const transition=(status,note,extra={})=>{const item=PROG.changes.find(x=>x.id===CHANGE_SELECTED);if(!item)return;Object.assign(item,extra,{status});item.history=item.history||[];item.history.push({at:new Date().toISOString(),status,note});saveProg();addJournalEntry({type:'change '+status,ticket:'',text:item.id+' — '+note});renderChangeManagement();};
  const bind=(id,fn)=>{const el=root.querySelector('#'+id);if(el)el.addEventListener('click',fn);};
  root.querySelectorAll('[data-change-device]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.changeDevice;if(RUN&&RUN.net.devices[id]){showWorkspaceView('workbench');selectDevice(id);}}));
  bind('changeSubmit',()=>transition('submitted','Submitted for peer / change-owner review.'));
  bind('changeApprove',()=>transition('approved','Change approved for the stated maintenance window.'));
  bind('changeStart',()=>transition('implementing','Implementation started; record evidence before completing.'));
  bind('changeVerify',()=>{const v=root.querySelector('#changeValidation').value.trim();if(!v){root.querySelector('#changeValidation').focus();return;}transition('verified','Post-change checks recorded; success criteria reviewed.',{validation:v});});
  bind('changeRollback',()=>{const v=root.querySelector('#changeRollbackReason').value.trim();if(!v){root.querySelector('#changeRollbackReason').focus();return;}transition('rolled-back','Rollback executed and recorded.',{rollbackReason:v});});
}


/* ---------- global workstation search ---------- */
let PALETTE_RESULTS = [], PALETTE_ACTIVE = 0;
function collectPaletteResults(query) {
  const q=query.trim().toLowerCase(), results=[];
  const add=(kind,title,detail,action)=>{if(!q||[kind,title,detail].join(' ').toLowerCase().includes(q))results.push({kind,title,detail,action});};
  [['overview','Operations overview','Shift dashboard'],['incidents','Incident queue','Tickets and investigation'],['workbench','Network Workbench','Topology, device console and inspector'],['infrastructure','Infrastructure inventory','Devices, interfaces, routes and services'],['knowledge','Network knowledge','Cisco command reference and playbooks'],['journal','Engineering journal','Commands, evidence and notes'],['changes','Change management','Planned network changes']].forEach(([view,title,detail])=>add('Workspace',title,detail,()=>showWorkspaceView(view)));
  if(RUN&&RUN.net) Object.entries(RUN.net.devices||{}).forEach(([id,d])=>add('Device',id,(d.kind||'device')+' · '+(primaryIp(d)||'no IP'),()=>{showWorkspaceView('workbench');selectDevice(id);}));
  allTickets().forEach(t=>add('Incident',t.id+' · '+t.title,[t.priority,t.status,t.service,t.symptom].join(' · '),()=>{INCIDENT_SELECTED=t.id;INCIDENT_FILTERS.query='';INCIDENT_FILTERS.status='all';showWorkspaceView('incidents');}));
  (PROG.changes||[]).forEach(c=>add('Change',c.id+' · '+c.title,[changeStateLabel(c.status),c.affected].join(' · '),()=>{CHANGE_SELECTED=c.id;showWorkspaceView('changes');}));
  KNOWLEDGE_COMMANDS.forEach(c=>add('Command',c.cmd,c.cat+' · '+c.desc,()=>{showWorkspaceView('workbench');const input=$('#tin');if(input){input.value=c.cmd;input.focus();}}));
  (PROG.journal||[]).forEach((e,i)=>add('Journal',e.type||'Activity',[e.device,e.ticket,e.command,e.text,e.output].filter(Boolean).join(' · '),()=>{JOURNAL_FILTERS.query=q;JOURNAL_FILTERS.type='all';JOURNAL_FILTERS.range='all';showWorkspaceView('journal');}));
  return results.slice(0,40);
}
function renderPaletteResults() {
  const list=$('#paletteResults'); if(!list)return;
  list.innerHTML=PALETTE_RESULTS.length?PALETTE_RESULTS.map((r,i)=>'<button type="button" class="palette-result'+(i===PALETTE_ACTIVE?' active':'')+'" data-palette-index="'+i+'" id="palette-option-'+i+'" role="option" aria-selected="'+(i===PALETTE_ACTIVE)+'"><span class="palette-result-kind">'+esc(r.kind)+'</span><span class="palette-result-copy"><b>'+esc(r.title)+'</b><small>'+esc(r.detail)+'</small></span><span class="palette-result-enter">↵</span></button>').join(''):'<div class="palette-empty">No matching devices, incidents, changes or commands.</div>';
  list.querySelectorAll('[data-palette-index]').forEach(b=>b.addEventListener('click',()=>activatePaletteResult(Number(b.dataset.paletteIndex))));
  const input=$('#paletteSearch');if(input){if(PALETTE_RESULTS.length)input.setAttribute('aria-activedescendant','palette-option-'+PALETTE_ACTIVE);else input.removeAttribute('aria-activedescendant');}
}
function activatePaletteResult(index) {
  const item=PALETTE_RESULTS[index]; if(!item)return;
  closePalette(); item.action();
}
let PALETTE_RETURN_FOCUS=null;
function openPalette() {
  if($('#workstationPalette')){const input=$('#paletteSearch');$('#workstationPalette').hidden=false;input.value='';PALETTE_RESULTS=collectPaletteResults('');PALETTE_ACTIVE=0;renderPaletteResults();input.focus();return;}
  const modal=document.createElement('div');modal.id='workstationPalette';modal.className='palette-overlay';modal.innerHTML='<section class="palette-dialog" role="dialog" aria-modal="true" aria-label="Search workstation"><div class="palette-search-row"><span aria-hidden="true">⌕</span><input id="paletteSearch" type="search" aria-label="Search devices, incidents, changes and commands" autocomplete="off" placeholder="Search devices, incidents, changes, commands…"><kbd>ESC</kbd></div><div id="paletteResults" class="palette-results" role="listbox" aria-label="Search results"></div><footer><span>↑ ↓ Navigate</span><span>↵ Open</span><span>Ctrl K Search</span></footer></section>';
  PALETTE_RETURN_FOCUS=document.activeElement instanceof HTMLElement?document.activeElement:null;
  document.body.appendChild(modal);
  const input=modal.querySelector('#paletteSearch'),dialog=modal.querySelector('.palette-dialog');
  const focusables=()=>[...dialog.querySelectorAll('input:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
  input.addEventListener('input',()=>{PALETTE_RESULTS=collectPaletteResults(input.value);PALETTE_ACTIVE=0;renderPaletteResults();});
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();PALETTE_ACTIVE=Math.min(Math.max(0,PALETTE_RESULTS.length-1),PALETTE_ACTIVE+1);renderPaletteResults();}
    else if(e.key==='ArrowUp'){e.preventDefault();PALETTE_ACTIVE=Math.max(0,PALETTE_ACTIVE-1);renderPaletteResults();}
    else if(e.key==='Enter'){e.preventDefault();activatePaletteResult(PALETTE_ACTIVE);}
    else if(e.key==='Escape'){e.preventDefault();closePalette();}
  });
  modal.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closePalette();return;}
    if(e.key!=='Tab')return;
    const items=focusables();if(!items.length){e.preventDefault();dialog.focus();return;}
    if(e.shiftKey&&(document.activeElement===items[0]||!modal.contains(document.activeElement))){e.preventDefault();items[items.length-1].focus();}
    else if(!e.shiftKey&&(document.activeElement===items[items.length-1]||!modal.contains(document.activeElement))){e.preventDefault();items[0].focus();}
  });
  modal.addEventListener('focusout',()=>queueMicrotask(()=>{if(modal.isConnected&&!modal.contains(document.activeElement))input.focus();}));
  modal.addEventListener('click',e=>{if(e.target===modal)closePalette();});
  PALETTE_RESULTS=collectPaletteResults('');PALETTE_ACTIVE=0;renderPaletteResults();input.focus();
}
function closePalette(){const modal=$('#workstationPalette');if(!modal)return;modal.remove();const target=PALETTE_RETURN_FOCUS;PALETTE_RETURN_FOCUS=null;if(target&&target.isConnected)target.focus();}
function wireGlobalPalette() {
  document.addEventListener('keydown',e=>{if(canBuild()&&RUN&&!/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')){const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoTopology():undoTopology();return;}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redoTopology();return;}if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();copyTopologySelection();return;}if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();pasteTopologySelection();return;}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return;} if(canBuild()&&RUN&&!/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')){if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='d'&&SEL){e.preventDefault();try{const id=B.cloneDevice(RUN.net,SEL);selectDevice(id);refresh();}catch(err){flashStatus(err.message);}return;}if(e.key==='Delete'&&LINK_SEL!=null){e.preventDefault();B.removeLink(RUN.net,LINK_SEL);LINK_SEL=null;refresh();return;}}if(e.key==='Escape'&&$('#workstationPalette'))closePalette();});
}

/* ---------- boot ---------- */
function boot() {
  applyTheme(PROG.theme);
  document.getElementById('app').innerHTML = `
    <div id="shell">
      <aside id="navRail" aria-label="Network workspace navigation">
        <div class="nav-brand"><span class="nav-brand-mark" aria-hidden="true">N</span><div><strong>NETWORK OPS</strong><small>Engineering workstation</small></div></div>
        <div class="nav-section">Workspace</div>
        <button class="nav-item" id="navOverview" title="Overview of the current lab and recent activity" data-view="overview" type="button" aria-current="page"><span class="nav-glyph">▦</span>Overview</button>
        <button class="nav-item" id="navIncidents" title="Review and work incident tickets" data-view="incidents" type="button"><span class="nav-glyph">◈</span>Incidents</button>
        <button class="nav-item" id="navWorkbench" title="Operate the active network simulation" data-view="workbench" type="button"><span class="nav-glyph">⌘</span>Workbench</button>
        <button class="nav-item" id="navInfrastructure" title="Inspect devices, links and infrastructure" data-view="infrastructure" type="button"><span class="nav-glyph">▤</span>Infrastructure</button>
        <button class="nav-item" id="navProtocols" title="Explore how network protocols exchange packets" data-view="protocols" type="button"><span class="nav-glyph">⇄</span>Protocol labs</button>
        <button class="nav-item" id="navDesign" title="Practise enterprise network architecture decisions" data-view="design" type="button"><span class="nav-glyph">⌘</span>Design academy</button>
        <button class="nav-item" id="navAutomation" title="Practise repeatable network configuration workflows" data-view="automation" type="button"><span class="nav-glyph">⚙</span>Automation lab</button>
        <div class="nav-section">Reference & records</div>
        <button class="nav-item" id="navKnowledge" title="Browse command references and troubleshooting playbooks" data-view="knowledge" type="button"><span class="nav-glyph">⌕</span>Knowledge</button>
        <button class="nav-item" id="navJournal" title="Review saved investigation notes and evidence" data-view="journal" type="button"><span class="nav-glyph">▧</span>Journal</button>
        <button class="nav-item" id="navChanges" title="Review configuration changes and history" data-view="changes" type="button"><span class="nav-glyph">⇄</span>Changes</button>
        <div class="nav-spacer"></div><div class="nav-foot">LAB STATUS · SIMULATED<br>LOCAL PROGRESS ENABLED</div>
      </aside>
      <div id="mainArea">
    <header id="top">
      <div class="apphdr">
        <div class="brand"><span class="mark" aria-hidden="true"></span><div><div class="name">THE LAST SYSADMIN</div><div class="sub">Learn Network Administration</div></div></div>
        <nav class="apptabs" aria-label="Application navigation">
          <a class="apptab" href="../" title="Return to Linux system administration"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 16h4"/></svg>Linux Sysadmin</a>
          <a class="apptab on" href="#" aria-current="page" title="Current Network Sysadmin workspace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 7h8M7.4 7.8 11 16M16.6 7.8 13 16"/></svg>Network Sysadmin</a>
        </nav>
      </div>
      <div class="hud"><button id="btnSearch" class="btn palette-launch" title="Search workstation (Ctrl+K)">⌕ Search <kbd>Ctrl K</kbd></button><span>Time <b id="time">0:00</b></span><span>XP <b id="xp">0</b></span><span>Rank <b id="rank">Cadet</b></span><span>Solved <b id="prog">0/0</b></span>
        <button id="btnQueue" class="btn queue-launch" title="Daily incident queue">▤ Tickets <span id="queueOpenCount"></span></button>
        <button id="btnHelp" class="btn help-launch" title="Help and command reference">? Help</button>
        <button id="btnJournal" class="btn" title="Personal work journal">▤ Journal</button>
        <div class="build-menu"><button id="btnBuild" class="btn" type="button" title="Build tools" aria-haspopup="true" aria-expanded="false">🛠 Build <span class="caret" aria-hidden="true">▾</span></button><div class="build-menu-panel" id="buildMenu" role="menu" aria-label="Build tools" hidden><button class="build-menu-item" id="buildMenuOpen" type="button" role="menuitem"><span aria-hidden="true">🛠</span> Open build workspace</button><button class="build-menu-item" id="terminalRestore" type="button" role="menuitem" aria-label="Open device terminal"><span aria-hidden="true">▣</span> Device terminal</button></div></div>
        <button id="btnClass" class="btn" title="Classroom — classes & assigned scenarios">🎓 Class</button>
        <button id="btnStats" class="btn" type="button" title="Stats" aria-label="Open statistics">📊</button>
        <button id="btnSet" class="btn" type="button" title="Settings" aria-label="Open settings">⚙</button></div>
    </header>
    <section id="overview" aria-label="Operations overview"></section>
    <section id="incidentsView" aria-label="Incident management" hidden></section>
    <section id="infrastructureView" aria-label="Infrastructure inventory" hidden></section>
    <section id="protocolsView" aria-label="Interactive network protocol labs" hidden></section>
    <section id="designView" aria-label="Enterprise network design academy" hidden></section>
    <section id="automationView" aria-label="Network automation workshop" hidden></section>
    <section id="knowledgeView" aria-label="Network knowledge centre" hidden></section>
    <section id="journalView" aria-label="Engineering journal" hidden></section>
    <section id="changeView" aria-label="Change management" hidden></section>
    <div id="cols" hidden>
      <aside id="brief"></aside>
      <main class="workbench"><div class="deskbar"><div><span class="eyebrow">Operations floor</span><strong>Live network topology</strong><span class="desk-hint">Select a device to inspect it · run commands to collect evidence</span></div><div class="desk-tools" aria-label="Topology controls"><button class="btn sm" id="topoZoomOut" type="button" title="Zoom out" aria-label="Zoom out topology">−</button><button class="btn sm" id="topoZoomIn" type="button" title="Zoom in" aria-label="Zoom in topology">＋</button><button class="btn sm" id="topoFit" title="Fit topology">Fit</button><button class="btn sm" id="topoFocus" title="Center selected device">Focus</button><button class="btn sm" id="topoPorts" title="Toggle interface labels on links">Ports</button><button class="btn sm" id="topoArrange" title="Auto-arrange devices">Arrange</button></div><span class="live-indicator"><i></i> SIMULATION LIVE</span></div><div id="topoWrap"></div><div id="flows"></div><section id="term"><div id="sessionBar" class="session-bar"><div class="session-meta"><span class="session-label">DEVICE SESSIONS</span><span class="session-shortcuts">Alt + ← / → to switch</span></div><div id="sessionTabs"></div><div class="session-actions"><button class="btn sm" id="sessionPrev" type="button" title="Previous device session" aria-label="Previous device session">‹</button><button class="btn sm" id="sessionNext" type="button" title="Next device session" aria-label="Next device session">›</button><button class="btn sm" id="sessionClear" title="Clear output; keep command history">Clear output</button></div></div><div class="term-head"><b>DEVICE CONSOLE</b><span>Per-device history and output</span><button class="btn sm" id="termCopyOutput">Copy output</button><label class="term-evidence-ticket">Incident <select id="termEvidenceTicket" aria-label="Link evidence to incident"><option value="">Unlinked evidence</option></select></label><button class="btn sm" id="termSaveEvidence">Save evidence</button><button class="btn sm" id="termDownload">Download</button><button class="btn sm" id="termConfigSave">Save checkpoint</button><button class="btn sm" id="termConfigReview">Review drift</button><button class="btn sm" id="termConfigHistory">History</button><button class="btn sm" id="termConfigExport">Export archive</button><button class="btn sm" id="termHelp">Command help</button><span id="termEvidenceStatus" role="status" aria-live="polite"></span></div><pre id="tout"></pre><div class="tline"><span id="termTarget">—</span><input id="tin" autocomplete="off" placeholder="Enter a command for the selected device…"/></div></section></main>
      <aside id="config"></aside>
    </div>
      </div>
    </div>`;
  ensureBuildMenuStyles();
  mountTerminalWindow();
  // Re-mount after bfcache restore (soft refresh / back-forward) so the terminal stays floating
  window.addEventListener('pageshow', (e) => {
    ensureBuildMenuStyles();
    if (e.persisted || !$('#terminalWindow') || !$('#terminalWindow').contains($('#term'))) mountTerminalWindow();
  });
  wireTerm();
  wireEvidenceTools();
  wireConfigArchiveTools();
  wireGlobalPalette();
  $('#btnSearch').addEventListener('click',openPalette);
  window.addEventListener('popstate', () => {
    const view=workspaceViewFromUrl();
    if (view==='build') { enterBuild({historyMode:'none'}); return; }
    if (view==='workbench' && MODE==='build') { reloadMission(0,{historyMode:'none'}); return; }
    showWorkspaceView(view,{historyMode:'none'});
  });
  $('#navOverview').addEventListener('click', () => showWorkspaceView('overview'));
  $('#navWorkbench').addEventListener('click', () => { if (MODE==='build') reloadMission(0); else showWorkspaceView('workbench'); });
  $('#navIncidents').addEventListener('click', () => showWorkspaceView('incidents'));
  $('#navInfrastructure').addEventListener('click', () => showWorkspaceView('infrastructure'));
  $('#navProtocols').addEventListener('click', () => showWorkspaceView('protocols'));
  $('#navDesign').addEventListener('click', () => showWorkspaceView('design'));
  $('#navAutomation').addEventListener('click', () => showWorkspaceView('automation'));
  $('#navKnowledge').addEventListener('click', () => showWorkspaceView('knowledge'));
  $('#navJournal').addEventListener('click', () => showWorkspaceView('journal'));
  $('#navChanges').addEventListener('click', () => showWorkspaceView('changes'));
  $('#topoZoomIn').addEventListener('click', () => zoomTopology(0.8));
  $('#topoZoomOut').addEventListener('click', () => zoomTopology(1.25));
  $('#topoFit').addEventListener('click', fitTopology);
  $('#topoArrange').addEventListener('click', autoArrange);
  $('#topoFocus').addEventListener('click', focusSelectedTopology);
  $('#topoPorts').addEventListener('click', toggleTopologyPorts);
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnQueue').addEventListener('click', openTicketQueue);
  $('#termHelp').addEventListener('click', openHelp);
  $('#btnJournal').addEventListener('click', openJournal);
  $('#btnSet').addEventListener('click', openSettings);
  $('#btnStats').addEventListener('click', openStats);
  wireBuildMenu();
  $('#btnClass').addEventListener('click', openClassroom);
  document.addEventListener('pointermove', onDragMove);   // node dragging (attached once)
  document.addEventListener('pointerup', onDragUp);
  document.addEventListener('pointercancel', onDragUp);
  const initialWorkspaceView = workspaceViewFromUrl();
  if (initialWorkspaceView === 'build') enterBuild({historyMode:'replace'});
  else { reloadMission(0, { historyMode: 'none' }); showWorkspaceView(initialWorkspaceView, { historyMode: 'replace' }); }
  if (initialWorkspaceView === 'knowledge' && new URLSearchParams(window.location.search).get('dailyReview') === '1') startNetworkRecall();
  renderOverview();
  initCloud();
}
if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
