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
const SRV = (id, a, p, gw, services) => ({ ...host(id, a, p, gw), services });
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

/* ========== 4b. Destination-based rules (segmentation / no-pivot) ========== */
test('a src+destination rule blocks a pivot without breaking other paths', () => {
  // office h1 — fw — web(dmz) and fw — db(internal). web may serve the office
  // but must not reach the internal db.
  const net = {
    devices: {
      h1: host('h1', '10.0.1.10', 24, '10.0.1.1'),
      web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
      db: host('db', '10.0.3.10', 24, '10.0.3.1'),
      fw: { id: 'fw', kind: 'firewall', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true }, eth2: { ip: ip('10.0.3.1'), mask: 24, up: true } }, routes: [],
        acls: [{ dir: 'in', dev: 'eth1', action: 'deny', src: ip('10.0.2.10'), dstnet: { net: ip('10.0.3.0'), prefix: 24 } }] },
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }]), sw3: sw('sw3', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('fw', 'eth0', 'sw1', 'p2'),
            link('web', 'eth0', 'sw2', 'p1'), link('fw', 'eth1', 'sw2', 'p2'),
            link('db', 'eth0', 'sw3', 'p1'), link('fw', 'eth2', 'sw3', 'p2')]
  };
  ok(C.reachable(net, 'h1', 'web', { proto: 'tcp', dport: 80 }), 'office still reaches web');
  no(C.reachable(net, 'web', 'db'), 'web is blocked from the internal db');
  ok(C.reachable(net, 'h1', 'db'), 'office still reaches db directly');
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

