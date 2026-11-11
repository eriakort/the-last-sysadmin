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


test('IOS named extended ACLs enforce sequence order, wildcard matches and implicit deny', () => {
  const net = world(), host = makeCLI(net, 'h1'), fw = makeCLI(net, 'r1');
  host.run('ip addr add 10.0.1.10/24 dev eth0'); host.run('ip route add default via 10.0.1.1');
  fw.run('enable'); fw.run('configure terminal');
  eq(fw.run('ip access-list extended OFFICE-IN').code, 0, 'enter ACL');
  eq(fw.iosMode, 'acl', 'ACL submode');
  eq(fw.run('10 deny ip any any').code, 0, 'shadowing deny');
  eq(fw.run('20 permit tcp 10.0.1.0 0.0.0.255 host 10.0.2.10 eq 80').code, 0, 'narrow permit');
  fw.run('exit'); fw.run('interface eth0');
  eq(fw.run('ip access-group OFFICE-IN in').code, 0, 'bind inbound');
  fw.run('end');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }).ok, false, 'first deny shadows permit');
  fw.run('configure terminal'); fw.run('ip access-list extended OFFICE-IN');
  eq(fw.run('no 10').code, 0, 'remove sequence 10');
  eq(fw.run('no 20').code, 0, 'remove sequence 20');
  eq(fw.run('10 permit tcp 10.0.1.0 0.0.0.255 host 10.0.2.10 eq 80').code, 0, 'permit first');
  eq(fw.run('20 deny ip any any').code, 0, 'deny remainder');
  fw.run('end');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }).ok, true, 'permitted HTTP passes');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 22 }).ok, false, 'unmatched SSH denied');
  has(fw.run('show access-lists OFFICE-IN').out, '10 permit tcp', 'ordered ACL displayed');
  has(fw.run('show access-lists OFFICE-IN').out, 'matches', 'hit counters displayed');
  has(fw.run('show ip interface eth0').out, 'Inbound access list is OFFICE-IN', 'binding displayed');
  has(fw.run('show running-config').out, 'ip access-group OFFICE-IN in', 'binding saved in running config');
});
test('IOS outbound ACLs filter egress and can be detached', () => {
  const net = world(), host = makeCLI(net, 'h1'), fw = makeCLI(net, 'r1');
  host.run('ip addr add 10.0.1.10/24 dev eth0'); host.run('ip route add default via 10.0.1.1');
  fw.run('enable'); fw.run('configure terminal'); fw.run('ip access-list extended BLOCK-WEB');
  fw.run('10 deny tcp any host 10.0.2.10 eq 80'); fw.run('20 permit ip any any'); fw.run('exit');
  fw.run('interface eth1'); eq(fw.run('ip access-group BLOCK-WEB out').code, 0, 'bind outbound'); fw.run('end');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }).ok, false, 'outbound denied');
  fw.run('configure terminal'); fw.run('interface eth1');
  eq(fw.run('no ip access-group BLOCK-WEB out').code, 0, 'detach'); fw.run('end');
  eq(C.reachable(net, 'h1', 'h2', { proto: 'tcp', dport: 80 }).ok, true, 'restored');
});
test('IOS ACL parser rejects malformed entries and unknown bindings', () => {
  const cli = makeCLI(world(), 'r1'); cli.run('enable'); cli.run('configure terminal'); cli.run('ip access-list extended CHECK');
  eq(cli.run('permit tcp 10.0.1.0 0.0.0.999 any eq 443').code, 1, 'bad wildcard');
  eq(cli.run('permit gre any any').code, 1, 'unsupported protocol');
  eq(cli.run('permit tcp any any eq 70000').code, 1, 'bad port');
  cli.run('exit'); cli.run('interface eth0');
  eq(cli.run('ip access-group MISSING in').code, 1, 'unknown ACL');
});


