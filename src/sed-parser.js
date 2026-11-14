(function (root) {
'use strict';
function create(dependencies) {
  const buildRe = dependencies && dependencies.buildRe;
  const readDelim = dependencies && dependencies.readDelim;
  const splitLines = dependencies && dependencies.splitLines;
  if (typeof splitLines !== 'function') throw new TypeError('sed parser requires splitLines function');
  if (typeof buildRe !== 'function' || typeof readDelim !== 'function') {
    throw new TypeError('sed parser requires buildRe and readDelim functions');
  }
  function sedRep(r) {
    let o = '';
    for (let i = 0; i < r.length; i++) {
      const c = r[i];
      if (c === '\\') {
        const n = r[++i];
        if (n === undefined) o += '\\';
        else if (/\d/.test(n)) o += '$' + n;
        else if (n === 'n') o += '\n';
        else if (n === 't') o += '\t';
        else if (n === '$') o += '$$';
        else o += n;
      } else if (c === '&') o += '$&';
      else if (c === '$') o += '$$';
      else o += c;
    }
    return o;
  }
  function parseSed(s, ere) {
    const cmds = []; let i = 0;
    const fail = msg => { throw new Error('-e expression #1, char ' + (i + 1) + ': ' + msg); };
    while (i < s.length) {
      while (i < s.length && /[\s;]/.test(s[i])) i++;
      if (i >= s.length) break;
      let addr = null;
      if (/\d/.test(s[i])) { let j = i; while (/\d/.test(s[j] || '')) j++; addr = { n: +s.slice(i, j) }; i = j; }
      else if (s[i] === '$') { addr = { last: true }; i++; }
      else if (s[i] === '/') { const [body, ni] = readDelim(s, i + 1, '/'); if (ni < 0) fail('unterminated address regex'); addr = { re: buildRe(body, { ere }) }; i = ni; }
      const c = s[i];
      if (c === 'd' || c === 'p') { cmds.push({ addr, cmd: c }); i++; }
      else if (c === 's') {
        const d = s[i + 1];
        if (!d) fail("unterminated \`s' command");
        const [pat, i2] = readDelim(s, i + 2, d); if (i2 < 0) fail("unterminated \`s' command");
        const [rep, i3] = readDelim(s, i2, d); if (i3 < 0) fail("unterminated \`s' command");
        let j = i3, fl = '';
        while (j < s.length && /[gipI]/.test(s[j])) fl += s[j++];
        i = j;
        const icase = /[iI]/.test(fl);
        cmds.push({ addr, cmd: 's', re: buildRe(pat, { ere, icase, global: fl.includes('g') }), test: buildRe(pat, { ere, icase }), rep: sedRep(rep), p: fl.includes('p') });
      }
      else fail(c === undefined ? 'missing command' : 'unknown command: ' + String.fromCharCode(96) + c + "' (this game supports s, d and p)");
    }
    return cmds;
  }
  function runSed(program, content, options = {}) {
    const lines = splitLines(content), output = [];
    lines.forEach((line, index) => {
      const last = index === lines.length - 1;
      let current = line, deleted = false;
      for (const command of program) {
        const address = command.addr;
        const matches = !address || (address.n !== undefined
          ? index + 1 === address.n
          : address.last ? last : address.re.test(current));
        if (!matches) continue;
        if (command.cmd === 'd') { deleted = true; break; }
        if (command.cmd === 'p') output.push(current);
        if (command.cmd === 's') {
          const hit = command.test.test(current);
          current = current.replace(command.re, command.rep);
          if (command.p && hit) output.push(current);
        }
      }
      if (!deleted && !options.quiet) output.push(current);
    });
    return output.length ? output.join('\n') + '\n' : '';
  }
  return { sedRep, parseSed, runSed };
}
const api = { create };
root.LSASedParser = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
