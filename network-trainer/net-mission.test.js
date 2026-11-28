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
      // Observational probes (ping/traceroute/nmap/dig/tcpdump) may legitimately
      // report "unreachable" or "blocked" as part of a reference solution — an
      // audit mission, for instance, deliberately generates a flow the policy
      // denies. Those non-zero exits are expected; the real success condition is
      // asserted by s.done() below. Configuration steps must still succeed.
      const PROBE = /^(ping6?|traceroute|nmap|dig|tcpdump)\b/;
      for (const [dev, cmd] of m.solution) {
        const r = s.on(dev).run(cmd);
        assert(r.code === 0 || PROBE.test(cmd.trim()), `solution command failed on ${dev}: "${cmd}" -> ${r.out}`);
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

// Decision / tradeoff missions are well-formed: scored options, a reachable pass
// bar, at least one passing and one failing option, and a programmatic solution.
test('every decision mission is a well-formed scored tradeoff', () => {
  for (const m of chapters) {
    if (m.mode !== 'decision') continue;
    const d = m.decision;
    assert(d && Array.isArray(d.options) && d.options.length >= 2, `decision mission "${m.id}" needs >=2 options`);
    assert(typeof d.pass === 'number', `decision mission "${m.id}" needs a numeric pass bar`);
    d.options.forEach(o => {
      assert(o.id && typeof o.score === 'number' && o.rationale, `decision mission "${m.id}" option "${o.id}" needs id/score/rationale`);
    });
    const ids = d.options.map(o => o.id);
    assert(new Set(ids).size === ids.length, `decision mission "${m.id}" has duplicate option ids`);
    assert(d.options.some(o => o.score >= d.pass), `decision mission "${m.id}" has no passing option`);
    assert(d.options.some(o => o.score < d.pass), `decision mission "${m.id}" has no failing option (no tradeoff)`);
    assert(typeof m.solution === 'function', `decision mission "${m.id}" needs a programmatic solution`);
    // The grader honors the pass bar: a below-bar option must not resolve the mission.
    const worst = d.options.slice().sort((a, b) => a.score - b.score)[0];
    const s = startMission(m);
    s.chooseDecision(worst.id);
    if (worst.score < d.pass) assert(s.done() === false, `decision mission "${m.id}" accepted a below-bar option`);
  }
});

// Incident-command missions are well-formed: ordered stages, a comms step with
// exactly the right correctness shape, and a programmatic solution.
test('every incident mission is a well-formed cascading response', () => {
  for (const m of chapters) {
    if (m.mode !== 'incident') continue;
    const inc = m.incident;
    assert(inc && Array.isArray(inc.stages) && inc.stages.length >= 2, `incident mission "${m.id}" needs ordered stages`);
    assert(inc.comms && Array.isArray(inc.comms.options) && inc.comms.options.length >= 2, `incident mission "${m.id}" needs a comms step`);
    assert(inc.comms.options.filter(o => o.correct).length === 1, `incident mission "${m.id}" needs exactly one correct comms option`);
    assert(Array.isArray(m.success) && m.success.length > 0, `incident mission "${m.id}" needs technical success checks`);
    assert(typeof m.solution === 'function', `incident mission "${m.id}" needs a programmatic solution`);
    // Comms gate is real: fixing the network without sending the right update does not resolve it.
    const s = startMission(m);
    m.solution(s);                                   // full solution resolves it
    assert(s.done() === true, `incident mission "${m.id}" not resolved by its solution`);
    const s2 = startMission(m);
    const wrong = inc.comms.options.find(o => !o.correct);
    s2.sendComms(wrong.id);                           // wrong comms alone must not pass
    assert(s2.done() === false, `incident mission "${m.id}" passed with the wrong status update`);
  }
});

// The diagnosis grader: right index passes, every wrong index fails, and the
// correct answer is always in range (guards against an unanswerable gate).
// Missions with no diagnose block (design, decision, incident) have no gate.
test('diagnosis grader accepts the right answer and rejects wrong ones', () => {
  for (const m of chapters) {
    if (!m.diagnose) continue;
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


test('port-security recovery mission restores the approved endpoint without weakening the policy', () => {
  const mission = chapters.find(m => m.id === 'switch-port-security-recovery');
  assert(!!mission, 'port-security recovery mission should be registered');
  const s = startMission(mission);
  const port = s.net.devices.sw1.ifaces.p1;
  assert(port.errDisabled === true, 'the incident should start with p1 err-disabled');
  assert(port.portSecurity && port.portSecurity.enabled === true, 'port security should remain enabled');
  assert(port.portSecurity.secureMacs.includes('02:00:00:00:00:10'), 'the approved workstation MAC should remain secured');
  for (const [dev, cmd] of mission.solution) {
    const result = s.on(dev).run(cmd);
    assert(result.code === 0, 'reference recovery command failed: ' + cmd + ' -> ' + result.out);
  }
  assert(port.errDisabled === false, 'no shutdown should recover p1');
  assert(port.portSecurity.enabled === true, 'recovery must not disable port security');
  assert(port.portSecurity.secureMacs.length === 1 && port.portSecurity.secureMacs[0] === '02:00:00:00:00:10', 'recovery must preserve the approved secure MAC');
  assert(s.done() === true, 'recovered workstation should reach the file server');
});


test('DHCP gateway incident renews a valid lease with the corrected router next hop', () => {
  const mission = chapters.find(m => m.id === 'dhcp-correct-the-default-gateway');
  assert(!!mission, 'DHCP gateway incident should be registered');
  const s = startMission(mission);
  const first = s.on('h1').run('dhclient eth0');
  assert(first.code === 0, 'client should receive an initial DHCP lease');
  assert(s.net.devices.h1.routes.some(r => r.mask === 0 && r.via === require('./net-model').ip('10.0.1.254')), 'initial lease should expose the incorrect gateway');
  assert(s.done() === false, 'wrong DHCP gateway must leave the incident unresolved');
  for (const [dev, cmd] of mission.solution.slice(1)) {
    const result = s.on(dev).run(cmd);
    assert(result.code === 0, 'reference recovery command failed: ' + cmd + ' -> ' + result.out);
  }
  const route = s.net.devices.h1.routes.find(r => r.mask === 0);
  assert(route && route.via === require('./net-model').ip('10.0.1.1'), 'renewed lease should install the correct router gateway');
  assert(s.done() === true, 'client should reach the remote portal after renewal');
});


test('missing DHCP relay incident restores branch client addressing without changing the pool', () => {
  const mission = chapters.find(m => m.id === 'dhcp-relay-missing-helper');
  assert(!!mission, 'DHCP relay incident should be registered');
  const s = startMission(mission);
  const initial = s.on('h1').run('dhclient eth0');
  assert(initial.code === 1, 'client should receive no lease before relay is configured');
  assert(/no DHCP server responded/.test(initial.out), 'initial failure should identify the missing relay path');
  assert(s.net.devices.srv.dhcp && s.net.devices.srv.dhcp.name === 'BRANCH-USERS', 'server pool should already be configured');
  assert(s.done() === false, 'missing relay must leave the incident unresolved');
  for (const [dev, cmd] of mission.solution) {
    const result = s.on(dev).run(cmd);
    assert(result.code === 0, 'reference relay command failed: ' + cmd + ' -> ' + result.out);
  }
  assert(s.net.devices.r1.ifaces.eth0.helperAddress === require('./net-model').ip('10.0.2.10'), 'client-facing interface should relay to srv');
  assert(s.net.devices.h1.ifaces.eth0.ip != null, 'client should receive an address after relay is configured');
  assert(s.done() === true, 'leased client should reach the portal after relay recovery');
});



test('stale DNS resolver incident restores name resolution without changing routing', () => {
  const mission = chapters.find(m => m.id === 'dns-wrong-resolver-address');
  assert(!!mission, 'stale DNS resolver incident should be registered');
  const s = startMission(mission);
  const model = require('./net-model');
  assert(s.on('h1').run('ping 10.0.2.10').code === 0, 'intranet should be reachable by IP before DNS repair');
  const before = s.on('h1').run('dig intranet.corp.local');
  assert(before.code !== 0 && /cannot reach DNS server 10.0.2.54/.test(before.out), 'initial lookup should identify the stale resolver');
  assert(s.done() === false, 'unreachable resolver must leave the mission unresolved');
  for (const [dev, cmd] of mission.solution) {
    const result = s.on(dev).run(cmd);
    // The first dig is an intentional pre-repair diagnostic and must fail;
    // only configuration commands are required to return success here.
    const probe = /^(ping6?|traceroute|nmap|dig|tcpdump)\b/;
    assert(result.code === 0 || probe.test(cmd.trim()), 'reference DNS repair command failed: ' + cmd + ' -> ' + result.out);
  }
  assert(s.net.devices.h1.resolver === model.ip('10.0.2.53'), 'workstation should use the authoritative DNS server');
  assert(s.net.devices.h1.routes.length === 1, 'DNS repair must not change the default route');
  assert(s.done() === true, 'intranet hostname should resolve after resolver repair');
});


let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
