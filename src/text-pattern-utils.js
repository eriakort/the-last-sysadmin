(function (root) {
'use strict';
function breToJs(pattern) {
  let result = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      const next = pattern[++i];
      if (next === undefined) result += '\\\\';
      else if ('+?|(){}'.includes(next)) result += next;
      else if (next === '<' || next === '>') result += '\\b';
      else result += '\\' + next;
    } else if ('+?|(){}'.includes(char)) result += '\\' + char;
    else result += char;
  }
  return result;
}
function readDelim(source, index, delimiter) {
  let output = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '\\' && index + 1 < source.length) {
      if (source[index + 1] === delimiter) { output += delimiter; index += 2; continue; }
      output += char + source[index + 1]; index += 2; continue;
    }
    if (char === delimiter) return [output, index + 1];
    output += char; index++;
  }
  return [output, -1];
}
const api = { breToJs, readDelim };
root.LSATextPatternUtils = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
