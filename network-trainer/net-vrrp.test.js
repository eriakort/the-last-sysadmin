#!/usr/bin/env node
// Breadth · VRRP first-hop redundancy (the vendor-neutral analog of HSRP):
// two routers present one virtual gateway; the higher effective priority is
// Master; tracking an uplink drops priority on failure so the backup takes
// over; and the address owner (real IP == virtual IP) is always priority 255.
const M = require('./net-model'); const { ip } = M;
const { makeCLI } = require('./net-cli');
const iface = (a, p) => ({ ip: ip(a), mask: p, up: true });

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

function mk() {
  return { devices: {
    h1:  { id: 'h1', kind: 'host', ifaces: { eth0: iface('10.0.0.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.0.1') }] },
    srv: { id: 'srv', kind: 'host', ifaces: { eth0: iface('10.0.9.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.9.1') }] },
    r1:  { id: 'r1', kind: 'router', ifaces: { eth0: iface('10.0.0.2', 24), eth1: iface('10.0.1.1', 30) }, routes: [{ dest: ip('10.0.9.0'), mask: 24, via: ip('10.0.1.2') }] },
    r2:  { id: 'r2', kind: 'router', ifaces: { eth0: iface('10.0.0.3', 24), eth1: iface('10.0.2.1', 30) }, routes: [{ dest: ip('10.0.9.0'), mask: 24, via: ip('10.0.2.2') }] },
    core:{ id: 'core', kind: 'router', ifaces: { eth0: iface('10.0.1.2', 30), eth1: iface('10.0.2.2', 30), eth2: iface('10.0.9.1', 24) }, routes: [{ dest: ip('10.0.0.0'), mask: 24, via: ip('10.0.1.1') }, { dest: ip('10.0.0.0'), mask: 24, via: ip('10.0.2.1') }] },
    sw:  { id: 'sw', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true }, p3: { up: true } } },
    sw9: { id: 'sw9', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw', 'p1'], up: true }, { a: ['r1', 'eth0'], b: ['sw', 'p2'], up: true }, { a: ['r2', 'eth0'], b: ['sw', 'p3'], up: true },
    { a: ['r1', 'eth1'], b: ['core', 'eth0'], up: true }, { a: ['r2', 'eth1'], b: ['core', 'eth1'], up: true },
    { a: ['srv', 'eth0'], b: ['sw9', 'p1'], up: true }, { a: ['core', 'eth2'], b: ['sw9', 'p2'], up: true }
  ] };
}
const run = (n, cmds) => { const cli = makeCLI(n, 'r1'); for (const [d, c] of cmds) { cli.on(d); const r = cli.run(c); assert(r.code === 0, `command failed on ${d}: "${c}" -> ${r.out}`); } };
const reaches = n => M.ping(n, 'h1', ip('10.0.9.10')).ok;
const cfg = [
  ['r1', 'enable'], ['r1', 'configure terminal'], ['r1', 'interface eth0'], ['r1', 'vrrp 1 ip 10.0.0.1'], ['r1', 'vrrp 1 priority 110'], ['r1', 'vrrp 1 preempt'], ['r1', 'vrrp 1 track eth1 decrement 20'], ['r1', 'end'],
  ['r2', 'enable'], ['r2', 'configure terminal'], ['r2', 'interface eth0'], ['r2', 'vrrp 1 ip 10.0.0.1'], ['r2', 'vrrp 1 priority 100'], ['r2', 'vrrp 1 preempt'], ['r2', 'end']
];

test('higher priority router is Master, the other is Backup', () => {
  const n = mk(); run(n, cfg);
  assert(M.vrrpStatus(n, 'r1', 'eth0').state === 'Master', 'r1 should be Master');
  assert(M.vrrpStatus(n, 'r2', 'eth0').state === 'Backup', 'r2 should be Backup');
});
test('hosts reach through the virtual gateway', () => { const n = mk(); run(n, cfg); assert(reaches(n) === true, 'h1 should reach srv via the VRRP VIP'); });
test('uplink tracking fails the master over to the backup', () => {
  const n = mk(); run(n, cfg);
  n.devices.r1.ifaces.eth1.up = false;                       // r1 priority 110 - 20 = 90 < r2 100
  assert(M.vrrpStatus(n, 'r1', 'eth0').state === 'Backup', 'r1 should yield after uplink failure');
  assert(M.vrrpStatus(n, 'r2', 'eth0').state === 'Master', 'r2 should take over');
  assert(reaches(n) === true, 'h1 should still reach srv after failover');
});
test('the address owner is priority 255 and always Master', () => {
  const n = mk(); n.devices.r2.ifaces.eth0.ip = ip('10.0.0.1');      // r2 owns the VIP
  run(n, [['r2', 'enable'], ['r2', 'configure terminal'], ['r2', 'interface eth0'], ['r2', 'vrrp 1 ip 10.0.0.1'], ['r2', 'end'],
          ['r1', 'enable'], ['r1', 'configure terminal'], ['r1', 'interface eth0'], ['r1', 'vrrp 1 ip 10.0.0.1'], ['r1', 'vrrp 1 priority 200'], ['r1', 'end']]);
  assert(M.vrrpStatus(n, 'r2', 'eth0').priority === 255, 'address owner should be priority 255');
  assert(M.vrrpStatus(n, 'r2', 'eth0').state === 'Master', 'address owner should win even against priority 200');
});
test('a single router with no VRRP peer is still Master of its group', () => {
  const n = mk(); run(n, [['r1', 'enable'], ['r1', 'configure terminal'], ['r1', 'interface eth0'], ['r1', 'vrrp 1 ip 10.0.0.1'], ['r1', 'end']]);
  assert(M.vrrpStatus(n, 'r1', 'eth0').state === 'Master', 'the only VRRP router should be Master');
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
