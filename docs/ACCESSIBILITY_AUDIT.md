# Accessibility audit — baseline

Date: 2026-11-07

## Scope and method

This is a source-level baseline review of the Linux Sysadmin page (`src/game.html`) and Network Sysadmin UI (`network-trainer/ui.js`, `network-trainer/build-ui.js`). It reviewed landmarks, navigation semantics, focus styling, keyboard interaction paths, SVG topology controls, context menus, dialogs, live/status output, and existing browser-test coverage.

This is not a WCAG conformance claim. No assistive-technology user testing, automated axe scan, contrast measurement, or manual screen-reader session has been performed yet. The current CI browser suites exercise workflows, but they are not dedicated accessibility tests.

## Findings

### P0 — Keyboard access to the topology builder is incomplete

- Topology devices render as SVG `g.node` groups with pointer-driven selection and dragging, but no `tabindex`, interactive role, accessible name, or keyboard activation.
- Links, drawing shapes, and topology notes are also SVG elements selected or edited through pointer interaction.
- The context menu is opened from the SVG `contextmenu` event (right-click); there is no keyboard equivalent such as Shift+F10 or the Context Menu key.
- This blocks keyboard-only users from selecting and editing core Build-canvas objects.

**Required remediation:** expose device nodes as named, focusable controls; support Enter/Space selection; provide Shift+F10/Context Menu key access to the same contextual actions; add keyboard-operable link/drawing/note selection and editing; preserve focus after menu actions and rerenders. Provide non-drag alternatives for moving devices and connecting endpoints.

### P1 — Focus visibility is inconsistent

- Network Trainer's terminal input explicitly removes its outline (`#tin{...outline:none}`) without an equivalent clearly visible focus treatment in the reviewed stylesheet.
- Some components define `:focus-visible` styles (for example, context-menu buttons and help commands), but there is no consistent global focus-visible rule for buttons, links, inputs, selects, and custom controls.
- SVG topology objects have no focus style because they are not currently focusable.

**Required remediation:** establish a high-visibility, theme-aware `:focus-visible` treatment across both applications, including the terminal input and custom controls; test it in all themes.

### P1 — Dialog behavior needs a shared accessibility pattern

- The Network Trainer search palette declares `role="dialog"` but omits `aria-modal="true"`; its Tab handling moves focus to the first result but does not implement a complete focus trap or reliable focus restoration.
- The topology context menu has `role="menu"` and `role="menuitem"`, but only pointer opening and Escape dismissal are wired. It lacks the expected arrow-key menu navigation and return-to-trigger focus behavior.
- Several other modal overlays are assembled dynamically with generic containers and close buttons rather than a consistent dialog role, labelled title, initial focus, focus containment, and focus restoration contract.
- The Linux race overlay has a dialog role and label but no explicit modal state or focus lifecycle in the inspected markup.

**Required remediation:** introduce a reusable dialog/menu interaction contract; label dialogs by visible headings; set modal semantics where appropriate; manage initial focus, Tab containment, Escape, and focus restoration; prevent background controls from being reached while modal dialogs are open.

### P1 — App navigation uses tab semantics for page links

- Both app shells use `role="tablist"` around anchor links to switch between separate application destinations.
- The anchors are not implemented as an ARIA tab pattern: there is no associated tabpanel relationship or arrow-key tab activation model.
- Network workspace navigation is implemented as buttons and correctly updates `aria-current="page"`, which is a better fit for in-page destinations.

**Required remediation:** represent cross-application navigation as a normal labelled `nav` with links, not a tablist; retain a clear current-page indicator.

### P2 — Accessible names and status announcements need systematic coverage

- Many major controls have visible text and/or `title` attributes, and several search/filter controls have explicit labels.
- Some icon-only controls rely on `title` alone (for example, the Network Sysadmin Stats button); title-only naming is fragile for touch and assistive-technology use.
- Network Trainer has a polite live status region for terminal evidence, and the Linux terminal output uses `role="log"` with `aria-live="polite"`. Status feedback elsewhere is not consistently announced.
- Dynamically replaced panels and search results do not consistently move focus or announce the updated result count/state.

