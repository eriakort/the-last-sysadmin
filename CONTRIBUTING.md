# Contributing to The Last Sysadmin

Thanks for helping improve the game. It ships as a single self-contained
`index.html` (easy to open and deploy), but that file is **generated** — you
edit the sources under `src/` and run the build. Never edit `index.html` or
`service-worker.js` by hand; CI will reject it.

> **Start here:** `src/game.html` is the game — title, CSS, body, and the game
> `<script>`. Edit that. Then `npm run check` and commit `src/**` together with
> the regenerated `index.html` / `service-worker.js`. See `MODULARIZATION.md`
> for the full layout and the release checklist.

## Design rule

**Do not change the visual look or graphical design** unless explicitly requested. Improvements should be functional, pedagogical, accessibility-related, or structural.

## Adding a new command

1. In `src/game.html`, find the command registry (search for existing command definitions near the shell engine).
2. Add a new entry with:
   - Name and aliases
   - Handler that mutates the simulated filesystem / process state when appropriate
   - A short `man` page
3. Prefer checks that inspect resulting state rather than matching the exact command string.
4. Test both the happy path and a couple of creative alternatives.

## Adding a chapter or ticket

1. In `src/game.html`, locate the chapter / ticket data structures.
2. Add the new ticket with:
   - Title, story, objective
   - Hint steps (three is the usual pattern)
   - A state-based success check
3. Keep the existing amber / terminal aesthetic.
4. Update the chapter table in `README.md` and `CHANGELOG.md`.

## Accessibility improvements

- Prefer adding `aria-*` attributes, roles, and keyboard handlers.
- Keep focus management clear in modals (race overlay).
- Respect `prefers-reduced-motion`.
- Do not alter colors, spacing, or fonts.

### Ready-to-apply accessibility patch

A small non-visual accessibility patch is included as `a11y.patch`. It adds:

- A visually-hidden skip link to the command input
- `role="main"` on the stage
- Stronger ARIA on the terminal input (`aria-describedby`), hint/retry buttons, and the live log region
- Dialog semantics on the race overlay

Apply it locally:

```bash
git pull
git apply a11y.patch
# review the changes, then:
git add index.html
git commit -m "Accessibility improvements (skip link, landmarks, stronger ARIA)"
git push
```

The patch only touches attributes and adds a hidden skip link; the visual design is unchanged.

## Developer debug mode and post-ticket “why”

A second small patch (`debug-why.patch`) adds two non-visual helpers near the top of the script:

- **Debug mode** — append `?debug=1` to the URL. Call `debugLog('state', someObject)` anywhere to log mission state or filesystem snapshots to the console (grouped, collapsed).
- **Post-ticket why** — call `postSuccessWhy('short explanation')` after a successful ticket. It appends a normal `.sys.ok` system message (no new panel or design change).

Apply:

```bash
git pull
git apply debug-why.patch
# then wire debugLog(...) and postSuccessWhy(...) into the places you want
git add index.html
git commit -m "Add debug mode and post-ticket why helpers"
git push
```

Example usage after the patch:

```js
// On load or after state changes
if (DEBUG) debugLog('current state', { chapter, ticket, fs: /* snapshot */ });

// After a ticket passes
postSuccessWhy('The file mode was updated so the script is executable.');
```

## Modularization path (still one index.html)

Started. See:

- `src/helpers.js` — pure helpers (`pad`, `esc`, `md`, `splitLines`, `mulberry32`, `ticketId`, etc.) extracted for testing.
- `MODULARIZATION.md` — plan for further extraction, a tiny concat build step, and unit tests.

The final deployed artifact remains a single `index.html`. No visual changes.

## Suggested next improvements (non-visual)

- Stronger ARIA on the terminal and briefing panel (see `a11y.patch`)
- Optional post-ticket "why this worked" explanation (see `debug-why.patch` and the sketch in recent commits)
- A small developer debug mode (e.g. `?debug=1`) that dumps current FS / mission state to the console (helpers already present)
- Continue extracting pure functions (see `src/helpers.js` and `MODULARIZATION.md`)

## Workflow

1. Edit the sources under `src/` (`src/game.html` for the game itself).
2. `npm run build`, then test locally: open `index.html` or run `python3 -m http.server`.
3. `npm run check` (build + unit tests + verify + staleness guard) must pass.
4. To force returning players to refresh, bump `src/version.txt` before building.
5. Commit `src/**` together with the regenerated `index.html` / `service-worker.js`, then push — GitHub Pages deploys automatically and CI verifies the build.

> The older `a11y.patch` / `debug-why.patch` files above predate this pipeline;
> apply such changes to `src/game.html` and rebuild rather than patching the
> generated `index.html`.

## Questions?

Open an issue. Ideas for new chapters, commands, or better hints are welcome.
