(function (root) {
'use strict';
function parse(toks) {
  const seq = []; let pipe = []; let cmd = { words: [], redir: [] };
  const endCmd = tokV => { if (!cmd.words.length && !cmd.redir.length) throw new Error(`syntax error near unexpected token \`${tokV}'`); pipe.push(cmd); cmd = { words: [], redir: [] }; };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'w') { cmd.words.push(t); continue; }
    if (['>', '>>', '<', '<<', '2>', '2>>'].includes(t.v)) {
      const nx = toks[k + 1];
      if (!nx || nx.t !== 'w') throw new Error(`syntax error near unexpected token \`${nx ? nx.v : 'newline'}'`);
      cmd.redir.push(t.v === '<<' ? { op: t.v, target: nx.v, quoted: !!nx.quoted } : { op: t.v, target: nx.v }); k++; continue;
    }
    if (t.v === '2>&1') { cmd.redir.push({ op: '2>&1' }); continue; }
    if (t.v === '&') throw new Error('background jobs (&) are not part of this game yet');
    if (t.v === '|') { endCmd('|'); continue; }
    endCmd(t.v); seq.push({ pipe, op: t.v }); pipe = [];
  }
  if (cmd.words.length || cmd.redir.length) { pipe.push(cmd); seq.push({ pipe, op: null }); }
  else if (pipe.length) throw new Error("syntax error near unexpected token `newline'");
  return seq;
}
const api = { parse };
root.LSAShellParser = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
