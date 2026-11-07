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

**Twenty-five missions** across addressing, subnetting, switching, routing, static
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

**Topology designer toolkit.** The Build canvas now includes a toggleable alignment grid and snap-to-grid positioning, duplicate-device actions that copy configuration without copying links, editable canvas annotations that survive scenario JSON export/import, selectable/removable links, and a port-label toggle. `Ctrl+Shift+D` duplicates the selected device; select a link and press `Delete` to remove it. These are authoring conveniences over the same deterministic simulator topology — they do not launch virtual machines or emulate vendor operating systems.

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

****HSRP first-hop redundancy and WAN failover.** IOS-style interface configuration supports HSRP groups with a virtual IPv4 gateway, priority, preemption, and interface tracking with a configurable priority decrement. The model elects the highest-priority eligible router on a shared Layer-2 segment, exposes the active virtual IP for packet forwarding and gateway resolution, and supports `show standby brief`. Interface shutdown/recovery drives deterministic tracked failover and preemption. Incident INC-3531 has two edge routers, separate user/WAN virtual gateways, a tracked primary uplink, and an ISP reachability test. This is a deterministic educational first-hop election model; it does not simulate HSRP hello/hold timers, multicast packets, authentication, object tracking beyond interface state, stateful NAT/session synchronization, or platform-specific HSRP versions.

BGP route policy and ISP operations.** The IOS-style BGP workflow now supports validated ASNs and neighbor statements, eBGP/iBGP session classification, exact-RIB validation for network advertisements, ordered IPv4 prefix-lists (permit/deny, optional ge/le, first-match and implicit deny), and per-neighbor inbound/outbound policy attachment. show ip bgp summary, show ip bgp, show ip bgp neighbors, and show ip bgp advertised-routes expose session state, received routes, policy attachments, and outbound advertisements; show ip route includes BGP-learned entries. BGP configuration is included in running/startup configuration. Incident INC-3520 trains a customer-edge route-leak response while preserving a public DMZ advertisement and provider reachability. This is a deterministic, single-hop educational BGP policy model: it does not implement TCP transport/timers, full UPDATE/KEEPALIVE state machines, route-reflector behavior, recursive AS-path propagation, communities, local preference, MED, route maps, multipath selection, or vendor-specific policy syntax.

**ASA object-groups and operational maintenance.** The ASA-style command profile now supports reusable `object-group network` and `object-group service` definitions, host/subnet membership, TCP/UDP destination service members, and ACL references to source, destination, and service groups. The forwarding engine evaluates group membership at packet time, so editing a group changes the policy without rewriting every ACL entry. `show object-group`, `show access-list`, and `clear access-list [name]` support evidence collection and counter resets. Referenced groups cannot be removed until their ACL references are cleared. A vendor-access review ticket practises approved-subnet HTTPS access, explicit diagnostic ICMP, implicit deny, hit-counter verification, and configuration persistence. The command profile remains a bounded educational ASA-style subset; it is not Cisco ASA software and does not implement nested groups, time ranges, IPv6 ACLs, or full service-object syntax.

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

- `ip addr` / `ip addr add|replace|del <A>/<p> dev <if>` — show, assign, explicitly replace, or remove interface addresses (strict IPv4/prefix validation; interface must exist; duplicate live addresses are rejected; `add` will not silently overwrite an existing address)
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

 
## Enterprise network services operations

The IOS-style router/server profile now supports a cohesive, testable service workflow:

