#!/usr/bin/env node
// Shows the engine's teachable output: the hop-by-hop path and the exact
// reason a packet succeeds or dies. This is what a learner would see from
// `ping` / `traceroute` and what the grader turns into a hint.
const M = require('./net-model');
const { ip } = M;

const host = (name, a, p, gw) => ({ id: name, kind: 'host', ifaces: { eth0: { ip: ip(a), mask: p, up: true } }, routes: gw ? [{ dest: 0, mask: 0, via: ip(gw) }] : [] });
const sw = (name, ports) => ({ id: name, kind: 'switch', ifaces: Object.fromEntries(ports.map(n => [n, { up: true }])) });
const link = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });

// h1 --- sw1 --- [fw] --- sw2 --- web   (fw blocks telnet inbound on eth0)
const net = {
  devices: {
    h1: host('h1', '10.0.1.10', 24, '10.0.1.1'),
    web: { ...host('web', '10.0.2.10', 24, '10.0.2.1'), services: { 80: 'http', 22: 'ssh' } },
    fw: { id: 'fw', kind: 'firewall', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } },
          routes: [], acls: [{ dir: 'in', dev: 'eth0', action: 'deny', proto: 'tcp', dport: 23 }] },
    sw1: sw('sw1', ['p1', 'p2']), sw2: sw('sw2', ['p1', 'p2'])
  },
  links: [link('h1', 'eth0', 'sw1', 'p1'), link('fw', 'eth0', 'sw1', 'p2'),
          link('web', 'eth0', 'sw2', 'p1'), link('fw', 'eth1', 'sw2', 'p2')]
};

function show(label, dst, base) {
  const r = M.ping(net, 'h1', ip(dst), base);
  const path = (r.forward && r.forward.path || []).join(' → ');
  console.log(`${label.padEnd(26)} ${r.ok ? 'OK  ' : 'FAIL'}  ${r.reason}`);
  console.log(`${''.padEnd(26)} path: ${path}`);
}

console.log('Topology:  h1 —sw1— [firewall] —sw2— web   (firewall denies tcp/23 inbound)\n');
show('ping web (icmp)', '10.0.2.10', {});
show('curl web :80 (allowed)', '10.0.2.10', { proto: 'tcp', dport: 80 });
show('telnet web :23 (blocked)', '10.0.2.10', { proto: 'tcp', dport: 23 });
console.log('\nNow pull the firewall\'s cable to the web subnet (fw eth1 down):\n');
net.devices.fw.ifaces.eth1.up = false;
show('ping web (icmp)', '10.0.2.10', {});
