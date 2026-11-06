#!/usr/bin/env node
// Tests for the M2 CLI layer, driven headlessly against the engine.
const M = require('./net-model');
const C = require('./net-checks');
const { makeCLI } = require('./net-cli');
const { ip } = M;

let passed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const has = (s, sub, m) => { if (!String(s).includes(sub)) throw new Error(`${m}: "${s}" lacks "${sub}"`); };

const sw = (name, ports) => ({ id: name, kind: 'switch', ifaces: Object.fromEntries(ports.map(p => [p, { up: true }])) });
const link = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });

// Two subnets joined by r1; h1 starts UNCONFIGURED (interface up, but no IP, no route).
function world() {
  return {
    devices: {
      h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] },        // blank
      h2: { id: 'h2', kind: 'host', ifaces: { eth0: { ip: ip('10.0.2.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }], services: { 22: 'ssh', 80: 'http' } },
      r1: { id: 'r1', kind: 'firewall', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [] },
      sw1: sw('sw1', ['p1', 'p2']), sw2: sw('sw2', ['p1', 'p2'])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'),
            link('h2', 'eth0', 'sw2', 'p1'), link('r1', 'eth1', 'sw2', 'p2')]
  };
}

test('configuring a blank host over the CLI brings the network to life', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  eq(C.reachable(net, 'h1', 'h2').ok, false, 'dead before config');
  eq(cli.run('ip addr add 10.0.1.10/24 dev eth0').code, 0, 'addr add');
  eq(C.reachable(net, 'h1', 'h2').ok, false, 'still no gateway');       // address alone isn\'t enough
  eq(cli.run('ip route add default via 10.0.1.1').code, 0, 'route add');
  eq(C.reachable(net, 'h1', 'h2').ok, true, 'alive after gateway');     // now it works
});

test('ip addr and ip route show the configured state', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0');
  cli.run('ip route add default via 10.0.1.1');
  has(cli.run('ip addr').out, '10.0.1.10/24', 'addr list');
  has(cli.run('ip route').out, 'default via 10.0.1.1', 'route list');
});

test('ping reports success with a path, and failure with a reason', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0');
  const fail = cli.run('ping h2');                                      // no gateway yet
  eq(fail.code, 1, 'ping fails'); has(fail.out, 'no route', 'reason');
  cli.run('ip route add default via 10.0.1.1');
  const good = cli.run('ping h2');
  eq(good.code, 0, 'ping ok'); has(good.out, 'reachable', 'ok word'); has(good.out, 'h1 -> r1 -> h2', 'path');
});

test('traceroute lists the hops', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0'); cli.run('ip route add default via 10.0.1.1');
  const t = cli.run('traceroute h2');
  has(t.out, 'r1', 'passes router'); has(t.out, 'h2', 'reaches host');
});

test('iptables on the firewall blocks telnet but not web', () => {
  const net = world(); const h = makeCLI(net, 'h1');
  h.run('ip addr add 10.0.1.10/24 dev eth0'); h.run('ip route add default via 10.0.1.1');
  const fw = makeCLI(net, 'r1');
  eq(fw.run('iptables -A INPUT -i eth0 -p tcp --dport 23 -j DROP').code, 0, 'add rule');
  has(fw.run('iptables -L').out, 'DROP', 'rule listed');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 23 }).ok, false, 'telnet blocked');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }).ok, true, 'web allowed');
  fw.run('iptables -F');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 23 }).ok, true, 'flush reopens');
});

test('nmap shows a host\'s exposed services (read-only)', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0'); cli.run('ip route add default via 10.0.1.1');
  const scan = cli.run('nmap h2');
  has(scan.out, '22/tcp', 'ssh port'); has(scan.out, 'http', 'http service');
});

test('arp lists neighbours on the segment', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0');
  has(cli.run('arp').out, '10.0.1.1', 'sees the router');              // r1 is the L2 neighbour
});