- **DHCP server pools:** `ip dhcp excluded-address LOW [HIGH]`, `ip dhcp pool NAME`, then `network NET MASK`, `default-router IP`, `dns-server IP`, `domain-name NAME`, and `lease DAYS`. Leases are allocated from the configured subnet, avoid excluded/in-use addresses, and are recorded as bindings.
- **DHCP relay:** under the client-facing routed interface, configure `ip helper-address SERVER-IP`. The simulator forwards the client lease request to the configured DHCP server across the routed topology; `show ip dhcp pool`, `show ip dhcp binding`, and `show ip dhcp server statistics` expose the operational state.
- **DNS:** `ip name-server IP` configures a resolver; `ip host NAME IP` adds a local static host entry. `show hosts` and the existing `dig NAME` command help separate local naming from resolver-based lookups. The authoritative DNS zone remains static and intentionally does not simulate recursion, caching, TTL expiry, or record types beyond A.
- **NTP:** `ntp server IP` configures an upstream peer; `ntp master STRATUM` marks a simulated time source. `show ntp status` and `show ntp associations` distinguish an unreachable peer from a reachable master and report the selected stratum.
- **Syslog:** `logging host IP`, `logging trap informational`, and `logging source-interface IF` configure forwarding. Successful configuration changes create local operational messages; messages at or above the configured severity are forwarded to a reachable collector listening on UDP/514. `show logging` inspects the sender queue/counters or collector events.

The new **INC-3428 — The branch is online, but services are not** mission ties DHCP relay, DNS, NTP and syslog together in a realistic branch-office restoration ticket. Learners configure the server and router, obtain a client lease, verify name resolution and time sync, inspect central logs, and save the router configuration.

This remains an educational IOS-style subset, not a Cisco IOS image or full protocol implementation. DHCP lease expiry/renewal timers, DHCP options beyond the listed subset, recursive DNS, NTP clock discipline/packet exchange, and full RFC 3164/5424 syslog formatting are not simulated.

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
- **Enterprise services** — deepen DHCP reservation/renewal behavior, DNS diagnostics, NTP failure modes, and syslog filtering / incident correlation.
- **Wire in the reused classroom layer** — assign these missions, record attempts, grade (the whole Supabase/RLS stack from The Last Sysadmin ports over).
- **More chapters** toward the full roadmap, and the no-code mission editor (missions are already plain data).


## Switching: VLANs and trunks

Switches support access and trunk ports. The Layer 2 model keeps VLANs separate across a switch and carries tagged VLANs only when every trunk in the path permits them. Trunk native VLANs model untagged traffic; a native-VLAN mismatch can therefore break a path even while the uplink remains up.

On a selected switch, use:

```text
vlan 10
vlan 20
interface p1
switchport mode access
switchport access vlan 10
exit
interface p2
switchport mode trunk
switchport trunk native vlan 1
switchport trunk allowed vlan 10,20
exit
show vlan brief
show interfaces trunk
show interfaces switchport
```

VLAN IDs must be integers from 1 through 4094. Access/native VLANs and explicit trunk allow-lists must reference VLANs created on that switch. The `all` trunk allow-list option removes the explicit restriction. Switch port configuration is persistent in the scenario state.

The switching pilot adds two practical tickets: correcting mismatched access VLANs and restoring a VLAN excluded from an inter-switch trunk. Tests cover access isolation, multi-switch trunk forwarding, native VLAN mismatches, invalid configuration, verification output, loop-safe traversal, and a browser-driven configuration workflow.


## Switching: MAC learning and Spanning Tree

Switches learn endpoint source MAC addresses when traffic crosses a Layer 2 segment. Each endpoint receives a stable locally administered MAC address unless a scenario supplies one. A frame is learned on the ingress port at each switch along the active forwarding tree; a response teaches the reverse direction. The table reports the VLAN, learned MAC, dynamic entry type, ingress port, and endpoint.

Use `show mac address-table dynamic` to inspect learned endpoints. Entries are populated by traffic rather than pre-filled from the topology. Clear dynamic entries with `clear mac address-table dynamic` after a cabling or VLAN change.

Per-VLAN Spanning Tree Protocol (STP) elects the switch with the lowest bridge priority as root (device ID breaks ties). A deterministic shortest-hop spanning tree selects root and designated ports; redundant links receive an alternate/blocking role. Blocking is enforced at both ends of the link in the Layer 2 forwarding model. This is an educational STP model: it does not simulate BPDU timers, convergence delays, path-cost tuning, or the full IEEE state machine.

