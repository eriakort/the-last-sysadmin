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
const sw = (id, ports) => ({ id, kind: 'switch', ifaces: Object.fromEntries(ports.map(([name, cfg]) => [name, { up: true, ...(cfg || {}) }])) });
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
  net.devices.sw1.vlans = [1,20]; net.devices.sw2.vlans = [1,20];
  assert(!connected(net), 'VLAN 10 must not cross trunks that only allow VLAN 20');
  const cli = makeCLI(net, 'sw1');
  command(cli, 'sw1', 'vlan 10'); command(cli, 'sw1', 'vlan 20');
  command(cli, 'sw2', 'vlan 10'); command(cli, 'sw2', 'vlan 20');
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
  net.devices.sw1.vlans = [1,99]; net.devices.sw2.vlans = [1,99];
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
  command(cli, 'sw1', 'vlan 0x10', 1);
  command(cli, 'sw1', 'vlan 1e2', 1);
  command(cli, 'sw1', 'vlan 4094');
  command(cli, 'sw1', 'interface p1 extra', 1);
  assert(net.devices.sw1.ifaces.p1.mode !== 'trunk', 'invalid configuration must not change port mode');
  assert(!net.devices.sw1.vlans.includes(10), 'invalid configuration must not create a VLAN');
  assert(net.devices.sw1.vlans.includes(4094), 'the upper valid VLAN boundary should be accepted');
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


function triangle() {
  const net = { devices: {
    h1: host('h1','10.0.0.10'), srv: host('srv','10.0.0.20'),
    sw1: sw('sw1',[['p1',{accessVlan:10}],['p2',{mode:'trunk',allowedVlans:[10]}],['p3',{mode:'trunk',allowedVlans:[10]}]]),
    sw2: sw('sw2',[['p1',{mode:'trunk',allowedVlans:[10]}],['p2',{mode:'trunk',allowedVlans:[10]}]]),
    sw3: sw('sw3',[['p1',{mode:'trunk',allowedVlans:[10]}],['p2',{mode:'trunk',allowedVlans:[10]}],['p3',{accessVlan:10}]])
  }, links: [
    link('h1','eth0','sw1','p1'), link('srv','eth0','sw3','p3'),
    link('sw1','p2','sw2','p1'), link('sw2','p2','sw3','p1'), link('sw3','p2','sw1','p3')
  ] };
  for (const id of ['sw1','sw2','sw3']) net.devices[id].vlans = [1,10];
  return net;
}

test('MAC learning records local and remote endpoints on the correct egress ports', () => {
  const net = triangle();
  assert(M.switchMacTable(net,'sw1',10).length === 0, 'the table should be empty before endpoint traffic');
  assert(connected(net), 'traffic should populate the dynamic MAC table');
  const rows = M.switchMacTable(net,'sw1',10);
  const h1 = rows.find(x => x.device === 'h1'), srv = rows.find(x => x.device === 'srv');
  assert(h1 && h1.port === 'p1', 'local host h1 should be learned on sw1/p1');
  assert(srv && srv.port === 'p3', 'remote server should be learned through sw1/p3');
  assert(rows.every(x => x.type === 'dynamic' && /^02:/.test(x.mac)), 'entries should be stable dynamic MACs');
});

test('STP elects the lowest-priority root and blocks one redundant triangle link', () => {
  const net = triangle();
  const initial = M.spanningTree(net,10);
  assert(initial.switches.sw1.root === 'sw1', 'default bridge ID tie-break should elect sw1');
  const cli = makeCLI(net,'sw3');
  command(cli,'sw3','spanning-tree vlan 10 priority 4096');
  const tree = M.spanningTree(net,10);
  assert(tree.switches.sw1.root === 'sw3' && tree.switches.sw2.root === 'sw3', 'all switches should agree on sw3 as root');
  assert(tree.switches.sw2.ports.p1.state === 'blocking', 'sw2/p1 should be alternate on the non-tree link');
  assert(connected(net), 'STP should preserve reachability across the loop-free tree');
  const shown = command(cli,'sw3','show spanning-tree vlan 10');
  assert(shown.includes('Root bridge: sw3') && shown.includes('designated'), 'show spanning-tree should report root and roles');
});

