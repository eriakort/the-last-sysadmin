# Build & source layout

The game **ships** as a single self-contained `index.html` (easy offline use,
one file to serve on GitHub Pages). But `index.html` is now **generated** — you
never edit it by hand. You edit the sources under `src/` and run the build.

> Why: for a while `index.html` quietly stopped being regenerated while the
> sources kept changing, so shipped features (themes, the Settings menu, the
> soft-lock fix) never actually reached the deployed page. The pipeline below
> plus the CI staleness guard exist so that can't happen silently again.

## Sources (`src/`)

| File | What it is | Edit it? |
|------|-----------|----------|
| `src/game.html` | **THE game** — title, CSS, `<body>`, and the game `<script>`. This is where almost all real work happens. | ✅ yes |
| `src/shell-head.html` | Fixed `<head>` boilerplate (doctype, metas, manifest + icon links, reset `<style>`). | rarely |
| `src/shell-tail.html` | Fixed tail — service-worker registration + `</body></html>`. | rarely |
| `src/service-worker.js` | Service-worker template; `__VERSION__` is filled from `version.txt`. | rarely |
| `src/version.txt` | The cache version number. **Bump it to force clients to refresh** after a deploy. | ✅ on release |
| `src/helpers.js` | Pure helpers (`pad`, `esc`, `norm`, `permStr`, `human`, …), extracted for unit testing. | ✅ |
| `src/checkers.js` | Pure mission checkers (`checkExecutable`, `checkContains`, …) returning `{ ok, reason? }`. | ✅ |

`helpers.js` / `checkers.js` are the pure logic, mirrored from `game.html` so
they can be unit-tested in Node without a DOM. They are **not** concatenated
into the build — they exist for the tests. Keep them in sync with `game.html`
when you change the corresponding logic; `npm test` guards their behavior.

## Build

```bash
npm run build       # node build.js
```

`build.js` concatenates `shell-head.html + game.html + shell-tail.html` into
`index.html`, and renders `service-worker.js` from its template with the version
from `version.txt`. It refuses to build (fails loudly) if a source looks wrong —
missing manifest link, missing `boot(load())`, a non-numeric version, etc.

## Verify

```bash
npm test            # unit tests for src/helpers.js + src/checkers.js
npm run verify      # built page: required features present + every inline <script> parses
npm run smoke       # optional: boots index.html in headless Chromium, fails on real JS errors
npm run check       # build + test + verify + staleness guard (what CI runs)
```

`verify.js` is browser-free and fast (it compiles each inline `<script>` with
`new Function` to catch syntax errors without running them). `smoke.js` needs
Playwright and actually boots the page.

## Release checklist

1. Edit `src/game.html` (and `src/helpers.js` / `src/checkers.js` if the pure logic changed).
2. Bump `src/version.txt` so returning players get the new cache.
3. `npm run check` — must pass.
4. Commit `src/**` **and** the regenerated `index.html` / `service-worker.js` together.

CI (`.github/workflows/ci.yml`) re-runs the build on every push/PR and fails if
the committed `index.html` / `service-worker.js` don't match a fresh build —
i.e. if you hand-edited them or forgot to rebuild.

## Design rule

No visual or layout change is required by any of this. The CSS and HTML
structure live in `src/game.html` exactly as they always did.
