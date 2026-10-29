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

// Export for Node testing (ignored in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pad, esc, md, reEsc, splitLines, mulberry32, ticketId };
}
