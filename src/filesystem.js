(function (root) {
'use strict';

// Canonical pure virtual-filesystem traversal and metadata access.
function walk(fs, path) {
  if (!fs || typeof path !== 'string') return null;
  const parts = path.split('/').filter(Boolean);
  let node = fs;
  for (const part of parts) {
    if (!node || node.type !== 'dir' || !node.children || !Object.prototype.hasOwnProperty.call(node.children, part)) return null;
    node = node.children[part];
  }
  return node || null;
}
const fileExists = (fs, path) => !!walk(fs, path);
function fileMode(fs, path) {
  const node = walk(fs, path);
  return node && node.mode != null ? node.mode : null;
}
function fileOwner(fs, path) {
  const node = walk(fs, path);
  return node ? node.owner : null;
}
function fileGroup(fs, path) {
  const node = walk(fs, path);
  return node ? node.group : null;
}
function fileSize(fs, path) {
  const node = walk(fs, path);
  if (!node || node.type !== 'file') return null;
  return node.content ? String(node.content).length : (node.size || 0);
}
const api = { walk, fileExists, fileMode, fileOwner, fileGroup, fileSize };
root.LSAFileSystem = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
