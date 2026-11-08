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
    hints: ['`ip addr` shows h1 is in the wrong network.', '10.0.9.x and 10.0.1.x are different /24 networks — they can\'t talk directly.', 'Re-address: `ip addr replace 10.0.1.10/24 dev eth0`.'],
    build: () => ({
      devices: { h1: H('h1', '10.0.9.10', 24), srv: SRV('srv', '10.0.1.5', 24, null, { 445: 'smb' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr replace 10.0.1.10/24 dev eth0']]
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
    hints: ['`ip addr` shows h1 is 10.0.1.10/25 — a /25, not a /24.', 'With /25, .10 is in 10.0.1.0/25 and .200 is in 10.0.1.128/25 — different networks.', 'Run `ip addr replace 10.0.1.10/24 dev eth0`.'],
    build: () => ({
      devices: { h1: H('h1', '10.0.1.10', 25), srv: SRV('srv', '10.0.1.200', 24, null, { 445: 'smb' }), sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]) },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' }, { type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip addr replace 10.0.1.10/24 dev eth0']]
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


  { id: 'ios-acl-order-incident', chapter: 'Cisco firewall operations',
    title: 'Restore HTTPS after an ACL change',
    story: 'Finance users cannot reach the portal after a router policy update. The route and server are healthy. An inbound named ACL is attached to the office interface, but a broad deny is positioned above the intended HTTPS permit.',
    objective: 'Correct ACL order so office users can reach HTTPS (tcp/443), while SSH (tcp/22) and other unmatched traffic remain blocked. Verify both paths and save the configuration.',
    ticket: { id: 'INC-1184', from: 'NOC · application availability', priority: 'P1', symptom: 'Finance users cannot open 10.0.2.10 over HTTPS. The outage began after a firewall policy change. SSH must remain restricted; restore only the required service.' },
    diagnose: { q: 'The interface is up and the route exists. show access-lists FINANCE-IN shows sequence 10 denies all IP traffic, followed by sequence 20 permitting HTTPS. What is the fault?', options: ['First-match processing means sequence 10 shadows the HTTPS permit', 'The HTTPS server needs a gateway change', 'The ACL must be attached outbound on the server interface'], answer: 0, because: 'IOS ACLs are evaluated top-down. The broad deny matches first, so the later HTTPS permit is never reached. Fix the order narrowly; do not remove the security policy.' },
    console: 'r1',
    hints: ['Inspect show access-lists FINANCE-IN and show ip interface eth0 before changing anything.', 'Remove the broad deny at sequence 10 and the stale permit at sequence 20, then rebuild the intended permit-before-deny policy.', 'Use configure terminal, ip access-list extended FINANCE-IN, no 10, no 20, then 10 permit tcp 10.0.1.0 0.0.0.255 host 10.0.2.10 eq 443 and 20 deny ip any any. Verify HTTPS and SSH, then write memory.'],
    build: () => {
      const fw = R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) });
      fw.acls = [
        { aclName: 'FINANCE-IN', seq: 10, action: 'deny', proto: 'ip', src: null, srcWildcard: null, dst: null, dstWildcard: null },
        { aclName: 'FINANCE-IN', seq: 20, action: 'allow', proto: 'tcp', src: ip('10.0.1.0'), srcWildcard: ip('0.0.0.255'), dst: ip('10.0.2.10'), dstWildcard: 0, dport: 443 }
      ];
      fw.ifaces.eth0.accessGroups = { in: 'FINANCE-IN' };
      return { devices: {
        finance: H('finance', '10.0.1.10', 24, '10.0.1.1'),
        app: SRV('app', '10.0.2.10', 24, '10.0.2.1', { 443: 'https', 22: 'ssh', 80: 'http' }),
        r1: fw, sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      }, links: [L('finance', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('app', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')] };
    },
    success: [
      { type: 'reachable', a: 'finance', b: 'app', proto: 'tcp', dport: 443 },
      { type: 'acl_blocks', src: 'finance', dst: '10.0.2.10', proto: 'tcp', dport: 22 },
      { type: 'acl_blocks', src: 'finance', dst: '10.0.2.10', proto: 'tcp', dport: 80 }
    ],
    solution: [['r1', 'enable'], ['r1', 'show access-lists FINANCE-IN'], ['r1', 'show ip interface eth0'], ['r1', 'configure terminal'], ['r1', 'ip access-list extended FINANCE-IN'], ['r1', 'no 10'], ['r1', 'no 20'], ['r1', '10 permit tcp 10.0.1.0 0.0.0.255 host 10.0.2.10 eq 443'], ['r1', '20 deny ip any any'], ['r1', 'end'], ['r1', 'show access-lists FINANCE-IN'], ['r1', 'write memory']]
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

  { id: 'review-branch', chapter: 'Design review',
    title: 'Audit the branch office',
    story: 'A junior handed you this branch network and said it was done. h1 should reach the file server srv at 10.0.2.10. It does not. Find every real problem — do not fix them yet.',
    objective: 'Check every statement that is a real fault. Leave the false ones unchecked, then Check.',
    ticket: { id: 'REV-2001', from: 'You · design review', priority: 'P3', symptom: 'Junior says the branch is ready. h1 cannot reach srv. Audit before you change anything.' },
    diagnose: { q: 'h1 cannot reach srv on another subnet. What is the first thing a design review should establish?', options: ['whether h1 is even in the right network and has a path off it', 'whether the server process is listening', 'whether the switches have enough ports'], answer: 0, because: 'Reachability off-subnet needs a correct address and a route. Confirm those before blaming the server or the switch.' },
    console: 'h1',
    hints: ['`ip addr` on h1 — is it in 10.0.1.0/24 with the router?', '`ip route` — is there a default route?', 'srv is 10.0.2.10; the path is h1 → sw1 → r1 → sw2 → srv.'],
    review: {
      findings: [
        { id: 'wrong-subnet', text: 'h1 is addressed in the wrong subnet (not 10.0.1.0/24)', planted: true },
        { id: 'no-default', text: 'h1 has no default route, so it cannot reach other networks', planted: true },
        { id: 'srv-down', text: 'The file server srv has no IP address', planted: false },
        { id: 'sw-off', text: 'Switch sw1 is powered off', planted: false },
        { id: 'acl', text: 'Router r1 is dropping traffic from h1', planted: false }
      ]
    },
    build: () => ({
      devices: {
        h1: H('h1', '10.0.9.50', 24),
        srv: SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 445: 'smb' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('srv', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')]
    }),
    success: [],
    solution: [['h1', 'review wrong-subnet'], ['h1', 'review no-default']]
  }
,

  { id: 'multi-branch-down', chapter: 'Multi-fault',
    title: 'Three things wrong',
    story: 'After a move, h1 cannot reach the intranet (intranet.corp.local at 10.0.2.10). More than one thing is broken. Find each fault, then fix all of them.',
    objective: 'Localize every real fault, then make h1 reach intranet.corp.local.',
    ticket: { id: 'INC-2104', from: 'Facilities · after the move', priority: 'P2', symptom: "The new desk can't open the intranet. We checked the cable. Something else is wrong — maybe more than one thing." },
    diagnose: { q: 'h1 cannot open intranet.corp.local. A single ping to the IP also fails. What does that tell you?', options: ['more than name lookup is broken — addressing or routing is also wrong', 'only DNS is down', 'the website process crashed'], answer: 0, because: 'If the IP itself is unreachable, DNS is not the only fault. Address and route have to be fixed too.' },
    console: 'h1',
    hints: ['`ip addr` — is h1 in 10.0.1.0/24?', '`ip route` — is there a default via 10.0.1.1?', '`resolvectl status` — is 10.0.2.53 set?'],
    faults: [
      { id: 'subnet', text: 'h1 is on the wrong subnet', present: true },
      { id: 'route', text: 'h1 has no default route', present: true },
      { id: 'dns', text: 'h1 has no DNS resolver', present: true },
      { id: 'srv-down', text: 'The web server is powered off', present: false },
      { id: 'acl', text: 'The router is blocking h1', present: false }
    ],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.9.50', 24),
        www: SRV('www', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        dns1: Object.assign(SRV('dns1', '10.0.2.53', 24, '10.0.2.1', { 53: 'dns' }),
          { dns: { 'intranet.corp.local': ip('10.0.2.10') } }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('www', 'eth0', 'sw2', 'p1'), L('dns1', 'eth0', 'sw2', 'p2'), L('r1', 'eth1', 'sw2', 'p3')]
    }),
    success: [
      { type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' },
      { type: 'reachable', a: 'h1', b: 'www' },
      { type: 'resolves', dev: 'h1', name: 'intranet.corp.local', ip: '10.0.2.10' }
    ],
    solution: [
      ['h1', 'fault subnet'], ['h1', 'fault route'], ['h1', 'fault dns'],
      ['h1', 'ip addr replace 10.0.1.10/24 dev eth0'],
      ['h1', 'ip route add default via 10.0.1.1'],
      ['h1', 'resolvectl dns eth0 10.0.2.53']
    ]
  }
,

  { id: 'link-is-down', chapter: 'Interfaces',
    title: 'The cable is fine',
    story: 'h1 is cabled to the switch and has the right address, but it cannot reach the server on the same switch. The interface was left administratively down after imaging.',
    objective: 'Bring h1 eth0 up so it can reach srv.',
    ticket: { id: 'INC-2201', from: 'Imaging desk', priority: 'P3', symptom: "New laptop, right IP, cable clicked in, and it still can't see the file server. Looks dead." },
    diagnose: { q: '`ip addr` shows eth0 DOWN with 10.0.1.10/24. The server is on the same switch. What is actually wrong?', options: ['the interface is administratively down', 'the address is in the wrong subnet', 'the server has no IP'], answer: 0, because: 'The address is correct and the path is one switch. DOWN means the interface will not send. Bring it up.' },
    console: 'h1',
    hints: ['`ip addr` shows the state of eth0.', 'DOWN means it will not transmit, even with a good address.', 'Run `ip link set eth0 up`, then `ping srv`.'],
    build: () => ({
      devices: {
        h1: Object.assign(H('h1', '10.0.1.10', 24), { ifaces: { eth0: { ip: ip('10.0.1.10'), mask: 24, up: false } } }),
        srv: SRV('srv', '10.0.1.5', 24, null, { 445: 'smb' }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')]
    }),
    success: [{ type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip link set eth0 up']]
  },

  { id: 'wrong-gateway', chapter: 'Routing',
    title: 'The wrong door',
    story: 'h1 can reach everything on its own floor, but not the app server at 10.0.2.10. Its default route points at an address that is not the router.',
    objective: 'Replace the bad default route so h1 uses 10.0.1.1.',
    ticket: { id: 'INC-2214', from: 'Noah · Accounts', priority: 'P2', symptom: "I can reach the printer next to me, but the app server on the other floor times out. Started after someone 'fixed' my gateway." },
    diagnose: { q: '`ip route` shows `default via 10.0.1.99`. The real router is 10.0.1.1. Why does local work and remote fail?', options: ['the default route sends off-subnet traffic to a host that is not the router', 'the app server is down', 'h1 has no IP address'], answer: 0, because: 'Same-subnet traffic never uses the default route. Off-subnet traffic follows it — and 10.0.1.99 is not the router.' },
    console: 'h1',
    hints: ['`ip route` shows where the default points.', '10.0.1.99 is not r1. The router is 10.0.1.1.', 'Delete the bad default, then `ip route add default via 10.0.1.1`.'],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.99'),
        srv: SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('srv', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['h1', 'ip route del default'], ['h1', 'ip route add default via 10.0.1.1']]
  },

  { id: 'second-site', chapter: 'Static routing',
    title: 'The new site',
    story: 'A second site, 10.0.8.0/24, was added behind r2. HQ hosts can reach r2, but not the workstations at the new site. r1 is missing the route.',
    objective: 'Add a static route on r1 for 10.0.8.0/24 via 10.0.12.2.',
    ticket: { id: 'INC-2228', from: 'Site lead · Site B', priority: 'P1', symptom: "HQ can ping our router, but nobody can reach the new workstations. The link between the routers is up." },
    diagnose: { q: 'From HQ, ping to r2 (10.0.12.2) works, ping to a host in 10.0.8.0/24 fails at r1. What is missing?', options: ['r1 has no route for 10.0.8.0/24', 'the new site has no switch', 'HQ hosts have no IP'], answer: 0, because: 'Reaching the far router proves the link. r1 simply does not know where 10.0.8.0/24 lives.' },
    console: 'r1',
    hints: ['`ip route` on r1 — is 10.0.8.0/24 listed?', 'The next hop is r2 at 10.0.12.2.', 'Run `ip route add 10.0.8.0/24 via 10.0.12.2`.'],
    build: () => ({
      devices: {
        hq: H('hq', '10.0.1.10', 24, '10.0.1.1'),
        site: SRV('site', '10.0.8.10', 24, '10.0.8.1', { 22: 'ssh' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 24) }),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 24), eth1: iface('10.0.8.1', 24) }, [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }]),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('hq', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('r1', 'eth1', 'r2', 'eth0'), L('site', 'eth0', 'sw2', 'p1'), L('r2', 'eth1', 'sw2', 'p2')]
    }),
    success: [{ type: 'route_exists', dev: 'r1', cidr: '10.0.8.0/24' }, { type: 'reachable', a: 'hq', b: 'site' }],
    solution: [['r1', 'ip route add 10.0.8.0/24 via 10.0.12.2']]
  },

  { id: 'review-exposed', chapter: 'Design review',
    title: 'Audit the public server',
    story: 'Security asked you to review fw in front of web. The website on tcp/80 must stay reachable from h1. Something else is wrong with the policy. Find the real problems — do not change anything yet.',
    objective: 'Check every real policy problem. Leave the false ones unchecked.',
    ticket: { id: 'REV-2230', from: 'Security · review request', priority: 'P2', symptom: 'Please audit the firewall in front of the public web server before we call it done.' },
    diagnose: { q: 'A public web server should answer the web and nothing else. What is the review looking for?', options: ['extra services left reachable, and no default deny', 'the website being too slow', 'the switch having too few ports'], answer: 0, because: 'The failure mode is exposure: anything other than the intended service, plus a policy that allows by default.' },
    console: 'h1',
    hints: ['`nmap web` from h1 — which ports answer?', 'Telnet on 23 should not be open on a public web server.', 'A default-allow firewall is itself a finding.'],
    review: {
      findings: [
        { id: 'telnet', text: 'Telnet (tcp/23) is reachable on the web server', planted: true },
        { id: 'default-allow', text: 'The firewall has no default-deny; unmatched traffic is allowed', planted: true },
        { id: 'web-down', text: 'The website on tcp/80 is not running', planted: false },
        { id: 'no-ip', text: 'h1 has no IP address', planted: false }
      ]
    },
    build: () => ({
      devices: {
        h1: H('h1', '10.0.1.10', 24, '10.0.1.1'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 80: 'http', 23: 'telnet' }),
        fw: R('fw', 'firewall', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('fw', 'eth0', 'sw1', 'p2'), L('web', 'eth0', 'sw2', 'p1'), L('fw', 'eth1', 'sw2', 'p2')]
    }),
    success: [],
    solution: [['h1', 'review telnet'], ['h1', 'review default-allow']]
  },

  { id: 'multi-after-move', chapter: 'Multi-fault',
    title: 'After the move',
    story: 'h1 was moved to the 10.0.1.0/24 floor but still has its old address and its old gateway. The app server is 10.0.2.10. Two things are wrong.',
    objective: 'Localize both real faults, then make h1 reach srv.',
    ticket: { id: 'INC-2241', from: 'Facilities', priority: 'P2', symptom: "Desk move this morning. The laptop can't reach the app server. Local printers on the new floor don't work either." },
    diagnose: { q: 'Local printers on the new floor fail AND the remote app server fails. What does that combination suggest?', options: ['h1 is not even in the new subnet, so both local and remote fail', 'only the app server is down', 'DNS is the only problem'], answer: 0, because: 'If same-floor hosts also fail, the address itself is wrong. Remote failing on top of that usually means the gateway is stale too.' },
    console: 'h1',
    hints: ['`ip addr` — is h1 in 10.0.1.0/24?', '`ip route` — does the default point at 10.0.1.1?', 'Fix the address first, then the route.'],
    faults: [
      { id: 'subnet', text: 'h1 is still on its old subnet', present: true },
      { id: 'gateway', text: 'h1 default route still points at the old gateway', present: true },
      { id: 'srv-down', text: 'The app server is powered off', present: false },
      { id: 'dns', text: 'DNS is the only fault', present: false }
    ],
    build: () => ({
      devices: {
        h1: H('h1', '10.0.9.50', 24, '10.0.9.1'),
        srv: SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 80: 'http' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('srv', 'eth0', 'sw2', 'p1'), L('r1', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'subnet_correct', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' },
      { type: 'reachable', a: 'h1', b: 'srv' }
    ],
    solution: [
      ['h1', 'fault subnet'], ['h1', 'fault gateway'],
      ['h1', 'ip addr replace 10.0.1.10/24 dev eth0'],
      ['h1', 'ip route del default'],
      ['h1', 'ip route add default via 10.0.1.1']
    ]
  }
,

  { id: 'link-died', chapter: 'Redundancy',
    title: 'The primary link died',
    story: 'The link between r1 and r2 is down. HQ can no longer reach the branch at 10.0.8.10. A backup path exists through r3, but r1 has no route for it yet.',
    objective: 'Send 10.0.8.0/24 via the backup router r3 (10.0.13.2) so HQ can reach the branch again.',
    ticket: { id: 'INC-2301', from: 'NOC · link alarm', priority: 'P1', symptom: "Primary circuit to the branch is dark. Users at HQ can't reach 10.0.8.10. The backup router is up — we just aren't using it." },
    diagnose: { q: 'Ping from HQ to the branch fails, and the direct link r1–r2 is down. The backup router r3 is reachable. What has to change?', options: ['r1 needs a route for the branch via the backup next hop', 'the branch server lost its IP', 'HQ has no address'], answer: 0, because: 'The primary next hop is dead. A second path exists; r1 must be told to use it.' },
    console: 'r1',
    hints: ['The r1–r2 link is down. Do not try to bring it up.', '`ip route` on r1 — is there a path via 10.0.13.2?', 'Run `ip route add 10.0.8.0/24 via 10.0.13.2`.'],
    build: () => ({
      devices: {
        hq: H('hq', '10.0.1.10', 24, '10.0.1.1'),
        br: SRV('br', '10.0.8.10', 24, '10.0.8.2', { 22: 'ssh' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 24), eth2: iface('10.0.13.1', 24) },
          [{ dest: ip('10.0.8.0'), mask: 24, via: ip('10.0.12.2') }]),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 24), eth1: iface('10.0.8.1', 24) },
          [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.12.1') }]),
        r3: R('r3', 'router', { eth0: iface('10.0.13.2', 24), eth1: iface('10.0.8.2', 24) },
          [{ dest: ip('10.0.1.0'), mask: 24, via: ip('10.0.13.1') }]),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }])
      },
      links: [
        L('hq', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'),
        { a: ['r1', 'eth1'], b: ['r2', 'eth0'], up: false },
        L('r1', 'eth2', 'r3', 'eth0'),
        L('r2', 'eth1', 'sw2', 'p1'), L('r3', 'eth1', 'sw2', 'p2'), L('br', 'eth0', 'sw2', 'p3')
      ]
    }),
    success: [{ type: 'reachable', a: 'hq', b: 'br' }],
    solution: [['r1', 'ip route add 10.0.8.0/24 via 10.0.13.2']]
  }
,

  { id: 'ospf-neighbor', chapter: 'OSPF',
    title: 'Bring up the neighbor',
    story: 'r1 and r2 share the 10.0.12.0/24 link, but neither is running OSPF. HQ cannot reach the branch at 10.0.8.10 because r1 has no route for it. Enable OSPF so they become neighbors and the branch network is learned.',
    objective: 'Enable OSPF area 0 on the shared link (and on r2 toward the branch) so r1 learns 10.0.8.0/24 and HQ can reach br.',
    ticket: { id: 'INC-2401', from: 'NOC', priority: 'P2', symptom: "The new branch router is cabled and addressed, but HQ still can't reach 10.0.8.10. Nobody added a static route — this was supposed to come up with OSPF." },
    diagnose: { q: '`ospf neighbor` on r1 shows nothing, and there is no static route to 10.0.8.0/24. What is missing?', options: ['OSPF is not enabled on the shared interfaces, so no adjacency and no learned route', 'the branch server is down', 'HQ has the wrong IP'], answer: 0, because: 'The link and addresses are fine. Without OSPF on both ends of the link, there is no neighbor and nothing is advertised.' },
    console: 'r1',
    hints: ['`ospf neighbor` — empty means no adjacency.', 'Enable OSPF on r1 eth1 and on r2 eth0 (the shared link), area 0.', 'Also enable it on r2 eth1 so 10.0.8.0/24 is advertised. Then check `ospf neighbor`.'],
    build: () => ({
      devices: {
        hq: H('hq', '10.0.1.10', 24, '10.0.1.1'),
        br: SRV('br', '10.0.8.10', 24, '10.0.8.1', { 22: 'ssh' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 24) }),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 24), eth1: iface('10.0.8.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('hq', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('r1', 'eth1', 'r2', 'eth0'), L('br', 'eth0', 'sw2', 'p1'), L('r2', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'ospf_neighbor', dev: 'r1', peer: 'r2' },
      { type: 'ospf_route', dev: 'r1', cidr: '10.0.8.0/24' },
      { type: 'reachable', a: 'hq', b: 'br' }
    ],
    solution: [['r1', 'ospf eth1 area 0'], ['r2', 'ospf eth0 area 0'], ['r2', 'ospf eth1 area 0'], ['r1', 'ospf eth0 area 0']]
  }
,

  { id: 'bgp-neighbor', chapter: 'BGP',
    title: 'Bring up the BGP session',
    story: 'The branch is a separate autonomous system. r1 (AS 65001) and r2 (AS 65002) can already ping each other over 10.0.12.0/24, but no BGP session exists, so HQ cannot reach 10.0.8.10.',
    objective: 'Configure BGP on both routers, advertise the branch network, and get the session to Established so HQ can reach br.',
    ticket: { id: 'INC-2501', from: 'NOC · peering', priority: 'P2', symptom: "The branch circuit is up — I can ping their router — but none of their networks show up here. BGP was never turned on." },
    diagnose: { q: 'r1 can ping r2, but `bgp summary` shows no neighbors. What is missing?', options: ['a BGP session: ASN, a neighbor statement on both sides, and a network advertisement', 'the physical link', 'HQ has the wrong IP'], answer: 0, because: 'Reachability of the peer is necessary but not sufficient. BGP needs an ASN, a mutual neighbor, and something to advertise.' },
    console: 'r1',
    hints: ['`bgp summary` — no neighbors yet.', 'On r1: `bgp asn 65001` then `bgp neighbor 10.0.12.2 remote-as 65002`.', 'On r2: ASN 65002, neighbor 10.0.12.1 remote-as 65001, and `bgp network 10.0.8.0/24`.'],
    build: () => ({
      devices: {
        hq: H('hq', '10.0.1.10', 24, '10.0.1.1'),
        br: SRV('br', '10.0.8.10', 24, '10.0.8.1', { 22: 'ssh' }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.12.1', 24) }),
        r2: R('r2', 'router', { eth0: iface('10.0.12.2', 24), eth1: iface('10.0.8.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('hq', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'), L('r1', 'eth1', 'r2', 'eth0'), L('br', 'eth0', 'sw2', 'p1'), L('r2', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'bgp_session', dev: 'r1', peer: 'r2' },
      { type: 'bgp_route', dev: 'r1', cidr: '10.0.8.0/24' },
      { type: 'reachable', a: 'hq', b: 'br' }
    ],
    solution: [
      ['r1', 'bgp asn 65001'], ['r1', 'bgp neighbor 10.0.12.2 remote-as 65002'], ['r1', 'bgp network 10.0.1.0/24'],
      ['r2', 'bgp asn 65002'], ['r2', 'bgp neighbor 10.0.12.1 remote-as 65001'], ['r2', 'bgp network 10.0.8.0/24']
    ]
  }
,

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
  }
,

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
  },

  { id: 'access-vlan-repair', chapter: 'Switching · VLANs',
    title: 'Put Finance back in its VLAN',
    story: 'Finance workstation h1 and the file server srv are on the same IP subnet, but a recent switch change placed their ports in different VLANs. The cable links are up. Restore Layer 2 connectivity without changing either IP address.',
    objective: 'Create VLAN 20 if needed, place both endpoint ports in access VLAN 20, then verify h1 can reach srv.',
    ticket: { id: 'INC-3101', from: 'NOC · Finance floor', priority: 'P2', symptom: 'The workstation can no longer reach the file server. Both devices still show the expected 10.20.0.x addresses and the switch links are green.' },
    diagnose: { q: 'Both devices have correct addresses in the same /24, and their links are up. What should you inspect next?', options: ['The switch access VLAN assigned to each port', 'The default route on h1', 'The DNS resolver on srv'], answer: 0, because: 'Hosts in different VLANs are in separate Layer 2 broadcast domains. Correct IP addresses do not bridge that separation.' },
    console: 'h1',
    hints: ['Select sw1 and run show vlan brief to inspect port membership.', 'Create VLAN 20 with vlan 20, then enter each port with interface p1 or interface p2.', 'Set both ports with switchport mode access and switchport access vlan 20, then test with ping srv.'],
    build: () => ({ devices: {
      h1: H('h1', '10.20.0.10', 24), srv: SRV('srv', '10.20.0.20', 24, null, { 445: 'smb' }),
      sw1: SW('sw1', [{ n: 'p1', v: 10 }, { n: 'p2', v: 20 }])
    }, links: [L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw1', 'p2')] }),
    success: [{ type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['sw1', 'vlan 10'], ['sw1', 'vlan 20'], ['sw1', 'interface p1'], ['sw1', 'switchport mode access'], ['sw1', 'switchport access vlan 20'], ['sw1', 'exit'], ['sw1', 'interface p2'], ['sw1', 'switchport mode access'], ['sw1', 'switchport access vlan 20'], ['sw1', 'exit']]
  },

  { id: 'trunk-allowed-vlan', chapter: 'Switching · VLANs',
    title: 'The VLAN that never crossed the trunk',
    story: 'A small office spans two access switches. h1 and srv are both in VLAN 10 and use the same IP subnet, but the inter-switch trunk only permits VLAN 20. The uplink is up; VLAN 10 traffic is being filtered at Layer 2.',
    objective: 'Add VLAN 10 to both trunk allow-lists and verify h1 can reach srv.',
    ticket: { id: 'INC-3102', from: 'NOC · Office network', priority: 'P1', symptom: 'Users on the first switch cannot reach the file server on the second switch. The uplink is up and other VLANs still work.' },
    diagnose: { q: 'Both endpoint ports are access VLAN 10. The trunk is up but only allows VLAN 20. What is the fault?', options: ['VLAN 10 is missing from the trunk allowed list', 'The hosts need different IP subnets', 'The trunk needs to be shut down'], answer: 0, because: 'A trunk only carries VLANs in its allowed list. The link can be physically up while one VLAN is silently excluded.' },
    console: 'h1',
    hints: ['Inspect show interfaces trunk on both switches.', 'VLAN 10 already exists on both switches; the uplink allow-list is the fault.', 'On each trunk port use switchport trunk allowed vlan 10,20, then ping srv from h1.'],
    build: () => {
      const sw1 = SW('sw1', [{ n: 'p1', v: 10 }, { n: 'p2' }]);
      const sw2 = SW('sw2', [{ n: 'p1' }, { n: 'p2', v: 10 }]);
      sw1.vlans = [1, 10, 20]; sw2.vlans = [1, 10, 20];
      sw1.ifaces.p2.mode = 'trunk'; sw1.ifaces.p2.allowedVlans = [20];
      sw2.ifaces.p1.mode = 'trunk'; sw2.ifaces.p1.allowedVlans = [20];
      return { devices: {
        h1: H('h1', '10.30.0.10', 24), srv: SRV('srv', '10.30.0.20', 24, null, { 445: 'smb' }),
        sw1, sw2
      }, links: [L('h1', 'eth0', 'sw1', 'p1'), L('sw1', 'p2', 'sw2', 'p1'), L('srv', 'eth0', 'sw2', 'p2')] };
    },
    success: [{ type: 'reachable', a: 'h1', b: 'srv' }],
    solution: [['sw1', 'interface p2'], ['sw1', 'switchport mode trunk'], ['sw1', 'switchport trunk allowed vlan 10,20'], ['sw1', 'exit'], ['sw2', 'interface p1'], ['sw2', 'switchport mode trunk'], ['sw2', 'switchport trunk allowed vlan 10,20'], ['sw2', 'exit']]
  }

,
  { id: 'break-the-switching-loop', chapter: 'Switching · STP & MAC learning',
    title: 'Stop the loop, keep the link',
    story: 'A three-switch office has redundant uplinks between all three switches. A recent change left the distribution switch with the wrong bridge priority, so the network team needs the intended root bridge restored and the redundant path safely blocked. Users must stay online while the loop is prevented.',
    objective: 'Make sw3 the root bridge for VLAN 10, verify STP blocks the redundant sw1–sw2 link at sw2/p1, and confirm both endpoint MAC addresses are learned.',
    ticket: { id: 'INC-3201', from: 'NOC · Campus switching', priority: 'P1', symptom: 'Broadcast traffic spikes whenever both uplinks are connected. Users report intermittent access, but disconnecting either uplink makes the network stable.' },
    diagnose: { q: 'Three switches form a triangle. What prevents a Layer 2 loop while preserving a redundant path?', options: ['Spanning Tree Protocol elects a root and blocks one redundant path', 'Change the hosts to different IP subnets', 'Allow every VLAN on every access port'], answer: 0, because: 'STP builds a loop-free forwarding tree. It keeps the physical backup link available but places one port in an alternate/blocking role until the topology changes.' },
    console: 'sw3',
    hints: ['Run show spanning-tree vlan 10 on each switch and compare the root bridge.', 'Lower bridge priority wins the root election. Use spanning-tree vlan 10 priority 4096 on sw3.', 'Verify sw2/p1 is alternate/blocking, then inspect show mac address-table dynamic on sw1.'],
    build: () => {
      const sw1 = SW('sw1', [{ n: 'p1', v: 10 }, { n: 'p2' }, { n: 'p3' }]);
      const sw2 = SW('sw2', [{ n: 'p1' }, { n: 'p2' }]);
      const sw3 = SW('sw3', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3', v: 10 }]);
      for (const sw of [sw1, sw2, sw3]) sw.vlans = [1, 10];
      for (const [sw, ports] of [[sw1,['p2','p3']],[sw2,['p1','p2']],[sw3,['p1','p2']]]) {
        for (const port of ports) { sw.ifaces[port].mode = 'trunk'; sw.ifaces[port].allowedVlans = [10]; }
      }
      return { devices: {
        h1: H('h1', '10.40.0.10', 24), srv: SRV('srv', '10.40.0.20', 24, null, { 445: 'smb' }),
        sw1, sw2, sw3
      }, links: [
        L('h1', 'eth0', 'sw1', 'p1'), L('srv', 'eth0', 'sw3', 'p3'),
        L('sw1', 'p2', 'sw2', 'p1'), L('sw2', 'p2', 'sw3', 'p1'), L('sw3', 'p2', 'sw1', 'p3')
      ] };
    },
    success: [
      { type: 'stp_root', dev: 'sw1', vlan: 10, root: 'sw3' },
      { type: 'stp_blocked', dev: 'sw2', vlan: 10, port: 'p1' },
      { type: 'mac_entry', dev: 'sw1', vlan: 10, device: 'h1', port: 'p1' },
      { type: 'mac_entry', dev: 'sw1', vlan: 10, device: 'srv', port: 'p3' },
      { type: 'reachable', a: 'h1', b: 'srv' }
    ],
    solution: [['sw3', 'spanning-tree vlan 10 priority 4096'], ['h1', 'ping srv'], ['sw1', 'show spanning-tree vlan 10'], ['sw1', 'show mac address-table dynamic']]
  }

  ,
  { id: 'asa-publish-https', chapter: 'Cisco ASA firewall operations',
    title: 'Publish the secure customer portal',
    story: 'A customer portal is hosted on an inside web server. The public address belongs to the ASA outside interface. A change request asks for HTTPS-only publication using static PAT, while the inside-to-outside path must remain stateful.',
    objective: 'Configure ASA interface roles and security levels, publish TCP/443 to the inside web server with an object NAT static PAT rule, apply an inbound outside ACL, verify with packet-tracer, and save the configuration.',
    ticket: { id: 'CHG-2048', from: 'Network security · change window', priority: 'P1', symptom: 'Customers cannot reach the portal securely. Publish HTTPS on 198.51.100.10 to the inside server 10.0.2.10. Do not expose SSH or HTTP, and do not break normal inside-initiated sessions.' },
    diagnose: { q: 'The web host is healthy on the inside network, but the public address is owned by the firewall. Which ASA features must work together to publish only HTTPS?', options: ['An outside inbound ACL permit plus object NAT static PAT to the inside host', 'A static route on the web server only', 'An IOS ip access-group on the outside interface'], answer: 0, because: 'ASA publication requires two separate controls: the inbound ACL authorizes the service, and object NAT translates the public interface address/port to the inside server. The ASA security-level model also allows higher-to-lower sessions and their stateful replies.' },
    console: 'asa',
    hints: ['Start by entering enable and configure terminal. Give eth0 the nameif outside / level 0 and eth1 the nameif inside / level 100.', 'Create OUTSIDE_IN to permit only TCP/443 to 198.51.100.10, then apply it inbound on outside.', 'Create object network WEB-PORTAL, set host 10.0.2.10, then add nat (inside,outside) static interface service tcp 443 443. Verify with show access-list, show nat and packet-tracer.'],
    build: () => ({
      devices: {
        remote: H('remote', '198.51.100.50', 24, '198.51.100.10'),
        web: SRV('web', '10.0.2.10', 24, '10.0.2.1', { 443: 'https', 80: 'http', 22: 'ssh' }),
        asa: Object.assign(R('asa', 'firewall', { eth0: iface('198.51.100.10', 24), eth1: iface('10.0.2.1', 24) }), { firewallOS: 'asa' }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]), sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('remote', 'eth0', 'sw1', 'p1'), L('asa', 'eth0', 'sw1', 'p2'), L('web', 'eth0', 'sw2', 'p1'), L('asa', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'port_forward', from: 'remote', public: '198.51.100.10', dport: 443, server: 'web', proto: 'tcp' },
      { type: 'acl_blocks', src: 'remote', dst: '198.51.100.10', proto: 'tcp', dport: 22 },
      { type: 'acl_blocks', src: 'remote', dst: '198.51.100.10', proto: 'tcp', dport: 80 }
    ],
    solution: [
      ['asa', 'enable'], ['asa', 'show interface ip brief'], ['asa', 'configure terminal'],
      ['asa', 'interface eth0'], ['asa', 'nameif outside'], ['asa', 'security-level 0'], ['asa', 'exit'],
      ['asa', 'interface eth1'], ['asa', 'nameif inside'], ['asa', 'security-level 100'], ['asa', 'exit'],
      ['asa', 'access-list OUTSIDE_IN extended permit tcp any host 198.51.100.10 eq 443'],
      ['asa', 'access-group OUTSIDE_IN in interface outside'],
      ['asa', 'object network WEB-PORTAL'], ['asa', 'host 10.0.2.10'],
      ['asa', 'nat (inside,outside) static interface service tcp 443 443'], ['asa', 'exit'], ['asa', 'end'],
      ['asa', 'show access-list OUTSIDE_IN'], ['asa', 'show access-group'], ['asa', 'show nat'],
      ['asa', 'packet-tracer input outside tcp 198.51.100.50 50000 198.51.100.10 443'],
      ['asa', 'write memory']
    ]
  }

,
  { id: 'asa-object-group-vendor-access', chapter: 'Cisco ASA firewall operations',
    title: 'Restrict the vendor portal to approved partners',
    story: 'A vendor portal is reachable from the internet. Security has approved one partner subnet for HTTPS only. The current policy is difficult to maintain because addresses and services are repeated in individual rules.',
    objective: 'Build reusable network and service object-groups, use them in an ordered inbound ACL, preserve diagnostic ICMP, deny unapproved services, verify hit counters, and save the policy.',
    ticket: { id: 'SEC-3117', from: 'Security operations · access review', priority: 'P1', symptom: 'The vendor portal must remain available to the approved partner subnet, but the guest network must not reach it and partners must not use SSH or HTTP. Make the policy maintainable so approved server and service members can be updated centrally.' },
    diagnose: { q: 'What is the safest way to make this policy reusable without broadening access?', options: ['Use separate network object-groups for approved sources and portal servers, plus a TCP/443 service group', 'Permit any source to any destination and rely on the server firewall', 'Create one permit rule per address and leave the old broad rule in place'], answer: 0, because: 'Object-groups centralise related addresses and services. The ACL still applies first-match ordering and an implicit deny, so a precise group-based permit is easier to audit than broad or duplicated rules.' },
    console: 'asa',
    hints: ['Enter enable and configure terminal. Set eth0 to nameif outside / security-level 0 and eth1 to nameif inside / security-level 100. Create object-group network APPROVED_PARTNERS with network-object 203.0.113.0 255.255.255.240, and PORTAL_SERVERS with network-object host 10.0.2.10.', 'Create object-group service PORTAL_TCP and add service-object tcp destination eq 443. Exit each group context before creating the ACL.', 'Create PARTNER_IN line 10 to permit tcp between the two network groups using PORTAL_TCP, then line 20 to permit icmp any any. Apply it inbound on outside. Test partner HTTPS, guest HTTPS, partner SSH and HTTP; inspect counters and save.'],
    build: () => ({
      devices: {
        partner: H('partner', '203.0.113.10', 24, '203.0.113.1'),
        guest: H('guest', '203.0.113.50', 24, '203.0.113.1'),
        portal: SRV('portal', '10.0.2.10', 24, '10.0.2.1', { 443: 'https', 80: 'http', 22: 'ssh' }),
        asa: Object.assign(R('asa', 'firewall', { eth0: iface('203.0.113.1', 24), eth1: iface('10.0.2.1', 24) }), { firewallOS: 'asa' }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('partner', 'eth0', 'sw1', 'p1'), L('guest', 'eth0', 'sw1', 'p2'), L('asa', 'eth0', 'sw1', 'p3'), L('portal', 'eth0', 'sw2', 'p1'), L('asa', 'eth1', 'sw2', 'p2')]
    }),
    success: [
      { type: 'reachable', a: 'partner', b: 'portal' },
      { type: 'acl_blocks', src: 'guest', dst: 'portal', proto: 'tcp', dport: 443 },
      { type: 'acl_blocks', src: 'partner', dst: 'portal', proto: 'tcp', dport: 22 },
      { type: 'acl_blocks', src: 'partner', dst: 'portal', proto: 'tcp', dport: 80 }
    ],
    solution: [
      ['asa','enable'], ['asa','configure terminal'],
      ['asa','interface eth0'], ['asa','nameif outside'], ['asa','security-level 0'], ['asa','exit'],
      ['asa','interface eth1'], ['asa','nameif inside'], ['asa','security-level 100'], ['asa','exit'],
      ['asa','object-group network APPROVED_PARTNERS'], ['asa','network-object 203.0.113.0 255.255.255.240'], ['asa','exit'],
      ['asa','object-group network PORTAL_SERVERS'], ['asa','network-object host 10.0.2.10'], ['asa','exit'],
      ['asa','object-group service PORTAL_TCP'], ['asa','service-object tcp destination eq 443'], ['asa','exit'],
      ['asa','access-list PARTNER_IN line 10 extended permit tcp object-group APPROVED_PARTNERS object-group PORTAL_SERVERS object-group PORTAL_TCP'],
      ['asa','access-list PARTNER_IN line 20 extended permit icmp any any'],
      ['asa','access-group PARTNER_IN in interface outside'], ['asa','end'],
      ['asa','ping portal'], ['asa','show object-group'], ['asa','show access-list PARTNER_IN'],
      ['asa','clear access-list PARTNER_IN'], ['asa','show access-list PARTNER_IN'], ['asa','write memory']
    ]
  }
,
  { id: 'branch-services-restoration', chapter: 'Enterprise network services',
    title: 'The branch is online, but services are not',
    story: 'A branch office was moved onto a routed VLAN. New clients cannot obtain addresses, users cannot resolve the internal portal, device clocks are drifting, and the central log collector is missing router events. The services host is srv at 10.0.2.10. Restore the service chain without changing the addressing plan.',
    objective: 'Build a DHCP pool and relay, restore DNS resolution, synchronize the router with NTP, and forward operational logs to the central collector. Verify each service and save the router configuration.',
    ticket: { id: 'INC-3428', from: 'Network operations · branch office', priority: 'P1', symptom: 'The branch help desk reports that new laptops show no network address. The portal works by IP but not by name. Security also says event timestamps do not line up and the collector has stopped receiving router changes.' },
    diagnose: { q: 'Which approach best isolates this multi-service outage without masking the root causes?', options: ['Validate DHCP allocation and relay first, then test DNS, NTP and syslog transport independently', 'Replace the router and server immediately', 'Set static addresses on every laptop and ignore the monitoring alerts'], answer: 0, because: 'The symptoms span separate services. Establish the client lease and gateway first, then test name resolution, time synchronization and log delivery as independent dependencies.' },
    console: 'r1',
    hints: ['On srv, create an IOS DHCP pool for 10.0.1.0/24. Exclude the gateway and infrastructure range, then set default-router 10.0.1.1 and dns-server 10.0.2.10.', 'On r1 eth0, configure ip helper-address 10.0.2.10. Set ip name-server 10.0.2.10 and verify the router can reach srv.', 'Configure ntp server 10.0.2.10 and logging host 10.0.2.10 on r1. Use show ntp status, show ntp associations and show logging; then obtain a lease on h1 and test its portal name lookup.'],
    build: () => ({
      devices: {
        h1: H('h1'),
        portal: SRV('portal', '10.0.2.20', 24, '10.0.2.1', { 443: 'https' }),
        srv: Object.assign(SRV('srv', '10.0.2.10', 24, '10.0.2.1', { 53: 'dns', 67: 'dhcp', 123: 'ntp', 514: 'syslog' }),
          { dns: { 'portal.branch.local': ip('10.0.2.20') }, ntp: { master: true, stratum: 3 }, syslogCollector: true }),
        r1: R('r1', 'router', { eth0: iface('10.0.1.1', 24), eth1: iface('10.0.2.1', 24) }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }]),
        sw2: SW('sw2', [{ n: 'p1' }, { n: 'p2' }, { n: 'p3' }])
      },
      links: [L('h1', 'eth0', 'sw1', 'p1'), L('r1', 'eth0', 'sw1', 'p2'),
        L('portal', 'eth0', 'sw2', 'p1'), L('srv', 'eth0', 'sw2', 'p2'), L('r1', 'eth1', 'sw2', 'p3')]
    }),
    success: [
      { type: 'dhcp_lease', dev: 'h1', iface: 'eth0', cidr: '10.0.1.0/24' },
      { type: 'reachable', a: 'h1', b: 'portal' },
      { type: 'resolves', dev: 'h1', name: 'portal.branch.local', ip: '10.0.2.20' },
      { type: 'ntp_sync', dev: 'r1' },
      { type: 'syslog_received', collector: 'srv', source: 'r1' }
    ],
    solution: [
      ['srv','enable'], ['srv','configure terminal'],
      ['srv','ip dhcp excluded-address 10.0.1.1 10.0.1.20'],
      ['srv','ip dhcp pool BRANCH-USERS'], ['srv','network 10.0.1.0 255.255.255.0'],
      ['srv','default-router 10.0.1.1'], ['srv','dns-server 10.0.2.10'],
      ['srv','domain-name branch.local'], ['srv','lease 7'], ['srv','exit'], ['srv','end'],
      ['r1','enable'], ['r1','configure terminal'], ['r1','interface eth0'],
      ['r1','ip helper-address 10.0.2.10'], ['r1','exit'],
      ['r1','ip name-server 10.0.2.10'], ['r1','ntp server 10.0.2.10'],
      ['r1','logging host 10.0.2.10'], ['r1','logging trap informational'],
      ['r1','logging source-interface eth1'], ['r1','end'],
      ['r1','show ntp status'], ['r1','show ntp associations'], ['r1','show logging'], ['r1','write memory'],
      ['h1','dhclient eth0'], ['h1','dig portal.branch.local'], ['h1','ping portal']
    ]
  }
,
  { id: 'restore-ospf-branch-connectivity', chapter: 'Enterprise routing',
    title: 'The remote branch has disappeared from the route table',
    story: 'A maintenance window replaced a static-routing design with OSPF. The routers can reach their directly connected neighbors, but the remote branch LAN is missing from the route table. The help desk reports that users at HQ cannot reach the inventory application in the branch.',
    objective: 'Restore OSPF adjacencies across the three-router path, advertise the branch and HQ LANs, keep user-facing LAN interfaces passive, and verify end-to-end connectivity.',
    ticket: { id: 'INC-3512', from: 'NOC · routing queue', priority: 'P1', symptom: 'Inventory application 10.3.3.10 is unreachable from HQ. R1 has no route for 10.3.3.0/24. Transit links are up and the routers are reachable on their directly connected networks.' },
    diagnose: { q: 'R1 has no OSPF route for the branch LAN. What should you validate first?', options: ['Check OSPF neighbor state, area consistency and the network statements that enable the transit and LAN interfaces', 'Add a default route on every host and ignore OSPF', 'Change the switch VLANs on all four LAN segments'], answer: 0, because: 'OSPF must first form adjacencies on matching active transit interfaces. Then verify that the branch LAN is included in the process and advertised; a working neighbor alone does not prove the remote prefix is present.' },
    console: 'r1',
    hints: ['Use show ip ospf neighbor and show ip ospf interface brief on each router. A transit link must be enabled in the same OSPF area at both ends.', 'Enter router ospf 10, set a unique router-id, and add network statements with wildcard masks. Make the HQ and branch user-facing interfaces passive: their networks are still advertised, but they do not form neighbor adjacencies with end hosts.', 'Verify that R1 learns 10.3.3.0/24 and R3 learns 10.1.1.0/24. Then test from h1 to h3 and save each router configuration.'],
    build: () => ({
      devices: {
        h1: H('h1','10.1.1.10',24,'10.1.1.1'),
        h3: H('h3','10.3.3.10',24,'10.3.3.1'),
        r1: R('r1','router',{eth0:iface('10.1.1.1',24),eth1:iface('10.0.12.1',30)}),
        r2: R('r2','router',{eth0:iface('10.0.12.2',30),eth1:iface('10.0.23.1',30)}),
        r3: R('r3','router',{eth0:iface('10.0.23.2',30),eth1:iface('10.3.3.1',24)}),
        s1: SW('s1',[{n:'p1'},{n:'p2'}]), s2: SW('s2',[{n:'p1'},{n:'p2'}]),
        s3: SW('s3',[{n:'p1'},{n:'p2'}]), s4: SW('s4',[{n:'p1'},{n:'p2'}])
      },
      links: [L('h1','eth0','s1','p1'),L('r1','eth0','s1','p2'),
        L('r1','eth1','s2','p1'),L('r2','eth0','s2','p2'),
        L('r2','eth1','s3','p1'),L('r3','eth0','s3','p2'),
        L('r3','eth1','s4','p1'),L('h3','eth0','s4','p2')]
    }),
    success: [
      { type:'ospf_neighbor', dev:'r1', peer:'r2' },
      { type:'ospf_neighbor', dev:'r2', peer:'r3' },
      { type:'ospf_route', dev:'r1', cidr:'10.3.3.0/24' },
      { type:'ospf_route', dev:'r3', cidr:'10.1.1.0/24' },
      { type:'reachable', a:'h1', b:'h3' }
    ],
    solution: [
      ['r1','enable'],['r1','configure terminal'],['r1','router ospf 10'],['r1','router-id 1.1.1.1'],
      ['r1','network 10.1.1.0 0.0.0.255 area 0'],['r1','network 10.0.12.0 0.0.0.3 area 0'],['r1','passive-interface eth0'],['r1','end'],['r1','show ip ospf neighbor'],['r1','show ip route'],['r1','write memory'],
      ['r2','enable'],['r2','configure terminal'],['r2','router ospf 10'],['r2','router-id 2.2.2.2'],
      ['r2','network 10.0.12.0 0.0.0.3 area 0'],['r2','network 10.0.23.0 0.0.0.3 area 0'],['r2','end'],['r2','show ip ospf neighbor'],['r2','write memory'],
      ['r3','enable'],['r3','configure terminal'],['r3','router ospf 10'],['r3','router-id 3.3.3.3'],
      ['r3','network 10.0.23.0 0.0.0.3 area 0'],['r3','network 10.3.3.0 0.0.0.255 area 0'],['r3','passive-interface eth1'],['r3','end'],['r3','show ip route'],['r3','write memory'],
      ['h1','ping 10.3.3.10']
    ]
  }
,
  { id: 'bgp-stop-the-route-leak', chapter: 'Enterprise routing · BGP policy',
    title: 'Stop leaking the office network to the ISP',
    story: 'A customer edge router peers with an upstream provider. During a route-policy change, the ISP began learning the office RFC1918 prefix alongside the customer public DMZ. The provider route to the internet is present, but the NOC has raised a route-leak incident and wants the customer advertisement set tightened without breaking the DMZ or outbound reachability.',
    objective: 'Apply outbound prefix filtering on the customer edge so only the public DMZ prefix is advertised, apply inbound filtering on the provider-facing peer, verify the leaked private prefix is withdrawn, and confirm users can still reach the external service.',
    ticket: { id: 'INC-3520', from: 'NOC · ISP peering', priority: 'P1', symptom: 'Our provider says they are receiving 10.10.10.0/24 from our edge router. That is an internal office subnet and must never leave our AS. The public DMZ and internet access must remain online while we correct the advertisements.' },
    diagnose: { q: 'The BGP session is Established and the ISP has learned both 10.10.10.0/24 and 198.51.100.0/24. What is the safest correction?', options: ['Apply an outbound prefix-list to the customer neighbor that permits the public DMZ prefix and denies the private office prefix', 'Shut down the BGP session and remove every network statement', 'Change the office subnet to a public address'], answer: 0, because: 'The peering session is healthy; the fault is route policy. Filter advertisements per neighbor so the required public prefix remains available while the private prefix is withdrawn. A broad session shutdown would cause an avoidable outage.' },
    console: 'edge',
    hints: ['Run show ip bgp summary on edge and isp, then show ip bgp on the ISP. Separate a healthy session from an incorrect advertised prefix.', 'Build CUSTOMER-OUT on edge. Permit 198.51.100.0/24; explicitly deny 10.10.10.0/24. Attach it outbound to neighbor 203.0.113.1.', 'Build PROVIDER-IN on isp to permit the customer DMZ prefix 198.51.100.0/24 and attach it inbound to 203.0.113.2. Verify the ISP no longer learns 10.10.10.0/24, still learns the DMZ, and hq can ping remote.'],
    build: () => ({
      devices: {
        hq: H('hq','10.10.10.10',24,'10.10.10.1'),
        dmz: SRV('dmz','198.51.100.10',24,'198.51.100.1',{443:'https',80:'http'}),
        remote: H('remote','192.0.2.10',24,'192.0.2.1'),
        edge: Object.assign(R('edge','router',{eth0:iface('10.10.10.1',24),eth1:iface('203.0.113.2',30),eth2:iface('198.51.100.1',24)}),{
          bgp:{asn:65010,neighbors:[{ip:ip('203.0.113.1'),remoteAs:64500}],networks:['10.10.10.0/24','198.51.100.0/24'],prefixLists:{}}
        }),
        isp: Object.assign(R('isp','router',{eth0:iface('203.0.113.1',30),eth1:iface('192.0.2.1',24)},
          [{dest:ip('10.10.10.0'),mask:24,via:ip('203.0.113.2')}]),{
          bgp:{asn:64500,neighbors:[{ip:ip('203.0.113.2'),remoteAs:65010}],networks:['192.0.2.0/24'],prefixLists:{}}
        })
      },
      links:[L('hq','eth0','edge','eth0'),L('edge','eth1','isp','eth0'),L('edge','eth2','dmz','eth0'),L('isp','eth1','remote','eth0')]
    }),
    success:[
      {type:'bgp_session',dev:'edge',peer:'isp'},
      {type:'bgp_route',dev:'edge',cidr:'192.0.2.0/24'},
      {type:'bgp_route',dev:'isp',cidr:'198.51.100.0/24'},
      {type:'bgp_route_absent',dev:'isp',cidr:'10.10.10.0/24'},
      {type:'reachable',a:'hq',b:'remote'}
    ],
    solution:[
      ['edge','enable'],
      ['edge','bgp prefix-list CUSTOMER-OUT permit 198.51.100.0/24'],
      ['edge','bgp prefix-list CUSTOMER-OUT deny 10.10.10.0/24'],
      ['edge','bgp neighbor 203.0.113.1 prefix-list CUSTOMER-OUT out'],
      ['isp','enable'],
      ['isp','bgp prefix-list PROVIDER-IN permit 198.51.100.0/24'],
      ['isp','bgp neighbor 203.0.113.2 prefix-list PROVIDER-IN in'],
      ['edge','show ip bgp summary'],['edge','show ip bgp advertised-routes 203.0.113.1'],
      ['isp','show ip bgp'],['isp','show ip route'],['hq','ping remote'],
      ['edge','enable'],['edge','write memory'],['isp','enable'],['isp','write memory']
    ]
  },
  { id: 'wan-gateway-failover', chapter: 'Enterprise WAN · gateway redundancy',
    title: 'Keep the branch online when its primary WAN fails',
    story: 'The branch has two edge routers. R1 is preferred, but its WAN circuit is unstable. Users currently depend on a single first-hop gateway, so an R1 uplink failure strands the entire office even though R2 and its carrier path remain healthy. The NOC wants a shared gateway on both the user and WAN segments, with the LAN-side election tracking R1’s uplink.',
    objective: 'Configure HSRP group 10 on the user LAN and group 20 on the WAN transit. Make R1 preferred, R2 the standby, track R1’s WAN interface from its LAN HSRP group, verify both virtual gateways and end-to-end reachability, then simulate an uplink failure and confirm R2 takes over before restoring R1.',
    ticket: { id: 'INC-3531', from: 'NOC · Branch connectivity', priority: 'P1', symptom: 'Users report a complete branch outage whenever the primary router loses its carrier link. The backup router is powered and connected, but workstations keep sending traffic to the failed gateway. Restore automatic first-hop failover without changing workstation gateway settings.' },
    diagnose: { q: 'R1 and R2 are both connected to the user VLAN. Which design lets hosts keep one gateway address while the routers elect an active forwarder?', options: ['Configure a shared HSRP virtual IP on both routers and track R1’s WAN interface so its priority drops on uplink failure', 'Give every workstation two default gateways and rely on host retry timers', 'Configure the same physical interface IP on both routers'], answer: 0, because: 'A first-hop redundancy protocol presents one virtual gateway to clients. Tracking the upstream interface makes the preferred router yield when its WAN path fails, allowing the standby router to forward traffic.' },
    console: 'r1',
    hints: ['Use show ip interface brief to identify the LAN and WAN interfaces. Both routers must use the same HSRP group and virtual IP on each shared segment.', 'On both LAN interfaces configure standby 10 ip 10.20.0.1. Set R1 priority 110 and R2 priority 100. On R1, track its WAN interface with decrement 30.', 'On both WAN interfaces configure standby 20 ip 203.0.113.254, with R1 priority 110 and R2 priority 100. Verify with show standby brief, then ping the ISP host from hq.', 'Simulate the fault with interface wan and shutdown on r1. Confirm r2 becomes Active for group 10 and group 20 and hq still reaches isp. Restore with no shutdown and verify R1 preempts back to Active.'],
    build: () => ({
      devices: {
        hq: H('hq','10.20.0.10',24,'10.20.0.1'),
        isp: H('isp','203.0.113.10',24,'203.0.113.254'),
        r1: R('r1','router',{lan:iface('10.20.0.2',24),wan:iface('203.0.113.2',24)},[]),
        r2: R('r2','router',{lan:iface('10.20.0.3',24),wan:iface('203.0.113.3',24)},[]),
        swlan: SW('swlan',[{n:'p1'},{n:'p2'},{n:'p3'}]),
        swwan: SW('swwan',[{n:'p1'},{n:'p2'},{n:'p3'}])
      },
      links:[
        L('hq','eth0','swlan','p1'),L('r1','lan','swlan','p2'),L('r2','lan','swlan','p3'),
        L('r1','wan','swwan','p1'),L('r2','wan','swwan','p2'),L('isp','eth0','swwan','p3')
      ]
    }),
    success:[
      {type:'hsrp_state',dev:'r1',iface:'lan',state:'Active'},
      {type:'hsrp_state',dev:'r2',iface:'lan',state:'Standby'},
      {type:'hsrp_state',dev:'r1',iface:'wan',state:'Active'},
      {type:'hsrp_state',dev:'r2',iface:'wan',state:'Standby'},
      {type:'reachable',a:'hq',b:'isp'}
    ],
    solution:[
      ['r1','enable'],['r1','configure terminal'],['r1','interface lan'],
      ['r1','standby 10 ip 10.20.0.1'],['r1','standby 10 priority 110'],['r1','standby 10 preempt'],['r1','standby 10 track wan decrement 30'],
      ['r1','exit'],['r1','interface wan'],['r1','standby 20 ip 203.0.113.254'],['r1','standby 20 priority 110'],['r1','standby 20 preempt'],['r1','end'],
      ['r2','enable'],['r2','configure terminal'],['r2','interface lan'],
      ['r2','standby 10 ip 10.20.0.1'],['r2','standby 10 priority 100'],['r2','standby 10 preempt'],
      ['r2','exit'],['r2','interface wan'],['r2','standby 20 ip 203.0.113.254'],['r2','standby 20 priority 100'],['r2','standby 20 preempt'],['r2','end'],
      ['r1','show standby brief'],['r2','show standby brief'],['hq','ping isp'],
      ['r1','enable'],['r1','write memory'],['r2','enable'],['r2','write memory']
    ]
  },

  {
    id: 'cross-track-web-availability-network',
    chapter: 'Integrated Operations · Cross-discipline case',
    title: 'Restore client access to the Halcyon portal',
    story: 'The Linux administrator has been asked to restore the application service. From the network side, users still cannot reach the portal by name: the workstation has a stale local host record. Correct the record and verify the full path to the web service.',
    objective: 'On workstation, update portal.halcyon.local to 10.60.0.20. Then verify that the name resolves to web01, the workstation can reach the server, and TCP service 8080 is available.',
    ticket: { id: 'INC-XD-2041', from: 'Priya · Service Desk', priority: 'P1', symptom: 'The Halcyon portal is unavailable to staff. The application team is restoring the server; please validate and repair client-side network access.' },
    diagnose: { q: 'A direct ping to 10.60.0.20 succeeds, but portal.halcyon.local resolves to 10.60.0.99. What is the most likely network-side fault?', options: ['The workstation has a stale local host record', 'The web server interface is down', 'The switch has lost power'], answer: 0, because: 'Direct IP reachability works, while the name points to a different address. Correct the workstation name record before changing routes or interfaces.' },
    console: 'workstation',
    hints: ['Use show hosts to inspect the local name table before changing it.', 'Enter privileged mode, then configuration mode. Add the correct mapping with ip host portal.halcyon.local 10.60.0.20.', 'Return to privileged mode, then verify with ping portal.halcyon.local and Check.'],
    build: () => ({
      devices: {
        workstation: { id: 'workstation', kind: 'host', ifaces: { eth0: { ip: ip('10.60.0.10'), mask: 24, up: true } }, hosts: { 'portal.halcyon.local': ip('10.60.0.99') } },
        web01: SRV('web01', '10.60.0.20', 24, null, { 8080: 'http' }),
        sw1: SW('sw1', [{ n: 'p1' }, { n: 'p2' }])
      },
      links: [L('workstation', 'eth0', 'sw1', 'p1'), L('web01', 'eth0', 'sw1', 'p2')]
    }),
    success: [
      { type: 'resolves', dev: 'workstation', name: 'portal.halcyon.local', ip: '10.60.0.20' },
      { type: 'reachable', a: 'workstation', b: 'web01' },
      { type: 'service_up', dev: 'web01', port: 8080 }
    ],
    solution: [['workstation', 'enable'], ['workstation', 'configure terminal'], ['workstation', 'ip host portal.halcyon.local 10.60.0.20'], ['workstation', 'end']]
  },
];

module.exports = { chapters };
