(function (root) {
'use strict';
function hasGlob(seg) { return /(^|[^\\])[*?[]/.test(seg); }
function unesc(seg) { return seg.replace(/\\(.)/g, '$1'); }
function segRe(seg, icase) {
  let r = '^';
  const escapeRegex = ch => /[|\\{}()[\]^$+*?.]/.test(ch) ? '\\' + ch : ch;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === '\\') r += escapeRegex(seg[++i] ?? '');
    else if (ch === '*') r += '.*';
    else if (ch === '?') r += '.';
    else if (ch === '[') {
      const j = seg.indexOf(']', i + 2);
      if (j < 0) r += '\\[';
      else { let cls = seg.slice(i + 1, j); if (cls[0] === '!') cls = '^' + cls.slice(1); r += '[' + cls.replace(/\\/g, '\\\\') + ']'; i = j; }
    } else r += escapeRegex(ch);
  }
  return new RegExp(r + '$', icase ? 'i' : '');
}
const api = { hasGlob, unesc, segRe };
root.LSAGlobPattern = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