**Required remediation:** inventory all interactive controls for programmatic names; prefer `aria-label` or visible text over title-only labels; add concise live status announcements for meaningful asynchronous or validation outcomes; avoid announcing large content dumps.

### P2 — Automated accessibility coverage is missing

- Existing Playwright suites validate functional browser flows and browser compatibility.
- There is no dedicated accessibility test suite or automated accessibility scanner wired into CI in the reviewed workflow.

**Required remediation:** add a focused Playwright accessibility suite and axe-core scans for representative Linux and Network workspaces, dialogs, classroom flows, and Build mode. Add keyboard-only regression tests for topology interactions. Fix violations rather than suppressing them without documented justification.

## Remediation progress

### Batch 1 — focus visibility and application navigation

Implemented in the first remediation pull request:

- Added consistent `:focus-visible` outlines to keyboard-operable controls in both application shells, including explicit treatments for terminal and search inputs that previously suppressed outlines.
- Changed the cross-application navigation from an ARIA tablist to a labelled navigation landmark with ordinary links and `aria-current="page"` on the active destination. In-page classroom and inspector tab widgets remain tablists.
- Added source-level regression checks for these contracts. This does not replace visual contrast measurement or assistive-technology validation.

## Remediation sequence

1. Establish shared focus-visible styling and correct page-navigation semantics.
2. Make topology devices keyboard-focusable and operable; add keyboard context-menu invocation and focus restoration.
3. Make links, drawings, notes, and device movement/connection workflows keyboard-operable without dragging.
4. Standardize modal and menu semantics, focus lifecycle, and Escape behavior.
5. Add accessible-name/status-announcement coverage and automated axe/Playwright CI checks.
6. Validate representative flows manually with keyboard-only navigation and at least one screen reader; record browser/AT combinations and known limitations.

## Acceptance criteria

- All functionality is reachable and operable without a pointer, including Build mode.
- Every interactive element has a meaningful accessible name and visible keyboard focus.
- Focus remains predictable when workspaces rerender, dialogs open/close, and context-menu actions execute.
- Dialogs and menus expose correct semantics and keyboard behavior.
- Automated accessibility scans run in CI with no unexplained serious/critical violations.
- Manual keyboard and screen-reader checks are recorded; no claim of WCAG conformance is made until a full audit supports it.

### Batch 4 — modal and search-palette focus lifecycle

Implemented in the modal-focus remediation pull request:

- Added labelled dialog semantics and modal state to the Network Trainer settings, statistics, incident-queue, and classroom dialogs.
- Added initial focus, forward/reverse Tab containment, Escape dismissal, backdrop dismissal, and return-to-opener focus restoration for those dialogs.
- Applied the same keyboard focus-containment and restoration behavior to the global workstation search palette; gave its search field and result list explicit accessible names and exposed the active result through `aria-activedescendant`.
- Added Playwright regression coverage for dialog semantics, Tab wrapping, Escape, and focus restoration. These tests do not replace manual keyboard or assistive-technology validation.


### Batch 5 — accessible names, status announcements, and automated scanning

Implemented in the Batch 5 remediation pull request:

- Added explicit accessible names to icon-only statistics/settings controls and topology zoom/session navigation controls; retained visible labels and descriptive titles on other actions.
- Made the Network Trainer mission/build status region a polite, atomic status announcement so validation and completion results are announced without moving focus.
- Added a Playwright + axe-core scan for the Linux Sysadmin initial workspace and Network Trainer workbench, settings dialog, and search palette. CI installs the pinned axe-core version and fails on serious or critical WCAG 2.1 A/AA and best-practice violations; lower-impact findings remain visible in the scan output for follow-up.
- This automated gate is not a substitute for manual keyboard and screen-reader validation.
