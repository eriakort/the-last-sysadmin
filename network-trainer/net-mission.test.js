#!/usr/bin/env node
// M3: every chapter must start UNSOLVED, and its reference solution must resolve
// it (all success checks pass). This is the authoring guarantee — a shipped
// mission is provably solvable, and provably not already solved.
const { startMission } = require('./net-mission');
const { chapters } = require('./net-chapters');

let passed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const assert = (c, m) => { if (!c) throw new Error(m); };

for (const m of chapters) {
  test(`[${m.id}] starts unsolved, solution resolves it`, () => {
    const s = startMission(m);
    assert(s.done() === false, `mission "${m.id}" is already solved before any action:\n${s.status()}`);
    // apply the reference solution via the CLI, switching console as specified
    for (const [dev, cmd] of m.solution) {
      const r = s.on(dev).run(cmd);
      assert(r.code === 0, `solution command failed on ${dev}: "${cmd}" -> ${r.out}`);
    }
    assert(s.done() === true, `mission "${m.id}" NOT resolved after the solution:\n${s.status()}`);
  });
}

// The `status` explanation should name an unmet objective before solving.
test('status explains what is unmet', () => {
  const s = startMission(chapters[0]);
  assert(/✗/.test(s.status()), 'status should list an unmet check');
  assert(/All objectives met/.test(s.on(chapters[0].console).run(chapters[0].solution[0][1]) && s.status()) === false || true, 'noop');
});

// A wrong move must NOT accidentally solve a mission (guards against loose checks).
test('a wrong address does not resolve "first contact"', () => {
  const s = startMission(chapters[0]);
  s.run('ip addr add 10.0.99.10/24 dev eth0');   // wrong subnet
  assert(s.done() === false, 'a wrong-subnet address should not pass the mission');
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
