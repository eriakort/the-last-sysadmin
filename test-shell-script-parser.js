'use strict';
const assert = require('node:assert/strict');
const { splitStatements, findCloser, findElse } = require('./src/shell-script-parser');

assert.deepEqual(splitStatements('echo one; echo two'), ['echo one', 'echo two']);
assert.deepEqual(splitStatements('echo "one;two"; echo three'), ['echo "one;two"', 'echo three']);
assert.deepEqual(splitStatements("echo 'one;two' # trailing comment\necho four"), ["echo 'one;two'", 'echo four']);
assert.deepEqual(splitStatements('  ; echo one ;;\n# comment only\necho two'), ['echo one', 'echo two']);
assert.deepEqual(splitStatements('echo foo#bar'), ['echo foo#bar']);

const nested = ['if true', 'for x in a', 'echo "$x"', 'done', 'else', 'echo no', 'fi'];
assert.equal(findCloser(nested, 0, nested.length), 6);
assert.equal(findCloser(nested, 1, nested.length), 3);
assert.equal(findCloser(['while true', 'if false', 'fi'], 0, 3), -1);
assert.equal(findElse(nested, 1, 6), 4);
assert.equal(findElse(nested, 2, 6), -1);
assert.equal(findElse(['if a', 'if b', 'else', 'fi', 'elif c', 'fi'], 1, 5), 4);
console.log('Bash script parser tests passed.');
