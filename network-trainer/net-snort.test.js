'use strict';
const assert = require('assert');
const M = require('./net-model');
const B = require('./net-builder');
const { makeCLI, brandsForKind } = require('./net-cli');

const ip = M.ip;
const net = {
  devices: {
    h1: { kind: 'host', ifaces: { eth0: { ip: ip('10.0.1.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }] },
    snort1: { kind: 'router', brand: 'snort3', displayType: 'Snort 3 IDS/IPS', ifaces: {
      eth0: { ip: ip('10.0.1.1'), mask: 24, up: true }, eth1: { ip: ip('10.0.2.1'), mask: 24, up: true }
    }, routes: [], acls: [], snort3: { enabled: true, mode: 'ids', rules: [], alerts: [] } },
    h2: { kind: 'host', ifaces: { eth0: { ip: ip('10.0.2.10'), mask: 24, up: true } }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }] }
  },
  links: [
    { a: ['h1','eth0'], b: ['snort1','eth0'], up: true },
    { a: ['snort1','eth1'], b: ['h2','eth0'], up: true }
  ]
};

const cli = makeCLI(net, 'snort1');
assert(brandsForKind('router').includes('snort3'), 'Snort profile is available for router appliances');
assert.strictEqual(cli.run('snort rule add 1000001 tcp 80 drop HTTP exploit test').code, 0);
assert.strictEqual(cli.run('snort mode ids').code, 0);
const packet = { src: ip('10.0.1.10'), dst: ip('10.0.2.10'), proto: 'tcp', dport: 80 };
let result = M.forward(net, 'h1', packet);
assert.strictEqual(result.ok, true, 'IDS mode must alert without blocking');
assert.strictEqual(net.devices.snort1.snort3.alerts.length, 1, 'IDS mode records a matching alert');
assert.strictEqual(net.devices.snort1.snort3.alerts[0].sid, 1000001);

assert.strictEqual(cli.run('snort mode ips').code, 0);
result = M.forward(net, 'h1', packet);
assert.strictEqual(result.ok, false, 'IPS mode must block a matching drop rule');
assert.match(result.reason, /Snort 3 IPS rule 1000001/);
assert.strictEqual(net.devices.snort1.snort3.alerts.length, 2, 'IPS mode records the block event');

assert.match(cli.run('show snort alerts').out, /HTTP exploit test/);
assert.strictEqual(cli.run('snort alerts clear').code, 0);
assert.strictEqual(net.devices.snort1.snort3.alerts.length, 0);
assert.match(cli.run('show snort status').out, /Mode: IPS/);

const topology = B.blank();
const appliance = B.addDevice(topology, 'snort');
assert.strictEqual(appliance, 'snort1');
assert.strictEqual(topology.devices[appliance].brand, 'snort3');
assert.strictEqual(topology.devices[appliance].kind, 'router');
assert.strictEqual(topology.devices[appliance].snort3.mode, 'ids');
assert.strictEqual(B.cloneDevice(topology, appliance), 'snort2');

console.log('Snort 3 IDS/IPS tests passed.');
