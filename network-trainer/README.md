# Networking Trainer — M1 engine + M2 CLI + M3 missions + M4 UI

A prototype of the networking/security teaching game: the **network model**, the
**forwarding engine**, the **mission checks** (M1), the **command-line layer** (M2), the
**mission/chapter layer** with the first six beginner missions (M3), and a playable
browser **UI** — topology view, config panels, terminal, and Check (M4). The engine is
the single source of truth; the UI is just a layer that reads/writes the same model.

## Play it

Open **`index.html`** in a browser (self-contained, no server, no deps). Pick a
mission, click a device to configure it or type in the terminal, then hit **Check**.

## Run the tests

```bash
node net-engine.test.js    # M1: engine scenario suite — 13 tests
node net-cli.test.js       # M2: CLI suite — 10 tests
node net-mission.test.js   # M3: every chapter is solvable — 8 tests
node build-ui.js && node test-ui.js   # M4: build the page, then play it headlessly
node net-mission-demo.js   # a full mission playthrough (briefing -> check -> fix)
```

All plain Node; the UI test needs Playwright. 31 headless tests + the UI test.

## What's here

| File | What it is |
|------|-----------|
| `net-model.js` | IP/subnet math, the topology model, and `forward()` — the one engine every command and check is built on. Plus `ping()` (round trip, so it catches asymmetric ACLs). |
| `net-checks.js` | Pure `{ ok, reason }` checks: `reachable`, `notReachable`, `routeExists`, `subnetCorrect`, `aclBlocks`, `serviceUp`. A mission's success criteria. |
| `net-cli.js` | **M2** — the CLI bound to a world + a current device: `ip addr`, `ip route`, `ping`, `traceroute`, `arp`, `tcpdump`, `iptables`, `nmap`, `man`, `help`. |
| `net-mission.js` | **M3** — `evalCheck` (declarative check spec -> result) and `startMission` (build world, bind CLI, grade, explain what's unmet). |
| `net-chapters.js` | **M3** — the first six missions as data: a starting topology + `success` checks + a reference `solution`. |
| `ui.js` | **M4** — the browser UI: layered topology layout, SVG render, config panels, terminal, briefing + Check. Uses `require()` of the modules above. |
| `build-ui.js` | **M4** — inlines the tested modules (verbatim, via a tiny `require` shim) + `ui.js` into `index.html`. Zero drift: the page runs the code the tests cover. |
| `index.html` | **M4** — the built, self-contained, playable page. |
| `net-*.test.js`, `test-ui.js` | 31 headless tests + the UI test. |
| `net-*-demo.js` | Printed demos. |

## The M3 mission layer

A mission is **data**: a `build()` that returns a starting topology, a `success` list of
declarative checks, and (for authoring/testing) a reference `solution`. `startMission`
builds the world, binds a CLI to the starting device, and exposes `done()` and `status()`
— `status()` is the sysadmin game's `check` command: it names exactly which objective is
unmet and why. Because missions are plain data in this shape, a **no-code mission editor**
(like the sysadmin game's) can emit them directly.

The six starter missions walk the beginner arc: *First contact* (address a blank host),
*The typo in the address* (subnetting), *Off the local network* (default gateway), *The
missing route* (static routing), *Close the telnet port* (firewall), *Keep guests off the
database* (segmentation / security). Every one is tested to start unsolved and be resolved
by its solution — and a wrong move is tested **not** to pass, guarding against loose checks.

## The M2 CLI

The CLI is bound to a world and a **current device** (the console you're on), and every
command reads or writes the same model the engine runs on — so **a mission is solvable
two ways**: a beginner clicks in a config panel, a confident learner types `ip route add`,
and the grader can't tell the difference (there's a test for exactly this). Supported:

- `ip addr` / `ip addr add <A>/<p> dev <if>` — show / set interface addresses
- `ip route` / `ip route add default via <ip>` / `ip route add <cidr> via <ip>` — the routing table
- `ping <host|ip>` — round-trip, reports the path and where a packet died
- `traceroute <host|ip>` — the hops toward a target
- `arp` / `ip neigh` — neighbours on the L2 segment
- `tcpdump` — the packets from the last ping
- `iptables -L | -A INPUT -i <if> [-p tcp] [--dport N] -j DROP|ACCEPT | -F` — firewall rules (a recognisable subset)
- `nmap <host|ip>` — **read-only, defensive**: list a host's exposed services ("see your own attack surface")
- `man <cmd>`, `help`

`dig` / `dhclient` are intentionally **not** here yet — they need a DNS/DHCP model, which
is the next small engine addition (roadmap chapter 5).

## What the tests prove

- **Switching** — two hosts on one switch reach each other; a host in the wrong subnet doesn't.
- **Routing** — a router joins two subnets; a host with no default gateway can't leave its own.
- **Static routes** — two far subnets talk only when both routers have routes; removing one breaks it, and `routeExists` reports it.
- **Firewalls** — telnet (tcp/23) blocked while web (tcp/80) and ping pass; rule **order** matters (an `allow any` shadows a later `deny`); an **asymmetric** ACL that drops the reply fails the round trip even though the request got through.
- **VLANs** — same switch, different VLANs can't reach each other (L2 segmentation).
- **Physical** — a downed link breaks the path.
- **IP math** — addresses round-trip and subnet membership computes.

## How it works (the one idea)

Everything is one function: `forward(net, srcDevice, packet)` walks the packet hop
by hop — same-subnet delivery → ARP/L2 domain (switches are transparent, VLAN-aware)
→ default gateway → inbound ACL → longest-prefix route lookup → forward — and returns
`{ ok, path, reason }`. `ping`, `traceroute`, every check, and every security scenario
are thin callers of it. The `reason` string ("blocked by ACL", "no route to 10.0.2.10")
is what makes a failed attempt a teaching moment.

## Deliberately out of scope (for beginners)

Real TCP state machines, congestion/timing, and protocol convergence (OSPF/BGP). The
model is L3 reachability + ACLs + a readable path — which covers the whole beginner
roadmap. See the architecture sketch for the fidelity discussion.

## Next

M1–M4 are done: a playable prototype with engine, CLI, missions, and a UI, all tested.
Natural next steps:

- **Polish the builder** — drag to reposition, add/remove devices and links (right now topology is given per mission and you configure it; the sketch's "build from scratch" capstone needs add/delete).
- **DNS/DHCP** in the engine → unlocks `dig` / `dhclient` and the naming chapter.
- **Wire in the reused classroom layer** — assign these missions, record attempts, grade (the whole Supabase/RLS stack from The Last Sysadmin ports over).
- **More chapters** toward the full roadmap, and the no-code mission editor (missions are already plain data).
