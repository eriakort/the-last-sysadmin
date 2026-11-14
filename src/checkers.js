(function (root) {
'use strict';
// Pure mission checkers
// Each takes a snapshot of relevant state and returns { ok: boolean, reason?: string }
// No DOM or live game state. Easy to unit-test.

const filesystem = root.LSAFileSystem || (typeof module !== 'undefined' && module.exports ? require('./filesystem') : null);
if (!filesystem) throw new Error('LSAFileSystem must be loaded before mission checkers');
const { walk, fileExists, fileMode, fileOwner, fileSize } = filesystem;

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
  // RegExp instances with global/sticky flags retain lastIndex between calls.
  // Reset it so repeated mission checks are deterministic.
  re.lastIndex = 0;
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


const api = { walk, fileExists, fileMode, fileOwner, fileSize, checkExecutable, checkContains, checkMatches, checkOwner, checkIsDir, checkMinSize };
root.LSACheckers = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
