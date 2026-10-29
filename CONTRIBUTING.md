# Contributing to The Last Sysadmin

Thanks for helping improve the game. The entire experience lives in a single `index.html` so it stays easy to open and deploy.

## Design rule

**Do not change the visual look or graphical design** unless explicitly requested. Improvements should be functional, pedagogical, accessibility-related, or structural.

## Adding a new command

1. Find the command registry (search for existing command definitions near the shell engine).
2. Add a new entry with:
   - Name and aliases
   - Handler that mutates the simulated filesystem / process state when appropriate
   - A short `man` page
3. Prefer checks that inspect resulting state rather than matching the exact command string.
4. Test both the happy path and a couple of creative alternatives.

## Adding a chapter or ticket

1. Locate the chapter / ticket data structures.
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

## Suggested next improvements (non-visual)

- Stronger ARIA on the terminal and briefing panel
- Optional post-ticket "why this worked" explanation (hidden by default)
- A small developer debug mode (e.g. `?debug=1`) that dumps current FS / mission state to the console
- Unit-testable extraction of pure functions (parser helpers, checkers) if the file is later modularized

## Workflow

1. Edit `index.html` (or supporting files).
2. Test locally: open the file or run `python3 -m http.server`.
3. Commit and push — GitHub Pages deploys automatically.
4. If you change cached assets, bump the cache name in `service-worker.js`.

## Questions?

Open an issue. Ideas for new chapters, commands, or better hints are welcome.
