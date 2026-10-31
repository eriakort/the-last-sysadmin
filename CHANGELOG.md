# Changelog

All notable changes to The Last Sysadmin. The game is a single `index.html`;
versions below track the content added over time.

## v24 — Review fixes: docs, test coverage, offline cache
- **Self-hosting docs corrected.** `supabase/README.md` and the root `README.md` now list the full migration apply order (`supabase-setup` → m1 → m2 → m4 → m6 → m7); previously only m1 was documented, so a self-hoster would have had broken join-by-code, enroll-by-email, the mission editor, and the scenario builder.
- **Test coverage extended to M4/M6/M7.** `supabase/test/run.sh` now applies every migration and runs a new suite covering `enroll_by_email` (staff-only, student role forced, idempotent, unknown-email error) and author-isolation of `authored_missions` and `scenarios`. Full suite: M1 (30) + M2 + M4/M6/M7, all passing.
- **Cache version bumped to v24** so returning/installed (PWA) users pick up all of Phase 1 & 2 (it had been frozen at v23 since M2).
- **Question bank works offline.** `questions.json` is now in the service-worker precache, so the 1,000-question bank loads in the installed/offline app.
- *Known gap (not a regression):* authored missions and scenarios are author-only — a teacher can create and group them, but there is no path yet that delivers them to students to *play*. Tracked as a follow-up; built-in missions are fully assignable.

## M4 — Teacher dashboard + auto-grading
- Classroom panel (teachers) now shows a **Roster** for the first owned class: student name/avatar, tickets passed / assigned, and grade % (passed ÷ assigned).
- Completing a mission upserts an `attempts` row (mission_id, passed, ms, hints) so the dashboard has data.
- Grade is formative (client-written). High-stakes grading would move the write to an Edge Function later.

## M3 — Assignments (UI applied)
- `src/game.html` now includes assignment create/view in the Classroom panel.
- Teachers (with teacher tools on) see a form to assign a title, due date, and comma-separated mission ids to their first owned class, and see existing assignments.
- Students see assignments (title, due date, mission count) for classes they joined, with an Open button.
- Run `npm run build` so the generated `index.html` picks up the change.

## v21 — ⚙ Settings menu (themes + avatar + account)
- Added an always-visible **⚙ Settings** button that opens one panel with **Themes** (Halcyon Dark default + Amber CRT, Green Phosphor, Nord Night, Paper light), **your avatar**, and **account** (connect Supabase / sign in / sign out). When signed in, the button shows your avatar + name.
- Replaced the separate 👤 avatar button and the account button with this one entry point. Avatar selection, rack/chips toggles, and the soft-lock fix are all preserved.

## v23 / M2 — Create a class, join by code (classroom UI)
- New **Classroom** panel in ⚙ Settings (signed-in users): join a class by code, and — with teacher tools enabled — create classes and see their join codes.
- Students enter a 6-character code to enroll. Teachers get a self-serve "Enable teacher tools" toggle, then a create-class form; each class shows a click-to-copy join code.
- Backend: `supabase/m2-enrollment.sql` adds `enroll_by_code()`, a SECURITY DEFINER function that resolves a code to a class and enrolls the current user as a student — needed because RLS otherwise hides a class from someone who hasn't joined yet. It only ever enrolls the caller, only as a student, and is granted to signed-in users only.
- Tested: the join-by-code path has its own suite in `supabase/test/` (valid/invalid/duplicate code, roster visibility), and `test-classroom-ui.js` drives the real UI against a stubbed client (`npm run test:ui`).

## M1 — Classroom roles, schema & Row Level Security (backend only)
- Added the teaching-platform backend: `classes`, `enrollments`, `assignments`, `attempts`, and `feedback` tables, plus a self-serve `profiles.is_teacher` flag — all under `supabase/m1-classroom.sql`. No gameplay/UI change yet; this is the foundation M2+ builds on.
- Row Level Security on every table enforces tenant isolation: a teacher sees only their own classes and students; no teacher, TA, or student can read or write another tenant's rosters, attempts, grades, or feedback. Recursive-policy pitfalls are avoided with `SECURITY DEFINER` helper functions (`is_class_staff`, `staffs_class_of`, …).
- Privacy split: profiles stay public handles (name + avatar, as the race leaderboard needs); enrollments/attempts/feedback are private to the student and their class staff; email never leaves `auth.users`.
- Proven, not asserted: `supabase/test/` ships an adversarial RLS suite (30 checks, two teachers + students + a TA) that runs against a local Postgres via a thin Supabase shim and exits non-zero on any leak.

