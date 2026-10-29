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

// Human-readable size (pure)
function human(n) {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G', 'T']; let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < 3);
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + u[i];
}

// Export for Node testing (ignored in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pad, esc, md, reEsc, splitLines, mulberry32, ticketId, norm, permStr, human };
}
