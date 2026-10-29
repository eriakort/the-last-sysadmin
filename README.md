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
- **Race mode** — two or more players pick one of the incident scenarios and race live to resolve it first, with a real-time leaderboard. (Online racing runs through the hosted claude.ai version; the offline/downloaded builds show a notice and otherwise play normally.)
- A `check` command that tells you *why* a ticket hasn't advanced, plus three-step hints and a `retry` checkpoint.
- Progress saved in your browser; works fully **offline** (installable as a PWA).
- Light/dark aware, responsive down to phone width.

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

## Notes & limitations

This is a teaching **simulation**, not a real Linux box. Commands model the common workflows and flags well enough to learn from, but output and behavior won't always match a real system byte-for-byte (e.g. `sha256sum` uses a stand-in hash; `docker`/`git`/`lvm` are simulated against small built-in state). Always verify exact behavior on a real machine. The story, company, people, and IP addresses are fictional (IPs are from ranges reserved for documentation).

## Contributing

Issues and ideas welcome — new chapters, more commands, better hints. The whole game lives in `index.html`.

## License

[MIT](LICENSE).