## v22 — Build pipeline (no more silent drift)
- `index.html` and `service-worker.js` are now **generated** from sources under `src/` (`npm run build`); they are never edited by hand. This closes the gap that let the deployed page silently fall behind its sources (the bug behind v20).
- `npm run check` runs the whole gate locally — build, unit tests, a browser-free verify (required features present + every inline `<script>` parses), and a staleness guard that fails if the committed files don't match a fresh build. A GitHub Actions workflow runs the same on every push/PR.
- Added unit tests for the pure helpers and mission checkers (`src/helpers.js`, `src/checkers.js`); fixed an escaping bug in the extracted `helpers.js` module (the shipped game was already correct). No gameplay or visual changes.

## v20 — Resilience fix actually shipped in index.html
- The soft-lock recovery described under v17 below is now really present in the shipped `index.html` (it had been documented and written, but a broken build step meant the code never made it into the page that was deployed).
- What it does: deleting a file a ticket relies on (e.g. `/var/log/halcyon/app.log`) no longer permanently blocks the game. Missing game-essential files self-heal on entering a ticket, on reloading a saved game, inside Restore checkpoint, via a new `repair` command, and when you type `check` on a stuck ticket.
- Safe: it only restores *missing* files (never overwrites your edits) and never undoes legitimate clean-up (the `/tmp` crash dumps, the PHP session flood, or the quarantined export script stay gone).

## v18 — One ⚙ Settings menu (discoverability)
- Replaced the separate 🎨 theme button and the sign-in button (which was hidden until Supabase was connected) with a single always-visible **⚙ Settings** button. It opens one panel with Theme, Avatar, and Account.
- Account section connects Supabase, signs in / out, and shows who's signed in — so sign-in and Supabase setup are no longer buried behind the Race dialog. When signed in, the button shows your avatar + name.

## v17 — Resilience: no more soft-locks from deleted files
- Fixed a soft-lock: deleting a file an earlier ticket set up (e.g. `/var/log/halcyon/app.log`) could permanently block a later ticket, and "Restore checkpoint" couldn't recover it (the checkpoint only captured the current ticket's starting state).
- Added self-healing: any missing game-essential file is restored from its canonical state when you enter a ticket, when you reload a saved game, inside Restore checkpoint, and via a new `repair` command. Typing `check` on a stuck ticket now also restores a deleted file and says so.
- Healing never overwrites your own edits (restores only missing files) and never undoes legitimate clean-up (the `/tmp` crash dumps, the PHP session flood, or the quarantined export script stay gone).

## v16 — Mobile: collapsible side panel
- On phones the Rack status (35 chapters of LEDs) collapsed the whole terminal below the fold. It now shows only the chapter you're on, with a "Show all 35 chapters" toggle to expand. Cuts ~900px of scrolling before the terminal.
- The "Commands you've used" chip list also collapses to ~two rows on phones once it grows past ~10 commands, with a "Show all" toggle.
- Both are mobile-only (≤860px); desktop is unchanged, and both hide during a race.

## v15 — Themes & avatars
- Five appearance themes via a 🎨 picker: Halcyon Dark (default, unchanged), Amber CRT, Green Phosphor, Nord Night, Paper (light). Saved per browser, applied before first paint. Pure CSS-variable swaps — no new assets.
- Emoji avatars: pick one in the Race setup or your account; shown in the lobby, the live race board, the all-time leaderboard, and on the sign-in button. Published via race presence and saved to your profile (`profiles.avatar`; the SQL now adds that column and is safe to re-run).

## v14 — Accounts, progress sync & leaderboard (Supabase, optional)
- Optional magic-link sign-in (passwordless, public sign-ups) via Supabase Auth — shown only when a Supabase project is configured; the game still plays fully signed-out.
- Cross-device **progress sync**: campaign (chapters/XP) saves to your account and loads on any device (merges by furthest progress; local-only still works offline).
- Persistent **race leaderboard**: fastest clean time per scenario, viewable from the Race dialog; each finish is recorded to your account.
- Security: one shared Supabase client; Row Level Security so each user writes only their own rows (`supabase-setup.sql` included). Anon key only — never the service_role key. Integrity is casual (client-written, self-reported) by design.