Configure a bridge priority in increments of 4096:

```text
spanning-tree vlan 10 priority 4096
show spanning-tree vlan 10
show mac address-table dynamic
```

The switch configuration panel also shows the active VLAN's root bridge, bridge priority, blocked ports, and learned MAC entries. The STP incident mission uses a three-switch triangle to practise root election, redundant-link blocking, MAC-table verification, and end-to-end reachability.

Regression coverage includes stable local/remote MAC learning, root election and priority validation, alternate-port blocking, loop-free reachability, a non-redundant topology, mission solvability, and browser-driven verification.

## Network Operations Workbench

The Network Trainer is evolving into a day-to-day network operations environment. The workspace combines an incident brief, live topology, device console, traffic evidence, and a device inspector. Learners work as junior network analysts and engineers: triage a ticket, gather evidence, make a controlled change, verify the service, and record what they learned.

### Global workstation search

Use the **Search** control in the top bar or press **Ctrl+K** ( **⌘K** on macOS) to open a keyboard-driven command palette. It searches the active scenario's simulator devices, incident records, change requests, Cisco/network command reference and local engineering journal, and provides direct workspace navigation. Selecting a device opens it as the active Workbench console target; selecting a command places it in the console for review rather than executing it. Search results are derived from the current browser-local training state and are not an external asset or monitoring search.

### Operations Overview

The Network Sysadmin workspace opens on a shift dashboard before entering the Workbench. It summarises the active simulator scenario: device health is calculated from interface state, link health from both link and endpoint interfaces, and recent traffic from commands run in the current lab. It also surfaces unresolved training incidents with priority and status, links directly into the selected incident's Workbench, and shows recent local journal activity. The dashboard labels all telemetry as simulated; it is not an external monitoring or NMS integration. Workbench, incident queue, command help, journal, and learning progress remain one click away.

### Workbench engineering controls

- **Device explorer:** filter the active scenario's hosts, servers, switches, routers and firewalls; selecting a device synchronises the topology, inspector and console target.
- **Device inspector tabs:** separate overview/Layer 2 state, routing operations, and firewall policy while retaining the existing configuration actions and simulator model.
- **Device console sessions:** each device has its own terminal output buffer and command history. Switching sessions does not discard the previous device's visible output or history.
- **Topology navigation:** zoom in/out, fit the complete topology, auto-arrange nodes, and pan the canvas independently of dragging devices. Device drag and link wiring remain supported.
- The session buffers are scoped to the active mission/build session and are not presented as durable audit records; command activity continues to be written to the engineering journal.

### Incident Management workspace

The Incidents destination is a dedicated service-desk workspace rather than only a modal queue. It provides state counts, search, status and priority filters, a selectable incident detail record, SLA target and impact context, ownership updates, and a ticket-linked investigation timeline. New incidents can be acknowledged, active incidents hand off to their matching Workbench scenario, and resolved incidents can be reviewed. Resolution remains tied to scenario verification rather than a manual status shortcut. The top-bar Tickets action retains the compact queue for quick access.

### Infrastructure inventory

The Infrastructure destination is a live inventory of the active training scenario, not a static device catalogue. It supports device-type and health filtering, search by device or IP, and per-device detail for interfaces, addresses, link state, access/trunk VLANs, spanning-tree state, static routes, ACL policy, configured services/protocols and local engineering journal activity. Selecting a device opens that exact device in the Workbench. Service rows are labelled as configured state from the simulator model; the page does not claim external polling or production monitoring.

### Change execution handoff

Change requests can optionally link directly to devices in the active simulator scenario. The structured device links are saved with the local change record and appear in its detail view; opening one returns to the Workbench with that exact device selected in the explorer, inspector and console session. The free-text affected-services field remains available for VLANs, services and systems outside the current simulated topology. This is a navigation handoff only: it does not execute configuration or claim that a change has been applied.

