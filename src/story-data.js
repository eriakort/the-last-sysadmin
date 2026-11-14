(function (root) {
'use strict';
function create(deps) {
  deps = deps || {};
  const { pad, MON, mulberry32, HOST, splitLines } = deps;
  if (typeof pad !== 'function' || !Array.isArray(MON) || typeof mulberry32 !== 'function' || typeof HOST !== 'string' || typeof splitLines !== 'function') throw new Error('Story data requires pad, MON, mulberry32, HOST and splitLines');
/* ============================================================
   Story data: generated logs (seeded, so every player gets the same files)
   ============================================================ */
const START = Date.UTC(2026, 9, 21, 18, 0, 0);
const CRASH = Date.UTC(2026, 9, 22, 3, 47, 12);
const BAD_IP = '203.0.113.77';
const LAST_TIME = '03:47:12';
const fmtLogTime = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const fmtClf = ms => { const d = new Date(ms); return `${pad(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}:${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`; };

function genAppLog() {
  const r = mulberry32(1022);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const lines = [];
  const L = (ms, lvl, src, msg) => lines.push(`${fmtLogTime(ms)} ${lvl.padEnd(5)} [${src}] ${msg}`);
  let t = START, lastHour = -1;
  L(t, 'INFO', 'main', 'halcyon v2.3.1 starting with 4 workers');
  for (;;) {
    t += ri(120, 420) * 1000;
    if (t > CRASH - 12 * 60 * 1000) break;
    const prog = (t - START) / (CRASH - START);
    const hr = new Date(t).getUTCHours();
    if (hr !== lastHour) { lastHour = hr; L(t, 'INFO', 'export', 'hook ran: /srv/halcyon/export/sync_out.sh (exit 0)'); continue; }
    const x = r(), pErr = 0.05 + prog * 0.16;
    if (x < pErr) {
      if (r() < 0.7) { L(t, 'ERROR', 'worker-' + ri(1, 4), 'crashed: signal 11, core dumped to /tmp'); }
      else L(t, 'ERROR', 'db', 'connection pool exhausted after 30s');
    } else if (x < pErr + 0.13) {
      const k = r();
      if (k < 0.45) L(t, 'WARN', 'main', `disk usage at ${Math.min(99, Math.round(78 + prog * 21))}% on /`);
      else if (k < 0.75) L(t, 'WARN', 'supervisor', `worker-${ri(1, 4)} restarted`);
      else L(t, 'WARN', 'db', `slow query on shipments (${ri(1200, 4800)} ms)`);
    } else {
      const k = r();
      if (k < 0.35) L(t, 'INFO', 'http', `GET /api/shipments 200 in ${ri(18, 140)}ms`);
      else if (k < 0.6) L(t, 'INFO', 'http', `tracking lookup HF-${ri(10000, 99999)} served`);
      else if (k < 0.8) L(t, 'INFO', 'worker-' + ri(1, 4), `shipment sync completed (${ri(40, 600)} records)`);
      else L(t, 'INFO', 'main', 'health check ok');
    }
  }
  L(CRASH - 14000, 'ERROR', 'worker-3', 'could not write core dump: no space left on device');
  L(CRASH, 'ERROR', 'main', 'fatal: no space left on device, shutting down');
  return lines.join('\n') + '\n';
}

function genAccessLog() {
  const r = mulberry32(77);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    'HalcyonPartnerBot/1.4',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  ];
  const normal = [['/',200,5120],['/track?id=HF-',200,2210],['/api/shipments',200,18044],['/static/app.js',200,88213],['/static/app.css',200,14020],['/login',200,3301],['/api/shipments',401,112]];
  const ips = {'198.51.100.23':41,'192.0.2.10':37,'203.0.113.5':29,'198.51.100.41':22,'192.0.2.88':18,'198.51.100.150':12};
  const T = () => START + Math.floor(r() * (CRASH - START - 60000));
  const ent = [];
  for (const [ip, n] of Object.entries(ips)) {
    const ua = pick(UAS);
    for (let i = 0; i < n; i++) {
      let [p, st, sz] = pick(normal);
      if (p.endsWith('HF-')) p += ri(10000, 99999);
      ent.push([T(), `${ip} - - [@] "GET ${p} HTTP/1.1" ${st} ${sz} "-" "${ua}"`]);
    }
  }
  const ua = 'python-requests/2.31.0';
  for (let i = 0; i < 58; i++) ent.push([T(), `${BAD_IP} - - [@] "GET /export/customers.csv HTTP/1.1" 200 4823117 "-" "${ua}"`]);
  for (let i = 0; i < 4; i++) ent.push([T(), `${BAD_IP} - - [@] "GET /export/ HTTP/1.1" 403 162 "-" "${ua}"`]);
  for (let i = 0; i < 2; i++) ent.push([T(), `${BAD_IP} - - [@] "GET /robots.txt HTTP/1.1" 404 162 "-" "${ua}"`]);
  ent.sort((a, b) => a[0] - b[0]);
  return ent.map(([t, s]) => s.replace('[@]', '[' + fmtClf(t) + ']')).join('\n') + '\n';
}

const APPLOG = genAppLog();
const ACCESS = genAccessLog();
const ERR_COUNT = splitLines(APPLOG).filter(l => l.includes('ERROR')).length;
const EVIDENCE = splitLines(ACCESS).filter(l => l.includes(BAD_IP)).join('\n');

const HANDOVER = `To whoever replaces me,

I didn't get to finish. Here's what you need:

- The app lives in /srv/halcyon. Read the README there first.
- Its logs are in /var/log/halcyon.
- The server keeps crashing. I think I know why. But there's
  something else going on too, and nobody wanted to hear it.

I tag my working notes with the word ROOTCAUSE so I can grep
for them later. If you get that far, you'll understand.

Learn to read the logs. They don't lie.

- Dana
`;
const README = `HALCYON FREIGHT - web app
=========================

Layout
  /srv/halcyon/CURRENT       name of the live release
  /srv/halcyon/releases/     one folder per release
      <version>/bin/         the halcyon-worker binary
      <version>/config/      app.conf for that release
  /srv/halcyon/export/       served publicly at https://halcyon.example/export/

Logs
  /var/log/halcyon/app.log      application log
  /var/log/halcyon/access.log   every web request (combined log format)

On call? If the app is down, read the live release's app.conf first.
`;
const CONF231 = `# Halcyon Freight web app - release v2.3.1

[server]
listen     = 0.0.0.0:8080
log_file   = /var/log/halcyon/app.log
access_log = /var/log/halcyon/access.log

[workers]
count      = 4
core_dumps = /tmp        # dana: these are filling the disk!!

[export]
dir  = /srv/halcyon/export                # served publicly at /export/
hook = /srv/halcyon/export/sync_out.sh    # dana: who added this? not in our repo
`;
const CONF220 = `# Halcyon Freight web app - release v2.2.0

[server]
listen     = 0.0.0.0:8080
log_file   = /var/log/halcyon/app.log
access_log = /var/log/halcyon/access.log

[workers]
count      = 2
core_dumps = /var/crash

[export]
dir = /srv/halcyon/export
`;
const SYNC = `#!/bin/bash
# partner feed: refresh the public export every hour
# added 2026-08-02 by jmorrow (contractor)
cp /var/lib/halcyon/customers.db.csv /srv/halcyon/export/customers.csv
chmod 644 /srv/halcyon/export/customers.csv
`;
const CSV = `customer_id,company,contact_email,city
C-10023,Northwind Hauling,ops@northwind.example,Turin
C-10024,Bluegate Imports,desk@bluegate.example,Lyon
C-10025,Aster & Pole,hello@asterpole.example,Graz
... (4.8 MB, 61,204 rows)
`;
const DRAFT = `# ROOTCAUSE - draft, not ready to share

## 1. The crashes
The workers segfault under load and dump a ~2 GB core file into
/tmp every time. Nothing cleans /tmp. When the disk fills up,
the app dies. Fix: move core_dumps off /tmp, add a cleanup job.

## 2. The thing nobody wants to hear
export/sync_out.sh is not in our repo. It was added on 2 August
by jmorrow, a contractor whose contract ended in July.

Every hour it copies our full customer list into the public
export folder, and 203.0.113.77 downloads it. That address is
not one of our partners. I checked every contract.

I told Priya on the 20th. On the 21st my sudo access was gone.

If jmorrow left in July, who is still running that script?
Check who owns what. Check who can still log in.

- D.
`;
const MOTD = `Welcome to halcyon-web01 (Halcyon Freight production)
Authorized use only. All activity is logged.
`;
const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
syslog:x:104:110::/home/syslog:/usr/sbin/nologin
sshd:x:110:65534::/run/sshd:/usr/sbin/nologin
halcyon:x:998:998:Halcyon app:/srv/halcyon:/usr/sbin/nologin
dana:x:1000:1000:Dana Voss:/home/dana:/bin/bash
rookie:x:1001:1001::/home/rookie:/bin/bash
jmorrow:x:1002:1002:J. Morrow (contractor):/home/jmorrow:/bin/bash
`;
const GROUP = `root:x:0:
adm:x:4:syslog
sudo:x:27:jmorrow
shadow:x:42:
halcyon:x:998:
dana:x:1000:
rookie:x:1001:
jmorrow:x:1002:
halcyon-ops:x:1003:dana,rookie,jmorrow
`;
const OSREL = `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
ID=ubuntu
`;
function genAuthLog() {
  const r = mulberry32(4242);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = a => a[Math.floor(r() * a.length)];
  const ev = [];
  const A = (ms, msg) => ev.push([ms, msg]);
  const fp = { dana: 'pQ3vT8xLm2Kd0aZ7rW1nB5yC4eF6gH9jU2sV0iO8tYk', jmorrow: 'Xc7Lw2Qp9Rt4Vb1Nm8Kd3Zs6Hf0Jy5Ga2Ue7Io4Pl1A', rookie: 'Mn4Bv8Cx2Zl6Kj0Hg9Fd3Sa7Qw1Er5Ty8Ui2Op4Lk6J' };
  const ssh = (ms, user, ip, uid) => { const pid = ri(20000, 29999); A(ms, `sshd[${pid}]: Accepted publickey for ${user} from ${ip} port ${ri(40000, 60999)} ssh2: ED25519 SHA256:${fp[user]}`); A(ms + 1000, `sshd[${pid}]: pam_unix(sshd:session): session opened for user ${user}(uid=${uid}) by (uid=0)`); };
  const su = (ms, user, uid, cmd) => { A(ms, `sudo:  ${user} : TTY=pts/${ri(0, 3)} ; PWD=/home/${user} ; USER=root ; COMMAND=${cmd}`); A(ms + 1, `sudo: pam_unix(sudo:session): session opened for user root(uid=0) by ${user}(uid=${uid})`); A(ms + ri(2, 9) * 1000, 'sudo: pam_unix(sudo:session): session closed for user root'); };
  for (let i = 0; i < 46; i++) {
    const ms = Date.UTC(2026, 9, 19, 0, 0) + Math.floor(r() * 6 * 864e5);
    A(ms, `sshd[${ri(20000, 29999)}]: Failed password for invalid user ${pick(['admin', 'test', 'oracle', 'ubuntu', 'pi', 'postgres', 'deploy'])} from ${pick(['203.0.113.9', '203.0.113.140', '192.0.2.55'])} port ${ri(30000, 65000)} ssh2`);
  }
  ssh(Date.UTC(2026, 9, 19, 23, 1, 12), 'jmorrow', '192.0.2.201', 1002);
  su(Date.UTC(2026, 9, 19, 23, 4, 40), 'jmorrow', 1002, '/usr/bin/crontab -l -u halcyon');
  ssh(Date.UTC(2026, 9, 20, 9, 2, 5), 'dana', '10.0.4.31', 1000);
  su(Date.UTC(2026, 9, 20, 9, 10, 2), 'dana', 1000, '/usr/bin/systemctl restart halcyon');
  ssh(Date.UTC(2026, 9, 20, 14, 31, 50), 'dana', '10.0.4.31', 1000);
  su(Date.UTC(2026, 9, 20, 14, 36, 11), 'dana', 1000, '/usr/bin/ls -l /srv/halcyon/export');
  ssh(Date.UTC(2026, 9, 21, 22, 14, 7), 'jmorrow', '198.51.100.200', 1002);
  su(Date.UTC(2026, 9, 21, 22, 16, 40), 'jmorrow', 1002, '/usr/bin/gpasswd -d dana sudo');
  ssh(Date.UTC(2026, 9, 22, 17, 58, 3), 'dana', '10.0.4.31', 1000);
  A(Date.UTC(2026, 9, 22, 17, 59, 21), 'sudo:     dana : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/dana ; USER=root ; COMMAND=/usr/bin/cat /var/log/auth.log');
  ssh(Date.UTC(2026, 9, 25, 8, 52, 40), 'rookie', '10.0.4.57', 1001);
  ev.sort((x, y) => x[0] - y[0]);
  return ev.map(([ms, msg]) => { const d = new Date(ms); return `${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${HOST} ${msg}`; }).join('\n') + '\n';
}
const AUTHLOG = genAuthLog();
const BASH_COUNT = splitLines(PASSWD).filter(l => l.endsWith(':/bin/bash')).length;
const SHADOW = `root:*:20101:0:99999:7:::
daemon:*:20101:0:99999:7:::
www-data:*:20101:0:99999:7:::
syslog:*:20101:0:99999:7:::
sshd:*:20101:0:99999:7:::
halcyon:!:20202:0:99999:7:::
dana:$y$j9T$(hash hidden in this game)$:20348:0:99999:7:::
rookie:$y$j9T$(hash hidden in this game)$:20385:0:99999:7:::
jmorrow:$y$j9T$(hash hidden in this game)$:20301:0:99999:7:::
`;
const SUDOERS = `# /etc/sudoers - edit only with visudo
Defaults  env_reset
Defaults  secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

root    ALL=(ALL:ALL) ALL
%sudo   ALL=(ALL:ALL) ALL
`;
const JM_HISTORY = `ls -la /srv/halcyon/export
sudo crontab -l -u halcyon
nano /srv/halcyon/export/sync_out.sh
chmod +x /srv/halcyon/export/sync_out.sh
sudo gpasswd -d dana sudo
exit
`;
const JM_KEYS = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyForTheGameOnly0000000000000000 jm@laptop
`;
const BASHRC = `# ~/.bashrc
export EDITOR=nano
alias ll='ls -l'
`;
const PROFILE = `# ~/.profile
if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
`;


  return { START, CRASH, BAD_IP, LAST_TIME, APPLOG, ACCESS, ERR_COUNT, EVIDENCE, HANDOVER, README, CONF231, CONF220, SYNC, CSV, DRAFT, MOTD, PASSWD, GROUP, OSREL, AUTHLOG, BASH_COUNT, SHADOW, SUDOERS, JM_HISTORY, JM_KEYS, BASHRC, PROFILE };
}
const api = { create };
root.LSAStoryData = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
