'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('src/game.html', 'utf8');
const start = html.indexOf('function syncRecordDeletion(');
const end = html.indexOf('async function syncPull()', start);
assert.notEqual(start, -1, 'sync merge helpers should exist in the app');
assert.notEqual(end, -1, 'sync merge helpers should end before syncPull');
const helpers = html.slice(start, end);
const context = {};
vm.runInNewContext(helpers + '\nthis.mergeProgressStates = mergeProgressStates; this.syncMergeTombstones = syncMergeTombstones; this.syncApplyTombstones = syncApplyTombstones; this.syncRecordDeletion = syncRecordDeletion;', context);

const dir = (children, mtime = 1) => ({ type: 'dir', children, mtime });
const file = (content, mtime) => ({ type: 'file', content, mtime });
const state = (overrides = {}) => ({
  v: 1, fs: dir({ home: dir({}) }), done: [], learned: [], history: [],
  readM: [], cmdsM: [], nudged: [], times: [], hints: {}, xp: 0,
  mission: 0, finished: false, cwd: '/home', ...overrides
});

{
  const local = state({ done: ['ticket-a'], xp: 10, mission: 1 });
  const remote = state({ done: ['ticket-b'], xp: 20, mission: 2 });
  const merged = context.mergeProgressStates(local, remote);
  assert.deepEqual(Array.from(merged.done).sort(), ['ticket-a', 'ticket-b']);
  assert.equal(merged.xp, 20);
  assert.equal(merged.mission, 2);
}

{
  const local = state({ fs: dir({ home: dir({ 'local.txt': file('local', 10) }) }) });
  const remote = state({ fs: dir({ home: dir({ 'remote.txt': file('remote', 12) }) }) });
  const merged = context.mergeProgressStates(local, remote);
  assert.equal(merged.fs.children.home.children['local.txt'].content, 'local');
  assert.equal(merged.fs.children.home.children['remote.txt'].content, 'remote');
}

{
  const local = state({ fs: dir({ home: dir({ note: file('older local', 10) }) }) });
  const remote = state({ fs: dir({ home: dir({ note: file('newer remote', 20) }) }) });
  const merged = context.mergeProgressStates(local, remote);
  assert.equal(merged.fs.children.home.children.note.content, 'newer remote');
}

{
  const local = state({
    done: ['same', 'local'], learned: ['concept-a'], xp: 50,
    times: [{ mission: 1, ms: 1000 }], hints: { one: 1 },
    syncUpdatedAt: '2026-11-07T10:00:00.000Z'
  });
  const remote = state({
    done: ['same', 'remote'], learned: ['concept-b'], xp: 40,
    times: [{ mission: 1, ms: 1000 }, { mission: 2, ms: 2000 }],
    hints: { two: 2 }, finished: true,
    syncUpdatedAt: '2026-11-07T09:00:00.000Z'
  });
  const merged = context.mergeProgressStates(local, remote);
  assert.deepEqual(Array.from(merged.done).sort(), ['local', 'remote', 'same']);
  assert.deepEqual(Array.from(merged.learned).sort(), ['concept-a', 'concept-b']);
  assert.equal(merged.times.length, 2, 'duplicate timing records should be removed');
  assert.deepEqual({ ...merged.hints }, { one: 1, two: 2 });
  assert.equal(merged.xp, 50);
  assert.equal(merged.finished, true);
}

{
  const local = state({ cwd: '/home/local', syncUpdatedAt: '2026-11-07T10:00:00.000Z' });
  const remote = state({ cwd: '/home/remote', syncUpdatedAt: '2026-11-07T11:00:00.000Z' });
  const merged = context.mergeProgressStates(local, remote);
  assert.equal(merged.cwd, '/home/remote', 'the newest snapshot should supply non-monotonic settings');
}

{
  const merged = context.syncMergeTombstones(
    [{ path: '/home/a.txt', deletedAt: '2026-11-07T10:00:00Z' }],
    [
      { path: '/home/a.txt', deletedAt: '2026-11-07T10:01:00Z' },
      { path: '/home/b.txt', deletedAt: '2026-11-07T10:02:00Z' }
    ]
  );
  assert.equal(merged.length, 2, 'tombstones should be deduplicated by path');
  assert.equal(merged.find(item => item.path === '/home/a.txt').deletedAt, '2026-11-07T10:01:00Z');
}

{
  const local = state({ syncTombstones: [{ path: '/home/a.txt', deletedAt: '2026-11-07T10:00:00Z' }] });
  const remote = state({ syncTombstones: [{ path: '/home/b.txt', deletedAt: '2026-11-07T10:01:00Z' }] });
  const merged = context.mergeProgressStates(local, remote);
  assert.deepEqual(
    Array.from(merged.syncTombstones, item => item.path).sort(),
    ['/home/a.txt', '/home/b.txt'],
    'progress merge should retain tombstones from both devices'
  );
}

{
  const tombstones = [{ path: '/home/deleted.txt', deletedAt: '2026-11-07T10:00:00Z' }];
  const staleTree = dir({ home: dir({
    'deleted.txt': file('stale', Date.parse('2026-11-07T09:00:00Z')),
    'new.txt': file('new', Date.parse('2026-11-07T11:00:00Z'))
  }) });
  const filtered = context.syncApplyTombstones(staleTree, '/', tombstones);
  assert.equal(filtered.children.home.children['deleted.txt'], undefined, 'a stale local file must not return after server merge');
  assert.equal(filtered.children.home.children['new.txt'].content, 'new', 'unrelated newer files must survive');
}

{
  const tombstones = [{ path: '/home/recreated.txt', deletedAt: '2026-11-07T10:00:00Z' }];
  const tree = dir({ home: dir({ 'recreated.txt': file('new copy', Date.parse('2026-11-07T10:01:00Z')) }) });
  const filtered = context.syncApplyTombstones(tree, '/', tombstones);
  assert.equal(filtered.children.home.children['recreated.txt'].content, 'new copy', 'a newer recreation must survive');
}

{
  context.S = state();
  context.norm = path => path;
  context.syncRecordDeletion('/home/archive', dir({
    'one.txt': file('one', 1),
    nested: dir({ 'two.txt': file('two', 2) })
  }));
  assert.deepEqual(
    Array.from(context.S.syncTombstones, item => item.path).sort(),
    ['/home/archive', '/home/archive/nested', '/home/archive/nested/two.txt', '/home/archive/one.txt'].sort(),
    'recursive directory deletion should record every path'
  );
}

console.log('Progress sync merge tests passed.');
