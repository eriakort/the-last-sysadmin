# Changelog

All notable changes to The Last Sysadmin. The game is a single `index.html`;
versions below track the content added over time.

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
