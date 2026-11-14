'use strict';
// Pure shell lexer (tokenizer) — roadmap Phase 2 "shell tokenization".
// Imports the SAME module the browser build bundles, so these cover the real
// quoting/escaping/word-splitting/operator/glob/invalid-syntax behavior.
const assert = require('node:assert/strict');
const { tokenize, escGlob } = require('./src/shell-lexer');

const deps = { runCapture: s => 'CAP[' + s + ']', home: '/home/rookie' };
const tok = l => tokenize(l, deps);
const words = l => tok(l).filter(t => t.t === 'w').map(t => t.v);
const kinds = l => tok(l).map(t => (t.t === 'op' ? 'op:' + t.v : 'w:' + t.v));

// --- word splitting ---
assert.deepEqual(words('echo hello world'), ['echo', 'hello', 'world'], 'splits on whitespace');
assert.deepEqual(words('  a\t b '), ['a', 'b'], 'collapses runs of spaces/tabs');
assert.deepEqual(words(''), [], 'empty line → no tokens');

// --- pipes & sequence operators ---
assert.deepEqual(kinds('a | b'), ['w:a', 'op:|', 'w:b'], 'pipe');
assert.deepEqual(kinds('a && b'), ['w:a', 'op:&&', 'w:b'], 'and-list');
assert.deepEqual(kinds('a || b'), ['w:a', 'op:||', 'w:b'], 'or-list');
assert.deepEqual(kinds('a ; b'), ['w:a', 'op:;', 'w:b'], 'sequence');

// --- redirections (all forms tokenize as single operators) ---
assert.deepEqual(tok('echo > out').filter(t => t.t === 'op').map(t => t.v), ['>'], 'truncate redirect');
assert.deepEqual(tok('echo >> out').filter(t => t.t === 'op').map(t => t.v), ['>>'], 'append redirect');
assert.deepEqual(tok('cat < in').filter(t => t.t === 'op').map(t => t.v), ['<'], 'input redirect');
assert.deepEqual(tok('x 2> err').filter(t => t.t === 'op').map(t => t.v), ['2>'], 'stderr redirect');
assert.deepEqual(tok('x 2>> err').filter(t => t.t === 'op').map(t => t.v), ['2>>'], 'stderr append');
assert.deepEqual(tok('x 2>&1').filter(t => t.t === 'op').map(t => t.v), ['2>&1'], 'stderr to stdout');

// --- single quotes: fully literal (no var/glob/escape expansion) ---
assert.deepEqual(words("echo 'a$b *?'"), ['echo', 'a$b *?'], 'single quotes are literal');
assert.equal(tok("echo '*'")[1].glob, false, 'glob chars inside single quotes are not glob');
assert.equal(tok("echo '*'")[1].pat, '\\*', 'single-quoted glob char is escaped in the match pattern');

// --- double quotes: keep spaces, expand $ into a var marker, escape recognized backslashes ---
assert.deepEqual(words('echo "a b"'), ['echo', 'a b'], 'double quotes preserve spaces as one word');
assert.equal(words('echo "x $USER y"')[1], 'x \u0002USER\u0003 y', 'double-quoted $VAR becomes a deferred marker');
assert.deepEqual(words('echo "a\\"b"'), ['echo', 'a"b'], 'escaped double-quote inside double quotes');
assert.deepEqual(words('echo "a\\\\b"'), ['echo', 'a\\b'], 'escaped backslash inside double quotes');

// --- backslash escaping (outside quotes) ---
assert.deepEqual(words('echo a\\ b'), ['echo', 'a b'], 'backslash-space joins into one word');
assert.equal(tok('echo \\*')[1].glob, false, 'escaped glob char does not set the glob flag');

// --- glob flag & match pattern ---
assert.equal(tok('ls *.txt')[1].glob, true, 'unquoted * sets the glob flag');
assert.equal(tok('ls a?b')[1].glob, true, 'unquoted ? sets the glob flag');

// --- tilde expansion uses the injected home ---
assert.deepEqual(words('ls ~'), ['ls', '/home/rookie'], 'bare ~ expands to home');
assert.deepEqual(words('ls ~/x'), ['ls', '/home/rookie/x'], '~/ expands to home');
assert.equal(words('ls a~b')[1], 'a~b', '~ only expands at word start');

// --- command substitution delegates to the injected runCapture ---
assert.deepEqual(words('echo $(id -u)'), ['echo', 'CAP[id -u]'], '$(...) calls runCapture');
assert.deepEqual(words('echo `whoami`'), ['echo', 'CAP[whoami]'], 'backticks call runCapture');

// --- comments ---
assert.deepEqual(words('echo hi # a comment'), ['echo', 'hi'], '# starts a comment at word boundary');
assert.deepEqual(words('echo a#b'), ['echo', 'a#b'], '# mid-word is literal');

// --- invalid syntax throws (unterminated quotes) ---
assert.throws(() => tok("echo 'unterminated"), /EOF/, 'unterminated single quote');
assert.throws(() => tok('echo "unterminated'), /EOF/, 'unterminated double quote');

// --- escGlob is exported and pure ---
assert.equal(escGlob('a*b?[c]'), 'a\\*b\\?\\[c\\]', 'escGlob escapes glob metacharacters');

console.log('Shell lexer (tokenizer) tests passed.');