### Help desk and work journal

- The persistent **Help** action opens a searchable command field guide from anywhere in the workbench. Selecting an example places it in the device console for practice.
- Help identifies the selected device and distinguishes current simulator commands from commands planned for later Cisco IOS/IOS XE fidelity work. The simulator must never imply that an unsupported command executed successfully.
- **Journal** records command attempts and output, ticket resolutions, and learner-authored investigation notes in browser-local progress storage.
- Journal entries are capped at 250 to keep local storage bounded. Learners can export the record as Markdown for a personal engineering log or portfolio.
- The journal is a learning aid, not an audit-grade configuration archive. Browser-local data can be cleared with browser storage; future account-backed records should be added through the existing classroom persistence layer.

### Workbench design principles

1. **Ticket first:** start with a business/user symptom, priority, impact and acceptance criteria.
2. **Evidence before changes:** encourage interface, neighbour, route, MAC, STP, packet and log inspection before configuration.
3. **Controlled remediation:** make the smallest safe change, verify it, and preserve a rollback path.
4. **Document the work:** record observations, commands, outcomes and handover notes.
5. **Cumulative practice:** reuse known commands in new scenarios while gradually introducing new command families.
6. **Learning remains visible:** contextual explanations, command examples, hints and post-incident reflection stay one click away.

### Fidelity boundary

The current simulator models a deliberately bounded subset of network behaviour. Cisco-like syntax is used where it is useful for command familiarity, but it is not a licensed Cisco IOS/IOS XE image or a complete emulation. Each command must be implemented and tested before being presented as supported. Advanced protocols and device-specific differences should be introduced in explicit stages.



## Cisco IOS-style CLI operations profile

The console now supports a tested, explicitly bounded Cisco IOS-style workflow alongside the original Linux-like commands. Enter `enable` for privileged EXEC, then `configure terminal` (or `conf t`) for global configuration. Use `interface <name>` to enter interface configuration, `vlan <id>` for VLAN configuration, `exit` to move up one level, and `end` to return to privileged EXEC.

Implemented operational commands include:

- `show version`, `show running-config`, `show startup-config`
- `show ip interface brief`, `show ip route`
- `show vlan brief`, `show interfaces status`, `show interfaces trunk`
- `show mac address-table dynamic`, `show spanning-tree [vlan <id>]`
- Switch configuration: `vlan <id>`, `name <label>`, `switchport mode access|trunk`, access/native/allowed VLAN settings, interface descriptions, `shutdown` / `no shutdown`
- Router configuration: ip address ADDRESS MASK under an interface and ip route NETWORK MASK NEXT-HOP in global configuration
- Extended ACLs: ip access-list extended NAME, optional sequence numbers, permit|deny ip|tcp|udp|icmp, source/destination any, host IP, or IP WILDCARD, and TCP/UDP eq PORT
- Apply an ACL under interface configuration with ip access-group NAME in|out; remove it with no ip access-group NAME in|out
- Verify policy and attachment with show access-lists [NAME] and show ip interface IF; save with write memory / copy running-config startup-config

These commands mutate the same device and forwarding model as existing missions. Extended ACLs support ordered entries, source/destination wildcard matching, TCP/UDP destination ports, inbound and outbound interface bindings, hit counters, and implicit deny on a bound ACL. Legacy simulator firewall rules remain supported. The IOS-style subset omits time ranges, object groups, fragments, reflexive ACLs and full ICMP type matching; it is router ACL syntax, not ASA policy or NAT syntax. Startup configuration is an explicit snapshot and does not model reboot or NVRAM hardware.


## OSPF routing operations

The IOS-style router profile supports an operational, single-area OSPF workflow using the familiar process and network-statement model:

