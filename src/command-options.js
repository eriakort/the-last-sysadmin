(function (root) {
'use strict';
function parseOptions(args, allowed, valued, cmd) {
  const flags = {}, rest = [];
  for (let k = 0; k < args.length; k++) {
    const arg = args[k];
    if (arg === '--') { rest.push(...args.slice(k + 1)); break; }
    if (arg.startsWith('--') && arg.length > 2) throw new Error(`unrecognized option '${arg}'\\nTry 'man ${cmd}' for the options this game supports.`);
    if (arg.length > 1 && arg[0] === '-') {
      for (let j = 1; j < arg.length; j++) {
        const letter = arg[j];
        if (valued.includes(letter)) {
          let value = arg.slice(j + 1);
          if (value === '') value = args[++k];
          if (value === undefined) throw new Error(`option requires an argument -- '${letter}'`);
          flags[letter] = value;
          break;
        }
        if (!allowed.includes(letter)) throw new Error(`invalid option -- '${letter}'\\nTry 'man ${cmd}' for the options this game supports.`);
        flags[letter] = true;
      }
      continue;
    }
    rest.push(arg);
  }
  return { f: flags, rest };
}
const api = { parseOptions };
root.LSACommandOptions = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
