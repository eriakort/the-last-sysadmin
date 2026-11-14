(function (root) {
'use strict';
function hasBit(node, bit, runAs, user, groups) {
  if (!node) return false;
  if (runAs === 'root') return true;
  if (node.owner === runAs) return !!(node.mode & (bit << 6));
  if (Array.isArray(groups) && groups.includes(node.group)) return !!(node.mode & (bit << 3));
  return !!(node.mode & bit);
}
function parseMode(spec, cur, isDir) {
  if (typeof spec !== 'string') return null;
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let mode = cur;
  for (const clause of spec.split(',')) {
    const match = clause.match(/^([ugoa]*)([+=-])([rwxX]*)$/);
    if (!match) return null;
    let who = match[1] || 'a';
    if (who.includes('a')) who = 'ugo';
    let value = 0;
    for (const permission of match[3]) {
      value |= permission === 'r' ? 4 : permission === 'w' ? 2 : permission === 'x' ? 1 : (isDir || (cur & 0o111)) ? 1 : 0;
    }
    for (const target of new Set(who)) {
      const shift = { u: 6, g: 3, o: 0 }[target];
      const mask = 7 << shift;
      const shifted = value << shift;
      if (match[2] === '+') mode |= shifted;
      else if (match[2] === '-') mode &= ~shifted;
      else mode = (mode & ~mask) | shifted;
    }
  }
  return mode;
}
function canWrite(abs, runAs, writableRoots) {
  if (typeof abs !== 'string') return false;
  if (runAs === 'root') return abs !== '/';
  return (writableRoots || []).some(rootPath => abs.startsWith(rootPath + '/'));
}
const api = { hasBit, canWrite, parseMode };
root.LSAPermissionUtils = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
