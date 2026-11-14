const assert = require('assert');
const fsCore = require('./src/filesystem');
const tree = { type: 'dir', owner: 'root', group: 'root', mode: 0o755, children: {
  etc: { type: 'dir', owner: 'root', group: 'root', mode: 0o755, children: {
    app: { type: 'dir', owner: 'admin', group: 'ops', mode: 0o750, children: {
      'run.sh': { type: 'file', owner: 'admin', group: 'ops', mode: 0o750, content: '#!/bin/sh\necho ready\n' },
      empty: { type: 'file', owner: 'root', group: 'root', mode: 0o600, content: '' },
      sized: { type: 'file', owner: 'root', group: 'root', mode: 0o600, size: 42 }
    } }
  } }
} };
assert.strictEqual(fsCore.walk(tree, '/').type, 'dir');
assert.strictEqual(fsCore.walk(tree, '/etc/app/run.sh').type, 'file');
assert.strictEqual(fsCore.walk(tree, 'etc/app').type, 'dir');
assert.strictEqual(fsCore.walk(tree, '/etc/missing'), null);
assert.strictEqual(fsCore.walk(tree, '/etc/app/run.sh/nope'), null);
assert.strictEqual(fsCore.walk(tree, '/etc/__proto__'), null);
assert.strictEqual(fsCore.walk(null, '/etc'), null);
assert.strictEqual(fsCore.walk(tree, null), null);
assert.strictEqual(fsCore.fileExists(tree, '/etc/app/run.sh'), true);
assert.strictEqual(fsCore.fileExists(tree, '/etc/missing'), false);
assert.strictEqual(fsCore.fileMode(tree, '/etc/app/run.sh'), 0o750);
assert.strictEqual(fsCore.fileMode(tree, '/missing'), null);
assert.strictEqual(fsCore.fileOwner(tree, '/etc/app/run.sh'), 'admin');
assert.strictEqual(fsCore.fileOwner(tree, '/missing'), null);
assert.strictEqual(fsCore.fileGroup(tree, '/etc/app/run.sh'), 'ops');
assert.strictEqual(fsCore.fileGroup(tree, '/missing'), null);
assert.strictEqual(fsCore.fileSize(tree, '/etc/app/run.sh'), 21);
assert.strictEqual(fsCore.fileSize(tree, '/etc/app/empty'), 0);
assert.strictEqual(fsCore.fileSize(tree, '/etc/app/sized'), 42);
assert.strictEqual(fsCore.fileSize(tree, '/etc/app'), null);
console.log('VIRTUAL FILESYSTEM CORE TEST OK');
