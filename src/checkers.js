// Pure mission checkers
// Each takes a snapshot of relevant state and returns { ok: boolean, reason?: string }
// No DOM or live game state. Easy to unit-test.

function walk(fs, path) {
  const parts = path.split('/').filter(Boolean);
  let n = fs;
  for (const p of parts) {
    if (!n || n.type !== 'dir' || !n.children || !n.children[p]) return null;
    n = n.children[p];
  }
  return n;
}

function fileExists(fs, path) {
  return !!walk(fs, path);
}

function fileMode(fs, path) {
  const n = walk(fs, path);
  return n && n.mode != null ? n.mode : null;
}

function fileOwner(fs, path) {
  const n = walk(fs, path);
  return n ? n.owner : null;
}

function fileSize(fs, path) {
  const n = walk(fs, path);
  if (!n || n.type !== 'file') return null;
  return n.content ? String(n.content).length : (n.size || 0);
}

// File must exist and be executable by owner
function checkExecutable(fs, path) {
  const mode = fileMode(fs, path);
  if (mode == null) return { ok: false, reason: 'file missing' };
  if (!(mode & 0o100)) return { ok: false, reason: 'not executable' };
  return { ok: true };
}

// Content contains a string
function checkContains(fs, path, needle) {
  const n = walk(fs, path);
  if (!n) return { ok: false, reason: 'file missing' };
  if (n.type !== 'file') return { ok: false, reason: 'not a file' };
  if (String(n.content || '').includes(needle)) return { ok: true };
  return { ok: false, reason: 'content mismatch' };
}

// Content matches a regex
function checkMatches(fs, path, re) {
  const n = walk(fs, path);
  if (!n) return { ok: false, reason: 'file missing' };
  if (n.type !== 'file') return { ok: false, reason: 'not a file' };
  if (re.test(String(n.content || ''))) return { ok: true };
  return { ok: false, reason: 'regex mismatch' };
}

// Owner matches
function checkOwner(fs, path, owner) {
  const o = fileOwner(fs, path);
  if (o == null) return { ok: false, reason: 'file missing' };
  if (o === owner) return { ok: true };
  return { ok: false, reason: `owner is ${o}, expected ${owner}` };
}

// Is a directory
function checkIsDir(fs, path) {
  const n = walk(fs, path);
  if (!n) return { ok: false, reason: 'missing' };
  if (n.type === 'dir') return { ok: true };
  return { ok: false, reason: 'not a directory' };
}

// Size at least N bytes
function checkMinSize(fs, path, min) {
  const sz = fileSize(fs, path);
  if (sz == null) return { ok: false, reason: 'missing or not a file' };
  if (sz >= min) return { ok: true };
  return { ok: false, reason: `size ${sz} < ${min}` };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    walk, fileExists, fileMode, fileOwner, fileSize,
    checkExecutable, checkContains, checkMatches,
    checkOwner, checkIsDir, checkMinSize
  };
}
