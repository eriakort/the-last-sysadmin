#!/usr/bin/env node
// Headless scenario tests for the forwarding engine + checks. Node only.
//   node net-engine.test.js
const M = require('./net-model');
const C = require('./net-checks');
const { ip } = M;

let passed = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ok = (res, label) => { if (!res || res.ok !== true) throw new Error(`${label} — expected ok, got: ${res && res.reason}`); };
const no = (res, label) => { if (!res || res.ok !== false) throw new Error(`${label} — expected NOT ok, but: ${res && res.reason}`); };

// tiny builders
const host = (name, ifaceIp, prefix, gw) => ({ id: name, kind: 'host', ifaces: { eth0: { ip: ip(ifaceIp), mask: prefix, up: true } }, routes: gw ? [{ dest: 0, mask: 0, via: ip(gw) }] : [] });
const sw = (name, ports) => ({ id: name, kind: 'switch', ifaces: Object.fromEntries(ports.map(p => [p.name, { up: true, ...(p.vlan != null ? { vlan: p.vlan } : {}) }])) });
const link = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });

/* ========== 1. Same subnet through a switch ========== */
test('two hosts on one switch reach each other', () => {
  const net = {
    devices: {
      h1: host('h1', '10.0.1.10', 24), h2: host('h2', '10.0.1.20', 24),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('h2', 'eth0', 'sw1', 'p2')]
  };
  ok(C.reachable(net, 'h1', 'h2'), 'h1->h2 same subnet');
});
test('a host misconfigured into the wrong subnet is unreachable', () => {
  const net = {
    devices: {
      h1: host('h1', '10.0.1.10', 24), h2: host('h2', '10.9.9.20', 24),   // wrong subnet
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('h2', 'eth0', 'sw1', 'p2')]
  };
  no(C.reachable(net, 'h1', 'h2'), 'h1->h2 subnet mismatch');
});

/* ========== 2. Routing across subnets ========== */
function twoSubnets() {
  return {
    devices: {
      h1: host('h1', '10.0.1.10', 24, '10.0.1.1'),
      h2: host('h2', '10.0.2.10', 24, '10.0.2.1'),
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [] },
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'),
            link('h2', 'eth0', 'sw2', 'p1'), link('r1', 'eth1', 'sw2', 'p2')]
  };
}
test('a router joins two subnets', () => ok(C.reachable(twoSubnets(), 'h1', 'h2'), 'h1->h2 via router'));
test('a host with no default gateway cannot leave its subnet', () => {
  const net = twoSubnets(); net.devices.h1.routes = [];              // forgot the gateway
  no(C.reachable(net, 'h1', 'h2'), 'h1 has no default route');
});

/* ========== 3. Static routing (not directly connected) ========== */
function threeSubnets() {
  return {
    devices: {
      h1: host('h1', '10.0.1.10', 24, '10.0.1.1'),
      h3: host('h3', '10.0.3.10', 24, '10.0.3.1'),
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.12.1'), mask: 30, up: true } }, routes: [{ dest: ip('10.0.3.0'), mask: 24, via: ip('10.0.12.2') }], acls: [] },
      r2: { id: 'r2', kind: 'router', ifaces: { eth0: { ip: ip('10.0.12.2'), mask: 30, up: true }, eth1: { ip: ip('10.0.3.1'), mask: 24, up: true } }, routes: [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }], acls: [] },
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw3: sw('sw3', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'),
            link('r1', 'eth1', 'r2', 'eth0'),
            link('h3', 'eth0', 'sw3', 'p1'), link('r2', 'eth1', 'sw3', 'p2')]
  };
}
test('static routes let two far subnets talk', () => {
  const net = threeSubnets();
  ok(C.routeExists(net, 'r1', '10.0.3.0/24'), 'r1 route to .3');
  ok(C.reachable(net, 'h1', 'h3'), 'h1->h3 via two routers');
});
test('removing a static route breaks reachability (and route_exists reports it)', () => {
  const net = threeSubnets(); net.devices.r1.routes = [];
  no(C.routeExists(net, 'r1', '10.0.3.0/24'), 'r1 route missing');
  no(C.reachable(net, 'h1', 'h3'), 'h1->h3 no route at r1');
});

