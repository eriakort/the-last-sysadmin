# Modularization Roadmap

**Status:** Proposed; first implementation slice to follow  
**Target:** Incremental refactoring of Linux Sysadmin and Network Sysadmin  
**Guiding constraint:** Preserve behavior, static hosting, offline use, generated-file checks and all existing CI merge gates.

## 1. Executive recommendation

Evolve the repository into a **modular monolith**: two independent simulation domains (Linux and Network), a small set of genuinely shared platform capabilities, and explicit build/test tooling. Do not split the applications into microservices or force their simulation engines into a common abstraction.

The first major refactoring target is Linux Sysadmin: src/game.html is approximately 8,998 lines and currently contains the page, styling and most runtime JavaScript. Network Trainer already has a more modular source layout, but several modules have grown large and should be decomposed by responsibility.

The goal is not the maximum number of files. It is to make each responsibility independently understandable, testable, reusable where appropriate, and changeable without unintended effects elsewhere.

## 2. Current-state inventory

Baseline observed during the initial review; recheck file sizes and references at the start of each phase.

### Linux Sysadmin
- src/game.html is approximately 8,998 lines and contains the main page, CSS and most runtime JavaScript.
- src/helpers.js contains pure utilities, but corresponding browser implementations are duplicated in src/game.html. test-helper-source-parity.js detects drift.
- src/checkers.js contains pure mission-checking functions, with corresponding browser-side logic in the main page.
- build.js concatenates src/shell-head.html, src/game.html and src/shell-tail.html into generated index.html, and builds the service worker.
- The root page is deliberately a static, single-file deployable artifact. Offline behavior and GitHub Pages compatibility are important constraints.

### Network Sysadmin
- Network Trainer has a separate network-trainer/ source and build pipeline.
- Existing boundaries include model, CLI, checks, missions, chapters, scenarios, builder, classroom, UI and generated-page builder.
- net-cli.js, ui.js, net-chapters.js and net-model.js are large and should be decomposed by responsibility, not rewritten wholesale.
- network-trainer/build-ui.js generates network-trainer/index.html; generated HTML must remain build output.
- Older similarly named net-*.js files exist at repository root. Trace references and purpose before deciding whether to retain, migrate or remove them. Do not assume they are identical copies.

### Existing quality gates
Preserve root build/test/verify/freshness checks, browser smoke and cross-browser suites, accessibility checks, Network Trainer unit/UI tests, generated Network Trainer output checks, and database/RLS tests where configured.

## 3. Target architecture

Organize around domain ownership and dependency direction.

    src/
      app/                 composition root, startup and lifecycle
      core/
        filesystem/        virtual filesystem, paths, metadata
        permissions/       permission evaluation and formatting
        shell/             tokenizer, parser, executor, command contracts
        commands/          Linux commands grouped by domain
        processes/         process and job model
        services/          service manager and service state
        system/            storage, networking and host state
        persistence/       local state and progress adapters
      missions/
        engine/            mission lifecycle and evaluation orchestration
        checks/            pure checks and check contracts
        objectives/        objective and mastery logic
      features/
        health/
        service-desk/
        portfolio/
        workshops/
        spaced-recall/
      classroom/
        services/
        workflows/
        ui/
      auth/
      ui/
        terminal/
        navigation/
        panels/
        dialogs/
        settings/
      data/                story, authored missions, curriculum and fixtures

    network-trainer/
      engine/              topology, devices, interfaces, protocols
      cli/
        parser/
        registry/
        dialects/
      missions/
        engine/
        checks/
        chapters/
        scenarios/
      builder/
      classroom/
      ui/
        workbench/
        topology/
        incidents/
        inventory/
        knowledge/
        journal/
        changes/
      data/
      build/

    shared/
      contracts/           stable cross-application interfaces and schemas
      utils/               only proven cross-domain pure utilities
      learning/            shared learning/progress concepts, not simulator logic
      integrations/        shared external-service adapters where contracts align

    tools/
      build/
      architecture/
      checks/

This is a target map, not a mandate to create empty folders. Create directories when real modules move into them.

## 4. Architectural rules

1. Domain engines own behavior. Linux simulation logic stays in Linux; network simulation logic stays in Network.
2. UI is an adapter. UI calls application/domain APIs and renders state. Engines do not query the DOM, attach event listeners or render HTML.
3. Data is separate from execution. Mission/story/curriculum data should not be entangled with code that evaluates or runs it.
4. Explicit module APIs. Export only supported functions. Avoid importing private implementation details from another module.
5. One canonical implementation. Do not maintain browser and Node copies of the same business logic. Tests import the same source used by the browser build.
6. No catch-all shared module. A function belongs in shared only when both domains need the same semantics and contract.
7. No circular dependencies. Dependencies flow toward lower-level domain/core modules and stable contracts.
8. No premature common simulator. A shared command or mission-result contract may be useful; a shared filesystem/network runtime is not justified.
9. Generated artifacts stay generated. Edit source modules and builders, then regenerate and verify committed HTML/service-worker outputs.
10. Small PRs with behavioral equivalence. Extract first; improve or redesign behavior separately.

