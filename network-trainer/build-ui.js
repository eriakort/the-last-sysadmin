#!/usr/bin/env node
// Assemble net-trainer.html from the TESTED modules + the UI, with zero drift:
// each module is inlined verbatim inside a tiny CommonJS require() shim, so the
// browser runs exactly the code the Node tests cover.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const MODULES = ['net-model.js', 'net-checks.js', 'net-cli.js', 'net-mission.js', 'net-chapters.js'];
const wrap = f => `__def(${JSON.stringify('./' + f.replace(/\.js$/, ''))}, function(module, exports, require){\n${read(f)}\n});`;

const bundle = `
// ---- tiny CommonJS shim ----
var __mods = {};
function __def(id, fn){ var m = { exports: {} }; fn(m, m.exports, require); __mods[id] = m; }
function require(id){ if(!__mods[id]) throw new Error('module not found: '+id); return __mods[id].exports; }
${MODULES.map(wrap).join('\n')}
// ---- UI (runs on load) ----
${read('ui.js')}
`;

const css = `
:root{--bg:#0f141c;--panel:#161d28;--raise:#1d2634;--line:#2a3545;--ink:#e6ecf5;--muted:#8da1bd;--amber:#f2b04b;--good:#7dff9e;--bad:#ff8080;--host:#3b82f6;--switch:#8b5cf6;--router:#f2b04b;--fw:#ef4444}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
#app{display:flex;flex-direction:column;height:100vh}
#top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line);flex:none}
#top .brand{font-weight:700;font-size:15px}
#top .brand .dim{font-weight:400;font-size:12px}
.hud{display:flex;align-items:center;gap:16px;font-size:12px;color:var(--muted)}
.hud b{color:var(--ink);font-size:14px;margin-left:4px}
#cols{display:grid;grid-template-columns:320px 1fr 320px;flex:1;min-height:0}
aside{background:var(--panel);overflow:auto;padding:16px;border-left:1px solid var(--line);border-right:1px solid var(--line)}
#brief{border-left:none}
.done{color:var(--good);font-weight:600}
main{display:flex;flex-direction:column;min-width:0}
#topoWrap{flex:1;overflow:auto;padding:16px;display:flex;align-items:center;justify-content:center}
svg#topo{max-width:100%;height:auto}
.edge{stroke:#44506a;stroke-width:2}
.edge.down{stroke:var(--bad);stroke-dasharray:5 4}
.node{cursor:pointer}
.node rect{fill:var(--raise);stroke:#3a475c;stroke-width:1.5}
.node.sel rect{stroke:var(--amber);stroke-width:2.5}
.node.k-host rect{stroke:var(--host)}.node.k-switch rect{stroke:var(--switch)}.node.k-router rect{stroke:var(--router)}.node.k-fw rect{stroke:var(--fw)}
.n-id{fill:var(--ink);font-size:13px;font-weight:600}
.n-sub{fill:var(--muted);font-size:10.5px;font-family:ui-monospace,monospace}
#term{height:40%;min-height:180px;border-top:1px solid var(--line);background:#0b0f16;display:flex;flex-direction:column}
#tout{flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe}
.tline{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--line)}
.tline span{color:var(--amber);font-family:ui-monospace,monospace}
#tin{flex:1;background:transparent;border:none;color:var(--ink);font:13px ui-monospace,monospace;outline:none}
h1{font-size:20px;margin:6px 0}
.eyebrow{color:var(--amber);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.story{color:var(--muted)}
.label{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:14px 0 4px}
.label2{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:12px 0 4px}
.dim{color:var(--muted)}
.row{display:flex;gap:8px;margin-top:12px}
.btn{background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit}
.btn.primary{background:var(--amber);color:#1a1205;border-color:var(--amber);font-weight:600}
.btn.sm{padding:4px 8px;font-size:12px}
select,input{background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:5px 7px;font:inherit}
.brandbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-4px 0 12px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.brandname{font-weight:700;font-size:13px;color:var(--ink)}
.xlink{color:var(--amber);text-decoration:none;font-size:12px;font-weight:600}
.xlink:hover{text-decoration:underline}
#modal{position:fixed;inset:0;background:rgba(5,8,12,.7);display:flex;align-items:center;justify-content:center;z-index:50}
.sheet{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;width:min(420px,92vw)}
.sheet h2{margin:0 0 10px}
.themes{display:flex;flex-direction:column;gap:6px}
.tm{text-align:left;background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit}
.tm.sel{border-color:var(--amber)}
#pick{width:100%;margin-bottom:10px}
.ifrow,.rrow,.addrow{display:flex;gap:5px;align-items:center;margin:4px 0;flex-wrap:wrap;font-family:ui-monospace,monospace;font-size:12.5px}
.ifrow .ip{width:110px}.ifn{color:var(--amber);width:38px}
.up{display:flex;align-items:center;gap:3px;color:var(--muted);font-size:11px}
.rrow{color:var(--ink)}
.x{background:none;border:none;color:var(--bad);cursor:pointer;font-size:12px}
.addrow input{flex:1;min-width:70px}
#status{margin-top:12px;padding:10px;border-radius:8px;font-size:13px}
#status.ok{background:rgba(125,255,158,.1);border:1px solid var(--good);color:var(--good)}
#status.bad{background:rgba(255,128,128,.08);border:1px solid #5a3b3b;color:#ffbcbc}
#status ul{margin:6px 0 0;padding-left:18px}
:root[data-theme="amber"]{--bg:#120d02;--panel:#1a1304;--raise:#241905;--line:#3a2a08;--ink:#ffe8c2;--muted:#b89158;--amber:#ffb224}
:root[data-theme="green"]{--bg:#02100a;--panel:#061a10;--raise:#0a2417;--line:#113524;--ink:#c8ffd9;--muted:#6fae86;--amber:#7dff9e}
:root[data-theme="paper"]{--bg:#eef1f5;--panel:#ffffff;--raise:#f3f6fa;--line:#d4dae3;--ink:#1a2230;--muted:#5a6a82;--amber:#c47f12;--good:#1a9e4b;--bad:#d14343}
@media(max-width:900px){#cols{grid-template-columns:1fr}#app{height:auto}aside{max-height:none}}
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Networking Trainer — prototype</title><style>${css}</style></head>
<body><div id="app"></div><script>${bundle}</script></body></html>`;

// index.html so GitHub Pages serves it cleanly at /network-trainer/
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log(`Built index.html (${html.length} bytes).`);
