'use strict';
// Mission content module (roadmap Phase 3 — mission data separated from the app
// runtime). Imports the SAME module the browser build bundles. build(deps) injects
// every runtime dependency: stable helpers/constants plus live accessors for the two
// mutable pieces of game state the grading closures read (state() -> S,
// masteryPassed() -> learningMasteryPassed).
const assert = require('node:assert/strict');
const { build } = require('./src/missions');

const noop = () => {};
const stubFs = (...a) => ({ type: 'node', a });
const deps = {
  APPLOG: 'log', BAD_IP: '203.0.113.77', BASH_COUNT: 3, ERR_COUNT: 2, EVIDENCE: 'ev',
  LAST_TIME: '03:47:12', SYNC: '#!/bin/bash\n', HOME: '/home/rookie', USER: 'rookie',
  P: { quar: '/quar' }, splitLines: s => String(s).split('\n'),
  D: stubFs, F: stubFs, allParts: () => [], editEtc: noop, anyFileWith: () => false,
  coresLeft: () => 0, fileContent: () => null, findSync: () => null,
  getNode: () => null, grEntries: () => '', isDir: () => false, pwEntries: () => '',
  walkAll: () => [], state: () => ({}), masteryPassed: () => false,
};

const { CHAPTERS, MISSIONS } = build(deps);

assert.ok(Array.isArray(CHAPTERS) && CHAPTERS.length > 0, 'CHAPTERS is a non-empty array');
assert.ok(Array.isArray(MISSIONS) && MISSIONS.length > 0, 'MISSIONS is a non-empty array');
assert.equal(CHAPTERS.length, 35, 'expected 35 chapters');
assert.equal(MISSIONS.length, 183, 'expected 183 missions');

// Chapter outros are applied inside the module (the CHAPTERS[n].outro = ... phase moved with the data).
for (const c of CHAPTERS) assert.ok(c.label && c.name, 'chapter has label + name');
assert.ok(CHAPTERS.every(c => typeof c.outro === 'string' && c.outro.length), 'every chapter has its outro applied');

for (const m of MISSIONS) {
  assert.ok(m.id && m.title, 'mission has id + title: ' + JSON.stringify(Object.keys(m)));
  assert.equal(typeof m.ch, 'number', 'mission ' + m.id + ' has a numeric chapter');
  assert.ok(typeof m.check === 'function' || m.answer != null, 'mission ' + m.id + ' has a check() or answer');
  assert.ok(CHAPTERS[m.ch], 'mission ' + m.id + ' references chapter ' + m.ch);
}

// Mission ids: exactly one pre-existing duplicate ('handover' in two chapters),
// carried verbatim; still catches any *new* duplicate.
const ids = MISSIONS.map(m => m.id);
assert.equal(ids.length - new Set(ids).size, 1, 'only the known pre-existing id duplicate remains');

// build() is a repeatable factory
const again = build(deps);
assert.equal(again.MISSIONS.length, MISSIONS.length, 'build() is repeatable');
assert.notStrictEqual(again.MISSIONS, MISSIONS, 'build() returns a fresh array each call');

console.log('Mission content module tests passed (' + CHAPTERS.length + ' chapters, ' + MISSIONS.length + ' missions).');
