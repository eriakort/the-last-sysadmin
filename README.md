# The Last Sysadmin

The Last Sysadmin is a browser-based learning platform for practising Linux system administration and network operations through interactive simulations, guided missions, incident tickets, and classroom workflows.

It combines two connected learning environments:

- **Linux Sysadmin** — a simulated Linux terminal, filesystem and command-learning experience with guided missions, progress tracking, accounts, and classroom features.
- **Network Sysadmin** — a network operations workstation and network simulator with incident management, a topology builder, device consoles, configuration and evidence workflows, knowledge references, and a separate networking learning path.

The project is designed for education and safe practice. The simulated environments do not connect to physical network equipment, launch virtual machines or containers, or provide real operating-system or vendor-device emulation.

## Start here

### Requirements

- Node.js and npm
- A modern browser
- Playwright and its browser dependencies for the browser test suites

### Install and build

```bash
npm ci
npm run build
npm run build:net
```

The application is published as static browser content. For local development, serve the repository root with a static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The Network Sysadmin environment is available under `/network-trainer/`.

### Run checks

The root test commands are grouped by cost and prerequisites:

```bash
npm run check          # Linux build, core unit tests, verification, generated-file freshness
npm run test:all       # all non-database suites, including browser and Network Trainer UI tests
npm run test:net       # complete Network Trainer engine/CLI/switching/mission/scenario/classroom unit suite
npm run test:sync-db   # Supabase schema and RLS tests (requires local PostgreSQL)
```

The complete local suite requires the Playwright package and Chromium, Firefox and WebKit browser binaries. Install them with:

```bash
npx playwright install --with-deps chromium firefox webkit
```

`npm run test:all` runs the root checks, cross-browser smoke tests, Linux classroom UI, authored-mission playback, guided-learning flow, and the complete Network Trainer unit and browser UI suites. It intentionally excludes `test:sync-db`, because that suite requires a locally running PostgreSQL service; run it separately when that prerequisite is available.

CI additionally checks that generated Network Trainer HTML is unchanged after its build and runs the PostgreSQL/RLS suite. The CI workflow remains the authoritative full merge gate.

## Platform areas

### Linux Sysadmin

The Linux learning environment provides a simulated command-line workspace, guided learning and practice flows, mission progression, saved local progress, and optional account-backed synchronization. It also includes classroom functionality for teachers and students, assignments, authored learning content, and related progress/attempt records.

The terminal and filesystem are educational simulations. Commands operate on the simulated environment rather than the host operating system.

### Network Sysadmin

The Network Sysadmin workspace is organised around the work of a junior network analyst or engineer:

- **Operations Overview** — lab health and recent activity.
- **Incidents** — ticket queues, ownership, investigation timelines and report export.
- **Workbench** — simulated device consoles, topology inspection, command output and evidence capture.
- **Infrastructure** — inventory and interface inspection for the active simulated environment.
- **Knowledge** — searchable command references and troubleshooting material.
- **Journal** — local investigation notes and captured evidence.
- **Changes** — configuration checkpoints, history and drift review.
- **Build** — create and edit network topologies, devices, links, zones and diagram annotations.
- **Classroom** — cloud-backed classroom and scenario workflows where configured.

The network simulator models selected networking concepts for learning, including switching, VLANs, routing, ACL/firewall behavior, DHCP, DNS, NAT and selected switching protocols. Command support is deliberately scoped; it should not be interpreted as a complete Cisco, Linux, or other vendor operating system.

Topology drafts, journal evidence and configuration checkpoints described as browser-local are stored in the current browser profile. Export important work when it needs to be moved to another browser or device.

## Architecture and source map

| Path | Responsibility |
|---|---|
| `src/game.html` | Main Linux Sysadmin application source (large, currently mostly single-file). |
| `build.js` | Builds the deployable root `index.html` from application source and assets. |
| `src/helpers.js` | Extracted pure helpers used by the Linux application. |
| `src/service-worker.js` | Offline caching and service-worker lifecycle. |
| `network-trainer/net-model.js` | Network model and packet-forwarding simulation. |
| `network-trainer/net-checks.js` | Declarative mission checks. |
| `network-trainer/net-cli.js` | Simulated device command-line interface. |
| `network-trainer/net-mission.js`, `net-chapters.js` | Mission runtime and mission data. |
| `network-trainer/net-builder.js` | Topology-building model and editing operations. |
| `network-trainer/ui.js` | Network Sysadmin browser UI. |
| `network-trainer/build-ui.js` | Generates the standalone `network-trainer/index.html` from tested sources. |
| `supabase/` | SQL migrations and local PostgreSQL/RLS tests. |
| `.github/workflows/` | CI verification and GitHub Pages deployment workflows. |

The standalone Network Trainer page is generated from the JavaScript modules and UI source. Do not edit the generated `network-trainer/index.html` directly; run `npm run build:net` after changing its source files. The root `index.html` is likewise a build output; update its source and run `npm run build`.

## Supabase setup and deployment

Supabase is optional for browser-local practice, but is required for account-backed cloud progress and classroom workflows.

The SQL migration order and deployment requirements are documented in [supabase/README.md](supabase/README.md). Apply the base setup and migrations in the documented order. In particular, **M11 is required** for the transactional progress-sync implementation: it introduces the authenticated `merge_progress(jsonb)` RPC and revokes direct progress-table writes.

Deploy the matching frontend and database migration together. Older frontend builds that write directly to the progress table are incompatible after M11 is applied. The browser retains local progress during a cloud-sync outage, but this is not a substitute for applying and verifying the migration.

Supabase project URL and anon key are configured by the application at runtime through its account/settings workflow. Never commit service-role keys or other privileged credentials. OAuth providers, redirect URLs and production authentication settings must be configured in the Supabase dashboard.

The repository's database tests run against a local PostgreSQL compatibility shim. Passing CI proves the migration and RLS tests against that local test environment; it does **not** prove that a particular production Supabase project has been migrated or configured correctly.

## Testing and contribution workflow

- Keep changes incremental and focused.
- Add or update tests for behavior changes.
- Run the relevant local checks before opening a pull request.
- Keep generated HTML synchronized with its source.
- Do not claim simulated functionality is connected to real infrastructure.
- Merge only after all required CI checks pass.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [CHANGELOG.md](CHANGELOG.md) for recorded changes.

## Project scope and safety

This is a learning simulator and static web application. It does not:

- launch hypervisors, virtual machines or containers;
- bridge simulated networks to physical networks;
- connect to or configure real routers, switches, firewalls or servers;
- provide complete vendor operating-system emulation;
- replace a production SIEM, ticketing platform, configuration-management system or network monitoring service.

Use the simulator to learn concepts and practise workflows safely. Verify commands and operational procedures against the documentation for the real systems you administer.
