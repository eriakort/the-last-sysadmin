# Contributing to The Last Sysadmin

Thanks for helping improve the learning platform. The repository contains two connected browser-based simulators: Linux Sysadmin and Network Sysadmin. Both have source files and generated deployable HTML; make changes in the source, then regenerate and verify the output.

## Development setup

Requirements:
- Node.js and npm
- Playwright and the browser binaries required by the tests
- PostgreSQL only when running the Supabase schema/RLS suite locally

Install dependencies:

```bash
npm ci
```

Install the browser binaries used by the complete browser suite:

```bash
npx playwright install --with-deps chromium firefox webkit
```

## Source files and generated output

### Linux Sysadmin

- `src/game.html` — main application source, including markup, styles and browser logic.
- `src/helpers.js`, `src/checkers.js` — pure helper and mission-checking modules used by tests.
- `build.js` — generates the root `index.html` and service worker from the source files.
- `src/version.txt` — service-worker cache version; bump it when a release needs to invalidate cached application assets.

Do not edit the generated root `index.html` or `service-worker.js` directly.

### Network Sysadmin

- `network-trainer/ui.js` — browser UI source.
- `network-trainer/build-ui.js` — generates `network-trainer/index.html`.
- The other `network-trainer/*.js` modules contain the simulator model, CLI, mission data, checks, topology builder and related logic.

Do not edit `network-trainer/index.html` directly. Update the source modules and regenerate it.

### Database

- `supabase/` contains the SQL migrations and PostgreSQL/RLS test harness.
- Follow `supabase/README.md` for the authoritative migration order and deployment requirements.
- Never commit service-role keys, passwords, access tokens or other privileged credentials.

## Build and test

Useful root commands:

```bash
npm run build          # Build Linux Sysadmin output
npm run build:net      # Build Network Sysadmin output
npm run check          # Linux build, core tests, verification and generated-file freshness
npm run test:all       # Full non-database test suite, including browser tests
npm run test:net       # Network Trainer unit/engine test suite
npm run test:a11y      # Automated Playwright + axe accessibility scans
npm run test:sync-db   # Supabase schema/RLS tests; requires local PostgreSQL
```

The complete local browser suite requires the Playwright package and its browser binaries. CI is the authoritative merge gate and also runs database/RLS tests and generated-file checks. A local pass does not replace the required GitHub checks.

For a focused change, run the narrowest relevant tests first, then the broader suite when practical. Add regression coverage for behavior changes, including keyboard and assistive-technology behavior for accessibility work.

## Accessibility

- Give every interactive control a meaningful accessible name, role and state.
- Ensure all functionality is keyboard-operable and focus remains visible and predictable.
- For dialogs and menus, implement appropriate semantics, initial focus, keyboard navigation, Escape behavior where supported, and focus restoration.
- Respect `prefers-reduced-motion`.
- Run `npm run test:a11y` for changes affecting either application shell.
- The manual keyboard and screen-reader worksheet is `docs/ACCESSIBILITY_MANUAL_VALIDATION.md`; automated axe results do not replace hands-on testing. Record actual environment, revision, outcomes and defects in that worksheet. Do not claim WCAG conformance without a suitable full audit.

See `docs/ACCESSIBILITY_AUDIT.md` for findings and remediation history.

## Implementation principles

- Keep changes incremental and focused; avoid unrelated refactors in feature PRs.
- Preserve the established visual language unless a design improvement is part of the requested change. Keep responsive behavior and accessible focus states intact.
- The environments are educational simulations. Do not imply that they connect to physical network equipment, launch real VMs/containers, or provide complete vendor OS emulation.
- Treat simulated telemetry, browser-local records and formative grading honestly; do not describe them as production monitoring, audit-grade evidence or high-stakes assessment.
- Do not weaken authentication, authorization, RLS policies or test assertions to make a check pass. Add adversarial tests when changing security-sensitive behavior.
- Keep generated output synchronized with its source.

## Pull request workflow

1. Start from an up-to-date `main` and create a focused feature or fix branch.
2. Make the change in source files and add/update regression tests.
3. Run the relevant build and tests; regenerate generated HTML where applicable.
4. Review the diff for secrets, generated-file drift, accessibility regressions and unintended scope.
5. Open a pull request with a concise summary, test evidence and any known limitations.
6. Merge only after required CI and security checks pass.

For Supabase changes, include migration-order and RLS implications in the PR description and test both allowed and denied access paths.

## Further guidance

- `README.md` — project overview, setup, architecture and platform boundaries.
- `MODULARIZATION.md` — Linux source layout and build pipeline.
- `network-trainer/README.md` — Network Sysadmin simulator capabilities and fidelity boundaries.
- `docs/ACCESSIBILITY_AUDIT.md` and `docs/ACCESSIBILITY_MANUAL_VALIDATION.md` — accessibility findings, automated coverage and outstanding manual validation.
- `supabase/README.md` — database setup and migration sequence.
