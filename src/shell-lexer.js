(function (root) {
'use strict';
// Pure shell lexer (tokenizer): quoting, escaping, word-splitting, operators,
// redirection, globs, variable/command-substitution markers. Extracted verbatim
// from the runtime so the browser build and the Node tests run the same code
// (roadmap Phase 2 — shell tokenization). Command substitution ($(...) and
// backticks) and the home directory for ~ are the only runtime couplings; they
// are injected via deps ({ runCapture, home }) so this module stays pure.
const escGlob = s => s.replace(/[*?[\]\\]/g, '\\$&');
function tokenize(line, deps) {
  const runCapture = deps && deps.runCapture;
  const home = deps && deps.home;
  const toks = []; let i = 0, cur = null;
  const start = () => { if (!cur) cur = { v: '', pat: '', glob: false, quoted: false }; };
  const push = () => { if (cur) { toks.push({ t: 'w', ...cur }); cur = null; } };
  const expandVar = () => {
    if (line[i + 1] === '(') { let depth = 0, j = i + 1; for (; j < line.length; j++) { if (line[j] === '(') depth++; else if (line[j] === ')') { depth--; if (depth === 0) break; } } const inner = line.slice(i + 2, j); i = j + 1; return runCapture(inner); }
    if (line[i + 1] === '{') { const j = line.indexOf('}', i); if (j > 0) { const nm = line.slice(i + 2, j); i = j + 1; return '\u0002' + nm + '\u0003'; } }
    const m = line.slice(i + 1).match(/^(?:[A-Za-z_][A-Za-z0-9_]*|\d+|[?#@*])/);
    if (m) { i += 1 + m[0].length; return '\u0002' + m[0] + '\u0003'; }
    i++; return '$';
  };
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if ('|;&<>'.includes(c)) {
      const two = line.slice(i, i + 2);
      let op = c, adv = 1;
      if (c === '>' && cur && cur.v === '2' && !cur.quoted) {
        cur = null;
        if (line.slice(i, i + 3) === '>&1') { op = '2>&1'; adv = 3; }
        else if (two === '>>') { op = '2>>'; adv = 2; }
        else { op = '2>'; adv = 1; }
      } else {
        push();
        if (two === '||' || two === '&&' || two === '>>' || two === '<<') { op = two; adv = 2; }
      }
      toks.push({ t: 'op', v: op }); i += adv; continue;
    }
    if (c === "'") {
      start(); cur.quoted = true;
      const j = line.indexOf("'", i + 1);
      if (j < 0) throw new Error("unexpected EOF while looking for matching `''");
      const s = line.slice(i + 1, j); cur.v += s; cur.pat += escGlob(s); i = j + 1; continue;
    }
    if (c === '"') {
      start(); cur.quoted = true; i++; let s = '';
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && '"\\$`'.includes(line[i + 1])) { s += line[i + 1]; i += 2; }
        else if (line[i] === '$') s += expandVar();
        else { s += line[i]; i++; }
      }
      if (i >= line.length) throw new Error('unexpected EOF while looking for matching `"\'');
      i++; cur.v += s; cur.pat += escGlob(s); continue;
    }
    if (c === '\\') { start(); const n = line[i + 1] ?? ''; cur.v += n; cur.pat += escGlob(n); cur.quoted = cur.quoted || n === ''; i += 2; continue; }
    if (c === '$') { start(); const s = expandVar(); cur.v += s; cur.pat += escGlob(s); continue; }
    if (c === '~' && !cur && (i + 1 >= line.length || ' /\t;|'.includes(line[i + 1]))) { start(); cur.v += home; cur.pat += escGlob(home); i++; continue; }
    if (c === '`') { start(); const j = line.indexOf('`', i + 1); const inner = j < 0 ? line.slice(i + 1) : line.slice(i + 1, j); const out = runCapture(inner); cur.v += out; cur.pat += escGlob(out); i = j < 0 ? line.length : j + 1; continue; }
    if (c === '#' && !cur) break;
    start(); cur.v += c; cur.pat += c; if ('*?['.includes(c)) cur.glob = true; i++;
  }
  push();
  return toks;
}
const api = { tokenize, escGlob };
root.LSAShellLexer = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
