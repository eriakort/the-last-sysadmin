#!/usr/bin/env node
// Breadth · IPv6 dual-stack basics: 128-bit address parsing/formatting (with ::
// compression), prefix math, and a parallel forwarding path that delivers over
// directly-connected subnets and static routes and checks the return path.
const M = require('./net-model');

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

test('parses and canonically formats IPv6, including :: compression', () => {
  const cases = [['2001:db8::1', '2001:db8::1'], ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'], ['::1', '::1'], ['fe80::', 'fe80::'], ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1']];
  for (const [s, canon] of cases) { const n = M.ip6(s); assert(n != null, `failed to parse ${s}`); assert(M.ip6Str(n) === canon, `${s} -> ${M.ip6Str(n)} (want ${canon})`); }
});
test('rejects malformed IPv6 literals', () => {
  for (const bad of ['xyz', '2001:db8:::1', '2001:db8:1', 'gggg::1', '']) assert(M.ip6(bad) === null, `should reject ${JSON.stringify(bad)}`);
});
test('prefix math compares the right network bits', () => {
  assert(M.sameNet6(M.ip6('2001:db8:1::10'), M.ip6('2001:db8:1::1'), 64) === true, 'same /64 should match');
  assert(M.sameNet6(M.ip6('2001:db8:1::10'), M.ip6('2001:db8:2::1'), 64) === false, 'different /64 should not match');
  assert(M.sameNet6(M.ip6('2001:db8:1::10'), M.ip6('2001:db8:1:8000::'), 49) === false, '/49 split should differ');
});

function iface(a, p) { return { ip6: a, mask6: p, up: true }; }
function net() {
  return { devices: {
    h1: { id: 'h1', kind: 'host', ifaces: { eth0: iface('2001:db8:1::10', 64) }, routes6: [{ dest: '::', prefix: 0, via: '2001:db8:1::1' }] },
    srv: { id: 'srv', kind: 'host', ifaces: { eth0: iface('2001:db8:2::10', 64) }, routes6: [{ dest: '::', prefix: 0, via: '2001:db8:2::1' }] },
    r1: { id: 'r1', kind: 'router', ifaces: { eth0: iface('2001:db8:1::1', 64), eth1: iface('2001:db8:2::1', 64) }, routes6: [] },
    sw1: { id: 'sw1', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }, sw2: { id: 'sw2', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw1', 'p1'], up: true }, { a: ['r1', 'eth0'], b: ['sw1', 'p2'], up: true },
    { a: ['srv', 'eth0'], b: ['sw2', 'p1'], up: true }, { a: ['r1', 'eth1'], b: ['sw2', 'p2'], up: true }
  ] };
}
test('delivers across subnets over IPv6 via the router', () => {
  const n = net();
  assert(M.ping6(n, 'h1', '2001:db8:2::10').ok === true, 'h1 should reach srv over IPv6');
  assert(M.ping6(n, 'h1', '2001:db8:1::1').ok === true, 'h1 should reach its gateway');
});
test('an unreachable IPv6 destination fails', () => {
  assert(M.ping6(net(), 'h1', '2001:db8:9::9').ok === false, 'no route should fail');
});
test('the reply path is required (no return route = unreachable)', () => {
  const n = net(); n.devices.srv.routes6 = [];
  assert(M.ping6(n, 'h1', '2001:db8:2::10').ok === false, 'missing return route should fail reachability');
});
test('a router with no IPv6 does not route v6 (the dual-stack gap)', () => {
  const n = net(); delete n.devices.r1.ifaces.eth0.ip6; delete n.devices.r1.ifaces.eth1.ip6;
  assert(M.ping6(n, 'h1', '2001:db8:2::10').ok === false, 'v6 should be dead without router v6 addresses');
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
