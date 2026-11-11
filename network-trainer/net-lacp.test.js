#!/usr/bin/env node
// Breadth · LACP / EtherChannel link aggregation: bundling two parallel switch
// links into one logical link means neither member is STP-blocked (the win over
// two independent links, where STP blocks one), there is no loop, and the bundle
// survives the loss of any single member.
const M = require('./net-model'); const { ip } = M;
const iface = (a, p) => ({ ip: ip(a), mask: p, up: true });

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

function mk(bundle) {
  const cg = bundle ? 1 : undefined;
  return { devices: {
    h1: { id: 'h1', kind: 'host', ifaces: { eth0: iface('10.0.0.10', 24) }, routes: [] },
    h2: { id: 'h2', kind: 'host', ifaces: { eth0: iface('10.0.0.20', 24) }, routes: [] },
    sw1: { id: 'sw1', kind: 'switch', stpPriority: 4096, ifaces: { p1: { up: true }, p3: { up: true, channelGroup: cg }, p4: { up: true, channelGroup: cg } } },
    sw2: { id: 'sw2', kind: 'switch', ifaces: { p1: { up: true }, p3: { up: true, channelGroup: cg }, p4: { up: true, channelGroup: cg } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw1', 'p1'], up: true }, { a: ['h2', 'eth0'], b: ['sw2', 'p1'], up: true },
    { a: ['sw1', 'p3'], b: ['sw2', 'p3'], up: true }, { a: ['sw1', 'p4'], b: ['sw2', 'p4'], up: true }
  ] };
}
const reach = n => M.ping(n, 'h1', ip('10.0.0.20')).ok;
const blocked = n => { const s = M.spanningTree(n, 1).switches, out = []; for (const sw of ['sw1', 'sw2']) for (const [p, st] of Object.entries(s[sw].ports)) if (st.state === 'blocking') out.push(sw + '/' + p); return out; };

test('without a bundle, STP blocks one of the two parallel links', () => {
  const n = mk(false);
  assert(reach(n) === true, 'should still be connected via STP');
  assert(blocked(n).length === 1, 'STP should block exactly one port (the redundant link): ' + blocked(n).join(','));
});
test('bundling the links blocks no member and stays connected', () => {
  const n = mk(true);
  assert(reach(n) === true, 'bundle should be connected');
  assert(blocked(n).length === 0, 'no member port should be STP-blocked: ' + blocked(n).join(','));
});
test('the bundle reports up with one active member link', () => {
  const s = M.etherChannelStatus(mk(true), 'sw1', 1);
  assert(s && s.up === true && s.bundled === 2, 'bundle should be up with 2 members');
  assert(s.members.filter(m => m.active).length === 1, 'exactly one member link should be active/forwarding');
});
test('the bundle survives the loss of its active member', () => {
  const n = mk(true);
  const active = M.etherChannelStatus(n, 'sw1', 1).members.find(m => m.active).port;
  n.devices.sw1.ifaces[active].up = false;
  assert(M.etherChannelStatus(n, 'sw1', 1).up === true, 'bundle should stay up after losing a member');
  assert(reach(n) === true, 'still connected after member loss');
});
test('the bundle is down and disconnected only when all members fail', () => {
  const n = mk(true);
  n.devices.sw1.ifaces.p3.up = false; n.devices.sw1.ifaces.p4.up = false;
  assert(M.etherChannelStatus(n, 'sw1', 1).up === false, 'bundle should be down with no live members');
  assert(reach(n) === false, 'no inter-switch path when every member is down');
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