## v13 — Race mode on self-hosted sites (Supabase)
- Race mode now works off claude.ai too: a dual backend uses the claude.ai `room` capability when present, and falls back to a free **Supabase** realtime (presence) backend otherwise.
- Connect a Supabase project once in the Race dialog (Project URL + anon public key, saved in the browser), or hard-code `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `index.html`. No tables or server needed — presence channels only. The Supabase client is lazy-loaded from jsDelivr only when used.
- The old "offline build" notice is replaced by a guided setup screen on self-hosted copies.

## v12 — Race mode
- Online head-to-head: two or more players open the same page, join a room by code, pick one of the five incident scenarios, and race live to resolve it first.
- Lobby with ready-up and a host start, a synchronized countdown, and a real-time leaderboard (progress bars while racing, finish times and a winner when done). Ranked by each player's own solve time, so network skew doesn't affect fairness.
- Built on the artifact `room` capability (presence-based; no accounts). Runs in the hosted claude.ai version; the standalone/PWA/Pages builds show a "needs the online version" notice and otherwise play normally. Racing uses an isolated sandbox and never touches campaign progress.

## v11 — Incident Files (Chapters 31–35)
- Five investigation scenarios drawn from the most common senior-Linux-admin incidents: a phantom disk (deleted-but-open file held by a process), inode exhaustion (`df` fine, writes fail), a compromise with a UID-0 backdoor + cryptominer + rogue cron, the OOM killer taking down a service, and a ghost load caused by I/O wait on a stuck process.
- Each scenario pages in an incident, asks diagnostic questions (`submit` your findings), then has you apply the fix.
- New/extended commands: `lsof +L1` (deleted-but-held files), `df -i` & `du --inodes`, `last` / `lastb` / `w` / `who`, OOM lines in `dmesg` and the journal, `find -mtime`/`-mmin`, and `vmstat`/`iostat`/`uptime` that reflect live I/O wait.
- 26 new tickets (183 total), two new ranks, updated finale.

## v10 — Speed tracker
- Optional per-ticket timer (opt in via the "Speed tracker" button or `tracker`).
- Logs time and hints used per ticket; `stats` shows totals, average, fastest/slowest.
- Made `[hidden]` self-contained so the standalone/PWA build hides UI correctly.

## v9 — Chapters 21–30 + PWA
- Advanced chapters: regex & pipelines, DNS & networking, kernel/sysctl, shell
  customization, special permissions & ACLs, LVM & filesystems, signals & long
  jobs, observability, automation (Makefiles), and a "provision a service from
  scratch" capstone.
- ~35 new commands (dig, host, nc, sysctl, dmesg, alias, which, type, umask,
  getfacl/setfacl, pvcreate/vgcreate/lvcreate/mkfs/blkid, lsof, timeout, vmstat,
  iostat, make, nl, column, and more), each with a man page.
- Added PWA support: web manifest, offline service worker, installable icons.

## v8 — Chapters 16–20 (review capstones)
- Incident response, performance tuning, accounts & onboarding, backup/recovery,
  and a graduation exam spanning every earlier chapter.
- New commands: uptime, free, renice, useradd/userdel, ssh-keygen, sha256sum/
  md5sum, diff.

## v7 — the `check` command + fixes
- `check` tells you why a ticket hasn't advanced, and can inspect a file/service.
- Fixed the "make it executable" check to accept any script you run.

## v6 — Chapters 11–15
- Shell scripting (with a small interpreter), systemd units & timers, log
  analysis & logrotate, containers (docker), and a git deploy.

## v5 — Chapters 7–10
- Storage & mounts, archives & backups (tar/gzip), package management (apt/dpkg),
  hardening & handover.

## v4 — Chapters 5–6
- Processes & scheduling, networking.

## v3 — Chapter 4
- Users & permissions.

## v1 — Chapters 1–3
- Navigation, file management, text processing. The original prototype.
