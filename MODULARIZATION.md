# Modularization path

The game currently ships as a single self-contained `index.html`. That is intentional for easy offline use and GitHub Pages.

This document describes a low-risk way to extract pure logic for testing **without** changing the visual design or the final deploy artifact.

## Goal

- Extract pure helpers and checkers into separate files under `src/`.
- Unit-test them in Node (or the browser).
- Keep a tiny concat step that produces the final single `index.html`.

## Current pure helpers (good first extraction)

Already sketched in `src/helpers.js`:

- `pad`
- `esc` / `md`
- `reEsc`
- `splitLines`
- `mulberry32` (seeded RNG used for generated logs)
- `ticketId`

These have no DOM or game-state dependencies.

## Suggested next extractions

1. Path / filesystem helpers that do not touch the live `S` object (e.g. path normalization, permission string formatting).
2. Mission checkers that only inspect a snapshot of state and return true/false + reason.
3. Command output formatters.

## Build step (later)

A simple script (or manual step) can concatenate:

```
src/helpers.js
src/checkers.js
...rest of the original script...
```

into the `<script>` block of `index.html` before deploy. The public artifact remains one file.

## Testing

With the helpers extracted, a small Node test can look like:

```js
const { pad, ticketId, splitLines } = require('./src/helpers');
console.assert(pad(3) === '03');
console.assert(ticketId(0) === 'INC-1025-01');
console.assert(splitLines('a\nb\n').length === 2);
```

## Design rule

No visual or layout changes are required for any of this. The CSS and HTML structure stay exactly as they are.
