#!/usr/bin/env node
// Builder ops + scenario format: the authoring foundation. Proves, headlessly,
// the full loop — author a build-from-scratch scenario, serialize it, then build
// the topology to its spec and have the grader accept it.
const B = require('./net-builder');
const S = require('./net-scenario');
const { startMission } = require('./net-mission');

let passed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const assert = (c, m) => { if (!c) throw new Error(m); };

/* ---- builder ops ---- */
test('addDevice gives unique ids and correct device shapes', () => {
  const t = B.blank();
  const a = B.addDevice(t, 'host'), b = B.addDevice(t, 'host');
  assert(a !== b, 'ids are unique');
  assert(t.devices[a].kind === 'host', 'host kind');
  const r = B.addDevice(t, 'router');
  assert(Object.keys(t.devices[r].ifaces).length === 2, 'router starts with 2 interfaces');
  const s = B.addDevice(t, 'server');
  assert(t.devices[s].services && t.devices[s].kind === 'host', 'server is a host with services');
});
test('addLink uses free ports and grows switch capacity past its defaults', () => {
  const t = B.blank();
  B.addDevice(t, 'switch', 'sw1');
  ['h1', 'h2', 'h3', 'h4', 'h5'].forEach(h => B.addDevice(t, 'host', h));
  ['h1', 'h2', 'h3', 'h4', 'h5'].forEach(h => B.addLink(t, h, 'sw1'));
  assert(t.links.length === 5, 'five links wired');
  assert(Object.keys(t.devices.sw1.ifaces).length >= 5, 'switch grew to fit a 5th port');
});
test('a port cannot be double-used, and self-links are refused', () => {
  const t = B.blank();
  B.addDevice(t, 'host', 'h1'); B.addDevice(t, 'router', 'r1');
  B.addLink(t, 'h1', 'r1', 'eth0', 'eth0');
  let threw = false; try { B.addLink(t, 'h1', 'r1', 'eth0', 'eth1'); } catch (e) { threw = true; }
  assert(threw, 'reusing h1/eth0 is refused');
  threw = false; try { B.addLink(t, 'r1', 'r1'); } catch (e) { threw = true; }
  assert(threw, 'a self-link is refused');
});
test('removeDevice also drops links that touched it', () => {
  const t = B.blank();
  B.addDevice(t, 'host', 'h1'); B.addDevice(t, 'switch', 'sw1'); B.addLink(t, 'h1', 'sw1');
  B.removeDevice(t, 'h1');
  assert(!t.devices.h1, 'device removed');
  assert(t.links.length === 0, 'its link removed');
});

/* ---- scenario validation ---- */
test('validate flags a dangling link and a missing check field', () => {
  const bad = {
    title: 'x',
    start: { devices: { h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } } } }, links: [{ a: ['h1', 'eth0'], b: ['nope', 'eth0'], up: true }] },
    success: [{ type: 'reachable', a: 'h1' }]      // missing b
  };
  const v = S.validate(bad);
  assert(!v.ok, 'invalid');
  assert(v.errors.some(e => /missing device/.test(e)), 'flags the dangling link');
  assert(v.errors.some(e => /needs "b"/.test(e)), 'flags the missing check field');
});

/* ---- the whole loop ---- */
test('a build-from-scratch scenario is authorable, serializable, and solvable', () => {
  const scn = {
    id: 'connect-the-floor', title: 'Connect the floor', mode: 'build',
    objective: 'Put h1 and h2 on 10.0.1.0/24 and connect them so they can reach each other.',
    start: { devices: {
        h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] },
        h2: { id: 'h2', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] }
      }, links: [] },
    success: [
      { type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' },
      { type: 'subnet_correct', dev: 'h2', iface: 'eth0', cidr: '10.0.1.0/24' },
      { type: 'reachable', a: 'h1', b: 'h2' }
    ]
  };
  assert(S.validate(scn).ok, 'scenario validates');
  const scn2 = S.fromJSON(S.toJSON(scn));                 // survives a JSON round-trip
  assert(scn2.title === scn.title, 'round-trips through JSON');

  const run = startMission(S.toMission(scn2));
  assert(run.done() === false, 'starts unsolved — nothing built yet');
  // the student builds to the spec:
  B.addDevice(run.net, 'switch', 'sw1');
  B.addLink(run.net, 'h1', 'sw1');
  B.addLink(run.net, 'h2', 'sw1');
  B.setAddress(run.net, 'h1', 'eth0', '10.0.1.10', 24);
  B.setAddress(run.net, 'h2', 'eth0', '10.0.1.20', 24);
  assert(run.done() === true, 'grader accepts the built network:\n' + run.status());
});

test('hand-placed node positions survive fromTopology and toMission', () => {
  const topo = { devices: { h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } } } }, links: [], pos: { h1: [123, 45] } };
  const start = S.fromTopology(topo);
  assert(start.pos && start.pos.h1[0] === 123, 'fromTopology keeps positions');
  const m = S.toMission({ title: 't', start, success: [{ type: 'reachable', a: 'h1', b: 'h1' }] });
  const net = m.build();
  assert(net.pos && net.pos.h1[1] === 45, 'build() carries positions into the played net');
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
