# Changelog

All notable changes to The Last Sysadmin. The game is a single `index.html`;
versions below track the content added over time.

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
