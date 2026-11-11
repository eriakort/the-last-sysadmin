#!/usr/bin/env node
// Breadth · Observability: state-derived system logs (the "read the evidence"
// layer) and per-device traffic counters. Logs name the faults present right
// now; counters show where the packets you send actually die.
const M = require('./net-model'); const { ip } = M;
const C = require('./net-checks');
const iface = (a, p, extra = {}) => ({ ip: ip(a), mask: p, up: true, ...extra });

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

function net() {
  return { devices: {
    h1: { id: 'h1', kind: 'host', ifaces: { eth0: iface('10.0.1.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }] },
    srv: { id: 'srv', kind: 'host', ifaces: { eth0: iface('10.0.2.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }] },
    r1: { id: 'r1', kind: 'router', ifaces: { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24, { up: false }) }, routes: [] },
    sw1: { id: 'sw1', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }, sw2: { id: 'sw2', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw1', 'p1'], up: true }, { a: ['r1', 'eth0'], b: ['sw1', 'p2'], up: true },
    { a: ['srv', 'eth0'], b: ['sw2', 'p1'], up: true }, { a: ['r1', 'eth1'], b: ['sw2', 'p2'], up: true }
  ] };
}

test('a down interface produces a LINK-3-UPDOWN system event', () => {
  const log = M.systemLog(net(), 'r1');
  assert(log.some(e => /eth1, changed state to down/.test(e.message)), 'expected a down-interface event: ' + log.map(e => e.message).join(' | '));
});
test('a healthy device logs no system faults', () => {
  const n = net(); n.devices.r1.ifaces.eth1.up = true;
  assert(M.systemLog(n, 'r1').length === 0, 'healthy router should have no fault events');
  assert(M.systemLog(n, 'h1').length === 0, 'healthy host should have no fault events');
});
test('an err-disabled port is reported', () => {
  const n = net(); n.devices.sw1.ifaces.p2.errDisabled = true;
  assert(M.systemLog(n, 'sw1').some(e => /err-disable/i.test(e.message)), 'expected an err-disable event');
});
test('traffic counters record where a packet dies', () => {
  const n = net();
  M.recordTraffic(n, M.ping(n, 'h1', ip('10.0.2.10')).forward);     // dies at r1 (eth1 down)
  assert(n.devices.r1.counters.dropped === 1, 'r1 should count the drop');
  assert(n.devices.h1.counters.forwarded === 1, 'h1 should count the forward');
});
test('counters record a delivered packet end to end', () => {
  const n = net(); n.devices.r1.ifaces.eth1.up = true;
  M.recordTraffic(n, M.ping(n, 'h1', ip('10.0.2.10')).forward);
  assert(n.devices.srv.counters.delivered === 1, 'srv should count the delivery');
});
test('log_event check matches present and absent faults', () => {
  const n = net();
  assert(C.logEvent(n, 'r1', 'UPDOWN', true).ok === true, 'present=true should match the down event');
  assert(C.logEvent(n, 'r1', 'UPDOWN', false).ok === false, 'present=false should fail while the fault exists');
  n.devices.r1.ifaces.eth1.up = true;
  assert(C.logEvent(n, 'r1', 'UPDOWN', false).ok === true, 'present=false should pass once the fault clears');
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