/* ========== 4. Firewall / ACLs ========== */
function firewalled() {
  const net = twoSubnets();
  net.devices.r1.kind = 'firewall';
  net.devices.r1.acls = [
    { dir: 'in', dev: 'eth0', action: 'deny', proto: 'tcp', dport: 23 },  // block telnet
    { dir: 'in', dev: 'eth0', action: 'allow', any: false }               // (explicit, optional)
  ];
  return net;
}
test('firewall blocks telnet but allows web and ping', () => {
  const net = firewalled();
  ok(C.reachable(net, 'h1', 'h2'), 'icmp allowed');
  ok(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }), 'web allowed');
  no(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 23 }), 'telnet blocked');
  ok(C.aclBlocks(net, 'h1', '10.0.2.10', { proto: 'tcp', dport: 23 }), 'acl_blocks telnet');
});
test('rule order matters: an allow-any above a deny shadows it', () => {
  const net = firewalled();
  net.devices.r1.acls = [{ dir: 'in', dev: 'eth0', action: 'allow', any: true },  // shadows everything below
                         { dir: 'in', dev: 'eth0', action: 'deny', proto: 'tcp', dport: 23 }];
  no(C.aclBlocks(net, 'h1', '10.0.2.10', { proto: 'tcp', dport: 23 }), 'telnet leaks through due to order');
});
test('asymmetric ACL: request passes but the reply is dropped', () => {
  const net = firewalled();
  // deny inbound on the return interface so replies to h1 die
  net.devices.r1.acls = [{ dir: 'in', dev: 'eth1', action: 'deny', proto: 'icmp' }];
  no(C.reachable(net, 'h1', 'h2'), 'round trip fails on the reply');
});

/* ========== 5. VLAN segmentation (security) ========== */
test('same switch, different VLANs cannot reach each other', () => {
  const net = {
    devices: {
      staff: host('staff', '10.0.5.10', 24), guest: host('guest', '10.0.5.20', 24),
      staff2: host('staff2', '10.0.5.11', 24),
      sw1: sw('sw1', [{ name: 'p1', vlan: 10 }, { name: 'p2', vlan: 20 }, { name: 'p3', vlan: 10 }])
    },
    links: [link('staff', 'eth0', 'sw1', 'p1'), link('guest', 'eth0', 'sw1', 'p2'), link('staff2', 'eth0', 'sw1', 'p3')]
  };
  ok(C.reachable(net, 'staff', 'staff2'), 'same VLAN reachable');
  no(C.reachable(net, 'staff', 'guest'), 'cross-VLAN blocked at L2');
});

/* ========== 6. Link / interface down ========== */
test('a downed link breaks the path', () => {
  const net = twoSubnets(); net.devices.r1.ifaces.eth1.up = false;   // pull r1's cable to subnet 2
  no(C.reachable(net, 'h1', 'h2'), 'r1 eth1 down');
});

/* ========== 7. Pure check units ========== */
test('subnet_correct validates an interface address', () => {
  const net = twoSubnets();
  ok(C.subnetCorrect(net, 'h1', 'eth0', '10.0.1.0/24'), 'h1 in .1');
  no(C.subnetCorrect(net, 'h1', 'eth0', '10.0.2.0/24'), 'h1 not in .2');
});
test('IP math round-trips and subnets compute', () => {
  if (M.ipStr(M.ip('192.168.1.1')) !== '192.168.1.1') throw new Error('ip round-trip');
  if (!M.sameNet(M.ip('10.0.1.5'), M.ip('10.0.1.200'), 24)) throw new Error('same /24');
  if (M.sameNet(M.ip('10.0.1.5'), M.ip('10.0.2.5'), 24)) throw new Error('different /24');
  if (M.networkOf(M.ip('10.0.1.37'), 24) !== M.ip('10.0.1.0')) throw new Error('network addr');
});

/* ---------- runner ---------- */
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