## 5. Reuse strategy

| Capability | Reuse decision |
|---|---|
| Escaping, formatting, date helpers | Share only if semantics are identical and both applications consume them |
| Feedback classification and presentation contract | Share the contract and reusable presentation; keep domain-specific feedback generation local |
| Progress concepts | Share stable data contracts; retain simulator-specific progress calculations |
| Authentication and Supabase setup | Consider a shared adapter after tracing call sites, ownership and error handling |
| Classroom workflows | Share service primitives only where schema and authorization semantics match |
| Mission grading | Share result contracts and common pure primitives; retain domain-specific checks |
| Shell/CLI interpreters | Keep separate; Linux shell and network-device CLI have different semantics |
| Filesystem and topology/packet models | Keep separate |
| UI components | Share only genuinely generic components with stable inputs/outputs |

## 6. Phased implementation roadmap

### Phase 0 — Baseline and guardrails
Purpose: make the refactor measurable and safe.
- Record source ownership, generated outputs, build/test commands and deployment assumptions.
- Trace root-level legacy net-* files and all references.
- Record baseline build/test results and identify slow or flaky checks.
- Define module naming, export, import and dependency rules.
- Add a lightweight circular-import check when reliable with the selected module format.

Acceptance:
- Source/generated-file relationships are documented.
- No production behavior changes.
- Existing CI remains unchanged or becomes stricter.

### Phase 1 — Establish the module foundation (first implementation)
Purpose: make real source modules canonical without changing simulator behavior.

Tasks, in order:
1. Extract inline runtime JavaScript from src/game.html into a dedicated application entry module, leaving HTML and CSS in their existing source files.
2. Update the root builder to assemble the entry module and imports into the existing static output. Evaluate esbuild; keep output single-file initially. Do not enable code splitting or require runtime network requests.
3. Convert src/helpers.js and src/checkers.js from test-only mirrors into canonical imported modules. Remove duplicated browser implementations and replace source-parity tests with direct module behavior tests.
4. Preserve startup contract, DOM IDs, event behavior, local persistence, Supabase behavior and service-worker cache behavior.
5. Keep generated index.html and service-worker.js synchronized through the build.

Acceptance:
- npm run build, npm test, npm run verify, npm run smoke and npm run check pass.
- Generated root index.html remains self-contained and works with supported static hosting.
- No duplicate helper/checker implementation remains.
- No new runtime fetch/import dependency is required for Linux.
- Browser-visible behavior and persistence remain unchanged.

Implementation note: this is a high-risk boundary because the current script is a large IIFE with implicit shared state. Extract in small slices. If converting the entire script to imports in one PR is unsafe, first extract one isolated pure module and establish the build pipeline, then continue. Never combine a broad behavior redesign with this foundation.

### Phase 2 — Linux pure core modules
Extract and test:
- path normalization and virtual filesystem traversal;
- file metadata, permissions and ownership;
- shell tokenization and parsing;
- deterministic helpers and formatting;
- pure mission checks and result contracts.

Acceptance:
- Core modules run in Node without DOM globals.
- Tests import production modules directly.
- Filesystem and permission behavior has regression fixtures.
- Parser tests cover quoting, escaping, pipes, redirection, invalid syntax and edge cases.

### Phase 3 — Linux runtime/domain decomposition
Extract in dependency order:
1. filesystem and permission model;
2. shell parser and command dispatcher;
3. command implementations grouped by domain (navigation/files, text, users/permissions, processes, services, storage, networking, package management);
4. process/job and service models;
5. system/network state;
6. mission runtime and evaluation orchestration;
7. local persistence and progress adapters.

Acceptance:
- Command handlers depend on explicit runtime interfaces, not UI globals.
- Engine behavior is testable without booting the page.
- Commands have consistent error/result contracts.
- UI remains an adapter over engine operations.

### Phase 4 — Linux product features
Separate feature workflows:
- health and operational dashboards;
- service desk and incident workflows;
- skill portfolio;
- workshops and guided practice;
- spaced recall and daily practice;
- classroom, assignments, feedback and teacher/student views;
- authentication and cloud sync.

