# Modularization path

The game currently ships as a single self-contained `index.html`. That is intentional for easy offline use and GitHub Pages.

This document describes a low-risk way to extract pure logic for testing **without** changing the visual design or the final deploy artifact.

## Goal

- Extract pure helpers and checkers into separate files under `src/`.
- Unit-test them in Node (or the browser).
- Keep a tiny concat step that produces the final single `index.html`.

## Current pure helpers (`src/helpers.js`)

- `pad`
- `esc` / `md`
- `reEsc`
- `splitLines`
- `mulberry32` (seeded RNG used for generated logs)
- `ticketId`
- `norm` (path normalization — pass cwd and HOME)
- `permStr` (permission string from mode)
- `human` (human-readable size)

These have no DOM or game-state dependencies.

## Mission checkers (`src/checkers.js`)

Pure functions that take a filesystem snapshot and return `{ ok, reason? }`:

- `fileExists(fs, path)`
- `fileMode(fs, path)`
- `checkExecutable(fs, path)`
- `checkContains(fs, path, needle)`

Easy to unit-test. Expand with more checkers as needed.

## Build step

`build.js` is a tiny concat helper. It looks for markers in `index.html`:

```
/* === EXTRACTED HELPERS START === */
/* === EXTRACTED HELPERS END === */
```

When present, `node build.js` injects the contents of `src/*.js` between them. The public artifact remains one file.

## Testing

```bash
node -e "
const { pad, ticketId, norm, permStr } = require('./src/helpers');
const { checkExecutable } = require('./src/checkers');
console.assert(pad(3) === '03');
console.assert(ticketId(0) === 'INC-1025-01');
console.assert(norm('~/foo', '/tmp', '/home/rookie') === '/home/rookie/foo');
console.log('ok');
"
```

## Design rule

No visual or layout changes are required for any of this. The CSS and HTML structure stay exactly as they are.
