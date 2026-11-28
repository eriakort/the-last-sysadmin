// CCNA 200-301 Practice Track — initial missions
// Structured like net-chapters.js for reuse of the existing mission engine.
// Focused on high-weight domains: Network Fundamentals, Network Access, IP Connectivity.

const M = require('./net-model');
const { ip } = M;

const H = (id, a, p, gw) => ({ id, kind: 'host', ifaces: { eth0: a ? { ip: ip(a), mask: p, up: true } : { up: true } }, routes: gw ? [{ dest: 0, mask: 0, via: ip(gw) }] : [] });
const SRV = (id, a, p, gw, services) => ({ ...H(id, a, p, gw), services });
const SW = (id, ports) => ({ id, kind: 'switch', ifaces: Object.fromEntries(ports.map(x => [x.n, { up: true, ...(x.v != null ? { vlan: x.v } : {}) }])) });
const R = (id, kind, ifaces, routes, acls) => ({ id, kind, ifaces, routes: routes || [], acls: acls || [] });
const iface = (a, p) => ({ ip: ip(a), mask: p, up: true });
const L = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });

const ccnaChapters = [

  { id: 'ccna-subnet-basics',
    chapter: 'CCNA · Network Fundamentals',
    track: 'ccna',
    domain: '1.0 Network Fundamentals',
    title: 'Basic IPv4 subnetting',
    story: 'You are given a host that needs to be placed in the correct subnet so it can reach a server on the same Layer-2 segment.',
    objective: 'Configure h1 with an address in 192.168.10.0/24 so it can reach the server at 192.168.10.10.',
    ticket: { id: 'CCNA-001', from: 'Lab', priority: 'P3', symptom: 'Host cannot reach local server — address missing or wrong subnet.' },
    diagnose: { q: 'What is the minimum you must configure on h1 for local connectivity?', options: ['An IP address and mask in the same subnet as the server', 'A default gateway', 'A static route on the switch'], answer: 0, because: 'On the same subnet, only matching IP/mask is required; the switch floods/forwards frames.' },
    console: 'h1',
    hints: ['Use `ip addr add 192.168.10.20/24 dev eth0`', 'Then verify with `ping 192.168.10.10`'],
    build: () => ({
      devices: { h1: H('h1'), srv: SRV('srv', '192.168.10.10', 24, null, { 80: 'http' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '192.168.10.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr add 192.168.10.20/24 dev eth0']]
  },

  { id: 'ccna-vlan-access',
    chapter: 'CCNA · Network Access',
    track: 'ccna',
    domain: '2.0 Network Access',
    title: 'VLAN access port',
    story: 'Two hosts must be isolated on VLAN 20 while sharing the same physical switch.',
    objective: 'Put both access ports into VLAN 20 and confirm the hosts can communicate.',
    ticket: { id: 'CCNA-002', from: 'Lab', priority: 'P2', symptom: 'Hosts on different VLANs cannot talk; need them on the same VLAN.' },
    diagnose: { q: 'Which configuration places a host into a specific VLAN?', options: ['Access port VLAN assignment on the switch', 'Trunk allowed list only', 'Router subinterface'], answer: 0, because: 'Access ports carry a single untagged VLAN.' },
    console: 'sw1',
    hints: ['On the switch, set the port VLAN (simulator uses iface.vlan).', 'Both ports must be in VLAN 20.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.20.20.10', 24),
        h2: H('h2', '10.20.20.20', 24),
        sw1: SW('sw1', [{ n: 'p1', v: 1 }, { n: 'p2', v: 1 }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('h2', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'reachable', a: 'h1', b: 'h2' }],
    solution: [['sw1', '/* set p1 and p2 to vlan 20 */']]
  },

  { id: 'ccna-static-route',
    chapter: 'CCNA · IP Connectivity',
    track: 'ccna',
    domain: '3.0 IP Connectivity',
    title: 'Static route to remote subnet',
    story: 'A remote network is reachable only via a next-hop router. The local router is missing the route.',
    objective: 'Add a static route on r1 for 10.0.50.0/24 via the point-to-point neighbor so the host can reach the remote server.',
    ticket: { id: 'CCNA-003', from: 'Lab', priority: 'P1', symptom: 'Remote subnet unreachable — no route on the gateway.' },
    diagnose: { q: 'What does a router need to forward traffic to a non-connected network?', options: ['A route (static or dynamic) with a valid next hop', 'Only an interface IP', 'A default gateway on the remote host'], answer: 0, because: 'Forwarding decision uses the routing table.' },
    console: 'r1',
    hints: ['Next hop on the P2P link is 10.1.1.2', 'Command form: `ip route add 10.0.50.0/24 via 10.1.1.2`'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.10.10', 24, '10.0.10.1'),
        srv: SRV('srv', '10.0.50.10', 24, '10.0.50.1', { 80: 'http' }),
        r1: R('r1', 'router', { eth0: iface('10.0.10.1', 24), eth1: iface('10.1.1.1', 30) }),
        r2: R('r2', 'router', { eth0: iface('10.1.1.2', 30), eth1: iface('10.0.50.1', 24) }, [{ dest: ip('10.0.10.0'), mask: 24, via: ip('10.1.1.1') }]),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [
        L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'),
        L('r1', 'eth1', 'r2', 'eth0'),
        L('srv', 'eth0', 'sw2', 'p1'), L('r2', 'eth1', 'sw2', 'p2')
      ]
    }),
    success: [{ type: 'route_exists', dev: 'r1', cidr: '10.0.50.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['r1', 'ip route add 10.0.50.0/24 via 10.1.1.2']]
  }

];

module.exports = { ccnaChapters };
