#!/usr/bin/env node
// Breadth · Observability: per-device connection / flow logging. As a user flow
// is forwarded, every device on the path appends one line to its own connection
// log describing what it did with that flow (5-tuple + ingress/egress interface
// + action). Deterministic: timestamps derive from a per-net sequence, not the
// wall clock, so a scenario always renders the same log.
const M = require('./net-model'); const { ip } = M;
const C = require('./net-checks');
const iface = (a, p, extra = {}) => ({ ip: ip(a), mask: p, up: true, ...extra });

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

// h1 -- sw1 -- r1 -- sw2 -- srv ; r1 ingress ACL permits tcp/443 to srv, denies the rest.
function net() {
  const n = { devices: {
    h1: { id: 'h1', kind: 'host', ifaces: { eth0: iface('10.0.1.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }] },
    srv: { id: 'srv', kind: 'host', ifaces: { eth0: iface('10.0.2.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }], services: { 443: 'https', 23: 'telnet' } },
    r1: { id: 'r1', kind: 'router',
      ifaces: { eth0: iface('10.0.1.1', 24, { accessGroups: { in: 'DMZ-IN' } }), eth1: iface('10.0.2.1', 24) },
      routes: [{ dest: ip('10.0.2.0'), mask: 24, via: ip('10.0.2.1') }],
      acls: [
        { aclName: 'DMZ-IN', seq: 10, action: 'allow', proto: 'tcp', src: ip('10.0.1.0'), srcWildcard: ip('0.0.0.255'), dst: ip('10.0.2.10'), dstWildcard: 0, dport: 443 },
        { aclName: 'DMZ-IN', seq: 20, action: 'deny', proto: 'ip', src: null, srcWildcard: null, dst: null, dstWildcard: null }
      ] },
    sw1: { id: 'sw1', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } },
    sw2: { id: 'sw2', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw1', 'p1'], up: true }, { a: ['r1', 'eth0'], b: ['sw1', 'p2'], up: true },
    { a: ['srv', 'eth0'], b: ['sw2', 'p1'], up: true }, { a: ['r1', 'eth1'], b: ['sw2', 'p2'], up: true }
  ] };
  return n;
}
// Record a ping's forward exactly as the CLI does.
function sendFlow(n, from, dstIp, proto, dport) {
  const fwd = M.ping(n, from, dstIp, { proto, dport }).forward;
  const bytes = proto === 'icmp' ? 84 : dport === 443 ? 1200 : dport === 23 ? 560 : 560;
  M.recordFlowLog(n, fwd, { src: M.sourceIpToward(n, from, dstIp), dst: dstIp, proto, dport, bytes });
  return fwd;
}

test('a permitted flow is logged FORWARD at the router and ACCEPT at the destination', () => {
  const n = net();
  sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 443);
  const r1 = n.devices.r1.flowLog, srv = n.devices.srv.flowLog;
  assert(r1 && r1.length === 1, 'r1 should have one flow');
  assert(r1[0].action === 'FORWARD', 'r1 action should be FORWARD, got ' + r1[0].action);
  assert(r1[0].in_if === 'eth0' && r1[0].out_if === 'eth1', 'r1 in/out interfaces wrong: ' + r1[0].in_if + '->' + r1[0].out_if);
  assert(r1[0].dport === 443 && r1[0].proto === 'tcp', 'r1 5-tuple wrong');
  assert(srv && srv[0].action === 'ACCEPT' && srv[0].out_if === null, 'srv should ACCEPT with no egress');
});

test('a denied flow is logged DENY at the router that drops it, with the deny reason', () => {
  const n = net();
  sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 23);
  const r1 = n.devices.r1.flowLog;
  assert(r1[0].action === 'DENY', 'telnet should be DENY, got ' + r1[0].action);
  assert(r1[0].out_if === null, 'a denied flow has no egress interface');
  assert(/ACL/.test(r1[0].reason || ''), 'DENY should carry the ACL reason');
  assert(!n.devices.srv.flowLog, 'srv must never see a denied flow');
});

test('a no-route drop is logged DROP (not DENY)', () => {
  const n = net();
  n.devices.r1.acls = []; delete n.devices.r1.ifaces.eth0.accessGroups; // no policy — a pure routing drop
  sendFlow(n, 'h1', ip('10.9.9.9'), 'icmp'); // unrouteable
  const r1 = n.devices.r1.flowLog;
  assert(r1[0].action === 'DROP', 'no-route should be DROP, got ' + r1[0].action);
  assert(/no route/i.test(r1[0].reason || ''), 'DROP should carry the no-route reason');
});

test('timestamps are deterministic and wall-clock-free (sequence-derived)', () => {
  const a = net(); sendFlow(a, 'h1', ip('10.0.2.10'), 'tcp', 443);
  const b = net(); sendFlow(b, 'h1', ip('10.0.2.10'), 'tcp', 443);
  assert(a.devices.r1.flowLog[0].ts === b.devices.r1.flowLog[0].ts, 'same scenario must yield the same timestamp');
  assert(/^\d\d:\d\d:\d\d$/.test(a.devices.r1.flowLog[0].ts), 'timestamp should be HH:MM:SS');
});

test('the log is newest-first and capped at 50 entries', () => {
  const n = net();
  for (let i = 0; i < 60; i++) sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 443);
  const r1 = n.devices.r1.flowLog;
  assert(r1.length === 50, 'log should cap at 50, got ' + r1.length);
  assert(r1[0].seq > r1[1].seq, 'newest flow should be first');
});

test('the net stays JSON-serializable (no BigInt leaks into the log)', () => {
  const n = net();
  sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 443);
  const s = JSON.stringify(n);
  assert(typeof s === 'string' && /10\.0\.2\.10/.test(s), 'flow log must serialize with dotted IPs');
});

test('flow_log check matches action + proto + dport and reports misses helpfully', () => {
  const n = net();
  sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 443);
  sendFlow(n, 'h1', ip('10.0.2.10'), 'tcp', 23);
  assert(C.flowLogged(n, 'r1', { action: 'FORWARD', proto: 'tcp', dport: 443 }).ok === true, 'should find the forwarded HTTPS flow');
  assert(C.flowLogged(n, 'r1', { action: 'DENY', proto: 'tcp', dport: 23 }).ok === true, 'should find the denied Telnet flow');
  const miss = C.flowLogged(n, 'r1', { action: 'DENY', dport: 443 });
  assert(miss.ok === false && /no flow matching/.test(miss.reason), 'a miss should explain itself: ' + miss.reason);
  assert(C.flowLogged(n, 'r1', { dst: '10.0.2.10' }).ok === true, 'dst match should work with dotted string');
});

test('only user traffic records; model grading (ping alone) does not touch the log', () => {
  const n = net();
  M.ping(n, 'h1', ip('10.0.2.10'), { proto: 'tcp', dport: 443 }); // no recordFlowLog
  assert(!n.devices.r1.flowLog, 'ping without recordFlowLog must not write a connection log');
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