test('tcpdump prints the last ping\'s packets', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0'); cli.run('ip route add default via 10.0.1.1');
  cli.run('ping h2');
  const cap = cli.run('tcpdump').out;
  has(cap, '10.0.1.10 > 10.0.2.10', 'request'); has(cap, 'reply', 'reply');
});

test('CLI config and direct model config produce the same reachability', () => {
  const a = world(); makeCLI(a, 'h1').run('ip addr add 10.0.1.10/24 dev eth0');  makeCLI(a, 'h1').run('ip route add default via 10.0.1.1');
  const b = world();
  b.devices.h1.ifaces.eth0 = { ip: ip('10.0.1.10'), mask: 24, up: true };
  b.devices.h1.routes = [{ dest: 0, mask: 0, via: ip('10.0.1.1') }];
  eq(C.reachable(a, 'h1', 'h2').ok, C.reachable(b, 'h1', 'h2').ok, 'same outcome');
  eq(C.reachable(a, 'h1', 'h2').ok, true, 'both reachable');
});

test('unknown command and bad usage are reported', () => {
  const cli = makeCLI(world(), 'h1');
  eq(cli.run('frobnicate').code, 1, 'unknown cmd');
  has(cli.run('ip route add 10.0.3.0/24').out, 'usage', 'bad usage');
});

// A LAN with a DHCP pool on r1 (eth0) and a DNS server dns1 across the router.
function namedWorld() {
  const SRV = (id, a, p, gw, services) => ({ id, kind: 'host', ifaces: { eth0: { ip: ip(a), mask: p, up: true } }, routes: gw ? [{ dest: 0, mask: 0, via: ip(gw) }] : [], services });
  return {
    devices: {
      h1: { id: 'h1', kind: 'host', ifaces: { eth0: { ip: ip('10.0.9.50'), mask: 24, up: true } }, routes: [] },  // stale static
      www: SRV('www', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
      dns1: { ...SRV('dns1', '10.0.2.53', 24, '10.0.2.1', { 53: 'dns' }), dns: { 'intranet.corp.local': ip('10.0.2.10') } },
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [],
        dhcp: { iface: 'eth0', range: [ip('10.0.1.100'), ip('10.0.1.150')], prefix: 24, gw: ip('10.0.1.1'), dns: ip('10.0.2.53') } },
      sw1: sw('sw1', ['p1', 'p2']), sw2: sw('sw2', ['p1', 'p2', 'p3'])
    },
    links: [link('h1', 'eth0', 'sw1', 'p1'), link('r1', 'eth0', 'sw1', 'p2'),
            link('www', 'eth0', 'sw2', 'p1'), link('dns1', 'eth0', 'sw2', 'p2'), link('r1', 'eth1', 'sw2', 'p3')]
  };
}

test('dhclient acquires a lease (address + gateway + DNS) and connects the host', () => {
  const net = namedWorld(); const cli = makeCLI(net, 'h1');
  eq(C.reachable(net, 'h1', 'www').ok, false, 'stale static is offline');
  const out = cli.run('dhclient eth0');
  eq(out.code, 0, 'lease ok'); has(out.out, '10.0.1.100', 'address handed out'); has(out.out, 'gateway 10.0.1.1', 'gateway handed out');
  eq(C.reachable(net, 'h1', 'www').ok, true, 'online after the lease');
  eq(net.devices.h1.resolver, ip('10.0.2.53'), 'resolver set from DHCP');
});

test('dig fails with no resolver, resolvectl sets one, then dig resolves', () => {
  const net = namedWorld(); net.devices.h1.ifaces.eth0 = { ip: ip('10.0.1.10'), mask: 24, up: true }; net.devices.h1.routes = [{ dest: 0, mask: 0, via: ip('10.0.1.1') }];
  const cli = makeCLI(net, 'h1');
  const before = cli.run('dig intranet.corp.local');
  eq(before.code, 1, 'dig fails'); has(before.out, 'no DNS resolver', 'reason: no resolver');
  eq(cli.run('ping 10.0.2.10').code, 0, 'but the IP is reachable');   // the teaching split
  eq(cli.run('resolvectl dns eth0 10.0.2.53').code, 0, 'set resolver');
  const after = cli.run('dig intranet.corp.local');
  eq(after.code, 0, 'dig resolves'); has(after.out, '10.0.2.10', 'answer address');
  eq(cli.run('ping intranet.corp.local').code, 0, 'ping by name now works');
});

