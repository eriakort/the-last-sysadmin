(function (root) {
'use strict';
function hasBit(node, bit, runAs, user, groups) {
  if (!node) return false;
  if (runAs === 'root') return true;
  if (node.owner === user) return !!(node.mode & (bit << 6));
  if (Array.isArray(groups) && groups.includes(node.group)) return !!(node.mode & (bit << 3));
  return !!(node.mode & bit);
}
function canWrite(abs, runAs, writableRoots) {
  if (typeof abs !== 'string') return false;
  if (runAs === 'root') return abs !== '/';
  return (writableRoots || []).some(rootPath => abs.startsWith(rootPath + '/'));
}
const api = { hasBit, canWrite };
root.LSAPermissionUtils = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
