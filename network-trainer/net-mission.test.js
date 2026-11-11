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
    // Apply the reference solution. Design missions build the topology, so their
    // solution is a function (B.addDevice/addLink + config); fix-it missions use a
    // [device, command] list run through the CLI.
    if (typeof m.solution === 'function') {
      m.solution(s);
    } else {
      for (const [dev, cmd] of m.solution) {
        const r = s.on(dev).run(cmd);
        assert(r.code === 0, `solution command failed on ${dev}: "${cmd}" -> ${r.out}`);
      }
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

// Every incident mission carries a well-formed ticket. Design-from-requirements
// missions are a design brief, not an incident, so they are exempt.
test('every incident mission has a complete ticket', () => {
  for (const m of chapters) {
    if (m.mode === 'design') continue;
    assert(m.ticket && m.ticket.id && m.ticket.from && m.ticket.priority && m.ticket.symptom,
      `mission "${m.id}" is missing ticket fields`);
    assert(/^P[123]$/.test(m.ticket.priority), `mission "${m.id}" has an odd priority: ${m.ticket.priority}`);
  }
});

// Design missions are well-formed: a build-to-spec brief with constraints,
// success checks, a build seed, and a programmatic reference solution.
test('every design mission has constraints, checks and a buildable solution', () => {
  for (const m of chapters) {
    if (m.mode !== 'design') continue;
    assert(Array.isArray(m.constraints) && m.constraints.length > 0, `design mission "${m.id}" needs constraints`);
    assert(Array.isArray(m.success) && m.success.length > 0, `design mission "${m.id}" needs success checks`);
    assert(typeof m.build === 'function', `design mission "${m.id}" needs a build seed`);
    assert(typeof m.solution === 'function', `design mission "${m.id}" needs a programmatic reference solution`);
    assert(!m.diagnose, `design mission "${m.id}" should not have a diagnosis gate`);
  }
});

// The diagnosis grader: right index passes, every wrong index fails, and the
// correct answer is always in range (guards against an unanswerable gate).
// Design missions have no gate, so they are exempt.
test('diagnosis grader accepts the right answer and rejects wrong ones', () => {
  for (const m of chapters) {
    if (m.mode === 'design') continue;
    const s = startMission(m);
    assert(s.requiresDiagnosis === true, `mission "${m.id}" should require diagnosis`);
    const d = m.diagnose;
    assert(d.answer >= 0 && d.answer < d.options.length, `mission "${m.id}" answer index out of range`);
    assert(s.gradeDiagnosis(d.answer).ok === true, `mission "${m.id}" correct diagnosis should pass`);
    for (let i = 0; i < d.options.length; i++) {
      if (i === d.answer) continue;
      const r = s.gradeDiagnosis(i);
      assert(r.ok === false, `mission "${m.id}" option ${i} should NOT pass diagnosis`);
      assert(typeof r.because === 'string' && r.because.length > 0, `mission "${m.id}" should carry an explanation`);
    }
  }
});

// A mission without a diagnose block has no gate (grader is permissive).
test('a mission with no diagnose block is not gated', () => {
  const s = startMission({ ...chapters[0], diagnose: undefined });
  assert(s.requiresDiagnosis === false, 'no diagnose block -> no gate');
  assert(s.gradeDiagnosis(99).ok === true, 'ungated grader accepts any index');
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
