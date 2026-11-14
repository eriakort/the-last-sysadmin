(function (root) {
'use strict';
function splitStatements(content) {
  const out = [];
  for (const raw of content.split('\n')) {
    let cur = '', q = null;
    const flush = () => { const t = cur.trim(); if (t) out.push(t); cur = ''; };
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) break;
      if (c === ';') { flush(); continue; }
      cur += c;
    }
    flush();
  }
  return out;
}
function findCloser(stmts, start, end) {
  let depth = 0;
  for (let j = start; j < end; j++) {
    const statement = stmts[j];
    if (/^(for|while|if)\b/.test(statement)) depth++;
    if (/^(done|fi)\b/.test(statement)) { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function findElse(stmts, start, fiIdx) {
  let depth = 0;
  for (let j = start; j < fiIdx; j++) {
    const statement = stmts[j];
    if (/^(for|while|if)\b/.test(statement)) depth++;
    else if (/^(done|fi)\b/.test(statement)) depth--;
    else if (depth === 0 && (statement === 'else' || statement.startsWith('else ') || statement.startsWith('elif '))) return j;
  }
  return -1;
}
const api = { splitStatements, findCloser, findElse };
root.LSAShellScriptParser = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
