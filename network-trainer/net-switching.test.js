#!/usr/bin/env node
// VLAN/access/trunk regression tests for the Network Trainer.
const M = require('./net-model');
const { makeCLI } = require('./net-cli');
const ip = M.ip;
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); }
};
const assert = (value, message) => { if (!value) throw new Error(message); };
const host = (id, address) => ({ id, kind: 'host', ifaces: { eth0: { ip: ip(address), mask: 24, up: true } }, routes: [] });
const sw = (id, ports) => ({ id, kind: 'switch', vlans: [1], ifaces: Object.fromEntries(ports.map(([name, cfg]) => [name, { up: true, ...(cfg || {}) }])) });
const link = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });
const connected = (net) => M.ping(net, 'h1', ip('10.0.0.20')).ok;
const command = (cli, device, line, expected = 0) => {
  const result = cli.on(device).run(line);
  assert(result.code === expected, device + '$ ' + line + ' returned ' + result.code + ': ' + result.out);
  return result.out;
};

test('access VLANs isolate endpoints until both ports share a VLAN', () => {
  const net = { devices: {
    h1: host('h1', '10.0.0.10'), srv: host('srv', '10.0.0.20'),
    sw1: sw('sw1', [['p1', { accessVlan: 10 }], ['p2', { accessVlan: 20 }]])
  }, links: [link('h1','eth0','sw1','p1'), link('srv','eth0','sw1','p2')] };
  assert(!connected(net), 'different access VLANs must isolate the hosts');
  const cli = makeCLI(net, 'sw1');
  command(cli, 'sw1', 'vlan 10'); command(cli, 'sw1', 'vlan 20');
  command(cli, 'sw1', 'interface p1'); command(cli, 'sw1', 'switchport mode access');
  command(cli, 'sw1', 'switchport access vlan 20'); command(cli, 'sw1', 'exit');
  command(cli, 'sw1', 'interface p2'); command(cli, 'sw1', 'switchport access vlan 20');
  command(cli, 'sw1', 'exit');
  assert(connected(net), 'hosts in VLAN 20 should reach each other');
});

test('trunks carry allowed VLANs across two switches and block excluded VLANs', () => {
  const net = { devices: {
    h1: host('h1', '10.0.0.10'), srv: host('srv', '10.0.0.20'),
    sw1: sw('sw1', [['p1',{accessVlan:10}],['p2',{mode:'trunk',allowedVlans:[20]}]]),
    sw2: sw('sw2', [['p1',{mode:'trunk',allowedVlans:[20]}],['p2',{accessVlan:10}]])
  }, links: [link('h1','eth0','sw1','p1'),link('sw1','p2','sw2','p1'),link('srv','eth0','sw2','p2')] };
  assert(!connected(net), 'VLAN 10 must not cross trunks that only allow VLAN 20');
  const cli = makeCLI(net, 'sw1');
  command(cli, 'sw1', 'vlan 10');
  command(cli, 'sw2', 'vlan 10');
  command(cli, 'sw1', 'interface p2');
  command(cli, 'sw1', 'switchport trunk allowed vlan 10,20');
  command(cli, 'sw1', 'exit');
  command(cli, 'sw2', 'interface p1');
  command(cli, 'sw2', 'switchport trunk allowed vlan 10,20');
  command(cli, 'sw2', 'exit');
  assert(connected(net), 'VLAN 10 should cross the configured trunk path');
});

test('trunk native VLAN is mapped as untagged and mismatches break the access VLAN path', () => {
  const net = { devices: {
    h1: host('h1', '10.0.0.10'), srv: host('srv', '10.0.0.20'),
    sw1: sw('sw1', [['p1',{accessVlan:99}],['p2',{mode:'trunk',nativeVlan:99}]]),
    sw2: sw('sw2', [['p1',{mode:'trunk',nativeVlan:1}],['p2',{accessVlan:99}]])
  }, links: [link('h1','eth0','sw1','p1'),link('sw1','p2','sw2','p1'),link('srv','eth0','sw2','p2')] };
  net.devices.sw1.vlans.push(99); net.devices.sw2.vlans.push(99);
  assert(!connected(net), 'native VLAN mismatch should map untagged traffic into different VLANs');
  net.devices.sw2.ifaces.p1.nativeVlan = 99;
  assert(connected(net), 'matching native VLANs should restore untagged VLAN 99');
});

test('trunk allowed list and access VLAN reject invalid or nonexistent VLANs without mutation', () => {
  const net = { devices: { sw1: sw('sw1', [['p1',{}]]) }, links: [] };
  const cli = makeCLI(net, 'sw1');
  command(cli, 'sw1', 'interface p1');
  command(cli, 'sw1', 'switchport access vlan 10', 1);
  command(cli, 'sw1', 'switchport trunk allowed vlan 1,4095', 1);
  command(cli, 'sw1', 'vlan 0', 1);
  command(cli, 'sw1', 'vlan 4095', 1);
  assert(net.devices.sw1.ifaces.p1.mode !== 'trunk', 'invalid configuration must not change port mode');
  assert(!net.devices.sw1.vlans.includes(10), 'invalid configuration must not create a VLAN');
});

test('VLAN and trunk show commands expose configuration for troubleshooting', () => {
  const net = { devices: { sw1: sw('sw1', [['p1',{accessVlan:10}],['p2',{mode:'trunk',nativeVlan:1,allowedVlans:[1,10]}]]) }, links: [] };
  const cli = makeCLI(net, 'sw1');
  command(cli, 'sw1', 'vlan 10');
  const vlans = command(cli, 'sw1', 'show vlan brief');
  const trunks = command(cli, 'sw1', 'show interfaces trunk');
  const ports = command(cli, 'sw1', 'show interfaces switchport');
  assert(vlans.includes('10') && vlans.includes('p1'), 'VLAN table should show VLAN 10 and its access port');
  assert(trunks.includes('p2') && trunks.includes('1,10'), 'trunk table should show native and allowed VLANs');
  assert(ports.includes('access VLAN 10') && ports.includes('trunk'), 'switchport view should show both port modes');
});

test('VLAN-aware traversal terminates on redundant switch links', () => {
  const net = { devices: {
    h1: host('h1','10.0.0.10'), srv: host('srv','10.0.0.20'),
    sw1: sw('sw1',[['p1',{accessVlan:10}],['p2',{mode:'trunk'}],['p3',{mode:'trunk'}]]),
    sw2: sw('sw2',[['p1',{mode:'trunk'}],['p2',{mode:'trunk'}],['p3',{accessVlan:10}]])
  }, links: [link('h1','eth0','sw1','p1'),link('sw1','p2','sw2','p1'),link('sw1','p3','sw2','p2'),link('srv','eth0','sw2','p3')] };
  assert(connected(net), 'looped Layer 2 topology should still find the endpoint');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total.');
if (failed) process.exit(1);
