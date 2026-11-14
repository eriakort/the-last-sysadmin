(function (root) {
'use strict';
function parentOf(abs) {
  if (typeof abs !== 'string' || !abs.startsWith('/')) throw new TypeError('Expected an absolute path');
  const i = abs.lastIndexOf('/');
  return i <= 0 ? '/' : abs.slice(0, i);
}
function baseName(abs) {
  if (typeof abs !== 'string' || !abs.startsWith('/')) throw new TypeError('Expected an absolute path');
  return abs === '/' ? '/' : abs.slice(abs.lastIndexOf('/') + 1);
}
function joinAbs(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.startsWith('/') || b.startsWith('/')) throw new TypeError('Expected an absolute base and relative child');
  return a === '/' ? '/' + b : a + '/' + b;
}
const api = { parentOf, baseName, joinAbs };
root.LSAPathUtils = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