test('MAC table CLI exposes dynamic VLAN, MAC, and learned switch port', () => {
  const net = triangle(), cli = makeCLI(net,'sw1');
  assert(connected(net), 'ping should trigger dynamic MAC learning');
  const output = command(cli,'sw1','show mac address-table dynamic');
  assert(output.includes('VLAN  MAC Address') && output.includes('h1/eth0') && output.includes('srv/eth0'), 'MAC table should show local and remote endpoint records');
  command(cli,'sw1','clear mac address-table dynamic');
  assert(M.switchMacTable(net,'sw1',10).length === 0, 'clear should remove learned entries from the selected switch');
});

test('STP priority validates VLAN existence and 4096-step bridge priority values', () => {
  const net = triangle(), cli = makeCLI(net,'sw3');
  command(cli,'sw3','spanning-tree vlan 10 priority 4096');
  command(cli,'sw3','spanning-tree vlan 10 priority 4097',1);
  command(cli,'sw3','spanning-tree vlan 10 priority 65536',1);
  command(cli,'sw3','spanning-tree vlan 20 priority 4096',1);
  command(cli,'sw3','spanning-tree vlan 10 priority 0x1000',1);
  assert(net.devices.sw3.stpPriorities[10] === 4096, 'invalid values must not mutate priority');
});

test('a simple two-switch topology has no alternate blocking port', () => {
  const net = { devices: {
    h1: host('h1','10.0.0.10'),
    sw1: sw('sw1',[['p1',{accessVlan:10}],['p2',{mode:'trunk',allowedVlans:[10]}]]),
    sw2: sw('sw2',[['p1',{mode:'trunk',allowedVlans:[10]}],['p2',{accessVlan:10}]])
  }, links: [link('h1','eth0','sw1','p1'),link('sw1','p2','sw2','p1')] };
  net.devices.sw1.vlans=[1,10]; net.devices.sw2.vlans=[1,10];
  const tree=M.spanningTree(net,10);
  assert(!Object.values(tree.switches).some(s=>Object.values(s.ports).some(p=>p.state==='blocking')), 'tree topology should not block a port');
});


test('STP root election is independent for each VLAN', () => {
  const net = triangle();
  for (const id of ['sw1','sw2','sw3']) {
    net.devices[id].vlans = [1,10,20];
    for (const port of Object.values(net.devices[id].ifaces)) if (port.mode === 'trunk') port.allowedVlans = [10,20];
  }
  net.devices.sw3.stpPriorities = { 10: 4096 };
  net.devices.sw2.stpPriorities = { 20: 4096 };
  assert(M.spanningTree(net,10).switches.sw1.root === 'sw3', 'VLAN 10 should elect sw3');
  assert(M.spanningTree(net,20).switches.sw1.root === 'sw2', 'VLAN 20 should elect sw2');
});


test('STP and MAC learning also work on switch-to-switch access links', () => {
  const net = triangle();
  for (const id of ['sw1','sw2','sw3']) {
    for (const p of Object.values(net.devices[id].ifaces)) {
      p.mode = 'access'; p.accessVlan = 10; p.vlan = 10; delete p.allowedVlans;
    }
  }
  net.devices.sw3.stpPriorities = { 10: 4096 };
  const tree = M.spanningTree(net,10);
  assert(tree.switches.sw1.root === 'sw3', 'sw3 should be elected on an access-link topology');
  assert(tree.switches.sw2.ports.p1.state === 'blocking', 'the redundant access link should be blocked');
  assert(connected(net), 'STP should preserve reachability on access switch links');
  const rows = M.switchMacTable(net,'sw1',10);
  assert(rows.some(x=>x.device==='srv' && x.port==='p3'), 'remote MAC should be learned across access switch links');
});

