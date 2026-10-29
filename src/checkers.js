// Pure mission checkers
// Each takes a snapshot of relevant state and returns { ok: boolean, reason?: string }
// No DOM or live game state. Easy to unit-test.

function fileExists(fs, path) {
  // Simple walk — assumes fs is the root node with children
  const parts = path.split('/').filter(Boolean);
  let n = fs;
  for (const p of parts) {
    if (!n || n.type !== 'dir' || !n.children || !n.children[p]) return false;
    n = n.children[p];
  }
  return !!n;
}

function fileMode(fs, path) {
  const parts = path.split('/').filter(Boolean);
  let n = fs;
  for (const p of parts) {
    if (!n || n.type !== 'dir' || !n.children || !n.children[p]) return null;
    n = n.children[p];
  }
  return n && n.mode != null ? n.mode : null;
}

// Example checker: file must exist and be executable by owner
function checkExecutable(fs, path) {
  const mode = fileMode(fs, path);
  if (mode == null) return { ok: false, reason: 'file missing' };
  if (!(mode & 0o100)) return { ok: false, reason: 'not executable' };
  return { ok: true };
}

// Example checker: content contains a string
function checkContains(fs, path, needle) {
  const parts = path.split('/').filter(Boolean);
  let n = fs;
  for (const p of parts) {
    if (!n || n.type !== 'dir' || !n.children || !n.children[p]) return { ok: false, reason: 'file missing' };
    n = n.children[p];
  }
  if (!n || n.type !== 'file') return { ok: false, reason: 'not a file' };
  if (String(n.content || '').includes(needle)) return { ok: true };
  return { ok: false, reason: 'content mismatch' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fileExists, fileMode, checkExecutable, checkContains };
}
