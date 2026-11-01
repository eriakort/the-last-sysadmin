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
    ticket: { id: 'INC-1041', from: 'Dana · new hire, Finance', priority: 'P3', symptom: "Just got my desk set up but I can't open the shared drive at all. Brand-new machine — did IT forget something?" },
    diagnose: { q: 'You ping the server from h1 and it fails instantly, before any hop. What does that point to?', options: ['h1 has no IP address on eth0', 'the switch between them is powered off', 'the file server is down'], answer: 0, because: '`ip addr` shows eth0 is up but has no address — with no IP, h1 can\'t send anything onto the wire. Give it one in the server\'s network.' },
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
    ticket: { id: 'INC-1052', from: 'Marcus · Finance', priority: 'P2', symptom: "My machine got reimaged this morning and now I can't reach the file server (10.0.1.5). Everyone else on the floor is fine." },
    diagnose: { q: 'Running `ip addr` on h1 shows 10.0.9.10/24; the server is 10.0.1.5. Why can\'t they talk?', options: ['they sit in two different /24 networks', 'the switch only has two ports', 'the server stopped answering'], answer: 0, because: '10.0.9.x and 10.0.1.x are separate /24 networks — a switch won\'t bridge between them. Re-address h1 into 10.0.1.0/24.' },
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
    ticket: { id: 'INC-1067', from: 'Priya · Support desk', priority: 'P2', symptom: "I can print and reach everything on my own floor, but I can't open the app server on the other network (10.0.2.10). Local stuff works, remote doesn't." },
    diagnose: { q: '`traceroute h2` from h1 produces no hops at all — it fails on h1 itself with "no route". What is h1 missing?', options: ['a default gateway to leave its own subnet', 'a static route on the server', 'a firewall rule on the router'], answer: 0, because: 'Local traffic works because it stays on the wire; anything off-subnet needs a next hop. h1 has no default gateway, so it doesn\'t know how to leave 10.0.1.0/24.' },
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
    ticket: { id: 'INC-1075', from: 'Site lead · Branch office', priority: 'P1', symptom: "We just stood up the new branch and nobody at HQ can reach us, or us them. The point-to-point link to HQ is up — I can ping the HQ router — but traffic to the HQ workstations goes nowhere." },
    diagnose: { q: 'From r1, `ping h3` fails with "no route to 10.0.3.0". The link to r2 is up and r2 already knows the way back. What\'s the gap?', options: ['r1 has no route to the branch network 10.0.3.0/24', 'the branch host h3 has the wrong gateway', 'the link between the routers is down'], answer: 0, because: 'Routing is per-direction. r2 knows how to reach HQ, but r1 was never told that 10.0.3.0/24 lives via r2. Add that static route on r1.' },
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
    ticket: { id: 'INC-1088', from: 'Security audit · automated finding', priority: 'P2', symptom: "Quarterly scan flagged the web server (10.0.2.10): telnet (tcp/23) is reachable from the office network. Cleartext admin protocol exposed. Close it — but do not take the website down." },
    diagnose: { q: 'You run `nmap web` from the office. Which exposed port is the finding about, and where should the block go?', options: ['tcp/23 telnet — drop it inbound on fw\'s office interface (eth0)', 'tcp/80 web — that\'s the one to block', 'tcp/22 ssh — block it on the server itself'], answer: 0, because: 'nmap shows 23 open. Office traffic enters fw on eth0, so an inbound DROP for tcp/23 there closes telnet while leaving tcp/80 untouched.' },
    console: 'fw',
    hints: ['Firewall rules match inbound on an interface; the office is on fw\'s eth0.', 'Drop tcp destined for port 23, and leave everything else alone.', 'Run `iptables -A INPUT -i eth0 -p tcp --dport 23 -j DROP`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http', 23: 'telnet', 22: 'ssh' }),
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
    ticket: { id: 'INC-1094', from: 'Data protection officer', priority: 'P1', symptom: "A guest laptop on the office Wi-Fi was able to open a connection to the production database (10.0.6.10). Guests must never touch it. Staff absolutely still need it — do not lock them out." },
    diagnose: { q: 'Pinging db from the guest laptop (10.0.5.20) succeeds — that\'s the problem. What distinguishes traffic you must block from traffic you must keep?', options: ['its source address — guest 10.0.5.20 vs staff 10.0.5.10', 'its destination port', 'which switch port it uses'], answer: 0, because: 'Guest and staff share the subnet and the path, so you can\'t block by network or port. The source IP is what separates them — drop traffic from the guest\'s address at fw.' },
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
    ticket: { id: 'INC-1103', from: 'Lena · Design team', priority: 'P3', symptom: "Weird one: I can reach most machines on my floor, but not the asset server at 10.0.1.200 — and it's supposedly on the same network as me. Some hosts work, that one never does." },
    diagnose: { q: '`ip addr` shows h1 is 10.0.1.10/25. The server is 10.0.1.200. Why does .200 specifically fail when nearby addresses work?', options: ['a /25 splits the range, putting .10 and .200 in different halves', 'the server is powered off', 'h1 is missing a default gateway'], answer: 0, because: 'A /25 divides 10.0.1.0 into .0–.127 and .128–.255. h1 (.10) and the server (.200) land in different halves, so they look non-local to each other. Widen h1 to /24.' },
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
    ticket: { id: 'INC-1115', from: 'Security team · hardening ticket', priority: 'P2', symptom: "This public web server should answer web traffic and nothing else — no SSH, no ping, no surprises. Right now the firewall waves everything through. Lock it to web-only." },
    diagnose: { q: '`nmap web` shows tcp/80 and tcp/22 open, and ping works too. The policy is "web only". What rule shape gets you there?', options: ['allow tcp/80, then drop everything else (default-deny)', 'drop tcp/22 and drop ping, leave the rest', 'drop tcp/80 and allow the rest'], answer: 0, because: 'Listing every unwanted thing never ends. Allow exactly what\'s permitted (tcp/80) and finish with a catch-all DROP — order matters, the allow goes first.' },
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
  },

  { id: 'two-offices', chapter: 'Static routing',
    title: 'Two branches, one core',
    story: 'r1 is the core router at HQ. Two branch networks, 10.0.3.0/24 and 10.0.4.0/24, both sit behind r2 across the link. r2 already knows the way back to HQ; r1 knows neither branch.',
    objective: 'Add static routes on r1 for both branch networks, so h1 can reach h3 and h4.',
    ticket: { id: 'INC-1121', from: 'Network ops · change follow-up', priority: 'P2', symptom: "After the r2 cutover, neither branch network (10.0.3.0/24 and 10.0.4.0/24) is reachable from HQ. The r2 side came up fine and can reach HQ; it's the HQ core r1 that can't find either branch." },
    diagnose: { q: 'From r1, `ping h3` and `ping h4` both fail with "no route". r2 reaches both branches and knows the way back to HQ. What does r1 need?', options: ['a static route to each branch network — two routes, both via r2', 'a single default route is enough for both', 'a new gateway on each branch host'], answer: 0, because: 'Each branch is its own /24 and neither is directly connected to r1. r1 needs an explicit route per branch network, both pointing at r2 across the link.' },
    console: 'r1',
    hints: ['r1 reaches r2 directly over 10.0.12.0/30; r2 is 10.0.12.2.', 'You need TWO routes on r1 — one per branch network — both via 10.0.12.2.', 'Run `ip route add 10.0.3.0/24 via 10.0.12.2` and `ip route add 10.0.4.0/24 via 10.0.12.2`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'), h3: H('h3', '10.0.3.10', 24, '10.0.3.1'), h4: H('h4', '10.0.4.10', 24, '10.0.4.1'),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 30) }),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 30), eth1: iface('10.0.3.1', 24), eth2: iface('10.0.4.1', 24) }, [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }]),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw3: SW('sw3', [{ n: 'p1' }, { n: 'p2' }]), sw4: SW('sw4', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('r1', 'eth1', 'r2', 'eth0'),
              L('h3', 'eth0', 'sw3', 'p1'), L('r2', 'eth1', 'sw3', 'p2'), L('h4', 'eth0', 'sw4', 'p1'), L('r2', 'eth2', 'sw4', 'p2')]
    }),
    success: [
      { type: 'route_exists', dev: 'r1', cidr: '10.0.3.0/24' }, { type: 'route_exists', dev: 'r1', cidr: '10.0.4.0/24' },
      { type: 'reachable', a: 'h1', b: 'h3' }, { type: 'reachable', a: 'h1', b: 'h4' }
    ],
    solution: [['r1', 'ip route add 10.0.3.0/24 via 10.0.12.2'], ['r1', 'ip route add 10.0.4.0/24 via 10.0.12.2']]
  },

  { id: 'stop-the-pivot', chapter: 'Network security',
    title: 'Stop the pivot',
    story: 'The web server sits in a DMZ. If it were ever compromised, an attacker could hop from it straight to the internal database. The office must still reach the web server, and the web server must still answer — but it must not be able to reach the internal 10.0.3.0/24 network.',
    objective: 'At the firewall, block traffic from the web server (10.0.2.10) to the internal network (10.0.3.0/24), without breaking office→web.',
    ticket: { id: 'INC-1130', from: 'Incident response · red-team finding', priority: 'P1', symptom: "Red team showed that from the DMZ web server they could reach straight into the internal database segment (10.0.3.0/24). That lateral path has to die. Office users must still reach the website, and the site must still serve." },
    diagnose: { q: 'The dangerous path is web → internal. Office → web must stay. What match precisely cuts the pivot without collateral damage?', options: ['source = web server AND destination = 10.0.3.0/24', 'destination port 80 from anywhere', 'source = any host in the office'], answer: 0, because: 'Blocking by source alone would break the web server\'s legitimate replies; blocking by destination alone could hit office traffic. Match BOTH — from the web server, to the internal subnet — on the DMZ interface.' },
    console: 'fw',
    hints: ['Match on BOTH source and destination: from the web server, to the internal subnet.', 'The web server arrives on the DMZ interface (eth1). Block its traffic destined for 10.0.3.0/24 only.', 'Run `iptables -A INPUT -i eth1 -s 10.0.2.10 -d 10.0.3.0/24 -j DROP`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        db: H('db', '10.0.3.10', 24, '10.0.3.1'),
        fw: R('fw', 'firewall', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24), eth2: iface('10.0.3.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }]), sw3: SW('sw3', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('fw', 'eth0', 'sw1', 'p2'), L('web', 'eth0', 'sw2', 'p1'), L('fw', 'eth1', 'sw2', 'p2'), L('db', 'eth0', 'sw3', 'p1'), L('fw', 'eth2', 'sw3', 'p2')]
    }),
    success: [
      { type: 'reachable', a: 'h1', b: 'web', proto: 'tcp', dport: 80 },
      { type: 'not_reachable', a: 'web', b: 'db' }
    ],
    solution: [['fw', 'iptables -A INPUT -i eth1 -s 10.0.2.10 -d 10.0.3.0/24 -j DROP']]
  },

  { id: 'renew-the-lease', chapter: 'DHCP',
    title: 'No address, no network',
    story: 'h1 is stuck with a leftover static address (10.0.9.50) from a different site and can\'t reach anything. This office LAN runs a DHCP server on the router r1 that hands out addresses in 10.0.1.0/24, along with the gateway and DNS. The app server is at 10.0.2.10, across r1.',
    objective: 'Get h1 a working lease from DHCP so it can reach the app server.',
    ticket: { id: 'INC-1142', from: 'Sam · just moved desks', priority: 'P2', symptom: "I moved over from the other building and now my laptop can't reach anything — not the app server, nothing. It still has whatever settings it had at the old site." },
    diagnose: { q: '`ip addr` shows h1 is statically set to 10.0.9.50 — the wrong network entirely. This LAN\'s DHCP server offers 10.0.1.x with a gateway and DNS. What gets h1 a correct setup in one step?', options: ['request a DHCP lease with `dhclient eth0`', 'manually add a default route', 'set a DNS server by hand'], answer: 0, because: 'DHCP hands out the address, the gateway, and the resolver together. `dhclient eth0` replaces the stale static config with a working lease — no manual addressing needed.' },
    console: 'h1',
    hints: ['A static address from another site won\'t work here — this LAN uses DHCP.', 'Ask the DHCP server for a lease on your interface.', 'Run `dhclient eth0`, then `ping srv`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.9.50', 24),
        srv: SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        r1: Object.assign(R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
          { dhcp: { iface: 'eth0', range: [ip('10.0.1.100'), ip('10.0.1.150')], prefix: 24, gw: ip('10.0.1.1'), dns: ip('10.0.2.10') } }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('srv', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'dhclient eth0']]
  },

  { id: 'name-wont-resolve', chapter: 'DNS / naming',
    title: 'The name won\'t resolve',
    story: 'Users report the intranet site (intranet.corp.local) won\'t load from h1 — but typing its IP, 10.0.2.10, works fine. h1 is correctly addressed and reaches the network. The DNS server for this site is dns1 at 10.0.2.53.',
    objective: 'Point h1 at the DNS server so intranet.corp.local resolves to 10.0.2.10.',
    ticket: { id: 'INC-1156', from: 'Help desk · on behalf of Rowan', priority: 'P3', symptom: "The intranet page just times out with a name error. But a colleague said to type the raw IP address and that loads it fine, which makes no sense to me." },
    diagnose: { q: 'From h1, `dig intranet.corp.local` fails while `ping 10.0.2.10` succeeds. The path and the server are clearly fine. What does that split tell you?', options: ['h1 has no DNS resolver configured, so names never get looked up', 'the web server is down', 'a firewall is blocking the website'], answer: 0, because: 'Reaching the IP proves routing and the server are healthy. Only name lookup is broken — h1 has no resolver set. Point it at the DNS server and names resolve.' },
    console: 'h1',
    hints: ['`resolvectl status` shows which DNS server h1 is using — if any.', 'The DNS server is dns1 at 10.0.2.53; h1 has none set.', 'Run `resolvectl dns eth0 10.0.2.53`, then `dig intranet.corp.local`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        www: SRV('www', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        dns1: Object.assign(SRV('dns1', '10.0.2.53', 24, '10.0.2.1', { 53: 'dns' }),
          { dns: { 'intranet.corp.local': ip('10.0.2.10') } }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('www', 'eth0', 'sw2', 'p1'), L('dns1', 'eth0', 'sw2', 'p2'), L('r1', 'eth1', 'sw2', 'p3')]
    }),
    success: [{ type: 'resolves', dev: 'h1', name: 'intranet.corp.local', ip: '10.0.2.10' }],
    solution: [['h1', 'resolvectl dns eth0 10.0.2.53']]
  },

  { id: 'expose-the-server', chapter: 'NAT',
    title: 'Let the world in',
    story: 'The web server web (10.0.1.10) runs fine on the inside, but customers on the internet can\'t reach it. The edge router has one public address, 203.0.113.10, facing the internet host wan; web\'s 10.x address isn\'t routable out there.',
    objective: 'On the edge router, forward inbound web traffic (tcp/80) on the public address to the internal server.',
    ticket: { id: 'INC-1168', from: 'Product owner', priority: 'P1', symptom: "We launched the site but customers say it just times out. Internally everyone can open it fine on 10.0.1.10. From outside — nothing. The public IP is 203.0.113.10." },
    diagnose: { q: 'Outside hosts hit the public address but never reach the web server, whose 10.0.1.10 address has no route on the internet. What lets outside traffic in to it?', options: ['a destination-NAT (port-forward) mapping the public IP’s tcp/80 to the internal server', 'a default route on the web server', 'opening tcp/80 in the firewall'], answer: 0, because: 'A private 10.x address is unreachable from the internet. A port-forward (DNAT) on the edge rewrites inbound traffic for 203.0.113.10:80 to 10.0.1.10, so the public IP fronts the internal server.' },
    console: 'edge',
    hints: ['The server’s private address can’t be reached from outside directly — traffic must come in via the public IP.', 'Port-forward tcp/80 arriving on the outside interface (eth1) to the internal server.', 'Run `iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 -j DNAT --to-destination 10.0.1.10`.'],
    build: () => ({
      devices: {
        wan: H('wan', '203.0.113.9', 24),
        web: SRV('web', '10.0.1.10', 24, '10.0.1.1', { 80: 'http' }),
        edge: R('edge', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('203.0.113.10', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('web', 'eth0', 'sw1', 'p1'), L('edge', 'eth0', 'sw1', 'p2'), L('wan', 'eth0', 'sw2', 'p1'), L('edge', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'port_forward', from: 'wan', public: '203.0.113.10', dport: 80, server: 'web', proto: 'tcp' }],
    solution: [['edge', 'iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 -j DNAT --to-destination 10.0.1.10']]
  },

  { id: 'share-one-ip', chapter: 'NAT',
    title: 'Share one public address',
    story: 'The office runs on private addresses (10.0.1.0/24) behind the edge router, which has a single public address, 203.0.113.10. Staff can\'t reach anything on the internet — their packets go out, but nothing comes back.',
    objective: 'On the edge router, masquerade the office network behind the public address so staff can reach the internet host site.',
    ticket: { id: 'INC-1177', from: 'Office manager', priority: 'P2', symptom: "Nobody in the office can get online today. It's not just one site — everything external is dead. Internal stuff works fine. We have one public IP from the ISP." },
    diagnose: { q: 'The office PCs’ packets reach the internet server, but replies never come back. Their 10.x source addresses aren’t routable on the internet. What fixes the return path?', options: ['source-NAT (masquerade) so the office shares the edge’s public address', 'a static route to 10.0.1.0/24 on the internet server', 'a second DNS server'], answer: 0, because: 'Replies to a private 10.x source can’t be routed back from the internet. Masquerade rewrites the office’s source to the edge’s public IP; the edge tracks the flow and translates replies back to the right PC.' },
    console: 'edge',
    hints: ['The request reaches the server; it’s the reply that dies — the internet can’t route back to a 10.x address.', 'Masquerade traffic from the office network as it leaves the outside interface (eth1).', 'Run `iptables -t nat -A POSTROUTING -o eth1 -s 10.0.1.0/24 -j MASQUERADE`.'],
    build: () => ({
      devices: {
        pc: H('pc', '10.0.1.10', 24, '10.0.1.1'),
        site: SRV('site', '203.0.113.50', 24, null, { 80: 'http' }),
        edge: R('edge', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('203.0.113.10', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('pc', 'eth0', 'sw1', 'p1'), L('edge', 'eth0', 'sw1', 'p2'), L('site', 'eth0', 'sw2', 'p1'), L('edge', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'reachable', a: 'pc', b: 'site' }],
    solution: [['edge', 'iptables -t nat -A POSTROUTING -o eth1 -s 10.0.1.0/24 -j MASQUERADE']]
  }

];

module.exports = { chapters };
