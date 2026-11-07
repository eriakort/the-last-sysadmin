'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('src/game.html', 'utf8');
const start = html.indexOf('function syncMergeNode(');
const end = html.indexOf('async function syncPull()', start);
assert.notEqual(start, -1, 'sync merge helpers should exist in the app');
assert.notEqual(end, -1, 'sync merge helpers should end before syncPull');
const helpers = html.slice(start, end);
const context = {};
vm.runInNewContext(helpers + '\nthis.mergeProgressStates = mergeProgressStates;', context);

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
  const local = state({ fs: dir({ home: dir({ local.txt: file('local', 10) }) }) });
  const remote = state({ fs: dir({ home: dir({ remote.txt: file('remote', 12) }) }) });
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

console.log('Progress sync merge tests passed.');
