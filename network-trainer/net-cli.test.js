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
  eq(cli.run('hostname BRANCH-R1').code,0,'generate config event');
  has(cli.run('show logging').out,'Forwarded messages: 3','forwarding count');
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

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