test('port security learns sticky MACs, enforces maximum, and err-disables a violating access port', () => {
  const net = { devices: { h1: host('h1','10.0.0.10'), rogue: host('rogue','10.0.0.20'), srv: host('srv','10.0.0.30'), sw1: sw('sw1',[['p1',{accessVlan:10}],['p2',{accessVlan:10}]]) }, links: [link('h1','eth0','sw1','p1'),link('srv','eth0','sw1','p2')] };
  net.devices.sw1.vlans=[1,10];
  const cli=makeCLI(net,'sw1');
  command(cli,'sw1','enable'); command(cli,'sw1','configure terminal'); command(cli,'sw1','interface p1');
  command(cli,'sw1','switchport port-security'); command(cli,'sw1','switchport port-security maximum 1'); command(cli,'sw1','switchport port-security mac-address sticky');
  command(cli,'sw1','end');
  assert(M.ping(net,'h1',ip('10.0.0.30')).ok,'baseline endpoint should remain usable');
  const learned=net.devices.sw1.ifaces.p1.portSecurity;
  assert(learned.stickyMacs.length===1 && learned.secureMacs.length===1,'first endpoint MAC should become sticky and secure');
  net.links=[link('rogue','eth0','sw1','p1'),link('srv','eth0','sw1','p2')];
  const result=M.ping(net,'rogue',ip('10.0.0.30'));
  assert(!result.ok && /port-security/.test(result.reason),'new MAC should be blocked by port security');
  assert(net.devices.sw1.ifaces.p1.errDisabled===true,'shutdown violation mode should err-disable the port');
  const status=command(cli,'sw1','show port-security interface p1');
  assert(status.includes('err-disabled') && status.includes('count 1'),'show port-security should expose violation state');
  command(cli,'sw1','enable'); command(cli,'sw1','configure terminal'); command(cli,'sw1','interface p1'); command(cli,'sw1','no shutdown');
  assert(net.devices.sw1.ifaces.p1.errDisabled===false,'manual no shutdown should recover an err-disabled port');
});


test('port-security validation and restrict mode reject violations without err-disabling the port', () => {
  const net = { devices: { h1: host('h1','10.0.0.10'), rogue: host('rogue','10.0.0.20'), srv: host('srv','10.0.0.30'), sw1: sw('sw1',[['p1',{accessVlan:10}],['p2',{accessVlan:10}]]) }, links: [link('h1','eth0','sw1','p1'),link('srv','eth0','sw1','p2')] };
  net.devices.sw1.vlans=[1,10]; const cli=makeCLI(net,'sw1');
  command(cli,'sw1','enable'); command(cli,'sw1','configure terminal'); command(cli,'sw1','interface p1');
  command(cli,'sw1','switchport port-security maximum 0',1);
  command(cli,'sw1','switchport port-security violation disable',1);
  command(cli,'sw1','switchport port-security violation restrict');
  command(cli,'sw1','switchport port-security maximum 1'); command(cli,'sw1','end');
  assert(M.ping(net,'h1',ip('10.0.0.30')).ok,'first MAC should be learned');
  net.links=[link('rogue','eth0','sw1','p1'),link('srv','eth0','sw1','p2')];
  const result=M.ping(net,'rogue',ip('10.0.0.30'));
  assert(!result.ok && /port-security/.test(result.reason),'restrict mode should drop the violating frame');
  assert(net.devices.sw1.ifaces.p1.errDisabled!==true,'restrict mode must leave the port enabled');
  assert(net.devices.sw1.ifaces.p1.portSecurity.violations===1,'restrict mode should increment the violation counter');
});

test('port-security settings and sticky addresses appear in running configuration', () => {
  const net={devices:{sw1:sw('sw1',[['p1',{}]])},links:[]},cli=makeCLI(net,'sw1');
  command(cli,'sw1','enable'); command(cli,'sw1','configure terminal'); command(cli,'sw1','interface p1');
  command(cli,'sw1','switchport port-security'); command(cli,'sw1','switchport port-security maximum 2');
  command(cli,'sw1','switchport port-security violation restrict'); command(cli,'sw1','switchport port-security mac-address sticky');
  command(cli,'sw1','end');
  const config=command(cli,'sw1','show running-config');
  assert(config.includes('switchport port-security maximum 2') && config.includes('switchport port-security violation restrict') && config.includes('switchport port-security mac-address sticky'),'running config should preserve the operational security policy');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total.');
if (failed) process.exit(1);
