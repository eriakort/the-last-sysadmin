#!/usr/bin/env node
// Breadth · VPN tunnels & PKI: a site-to-site GRE tunnel over an internet
// underlay provides reachability between two private LANs only when both ends
// mirror each other and authentication matches — a pre-shared key, or mutual
// PKI (both certs valid and each end trusts the other's issuer).
const M = require('./net-model'); const { ip } = M;
const { makeCLI } = require('./net-cli');
const iface = (a, p) => ({ ip: ip(a), mask: p, up: true });

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n      ' + e.message); } }

function net(opts = {}) {
  return { pki: opts.trusted ? { trusted: opts.trusted } : undefined, devices: {
    h1:  { id: 'h1', kind: 'host', ifaces: { eth0: iface('10.0.1.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.1.1') }] },
    srv: { id: 'srv', kind: 'host', ifaces: { eth0: iface('10.0.2.10', 24) }, routes: [{ dest: 0, mask: 0, via: ip('10.0.2.1') }] },
    r1:  { id: 'r1', kind: 'router', ifaces: { eth0: iface('10.0.1.1', 24), eth1: iface('203.0.113.1', 30) }, routes: [{ dest: ip('198.51.100.0'), mask: 30, via: ip('203.0.113.2') }], cert: opts.r1cert, trustedCAs: opts.r1trust },
    r2:  { id: 'r2', kind: 'router', ifaces: { eth0: iface('10.0.2.1', 24), eth1: iface('198.51.100.1', 30) }, routes: [{ dest: ip('203.0.113.0'), mask: 30, via: ip('198.51.100.2') }], cert: opts.r2cert, trustedCAs: opts.r2trust },
    isp: { id: 'isp', kind: 'router', ifaces: { eth0: iface('203.0.113.2', 30), eth1: iface('198.51.100.2', 30) }, routes: [] },
    sw1: { id: 'sw1', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } },
    sw2: { id: 'sw2', kind: 'switch', ifaces: { p1: { up: true }, p2: { up: true } } }
  }, links: [
    { a: ['h1', 'eth0'], b: ['sw1', 'p1'], up: true }, { a: ['r1', 'eth0'], b: ['sw1', 'p2'], up: true },
    { a: ['srv', 'eth0'], b: ['sw2', 'p1'], up: true }, { a: ['r2', 'eth0'], b: ['sw2', 'p2'], up: true },
    { a: ['r1', 'eth1'], b: ['isp', 'eth0'], up: true }, { a: ['r2', 'eth1'], b: ['isp', 'eth1'], up: true }
  ] };
}
const run = (n, cmds) => { const cli = makeCLI(n, 'r1'); for (const [d, c] of cmds) { cli.on(d); const r = cli.run(c); assert(r.code === 0, `command failed on ${d}: "${c}" -> ${r.out}`); } };
const reaches = n => M.ping(n, 'h1', ip('10.0.2.10')).ok;
const psk = (k1, k2) => [
  ['r1', 'ip tunnel add tun0 mode gre local 203.0.113.1 remote 198.51.100.1'], ['r1', `ip tunnel key tun0 ${k1}`], ['r1', 'ip route add 10.0.2.0/24 dev tun0'],
  ['r2', 'ip tunnel add tun0 mode gre local 198.51.100.1 remote 203.0.113.1'], ['r2', `ip tunnel key tun0 ${k2}`], ['r2', 'ip route add 10.0.1.0/24 dev tun0']
];
const pkiTunnels = [
  ['r1', 'ip tunnel add tun0 mode gre local 203.0.113.1 remote 198.51.100.1'], ['r1', 'ip route add 10.0.2.0/24 dev tun0'],
  ['r2', 'ip tunnel add tun0 mode gre local 198.51.100.1 remote 203.0.113.1'], ['r2', 'ip route add 10.0.1.0/24 dev tun0']
];

test('without a tunnel the two LANs cannot reach each other', () => { const n = net(); assert(reaches(n) === false, 'reachable with no tunnel'); });
test('a tunnel with matching pre-shared keys establishes reachability', () => { const n = net(); run(n, psk('SECRET', 'SECRET')); assert(reaches(n) === true, 'not reachable with matching PSK'); assert(M.tunnelEstablished(n, 'r1', 'tun0') === true, 'tunnel not established'); });
test('a pre-shared key mismatch keeps the tunnel down', () => { const n = net(); run(n, psk('SECRET', 'WRONG')); assert(reaches(n) === false, 'reachable despite PSK mismatch'); });
test('a half-configured tunnel (only one end) stays down', () => { const n = net(); run(n, [psk('SECRET', 'SECRET')[0], psk('SECRET', 'SECRET')[1], psk('SECRET', 'SECRET')[2]]); assert(reaches(n) === false, 'reachable with only one end configured'); });
test('mutual PKI with valid, trusted certs establishes the tunnel', () => { const n = net({ r1cert: { issuer: 'CA-Corp', valid: true }, r2cert: { issuer: 'CA-Corp', valid: true }, trusted: ['CA-Corp'] }); run(n, pkiTunnels); assert(reaches(n) === true, 'PKI valid+trusted not reachable'); });
test('an untrusted issuer fails PKI authentication', () => { const n = net({ r1cert: { issuer: 'CA-Rogue', valid: true }, r2cert: { issuer: 'CA-Corp', valid: true }, trusted: ['CA-Corp'] }); run(n, pkiTunnels); assert(reaches(n) === false, 'reachable with an untrusted issuer'); });
test('an expired certificate fails PKI authentication', () => { const n = net({ r1cert: { issuer: 'CA-Corp', expired: true }, r2cert: { issuer: 'CA-Corp', valid: true }, trusted: ['CA-Corp'] }); run(n, pkiTunnels); assert(reaches(n) === false, 'reachable with an expired cert'); });
test('adding a trust anchor at runtime brings the PKI tunnel up', () => { const n = net({ r1cert: { issuer: 'CA-Corp', valid: true }, r2cert: { issuer: 'CA-Corp', valid: true } }); run(n, pkiTunnels); assert(reaches(n) === false, 'reachable before trust established'); run(n, [['r1', 'ip tunnel trust CA-Corp'], ['r2', 'ip tunnel trust CA-Corp']]); assert(reaches(n) === true, 'not reachable after trust established'); });

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total.`);
if (failed) process.exit(1);