/* ========== DNS: authoritative resolution across a router ========== */
test('DNS resolves a name via a configured resolver, and fails without one', () => {
  const net = {
    devices: {
      h1: host('h1', '10.0.1.10', 24, '10.0.1.1'),
      www: SRV('www', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
      dns1: { ...SRV('dns1', '10.0.2.53', 24, '10.0.2.1', { 53: 'dns' }), dns: { 'intranet.corp.local': ip('10.0.2.10') } },
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [] },
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'), link('www', 'eth0', 'sw2', 'p1'), link('dns1', 'eth0', 'sw2', 'p2'), link('r1', 'eth1', 'sw2', 'p3')]
  };
  no(M.resolveName(net, 'h1', 'intranet.corp.local'), 'no resolver -> fail');   // h1 has no resolver yet
  no(C.resolves(net, 'h1', 'intranet.corp.local', '10.0.2.10'), 'check fails without resolver');
  net.devices.h1.resolver = ip('10.0.2.53');                                     // point h1 at the DNS server
  const r = M.resolveName(net, 'h1', 'intranet.corp.local');
  ok(r, 'resolves with resolver'); if (r.ip !== ip('10.0.2.10')) throw new Error('resolved to the wrong IP');
  no(M.resolveName(net, 'h1', 'nope.corp.local'), 'NXDOMAIN for an unknown name');
  ok(C.resolves(net, 'h1', 'intranet.corp.local', '10.0.2.10'), 'resolves check passes');
});

/* ========== DHCP: a lease delivers address + gateway + DNS ========== */
test('DHCP hands out an address, gateway, and resolver; a reply is reachable', () => {
  const net = {
    devices: {
      h1: host('h1', '10.0.9.50', 24),                                           // stale static, wrong network
      srv: SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [],
        dhcp: { iface: 'eth0', range: [ip('10.0.1.100'), ip('10.0.1.150')], prefix: 24, gw: ip('10.0.1.1'), dns: ip('10.0.2.10') } },
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'), link('srv', 'eth0', 'sw2', 'p1'), link('r1', 'eth1', 'sw2', 'p2')]
  };
  no(C.reachable(net, 'h1', 'srv'), 'stale static cannot reach the server');
  const lease = M.dhclient(net, 'h1', 'eth0');
  ok(lease, 'lease acquired');
  if (lease.ip !== ip('10.0.1.100')) throw new Error('expected first free address .100, got ' + M.ipStr(lease.ip));
  if (net.devices.h1.resolver !== ip('10.0.2.10')) throw new Error('DHCP did not set the resolver');
  ok(C.reachable(net, 'h1', 'srv'), 'after the lease, the server is reachable');
});
test('DHCP with no server on the segment returns a teachable failure', () => {
  const net = {
    devices: { h1: host('h1', '10.0.9.50', 24), sw1: sw('sw1', [{ name: 'p1' }]) },
    links: [link('h1', 'eth0', 'sw1', 'p1')]
  };
  no(M.dhclient(net, 'h1', 'eth0'), 'no DHCP server -> no lease');
});

/* ========== dynamic routing + failover ========== */
const rif = (a, p, extra) => ({ ip: ip(a), mask: p, up: true, ...(extra || {}) });
const rtr = (id, ifaces, routes, extra) => ({ id, kind: 'router', ifaces, routes: routes || [], acls: [], ...(extra || {}) });

test('OSPF: an adjacency forms only in a shared area; the branch route is learned and reachable', () => {
  const mk = (r1area, r2area) => ({ devices: {
      hq: host('hq', '10.0.1.10', 24, '10.0.1.1'),
      br: SRV('br', '10.0.8.10', 24, '10.0.8.1', { 22: 'ssh' }),
      r1: rtr('r1', { eth0: rif('10.0.1.1', 24, { ospf: r1area }), eth1: rif('10.0.12.1', 24, { ospf: r1area }) }),
      r2: rtr('r2', { eth0: rif('10.0.12.2', 24, { ospf: r2area }), eth1: rif('10.0.8.1', 24, { ospf: r2area }) }),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }]) },
    links: [link('hq', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'), link('r1', 'eth1', 'r2', 'eth0'), link('br', 'eth0', 'sw2', 'p1'), link('r2', 'eth1', 'sw2', 'p2')] });
  const net = mk(0, 0);
  if (!M.ospfNeighbors(net, 'r1').some(n => n.id === 'r2')) throw new Error('r1 should see r2 as an OSPF neighbor in area 0');
  ok(C.ospfRoute(net, 'r1', '10.0.8.0/24'), 'r1 learns the branch net via OSPF');
  ok(C.reachable(net, 'hq', 'br'), 'HQ reaches the branch over the learned route');
  const bad = mk(0, 1);                                   // area mismatch
  if (M.ospfNeighbors(bad, 'r1').some(n => n.id === 'r2')) throw new Error('mismatched areas must NOT form an adjacency');
  no(C.ospfRoute(bad, 'r1', '10.0.8.0/24'), 'nothing learned across mismatched areas');
  no(C.reachable(bad, 'hq', 'br'), 'unreachable without the adjacency');
});

test('BGP: a session establishes only with matching ASNs on both ends; advertised routes are then learned', () => {
  const mk = r1expectsAs => ({ devices: {
      hq: host('hq', '10.0.1.10', 24, '10.0.1.1'),
      br: SRV('br', '10.0.8.10', 24, '10.0.8.1', { 22: 'ssh' }),
      r1: rtr('r1', { eth0: rif('10.0.1.1', 24), eth1: rif('10.0.12.1', 24) }, [], { bgp: { asn: 65001, neighbors: [{ ip: ip('10.0.12.2'), remoteAs: r1expectsAs }], networks: ['10.0.1.0/24'] } }),
      r2: rtr('r2', { eth0: rif('10.0.12.2', 24), eth1: rif('10.0.8.1', 24) }, [], { bgp: { asn: 65002, neighbors: [{ ip: ip('10.0.12.1'), remoteAs: 65001 }], networks: ['10.0.8.0/24'] } }),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }]) },
    links: [link('hq', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'), link('r1', 'eth1', 'r2', 'eth0'), link('br', 'eth0', 'sw2', 'p1'), link('r2', 'eth1', 'sw2', 'p2')] });
  const net = mk(65002);
  ok(C.bgpSession(net, 'r1', 'r2'), 'session Established with matching ASNs');
  ok(C.bgpRoute(net, 'r1', '10.0.8.0/24'), 'r1 learns the branch net over BGP');
  ok(C.reachable(net, 'hq', 'br'), 'HQ reaches the branch');
  const bad = mk(65999);                                  // r1 expects the wrong remote AS
  no(C.bgpSession(bad, 'r1', 'r2'), 'ASN mismatch keeps the session down');
  no(C.reachable(bad, 'hq', 'br'), 'no learned route while the session is down');
});

test('Failover: a dead primary next hop reroutes over an equal backup route', () => {
  const mk = primaryUp => ({ devices: {
      hq: host('hq', '10.0.1.10', 24, '10.0.1.1'),
      br: SRV('br', '10.0.8.10', 24, '10.0.8.2', { 22: 'ssh' }),     // gateway is the backup router r3
      r1: rtr('r1', { eth0: rif('10.0.1.1', 24), eth1: rif('10.0.12.1', 24), eth2: rif('10.0.13.1', 24) },
        [{ dest: ip('10.0.8.0'), mask: 24, via: ip('10.0.12.2') }, { dest: ip('10.0.8.0'), mask: 24, via: ip('10.0.13.2') }]),
      r2: rtr('r2', { eth0: rif('10.0.12.2', 24), eth1: rif('10.0.8.1', 24) }, [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }]),
      r3: rtr('r3', { eth0: rif('10.0.13.2', 24), eth1: rif('10.0.8.2', 24) }, [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.13.1') }]),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }]) },
    links: [link('hq', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'),
            { a: ['r1', 'eth1'], b: ['r2', 'eth0'], up: primaryUp },
            link('r1', 'eth2', 'r3', 'eth0'),
            link('r2', 'eth1', 'sw2', 'p1'), link('r3', 'eth1', 'sw2', 'p2'), link('br', 'eth0', 'sw2', 'p3')] });
  ok(C.reachable(mk(true), 'hq', 'br'), 'reachable over the primary path');
  ok(C.reachable(mk(false), 'hq', 'br'), 'still reachable via the backup when the primary link is down');
});

/* ========== NAT: port-forward (DNAT) and masquerade (SNAT) ========== */
const edgeNat = nat => ({ id: 'edge', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('203.0.113.10'), mask: 24, up: true } }, routes: [], acls: [], nat });
test('DNAT port-forward exposes an inside server on the public IP', () => {
  const mk = nat => ({ devices: {
      wan: host('wan', '203.0.113.9', 24),
      web: SRV('web', '10.0.1.10', 24, '10.0.1.1', { 80: 'http' }),
      edge: edgeNat(nat),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }]) },
    links: [link('web', 'eth0', 'sw1', 'p1'), link('edge', 'eth0', 'sw1', 'p2'), link('wan', 'eth0', 'sw2', 'p1'), link('edge', 'eth1', 'sw2', 'p2')] });
  no(C.portForward(mk([]), 'wan', '203.0.113.10', 80, 'web'), 'no port-forward -> reaches only the edge');
  ok(C.portForward(mk([{ kind: 'dnat', oif: 'eth1', proto: 'tcp', dport: 80, toIp: ip('10.0.1.10') }]), 'wan', '203.0.113.10', 80, 'web'), 'DNAT reaches the inside server');
});
test('SNAT masquerade lets a private network reach the internet (reply returns)', () => {
  const mk = nat => ({ devices: {
      pc: host('pc', '10.0.1.10', 24, '10.0.1.1'),
      site: SRV('site', '203.0.113.50', 24, null, { 80: 'http' }),
      edge: edgeNat(nat),
      sw1: sw('sw1', [{ name: 'p1' }, { name: 'p2' }]), sw2: sw('sw2', [{ name: 'p1' }, { name: 'p2' }]) },
    links: [link('pc', 'eth0', 'sw1', 'p1'), link('edge', 'eth0', 'sw1', 'p2'), link('site', 'eth0', 'sw2', 'p1'), link('edge', 'eth1', 'sw2', 'p2')] });
  no(C.reachable(mk([]), 'pc', 'site'), 'without NAT the reply has no route back to the private source');
  ok(C.reachable(mk([{ kind: 'snat', oif: 'eth1', srcNet: M.cidr('10.0.1.0/24') }]), 'pc', 'site'), 'masquerade makes it round-trip');
});

/* ---------- runner ---------- */
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
