#!/usr/bin/env node
// Assemble net-trainer.html from the TESTED modules + the UI, with zero drift:
// each module is inlined verbatim inside a tiny CommonJS require() shim, so the
// browser runs exactly the code the Node tests cover.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const MODULES = ['net-model.js', 'net-checks.js', 'net-cli.js', 'net-mission.js', 'net-chapters.js', 'net-builder.js', 'net-scenario.js', 'net-classroom.js'];
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
:root{--bg:#081318;--panel:#0e1f25;--raise:#152b32;--line:#213c44;--ink:#dcf3f6;--muted:#7ba7ae;--amber:#22d3ee;--good:#6ee7b7;--bad:#fb7185;--host:#38bdf8;--switch:#a78bfa;--router:#22d3ee;--fw:#fb7185}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
#app{display:flex;flex-direction:column;height:100vh}
#top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--line);flex:none}
.apphdr{display:flex;align-items:center;gap:22px}
.brand{display:flex;align-items:center;gap:10px}
.brand .name{font-weight:800;letter-spacing:.05em;font-size:17px;line-height:1.15;text-transform:uppercase;white-space:nowrap}
.brand .sub{color:var(--muted);font-size:12px;line-height:1.25;letter-spacing:0;text-transform:none;font-weight:400;white-space:nowrap}
.mark{width:24px;height:18px;border:1.5px solid var(--muted);border-radius:4px;position:relative;flex:none}
.mark::after{content:"";position:absolute;right:4px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:var(--amber)}
.apptabs{display:flex;gap:4px}
.apptab{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:7px;color:var(--muted);font-size:13.5px;font-weight:600;text-decoration:none;border:1px solid transparent}
.apptab:hover{color:var(--ink)}
.apptab.on{color:var(--ink);border-color:var(--line);border-bottom:2px solid var(--amber)}
.apptab svg{width:17px;height:17px}
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
.node{cursor:pointer;color:var(--muted)}
.node .ico{color:var(--muted)}
.node.k-host,.node.k-host .ico{color:var(--host)}
.node.k-server,.node.k-server .ico{color:var(--host)}
.node.k-switch,.node.k-switch .ico{color:var(--switch)}
.node.k-router,.node.k-router .ico{color:var(--router)}
.node.k-firewall,.node.k-fw,.node.k-firewall .ico,.node.k-fw .ico{color:var(--fw)}
.node.sel .ico{color:var(--amber);filter:drop-shadow(0 0 4px var(--amber))}
.node .n-id{fill:var(--ink);font-size:12px;font-weight:600}
.node .n-sub{fill:var(--muted);font-size:10px}
.n-id{fill:var(--ink);font-size:13px;font-weight:600}
.n-sub{fill:var(--muted);font-size:10.5px;font-family:ui-monospace,monospace}
#flows{flex:none;max-height:132px;overflow:auto;border-top:1px solid var(--line);background:#0c161c;font-size:12px}
.fl-h{padding:4px 12px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;font-size:10px}
.fl-empty{padding:6px 12px;color:var(--muted)}
.fl-row{display:grid;grid-template-columns:70px 1fr 1.4fr 70px;gap:8px;padding:3px 12px;border-top:1px solid var(--line)}
.fl-row.ok .fl-st{color:var(--good)}
.fl-row.bad .fl-st{color:var(--bad)}
.fl-proto{color:var(--amber);font-weight:600}
.fl-path{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.ticket{background:var(--raise);border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:8px;padding:10px 12px;margin:10px 0 4px}
.tk-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tk-id{font-family:ui-monospace,monospace;font-size:11.5px;letter-spacing:.06em;color:var(--muted);font-weight:600}
.tk-pri{font-size:10.5px;font-weight:700;letter-spacing:.06em;padding:1px 7px;border-radius:999px;border:1px solid var(--line)}
.tk-pri.tk-p1{color:#fff;background:var(--bad);border-color:var(--bad)}
.tk-pri.tk-p2{color:var(--amber);border-color:var(--amber)}
.tk-pri.tk-p3{color:var(--muted)}
.tk-from{font-size:11.5px;color:var(--muted);margin-top:4px}
.tk-sym{margin-top:6px;font-size:13px;line-height:1.5;color:var(--ink);font-style:italic}
.diag-q{font-size:13.5px;line-height:1.5;margin:4px 0 10px}
.diag-opts{display:flex;flex-direction:column;gap:6px}
.rev-list{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.rev-row{display:flex;gap:8px;align-items:flex-start;font-size:13px}
.diag-opt{text-align:left;background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:9px 11px;cursor:pointer;font:inherit;line-height:1.4;transition:border-color .12s}
.diag-opt:hover{border-color:var(--amber)}
.diag-opt.wrong{border-color:var(--bad);opacity:.6}
.diag-fb{margin-top:8px;font-size:12.5px;min-height:0}
.diag-fb.bad{color:#ffbcbc}
.diag-tip{font-size:11.5px;margin-top:10px}
.diag-done{background:rgba(110,231,183,.08);border:1px solid var(--good);border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.5;color:var(--ink);margin:10px 0 4px}
.builder{border:1px solid var(--amber);border-radius:8px;padding:8px 10px;margin:0 0 12px;background:rgba(34,211,238,.04)}
.pal-row{display:flex;gap:5px;flex-wrap:wrap;margin:5px 0;align-items:center}
.btn.pal{background:var(--raise)}
.wire-on{font-size:11.5px;color:var(--amber)}
.wide{width:100%;box-sizing:border-box;background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:6px 8px;font:inherit;margin-top:2px}
textarea.wide{resize:vertical;font-family:inherit}
.canvas-empty{padding:48px 16px;text-align:center;color:var(--muted);font-size:13px}
.cx-body{max-height:60vh;overflow:auto}
.rlabel{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:12px 0 6px}
.cx-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;margin:4px 0;font-size:13px}
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
.sheet{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;width:min(420px,92vw);max-height:85vh;overflow:auto}
.sheet h2{margin:0 0 10px}
.themes{display:flex;flex-direction:column;gap:6px}
.tm{text-align:left;background:var(--raise);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit}
.tm.sel{border-color:var(--amber)}
table.stats{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
table.stats th{text-align:left;color:var(--muted);font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;padding:4px 6px;border-bottom:1px solid var(--line)}
table.stats td{padding:5px 6px;border-bottom:1px solid var(--line)}
.finale{margin-top:8px;padding:8px 10px;border:1px solid var(--good);border-radius:8px;color:var(--ink)}
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
:root[data-theme="halcyon"]{--bg:#0f141c;--panel:#161d28;--raise:#1d2634;--line:#2a3545;--ink:#e6ecf5;--muted:#8da1bd;--amber:#f2b04b;--good:#7dff9e;--bad:#ff8080;--host:#3b82f6;--switch:#8b5cf6;--router:#f2b04b;--fw:#ef4444}
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
