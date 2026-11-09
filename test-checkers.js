const assert = require('assert');
const c = require('./src/checkers');

const fs = {
  type: 'dir', children: {
    etc: { type: 'dir', mode: 0o755, owner: 'root', children: {
      app: { type: 'dir', mode: 0o750, owner: 'admin', children: {
        'run.sh': { type: 'file', mode: 0o750, owner: 'admin', content: '#!/bin/sh\necho ready\n' },
        'empty.txt': { type: 'file', mode: 0o640, owner: 'admin', content: '' },
        'small.txt': { type: 'file', mode: 0o640, owner: 'root', content: 'abc' },
        'sized.bin': { type: 'file', mode: 0o600, owner: 'root', size: 12 }
      } }
    } }
  }
};

assert.strictEqual(c.walk(fs, '/etc/app/run.sh').type, 'file');
assert.strictEqual(c.walk(fs, 'etc/app').type, 'dir');
assert.strictEqual(c.walk(fs, '/etc/missing'), null);
assert.strictEqual(c.walk(fs, '/etc/app/run.sh/nope'), null);
assert.strictEqual(c.fileExists(fs, '/etc/app/run.sh'), true);
assert.strictEqual(c.fileExists(fs, '/etc/missing'), false);
assert.strictEqual(c.fileMode(fs, '/etc/app/run.sh'), 0o750);
assert.strictEqual(c.fileMode(fs, '/missing'), null);
assert.strictEqual(c.fileOwner(fs, '/etc/app/run.sh'), 'admin');
assert.strictEqual(c.fileOwner(fs, '/missing'), null);
assert.strictEqual(c.fileSize(fs, '/etc/app/run.sh'), 21);
assert.strictEqual(c.fileSize(fs, '/etc/app/empty.txt'), 0);
assert.strictEqual(c.fileSize(fs, '/etc/app/sized.bin'), 12);
assert.strictEqual(c.fileSize(fs, '/etc/app'), null);

assert.deepStrictEqual(c.checkExecutable(fs, '/etc/app/run.sh'), { ok: true });
assert.deepStrictEqual(c.checkExecutable(fs, '/etc/app/small.txt'), { ok: false, reason: 'not executable' });
assert.deepStrictEqual(c.checkExecutable(fs, '/missing'), { ok: false, reason: 'file missing' });
assert.deepStrictEqual(c.checkContains(fs, '/etc/app/run.sh', 'echo ready'), { ok: true });
assert.deepStrictEqual(c.checkContains(fs, '/etc/app/run.sh', 'not present'), { ok: false, reason: 'content mismatch' });
assert.deepStrictEqual(c.checkContains(fs, '/etc/app', 'x'), { ok: false, reason: 'not a file' });
assert.deepStrictEqual(c.checkContains(fs, '/missing', 'x'), { ok: false, reason: 'file missing' });

const globalPattern = /ready/g;
assert.deepStrictEqual(c.checkMatches(fs, '/etc/app/run.sh', globalPattern), { ok: true });
assert.deepStrictEqual(c.checkMatches(fs, '/etc/app/run.sh', globalPattern), { ok: true }, 'global regex checks must be repeatable');
assert.deepStrictEqual(c.checkMatches(fs, '/etc/app/run.sh', /absent/), { ok: false, reason: 'regex mismatch' });
assert.deepStrictEqual(c.checkMatches(fs, '/etc/app', /x/), { ok: false, reason: 'not a file' });
assert.deepStrictEqual(c.checkMatches(fs, '/missing', /x/), { ok: false, reason: 'file missing' });

assert.deepStrictEqual(c.checkOwner(fs, '/etc/app/run.sh', 'admin'), { ok: true });
assert.deepStrictEqual(c.checkOwner(fs, '/etc/app/run.sh', 'root'), { ok: false, reason: 'owner is admin, expected root' });
assert.deepStrictEqual(c.checkOwner(fs, '/missing', 'root'), { ok: false, reason: 'file missing' });
assert.deepStrictEqual(c.checkIsDir(fs, '/etc/app'), { ok: true });
assert.deepStrictEqual(c.checkIsDir(fs, '/etc/app/run.sh'), { ok: false, reason: 'not a directory' });
assert.deepStrictEqual(c.checkIsDir(fs, '/missing'), { ok: false, reason: 'missing' });
assert.deepStrictEqual(c.checkMinSize(fs, '/etc/app/run.sh', 10), { ok: true });
assert.deepStrictEqual(c.checkMinSize(fs, '/etc/app/run.sh', 100), { ok: false, reason: 'size 21 < 100' });
assert.deepStrictEqual(c.checkMinSize(fs, '/etc/app/sized.bin', 12), { ok: true });
assert.deepStrictEqual(c.checkMinSize(fs, '/etc/app', 1), { ok: false, reason: 'missing or not a file' });
assert.deepStrictEqual(c.checkMinSize(fs, '/missing', 1), { ok: false, reason: 'missing or not a file' });

console.log('MISSION CHECKERS TEST OK');