- Enter a process with `router ospf 10`; configure a unique `router-id A.B.C.D`.
- Enable interfaces by matching their addresses with `network ADDRESS WILDCARD area AREA`. Network statements are evaluated against the current interface addresses; changing an interface address or removing a statement updates participation.
- Configure `passive-interface IFACE` for user-facing LANs. Passive interfaces still advertise their connected prefix but do not form neighbor adjacencies. Use `no passive-interface IFACE` to re-enable adjacency formation.
- Verify with `show ip ospf neighbor`, `show ip ospf interface brief`, `show ip protocols`, and `show ip route`. OSPF-learned routes are marked `O`, include the first-hop router and a simplified hop metric, and participate in the shared forwarding engine.
- The topology model forms adjacencies only across directly connected, active router interfaces with matching IP subnets and areas. It floods same-area connected prefixes through multi-router paths and withdraws learned routes when links, areas, or process configuration no longer support them.
- OSPF process, router ID, network statements and passive-interface settings are serialized in `show running-config` and saved by `write memory`.

The new **INC-3512 — The remote branch has disappeared from the route table** mission asks learners to restore a three-router OSPF path, advertise both user LANs, keep edge LAN interfaces passive, verify neighbors and learned routes, and prove end-to-end application reachability.

**Fidelity boundary:** this is a deterministic educational OSPF model, not a packet-level OSPF implementation. It does not simulate Hello/Dead timers, DR/BDR election, LSA flooding packets or database aging, SPF scheduling, interface costs/bandwidth, authentication, virtual links, multi-area ABR behavior, route redistribution, or vendor-specific timer tuning. Neighbor state is derived from topology/interface/area compatibility, and the displayed hop metric is instructional rather than a real OSPF cost.

**Fidelity note:** this is an educational IOS-style command profile, not Cisco IOS/IOS XE software or a licensed virtual appliance. Unsupported commands return an error rather than pretending to execute.

## Cisco ASA-style firewall operations profile

Firewall devices explicitly marked with `firewallOS: 'asa'` use a separate ASA-style command workflow; IOS router ACL syntax is not accepted on these devices. The implemented subset includes:

- Interface `nameif`, `security-level 0–100`, IP addressing, descriptions and administrative state
- Named extended ACLs using ASA syntax: `access-list NAME extended permit|deny tcp|udp|ip|icmp ...`, with `any`, `host`, subnet/netmask and destination-port matching
- Inbound ACL attachment using `access-group NAME in interface outside`; ordered rules, implicit deny and match counters
- Network objects with host definitions and same-port TCP static PAT: `nat (inside,outside) static interface service tcp 443 443`
- Static route add/remove using `route <nameif> NETWORK MASK NEXT-HOP [metric]` and `no route ...`
- Verification through `show interface ip brief`, `show access-list`, `show access-group`, `show nat`, `show route`, and `packet-tracer input ...`
- ASA-style security-level policy: higher-to-lower traffic is permitted by default, lower-to-higher and same-level traffic is denied unless an inbound ACL explicitly permits it; established return traffic for an initiated flow is allowed by the shared one-flow connection context

The profile intentionally does not claim full ASA compatibility. It omits access-list object-groups, service/object groups, dynamic PAT, arbitrary port translation, VPN, failover, inspection policies, multi-context mode, and full connection-table persistence. NAT and packet-tracer are limited to the model's supported topology and same-port TCP static PAT. This is an educational ASA-style command profile, not Cisco ASA software or a licensed virtual appliance.


## Switch access-layer port security

The IOS-style switch profile supports access-port MAC security using `switchport port-security`, a validated maximum (1–50), sticky secure-MAC learning, and the `protect`, `restrict`, or `shutdown` violation actions. The forwarding model checks the source MAC at the ingress switch port: an unapproved MAC is dropped and increments the violation counter; shutdown mode also err-disables the port until an operator issues `no shutdown`. Use `show port-security` or `show port-security interface PORT` to inspect secure addresses and violations. Sticky addresses appear in the running configuration. This is a deterministic educational access-port security model; it does not simulate aging timers, authentication, 802.1X/MAB, voice VLAN exceptions, or ASIC hardware behavior.


