# The Last Sysadmin

A story-driven game that teaches **Linux administration** in a simulated terminal — from `whoami` to provisioning a whole service from scratch. You're the new admin at a failing freight company; the server crashed at 3am, the previous admin vanished, and you fix it one ticket at a time while uncovering what happened.

**35 chapters · 183 missions · ~140 commands · one self-contained HTML file. No install, no server, no network required.**

> ### ▶ [Play now](https://eriakort.github.io/the-last-sysadmin/)
> **<https://eriakort.github.io/the-last-sysadmin/>** — live once GitHub Pages is enabled (see below).

![chapters 1–35](icon.svg)

## Features

- A working simulated **bash shell**: pipes `|`, redirection `> >> < 2>`, `;` `&&` `||`, globbing `*`, quoting, command substitution `$(...)`, variables, and a small script interpreter (`if` / `for` / `while` / `test` / functions-free).
- ~140 commands with their own `man` pages — navigation, text processing (`grep`/`sed`/`awk`), users & permissions, processes, systemd, networking, storage/LVM, containers, git, and more.
- **Mission checks look at the server's real state**, not the exact command you typed — creative solutions count.
- **Investigation scenarios** (Chapters 31–35): a real senior-admin incident is paged in, you're asked diagnostic questions (`submit` your findings), troubleshoot with the live tools (`df -i`, `lsof +L1`, `du --inodes`, `dmesg`, `iostat`, `w`/`last`, `awk` on `/etc/passwd`), then apply the fix.
- **Optional Speed tracker** — opt in with `tracker on` to time each ticket and keep a performance log (`stats`).
- **Optional accounts** (self-hosted + Supabase) — passwordless magic-link sign-in for cross-device progress sync and an all-time race leaderboard. See [Accounts, progress sync & leaderboard](#accounts-progress-sync--leaderboard-optional-supabase). Entirely optional; the game plays fully signed-out.
- **Race mode** — two or more players pick one of the incident scenarios and race live to resolve it first, with a real-time leaderboard. Works out of the box on the hosted claude.ai version; on a self-hosted copy (like this GitHub Pages site) it runs on a free **Supabase** realtime backend you connect once — see [Race mode on your own site](#race-mode-on-your-own-site-supabase).
- A `check` command that tells you *why* a ticket hasn't advanced, plus three-step hints and a `retry` checkpoint.
- Progress saved in your browser; works fully **offline** (installable as a PWA).
- **Five appearance themes** (🎨 button): Halcyon Dark (default), Amber CRT, Green Phosphor, Nord Night, Paper (light). Your choice is remembered per browser.
- **Pick an avatar** (emoji) shown in the lobby, live race board, leaderboard, and on your account.
- Responsive down to phone width.

## Chapters

| # | Chapter | Topic |
|---|---------|-------|
| 1–3 | First Login · Clean-up Duty · Reading the Logs | navigation, files, text |
| 4–6 | Who Still Has Access? · What Still Runs? · Closing the Door | users/permissions, processes, networking |
| 7–10 | Room to Grow · A Backup That Restores · The Right Tools · Locking the Doors | storage, backups, packages, hardening |
| 11–15 | Shell scripting · systemd · log analysis · containers · git deploy | automation & delivery |
| 16–20 | Incident · Performance · Accounts · Recovery · Graduation | review capstones |
| 21–30 | Regex · DNS · Kernel · Shell · ACLs · LVM · Signals · Observability · Automation · **From Zero** | advanced + provision a service |
| 31–35 | **Incident Files:** Phantom Disk · Inode Exhaustion · Compromise & Privesc · OOM Killer · Ghost Load (I/O wait) | real-world investigation scenarios |

## Run it

It's a single self-contained page — pick whichever is easiest:

- **Locally:** open `index.html` in any modern browser (double-click). Works offline.
- **Served (enables install + offline cache):**
  - `python3 -m http.server 8080` then open <http://localhost:8080/>
  - or `npx serve`
- **Install as an app (PWA):** open the served/Pages URL, then use your browser's **Install app** / **Add to Home Screen**. It launches in its own window and runs offline.

## Deploy on GitHub Pages (automatic)

This repo includes a workflow (`.github/workflows/pages.yml`) that publishes the site on every push to `main`.

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push (or re-run the workflow). Your game is live at `https://eriakort.github.io/the-last-sysadmin/`.

After that, every `git push` updates the live site and the installed app.

## Project layout

```
index.html              the entire game (self-contained)
manifest.webmanifest    PWA metadata (name, icons, colors)
service-worker.js       offline caching
icon.svg / icon-*.png   app icons
.github/workflows/      GitHub Pages deploy
```

## Updating

Edit `index.html`, commit, push — Pages redeploys. If you change cached assets and want installed apps to refresh immediately, bump the cache name in `service-worker.js` (e.g. `last-sysadmin-v11` → `v12`).

## Race mode on your own site (Supabase)

Live racing needs a realtime backend. On **claude.ai** that's built in and nothing is required. On a **self-hosted** copy (GitHub Pages, Netlify, a file on disk, etc.) you connect a free **Supabase** project once; then anyone who opens your page can race.

**One-time setup (about 2 minutes):**

1. Create a free project at <https://supabase.com> (no credit card needed).
2. In the project, open **Project Settings → Data API** (older UIs: **API**). Copy two values:
   - the **Project URL** (e.g. `https://abcdxyz.supabase.co`)
   - the **anon public** key (a long `eyJ…` string — this is a *public* client key, safe to use in a web page).
3. Open your game, click **⚑ Race**, and paste both into the setup dialog → **Connect**. They're saved in your browser. Realtime is on by default and **no database tables are needed** — racing uses Supabase's presence channels only.

That's it — share your page's link, have each player open it, and race. If you'd rather bake the credentials into the page instead of entering them in the dialog, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top of the `<script>` in `index.html`.

> The anon key is public by design. For a casual game the defaults are fine; if you want to lock usage down later, Supabase's Realtime authorization / RLS lets you restrict who may connect.

## Accounts, progress sync & leaderboard (optional, Supabase)

Signing in is **optional** — the game plays fully without it, saving progress in your browser. Adding login (same Supabase project as racing) gives you:

- **Magic-link sign-in** (passwordless email) — public sign-ups, anyone can register.
- **Cross-device progress sync** — your campaign (chapters/XP) follows your account.
- **An all-time race leaderboard** — fastest clean time per scenario.

**Setup:**

1. In your Supabase project, open **SQL Editor → New query**, paste the contents of [`supabase-setup.sql`](supabase-setup.sql), and **Run**. This creates the `profiles`, `progress`, and `race_results` tables with Row Level Security (each user can only write their own rows).
2. **Authentication → URL Configuration:** set **Site URL** to your deployed URL (e.g. `https://eriakort.github.io/the-last-sysadmin/`) and add it under **Redirect URLs** too. Without this, the magic-link email sends people to the wrong place.
3. That's it — open the game, click **Sign in**, enter an email, click the link in your inbox.

**Classroom features (classes, join codes, assignments, rosters):** these need
additional migrations beyond `supabase-setup.sql`. Apply the scripts in
[`supabase/`](supabase/) **in the order given in [`supabase/README.md`](supabase/README.md)**
— `m1-classroom.sql`, then `m2-enrollment.sql`, `m4-enroll-by-email.sql`,
`m6-missions.sql`, `m7-scenarios.sql`. Skipping one leaves its feature broken.
OAuth sign-in (Google / Microsoft / GitHub), if you want it, is enabled under
**Authentication → Providers** — no SQL needed.

**Important — email sending limits:** Supabase's built-in email service is **rate-limited to a few messages per hour** and is meant for testing. For real public sign-ups, add a custom SMTP sender (Resend, SendGrid, Postmark, etc.) under **Authentication → Emails / SMTP** in Supabase. Until you do, only a handful of sign-in emails per hour will go out.

**Security notes:**

- The page uses only the **anon public** key (safe to expose). **Never** put the `service_role` key in the page — it bypasses all security rules.
- Row Level Security keeps each user writing only their own data. Integrity is *casual*: because the browser writes its own rows, stats are self-reported (fine for a learning game; not suitable for grading without server-side validation).
- Signing in stores an email address, so if strangers use your site, add a short privacy note. The game itself sends no other data anywhere.

## Notes & limitations

This is a teaching **simulation**, not a real Linux box. Commands model the common workflows and flags well enough to learn from, but output and behavior won't always match a real system byte-for-byte (e.g. `sha256sum` uses a stand-in hash; `docker`/`git`/`lvm` are simulated against small built-in state). Always verify exact behavior on a real machine. The story, company, people, and IP addresses are fictional (IPs are from ranges reserved for documentation).

## Contributing

Issues and ideas welcome — new chapters, more commands, better hints. The whole game lives in `index.html`.

## License

[MIT](LICENSE).
