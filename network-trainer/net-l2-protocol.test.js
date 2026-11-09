// Deterministic ARP, VLAN tagging and STP learning regressions.
const assert = require('assert');
const M = require('./net-model');
const { chapters } = require('./net-chapters');
const fixture = id => chapters.find(x => x.id === id).build();

{
  const net = fixture('access-vlan-repair');
  const blocked = M.arpResolve(net, 'h1', 'eth0', '10.20.0.20');
  assert.strictEqual(blocked.ok, false, 'ARP must not cross the original VLAN boundary');
  net.devices.sw1.ifaces.p1.accessVlan = 20;
  net.devices.sw1.ifaces.p2.accessVlan = 20;
  const resolved = M.arpResolve(net, 'h1', 'eth0', '10.20.0.20');
  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.vlan, 20);
  assert.strictEqual(resolved.targetDeviceId, 'srv');
  assert.match(resolved.targetMac, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
}

{
  const net = fixture('trunk-allowed-vlan');
  const left = net.devices.sw1.ifaces.p2, right = net.devices.sw2.ifaces.p1;
  assert.strictEqual(M.switchPortAllowsVlan(left, 10), false);
  left.allowedVlans = [10, 20]; right.allowedVlans = [10, 20];
  assert.strictEqual(M.switchPortAllowsVlan(left, 10), true);
  assert.strictEqual(M.switchPortAllowsVlan(right, 10), true);
  assert.strictEqual(M.switchNativeVlan(left), 1);
}

{
  const net = fixture('break-the-switching-loop');
  net.devices.sw3.stpPriorities = { 10: 4096 };
  const tree = M.spanningTree(net, 10);
  assert.strictEqual(tree.switches.sw1.root, 'sw3');
  assert.strictEqual(tree.switches.sw2.ports.p1.state, 'blocking');
  assert.strictEqual(M.learnMacOnSegment(net, 'h1', 'eth0'), true);
  assert.strictEqual(M.learnMacOnSegment(net, 'srv', 'eth0'), true);
  const entries = M.switchMacTable(net, 'sw1', 10);
  assert(entries.some(e => e.device === 'h1'));
  assert(entries.some(e => e.device === 'srv'));
}
console.log('✓ ARP broadcast scope, VLAN trunk allow-list and STP/MAC learning');