Acceptance:
- Each feature has a clear owner and public entry points.
- Auth/cloud failures do not corrupt local progress.
- Classroom permissions and RLS behavior remain covered by database tests.
- Feature UI can change without editing core simulator logic.

### Phase 5 — Network Trainer engine and CLI
Split large modules by responsibility:
- topology, devices, interfaces and links;
- Ethernet switching, VLANs, STP and link aggregation;
- IPv4/IPv6 addressing and routing;
- DHCP, DNS, NAT and ACL/firewall behavior;
- VPN/PKI and security sensors such as Snort;
- telemetry, statistics and packet/flow inspection;
- CLI tokenizer/parser, command registry, completion and help;
- vendor/device dialects and command groups.

Acceptance:
- Protocol behavior has isolated tests and shared fixtures.
- Each CLI dialect registers commands through a stable registry contract.
- Adding a device/dialect does not require growing a central command switch indefinitely.
- Existing mission, topology and simulator tests remain green.

### Phase 6 — Network Trainer UI and learning workflows
Separate:
- workbench and terminal;
- topology canvas/editor;
- incidents and investigation timeline;
- inventory and interface inspection;
- knowledge/reference content;
- journal/evidence;
- configuration changes/checkpoints;
- classroom and scenario delivery.

Acceptance:
- UI areas consume engine/application APIs.
- UI state is not duplicated in the engine.
- Accessibility and browser UI tests continue to pass.

### Phase 7 — Shared platform services and cleanup
Only after domain boundaries stabilize:
- consolidate proven shared contracts and utilities;
- share authentication/Supabase adapters if semantics align;
- share learning feedback/progress contracts;
- remove legacy root-level files only after reference, test and history checks;
- document module ownership and contribution conventions.

Acceptance:
- No duplicate production implementation remains for shared behavior.
- No module imports another domain's private internals.
- No circular dependencies.
- Dead files are removed only with evidence that they are unused.
- Documentation and source maps reflect the actual repository.

## 7. Recommended dependency direction

    UI / feature workflows
             |
             v
    Application services / composition roots
             |
             v
    Domain engines (Linux OR Network)
             |
             v
    Pure core modules and stable contracts
             |
             v
    Platform adapters (storage, auth, Supabase, browser APIs)

The two simulation domains must not import one another. Cross-domain communication uses stable shared contracts or application-level orchestration.

## 8. Testing and merge gates

Every extraction PR includes:
- unit tests for the extracted module;
- regression tests for existing behavior;
- import/dependency validation;
- relevant root and/or Network Trainer build checks;
- generated-file freshness validation;
- browser smoke tests when startup, DOM, routing, storage or UI integration changes;
- accessibility tests when UI structure or interactions change;
- Supabase/RLS tests when authentication, classroom or persistence boundaries change.

Suggested Linux sequence:

    npm run build
    npm test
    npm run verify
    npm run smoke
    npm run check

Suggested Network Trainer sequence:

    npm run build:net
    npm run test:net
    npm --prefix network-trainer run test:ui

CI remains the authoritative merge gate. Do not merge with failing, skipped-required or unverified checks.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Hidden global dependencies and declaration order | Extract one module at a time; add explicit imports and tests first |
| Behavior changes disguised as refactoring | Preserve outputs and UI behavior; separate improvements into later PRs |
| Broken static/offline deployment | Bundle into existing single-file output first; test without dev-server assumptions |
| Generated HTML drift | Keep freshness checks mandatory; never edit generated output by hand |
| Circular dependencies | Define ownership and dependency direction; run a cycle check |
| Over-sharing abstractions | Share contracts and pure utilities only when semantics match |
| Network dialect regressions | Per-dialect command fixtures and regression tests |
| Supabase/classroom regressions | Preserve RLS tests and verify local/cloud fallback |
| Oversized PRs | One responsibility per PR; merge only after required checks pass |

## 10. PR sequencing and delivery policy

- Each phase is a series of small, independently reviewable PRs.
- Prefer one extraction or one module boundary per PR.
- Do not combine file moves, API redesign, visual changes and feature additions.
- Keep generated outputs in the same PR as source changes.
- Include a before/after dependency map in substantial extraction PRs.
- Update this roadmap as phases complete; mark work complete only after merged code and passing CI verify it.
- Keep the default branch deployable after every merge.

## 11. Immediate next implementation slice

Start Phase 1 conservatively:
1. inspect the complete inline script and its global/ordering dependencies;
2. extract the application script to a dedicated source entry file without changing execution order;
3. make the builder consume that source and regenerate the same static page;
4. then move pure helper/checker implementations behind real imports in subsequent focused PRs.

This creates a clean seam for module extraction while preserving the current static single-file deployment contract.
