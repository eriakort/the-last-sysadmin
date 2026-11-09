const assert = require('assert');
const { getGuide, validateGuides } = require('./net-learning-coach');

const commands = [
  'ip addr', 'ip route', 'ping 192.0.2.1', 'traceroute 192.0.2.1',
  'show vlan brief', 'show interfaces status', 'show interfaces trunk',
  'show spanning-tree', 'show mac address-table', 'show ip interface brief',
  'show ip route', 'show ip ospf neighbor', 'show access-lists', 'show running-config'
];
const validation = validateGuides(commands.map(cmd => ({ cmd })));
assert.strictEqual(validation.ok, true, 'every published command has a guide');
assert.deepStrictEqual(validation.missing, []);
assert.strictEqual(validation.count, commands.length);
for (const command of commands) {
  const guide = getGuide(command);
  assert.ok(guide, command + ' has a guide');
  for (const field of ['purpose','runOn','lookFor','interpret','pitfall','next','challenge','answer'])
    assert.ok(typeof guide[field] === 'string' && guide[field].trim().length > 20, command + ' has meaningful ' + field);
}
assert.strictEqual(getGuide(' show ip route ').command, 'show ip route', 'command lookup trims surrounding whitespace');
assert.strictEqual(getGuide('show version'), null, 'unsupported commands do not receive invented guidance');
assert.strictEqual(validateGuides([{cmd:'unknown command'}]).ok, false, 'catalog drift is reported');
console.log('Network Learning Coach: ' + commands.length + ' command guides and validation checks passed.');