## Workbench interface operations inventory

The Workbench device inspector includes an **Interfaces** view for every selected device. It presents interface operational state (including err-disabled), IPv4 address/prefix or switchport access/trunk VLAN settings, the connected simulator peer, and applicable protocol details such as OSPF area, HSRP state, STP role/state, and port-security learning/violation counts. **Inspect in CLI** stages `show interfaces IFACE` in the device console for review; it never executes the command automatically. The inventory is read-only and reflects only the active simulator scenario, not live hardware telemetry.


## Multi-device console sessions

Workbench console sessions are available per simulated device. Switch using the session tabs, the previous/next controls, or `Alt` + left/right arrow while the command field is focused. Clear output resets only the visible transcript; command history remains available with the up/down arrows. The active session is brought into view automatically when switching across a long tab strip.


## Workbench checkpoint history

Open **History** in the device console to review every saved configuration checkpoint for the selected simulator device. Each entry shows when it was captured and its configuration size. Choose any historical checkpoint to compare the current running configuration against that snapshot, rather than being limited to the latest baseline. Comparisons remain read-only; checkpoints are browser-local and are not restored or applied to devices.


### Workbench checkpoint lifecycle

Configuration checkpoints can be labelled and annotated when captured. The first checkpoint for a device becomes its known-good baseline; operators can move that baseline to any historical snapshot. Drift review defaults to the pinned baseline, while history allows comparison against any checkpoint. A pinned baseline cannot be deleted. These records remain browser-local training data from the active simulator; no restore or physical-device operation is provided. Drift reviews can also be saved as timestamped Engineering Journal evidence (including the selected baseline label, device, added/removed lines and comparison summary) or downloaded as a standalone text report. Journal evidence and reports are local training records, not an external audit log.


## Workbench fleet configuration assurance

Use **Fleet assurance** in the device console to scan every device in the active simulator against its pinned known-good checkpoint. The overview reports drift, clean baselines, missing baselines, and unavailable configurations; supports device search and status filtering; and lets an operator jump directly to a device's drift review or capture its first baseline. A scan can be saved to the Engineering Journal or exported as a text report. The scan temporarily reads each simulator device's running configuration and restores the active console session context afterward. It is read-only and is not live network monitoring or a production compliance assessment.


## Incident investigation report export

From an incident record, use **Export incident report** to download a Markdown handover containing the ticket summary, reported symptom, ownership and SLA context, plus the complete ticket-linked investigation timeline. Command evidence includes its device, command, result and captured output. The export is generated locally from this browser's simulator journal; it is not sent to an external ticketing or document system.


## Topology editing productivity

The Build canvas supports multi-device editing while authoring or working in a build-from-scratch scenario. **Shift-click** toggles individual devices in the selection; **Shift-drag** on empty canvas space draws a selection rectangle. Drag any selected device to move the whole selection while preserving relative spacing. Use **Copy** / **Paste** or Ctrl/Cmd+C and Ctrl/Cmd+V to duplicate the selected devices and any links whose two endpoints are both selected. New devices receive unique IDs and are offset from the originals. **Undo** / **Redo** and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) track recent topology edits in the current Build session; the in-memory history is capped at 60 snapshots and is not an audit log. The simulator remains browser-native and deterministic.


## Topology zones and device labels

The Build workspace supports named visual zones around selected devices and custom display labels for individual devices. Zones are stored with the scenario topology and render behind links and devices, so they provide logical grouping without changing connectivity or simulation behavior. Device IDs remain the stable identifiers used by the simulator, CLI, links, and mission checks; custom labels affect presentation only. Both changes participate in the topology undo/redo history.
