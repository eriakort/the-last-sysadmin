// Networking Trainer — M3: the first chapters (text-only, no UI).
// Each mission is a starting topology (`build`) + declarative `success` checks,
// plus a reference `solution` (console device + commands) used to prove the
// mission is solvable and as an authoring aid. The real game never shows it.
const M = require('./net-model');
const { ip } = M;

const H = (id, a, p, gw) => ({ id, kind: 'host', ifaces: { eth0: a ? { ip: ip(a), mask: p, up: true } : { up: true } }, routes: gw ? [{ dest: 0, mask: 0, via: ip(gw) }] : [] });
const SRV = (id, a, p, gw, services) => ({ ...H(id, a, p, gw), services });
const SW = (id, ports) => ({ id, kind: 'switch', ifaces: Object.fromEntries(ports.map(x => [x.n, { up: true, ...(x.v != null ? { vlan: x.v } : {}) }])) });
const R = (id, kind, ifaces, routes, acls) => ({ id, kind, ifaces, routes: routes || [], acls: acls || [] });
const iface = (a, p) => ({ ip: ip(a), mask: p, up: true });
const L = (a, ai, b, bi) => ({ a: [a, ai], b: [b, bi], up: true });

const chapters = [

  { id: 'first-contact', chapter: 'Getting on the network',
    title: 'First contact',
    story: 'A new workstation h1 is plugged into the office switch but it has never been configured. The file server at 10.0.1.5 is on the same switch.',
    objective: 'Give h1 an address in the 10.0.1.0/24 network, then confirm it can reach the server.',
    console: 'h1',
    hints: ['`ip addr` shows h1 has an interface but no address.', 'Pick any free address in 10.0.1.0/24, e.g. 10.0.1.10, mask /24.', 'Run `ip addr add 10.0.1.10/24 dev eth0`, then `ping srv`.'],
    build: () => ({
      devices: { h1: H('h1'), srv: SRV('srv', '10.0.1.5', 24, null, { 445: 'smb' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr add 10.0.1.10/24 dev eth0']]
  },

  { id: 'wrong-subnet', chapter: 'Subnetting',
    title: 'The typo in the address',
    story: 'h1 was configured, but someone fat-fingered the address and now it can\'t reach the server at 10.0.1.5.',
    objective: 'Fix h1\'s address so it is in the same 10.0.1.0/24 network as the server.',
    console: 'h1',
    hints: ['`ip addr` shows h1 is in the wrong network.', '10.0.9.x and 10.0.1.x are different /24 networks — they can\'t talk directly.', 'Re-address: `ip addr add 10.0.1.10/24 dev eth0`.'],
    build: () => ({
      devices: { h1: H('h1', '10.0.9.10', 24), srv: SRV('srv', '10.0.1.5', 24, null, { 445: 'smb' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr add 10.0.1.10/24 dev eth0']]
  },

  { id: 'find-the-gateway', chapter: 'Routing',
    title: 'Off the local network',
    story: 'h1 is correctly addressed in 10.0.1.0/24 and can reach its neighbours, but it cannot reach the server h2 in 10.0.2.0/24 across the router.',
    objective: 'Give h1 a default gateway so it can reach h2.',
    console: 'h1',
    hints: ['Traffic to another network must go through a router — the default gateway.', 'The router\'s address on h1\'s network is 10.0.1.1.', 'Run `ip route add default via 10.0.1.1`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24), h2: H('h2', '10.0.2.10', 24, '10.0.2.1'),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('h2', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'reachable', a: 'h1', b: 'h2' }],
    solution: [['h1', 'ip route add default via 10.0.1.1']]
  },

  { id: 'add-a-route', chapter: 'Static routing',
    title: 'The missing route',
    story: 'Two offices are joined by a link between routers r1 and r2. h1 (behind r1) cannot reach h3 (behind r2). r2 already knows the way back; r1 does not know how to reach 10.0.3.0/24.',
    objective: 'Add a static route on r1 so h1 can reach h3.',
    console: 'r1',
    hints: ['r1 can reach r2 directly over 10.0.12.0/30; r2\'s address there is 10.0.12.2.', 'r1 needs to know that 10.0.3.0/24 is reachable via r2.', 'Run `ip route add 10.0.3.0/24 via 10.0.12.2`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'), h3: H('h3', '10.0.3.10', 24, '10.0.3.1'),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 30) }),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 30), eth1: iface('10.0.3.1', 24) }, [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }]),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw3: SW('sw3', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('r1', 'eth1', 'r2', 'eth0'), L('h3', 'eth0', 'sw3', 'p1'), L('r2', 'eth1', 'sw3', 'p2')]
    }),
    success: [{ type: 'route_exists', dev: 'r1', cidr: '10.0.3.0/24' }, { type: 'reachable', a: 'h1', b: 'h3' }],
    solution: [['r1', 'ip route add 10.0.3.0/24 via 10.0.12.2']]
  },

  { id: 'lock-the-door', chapter: 'Firewalls',
    title: 'Close the telnet port',
    story: 'The web server is reachable from the office, which is good — but telnet (tcp/23) is wide open to it, which is not. The firewall fw sits between the office (eth0) and the server.',
    objective: 'Block inbound telnet to the server at the firewall, without breaking web (tcp/80).',
    console: 'fw',
    hints: ['Firewall rules match inbound on an interface; the office is on fw\'s eth0.', 'Drop tcp destined for port 23, and leave everything else alone.', 'Run `iptables -A INPUT -i eth0 -p tcp --dport 23 -j DROP`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http', 22: 'ssh' }),
        fw: R('fw', 'firewall', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('fw', 'eth0', 'sw1', 'p2'), L('web', 'eth0', 'sw2', 'p1'), L('fw', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'acl_blocks', src: 'h1', dst: '10.0.2.10', proto: 'tcp', dport: 23 },
      { type: 'reachable', a: 'h1', b: 'web', proto: 'tcp', dport: 80 }
    ],
    solution: [['fw', 'iptables -A INPUT -i eth0 -p tcp --dport 23 -j DROP']]
  },

  { id: 'segment-the-guests', chapter: 'Network security',
    title: 'Keep guests off the database',
    story: 'Guest and staff machines share the office network, and right now a guest laptop (10.0.5.20) can reach the database server. It should not. Staff (10.0.5.10) must keep access.',
    objective: 'At the firewall, stop the guest from reaching the database while leaving staff access intact.',
    console: 'fw',
    hints: ['You can match traffic by its source address with `-s`.', 'Block the guest\'s address inbound on the office interface (eth0); staff keeps working.', 'Run `iptables -A INPUT -i eth0 -s 10.0.5.20 -j DROP`.'],
    build: () => ({
      devices: {
        staff: H('staff', '10.0.5.10', 24, '10.0.5.1'), guest: H('guest', '10.0.5.20', 24, '10.0.5.1'),
        db: SRV('db', '10.0.6.10', 24, '10.0.6.1', { 5432: 'postgres' }),
        fw: R('fw', 'firewall', { eth0: iface('10.0.5.1', 24), eth1: iface('10.0.6.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('staff', 'eth0', 'sw1', 'p1'), L('guest', 'eth0', 'sw1', 'p2'), L('fw', 'eth0', 'sw1', 'p3'), L('db', 'eth0', 'sw2', 'p1'), L('fw', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'not_reachable', a: 'guest', b: 'db' }, { type: 'reachable', a: 'staff', b: 'db' }],
    solution: [['fw', 'iptables -A INPUT -i eth0 -s 10.0.5.20 -j DROP']]
  },

  { id: 'the-mask-matters', chapter: 'Subnetting',
    title: 'The mask matters',
    story: 'h1 has an address and can reach some hosts, but not the server at 10.0.1.200 on the same wire. Its mask is too narrow: a /25 splits 10.0.1.0 into two halves (.0–.127 and .128–.255), so .10 and .200 end up in different networks.',
    objective: 'Re-address h1 with the correct /24 mask so 10.0.1.200 is local again.',
    console: 'h1',
    hints: ['`ip addr` shows h1 is 10.0.1.10/25 — a /25, not a /24.', 'With /25, .10 is in 10.0.1.0/25 and .200 is in 10.0.1.128/25 — different networks.', 'Run `ip addr add 10.0.1.10/24 dev eth0`.'],
    build: () => ({
      devices: { h1: H('h1', '10.0.1.10', 25), srv: SRV('srv', '10.0.1.200', 24, null, { 445: 'smb' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr add 10.0.1.10/24 dev eth0']]
  },

  { id: 'default-deny', chapter: 'Network security',
    title: 'Allow only the web',
    story: 'The web server should answer web requests (tcp/80) and nothing else — no SSH, no ping. Right now the firewall lets everything through.',
    objective: 'At the firewall, allow tcp/80 to the server and block everything else inbound from the office (default-deny).',
    console: 'fw',
    hints: ['Rules match top-down, first match wins — put the ALLOW before the catch-all DROP.', 'First accept tcp/80, then drop everything else on eth0.', 'Run `iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT`, then `iptables -A INPUT -i eth0 -j DROP`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http', 22: 'ssh' }),
        fw: R('fw', 'firewall', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('fw', 'eth0', 'sw1', 'p2'), L('web', 'eth0', 'sw2', 'p1'), L('fw', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'reachable', a: 'h1', b: 'web', proto: 'tcp', dport: 80 },
      { type: 'acl_blocks', src: 'h1', dst: '10.0.2.10', proto: 'tcp', dport: 22 },
      { type: 'acl_blocks', src: 'h1', dst: '10.0.2.10', proto: 'icmp' }
    ],
    solution: [
      ['fw', 'iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT'],
      ['fw', 'iptables -A INPUT -i eth0 -j DROP']
    ]
  }

];

module.exports = { chapters };
