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

let failed = 0;
for (const [n, f] of tests) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed) process.exit(1);