test('ASA network and service object-groups enforce reusable partner HTTPS policy', () => {
  const net = {
    devices: {
      partner:{id:'partner',kind:'host',ifaces:{eth0:{ip:ip('203.0.113.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('203.0.113.1')}]},
      attacker:{id:'attacker',kind:'host',ifaces:{eth0:{ip:ip('203.0.113.50'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('203.0.113.1')}]},
      app:{id:'app',kind:'host',ifaces:{eth0:{ip:ip('10.0.2.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('10.0.2.1')}],services:{443:'https',80:'http',22:'ssh'}},
      asa:{id:'asa',kind:'firewall',firewallOS:'asa',ifaces:{outside:{ip:ip('203.0.113.1'),mask:24,up:true,nameif:'outside',securityLevel:0},inside:{ip:ip('10.0.2.1'),mask:24,up:true,nameif:'inside',securityLevel:100}},routes:[],acls:[],nat:[]},
      sw1:sw('sw1',['p1','p2','p3']),sw2:sw('sw2',['p1','p2'])
    },
    links:[link('partner','eth0','sw1','p1'),link('attacker','eth0','sw1','p2'),link('asa','outside','sw1','p3'),link('app','eth0','sw2','p1'),link('asa','inside','sw2','p2')]
  };
  const asa=makeCLI(net,'asa'); asa.run('enable'); asa.run('configure terminal');
  asa.run('object-group network APPROVED_PARTNERS');
  eq(asa.run('network-object 203.0.113.0 255.255.255.240').code,0,'add approved subnet');
  asa.run('exit'); asa.run('object-group network PORTAL_SERVERS');
  eq(asa.run('network-object host 10.0.2.10').code,0,'add portal host');
  asa.run('exit'); asa.run('object-group service PORTAL_TCP');
  eq(asa.run('service-object tcp destination eq 443').code,0,'add HTTPS service');
  asa.run('exit');
  eq(asa.run('access-list PARTNER_IN extended permit tcp object-group APPROVED_PARTNERS object-group PORTAL_SERVERS object-group PORTAL_TCP').code,0,'reference all groups in ACL');
  eq(asa.run('access-group PARTNER_IN in interface outside').code,0,'apply grouped ACL');
  asa.run('end');
  eq(M.forward(net,'partner',{src:ip('203.0.113.10'),dst:ip('10.0.2.10'),proto:'tcp',dport:443}).ok,true,'approved partner HTTPS allowed');
  eq(M.forward(net,'partner',{src:ip('203.0.113.10'),dst:ip('10.0.2.10'),proto:'tcp',dport:22}).ok,false,'partner SSH denied');
  eq(M.forward(net,'attacker',{src:ip('203.0.113.50'),dst:ip('10.0.2.10'),proto:'tcp',dport:443}).ok,false,'unapproved source denied');
  has(asa.run('show object-group APPROVED_PARTNERS').out,'203.0.113.0','network group visible');
  has(asa.run('show access-list PARTNER_IN').out,'object-group PORTAL_TCP','service group reference visible');
  eq(asa.run('show access-list PARTNER_IN').out.includes('(1 match)'),true,'grouped rule hit counter increments');
  asa.run('enable');
  has(asa.run('clear access-list PARTNER_IN').out,'Cleared hit counters on 1','counter clear reports entries');
  has(asa.run('show access-list PARTNER_IN').out,'(0 matches)','counter reset visible');
  eq(asa.run('configure terminal').code,0,'re-enter configuration');
  eq(asa.run('no object-group network APPROVED_PARTNERS').code,1,'referenced group cannot be removed');
  asa.run('end'); eq(asa.run('write memory').code,0,'save object groups');
  has(asa.run('show running-config').out,'object-group service PORTAL_TCP','service group saved');
  has(asa.run('show running-config').out,'access-list PARTNER_IN extended permit tcp object-group APPROVED_PARTNERS','grouped ACL saved');
});

test('ASA profile publishes HTTPS with object static PAT, inbound ACL and packet-tracer verification', () => {
  const net = {
    devices: {
      remote: { id:'remote', kind:'host', ifaces:{eth0:{ip:ip('198.51.100.50'),mask:24,up:true}}, routes:[{dest:0,mask:0,via:ip('198.51.100.10')}] },
      web: { id:'web', kind:'host', ifaces:{eth0:{ip:ip('10.0.2.10'),mask:24,up:true}}, routes:[{dest:0,mask:0,via:ip('10.0.2.1')}], services:{443:'https',80:'http',22:'ssh'} },
      asa: { id:'asa',kind:'firewall',firewallOS:'asa',ifaces:{eth0:{ip:ip('198.51.100.10'),mask:24,up:true},eth1:{ip:ip('10.0.2.1'),mask:24,up:true}},routes:[],acls:[],nat:[] },
      sw1:sw('sw1',['p1','p2']), sw2:sw('sw2',['p1','p2'])
    },
    links:[link('remote','eth0','sw1','p1'),link('asa','eth0','sw1','p2'),link('web','eth0','sw2','p1'),link('asa','eth1','sw2','p2')]
  };
  const asa=makeCLI(net,'asa');
  eq(asa.run('configure terminal').code,1,'enable required');
  asa.run('enable'); asa.run('configure terminal');
  asa.run('interface eth0'); eq(asa.run('nameif outside').code,0,'outside nameif'); eq(asa.run('security-level 0').code,0,'outside level'); asa.run('exit');
  asa.run('interface eth1'); eq(asa.run('nameif inside').code,0,'inside nameif'); eq(asa.run('security-level 100').code,0,'inside level'); asa.run('exit');
  eq(asa.run('access-list OUTSIDE_IN extended permit tcp any host 198.51.100.10 eq 443').code,0,'ASA extended ACL syntax');
  eq(asa.run('access-group OUTSIDE_IN in interface outside').code,0,'apply ACL to nameif');
  asa.run('object network WEB-PORTAL'); eq(asa.run('host 10.0.2.10').code,0,'object host');
  eq(asa.run('nat (inside,outside) static interface service tcp 443 443').code,0,'static PAT');
  asa.run('exit'); asa.run('end');
  eq(C.portForward(net,'remote','198.51.100.10',443,'web').ok,true,'public HTTPS forwarded to web server');
  eq(M.forward(net,'remote',{src:ip('198.51.100.50'),dst:ip('198.51.100.10'),proto:'tcp',dport:22}).ok,false,'SSH denied by implicit ACL deny');
  eq(M.forward(net,'remote',{src:ip('198.51.100.50'),dst:ip('198.51.100.10'),proto:'tcp',dport:80}).ok,false,'HTTP denied by implicit ACL deny');
  has(asa.run('show interface ip brief').out,'outside','nameif shown');
  has(asa.run('show access-list OUTSIDE_IN').out,'(1 match)','ACL hit counter shown');
  has(asa.run('show access-group').out,'OUTSIDE_IN in interface outside','ACL binding shown');
  has(asa.run('show nat').out,'WEB-PORTAL','object NAT shown');
  has(asa.run('packet-tracer input outside tcp 198.51.100.50 50000 198.51.100.10 443').out,'Result: ALLOW','packet tracer result');
  eq(asa.run('write memory').code,0,'save ASA config');
  has(asa.run('show running-config').out,'nat (inside,outside) static interface service tcp 443 443','NAT in running config');
  has(asa.run('show running-config').out,'access-group OUTSIDE_IN in interface outside','ACL binding in running config');
  has(net.devices.asa.startupConfig,'hostname asa','startup snapshot saved');
});

test('ASA security levels deny unsolicited low-to-high traffic but permit stateful return traffic', () => {
  const net = {
    devices: {
      remote:{id:'remote',kind:'host',ifaces:{eth0:{ip:ip('198.51.100.50'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('198.51.100.10')}]},
      inside:{id:'inside',kind:'host',ifaces:{eth0:{ip:ip('10.0.2.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('10.0.2.1')}]},
      asa:{id:'asa',kind:'firewall',firewallOS:'asa',ifaces:{eth0:{ip:ip('198.51.100.10'),mask:24,up:true,nameif:'outside',securityLevel:0},eth1:{ip:ip('10.0.2.1'),mask:24,up:true,nameif:'inside',securityLevel:100}},routes:[],acls:[],nat:[]},
      sw1:sw('sw1',['p1','p2']),sw2:sw('sw2',['p1','p2'])
    },
    links:[link('remote','eth0','sw1','p1'),link('asa','eth0','sw1','p2'),link('inside','eth0','sw2','p1'),link('asa','eth1','sw2','p2')]
  };
  const unsolicited=M.forward(net,'remote',{src:ip('198.51.100.50'),dst:ip('10.0.2.10'),proto:'tcp',dport:443});
  eq(unsolicited.ok,false,'outside cannot initiate into inside');
  has(unsolicited.reason,'security-level','policy reason');
  eq(M.ping(net,'inside',ip('198.51.100.50'),{proto:'tcp',dport:443}).ok,true,'inside-initiated flow and its return are stateful');
});

test('ASA command parser rejects bad interfaces, ports, levels and unsupported IOS syntax', () => {
  const net={devices:{asa:{id:'asa',kind:'firewall',firewallOS:'asa',ifaces:{eth0:{ip:ip('192.0.2.1'),mask:24,up:true}},routes:[],acls:[],nat:[]}},links:[]};
  const cli=makeCLI(net,'asa'); cli.run('enable'); cli.run('configure terminal');
  cli.run('interface eth0');
  eq(cli.run('security-level 101').code,1,'reject invalid security level');
  eq(cli.run('nameif outside').code,0,'name interface');
  cli.run('exit');
  eq(cli.run('access-group MISSING in interface outside').code,1,'reject missing ACL');
  eq(cli.run('access-list BAD extended permit tcp any host 192.0.2.1 eq 70000').code,1,'reject invalid port');
  eq(cli.run('access-list TEST line 5 extended deny tcp any any eq 22').code,0,'add numbered ASA ACL line');
  eq(cli.run('access-list TEST extended permit tcp any any eq 443').code,0,'append ASA ACL line');
  eq(cli.run('no access-list TEST line 5').code,0,'remove selected ASA ACL line');
  has(cli.run('show access-list TEST').out,'permit tcp','remaining ACL line shown');
  eq(cli.run('route outside 203.0.113.0 255.255.255.0 192.0.2.254 1').code,0,'add ASA static route');
  has(cli.run('show route').out,'203.0.113.0/24','static route visible');
  eq(cli.run('no route outside 203.0.113.0 255.255.255.0').code,0,'remove ASA static route');
  eq(cli.run('ip access-list extended IOS-SYNTAX').code,1,'IOS ACL syntax not accepted on ASA');
  eq(cli.run('object network BAD').code,0,'enter object');
  eq(cli.run('nat (inside,outside) static interface service tcp 443 80').code,1,'reject unsupported port translation');
});


test('IOS DHCP relay allocates an excluded-range-aware lease and delivers DNS options', () => {
  const net = {
    devices: {
      h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] },
      srv: { id: 'srv', kind: 'host', ifaces: { eth0: { ip: ip('10.0.2.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }], services: { 53: 'dns', 67: 'dhcp', 123: 'ntp', 514: 'syslog' }, dns: { 'portal.branch.local': ip('10.0.2.20') }, ntp: { master: true, stratum: 3 }, syslogCollector: true },
      portal: { id: 'portal', kind: 'host', ifaces: { eth0: { ip: ip('10.0.2.20'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }] },
      r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [] },
      sw1: sw('sw1', ['p1','p2']), sw2: sw('sw2', ['p1','p2','p3'])
    },
    links: [link('h1','eth0','sw1','p1'),link('r1','eth0','sw1','p2'),link('portal','eth0','sw2','p1'),link('srv','eth0','sw2','p2'),link('r1','eth1','sw2','p3')]
  };
  const server = makeCLI(net, 'srv'); server.run('enable'); server.run('configure terminal');
  eq(server.run('ip dhcp excluded-address 10.0.1.1 10.0.1.20').code, 0, 'exclude infrastructure range');
  eq(server.run('ip dhcp pool BRANCH').code, 0, 'create pool');
  eq(server.run('network 10.0.1.0 255.255.255.0').code, 0, 'pool network');
  eq(server.run('default-router 10.0.1.1').code, 0, 'pool gateway');
  eq(server.run('dns-server 10.0.2.10').code, 0, 'pool DNS');
  eq(server.run('domain-name branch.local').code, 0, 'pool domain');
  eq(server.run('lease 7').code, 0, 'pool lease');
  server.run('exit'); server.run('end');
  const router = makeCLI(net, 'r1'); router.run('enable'); router.run('configure terminal');
  router.run('interface eth0'); eq(router.run('ip helper-address 10.0.2.10').code, 0, 'configure relay');
  router.run('exit'); router.run('ip name-server 10.0.2.10');
  const client = makeCLI(net, 'h1');
  const lease = client.run('dhclient eth0');
  eq(lease.code, 0, 'relay returns a lease'); has(lease.out, '10.0.1.21', 'excluded range skipped');
  eq(net.devices.h1.resolver, ip('10.0.2.10'), 'DNS option applied');
  eq(client.run('dig portal.branch.local').code, 0, 'DNS resolution works after lease');
  has(server.run('show ip dhcp binding').out, '10.0.1.21', 'server binding visible');
  has(server.run('show ip dhcp pool').out, '10.0.1.0/24', 'pool operational state visible');
  has(router.run('show running-config').out, 'ip helper-address 10.0.2.10', 'relay persists');
});

test('IOS NTP status distinguishes an unsynchronized clock from a reachable master', () => {
  const net = { devices: {
    r1: { id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.0.2.1'),mask:24,up:true}},routes:[] },
    srv: { id:'srv',kind:'host',ifaces:{eth0:{ip:ip('10.0.2.10'),mask:24,up:true}},routes:[],services:{123:'ntp'},ntp:{master:true,stratum:3} },
    sw: sw('sw',['p1','p2'])
  }, links:[link('r1','eth0','sw','p1'),link('srv','eth0','sw','p2')] };
  const cli=makeCLI(net,'r1'); cli.run('enable'); cli.run('configure terminal');
  has(cli.run('show ntp status').out,'unsynchronized','initial state');
  eq(cli.run('ntp server 10.0.2.10').code,0,'configure NTP peer');
  const status=cli.run('show ntp status').out;
  has(status,'synchronized','clock sync state'); has(status,'10.0.2.10','reference');
  has(cli.run('show ntp associations').out,'synchronized','association state');
  has(cli.run('show running-config').out,'ntp server 10.0.2.10','NTP config persists');
});

test('IOS syslog forwards configuration events to a reachable collector and applies severity', () => {
  const net = { devices: {
    r1: { id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.0.2.1'),mask:24,up:true}},routes:[] },
    log1: { id:'log1',kind:'host',ifaces:{eth0:{ip:ip('10.0.2.10'),mask:24,up:true}},routes:[],services:{514:'syslog'},syslogCollector:true },
    sw: sw('sw',['p1','p2'])
  }, links:[link('r1','eth0','sw','p1'),link('log1','eth0','sw','p2')] };
  const cli=makeCLI(net,'r1'); cli.run('enable'); cli.run('configure terminal');
  eq(cli.run('logging host 10.0.2.10').code,0,'configure collector');
  eq(cli.run('logging trap informational').code,0,'configure trap');
  eq(cli.run('logging source-interface eth0').code,0,'configure source interface');
  eq(cli.run('hostname BRANCH-R1').code,0,'generate config event');
  has(cli.run('show logging').out,'Forwarded messages: 4','forwarding count');
  const collector=makeCLI(net,'log1').run('show logging').out;
  has(collector,'BRANCH-R1','collector sees sender');
  has(collector,'CONFIG: hostname BRANCH-R1','collector sees configuration change');
  has(collector,'10.0.2.1','configured source-interface address is used');
  has(cli.run('show running-config').out,'logging host 10.0.2.10','syslog config persists');
});


test('IOS local DNS host entries resolve without an upstream resolver', () => {
  const net = { devices: {
    r1: { id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.0.2.1'),mask:24,up:true}},routes:[] }
  }, links:[] };
  const cli=makeCLI(net,'r1'); cli.run('enable'); cli.run('configure terminal');
  eq(cli.run('ip host portal.branch.local 10.0.2.20').code,0,'configure local host');
  has(cli.run('show hosts').out,'portal.branch.local','host table entry');
  cli.run('end');
  const resolved=cli.run('dig portal.branch.local');
  eq(resolved.code,0,'local name resolves without resolver'); has(resolved.out,'10.0.2.20','local address');
  has(cli.run('show running-config').out,'ip host portal.branch.local 10.0.2.20','local host persists');
});

test('incomplete DHCP pools fail cleanly and report server statistics', () => {
  const net={devices:{srv:{id:'srv',kind:'host',ifaces:{eth0:{ip:ip('10.0.1.1'),mask:24,up:true}},routes:[]},h1:{id:'h1',kind:'host',ifaces:{eth0:{up:true}},routes:[]}},links:[link('srv','eth0','h1','eth0')]};
  const server=makeCLI(net,'srv');server.run('enable');server.run('configure terminal');server.run('ip dhcp pool EMPTY');server.run('exit');
  const client=makeCLI(net,'h1');
  const lease=client.run('dhclient eth0');eq(lease.code,1,'incomplete pool rejected');has(lease.out,'no network statement','clear failure reason');
  has(server.run('show ip dhcp server statistics').out,'Bindings: 0','statistics show no bindings');
});


test('IOS OSPF forms neighbors, floods multi-hop routes and forwards end to end', () => {
  const net = { devices: {
    h1:{id:'h1',kind:'host',ifaces:{eth0:{ip:ip('10.1.1.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('10.1.1.1')}]},
    h3:{id:'h3',kind:'host',ifaces:{eth0:{ip:ip('10.3.3.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('10.3.3.1')}]},
    r1:{id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.1.1.1'),mask:24,up:true},eth1:{ip:ip('10.0.12.1'),mask:30,up:true}},routes:[]},
    r2:{id:'r2',kind:'router',ifaces:{eth0:{ip:ip('10.0.12.2'),mask:30,up:true},eth1:{ip:ip('10.0.23.1'),mask:30,up:true}},routes:[]},
    r3:{id:'r3',kind:'router',ifaces:{eth0:{ip:ip('10.0.23.2'),mask:30,up:true},eth1:{ip:ip('10.3.3.1'),mask:24,up:true}},routes:[]},
    s1:sw('s1',['p1','p2']),s2:sw('s2',['p1','p2']),s3:sw('s3',['p1','p2']),s4:sw('s4',['p1','p2'])
  },links:[
    link('h1','eth0','s1','p1'),link('r1','eth0','s1','p2'),
    link('r1','eth1','s2','p1'),link('r2','eth0','s2','p2'),
    link('r2','eth1','s3','p1'),link('r3','eth0','s3','p2'),
    link('r3','eth1','s4','p1'),link('h3','eth0','s4','p2')
  ]};
  const configure=(id,networks,passive=[])=>{
    const c=makeCLI(net,id);c.run('enable');c.run('configure terminal');eq(c.run('router ospf 10').code,0,'enter OSPF process');
    c.run('router-id '+({r1:'1.1.1.1',r2:'2.2.2.2',r3:'3.3.3.3'}[id]));
    for(const n of networks)eq(c.run('network '+n+' area 0').code,0,'add OSPF network');
    for(const p of passive)eq(c.run('passive-interface '+p).code,0,'set passive interface');
    c.run('end');return c;
  };
  const r1=configure('r1',['10.1.1.0 0.0.0.255','10.0.12.0 0.0.0.3'],['eth0']);
  configure('r2',['10.0.12.0 0.0.0.3','10.0.23.0 0.0.0.3']);
  configure('r3',['10.0.23.0 0.0.0.3','10.3.3.0 0.0.0.255'],['eth1']);
  eq(M.ospfNeighbors(net,'r1').length,1,'R1 forms one adjacency');
  eq(M.ospfNeighbors(net,'r2').length,2,'R2 forms two adjacencies');
  eq(M.ospfNeighbors(net,'r3').length,1,'R3 forms one adjacency');
  eq(C.ospfRoute(net,'r1','10.3.3.0/24').ok,true,'R1 learns remote LAN over two hops');
  has(r1.run('show ip route').out,'O    10.3.3.0/24','OSPF route appears in route table');
  has(r1.run('show ip ospf neighbor').out,'2.2.2.2','neighbor router ID displayed');
  has(r1.run('show ip ospf interface brief').out,'eth0','passive LAN remains advertised');
  eq(C.reachable(net,'h1','h3').ok,true,'end-to-end traffic uses OSPF routes');
  has(r1.run('show running-config').out,'router ospf 10','OSPF process persists');
  has(r1.run('show running-config').out,'passive-interface eth0','passive interface persists');
});

test('IOS OSPF does not form adjacencies across area mismatch, passive ports or shutdown links', () => {
  const net={devices:{
    r1:{id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.0.0.1'),mask:30,up:true}},routes:[]},
    r2:{id:'r2',kind:'router',ifaces:{eth0:{ip:ip('10.0.0.2'),mask:30,up:true}},routes:[]},
    s:sw('s',['p1','p2'])
  },links:[link('r1','eth0','s','p1'),link('r2','eth0','s','p2')]};
  const a=makeCLI(net,'r1'),b=makeCLI(net,'r2');
  for(const [c,area] of [[a,0],[b,1]]){c.run('enable');c.run('configure terminal');c.run('router ospf 1');c.run('network 10.0.0.0 0.0.0.3 area '+area);c.run('end');}
  eq(M.ospfNeighbors(net,'r1').length,0,'area mismatch prevents adjacency');
  b.run('configure terminal');b.run('router ospf 1');b.run('network 10.0.0.0 0.0.0.3 area 0');b.run('passive-interface eth0');b.run('end');
  eq(M.ospfNeighbors(net,'r1').length,0,'passive interface prevents adjacency');
  b.run('configure terminal');b.run('router ospf 1');b.run('no passive-interface eth0');b.run('end');
  eq(M.ospfNeighbors(net,'r1').length,1,'matching active interfaces form adjacency');
  b.run('configure terminal');b.run('interface eth0');b.run('shutdown');b.run('end');
  eq(M.ospfNeighbors(net,'r1').length,0,'shutdown interface drops adjacency');
});

test('IOS OSPF rejects invalid networks and supports removing a network statement', () => {
  const net={devices:{r1:{id:'r1',kind:'router',ifaces:{eth0:{ip:ip('10.0.0.1'),mask:24,up:true}},routes:[]}},links:[]};
  const c=makeCLI(net,'r1');c.run('enable');c.run('configure terminal');c.run('router ospf 1');
  eq(c.run('network invalid 0.0.0.255 area 0').code,1,'invalid network rejected');
  eq(c.run('network 10.0.0.0 0.0.0.255 area 0').code,0,'valid network accepted');
  has(c.run('show ip ospf interface brief').out,'eth0','interface matched');
  eq(c.run('no network 10.0.0.0 0.0.0.255 area 0').code,0,'remove network statement');
  eq(c.run('show ip ospf interface brief').out.includes('eth0'),false,'interface no longer enabled');
});


test('BGP prefix-lists filter advertisements and received routes per neighbor direction', () => {
  const net={devices:{
    customer:{id:'customer',kind:'router',ifaces:{lan:{ip:ip('10.10.10.1'),mask:24,up:true},dmz:{ip:ip('198.51.100.1'),mask:24,up:true},wan:{ip:ip('203.0.113.2'),mask:30,up:true}},routes:[],bgp:{asn:65010,neighbors:[{ip:ip('203.0.113.1'),remoteAs:64500}],networks:['10.10.10.0/24','198.51.100.0/24'],prefixLists:{}}},
    provider:{id:'provider',kind:'router',ifaces:{wan:{ip:ip('203.0.113.1'),mask:30,up:true},internet:{ip:ip('192.0.2.1'),mask:24,up:true}},routes:[],bgp:{asn:64500,neighbors:[{ip:ip('203.0.113.2'),remoteAs:65010}],networks:['192.0.2.0/24'],prefixLists:{}}}
  },links:[link('customer','wan','provider','wan')]};
  const edge=makeCLI(net,'customer'), isp=makeCLI(net,'provider');
  eq(M.bgpSessions(net,'customer')[0].up,true,'eBGP session established');
  eq(C.bgpRoute(net,'provider','10.10.10.0/24').ok,true,'unfiltered private route is initially leaked');
  eq(edge.run('bgp prefix-list CUSTOMER-OUT permit 198.51.100.0/24').code,0,'permit customer public DMZ');
  eq(edge.run('bgp prefix-list CUSTOMER-OUT deny 10.10.10.0/24').code,0,'deny customer private LAN');
  eq(edge.run('bgp neighbor 203.0.113.1 prefix-list CUSTOMER-OUT out').code,0,'attach outbound policy');
  eq(C.bgpRoute(net,'provider','198.51.100.0/24').ok,true,'public route remains advertised');
  eq(C.bgpRouteAbsent(net,'provider','10.10.10.0/24').ok,true,'private route withdrawn');
  eq(isp.run('bgp prefix-list PROVIDER-IN permit 198.51.100.0/24').code,0,'permit provider service prefix');
  eq(isp.run('bgp neighbor 203.0.113.2 prefix-list PROVIDER-IN in').code,0,'attach inbound policy');
  eq(C.bgpRoute(net,'customer','192.0.2.0/24').ok,true,'permitted provider route received');
  has(edge.run('show ip bgp summary').out,'Established','summary reports session state');
  has(edge.run('show ip bgp advertised-routes 203.0.113.1').out,'198.51.100.0/24','advertised route view');
  has(edge.run('show ip route').out,'B    192.0.2.0/24','BGP route in routing table');
  edge.run('enable'); edge.run('write memory');
  has(net.devices.customer.startupConfig,'bgp prefix-list CUSTOMER-OUT','prefix-list persisted');
  has(net.devices.customer.startupConfig,'prefix-list CUSTOMER-OUT out','neighbor policy persisted');
});

test('BGP prefix-list sequence order, ge/le matching, implicit deny and invalid input are deterministic', () => {
  const net={devices:{
    a:{id:'a',kind:'router',ifaces:{wan:{ip:ip('203.0.113.1'),mask:30,up:true}},routes:[],bgp:{asn:65001,neighbors:[],networks:[],prefixLists:{}}},
  },links:[]};
  const cli=makeCLI(net,'a');
  eq(cli.run('bgp prefix-list FILTER seq 20 deny 10.0.0.0/8').code,0,'add deny sequence');
  eq(cli.run('bgp prefix-list FILTER seq 10 permit 10.0.0.0/8 ge 16 le 24').code,0,'add earlier more-specific permit');
  eq(cli.run('bgp prefix-list FILTER seq 10 permit 10.0.0.0/8').code,1,'duplicate sequence rejected');
  eq(cli.run('bgp prefix-list BAD permit 10.0.0.0/33').code,1,'invalid prefix rejected');
  eq(M.bgpPrefixListAllows(net.devices.a,'FILTER',ip('10.1.0.0'),16),true,'ge/le permits /16');
  eq(M.bgpPrefixListAllows(net.devices.a,'FILTER',ip('10.1.0.0'),25),false,'/25 denied by later broader deny');
  eq(M.bgpPrefixListAllows(net.devices.a,'FILTER',ip('172.16.0.0'),16),false,'implicit deny applies');
  eq(cli.run('bgp no prefix-list FILTER seq 10').code,0,'remove one sequence');
  eq(M.bgpPrefixListAllows(net.devices.a,'FILTER',ip('10.1.0.0'),16),false,'remaining deny now matches');
});


test('HSRP elects an active gateway and tracks an uplink to fail over without changing the host gateway', () => {
  const net={devices:{
    pc:{id:'pc',kind:'host',ifaces:{eth0:{ip:ip('10.20.0.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('10.20.0.1')}]},
    r1:{id:'r1',kind:'router',ifaces:{lan:{ip:ip('10.20.0.2'),mask:24,up:true},wan:{ip:ip('203.0.113.2'),mask:24,up:true}},routes:[]},
    r2:{id:'r2',kind:'router',ifaces:{lan:{ip:ip('10.20.0.3'),mask:24,up:true},wan:{ip:ip('203.0.113.3'),mask:24,up:true}},routes:[]},
    swlan:sw('swlan',['p1','p2','p3']), swwan:sw('swwan',['p1','p2','p3']),
    upstream:{id:'upstream',kind:'host',ifaces:{eth0:{ip:ip('203.0.113.10'),mask:24,up:true}},routes:[{dest:0,mask:0,via:ip('203.0.113.254')}]}
  },links:[
    link('pc','eth0','swlan','p1'),link('r1','lan','swlan','p2'),link('r2','lan','swlan','p3'),
    link('r1','wan','swwan','p1'),link('r2','wan','swwan','p2'),link('upstream','eth0','swwan','p3')
  ]};
  const r1=makeCLI(net,'r1'),r2=makeCLI(net,'r2');
  for (const [cli,lan,wan,priority] of [[r1,'lan','wan',110],[r2,'lan','wan',100]]) {
    cli.run('enable'); cli.run('configure terminal'); cli.run('interface '+lan);
    eq(cli.run('standby 10 ip 10.20.0.1').code,0,'configure shared virtual gateway');
    eq(cli.run('standby 10 priority '+priority).code,0,'set HSRP priority');
    eq(cli.run('standby 10 preempt').code,0,'enable preemption');
    if (lan==='lan' && cli===r1) eq(cli.run('standby 10 track wan decrement 30').code,0,'track WAN uplink');
    cli.run('exit'); cli.run('interface wan');
    eq(cli.run('standby 20 ip 203.0.113.254').code,0,'configure WAN-side virtual gateway');
    eq(cli.run('standby 20 priority '+priority).code,0,'set WAN-side priority');
    cli.run('exit'); cli.run('end');
  }
  eq(M.hsrpStatus(net,'r1','lan').state,'Active','higher priority router initially active');
  eq(M.hsrpStatus(net,'r2','lan').state,'Standby','secondary router initially standby');
  eq(M.ping(net,'pc',ip('203.0.113.10')).ok,true,'host reaches upstream through virtual gateway');
  eq(r1.run('show standby brief').out.includes('Active'),true,'standby summary shows active router');
  r1.run('configure terminal'); r1.run('interface wan');
  eq(r1.run('shutdown').code,0,'simulate primary WAN failure');
  eq(M.hsrpStatus(net,'r1','lan').state,'Standby','tracked uplink failure reduces primary priority');
  eq(M.hsrpStatus(net,'r2','lan').state,'Active','backup takes over virtual gateway');
  eq(M.ping(net,'pc',ip('203.0.113.10')).ok,true,'host connectivity survives gateway failover');
  r1.run('end'); r1.run('configure terminal'); r1.run('interface wan'); r1.run('no shutdown');
  eq(M.hsrpStatus(net,'r1','lan').state,'Active','preempt returns primary after recovery');
  r1.run('end'); r1.run('enable'); r1.run('write memory');
  has(net.devices.r1.startupConfig,'standby 10 ip 10.20.0.1','virtual IP persists');
  has(net.devices.r1.startupConfig,'standby 10 track wan decrement 30','uplink tracking persists');
});

test('HSRP rejects invalid groups, priorities, tracked interfaces and virtual IP subnets', () => {
  const net={devices:{r:{id:'r',kind:'router',ifaces:{lan:{ip:ip('10.0.0.2'),mask:24,up:true},wan:{ip:ip('192.0.2.2'),mask:24,up:true}},routes:[]}},links:[]};
  const cli=makeCLI(net,'r'); cli.run('enable'); cli.run('configure terminal'); cli.run('interface lan');
  eq(cli.run('standby 256 ip 10.0.0.1').code,1,'group out of range rejected');
  eq(cli.run('standby 1 ip 10.1.0.1').code,1,'off-subnet virtual IP rejected');
  eq(cli.run('standby 1 ip 10.0.0.1').code,0,'valid HSRP group');
  eq(cli.run('standby 1 priority 300').code,1,'priority out of range rejected');
  eq(cli.run('standby 1 track missing decrement 20').code,1,'unknown tracked interface rejected');
  eq(cli.run('standby 1 track wan decrement 20').code,0,'valid tracking accepted');
});

test('help presents network commands in readable groups with short descriptions', () => {
  // A router shows the fullest set of groups (routing + services + security).
  const net = { devices: { r1: { id: 'r1', kind: 'router', ifaces: { eth0: { up: true } } } }, links: [] };
  const cli = makeCLI(net, 'r1');
  const help = cli.run('help');
  eq(help.code, 0, 'help succeeds');
  has(help.out, 'DEVICE AND INTERFACE', 'interface group');
  has(help.out, 'IP ROUTING', 'routing group');
  has(help.out, 'CONNECTIVITY AND DIAGNOSTICS', 'diagnostics group');
  has(help.out, 'NETWORK SERVICES', 'services group');
  has(help.out, 'SECURITY AND FIREWALL', 'security group');
  has(help.out, 'ping <host|ip>', 'ping usage');
  has(help.out, 'Test whether a destination is reachable', 'ping explanation');
  has(help.out, 'ip helper-address <ip>', 'DHCP relay usage');
  has(help.out, 'Relay DHCP requests to another subnet', 'DHCP relay explanation');
  eq(help.out.includes('commands: ip,'), false, 'old compressed command list removed');
  eq(help.out.includes('\\n'), false, 'reference contains real line breaks, not literal escape sequences');
  eq(help.out.split('\n').length > 35, true, 'reference is presented as separate lines');
});

test('ASA help separates firewall setup, objects, access control and troubleshooting', () => {
  const net = { devices: { fw: { id: 'fw', kind: 'firewall', firewallOS: 'asa', ifaces: {}, routes: [] } }, links: [] };
  const help = makeCLI(net, 'fw').run('help');
  eq(help.code, 0, 'ASA help succeeds');
  has(help.out, 'ASA FIREWALL COMMANDS', 'ASA heading');
  has(help.out, 'NETWORK OBJECTS', 'object group');
  has(help.out, 'ACCESS CONTROL AND NAT', 'policy group');
  has(help.out, 'Permit or deny matching traffic', 'access-list description');
  has(help.out, 'implicit deny rule', 'security behaviour explained');
  eq(help.out.includes('\\n'), false, 'ASA help contains real line breaks, not literal escape sequences');
  eq(help.out.split('\n').length > 20, true, 'ASA reference is presented as separate lines');
});

test('help is scoped to the selected device kind', () => {
  const net = { devices: {
    host1: { id: 'host1', kind: 'host', ifaces: { eth0: { up: true } } },
    sw1:   { id: 'sw1', kind: 'switch', ifaces: { p1: { up: true } } },
    r1:    { id: 'r1', kind: 'router', ifaces: { eth0: { up: true } } },
    fw1:   { id: 'fw1', kind: 'firewall', ifaces: { eth0: { up: true } } },
  }, links: [] };
  const cli = makeCLI(net, 'host1');
  const no = (s, sub, m) => { if (String(s).includes(sub)) throw new Error(`${m}: help should not list "${sub}"`); };

  const host = cli.run('help').out;
  has(host, '(host)', 'host header names the kind');
  has(host, 'ping <host|ip>', 'host keeps diagnostics');
  has(host, 'iptables -L', 'host keeps host firewall');
  no(host, 'vlan <id>', 'host');
  no(host, 'router ospf', 'host');
  no(host, 'access-list', 'host');

  const sw = cli.on('sw1').run('help').out;
  has(sw, 'vlan <id>', 'switch keeps VLANs');
  has(sw, 'show spanning-tree', 'switch keeps STP');
  no(sw, 'router ospf', 'switch');
  no(sw, 'iptables', 'switch');

  const r = cli.on('r1').run('help').out;
  has(r, 'router ospf <process-id>', 'router keeps OSPF');
  has(r, 'show ip bgp', 'router keeps BGP');
  has(r, 'ip dhcp pool <name>', 'router keeps DHCP services');
  no(r, 'switchport', 'router');
  no(r, 'vlan <id>', 'router');

  const fw = cli.on('fw1').run('help').out;
  has(fw, 'packet-tracer input ...', 'firewall keeps packet-tracer');
  has(fw, 'access-list ...', 'firewall keeps ACLs');
  no(fw, 'vlan <id>', 'firewall');
  no(fw, 'router ospf', 'firewall');

  has(cli.on('r1').run('?').out, 'router ospf <process-id>', '? is a scoped alias for help');
});

test('a cisco-ios device presents an IOS-only command surface', () => {
  const net = { devices: {
    r1: { id: 'r1', kind: 'router', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true } }, routes: [] },
    rc: { id: 'rc', kind: 'router', brand: 'cisco-ios', ifaces: { eth0: { ip: ip('10.0.1.2'), mask: 24, up: true } }, routes: [] },
  }, links: [] };
  const cli = makeCLI(net, 'rc');
  const no = (s, sub, m) => { if (String(s).includes(sub)) throw new Error(`${m}: should not include "${sub}"`); };

  // Help is brand-scoped and names the brand.
  const h = cli.run('help').out;
  has(h, 'Cisco IOS', 'header names the brand');
  has(h, 'router ospf <process-id>', 'keeps IOS routing commands');
  has(h, 'show ip interface brief', 'keeps IOS show commands');
  no(h, 'ip addr ', 'hides Linux ip addr');
  no(h, 'nmap', 'hides Linux nmap');
  no(h, 'iptables', 'hides Linux iptables');

  // Linux-dialect commands are rejected with an IOS redirect; IOS commands work.
  eq(cli.run('iptables -L').code, 1, 'iptables rejected on cisco-ios');
  has(cli.run('iptables -L').out, 'Cisco IOS', 'rejection explains the dialect');
  eq(cli.run('nmap r1').code, 1, 'nmap rejected on cisco-ios');
  eq(cli.run('ip addr').code, 1, 'Linux ip addr rejected on cisco-ios');
  eq(cli.run('show ip interface brief').code, 0, 'IOS show still works');

  // A generic device is unchanged (the 38 existing missions rely on this).
  cli.on('r1');
  eq(cli.run('ip addr').code, 0, 'generic device keeps Linux ip addr');
  has(cli.run('help').out, 'ip addr ', 'generic help still lists Linux tools');
});

test('brand registry: EOS is IOS-family, Junos/PAN-OS are reference, ASA routes to its engine', () => {
  const { brandsForKind } = require('./net-cli');
  const no = (s, sub, m) => { if (String(s).includes(sub)) throw new Error(`${m}: should not include "${sub}"`); };
  const net = { devices: {
    eos: { id: 'eos', kind: 'switch', brand: 'arista-eos', ifaces: { p1: { up: true } } },
    jun: { id: 'jun', kind: 'router', brand: 'juniper-junos', ifaces: { eth0: { up: true } } },
    pan: { id: 'pan', kind: 'firewall', brand: 'paloalto-panos', ifaces: { eth0: { up: true } } },
    asa: { id: 'asa', kind: 'firewall', brand: 'cisco-asa', ifaces: { eth0: { up: true } } },
  }, links: [] };

  // Per-kind availability: ASA/PAN-OS are firewall-only; EOS is switch/router.
  eq(brandsForKind('firewall').includes('paloalto-panos'), true, 'PAN-OS offered on firewalls');
  eq(brandsForKind('router').includes('paloalto-panos'), false, 'PAN-OS not offered on routers');
  eq(brandsForKind('router').includes('arista-eos'), true, 'EOS offered on routers');

  const cli = makeCLI(net, 'eos');
  // Arista EOS behaves as IOS family: Linux blocked, IOS commands kept.
  has(cli.run('help').out, 'Arista EOS', 'EOS names its brand');
  eq(cli.run('iptables -L').code, 1, 'EOS blocks Linux dialect');
  eq(cli.run('show ip interface brief').code, 0, 'EOS runs IOS show');

  // Juniper Junos: reference card with set/commit syntax and the transparency note.
  const jh = cli.on('jun').run('help').out;
  has(jh, 'JUNIPER JUNOS COMMAND REFERENCE', 'Junos card header');
  has(jh, 'set interfaces', 'Junos config syntax');
  has(jh, 'commit', 'Junos commit');
  has(jh, 'Reference profile', 'reference transparency note');

  // Palo Alto PAN-OS: reference card, firewall-flavoured.
  const ph = cli.on('pan').run('help').out;
  has(ph, 'PALO ALTO PAN-OS COMMAND REFERENCE', 'PAN-OS card header');
  has(ph, 'test security-policy-match', 'PAN-OS policy test');
  has(ph, 'set rulebase security', 'PAN-OS rule syntax');

  // Cisco ASA routes to the ASA engine (its own help).
  has(cli.on('asa').run('help').out, 'ASA FIREWALL COMMANDS', 'ASA brand uses the ASA engine');
});

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
