#!/usr/bin/env node
// A scripted terminal session: a learner fixes a broken connection from the CLI.
// Shows the output a real terminal UI would render on top of this layer.
const M = require('./net-model');
const { makeCLI } = require('./net-cli');
const { ip } = M;

const sw = (name, ports) => ({ id: name, kind: 'switch', ifaces: Object.fromEntries(ports.map(p => [p, { up: true }])) });
const link = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });
const net = {
  devices: {
    h1: { id: 'h1', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] },  // blank on purpose
    web: { id: 'web', kind: 'host', ifaces: { eth0: { ip: ip('10.0.2.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }], services: { 80: 'http', 22: 'ssh' } },
    gw: { id: 'gw', kind: 'firewall', ifaces: { eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true } }, routes: [], acls: [] },
    sw1: sw('sw1', ['p1', 'p2']), sw2: sw('sw2', ['p1', 'p2'])
  },
  links: [link('h1', 'eth0', 'sw1', 'p1'), link('gw', 'eth0', 'sw1', 'p2'),
          link('web', 'eth0', 'sw2', 'p1'), link('gw', 'eth1', 'sw2', 'p2')]
};

const cli = makeCLI(net, 'h1');
const script = [
  '# Ticket: "h1 can\'t reach the web server (10.0.2.10). Fix it."',
  'ping web',
  'ip addr',
  'ip addr add 10.0.1.10/24 dev eth0',
  'ping web',
  'ip route add default via 10.0.1.1',
  'ping web',
  'traceroute web',
  'nmap web'
];
for (const line of script) {
  if (line.startsWith('#')) { console.log('\n' + line); continue; }
  console.log('h1:~$ ' + line);
  const r = cli.run(line);
  if (r.out) console.log(r.out);
}
