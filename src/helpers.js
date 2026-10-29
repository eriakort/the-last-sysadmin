// Pure helpers extracted from index.html
// These have no DOM or game-state dependencies and can be unit-tested in isolation.
// A future build step can concatenate this file (plus others) back into a single index.html.

const pad = (n, w = 2) => String(n).padStart(w, '0');

const esc = s => String(s).replace(/[&<>"]/g, c => ({
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"'
}[c]));

const md = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

const splitLines = s => {
  if (!s) return [];
  const t = s.endsWith('\n') ? s.slice(0, -1) : s;
  return t.split('\n');
};

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const ticketId = i => `INC-1025-${pad(i + 1)}`;

// Path normalization (pure — needs HOME and cwd passed in)
function norm(path, cwd, HOME) {
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
  const parts = (path.startsWith('/') ? path : cwd + '/' + path).split('/');
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return '/' + out.join('/');
}

const basename = p => p.split('/').filter(Boolean).pop() || '/';
const dirname = p => {
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
};
const parentOf = dirname;

// Permission string (pure)
function permStr(n) {
  const m = n.mode, b = 'rwxrwxrwx';
  let s = n.type === 'dir' ? 'd' : '-';
  for (let i = 0; i < 9; i++) s += (m & (1 << (8 - i))) ? b[i] : '-';
  if (m & 0o4000) s = s.slice(0, 3) + ((m & 0o100) ? 's' : 'S') + s.slice(4);
  if (m & 0o2000) s = s.slice(0, 6) + ((m & 0o010) ? 's' : 'S') + s.slice(7);
  if (m & 0o1000) s = s.slice(0, 9) + ((m & 0o001) ? 't' : 'T') + s.slice(10);
  return s;
}

// Simple permission bit checks (owner bits)
const canRead = m => !!(m & 0o400);
const canWrite = m => !!(m & 0o200);
const canExec = m => !!(m & 0o100);

// Human-readable size (pure)
function human(n) {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G', 'T']; let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < 3);
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u[i];
}

// Date helpers (pure — pass MON array)
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function lsDate(ms) {
  const d = new Date(ms);
  const recent = Math.abs(Date.now() - ms) < 182 * 864e5;
  return `${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${recent ? pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : ' ' + d.getUTCFullYear()}`;
}
function fmtLogTime(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Export for Node testing (ignored in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pad, esc, md, reEsc, splitLines, mulberry32, ticketId,
    norm, basename, dirname, parentOf,
    permStr, canRead, canWrite, canExec,
    human, lsDate, fmtLogTime, MON
  };
}