test('an unknown name returns NXDOMAIN', () => {
  const net = namedWorld(); net.devices.h1.resolver = ip('10.0.2.53'); net.devices.h1.ifaces.eth0 = { ip: ip('10.0.1.10'), mask: 24, up: true }; net.devices.h1.routes = [{ dest: 0, mask: 0, via: ip('10.0.1.1') }];
  const cli = makeCLI(net, 'h1');
  has(cli.run('dig nope.corp.local').out, 'NXDOMAIN', 'nxdomain reported');
});

test('iptables -t nat installs DNAT and MASQUERADE rules that take effect', () => {
  const edge = { id: 'edge', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('203.0.113.10'), mask: 24, up: true } }, routes: [], acls: [] };
  const net = {
    devices: {
      web: { id: 'web', kind: 'host', ifaces: { eth0: { ip: ip('10.0.1.20'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }], services: { 80: 'http' } },
      pc: { id: 'pc', kind: 'host', ifaces: { eth0: { ip: ip('10.0.1.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }] },
      site: { id: 'site', kind: 'host', ifaces: { eth0: { ip: ip('203.0.113.50'), mask: 24, up: true } }, routes: [], services: { 80: 'http' } },
      wan: { id: 'wan', kind: 'host', ifaces: { eth0: { ip: ip('203.0.113.9'), mask: 24, up: true } }, routes: [] },
      edge, sw1: sw('sw1', ['p1', 'p2', 'p3']), sw2: sw('sw2', ['p1', 'p2', 'p3'])
    },
    links: [link('web', 'eth0', 'sw1', 'p1'), link('pc', 'eth0', 'sw1', 'p2'), link('edge', 'eth0', 'sw1', 'p3'),
            link('site', 'eth0', 'sw2', 'p1'), link('wan', 'eth0', 'sw2', 'p2'), link('edge', 'eth1', 'sw2', 'p3')]
  };
  const fw = makeCLI(net, 'edge');
  eq(C.portForward(net, 'wan', '203.0.113.10', 80, 'web').ok, false, 'no forward yet');
  eq(fw.run('iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 -j DNAT --to-destination 10.0.1.20').code, 0, 'add DNAT');
  eq(C.portForward(net, 'wan', '203.0.113.10', 80, 'web').ok, true, 'port-forward works');
  eq(C.reachable(net, 'pc', 'site').ok, false, 'office offline before masquerade');
  eq(fw.run('iptables -t nat -A POSTROUTING -o eth1 -s 10.0.1.0/24 -j MASQUERADE').code, 0, 'add MASQUERADE');
  eq(C.reachable(net, 'pc', 'site').ok, true, 'office online after masquerade');
  has(fw.run('iptables -t nat -L').out, 'DNAT', 'nat list shows DNAT');
  has(fw.run('iptables -t nat -L').out, 'MASQ', 'nat list shows masquerade');
});


test('address configuration rejects malformed input, unknown interfaces, and duplicate addresses without mutation', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  const before = JSON.stringify(net.devices.h1.ifaces);
  eq(cli.run('ip addr add 300.0.1.10/24 dev eth0').code, 1, 'reject out-of-range octet');
  eq(cli.run('ip addr add 10.0.1.10/33 dev eth0').code, 1, 'reject invalid prefix');
  eq(cli.run('ip addr add 10.0.1.10/24 dev eth9').code, 1, 'reject missing interface');
  eq(cli.run('ip addr add 10.0.2.10/24 dev eth0').code, 1, 'reject address already owned by h2');
  eq(JSON.stringify(net.devices.h1.ifaces), before, 'invalid commands do not mutate interface state');
});

test('address delete and link down/up update the live interface state', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  eq(cli.run('ip addr add 10.0.1.10/24 dev eth0').code, 0, 'address added');
  eq(cli.run('ip link set eth0 down').code, 0, 'link down');
  eq(net.devices.h1.ifaces.eth0.up, false, 'link is down');
  eq(cli.run('ip addr add 10.0.1.11/24 dev eth0').code, 1, 'add does not silently overwrite an existing address');
  eq(cli.run('ip addr replace 10.0.1.11/24 dev eth0').code, 0, 'explicitly replace address while link is down');
  eq(net.devices.h1.ifaces.eth0.up, false, 'address configuration does not silently raise the link');
  eq(cli.run('ip link set eth0 up').code, 0, 'link up');
  eq(net.devices.h1.ifaces.eth0.up, true, 'link is up');
  eq(cli.run('ip addr del 10.0.1.11/24 dev eth0').code, 0, 'address deleted');
  eq(net.devices.h1.ifaces.eth0.ip, undefined, 'address removed');
  eq(cli.run('ip addr del 10.0.1.11/24 dev eth0').code, 1, 'deleting absent address is an error');
});

test('route configuration validates gateways, replaces matching prefixes, and reports missing deletes', () => {
  const net = world(); const cli = makeCLI(net, 'h1');
  cli.run('ip addr add 10.0.1.10/24 dev eth0');
  eq(cli.run('ip route add default via 300.0.1.1').code, 1, 'reject invalid gateway');
  eq(cli.run('ip route add default via 10.0.9.1').code, 1, 'reject off-link gateway');
  eq(cli.run('ip route add 10.0.3.0/33 via 10.0.1.1').code, 1, 'reject invalid route prefix');
  eq((net.devices.h1.routes || []).length, 0, 'invalid routes do not mutate state');
  eq(cli.run('ip route add default via 10.0.1.1').code, 0, 'add default route');
  eq(cli.run('ip route add default via 10.0.1.1').code, 1, 'reject identical duplicate route');
  eq(cli.run('ip route add default via 10.0.1.254').code, 0, 'allow alternate next hop for failover');
  eq(net.devices.h1.routes.length, 2, 'alternate next hop is retained');
  eq(cli.run('ip route replace default via 10.0.1.253').code, 0, 'replace all routes for the prefix');
  eq(net.devices.h1.routes.length, 1, 'replace leaves one route for the prefix');
  eq(net.devices.h1.routes[0].via, ip('10.0.1.253'), 'replacement gateway persisted');
  eq(cli.run('ip route del 10.0.8.0/24').code, 1, 'missing route delete is reported');
  eq(cli.run('ip route del default').code, 0, 'delete default route');
  eq(net.devices.h1.routes.length, 0, 'route removed');
});

test('CLI refuses to attach to an unknown device', () => {
  let threw = false;
  try { makeCLI(world(), 'ghost'); } catch (e) { threw = /unknown device/.test(e.message); }
  eq(threw, true, 'unknown console rejected');
});


// Cisco IOS-style command-mode workflow shares the exact forwarding model.
test('IOS EXEC and global/interface configuration modes build a switch access port', () => {
  const net = world(), cli = makeCLI(net, 'sw1');
  eq(cli.run('configure terminal').code, 1, 'user EXEC cannot enter config mode');
  eq(cli.run('enable').code, 0, 'enable');
  eq(cli.run('conf t').code, 0, 'global config');
  eq(cli.iosMode, 'config', 'global config mode');
  eq(cli.run('vlan 10').code, 0, 'create VLAN');
  eq(cli.run('name STAFF').code, 0, 'name VLAN');
  eq(cli.run('exit').code, 0, 'leave VLAN context');
  eq(cli.run('interface p1').code, 0, 'select interface');
  eq(cli.iosMode, 'interface', 'interface config mode');
  eq(cli.run('switchport mode access').code, 0, 'access mode');
  eq(cli.run('switchport access vlan 10').code, 0, 'assign access VLAN');
  eq(cli.run('description Finance workstation').code, 0, 'interface description');
  eq(cli.run('end').code, 0, 'return to privileged EXEC');
  eq(cli.iosMode, 'privileged', 'privileged mode');
  eq(net.devices.sw1.ifaces.p1.accessVlan, 10, 'same switch model updated');
  has(cli.run('show vlan brief').out, 'STAFF', 'VLAN verification');
  has(cli.run('show interfaces status').out, 'Finance workstation', 'port verification');
});
test('IOS trunk configuration validates VLANs and reports native and allowed VLANs', () => {
  const net = world(), cli = makeCLI(net, 'sw1');
  cli.run('enable'); cli.run('configure terminal'); cli.run('vlan 10'); cli.run('exit'); cli.run('vlan 20'); cli.run('exit');
  cli.run('interface p1');
  eq(cli.run('switchport mode trunk').code, 0, 'trunk mode');
  eq(cli.run('switchport trunk native vlan 10').code, 0, 'native VLAN');
  eq(cli.run('switchport trunk allowed vlan 10,20').code, 0, 'allowed VLAN list');
  eq(cli.run('switchport trunk allowed vlan 10,999').code, 1, 'reject VLAN not created');
  cli.run('end');
  const out = cli.run('show interfaces trunk').out;
  has(out, '10', 'native VLAN shown'); has(out, '10,20', 'allowed VLANs shown');
  eq(net.devices.sw1.ifaces.p1.nativeVlan, 10, 'native VLAN applied to model');
});
test('IOS router interface addressing and static routes immediately affect reachability', () => {
  const net = world(), cli = makeCLI(net, 'r1');
  cli.run('enable'); cli.run('configure terminal');
  cli.run('interface eth0');
  eq(cli.run('ip address 10.0.1.1 255.255.255.0').code, 0, 'interface address');
  cli.run('exit');
  eq(cli.run('ip route 10.0.2.0 255.255.255.0 10.0.9.254').code, 1, 'reject off-link next hop');
  eq(cli.run('ip route 10.0.2.0 255.255.255.0 10.0.1.1').code, 1, 'reject own interface address as next hop');
  eq(cli.run('ip route 10.0.3.0 255.255.255.0 10.0.2.254').code, 0, 'install static route through connected next hop');
  cli.run('end');
  has(cli.run('show ip interface brief').out, '10.0.1.1', 'interface summary');
  has(cli.run('show ip route').out, '10.0.1.0/24', 'connected route');
  has(cli.run('show ip route').out, '10.0.3.0/24', 'static route');
});
test('IOS startup configuration is saved explicitly and remains a snapshot', () => {
  const net = world(), cli = makeCLI(net, 'sw1');
  cli.run('enable'); cli.run('configure terminal'); cli.run('hostname access-01'); cli.run('vlan 30'); cli.run('exit');
  cli.run('interface p1'); cli.run('description Uplink'); cli.run('end');
  eq(cli.run('write memory').code, 0, 'save startup config');
  const saved = net.devices.sw1.startupConfig;
  has(saved, 'hostname access-01', 'hostname persisted');
  has(saved, 'vlan 30', 'VLAN persisted');
  has(saved, 'description Uplink', 'interface description persisted');
  cli.run('configure terminal'); cli.run('hostname changed-after-save');
  eq(net.devices.sw1.startupConfig, saved, 'startup config is a saved snapshot, not a live alias');
  has(cli.run('show startup-config').out, 'hostname access-01', 'startup config displayed');
});
test('IOS command mode resets when the console changes devices', () => {
  const cli = makeCLI(world(), 'sw1');
  cli.run('enable'); cli.run('configure terminal');
  eq(cli.iosMode, 'config', 'in config mode');
  cli.on('h1');
  eq(cli.iosMode, 'user', 'new console starts in user EXEC');
  eq(cli.run('configure terminal').code, 1, 'privilege required on new device');
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
