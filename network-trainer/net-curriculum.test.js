#!/usr/bin/env node
// Phase 2: the curriculum tier layer is well-formed and fully covers the mission
// set. These are authoring guarantees — a mis-mapped or orphaned mission, or a
// broken capstone reference, fails CI rather than silently shipping.
const { chapters, TIERS, tierOf, missionsInTier } = require('./net-chapters');

let passed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const assert = (c, m) => { if (!c) throw new Error(m); };

// Five tiers, strictly ordered 1..5 with unique ids.
test('tiers are ordered 1..N with unique ids and required fields', () => {
  assert(TIERS.length >= 1, 'expected at least one tier');
  const ids = new Set();
  TIERS.forEach((t, i) => {
    assert(t.id && !ids.has(t.id), `tier ${i} has a missing or duplicate id`);
    ids.add(t.id);
    assert(t.order === i + 1, `tier "${t.id}" order ${t.order} is out of sequence (expected ${i + 1})`);
    assert(typeof t.name === 'string' && t.name.length > 0, `tier "${t.id}" needs a name`);
    assert(typeof t.blurb === 'string' && t.blurb.length > 0, `tier "${t.id}" needs a blurb`);
    assert(Array.isArray(t.chapters) && t.chapters.length > 0, `tier "${t.id}" needs chapters`);
    assert(typeof t.capstone === 'string' && t.capstone.length > 0, `tier "${t.id}" needs a capstone`);
  });
});

// Every mission maps to exactly one tier, and carries tier + competency fields.
test('every mission belongs to exactly one tier and is tagged', () => {
  for (const m of chapters) {
    const tid = tierOf(m);
    assert(tid, `mission "${m.id}" (chapter "${m.chapter}") is not mapped to any tier`);
    assert(m.tier === tid, `mission "${m.id}" tier field "${m.tier}" disagrees with tierOf "${tid}"`);
    assert(m.competency === m.chapter, `mission "${m.id}" competency should mirror its chapter`);
    const owning = TIERS.filter(t => t.chapters.includes(m.chapter));
    assert(owning.length === 1, `chapter "${m.chapter}" is claimed by ${owning.length} tiers (want exactly 1)`);
  }
});

// No tier is empty; the tier mission counts sum to the whole mission set.
test('tiers partition the mission set with no empty tier', () => {
  let sum = 0;
  for (const t of TIERS) {
    const ms = missionsInTier(t.id);
    assert(ms.length > 0, `tier "${t.id}" has no missions`);
    sum += ms.length;
  }
  assert(sum === chapters.length, `tier missions sum to ${sum}, but there are ${chapters.length} missions`);
});

// Every capstone is a real mission that lives in the tier that names it.
test('every capstone exists and lives in its own tier', () => {
  for (const t of TIERS) {
    const cap = chapters.find(m => m.id === t.capstone);
    assert(cap, `tier "${t.id}" capstone "${t.capstone}" is not a real mission`);
    assert(cap.tier === t.id, `tier "${t.id}" capstone "${t.capstone}" lives in ${cap.tier}, not ${t.id}`);
  }
});

// The four cross-track integrated cases are the top tier's capstones.
test('all cross-track integrated cases sit in the final tier', () => {
  const last = TIERS[TIERS.length - 1];
  const cross = chapters.filter(m => /^cross-track-/.test(m.id));
  assert(cross.length === 4, `expected 4 cross-track cases, found ${cross.length}`);
  for (const m of cross) assert(m.tier === last.id, `cross-track mission "${m.id}" should be in the final tier ${last.id}, not ${m.tier}`);
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
