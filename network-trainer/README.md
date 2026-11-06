# Networking Trainer — M1 engine + M2 CLI + M3 missions + M4 UI

A prototype of the networking/security teaching game: the **network model**, the
**forwarding engine**, the **mission checks** (M1), the **command-line layer** (M2), the
**mission/chapter layer** with the twenty-two missions (M3), and a playable
browser **UI** — topology view, config panels, terminal, and Check (M4). The engine is
the single source of truth; the UI is just a layer that reads/writes the same model.

## Play it

Open **`index.html`** in a browser (self-contained, no server, no deps). Pick a
mission, click a device to configure it or type in the terminal, then hit **Check**.

**Game systems** (the sysadmin game's "feel"): saved progress (localStorage), XP
and ranks (Cadet → Network Architect), a hints economy (each hint costs XP), a
**per-ticket timer** and a **📊 Stats** view (per-ticket times/hints, averages,
fastest), terminal **command history** (↑/↓), solved-ticket marks and a **Next
ticket** flow, a graduation finale, a **⚙ Settings** panel with five themes (a
distinct cyan "Network Ops" default), and a back-link to the Linux game. Progress
persists across reloads.

**Twenty-four missions** across addressing, subnetting, switching, routing, static
routing, security, **DHCP**, **DNS/naming**, **NAT**, **failover**, and **dynamic
routing (OSPF & BGP)** — including **destination-based firewall rules** for DMZ
segmentation ("stop the pivot"), a **DHCP lease** that hands out address + gateway
+ resolver in one step (`dhclient`), a **name-resolution** fault where the IP
works but the name doesn't (`dig`, `resolvectl`), **NAT** — a **port-forward**
(DNAT) that exposes an inside server on a public IP and a **masquerade** (SNAT)
that shares one public address for a whole office, both via `iptables -t nat` —
**OSPF** neighbour adjacency and learned routes, **BGP** sessions and network
advertisements, and **failover** where traffic reroutes around a dead next hop.

Two mission **types** go beyond the single-fault ticket: a **design-review /
audit** ("spot the planted problems, ignore the distractors") and a **multi-fault
incident** (two or three interacting faults to localise). An **observability
flows panel** lets the player read the traffic to find the cause.

**Scenario builder (🛠 Build).** A design-mode canvas for authoring. Place
devices from a palette (host, server, switch, router, firewall), wire them,
address them, and set the **objectives** the student must satisfy (any of the
success-check types). **Export** a scenario to a shareable JSON file and
**Import** one back — the groundwork for a teacher authoring and assigning
scenarios. The student opens an assigned scenario and **builds the network from
scratch** to meet the spec: the same canvas, graded by the same engine. The
scenario format and the topology-editing ops are pure, tested modules
(`net-scenario.js`, `net-builder.js`), so the whole author → serialise → build →
grade loop is covered headlessly, and the format is ready for the classroom
(Supabase) assignment layer.

**Classroom (🎓 Class).** A teacher authors a scenario in Build mode, **💾 Saves
it to their class library**, and **assigns** it to a class; an enrolled student
opens 🎓 Class, sees the assigned scenarios, **plays** them (building from
scratch), and completion **records an attempt** for the teacher. It reuses the
sysadmin game's classroom — the shared `classes` / `enrollments` / `assignments`
/ `attempts` tables and RLS, the same Supabase project, and (same origin) the
same sign-in session. `supabase/net-scenarios.sql` adds one table
(`net_scenarios`) and one `SECURITY DEFINER` delivery function
(`get_class_net_scenarios`) mirroring `get_class_missions`; one assignment can
reference sysadmin missions and network scenarios at once, and network attempts
are namespaced `net:<id>`. `net-classroom.js` is the headless data-access layer,
tested against a mock Supabase client (`net-classroom.test.js`); the full
teacher-assign → student-play → attempt-recorded loop is covered in
`test-classroom-cloud-ui.js` against a stubbed client.

**Incident-ticket framing.** Every mission opens as an on-call ticket: a
reporter, a priority (P1–P3), and a **symptom in the user's words** ("I can't
open the shared drive — it worked Friday") rather than a task instruction. Before
the fix is graded, a **diagnosis gate** makes the player locate the fault — a
triage question answered by actually running `ping` / `traceroute` / `ip addr` /
`nmap` first. A wrong pick is rejected with a nudge back to the tools; the right
pick reveals *why*, then unlocks the objective and Check. This turns each mission
from a tutorial step into on-call troubleshooting: investigate → diagnose → fix.

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
| `net-chapters.js` | **M3** — ten missions as data: a starting topology + `success` checks + a reference `solution`. |
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

- `ip addr` / `ip addr add|del <A>/<p> dev <if>` — show, assign, or remove interface addresses (strict IPv4/prefix validation; interface must exist; duplicate live addresses are rejected)
- `ip link set <if> up|down` — change interface state and immediately affect forwarding
- `ip route` / `ip route add|replace <default|cidr> via <ip>` / `ip route del <default|cidr>` — validated route changes; gateways must be on an active connected subnet, exact duplicate routes are rejected, alternate next hops are supported, `replace` replaces a prefix, and missing deletes are reported
- `ping <host|ip>` — round-trip, reports the path and where a packet died
- `traceroute <host|ip>` — the hops toward a target
- `arp` / `ip neigh` — neighbours on the L2 segment
- `tcpdump` — the packets from the last ping
- `iptables -L | -A INPUT -i <if> [-p tcp] [--dport N] -j DROP|ACCEPT | -F` — firewall rules (a recognisable subset)
- `nmap <host|ip>` — **read-only, defensive**: list a host's exposed services ("see your own attack surface")
- `dig <name>` — resolve a name via this host's configured DNS server (NXDOMAIN / no-resolver failures are teachable)
- `dhclient <if>` — request a DHCP lease: address + gateway + resolver, in one step
- `resolvectl dns <if> <ip>` / `resolvectl status` — set / show the host's DNS resolver
- `ping` is **name-aware**: `ping intranet.corp.local` resolves through DNS first, so "the IP works but the name doesn't" is a real, visible split
- `man <cmd>`, `help`

The DNS model is **authoritative/static** (a resolver maps names→IPs); no recursion,
caching, or TTLs — deliberately, since those add protocol machinery without teaching a
beginner more than "names need a resolver, and a record."

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
