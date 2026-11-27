(() => {
'use strict';
try { const _th = localStorage.getItem('lsa-theme'); if (_th) document.documentElement.setAttribute('data-theme', _th); } catch (e) {}
/* ============================================================
   Constants and helpers
   ============================================================ */
const APP_VERSION = '__APP_VERSION__', APP_BUILD = '__APP_BUILD__';
const USER = 'rookie', HOST = 'halcyon-web01', HOME = '/home/rookie';
const KEY = 'last-sysadmin-v1';
const AVATARS = ['👤','🧑‍💻','👩‍💻','🦊','🐧','🐢','🚀','⚡','🔧','🛡️','🎯','🌟'];
function loadAvatar() {
  try { return localStorage.getItem('lsa-avatar') || '👤'; } catch(e) { return '👤'; }
}
function saveAvatar(a) {
  try { localStorage.setItem('lsa-avatar', a); } catch(e) {}
  if (typeof renderAuthBtn === 'function') renderAuthBtn();
}
let rackExpanded = false;

let chipsExpanded = false;
const CHIPS_DEFAULT = 8;
function toggleChips() {
  chipsExpanded = !chipsExpanded;
  const chips = document.getElementById('chips');
  const btn = document.getElementById('btnChipsToggle');
  if (chips) chips.classList.toggle('collapsed', !chipsExpanded);
  if (btn) {
    btn.textContent = chipsExpanded ? 'Show less' : 'Show all';
    btn.setAttribute('aria-expanded', chipsExpanded);
  }
}

function toggleRack() {
  rackExpanded = !rackExpanded;
  const leds = document.getElementById('leds');
  const btn = document.getElementById('btnRackToggle');
  if (leds) {
    leds.classList.toggle('collapsed', !rackExpanded);
    leds.classList.toggle('expanded', rackExpanded);
  }
  if (btn) {
    btn.textContent = rackExpanded ? 'Show current' : 'Show all';
    btn.setAttribute('aria-expanded', rackExpanded);
  }
}

const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const KB = 1024, MB = KB * 1024, GB = MB * 1024;
const $ = s => document.querySelector(s);
document.querySelectorAll('.top-menu button').forEach(button => button.addEventListener('click', () => button.closest('details')?.removeAttribute('open')));
document.querySelectorAll('.top-menu > summary').forEach(summary => summary.addEventListener('click', () => {
  const current = summary.parentElement;
  document.querySelectorAll('.top-menu[open]').forEach(menu => { if (menu !== current) menu.removeAttribute('open'); });
  if (window.matchMedia('(max-width: 700px)').matches) {
    const rect = summary.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 32);
    const preferredLeft = current.id === 'menuProgress' ? rect.right - width : rect.left;
    const left = Math.max(16, Math.min(preferredLeft, window.innerWidth - width - 16));
    current.style.setProperty('--menu-left', left + 'px');
    current.style.setProperty('--menu-top', Math.min(rect.bottom + 7, window.innerHeight - 120) + 'px');
    const panel = current.querySelector('.top-menu-list');
    if (panel) { panel.style.left = left + 'px'; panel.style.right = 'auto'; }
  }
}));
document.addEventListener('click', event => {
  if (event.target.closest('.top-menu')) return;
  document.querySelectorAll('.top-menu[open]').forEach(menu => menu.removeAttribute('open'));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.top-menu[open]').forEach(menu => menu.removeAttribute('open'));
});
const { pad, MON, esc, md, reEsc, splitLines, mulberry32 } = globalThis.LSAHelpers;
const { breToJs, readDelim } = globalThis.LSATextPatternUtils;
const enc = new TextEncoder();
const byteLen = s => enc.encode(s).length;


/* ============================================================
   Story data fixtures
   ============================================================ */
const { START, CRASH, BAD_IP, LAST_TIME, APPLOG, ACCESS, ERR_COUNT, EVIDENCE, HANDOVER, README, CONF231, CONF220, SYNC, CSV, DRAFT, MOTD, PASSWD, GROUP, OSREL, AUTHLOG, BASH_COUNT, SHADOW, SUDOERS, JM_HISTORY, JM_KEYS, BASHRC, PROFILE } = globalThis.LSAStoryData.create({ pad, MON, mulberry32, HOST, splitLines });

/* ============================================================
   Virtual filesystem
   ============================================================ */
const T0 = Date.UTC(2026, 9, 22, 9, 14);
const at = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi);
function D(children = {}, o = {}) { return { type: 'dir', children, owner: o.owner || 'root', group: o.group || o.owner || 'root', mode: o.mode ?? 0o755, mtime: o.mtime || T0 }; }
function F(content = '', o = {}) { const n = { type: 'file', content, owner: o.owner || 'root', group: o.group || o.owner || 'root', mode: o.mode ?? 0o644, mtime: o.mtime || T0 }; if (o.size !== undefined) n.size = o.size; return n; }

function jmHome() {
  return D({
    '.bash_history': F(JM_HISTORY, { owner: 'jmorrow', mode: 0o600, mtime: at(2026, 10, 21, 22, 19) }),
    '.ssh': D({ authorized_keys: F(JM_KEYS, { owner: 'jmorrow', mode: 0o600, mtime: at(2026, 3, 2, 10, 4) }) }, { owner: 'jmorrow', mode: 0o700, mtime: at(2026, 3, 2, 10, 4) })
  }, { owner: 'jmorrow', mode: 0o750, mtime: at(2026, 10, 21, 22, 19) });
}
const GAME_CMDS = ['hint', 'submit', 'retry', 'mission', 'help', 'check', 'stats', 'tracker', 'repair'];
function buildFS() {
  const bins = {};
  for (const c of Object.keys(CMDS).filter(c => !GAME_CMDS.includes(c))) {
    const suid = (c === 'passwd' || c === 'sudo' || c === 'mount' || c === 'su');
    bins[c] = F('(binary file: not readable as text)\n', { mode: suid ? 0o4755 : 0o755, size: 30000 + (c.length * 7919 + c.charCodeAt(0) * 131) % 120000, mtime: at(2026, 4, 8, 12, 0) });
  }
  const core = (sz, t) => F('(binary core dump: not readable as text)\n', { owner: 'halcyon', mode: 0o600, size: sz, mtime: t });
  const worker = F('(binary file: not readable as text)\n', { owner: 'halcyon', mode: 0o755, size: 18233344 });
  return D({
    bin: D({ bash: F('(binary file: not readable as text)\n', { mode: 0o755, size: 1446024 }) }),
    dev: D({ null: F('', { mode: 0o666 }) }),
    etc: D({
      group: F(GROUP), hostname: F(HOST + '\n'),
      hosts: F('127.0.0.1    localhost\n127.0.1.1    halcyon-web01\n10.0.4.20    halcyon-db01\n'),
      motd: F(MOTD), 'os-release': F(OSREL), passwd: F(PASSWD),
      'sysctl.conf': F('# /etc/sysctl.conf - kernel parameters set at boot\n\n#net.ipv4.ip_forward=1\n'),
      shadow: F(SHADOW, { mode: 0o640, group: 'shadow' }),
      sudoers: F(SUDOERS, { mode: 0o440 }),
      fstab: F(FSTAB),
      ssh: D({ sshd_config: F(SSHD, { mode: 0o644 }) }),
      systemd: D({ system: D({}) }),
      'logrotate.d': D({}),
      'cron.d': D({})
    }),
    mnt: D({}),
    home: D({
      rookie: D({
        '.handover.txt': F(HANDOVER, { owner: 'dana', mtime: at(2026, 10, 22, 17, 58) }),
        '.bashrc': F(BASHRC, { owner: USER, mtime: at(2026, 10, 24, 16, 2) }),
        '.profile': F(PROFILE, { owner: USER, mtime: at(2026, 10, 24, 16, 2) }),
        'halcyon-app': D({
          '.git': D({ HEAD: F('ref: refs/heads/main\n', { owner: USER }) }, { owner: USER }),
          'README.md': F('# halcyon-web\n\nThe Halcyon Freight web application.\n', { owner: USER, mtime: at(2026, 10, 27, 8, 30) }),
          'DEPLOY_NOTES.md': F('Deploy: update /srv/halcyon/CURRENT and restart the service.\n', { owner: USER, mtime: at(2026, 10, 27, 8, 45) }),
          src: D({ 'app.conf': F(CONF231, { owner: USER, mtime: at(2026, 10, 27, 8, 45) }) }, { owner: USER })
        }, { owner: USER, mtime: at(2026, 10, 27, 8, 45) })
      }, { owner: USER, mtime: at(2026, 10, 24, 16, 2) }),
      dana: D({}, { owner: 'dana', mode: 0o700, mtime: at(2026, 10, 22, 17, 59) }),
      jmorrow: jmHome()
    }),
    root: D({}, { mode: 0o700 }),
    srv: D({
      halcyon: D({
        CURRENT: F('v2.3.1\n', { owner: 'halcyon', mtime: at(2026, 10, 9, 14, 30) }),
        README: F(README, { owner: 'halcyon', mtime: at(2026, 6, 3, 10, 12) }),
        export: D({
          'customers.csv': F(CSV, { owner: 'halcyon', size: 4823117, mtime: at(2026, 10, 22, 3, 0) }),
          'sync_out.sh': F(SYNC, { owner: 'jmorrow', group: 'halcyon-ops', mode: 0o755, mtime: at(2026, 8, 2, 23, 38) })
        }, { owner: 'halcyon', group: 'halcyon-ops', mode: 0o775 }),
        releases: D({
          'v2.2.0': D({ bin: D({ 'halcyon-worker': worker }), config: D({ 'app.conf': F(CONF220, { owner: 'halcyon', mtime: at(2026, 7, 14, 9, 5) }) }) }, { owner: 'halcyon', mtime: at(2026, 7, 14, 9, 5) }),
          'v2.3.1': D({
            '.dana': D({ 'draft-report.md': F(DRAFT, { owner: 'dana', mtime: at(2026, 10, 22, 17, 40) }) }, { owner: 'dana', mtime: at(2026, 10, 22, 17, 40) }),
            bin: D({ 'halcyon-worker': JSON.parse(JSON.stringify(worker)) }),
            config: D({ 'app.conf': F(CONF231, { owner: 'halcyon', mtime: at(2026, 10, 21, 16, 11) }) })
          }, { owner: 'halcyon', mtime: at(2026, 10, 9, 14, 30) }),
          'v2.4.0': D({ bin: D({ 'halcyon-worker': JSON.parse(JSON.stringify(worker)) }), config: D({ 'app.conf': F(CONF231.replace('v2.3.1', 'v2.4.0'), { owner: 'halcyon', mtime: at(2026, 10, 27, 8, 0) }) }) }, { owner: 'halcyon', mtime: at(2026, 10, 27, 8, 0) })
        }, { owner: 'halcyon', group: 'halcyon-ops', mode: 0o775 })
      }, { owner: 'halcyon', group: 'halcyon-ops', mode: 0o775 })
    }),
    tmp: D({
      'session.lock': F('pid=18110\n', { owner: 'halcyon', mtime: at(2026, 10, 21, 18, 0) }),
      'halcyon-worker.18231.core': core(Math.round(2.1 * GB), at(2026, 10, 21, 23, 12)),
      'halcyon-worker.19004.core': core(Math.round(2.0 * GB), at(2026, 10, 22, 2, 51)),
      build: D({
        'notes-on-core-dumps.txt': F('Core dumps can be opened with gdb to see why a program crashed.\nDo not delete this file, it is linked from the wiki. - D.\n', { owner: 'dana', mtime: at(2026, 9, 30, 11, 0) }),
        cache: D({
          'deps.tar': F('(binary archive: not readable as text)\n', { owner: 'halcyon', size: 48 * MB, mtime: at(2026, 10, 9, 14, 29) }),
          'halcyon-worker.18802.core': core(Math.round(1.9 * GB), at(2026, 10, 22, 1, 7))
        }, { owner: 'halcyon', mode: 0o777 })
      }, { owner: 'halcyon', mode: 0o777 })
    }, { mode: 0o1777, mtime: at(2026, 10, 22, 2, 51) }),
    usr: D({ bin: D(bins), share: D({}) }),
    var: D({
      lib: D({ halcyon: D({}, { owner: 'halcyon', mode: 0o750 }), php: D({ sessions: phpSessions() }) }),
      log: D({
        'syslog.1': F('Oct 23 03:12:44 halcyon-web01 systemd[1]: Started daily apt upgrade and clean activities.\nOct 23 06:25:01 halcyon-web01 CRON[20233]: (root) CMD (test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily)\n', { owner: 'syslog', group: 'adm', mode: 0o640, mtime: at(2026, 10, 23, 23, 59) }),
        'auth.log': F(AUTHLOG, { owner: 'syslog', group: 'adm', mode: 0o640, mtime: at(2026, 10, 25, 8, 52) }),
        syslog: F('', { owner: 'syslog', group: 'adm', mode: 0o640, size: 884213, mtime: at(2026, 10, 25, 8, 52) }),
        halcyon: D({
          'access.log': F(ACCESS, { owner: 'halcyon', mtime: CRASH - 60000 }),
          'app.log': F(APPLOG, { owner: 'halcyon', mtime: CRASH })
        }, { owner: 'halcyon' })
      })
    })
  });
}

/* ============================================================
   Game state
   ============================================================ */
let S = {};
const FSTAB = `# /etc/fstab: static file system information.
# <file system>   <mount point>   <type>  <options>        <dump>  <pass>
UUID=7c3f-root    /               ext4    errors=remount-ro  0       1
UUID=2a9e-boot    /boot           ext4    defaults           0       2
`;
const SSHD = `# /etc/ssh/sshd_config  (trimmed for the game)
Port 22
#PermitRootLogin prohibit-password
#PasswordAuthentication yes
PubkeyAuthentication yes
X11Forwarding no
PrintMotd no
`;
function initDisks() {
  return [
    { name: 'vda', size: '25G', type: 'disk', children: [
      { name: 'vda1', size: '24G', type: 'part', fstype: 'ext4', mp: '/' },
      { name: 'vda2', size: '1G', type: 'part', fstype: 'ext4', mp: '/boot' }
    ] },
    { name: 'vdb', size: '20G', type: 'disk', children: [
      { name: 'vdb1', size: '20G', type: 'part', fstype: 'ext4', mp: '' }
    ] },
    { name: 'vdc', size: '20G', type: 'disk', children: [] }
  ];
}
function phpSessions() {
  const c = {}; const old = at(2026, 9, 20, 2, 0);
  for (let i = 0; i < 8; i++) c['sess_' + simpleHash('s' + i, 26)] = F('session|a:0:{}', { owner: 'www-data', mtime: old });
  return D(c, { owner: 'www-data', mode: 0o733 });
}
function initSysctl() { return { 'net.ipv4.ip_forward': '0', 'kernel.hostname': 'halcyon-web01', 'vm.swappiness': '60', 'net.ipv4.conf.all.rp_filter': '2', 'kernel.pid_max': '4194304', 'fs.file-max': '9223372036854775807' }; }
function initLvm() { return { pvs: [], vgs: [], lvs: [] }; }
function initDns() { return { 'halcyon.example': '198.51.100.10', 'www.halcyon.example': '198.51.100.10', 'halcyon-db01': '10.0.4.20', 'halcyon-web01': '10.0.4.12', 'halcyon-cache01': '10.0.4.25', 'archive.ubuntu.com': '91.189.91.81' }; }
function initAliases() { return {}; }
function initMounts() {
  return [
    { dev: '/dev/vda1', mp: '/', fstype: 'ext4', size: 25 * GB },
    { dev: '/dev/vda2', mp: '/boot', fstype: 'ext4', size: 1 * GB }
  ];
}
function initPackages() {
  return {
    installed: {
      'openssh-server': '1:9.6p1-3', 'cron': '3.0pl1-184', 'rsyslog': '8.2312.0-3',
      'coreutils': '9.4-3', 'bash': '5.2.21-2', 'ufw': '0.36.2-6', 'tar': '1.35+dfsg-3'
    },
    available: { 'fail2ban': '1.0.2-3', 'htop': '3.3.0-3', 'tree': '2.1.1-2', 'ncdu': '1.19-1' }
  };
}
function initImages() { return [{ repo: 'halcyon/web', tag: '2.4.0', id: 'a1b2c3d4e5f6', size: '142MB' }]; }
function initContainers() { return [{ id: '9f8e7d6c5b4a0011223344556677889900aabbccddeeff00112233445566778899', name: 'halcyon-web-old', image: 'halcyon/web:2.3.1', cmd: 'halcyon-worker', status: 'running', hostport: '8081', ports: '0.0.0.0:8081->8080/tcp', logs: 'halcyon-worker 2.3.1: listening on 0.0.0.0:8080\n' }]; }
function initRepo() { return { dir: '/home/rookie/halcyon-app', branch: 'main', branches: ['main'], staged: [], unstaged: ['src/app.conf'], untracked: ['DEPLOY_NOTES.md'], tags: [], commits: [{ hash: 'c3a19f2', msg: 'Raise worker count for peak season' }, { hash: '7b2e0a1', msg: 'Fix customer export permissions' }, { hash: '1049dcf', msg: 'Initial import of halcyon-web' }] }; }
function initProcs() {
  return [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.4, vsz: 168300, rss: 12840, tty: '?', stat: 'Ss', start: '08:21', time: '0:03', cmd: '/sbin/init' },
    { pid: 540, user: 'root', cpu: 0.0, mem: 0.2, vsz: 15852, rss: 9600, tty: '?', stat: 'Ss', start: '08:21', time: '0:00', cmd: '/usr/sbin/sshd -D' },
    { pid: 601, user: 'root', cpu: 0.0, mem: 0.1, vsz: 8372, rss: 4210, tty: '?', stat: 'Ss', start: '08:21', time: '0:00', cmd: '/usr/sbin/cron -f' },
    { pid: 712, user: 'syslog', cpu: 0.0, mem: 0.2, vsz: 224100, rss: 8900, tty: '?', stat: 'Ssl', start: '08:21', time: '0:01', cmd: '/usr/sbin/rsyslogd -n -iNONE' },
    { pid: 812, user: 'halcyon', cpu: 1.3, mem: 4.1, vsz: 982330, rss: 168220, tty: '?', stat: 'Ssl', start: '08:30', time: '0:21', cmd: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --master' },
    { pid: 813, user: 'halcyon', cpu: 0.7, mem: 3.2, vsz: 712440, rss: 131010, tty: '?', stat: 'Sl', start: '08:30', time: '0:09', cmd: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --worker' },
    { pid: 814, user: 'halcyon', cpu: 0.6, mem: 3.1, vsz: 712440, rss: 129880, tty: '?', stat: 'Sl', start: '08:30', time: '0:08', cmd: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --worker' },
    { pid: 815, user: 'halcyon', cpu: 0.6, mem: 3.0, vsz: 711220, rss: 127640, tty: '?', stat: 'Sl', start: '08:30', time: '0:08', cmd: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --worker' },
    { pid: 816, user: 'halcyon', cpu: 0.5, mem: 3.0, vsz: 711220, rss: 126010, tty: '?', stat: 'Sl', start: '08:30', time: '0:07', cmd: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --worker' },
    { pid: 1455, user: 'rookie', cpu: 0.0, mem: 0.1, vsz: 9200, rss: 5100, tty: 'pts/0', stat: 'Ss', start: '08:52', time: '0:00', cmd: '-bash' },
    { pid: 2447, user: 'halcyon', cpu: 96.4, mem: 0.3, vsz: 12900, rss: 6600, tty: '?', stat: 'R', start: 'Oct22', time: '147:22', cmd: '/bin/bash /srv/halcyon/export/sync_out.sh' }
  ];
}
function initServices() {
  return {
    halcyon: { unit: 'halcyon.service', desc: 'Halcyon Freight web app', active: true, enabled: false, mainpid: 812, since: 'Mon 2026-10-26 08:30:14 UTC', exec: '/srv/halcyon/releases/v2.3.1/bin/halcyon-worker --master' },
    ssh: { unit: 'ssh.service', desc: 'OpenBSD Secure Shell server', active: true, enabled: true, mainpid: 540, since: 'Mon 2026-10-26 08:21:02 UTC', exec: '/usr/sbin/sshd -D' },
    cron: { unit: 'cron.service', desc: 'Regular background program processing daemon', active: true, enabled: true, mainpid: 601, since: 'Mon 2026-10-26 08:21:02 UTC', exec: '/usr/sbin/cron -f' }
  };
}
function initCrontabs() {
  return { halcyon: '# m h  dom mon dow   command\n# added 2026-08-02 by jmorrow (contractor)\n0 * * * * /bin/bash /srv/halcyon/export/sync_out.sh >/dev/null 2>&1\n' };
}
function initNet() {
  return {
    listen: [
      { laddr: '0.0.0.0', lport: 22, proc: 'sshd', pid: 540 },
      { laddr: '0.0.0.0', lport: 8080, proc: 'halcyon-worker', pid: 812 },
      { laddr: '127.0.0.1', lport: 5432, proc: 'postgres', pid: 760 }
    ],
    estab: [
      { laddr: '10.0.4.12', lport: 22, raddr: '10.0.4.57', rport: 50122, proc: 'sshd', pid: 540 },
      { laddr: '10.0.4.12', lport: 8080, raddr: '203.0.113.77', rport: 51834, proc: 'halcyon-worker', pid: 812 },
      { laddr: '10.0.4.12', lport: 55012, raddr: '10.0.4.20', rport: 5432, proc: 'halcyon-worker', pid: 812 }
    ],
    ifaces: [
      { name: 'lo', ipv4: '127.0.0.1', cidr: 8, mac: '00:00:00:00:00:00', state: 'UNKNOWN', flags: 'LOOPBACK,UP,LOWER_UP' },
      { name: 'eth0', ipv4: '10.0.4.12', cidr: 24, mac: '52:54:00:a1:4f:9c', state: 'UP', flags: 'BROADCAST,MULTICAST,UP,LOWER_UP' }
    ],
    gw: '10.0.4.1'
  };
}
function initJournal() {
  return { halcyon: [
    'Oct 26 08:30:14 halcyon-web01 systemd[1]: Started halcyon.service - Halcyon Freight web app.',
    'Oct 26 08:30:15 halcyon-web01 halcyon-worker[812]: listening on 0.0.0.0:8080',
    'Oct 26 09:00:01 halcyon-web01 halcyon-worker[812]: running export hook /srv/halcyon/export/sync_out.sh',
    'Oct 26 09:00:01 halcyon-web01 halcyon-worker[812]: export hook failed: /bin/bash: /srv/halcyon/export/sync_out.sh: Permission denied',
    'Oct 26 10:00:01 halcyon-web01 halcyon-worker[812]: running export hook /srv/halcyon/export/sync_out.sh',
    'Oct 26 10:00:01 halcyon-web01 halcyon-worker[812]: export hook failed: /bin/bash: /srv/halcyon/export/sync_out.sh: Permission denied'
  ] };
}
function reviveProc(name) {
  const s = SERVICE(name);
  return { pid: s.mainpid, user: name === 'halcyon' ? 'halcyon' : 'root', cpu: 1.0, mem: 3.0, vsz: 900000, rss: 150000, tty: '?', stat: 'Ssl', start: '09:15', time: '0:00', cmd: s.exec };
}
function freshState() {
  return { v: 1, mig: 8, sudo: false, vars: {}, units: {}, daemonReloaded: false, images: initImages(), containers: initContainers(), repo: initRepo(), procs: initProcs(), disks: initDisks(), mounts: initMounts(), packages: initPackages(), aptUpdated: false, services: initServices(), crontabs: initCrontabs(), firewall: { active: false, rules: [] }, net: initNet(), journal: initJournal(), curledLocal: false, tracker: false, times: [], missionStart: null, held: 0, heldPid: null, inodeBad: false, oom: null, iowait: false, compromise: false, intruderIp: INTRUDER_IP, sysctl: initSysctl(), lvm: initLvm(), dns: initDns(), aliases: initAliases(), umask: 18, fs: buildFS(), cwd: HOME, oldpwd: HOME, mission: 0, xp: 0, hints: {}, done: [], learned: [], history: [], readM: [], cmdsM: [], nudged: [], checkpoint: null, finished: false, lastStatus: 0, commandSkills: [] };
}
function migrate() {
  S.commandSkills = Array.isArray(S.commandSkills) ? S.commandSkills.filter(name => Object.prototype.hasOwnProperty.call(COMMAND_DRILLS, name)) : [];
  if ((S.mig || 1) < 2) {
  const put = (path, content) => { const n = getNode(path); if (n && n.type === 'file') { n.content = content; delete n.size; } };
  put('/var/log/auth.log', AUTHLOG); put('/etc/shadow', SHADOW); put('/etc/group', GROUP);
  const etc = getNode('/etc'); if (etc && !etc.children.sudoers) etc.children.sudoers = F(SUDOERS, { mode: 0o440 });
  const home = getNode('/home'); if (home) home.children.jmorrow = jmHome();
  S.mig = 2; S.sudo = false;
  }
  if ((S.mig || 1) < 3) {
    const f = freshState();
    S.procs = f.procs; S.services = f.services; S.crontabs = f.crontabs;
    S.firewall = f.firewall; S.net = f.net; S.journal = f.journal; S.curledLocal = false;
    S.mig = 3;
  }
  if ((S.mig || 1) < 4) {
    const f = freshState();
    S.disks = f.disks; S.mounts = f.mounts; S.packages = f.packages; S.aptUpdated = false;
    const etc = getNode('/etc');
    if (etc && !etc.children.fstab) etc.children.fstab = F(FSTAB);
    if (etc && !etc.children.ssh) etc.children.ssh = D({ sshd_config: F(SSHD, { mode: 0o644 }) });
    if (!getNode('/mnt')) S.fs.children.mnt = D({});
    const vlog = getNode('/var/log');
    if (vlog && !vlog.children['syslog.1']) vlog.children['syslog.1'] = F('Oct 23 03:12:44 halcyon-web01 systemd[1]: Started daily apt upgrade and clean activities.\n', { owner: 'syslog', group: 'adm', mode: 0o640 });
    S.mig = 4;
  }
  if ((S.mig || 1) < 5) {
    S.vars = S.vars || {}; S.units = S.units || {}; S.daemonReloaded = false;
    const etc = getNode('/etc');
    if (etc && !etc.children.systemd) etc.children.systemd = D({ system: D({}) });
    S.mig = 5;
  }
  if ((S.mig || 1) < 6) {
    const f = freshState();
    S.images = f.images; S.containers = f.containers; S.repo = f.repo;
    const etc = getNode('/etc');
    if (etc && !etc.children['logrotate.d']) etc.children['logrotate.d'] = D({});
    const rel = getNode('/srv/halcyon/releases');
    if (rel && !rel.children['v2.4.0']) rel.children['v2.4.0'] = D({ bin: D({}), config: D({ 'app.conf': F(CONF231.replace('v2.3.1', 'v2.4.0'), { owner: 'halcyon' }) }) }, { owner: 'halcyon' });
    const home = getNode('/home/rookie');
    if (home && !home.children['halcyon-app']) home.children['halcyon-app'] = D({ '.git': D({ HEAD: F('ref: refs/heads/main\n', { owner: USER }) }, { owner: USER }), 'README.md': F('# halcyon-web\n', { owner: USER }), 'DEPLOY_NOTES.md': F('Deploy notes.\n', { owner: USER }), src: D({ 'app.conf': F(CONF231, { owner: USER }) }, { owner: USER }) }, { owner: USER });
    S.mig = 6;
  }
  if ((S.mig || 1) < 7) {
    const f = freshState();
    S.sysctl = f.sysctl; S.lvm = f.lvm; S.dns = f.dns; S.aliases = {}; S.umask = 18;
    const etc = getNode('/etc');
    if (etc && !etc.children['sysctl.conf']) etc.children['sysctl.conf'] = F('# /etc/sysctl.conf\n');
    if (!S.disks.find(d => d.name === 'vdc')) S.disks.push({ name: 'vdc', size: '20G', type: 'disk', children: [] });
    const ub = getNode('/usr/bin');
    if (ub) for (const c of ['passwd', 'sudo', 'mount']) if (ub.children[c]) ub.children[c].mode = 0o4755;
    S.mig = 7;
  }
  if ((S.mig || 1) < 8) {
    S.held = 0; S.heldPid = null; S.inodeBad = false; S.oom = null; S.iowait = false; S.compromise = false; S.intruderIp = INTRUDER_IP;
    const etc = getNode('/etc'); if (etc && !etc.children['cron.d']) etc.children['cron.d'] = D({});
    const lib = getNode('/var/lib'); if (lib && !lib.children.php) lib.children.php = D({ sessions: phpSessions() });
    S.mig = 8;
  }
}
function save() { if (typeof RACE !== 'undefined' && RACE.active) return; if (typeof PRACTICE !== 'undefined' && PRACTICE.active) return; S.syncUpdatedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: progress lasts for this visit only */ } if (typeof syncPushSoon === 'function') syncPushSoon(); }
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 1 && s.fs) { S = s; migrate(); return true; } } } catch (e) { /* ignore */ }
  S = freshState(); return false;
}

/* ---------- paths and lookups ---------- */
const norm = (path, cwd) => globalThis.LSAHelpers.norm(path, cwd, HOME);
const { parentOf, baseName, joinAbs } = globalThis.LSAPathUtils;
function getNode(abs) { return globalThis.LSAFileSystem.walk(S.fs, abs); }
let RUNAS = USER;
let grpCache = { src: null, list: [] };
function groupsOf(user) {
  const src = getNode('/etc/group')?.content || '';
  const pw = splitLines(getNode('/etc/passwd')?.content || '').map(l => l.split(':')).find(f => f[0] === user);
  const out = [];
  const lines = splitLines(src).map(l => l.split(':'));
  if (pw) { const g = lines.find(f => f[2] === pw[3]); if (g) out.push(g[0]); }
  for (const f of lines) if ((f[3] || '').split(',').includes(user) && !out.includes(f[0])) out.push(f[0]);
  return out;
}
function myGroups() {
  const src = getNode('/etc/group')?.content || '';
  if (grpCache.src !== src) grpCache = { src, list: groupsOf(USER) };
  return grpCache.list;
}
const permissionUtils = globalThis.LSAPermissionUtils;
const canRead = n => permissionUtils.hasBit(n, 4, RUNAS, USER, myGroups());
const canEnter = n => permissionUtils.hasBit(n, 1, RUNAS, USER, myGroups());
const WRITABLE = [HOME, '/tmp', '/srv/halcyon'];
const canWrite = abs => permissionUtils.canWrite(abs, RUNAS, WRITABLE);
function lookup(path) {
  const abs = norm(path, S.cwd);
  if (abs === '/') return { abs, node: S.fs };
  let n = S.fs;
  for (const p of abs.split('/').slice(1)) {
    if (n.type !== 'dir') return { abs, err: 'Not a directory' };
    if (!canEnter(n)) return { abs, err: 'Permission denied' };
    const c = n.children[p];
    if (!c) return { abs, err: 'No such file or directory' };
    n = c;
  }
  return { abs, node: n };
}
function writeFile(abs, content, append) {
  if (abs === '/dev/null') return null;
  const P = lookup(parentOf(abs));
  if (P.err) return P.err;
  if (P.node.type !== 'dir') return 'Not a directory';
  const ex = P.node.children[baseName(abs)];
  if (ex && ex.type === 'dir') return 'Is a directory';
  if (!canWrite(abs)) return 'Permission denied';
  if (ex) { ex.content = append ? ex.content + content : content; delete ex.size; ex.mtime = Date.now(); }
  else P.node.children[baseName(abs)] = F(content, { owner: RUNAS, mtime: Date.now() });
  return null;
}
function place(abs, node) {
  const P = lookup(parentOf(abs));
  if (P.err) return P.err;
  if (P.node.type !== 'dir') return 'Not a directory';
  if (!canWrite(abs)) return 'Permission denied';
  const ex = P.node.children[baseName(abs)];
  if (ex && ex.type === 'dir' && node.type !== 'dir') return 'Is a directory';
  if (ex && ex.type !== 'dir' && node.type === 'dir') return 'Not a directory';
  P.node.children[baseName(abs)] = node;
  return null;
}
function cloneOwned(node) {
  const c = JSON.parse(JSON.stringify(node));
  const fix = n => { n.owner = RUNAS; n.group = RUNAS; n.mtime = Date.now(); if (n.type === 'dir') Object.values(n.children).forEach(fix); };
  fix(c); return c;
}
const sizeOf = n => n.type === 'dir' ? 4096 : (n.size ?? byteLen(n.content));
function treeSize(n) { if (n.type !== 'dir') return sizeOf(n); let s = 4096; for (const c of Object.values(n.children)) s += treeSize(c); return s; }
function walkAll(abs, node, fn) { if (!node) return; fn(abs, node); if (node.type === 'dir') for (const [k, c] of Object.entries(node.children)) walkAll(joinAbs(abs, k), c, fn); }
const { permStr, human, lsDate } = globalThis.LSAHelpers;
const tag = (ctx, s, k) => ctx.tty ? `\u0001${k}${s}\u0001e` : s;
const nameDisp = (ctx, name, node) => !ctx.tty ? name : node.type === 'dir' ? tag(ctx, name, 'd') : (node.mode & 0o111) ? tag(ctx, name, 'x') : name;

/* ============================================================
   Shell: tokenizer, parser, glob expansion, execution
   ============================================================ */
let OUT_CAPTURE = null, ECHO_TAPS = [], POS = [], SCRIPT_DEPTH = 0;
function curPos() { return POS.length ? POS[POS.length - 1] : null; }
function varVal(name) {
  switch (name) {
    case 'HOME': return HOME; case 'USER': return USER; case 'PWD': return S.cwd; case 'OLDPWD': return S.oldpwd;
    case 'HOSTNAME': return HOST; case 'SHELL': return '/bin/bash'; case '?': return String(S.lastStatus || 0);
  }
  if (/^\d+$/.test(name)) { const p = curPos(); if (name === '0') return p ? p.name : 'bash'; return p ? (p.args[+name - 1] ?? '') : ''; }
  if (name === '#') { const p = curPos(); return p ? String(p.args.length) : '0'; }
  if (name === '@' || name === '*') { const p = curPos(); return p ? p.args.join(' ') : ''; }
  if (S.vars && Object.prototype.hasOwnProperty.call(S.vars, name)) return S.vars[name];
  return '';
}
function setVar(str) { const eq = str.indexOf('='); if (eq < 0) return; S.vars = S.vars || {}; S.vars[str.slice(0, eq)] = str.slice(eq + 1); }
function runCapture(src) { const save = OUT_CAPTURE; const box = { v: '' }; OUT_CAPTURE = box; try { runLine(src); } catch (e) { /* ignore */ } finally { OUT_CAPTURE = save; } return box.v.replace(/\n+$/, ''); }
const { escGlob } = globalThis.LSAShellLexer;
const VAR_MARK = /\u0002([^\u0003]*)\u0003/g;
const expandVars = (s, glob) => s.replace(VAR_MARK, (m, n) => glob ? escGlob(varVal(n)) : varVal(n));
const tokenize = line => globalThis.LSAShellLexer.tokenize(line, { runCapture, home: HOME });
const parse = globalThis.LSAShellParser.parse;
const { splitStatements, findCloser, findElse } = globalThis.LSAShellScriptParser;
const { hasGlob, unesc, segRe } = globalThis.LSAGlobPattern;
function globExpand(pat) {
  const isAbs = pat.startsWith('/');
  const segs = pat.split('/'); if (isAbs) segs.shift();
  let paths = [isAbs ? '/' : ''];
  const join = (p, n) => p === '' ? n : p === '/' ? '/' + n : p + '/' + n;
  for (const seg of segs) {
    if (seg === '') continue;
    const next = [];
    for (const p of paths) {
      if (hasGlob(seg)) {
        const L = lookup(p === '' ? '.' : p);
        if (L.err || L.node.type !== 'dir' || !canRead(L.node)) continue;
        const re = segRe(seg);
        for (const name of Object.keys(L.node.children).sort()) {
          if (name.startsWith('.') && !seg.startsWith('.')) continue;
          if (re.test(name)) next.push(join(p, name));
        }
      } else next.push(join(p, unesc(seg)));
    }
    paths = next;
  }
  return paths.filter(p => !lookup(p).err);
}
function expandWords(words) {
  const out = [];
  for (const w0 of words) {
    const w = { ...w0, v: expandVars(w0.v), pat: expandVars(w0.pat, true) };
    if (w.glob) { const m = globExpand(w.pat); if (m.length) { out.push(...m); continue; } }
    if (!w.quoted && w.v === '') continue;
    out.push(w.v);
  }
  return out;
}

let clearRequested = false;
function runLine(line) {
  clearMistakeCoach();
  let seq;
  try { seq = parse(tokenize(line)); } catch (e) { emit('bash: ' + e.message + '\n', 'err'); S.lastStatus = 2; return; }
  let status = S.lastStatus || 0;
  for (let k = 0; k < seq.length; k++) {
    const prevOp = k > 0 ? seq[k - 1].op : null;
    if (prevOp === '&&' && status !== 0) continue;
    if (prevOp === '||' && status === 0) continue;
    status = runPipeline(seq[k].pipe);
    S.lastStatus = status;
  }
  S.lastStatus = status;
}
function runPipeline(cmds) {
  let input = null, status = 0;
  for (let j = 0; j < cmds.length; j++) {
    const c = cmds[j], last = j === cmds.length - 1;
    const argv = expandWords(c.words);
    let out = '', errs = '';
    const ctx = { stdin: j > 0 ? input : null, out: s => { out += s; }, err: s => { errs += s; }, tty: false };
    let rOut = null, rErr = null, errToOut = false, bad = false;
    for (const r0 of c.redir) {
      const r = r0.target === undefined ? r0 : { ...r0, target: expandVars(r0.target) };
      if (r.op === '<') {
        const L = lookup(r.target);
        if (L.err || L.node.type !== 'file' || !canRead(L.node)) { emit(`bash: ${r.target}: ${L.err || (L.node.type !== 'file' ? 'Is a directory' : 'Permission denied')}\n`, 'err'); bad = true; }
        else ctx.stdin = L.node.content;
      } else if (r.op === '>' || r.op === '>>') rOut = r;
      else if (r.op === '2>' || r.op === '2>>') rErr = r;
      else if (r.op === '2>&1') errToOut = true;
    }
    if (bad) { status = 1; input = ''; continue; }
    ctx.tty = last && !rOut;
    let ai = 0; while (ai < argv.length && /^[A-Za-z_]\w*=/.test(argv[ai])) ai++;
    if (ai > 0 && ai === argv.length) { for (let z = 0; z < ai; z++) setVar(argv[z]); status = 0; }
    else if (ai > 0) { const saved = {}; for (let z = 0; z < ai; z++) { const nm = argv[z].slice(0, argv[z].indexOf('=')); saved[nm] = (S.vars && nm in S.vars) ? S.vars[nm] : undefined; setVar(argv[z]); } status = exec(argv.slice(ai), ctx); for (const nm in saved) { if (saved[nm] === undefined) { if (S.vars) delete S.vars[nm]; } else S.vars[nm] = saved[nm]; } }
    else status = argv.length ? exec(argv, ctx) : 0;
    if (errToOut) { out += errs; errs = ''; }
    if (errs) {
      if (rErr) { const e = writeFile(norm(rErr.target, S.cwd), errs, rErr.op === '2>>'); if (e) emit(`bash: ${rErr.target}: ${e}\n`, 'err'); }
      else emit(errs, 'err');
    }
    if (rOut) {
      const e = writeFile(norm(rOut.target, S.cwd), out, rOut.op === '>>');
      if (e) { emit(`bash: ${rOut.target}: ${e}\n`, 'err'); status = 1; }
      input = '';
    } else if (last) emit(out);
    else input = out;
  }
  return status;
}
function runPath(path, args, ctx) {
  const L = lookup(path);
  if (L.err) { ctx.err(`bash: ${path}: ${L.err}\n`); return 127; }
  if (L.node.type === 'dir') { ctx.err(`bash: ${path}: Is a directory\n`); return 126; }
  if (!(L.node.mode & 0o111)) { ctx.err(`bash: ${path}: Permission denied\n`); return 126; }
  if (!canRead(L.node)) { ctx.err(`bash: ${path}: Permission denied\n`); return 126; }
  S.lastScriptRun = L.abs;
  return runScript(L.node.content, args, ctx);
}
function exec(argv, ctx) {
  const name = argv[0];
  if (name.includes('/')) return runPath(name, argv.slice(1), ctx);
  if (!ctx._noalias && S.aliases && S.aliases[name] && !CMDS[name]) {
    try { const words = expandWords(tokenize(S.aliases[name]).filter(t => t.t === 'w')); if (words.length) return exec([...words, ...argv.slice(1)], { ...ctx, _noalias: true }); } catch (e) { /* fall through */ }
  }
  const fn = CMDS[name];
  if (!fn) {
    ctx.err(`${name}: command not found\n`);
    const near = Object.keys(CMDS).find(c => c.toLowerCase() === name.toLowerCase());
    if (near) ctx.err(`(Linux commands are case-sensitive. Did you mean ${near}?)\n`);
    return 127;
  }
  if (!S.cmdsM.includes(name)) S.cmdsM.push(name);
  if (!GAME_CMDS.includes(name) && !S.learned.includes(name)) S.learned.push(name);
  const args = argv.slice(1);
  if (args.includes('--help') && MAN[name]) { ctx.out(renderMan(name)); return 0; }
  updateCommandCoach(name, args);
  try { const r = fn(args, ctx); return typeof r === 'number' ? r : 0; }
  catch (e) { ctx.err(`${name}: ${e.message}\n`); return 1; }
}


/* ---------- script interpreter ---------- */
function expandListWords(str) { return expandWords(tokenize(str).filter(t => t.t === 'w')); }
function execList(stmts, start, end) {
  let i = start, status = 0, m;
  while (i < end) {
    const st = stmts[i];
    if (st === '' || st.startsWith('#') || st === 'do' || st === 'then' || st === 'done' || st === 'fi' || st === 'else') { i++; continue; }
    if ((m = st.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.*)$/))) {
      const varn = m[1]; const words = expandListWords(m[2].replace(/;?\s*do\s*$/, ''));
      let nxt = stmts[i + 1] || '', bodyStart;
      if (nxt === 'do') bodyStart = i + 2; else if (nxt.startsWith('do ')) { stmts[i + 1] = nxt.slice(3); bodyStart = i + 1; } else bodyStart = i + 1;
      const done = findCloser(stmts, i, end); if (done < 0) throw new Error("syntax error: expected `done'");
      S.vars = S.vars || {};
      for (const w of words) { S.vars[varn] = w; const r = execList(stmts, bodyStart, done); if (r.exit) return r; status = r.status; }
      i = done + 1; continue;
    }
    if ((m = st.match(/^while\s+(.*)$/))) {
      const cond = m[1].replace(/;?\s*do\s*$/, '');
      let nxt = stmts[i + 1] || '', bodyStart;
      if (nxt === 'do') bodyStart = i + 2; else if (nxt.startsWith('do ')) { stmts[i + 1] = nxt.slice(3); bodyStart = i + 1; } else bodyStart = i + 1;
      const done = findCloser(stmts, i, end); if (done < 0) throw new Error("syntax error: expected `done'");
      let guard = 0;
      while (true) { runLine(cond); if (S.lastStatus !== 0) break; const r = execList(stmts, bodyStart, done); if (r.exit) return r; status = r.status; if (++guard > 10000) break; }
      i = done + 1; continue;
    }
    if ((m = st.match(/^if\s+(.*)$/))) {
      const cond = m[1].replace(/;?\s*then\s*$/, '');
      let nxt = stmts[i + 1] || '', thenStart;
      if (nxt === 'then') thenStart = i + 2; else if (nxt.startsWith('then ')) { stmts[i + 1] = nxt.slice(5); thenStart = i + 1; } else thenStart = i + 1;
      const fi = findCloser(stmts, i, end); if (fi < 0) throw new Error("syntax error: expected `fi'");
      const el = findElse(stmts, thenStart, fi);
      runLine(cond); const ok = S.lastStatus === 0;
      if (ok) { const r = execList(stmts, thenStart, el >= 0 ? el : fi); if (r.exit) return r; status = r.status; }
      else if (el >= 0) {
        const es = stmts[el];
        if (es.startsWith('elif ')) { stmts[el] = 'if ' + es.slice(5); const r = execList(stmts, el, fi + 1); if (r.exit) return r; status = r.status; i = fi + 1; continue; }
        let bodyS; if (es === 'else') bodyS = el + 1; else if (es.startsWith('else ')) { stmts[el] = es.slice(5); bodyS = el; } else bodyS = el + 1;
        const r = execList(stmts, bodyS, fi); if (r.exit) return r; status = r.status;
      }
      i = fi + 1; continue;
    }
    if ((m = st.match(/^exit(?:\s+(\d+))?$/))) return { exit: true, status: m[1] !== undefined ? +m[1] : status };
    runLine(st); status = S.lastStatus; i++;
  }
  return { exit: false, status };
}
function runScript(content, args, ctx) {
  if (SCRIPT_DEPTH > 25) { ctx.err('bash: maximum script recursion depth exceeded\n'); return 2; }
  SCRIPT_DEPTH++; S.vars = S.vars || {};
  const savedVars = { ...S.vars };
  POS.push({ args: args || [], name: 'script' });
  const tap = { v: '' }; ECHO_TAPS.push(tap);
  let res = { status: 0 };
  try { const stmts = splitStatements(content); res = execList(stmts, 0, stmts.length); }
  catch (e) { ctx.err('bash: ' + e.message + '\n'); res = { status: 2 }; }
  finally { ECHO_TAPS.pop(); POS.pop(); SCRIPT_DEPTH--; S.vars = savedVars; }
  S.lastScriptOut = tap.v;
  return res.status || 0;
}
function testEval(a) {
  const nd = x => getNode(norm(x, S.cwd));
  if (a.length === 0) return 1;
  if (a.length === 1) return a[0] === '' ? 1 : 0;
  if (a.length === 2) {
    const op = a[0], x = a[1];
    if (op === '-n') return x !== '' ? 0 : 1; if (op === '-z') return x === '' ? 0 : 1;
    if (op === '-d') { const n = nd(x); return n && n.type === 'dir' ? 0 : 1; }
    if (op === '-f') { const n = nd(x); return n && n.type === 'file' ? 0 : 1; }
    if (op === '-e' || op === '-r') { return nd(x) ? 0 : 1; }
    if (op === '-x') { const n = nd(x); return n && (n.mode & 0o111) ? 0 : 1; }
    if (op === '!') return testEval([x]) === 0 ? 1 : 0;
    return 2;
  }
  if (a.length === 3) {
    const [x, op, y] = a;
    if (op === '=' || op === '==') return x === y ? 0 : 1; if (op === '!=') return x !== y ? 0 : 1;
    const nx = parseFloat(x), ny = parseFloat(y);
    if (op === '-eq') return nx === ny ? 0 : 1; if (op === '-ne') return nx !== ny ? 0 : 1;
    if (op === '-gt') return nx > ny ? 0 : 1; if (op === '-lt') return nx < ny ? 0 : 1;
    if (op === '-ge') return nx >= ny ? 0 : 1; if (op === '-le') return nx <= ny ? 0 : 1;
    if (x === '!') return testEval([op, y]) === 0 ? 1 : 0;
    return 2;
  }
  return 2;
}
const opts = globalThis.LSACommandOptions.parseOptions;

const READERS = ['cat', 'less', 'more', 'head', 'tail'];
function inputs(files, ctx, name) {
  const res = []; let st = 0;
  if (!files.length) {
    if (ctx.stdin === null) { ctx.err(`${name}: no file given (in this game, give a file name or pipe something in)\n`); return { res, st: 1 }; }
    res.push({ name: '(standard input)', content: ctx.stdin }); return { res, st };
  }
  for (const f of files) {
    if (f === '-') { res.push({ name: '(standard input)', content: ctx.stdin ?? '' }); continue; }
    const L = lookup(f);
    if (L.err) { ctx.err(`${name}: ${f}: ${L.err}\n`); st = 1; continue; }
    if (L.node.type === 'dir') { ctx.err(`${name}: ${f}: Is a directory\n`); st = 1; continue; }
    if (!canRead(L.node)) { ctx.err(`${name}: ${f}: Permission denied\n`); st = 1; continue; }
    if (READERS.includes(name) && !S.readM.includes(L.abs)) S.readM.push(L.abs);
    res.push({ name: f, content: L.node.content, abs: L.abs });
  }
  return { res, st };
}

/* ---------- regex helpers (grep/sed) ---------- */
function buildRe(p, o = {}) {
  let src = o.fixed ? reEsc(p) : o.ere ? p : breToJs(p);
  if (o.word) src = '\\b(?:' + src + ')\\b';
  try { return new RegExp(src, (o.icase ? 'i' : '') + (o.global ? 'g' : '')); }
  catch (e) { throw new Error(`invalid regular expression: ${p}`); }
}

/* ============================================================
   Commands
   ============================================================ */
const CMDS = {};
CMDS.test = (a, ctx) => testEval(a);
CMDS['['] = (a, ctx) => { if (a[a.length - 1] !== ']') { ctx.err("[: missing `]'\n"); return 2; } return testEval(a.slice(0, -1)); };
CMDS.bash = (a, ctx) => {
  if (a[0] === '-c') return runScript(a[1] || '', a.slice(2), ctx);
  const file = a.find(x => !x.startsWith('-'));
  if (!file) { ctx.err('bash: this game runs a script file: bash FILE [args]\n'); return 2; }
  const L = lookup(file);
  if (L.err || L.node.type !== 'file') { ctx.err(`bash: ${file}: ${L.err || 'Is a directory'}\n`); return 127; }
  if (!canRead(L.node)) { ctx.err(`bash: ${file}: Permission denied\n`); return 126; }
  S.lastScriptRun = L.abs;
  return runScript(L.node.content, a.slice(a.indexOf(file) + 1), ctx);
};
CMDS.sh = CMDS.bash; CMDS.source = CMDS.bash; CMDS['.'] = CMDS.bash;
CMDS.export = (a, ctx) => { for (const x of a) if (/^[A-Za-z_]\w*=/.test(x)) setVar(x); return 0; };
CMDS.unset = (a, ctx) => { if (S.vars) for (const x of a) delete S.vars[x]; return 0; };
CMDS.set = (a, ctx) => { if (!a.length) { for (const k of Object.keys(S.vars || {}).sort()) ctx.out(`${k}=${S.vars[k]}\n`); } return 0; };
CMDS.env = CMDS.set;
CMDS.printf = (a, ctx) => {
  let fmt = a[0] || ''; const args = a.slice(1);
  fmt = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  let ai = 0;
  ctx.out(fmt.replace(/%[sd%]/g, sp => sp === '%%' ? '%' : (sp === '%d' ? String(parseInt(args[ai++] || '0', 10) || 0) : (args[ai++] ?? ''))));
  return 0;
};
CMDS.true = CMDS.true || (() => 0); CMDS.false = CMDS.false || (() => 1);


CMDS.pwd = (a, ctx) => { ctx.out(S.cwd + '\n'); };
CMDS.whoami = (a, ctx) => { ctx.out(RUNAS + '\n'); };
const pwEntries = () => splitLines(getNode('/etc/passwd')?.content || '').map(l => l.split(':'));
const grEntries = () => splitLines(getNode('/etc/group')?.content || '').map(l => l.split(':'));
const gidOf = g => grEntries().find(f => f[0] === g)?.[2];
CMDS.id = (a, ctx) => {
  const u = a[0] || RUNAS;
  const pw = pwEntries().find(f => f[0] === u);
  if (!pw) { ctx.err(`id: '${u}': no such user\n`); return 1; }
  const gs = u === 'root' ? ['root'] : groupsOf(u);
  const prim = grEntries().find(f => f[2] === pw[3]);
  ctx.out(`uid=${pw[2]}(${u}) gid=${pw[3]}(${prim ? prim[0] : pw[3]}) groups=${gs.map(g => `${gidOf(g)}(${g})`).join(',')}\n`);
};
CMDS.groups = (a, ctx) => {
  if (!a.length) { ctx.out((RUNAS === 'root' ? ['root'] : groupsOf(USER)).join(' ') + '\n'); return 0; }
  let st = 0;
  for (const u of a) { if (!pwEntries().find(f => f[0] === u)) { ctx.err(`groups: '${u}': no such user\n`); st = 1; continue; } ctx.out(`${u} : ${(u === 'root' ? ['root'] : groupsOf(u)).join(' ')}\n`); }
  return st;
};
CMDS.getent = (a, ctx) => {
  const db = a[0];
  if (db === 'hosts') {
    const q = a[1];
    const rows = splitLines(getNode('/etc/hosts').content).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!q) { for (const r of rows) ctx.out(r + '\n'); return 0; }
    const ip = dnsResolve(q);
    const row = rows.map(l => l.split(/\s+/)).find(f => f[0] === q || f.slice(1).includes(q));
    if (row) { ctx.out(`${row[0]}       ${row.slice(1).join(' ')}\n`); return 0; }
    if (ip) { ctx.out(`${ip}       ${q}\n`); return 0; }
    return 2;
  }
  if (db !== 'passwd' && db !== 'group') { ctx.err(`getent: this game supports the passwd, group and hosts databases\n`); return 1; }
  const lines = splitLines(getNode('/etc/' + db).content);
  const sel = a.length > 1 ? lines.filter(l => a.slice(1).includes(l.split(':')[0])) : lines;
  if (sel.length) ctx.out(sel.join('\n') + '\n');
  return a.length > 1 && !sel.length ? 2 : 0;
};
function editEtc(path, fn) { const n = getNode(path); n.content = splitLines(n.content).map(l => fn(l.split(':')) ?? l).join('\n') + '\n'; n.mtime = Date.now(); }
const needRoot = (ctx, msg) => { if (RUNAS === 'root') return false; ctx.err(msg + '\n'); return true; };
CMDS.usermod = (a, ctx) => {
  if (needRoot(ctx, 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.')) return 1;
  const { f, rest } = opts(a, 'LUa', 'sGg', 'usermod');
  const u = rest[0];
  if (!u) throw new Error('missing user name (usage: usermod [options] LOGIN)');
  if (!pwEntries().find(x => x[0] === u)) { ctx.err(`usermod: user '${u}' does not exist\n`); return 6; }
  if (f.s) editEtc('/etc/passwd', x => x[0] === u ? [...x.slice(0, 6), f.s].join(':') : null);
  if (f.L) { editEtc('/etc/shadow', x => x[0] === u && !x[1].startsWith('!') ? [x[0], '!' + x[1], ...x.slice(2)].join(':') : null); if (u === 'jmorrow') S.pwLocked = true; }
  if (f.U) editEtc('/etc/shadow', x => x[0] === u && x[1].startsWith('!') ? [x[0], x[1].slice(1), ...x.slice(2)].join(':') : null);
  if (f.G) {
    const want = f.G.split(',').filter(Boolean);
    const bad = want.find(g => !gidOf(g)); if (bad) { ctx.err(`usermod: group '${bad}' does not exist\n`); return 6; }
    editEtc('/etc/group', x => { const mem = (x[3] || '').split(',').filter(Boolean); const has = mem.includes(u); const should = want.includes(x[0]); if (should && !has) mem.push(u); else if (!should && has && !f.a) mem.splice(mem.indexOf(u), 1); else return null; return [x[0], x[1], x[2], mem.join(',')].join(':'); });
  }
  if (!f.s && !f.L && !f.U && !f.G) ctx.err('usermod: no changes\n');
};
CMDS.gpasswd = (a, ctx) => {
  if (needRoot(ctx, 'gpasswd: Permission denied.')) return 1;
  const { f, rest } = opts(a, '', 'da', 'gpasswd');
  const user = f.d || f.a, g = rest[0];
  if (!user || !g) throw new Error('usage: gpasswd -a USER GROUP  or  gpasswd -d USER GROUP');
  if (!gidOf(g)) { ctx.err(`gpasswd: group '${g}' does not exist in /etc/group\n`); return 3; }
  if (!pwEntries().find(x => x[0] === user)) { ctx.err(`gpasswd: user '${user}' does not exist\n`); return 3; }
  const mem = (grEntries().find(x => x[0] === g)[3] || '').split(',').filter(Boolean);
  if (f.d) {
    if (!mem.includes(user)) { ctx.err(`gpasswd: user '${user}' is not a member of '${g}'\n`); return 3; }
    ctx.out(`Removing user ${user} from group ${g}\n`);
    editEtc('/etc/group', x => x[0] === g ? [x[0], x[1], x[2], mem.filter(m => m !== user).join(',')].join(':') : null);
  } else {
    ctx.out(`Adding user ${user} to group ${g}\n`);
    if (!mem.includes(user)) editEtc('/etc/group', x => x[0] === g ? [x[0], x[1], x[2], [...mem, user].join(',')].join(':') : null);
  }
};
CMDS.deluser = (a, ctx) => {
  if (needRoot(ctx, 'deluser: Only root may remove a user or group from the system.')) return 1;
  const rest = a.filter(x => !x.startsWith('-'));
  if (rest.length === 2) return CMDS.gpasswd(['-d', rest[0], rest[1]], ctx);
  ctx.err("deluser: In this game, deleting accounts is off: legal may need the account's files as evidence. Lock it down instead.\n");
  return 1;
};
CMDS.passwd = (a, ctx) => {
  const { f, rest } = opts(a, 'lu', '', 'passwd');
  if (!f.l && !f.u) { ctx.err('(This game cannot take password input, so passwd only supports -l and -u.)\n'); return 1; }
  if (needRoot(ctx, `passwd: You may not view or modify password information for ${rest[0] || 'root'}.`)) return 1;
  if (!rest[0]) throw new Error('missing user name');
  return CMDS.usermod([f.l ? '-L' : '-U', rest[0]], ctx);
};
const parseMode = permissionUtils.parseMode;
function walkTargets(ctx, cmd, files, rec, fn) {
  let st = 0;
  for (const t of files) {
    const L = lookup(t);
    if (L.err) { ctx.err(`${cmd}: cannot access '${t}': ${L.err}\n`); st = 1; continue; }
    const go = (disp, node) => { if (fn(disp, node) === false) st = 1; if (rec && node.type === 'dir') for (const k of Object.keys(node.children)) go(disp.replace(/\/$/, '') + '/' + k, node.children[k]); };
    go(t, L.node);
  }
  return st;
}
function splitFlags(a, allowed) {
  const fl = {}, rest = [];
  for (const x of a) { if (new RegExp('^-[' + allowed + ']+$').test(x)) for (const c of x.slice(1)) fl[c] = true; else rest.push(x); }
  return { fl, rest };
}
CMDS.chmod = (a, ctx) => {
  const { fl, rest } = splitFlags(a, 'Rv');
  if (rest.length < 2) throw new Error(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand');
  const spec = rest.shift();
  if (parseMode(spec, 0, false) === null) throw new Error(`invalid mode: '${spec}'`);
  return walkTargets(ctx, 'chmod', rest, fl.R, (disp, n) => {
    if (RUNAS !== 'root' && n.owner !== USER) { ctx.err(`chmod: changing permissions of '${disp}': Operation not permitted\n`); return false; }
    const old = n.mode; n.mode = parseMode(spec, n.mode, n.type === 'dir');
    if (fl.v) ctx.out(`mode of '${disp}' changed from ${pad(old.toString(8), 4)} to ${pad(n.mode.toString(8), 4)}\n`);
  });
};
CMDS.chown = (a, ctx) => {
  const { fl, rest } = splitFlags(a, 'Rv');
  if (rest.length < 2) throw new Error(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand');
  const spec = rest.shift();
  let [u, g] = spec.split(':');
  if (spec.endsWith(':') && u) { const pw = pwEntries().find(x => x[0] === u); g = pw ? grEntries().find(x => x[2] === pw[3])?.[0] : undefined; }
  if (u && !pwEntries().find(x => x[0] === u)) throw new Error(`invalid user: '${spec}'`);
  if (g && !gidOf(g)) throw new Error(`invalid group: '${spec}'`);
  return walkTargets(ctx, 'chown', rest, fl.R, (disp, n) => {
    if (RUNAS !== 'root') { ctx.err(`chown: changing ownership of '${disp}': Operation not permitted\n`); return false; }
    if (u) n.owner = u; if (g) n.group = g;
    if (fl.v) ctx.out(`changed ownership of '${disp}' to ${n.owner}:${n.group}\n`);
  });
};
CMDS.chgrp = (a, ctx) => {
  const { fl, rest } = splitFlags(a, 'Rv');
  if (rest.length < 2) throw new Error(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand');
  const g = rest.shift();
  if (!gidOf(g)) throw new Error(`invalid group: '${g}'`);
  return walkTargets(ctx, 'chgrp', rest, fl.R, (disp, n) => {
    if (RUNAS !== 'root' && (n.owner !== USER || !myGroups().includes(g))) { ctx.err(`chgrp: changing group of '${disp}': Operation not permitted\n`); return false; }
    n.group = g;
  });
};
CMDS.hostname = (a, ctx) => { if (a.includes('-I') || a.includes('-i')) ctx.out('10.0.4.12 \n'); else if (a.includes('-f')) ctx.out(HOST + '.halcyon.internal\n'); else ctx.out(HOST + '\n'); };
CMDS.uname = (a, ctx) => {
  const { f } = opts(a, 'asrnm', '', 'uname');
  if (f.a) ctx.out('Linux halcyon-web01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux\n');
  else { const p = []; if (f.s || (!f.r && !f.n && !f.m)) p.push('Linux'); if (f.n) p.push(HOST); if (f.r) p.push('6.8.0-45-generic'); if (f.m) p.push('x86_64'); ctx.out(p.join(' ') + '\n'); }
};
CMDS.date = (a, ctx) => {
  const d = new Date(); const fa = a.find(x => x.startsWith('+'));
  if (fa) { const map = { '%Y': d.getUTCFullYear(), '%m': pad(d.getUTCMonth() + 1), '%d': pad(d.getUTCDate()), '%H': pad(d.getUTCHours()), '%M': pad(d.getUTCMinutes()), '%S': pad(d.getUTCSeconds()), '%F': `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, '%T': `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`, '%s': Math.floor(d.getTime() / 1000) }; ctx.out(fa.slice(1).replace(/%[YmdHMSFTs%]/g, mm => mm === '%%' ? '%' : map[mm]) + '\n'); return 0; }
  ctx.out(`${DAY[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}\n`);
};
CMDS.echo = (a, ctx) => {
  let n = false, e = false, i = 0;
  while (i < a.length && /^-[ne]+$/.test(a[i])) { if (a[i].includes('n')) n = true; if (a[i].includes('e')) e = true; i++; }
  let s = a.slice(i).join(' ');
  if (e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  ctx.out(s + (n ? '' : '\n'));
};
CMDS.true = () => 0;
CMDS.false = () => 1;
CMDS.clear = () => { clearRequested = true; };
CMDS.history = (a, ctx) => { ctx.out(S.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n') + '\n'); };
CMDS.sudo = (a, ctx) => {
  if (!S.sudo) { ctx.err(`[sudo] password for ${USER}:\n${USER} is not in the sudoers file.\n(Priya hasn't given you sudo yet. That happens in Chapter 4.)\n`); return 1; }
  if (!a.length) { ctx.err('usage: sudo COMMAND\n'); return 1; }
  if (a[0] === '-l') { ctx.out(`User ${USER} may run the following commands on ${HOST}:\n    (ALL : ALL) ALL\n`); return 0; }
  if (a[0] === '-i' || a[0] === '-s' || a[0] === 'su' || ((a[0] === 'bash' || a[0] === 'sh') && !a.includes('-c') && !a.slice(1).some(x => !x.startsWith('-')))) { ctx.err('In this game, put sudo in front of each command instead of opening a root shell. Real admins often prefer that too: each command is logged.\n(To run a script as root, give the file: sudo bash script.sh)\n'); return 1; }
  if (a[0] === 'cd') { ctx.err('sudo: cd: command not found\n(cd is built into your shell, so sudo cannot run it. Use sudo ls DIR instead.)\n'); return 1; }
  if (RUNAS === 'root') return exec(a, ctx);
  RUNAS = 'root';
  try { return exec(a, ctx); } finally { RUNAS = USER; }
};
CMDS.su = (a, ctx) => { ctx.err('Password:\nsu: Authentication failure\n'); return 1; };
CMDS.exit = (a, ctx) => { ctx.out("There's nowhere to log out to. The server needs you.\n"); };
CMDS.logout = CMDS.exit;

CMDS.cd = (a, ctx) => {
  if (a.length > 1) { ctx.err('bash: cd: too many arguments\n'); return 1; }
  const t = a[0] ?? HOME;
  const target = t === '-' ? S.oldpwd : t;
  const L = lookup(target);
  if (L.err) { ctx.err(`bash: cd: ${t}: ${L.err}\n`); return 1; }
  if (L.node.type !== 'dir') { ctx.err(`bash: cd: ${t}: Not a directory\n`); return 1; }
  if (!canEnter(L.node)) { ctx.err(`bash: cd: ${t}: Permission denied\n`); return 1; }
  S.oldpwd = S.cwd; S.cwd = L.abs;
  if (t === '-') ctx.out(L.abs + '\n');
  return 0;
};

function sortEnts(ents, f) {
  const key = n => n.replace(/^\.+/, '').toLowerCase();
  const a = [...ents].sort((x, y) => { const kx = key(x.name), ky = key(y.name); return kx < ky ? -1 : kx > ky ? 1 : (x.name < y.name ? -1 : x.name > y.name ? 1 : 0); });
  if (f.t) a.sort((x, y) => y.node.mtime - x.node.mtime);
  if (f.S) a.sort((x, y) => sizeOf(y.node) - sizeOf(x.node));
  if (f.r) a.reverse();
  return a;
}
function fmtEntries(ents, f, ctx, isDir) {
  if (!ents.length) return f.l && isDir ? 'total 0\n' : '';
  const suffix = e => f.F && e.node.type === 'dir' ? '/' : '';
  if (f.l) {
    const rows = ents.map(e => [
      permStr(e.node),
      String(e.node.type === 'dir' ? 2 + Object.values(e.node.children).filter(c => c.type === 'dir').length : 1),
      e.node.owner, e.node.group,
      f.h ? human(sizeOf(e.node)) : String(sizeOf(e.node)),
      lsDate(e.node.mtime),
      nameDisp(ctx, e.name, e.node) + suffix(e)
    ]);
    const w = [1, 2, 3, 4].map(i => Math.max(...rows.map(r => r[i].length)));
    let out = '';
    if (isDir) { const tot = ents.reduce((acc, e) => acc + Math.ceil(sizeOf(e.node) / 4096) * 4, 0); out += `total ${f.h ? human(tot * 1024) : tot}\n`; }
    return out + rows.map(r => `${r[0]} ${r[1].padStart(w[0])} ${r[2].padEnd(w[1])} ${r[3].padEnd(w[2])} ${r[4].padStart(w[3])} ${r[5]} ${r[6]}`).join('\n') + '\n';
  }
  const names = ents.map(e => nameDisp(ctx, e.name, e.node) + suffix(e));
  return (ctx.tty && !f['1'] ? names.join('  ') : names.join('\n')) + '\n';
}
CMDS.ls = (a, ctx) => {
  const { f, rest } = opts(a, 'laAhR1tSdFr', '', 'ls');
  const tgts = rest.length ? rest : ['.'];
  let st = 0; const fileEnts = [], dirEnts = [];
  for (const t of tgts) {
    const L = lookup(t);
    if (L.err) { ctx.err(`ls: cannot access '${t}': ${L.err}\n`); st = 2; continue; }
    if (L.node.type === 'dir' && !f.d) dirEnts.push({ t, abs: L.abs, node: L.node }); else fileEnts.push({ name: t, node: L.node });
  }
  const chunks = [];
  if (fileEnts.length) chunks.push(fmtEntries(sortEnts(fileEnts, f), f, ctx, false));
  const multi = tgts.length > 1 || f.R;
  const doDir = (t, abs, node) => {
    if (!canRead(node)) { ctx.err(`ls: cannot open directory '${t}': Permission denied\n`); st = 2; return; }
    let names = Object.keys(node.children);
    if (!f.a && !f.A) names = names.filter(n => !n.startsWith('.'));
    let ents = sortEnts(names.map(n => ({ name: n, node: node.children[n] })), f);
    if (f.a) ents = [{ name: '.', node }, { name: '..', node: getNode(parentOf(abs)) || node }, ...ents];
    chunks.push((multi ? `${t}:\n` : '') + fmtEntries(ents, f, ctx, true));
    if (f.R) for (const e of ents) if (e.node.type === 'dir' && e.name !== '.' && e.name !== '..') doDir(t.replace(/\/$/, '') + '/' + e.name, joinAbs(abs, e.name), e.node);
  };
  for (const d of dirEnts) doDir(d.t, d.abs, d.node);
  ctx.out(chunks.filter(c => c !== '').join('\n'));
  return st;
};
CMDS.tree = (a, ctx) => {
  const { f, rest } = opts(a, 'ad', '', 'tree');
  const t = rest[0] || '.';
  const L = lookup(t);
  if (L.err) { ctx.err(`${t} [error opening dir]\n`); return 2; }
  if (L.node.type !== 'dir') { ctx.out(`${t} [error opening dir]\n\n0 directories, 0 files\n`); return 0; }
  const lines = [nameDisp(ctx, t, L.node)]; let nd = 0, nf = 0;
  const rec = (node, prefix) => {
    let names = Object.keys(node.children).filter(n => f.a || !n.startsWith('.')).sort((x, y) => x.toLowerCase() < y.toLowerCase() ? -1 : 1);
    if (f.d) names = names.filter(n => node.children[n].type === 'dir');
    names.forEach((n, i) => {
      const c = node.children[n], last = i === names.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + nameDisp(ctx, n, c));
      if (c.type === 'dir') { nd++; if (canRead(c) && canEnter(c)) rec(c, prefix + (last ? '    ' : '│   ')); }
      else nf++;
    });
  };
  if (canRead(L.node)) rec(L.node, '');
  ctx.out(lines.join('\n') + `\n\n${nd} director${nd === 1 ? 'y' : 'ies'}${f.d ? '' : `, ${nf} file${nf === 1 ? '' : 's'}`}\n`);
};

CMDS.cat = (a, ctx) => {
  const { f, rest } = opts(a, 'n', '', 'cat');
  const I = inputs(rest, ctx, 'cat');
  let s = I.res.map(x => x.content).join('');
  if (f.n) s = splitLines(s).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n') + (s ? '\n' : '');
  ctx.out(s);
  return I.st;
};
CMDS.less = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'less'); ctx.out(I.res.map(x => x.content).join('')); return I.st; };
CMDS.more = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'more'); ctx.out(I.res.map(x => x.content).join('')); return I.st; };

function headTail(which) {
  return (a, ctx) => {
    let n = 10, fromStart = false; const files = [];
    const setN = v => {
      if (v === undefined) throw new Error("option requires an argument -- 'n'");
      if (which === 'tail' && v.startsWith('+')) { fromStart = true; v = v.slice(1); }
      if (!/^-?\d+$/.test(v)) throw new Error(`invalid number of lines: '${v}'`);
      n = Math.abs(parseInt(v, 10));
    };
    for (let k = 0; k < a.length; k++) {
      const x = a[k];
      if (x === '-n') setN(a[++k]);
      else if (/^-n.+/.test(x)) setN(x.slice(2));
      else if (/^-\d+$/.test(x)) n = parseInt(x.slice(1), 10);
      else if (x.startsWith('-') && x !== '-') throw new Error(`invalid option -- '${x.slice(1)}'\nTry 'man ${which}' for the options this game supports.`);
      else files.push(x);
    }
    const I = inputs(files, ctx, which);
    I.res.forEach((it, idx) => {
      if (I.res.length > 1) ctx.out((idx ? '\n' : '') + `==> ${it.name} <==\n`);
      const lines = splitLines(it.content);
      const sel = which === 'head' ? lines.slice(0, n) : fromStart ? lines.slice(Math.max(0, n - 1)) : lines.slice(Math.max(0, lines.length - n));
      if (sel.length) ctx.out(sel.join('\n') + '\n');
    });
    return I.st;
  };
}
CMDS.head = headTail('head');
CMDS.tail = headTail('tail');

CMDS.wc = (a, ctx) => {
  const { f, rest } = opts(a, 'lwcm', '', 'wc');
  const I = inputs(rest, ctx, 'wc');
  const idx = []; if (f.l) idx.push(0); if (f.w) idx.push(1); if (f.c || f.m) idx.push(2); if (!idx.length) idx.push(0, 1, 2);
  const rows = [], tot = [0, 0, 0];
  for (const it of I.res) {
    const s = it.content;
    const v = [(s.match(/\n/g) || []).length, (s.match(/\S+/g) || []).length, byteLen(s)];
    v.forEach((x, i) => tot[i] += x);
    rows.push([v, it.name === '(standard input)' ? '' : it.name]);
  }
  if (rows.length > 1) rows.push([tot, 'total']);
  const w = (idx.length === 1 && rows.length === 1) ? 0 : Math.max(...rows.flatMap(r => idx.map(i => String(r[0][i]).length)));
  ctx.out(rows.map(r => idx.map(i => String(r[0][i]).padStart(w)).join(' ') + (r[1] ? ' ' + r[1] : '')).join('\n') + (rows.length ? '\n' : ''));
  return I.st;
};

CMDS.touch = (a, ctx) => {
  const { rest } = opts(a, '', '', 'touch');
  if (!rest.length) throw new Error('missing file operand');
  let st = 0;
  for (const t of rest) {
    const L = lookup(t);
    if (!L.err) { if (!canWrite(L.abs)) { ctx.err(`touch: cannot touch '${t}': Permission denied\n`); st = 1; } else L.node.mtime = Date.now(); continue; }
    if (L.err !== 'No such file or directory') { ctx.err(`touch: cannot touch '${t}': ${L.err}\n`); st = 1; continue; }
    const e = writeFile(L.abs, '', true);
    if (e) { ctx.err(`touch: cannot touch '${t}': ${e}\n`); st = 1; }
  }
  return st;
};
function mkd(abs) {
  const P = lookup(parentOf(abs));
  if (P.err) return P.err;
  if (P.node.type !== 'dir') return 'Not a directory';
  if (!canWrite(abs)) return 'Permission denied';
  P.node.children[baseName(abs)] = D({}, { owner: RUNAS, mtime: Date.now() });
  return null;
}
CMDS.mkdir = (a, ctx) => {
  const { f, rest } = opts(a, 'pv', '', 'mkdir');
  if (!rest.length) throw new Error('missing operand');
  let st = 0;
  for (const t of rest) {
    const abs = norm(t, S.cwd);
    if (f.p) {
      let cur = '';
      for (const p of abs.split('/').slice(1)) {
        cur += '/' + p;
        const L = lookup(cur);
        if (!L.err) { if (L.node.type !== 'dir') { ctx.err(`mkdir: cannot create directory '${t}': Not a directory\n`); st = 1; break; } continue; }
        if (L.err !== 'No such file or directory') { ctx.err(`mkdir: cannot create directory '${t}': ${L.err}\n`); st = 1; break; }
        const e = mkd(cur);
        if (e) { ctx.err(`mkdir: cannot create directory '${t}': ${e}\n`); st = 1; break; }
        if (f.v) ctx.out(`mkdir: created directory '${cur}'\n`);
      }
    } else {
      const L = lookup(abs);
      if (!L.err) { ctx.err(`mkdir: cannot create directory '${t}': File exists\n`); st = 1; continue; }
      const e = mkd(abs);
      if (e) { ctx.err(`mkdir: cannot create directory '${t}': ${e}\n`); st = 1; continue; }
      if (f.v) ctx.out(`mkdir: created directory '${t}'\n`);
    }
  }
  return st;
};
CMDS.rmdir = (a, ctx) => {
  const { rest } = opts(a, '', '', 'rmdir');
  if (!rest.length) throw new Error('missing operand');
  let st = 0;
  for (const t of rest) {
    const L = lookup(t);
    const fail = m => { ctx.err(`rmdir: failed to remove '${t}': ${m}\n`); st = 1; };
    if (L.err) { fail(L.err); continue; }
    if (L.node.type !== 'dir') { fail('Not a directory'); continue; }
    if (Object.keys(L.node.children).length) { fail('Directory not empty'); continue; }
    if (!canWrite(L.abs)) { fail('Permission denied'); continue; }
    syncRecordDeletion(L.abs, L.node);
    delete getNode(parentOf(L.abs)).children[baseName(L.abs)];
  }
  return st;
};
CMDS.rm = (a, ctx) => {
  const { f, rest } = opts(a, 'rRfv', '', 'rm');
  const rec = f.r || f.R;
  if (!rest.length) { if (f.f) return 0; throw new Error('missing operand'); }
  let st = 0;
  for (const t of rest) {
    const abs = norm(t, S.cwd);
    if (abs === '/') { ctx.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n"); st = 1; continue; }
    const b = t.replace(/\/+$/, '').split('/').pop();
    if (b === '.' || b === '..') { ctx.err(`rm: refusing to remove '.' or '..' directory: skipping '${t}'\n`); st = 1; continue; }
    const L = lookup(t);
    if (L.err) { if (!f.f) { ctx.err(`rm: cannot remove '${t}': ${L.err}\n`); st = 1; } continue; }
    if (L.node.type === 'dir' && !rec) { ctx.err(`rm: cannot remove '${t}': Is a directory\n`); st = 1; continue; }
    if (!canWrite(L.abs)) { ctx.err(`rm: cannot remove '${t}': Permission denied\n`); st = 1; continue; }
    syncRecordDeletion(L.abs, L.node);
    delete getNode(parentOf(L.abs)).children[baseName(L.abs)];
    if (f.v) ctx.out(`removed ${L.node.type === 'dir' ? 'directory ' : ''}'${t}'\n`);
  }
  return st;
};
CMDS.cp = (a, ctx) => {
  const { f, rest } = opts(a, 'rRv', '', 'cp');
  const rec = f.r || f.R;
  if (rest.length < 2) throw new Error(rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand');
  const dst = rest.pop();
  const DL = lookup(dst);
  const dIsDir = !DL.err && DL.node.type === 'dir';
  if (rest.length > 1 && !dIsDir) throw new Error(`target '${dst}' is not a directory`);
  let st = 0;
  for (const s of rest) {
    const L = lookup(s);
    if (L.err) { ctx.err(`cp: cannot stat '${s}': ${L.err}\n`); st = 1; continue; }
    if (L.node.type === 'dir' && !rec) { ctx.err(`cp: -r not specified; omitting directory '${s}'\n`); st = 1; continue; }
    if (!canRead(L.node)) { ctx.err(`cp: cannot open '${s}' for reading: Permission denied\n`); st = 1; continue; }
    if (dst.endsWith('/') && !dIsDir) { ctx.err(`cp: cannot create regular file '${dst}': Not a directory\n`); st = 1; continue; }
    const target = dIsDir ? joinAbs(DL.abs, baseName(L.abs)) : norm(dst, S.cwd);
    if (target === L.abs) { ctx.err(`cp: '${s}' and '${dst}' are the same file\n`); st = 1; continue; }
    if (target.startsWith(L.abs + '/')) { ctx.err(`cp: cannot copy a directory, '${s}', into itself, '${dst}'\n`); st = 1; continue; }
    const e = place(target, cloneOwned(L.node));
    if (e) { ctx.err(`cp: cannot create ${L.node.type === 'dir' ? 'directory' : 'regular file'} '${dst}': ${e}\n`); st = 1; continue; }
    if (f.v) ctx.out(`'${s}' -> '${target}'\n`);
  }
  return st;
};
CMDS.mv = (a, ctx) => {
  const { f, rest } = opts(a, 'v', '', 'mv');
  if (rest.length < 2) throw new Error(rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand');
  const dst = rest.pop();
  const DL = lookup(dst);
  const dIsDir = !DL.err && DL.node.type === 'dir';
  if (rest.length > 1 && !dIsDir) throw new Error(`target '${dst}' is not a directory`);
  let st = 0;
  for (const s of rest) {
    const L = lookup(s);
    if (L.err) { ctx.err(`mv: cannot stat '${s}': ${L.err}\n`); st = 1; continue; }
    if (dst.endsWith('/') && !dIsDir) { ctx.err(`mv: cannot move '${s}' to '${dst}': Not a directory\n`); st = 1; continue; }
    const target = dIsDir ? joinAbs(DL.abs, baseName(L.abs)) : norm(dst, S.cwd);
    if (target === L.abs) { ctx.err(`mv: '${s}' and '${dst}' are the same file\n`); st = 1; continue; }
    if (target.startsWith(L.abs + '/')) { ctx.err(`mv: cannot move '${s}' to a subdirectory of itself, '${target}'\n`); st = 1; continue; }
    if (!canWrite(L.abs)) { ctx.err(`mv: cannot move '${s}' to '${dst}': Permission denied\n`); st = 1; continue; }
    const e = place(target, L.node);
    if (e) { ctx.err(`mv: cannot move '${s}' to '${dst}': ${e}\n`); st = 1; continue; }
    syncRecordDeletion(L.abs, L.node);
    delete getNode(parentOf(L.abs)).children[baseName(L.abs)];
    if (f.v) ctx.out(`renamed '${s}' -> '${target}'\n`);
  }
  return st;
};

CMDS.find = (a, ctx) => {
  const paths = []; let k = 0;
  while (k < a.length && !a[k].startsWith('-') && a[k] !== '!' && a[k] !== '(') paths.push(a[k++]);
  if (!paths.length) paths.push('.');
  const tests = []; let action = null, maxdepth = Infinity, mindepth = 0;
  const need = () => { if (k >= a.length) throw new Error(`missing argument to \`${a[k - 1]}'`); return a[k++]; };
  while (k < a.length) {
    const p = a[k++];
    switch (p) {
      case '-name': case '-iname': { const re = segRe(need(), p === '-iname'); tests.push((n, name) => re.test(name)); break; }
      case '-type': { const v = need(); if (v !== 'f' && v !== 'd') throw new Error(`Unknown argument to -type: ${v} (this game supports f and d)`); tests.push(n => (v === 'd') === (n.type === 'dir')); break; }
      case '-size': {
        const v = need(); const m = v.match(/^([+-]?)(\d+)([ckMG]?)$/);
        if (!m) throw new Error(`invalid argument \`${v}' to \`-size'`);
        const unit = { '': 512, c: 1, k: KB, M: MB, G: GB }[m[3]], N = +m[2];
        tests.push(n => { if (n.type !== 'file') return false; const sz = Math.ceil(sizeOf(n) / unit); return m[1] === '+' ? sz > N : m[1] === '-' ? sz < N : sz === N; });
        break;
      }
      case '-mtime': case '-atime': case '-ctime': {
        const v = need(); const m = v.match(/^([+-]?)(\d+)$/);
        if (!m) throw new Error(`invalid argument \`${v}' to \`${p}'`);
        const N = +m[2], sign = m[1];
        tests.push(n => { const age = Math.floor((Date.now() - (n.mtime || Date.now())) / 86400000); return sign === '+' ? age > N : sign === '-' ? age < N : age === N; });
        break;
      }
      case '-mmin': {
        const v = need(); const m = v.match(/^([+-]?)(\d+)$/);
        if (!m) throw new Error(`invalid argument \`${v}' to \`-mmin'`);
        const N = +m[2], sign = m[1];
        tests.push(n => { const age = Math.floor((Date.now() - (n.mtime || Date.now())) / 60000); return sign === '+' ? age > N : sign === '-' ? age < N : age === N; });
        break;
      }
      case '-user': { const v = need(); tests.push(n => n.owner === v); break; }
      case '-perm': { const v = need(); if (v[0] === '-') { const w = parseInt(v.slice(1), 8); tests.push(n => (n.mode & w) === w); } else if (v[0] === '/' || v[0] === '+') { const w = parseInt(v.slice(1), 8); tests.push(n => (n.mode & w) !== 0); } else { const w = parseInt(v, 8); tests.push(n => (n.mode & 0o7777) === w); } break; }
      case '-maxdepth': maxdepth = parseInt(need(), 10); break;
      case '-mindepth': mindepth = parseInt(need(), 10); break;
      case '-delete': action = { t: 'delete' }; break;
      case '-print': break;
      case '-exec': {
        const cmd = [];
        while (k < a.length && a[k] !== ';' && a[k] !== '+') cmd.push(a[k++]);
        if (k >= a.length || !cmd.length) throw new Error("missing argument to `-exec'");
        k++; action = { t: 'exec', cmd }; break;
      }
      default: throw new Error(`unknown predicate \`${p}'`);
    }
  }
  const matches = []; let st = 0;
  const walk = (disp, abs, node, depth) => {
    if (depth >= mindepth && tests.every(t => t(node, baseName(abs) === '/' ? '/' : baseName(abs)))) matches.push({ disp, abs, node });
    if (node.type === 'dir' && depth < maxdepth) {
      if (!canRead(node) || !canEnter(node)) { ctx.err(`find: '${disp}': Permission denied\n`); st = 1; return; }
      for (const name of Object.keys(node.children).sort()) walk(disp.endsWith('/') ? disp + name : disp + '/' + name, joinAbs(abs, name), node.children[name], depth + 1);
    }
  };
  for (const p of paths) {
    const L = lookup(p);
    if (L.err) { ctx.err(`find: '${p}': ${L.err}\n`); st = 1; continue; }
    walk(p, L.abs, L.node, 0);
  }
  if (!action) { if (matches.length) ctx.out(matches.map(m => m.disp).join('\n') + '\n'); }
  else if (action.t === 'delete') {
    for (const m of matches.slice().reverse()) {
      if (!canWrite(m.abs)) { ctx.err(`find: cannot delete '${m.disp}': Permission denied\n`); st = 1; continue; }
      if (m.node.type === 'dir' && Object.keys(m.node.children).length) { ctx.err(`find: cannot delete '${m.disp}': Directory not empty\n`); st = 1; continue; }
      const par = getNode(parentOf(m.abs)); if (par) { syncRecordDeletion(m.abs, m.node); delete par.children[baseName(m.abs)]; }
      if (m.abs.startsWith('/var/lib/php/sessions/')) S.inodeBad = false;
    }
  } else {
    for (const m of matches) {
      const argv = action.cmd.map(x => x.split('{}').join(m.disp));
      exec(argv, { stdin: null, out: ctx.out, err: ctx.err, tty: ctx.tty });
    }
  }
  return st;
};

CMDS.grep = (a, ctx) => {
  const { f, rest } = opts(a, 'ivcnrRlLhHEFwo', 'e', 'grep');
  let pat;
  if (f.e !== undefined) pat = f.e;
  else { if (!rest.length) throw new Error('usage: grep [OPTION]... PATTERN [FILE]...'); pat = rest.shift(); }
  const o = { ere: f.E, fixed: f.F, icase: f.i, word: f.w };
  const re = buildRe(pat, o), reG = buildRe(pat, { ...o, global: true });
  const rec = f.r || f.R;
  let st = 0, list = [];
  if (rec) {
    const roots = rest.length ? rest : [''];
    for (const r of roots) {
      const L = lookup(r === '' ? '.' : r);
      if (L.err) { ctx.err(`grep: ${r}: ${L.err}\n`); st = 2; continue; }
      const walk = (disp, node) => {
        if (node.type === 'file') { if (!canRead(node)) { ctx.err(`grep: ${disp}: Permission denied\n`); st = 2; return; } list.push({ name: disp, content: node.content }); return; }
        if (!canRead(node) || !canEnter(node)) { ctx.err(`grep: ${disp || '.'}: Permission denied\n`); st = 2; return; }
        for (const k2 of Object.keys(node.children).sort()) walk(disp === '' ? k2 : disp.endsWith('/') ? disp + k2 : disp + '/' + k2, node.children[k2]);
      };
      walk(r, L.node);
    }
  } else { const I = inputs(rest, ctx, 'grep'); list = I.res; if (I.st) st = 2; }
  const showName = f.H || (!f.h && (rec || rest.length > 1));
  let any = false;
  for (const it of list) {
    let cnt = 0;
    splitLines(it.content).forEach((ln, i) => {
      if (re.test(ln) === !f.v) {
        cnt++;
        if (f.c || f.l || f.L) return;
        const prefix = (showName ? tag(ctx, it.name, 'f') + ':' : '') + (f.n ? tag(ctx, String(i + 1), 'n') + ':' : '');
        if (f.o && !f.v) { for (const m of ln.matchAll(reG)) if (m[0]) ctx.out(prefix + tag(ctx, m[0], 'm') + '\n'); }
        else ctx.out(prefix + (f.v || !ctx.tty ? ln : ln.replace(reG, s => s ? tag(ctx, s, 'm') : s)) + '\n');
      }
    });
    if (f.c) ctx.out((showName ? tag(ctx, it.name, 'f') + ':' : '') + cnt + '\n');
    if (f.l && cnt) ctx.out(tag(ctx, it.name, 'f') + '\n');
    if (f.L && !cnt) ctx.out(tag(ctx, it.name, 'f') + '\n');
    if (cnt) any = true;
  }
  return st === 2 ? 2 : any ? 0 : 1;
};

CMDS.sort = (a, ctx) => {
  const { f, rest } = opts(a, 'rnufh', 'kt', 'sort');
  const I = inputs(rest, ctx, 'sort');
  let lines = []; I.res.forEach(x => lines.push(...splitLines(x.content)));
  let kStart = 0, kEnd = 0, numeric = !!f.n, hum = !!f.h;
  if (f.k) {
    const m = String(f.k).match(/^(\d+)([a-z]*)(?:,(\d+)([a-z]*))?$/);
    if (!m || +m[1] < 1) throw new Error(`invalid number at field start: invalid count at start of '${f.k}'`);
    kStart = +m[1]; kEnd = m[3] ? +m[3] : 0;
    const fl = (m[2] || '') + (m[4] || '');
    if (fl.includes('n')) numeric = true; if (fl.includes('h')) hum = true;
  }
  const sep = f.t;
  if (sep !== undefined && sep.length !== 1) throw new Error('multi-character tab');
  const keyOf = l => { if (!kStart) return l; const parts = sep !== undefined ? l.split(sep) : l.trim().split(/\s+/); return parts.slice(kStart - 1, kEnd || undefined).join(sep ?? ' '); };
  const num = v => { const m = String(v).trim().match(/^-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
  const hnum = v => { const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)([KMGT]?)/i); return m ? parseFloat(m[1]) * Math.pow(1024, ' KMGT'.indexOf((m[2] || ' ').toUpperCase())) : 0; };
  const byte = (x, y) => x < y ? -1 : x > y ? 1 : 0;
  const cmpKey = (x, y) => { const kx = keyOf(x), ky = keyOf(y); if (numeric) return num(kx) - num(ky); if (hum) return hnum(kx) - hnum(ky); return f.f ? byte(kx.toLowerCase(), ky.toLowerCase()) : byte(kx, ky); };
  lines.sort((x, y) => { let c = cmpKey(x, y); if (c === 0 && !f.u) c = byte(x, y); return f.r ? -c : c; });
  if (f.u) lines = lines.filter((l, i) => i === 0 || cmpKey(lines[i - 1], l) !== 0);
  if (lines.length) ctx.out(lines.join('\n') + '\n');
  return I.st;
};
CMDS.uniq = (a, ctx) => {
  const { f, rest } = opts(a, 'cdui', '', 'uniq');
  const I = inputs(rest.slice(0, 1), ctx, 'uniq');
  const lines = I.res.length ? splitLines(I.res[0].content) : [];
  const groups = [];
  for (const l of lines) { const g = groups[groups.length - 1]; if (g && (f.i ? g.l.toLowerCase() === l.toLowerCase() : g.l === l)) g.n++; else groups.push({ l, n: 1 }); }
  const out = groups.filter(g => f.d ? g.n > 1 : f.u ? g.n === 1 : true).map(g => f.c ? `${String(g.n).padStart(7)} ${g.l}` : g.l);
  if (out.length) ctx.out(out.join('\n') + '\n');
  return I.st;
};
function parseList(s) {
  const fns = String(s).split(',').map(p => {
    let m;
    if ((m = p.match(/^(\d+)$/))) { const n = +m[1]; if (!n) throw new Error('fields are numbered from 1'); return i => i === n; }
    if ((m = p.match(/^(\d+)-(\d+)$/))) { const x = +m[1], y = +m[2]; return i => i >= x && i <= y; }
    if ((m = p.match(/^(\d+)-$/))) { const x = +m[1]; return i => i >= x; }
    if ((m = p.match(/^-(\d+)$/))) { const y = +m[1]; return i => i <= y; }
    throw new Error(`invalid field value '${p}'`);
  });
  return i => fns.some(fn => fn(i));
}
CMDS.cut = (a, ctx) => {
  const { f, rest } = opts(a, 's', 'dfc', 'cut');
  if (!f.f && !f.c) throw new Error('you must specify a list of bytes, characters, or fields');
  const delim = f.d === undefined ? '\t' : f.d;
  if (delim.length !== 1) throw new Error('the delimiter must be a single character');
  const sel = parseList(f.f || f.c);
  const I = inputs(rest, ctx, 'cut');
  const out = [];
  for (const it of I.res) for (const l of splitLines(it.content)) {
    if (f.c) { out.push([...l].filter((_, i) => sel(i + 1)).join('')); continue; }
    if (!l.includes(delim)) { if (!f.s) out.push(l); continue; }
    out.push(l.split(delim).filter((_, i) => sel(i + 1)).join(delim));
  }
  if (out.length) ctx.out(out.join('\n') + '\n');
  return I.st;
};
CMDS.tr = (a, ctx) => {
  const { f, rest } = opts(a, 'ds', '', 'tr');
  const exp = s => {
    s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const cls = { '[:lower:]': 'a-z', '[:upper:]': 'A-Z', '[:digit:]': '0-9', '[:space:]': ' \t\n' };
    for (const k2 in cls) s = s.split(k2).join(cls[k2]);
    let o = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i + 1] === '-' && i + 2 < s.length) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) o += String.fromCharCode(c); i += 2; }
      else o += s[i];
    }
    return o;
  };
  if (ctx.stdin === null) { ctx.err('tr: tr reads from a pipe or <, for example: cat file | tr a-z A-Z\n'); return 1; }
  let s = ctx.stdin;
  if (f.d) { if (!rest.length) throw new Error('missing operand'); const set = new Set(exp(rest[0])); s = [...s].filter(c => !set.has(c)).join(''); }
  else if (!f.s || rest.length > 1) {
    if (rest.length < 2) throw new Error(rest.length ? `missing operand after '${rest[0]}'` : 'missing operand');
    const x = exp(rest[0]), y = exp(rest[1]); const map = {};
    for (let i = 0; i < x.length; i++) map[x[i]] = y[Math.min(i, y.length - 1)];
    s = [...s].map(c => map[c] ?? c).join('');
  }
  if (f.s && rest.length) { const set = new Set(exp(rest[rest.length - 1])); s = s.replace(/(.)\1+/gs, (m, c) => set.has(c) ? c : m); }
  ctx.out(s);
};

const { parseSed, runSed } = globalThis.LSASedParser.create({ buildRe, readDelim, splitLines });
CMDS.sed = (a, ctx) => {
  const { f, rest } = opts(a, 'niEr', 'e', 'sed');
  let script = f.e;
  if (script === undefined) { if (!rest.length) throw new Error('usage: sed [-n] [-i] [-E] SCRIPT [FILE]...'); script = rest.shift(); }
  const prog = parseSed(script, f.E || f.r);
  const run = content => runSed(prog, content, { quiet: f.n });
  if (f.i) {
    if (!rest.length) throw new Error('no input files');
    let st = 0;
    for (const fl of rest) {
      const L = lookup(fl);
      if (L.err || L.node.type !== 'file') { ctx.err(`sed: can't read ${fl}: ${L.err || 'Is a directory'}\n`); st = 2; continue; }
      if (!canWrite(L.abs)) { ctx.err(`sed: couldn't edit ${fl}: Permission denied\n`); st = 4; continue; }
      L.node.content = run(L.node.content); delete L.node.size; L.node.mtime = Date.now();
    }
    return st;
  }
  const I = inputs(rest, ctx, 'sed');
  ctx.out(run(I.res.map(x => x.content).join('')));
  return I.st;
};

const awkErr = () => new Error("this game understands programs like '{print $1}', '/GET/ {print $1, $7}', 'NR>1', '$9 == 404 {print $7}' and 'END {print NR}'");
const awkVal = tok => {
  if (tok === 'NR') return e => e.NR;
  if (tok === 'NF') return e => e.F.length;
  if (tok === '$NF') return e => e.F.length ? e.F[e.F.length - 1] : e.l;
  const n = +tok.slice(1);
  return e => n === 0 ? e.l : (e.F[n - 1] ?? '');
};
function splitCommas(s) { const out = []; let cur = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' && s[i - 1] !== '\\') q = !q; if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
function parseAwkAction(body) {
  const stmts = body.split(/[;\n]/).map(x => x.trim()).filter(Boolean);
  if (!stmts.length) return [];
  return stmts.map(st => {
    if (!/^print\b/.test(st)) throw awkErr();
    const r = st.slice(5).trim();
    if (!r) return [e => e.l];
    return splitCommas(r).map(item => {
      const toks = []; const re = /\s*(\$NF|\$\d+|NF|NR|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?)\s*/y; let pos = 0;
      while (pos < item.length) {
        re.lastIndex = pos; const m = re.exec(item);
        if (!m) throw awkErr();
        const t = m[1];
        if (t[0] === '"') { let v; try { v = JSON.parse(t); } catch (e) { v = t.slice(1, -1); } toks.push(() => v); }
        else if (/^-?\d/.test(t)) toks.push(() => t);
        else toks.push(awkVal(t));
        pos = re.lastIndex;
      }
      return e => toks.map(fn => fn(e)).join('');
    });
  });
}
function parseAwk(p) {
  const rules = []; let s = p.trim();
  while (s.length) {
    let pat = null, end = false, m;
    if (s.startsWith('BEGIN')) throw awkErr();
    if (s.startsWith('END')) { end = true; s = s.slice(3).trim(); }
    else if (s[0] === '/') {
      const [body, ni] = readDelim(s, 1, '/'); if (ni < 0) throw awkErr();
      const re = buildRe(body, { ere: true }); pat = e => re.test(e.l); s = s.slice(ni).trim();
    } else if ((m = s.match(/^(NR|NF|\$NF|\$\d+)\s*(==|!=|>=|<=|>|<|!~|~)\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|\/(?:[^\/\\]|\\.)*\/)/))) {
      const get = awkVal(m[1]), op = m[2], rhsRaw = m[3]; s = s.slice(m[0].length).trim();
      if (op === '~' || op === '!~') {
        if (rhsRaw[0] !== '/') throw awkErr();
        const re = buildRe(rhsRaw.slice(1, -1), { ere: true }); pat = e => re.test(String(get(e))) === (op === '~');
      } else {
        const isStr = rhsRaw[0] === '"';
        const rhs = isStr ? rhsRaw.slice(1, -1) : parseFloat(rhsRaw);
        pat = e => {
          let x = get(e), y = rhs;
          if (!isStr && /^\s*-?\d+(\.\d+)?\s*$/.test(String(x))) x = parseFloat(x); else { x = String(x); y = String(y); }
          switch (op) { case '==': return x == y; case '!=': return x != y; case '>': return x > y; case '<': return x < y; case '>=': return x >= y; default: return x <= y; }
        };
      }
    }
    let act = null;
    if (s[0] === '{') { const j = s.indexOf('}'); if (j < 0) throw awkErr(); act = parseAwkAction(s.slice(1, j)); s = s.slice(j + 1).trim(); }
    if (!pat && !act && !end) throw awkErr();
    if (end && !act) throw awkErr();
    rules.push({ pat, act: act || [[e => e.l]], end });
    s = s.replace(/^;/, '').trim();
  }
  return rules;
}
CMDS.awk = (a, ctx) => {
  let FS = null, prog = null; const files = [];
  for (let k = 0; k < a.length; k++) {
    const x = a[k];
    if (prog === null && x === '-F') { FS = a[++k]; if (FS === undefined) throw new Error('option -F needs an argument'); }
    else if (prog === null && x.startsWith('-F')) FS = x.slice(2);
    else if (prog === null) prog = x;
    else files.push(x);
  }
  if (prog === null) throw new Error("usage: awk [-F sep] 'program' [file ...]");
  const rules = parseAwk(prog);
  const I = inputs(files, ctx, 'awk');
  if (FS === '\\t') FS = '\t';
  const split = l => (FS === null || FS === ' ') ? (l.trim() === '' ? [] : l.trim().split(/\s+/)) : FS.length === 1 ? l.split(FS) : l.split(new RegExp(FS));
  const out = []; let NR = 0, env = { l: '', F: [], NR: 0 };
  const run = (act, e) => { for (const st of act) out.push(st.map(fn => fn(e)).join(' ')); };
  for (const it of I.res) for (const l of splitLines(it.content)) {
    NR++; env = { l, F: split(l), NR };
    for (const r of rules) if (!r.end && (!r.pat || r.pat(env))) run(r.act, env);
  }
  for (const r of rules) if (r.end) run(r.act, { ...env, NR });
  if (out.length) ctx.out(out.join('\n') + '\n');
  return I.st;
};

CMDS.du = (a, ctx) => {
  if (a.includes('--inodes')) {
    const dir = a.filter(x => !x.startsWith('-'))[0] || '.';
    const big = S.inodeBad ? 1048221 : 142;
    ctx.out(`${String(S.inodeBad ? 12 : 12).padStart(8)}\t/var/lib/php\n`);
    ctx.out(`${String(big).padStart(8)}\t/var/lib/php/sessions\n`);
    ctx.out(`${String(1104).padStart(8)}\t/var/lib\n`);
    return 0;
  }
  const { f, rest } = opts(a, 'sha', '', 'du');
  const tg = rest.length ? rest : ['.'];
  const fmt = n => f.h ? human(n) : String(Math.ceil(n / 1024));
  let st = 0;
  for (const t of tg) {
    const L = lookup(t);
    if (L.err) { ctx.err(`du: cannot access '${t}': ${L.err}\n`); st = 1; continue; }
    if (f.s || L.node.type !== 'dir') { ctx.out(`${fmt(treeSize(L.node))}\t${t}\n`); continue; }
    const rec = (disp, node) => {
      if (!canRead(node) || !canEnter(node)) { ctx.err(`du: cannot read directory '${disp}': Permission denied\n`); st = 1; return; }
      for (const k2 of Object.keys(node.children).sort()) {
        const c = node.children[k2], d2 = disp.endsWith('/') ? disp + k2 : disp + '/' + k2;
        if (c.type === 'dir') rec(d2, c); else if (f.a) ctx.out(`${fmt(sizeOf(c))}\t${d2}\n`);
      }
      ctx.out(`${fmt(treeSize(node))}\t${disp}\n`);
    };
    rec(t, L.node);
  }
  return st;
};
const DISK_TOTAL = 25 * GB, DISK_BASE = 17.5 * GB;
CMDS.df = (a, ctx) => {
  const { f } = opts(a, 'hTi', '', 'df');
  let rows;
  if (f.i) {
    const tot = 1638400, usedI = S.inodeBad ? 1638398 : 243110;
    rows = [['Filesystem', 'Inodes', 'IUsed', 'IFree', 'IUse%', 'Mounted on'],
      ['/dev/vda1', String(tot), String(usedI), String(tot - usedI), Math.ceil(usedI / tot * 100) + '%', '/'],
      ['/dev/vda2', '65536', '320', '65216', '1%', '/boot']];
    for (const m of S.mounts) { if (m.mp === '/' || m.mp === '/boot') continue; rows.push([m.dev, '1310720', '12', '1310708', '1%', m.mp]); }
  } else {
    const used = Math.min(DISK_TOTAL, DISK_BASE + treeSize(S.fs) + (S.held || 0)), avail = DISK_TOTAL - used;
    const fm = n => f.h ? human(n) : String(Math.round(n / 1024));
    rows = [
      ['Filesystem', f.h ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'],
      ['/dev/vda1', fm(DISK_TOTAL), fm(used), fm(avail), Math.ceil(used / DISK_TOTAL * 100) + '%', '/']
    ];
    for (const m of S.mounts) {
      if (m.mp === '/') continue;
      const u = m.mp === '/boot' ? 120 * MB : 24 * MB;
      rows.push([m.dev, fm(m.size), fm(u), fm(m.size - u), Math.ceil(u / m.size * 100) + '%', m.mp]);
    }
    rows.push(['tmpfs', fm(2 * GB), '0', fm(2 * GB), '0%', '/dev/shm']);
  }
  const w = [0, 1, 2, 3, 4].map(i => Math.max(...rows.map(r => r[i].length)));
  ctx.out(rows.map(r => [r[0].padEnd(w[0]), ...[1, 2, 3, 4].map(i => r[i].padStart(w[i])), r[5]].join(' ')).join('\n') + '\n');
};

CMDS.man = (a, ctx) => {
  if (!a.length) { ctx.err("What manual page do you want?\nFor example, try 'man ls'.\n"); return 1; }
  const n = a[a.length - 1];
  if (!MAN[n]) { ctx.err(`No manual entry for ${n}\n`); return 16; }
  ctx.out(renderMan(n));
};
CMDS.help = (a, ctx) => {
  ctx.out(`Commands on halcyon-web01:

  Moving around    pwd  ls  cd  tree
  Reading files    cat  less  head  tail  wc
  Managing files   mkdir  touch  cp  mv  rm  rmdir  find  du  df
  Working text     grep  sort  uniq  cut  sed  awk  tr  echo  nl  tac  rev
                   column  comm
  Users & access   id  groups  getent  chmod  chown  chgrp  sudo  usermod  gpasswd
                   passwd  useradd  userdel  ssh-keygen  umask  getfacl  setfacl
  Processes        ps  top  kill  pkill  uptime  free  renice  lsof  nohup
                   timeout  vmstat  iostat  watch  systemctl  journalctl  crontab
  Networking       ip  ss  ping  curl  ufw  dig  host  nslookup  nc  traceroute
  Storage          lsblk  mount  umount  findmnt  df  du  tee  logrotate  blkid
                   pvcreate  vgcreate  lvcreate  pvs  vgs  lvs  mkfs
  Archives         tar  gzip  gunzip  zcat
  Packages         apt  apt-get  apt-cache  dpkg
  Scripting        bash  sh  printf  test  [  export  unset  set  alias  make
  Kernel & shell   sysctl  dmesg  lsmod  modinfo  which  type  uname
  Containers       docker  podman
  Version control  git
  Integrity        sha256sum  md5sum  diff
  System info      whoami  hostname  uname  date  history  clear

Game commands
  hint             reveal the next hint for this ticket (costs XP)
  submit ANSWER    answer a question ticket
  check [ITEM]     say why this ticket hasn't advanced; or inspect a file/service
  tracker          turn the optional speed tracker on or off
  stats            show your speed-tracker log (times per ticket)
  retry            restore the server to the start of this ticket
  repair           restore any game files you deleted (if you're stuck)
  mission          show the current ticket again
  man COMMAND      read the short manual for a command

Pipes (|), redirection (> >> < 2>), ; && || and * wildcards work.
Tab completes names. Up and Down recall earlier commands.
`);
};
CMDS.hint = () => { showHint(); };
CMDS.mission = () => { announceMission(); };
CMDS.tracker = () => { toggleTracker(); };
CMDS.stats = (a, ctx) => { statsLog(ctx); return 0; };
CMDS.retry = () => { doRetry(); };
CMDS.repair = (a, ctx) => {
  const n = repairWorld();
  if (n) { ctx.out(`Repaired: restored ${n} system file${n === 1 ? '' : 's'} the game needs (logs, configs, release files and the like) to their original state.\nYour own files, edits and progress were left untouched. If a ticket was stuck because something was missing, try the step again.\n`); render(); save(); }
  else ctx.out('Nothing to repair — every file the game needs is present. If a ticket still will not advance, type `check`.\n');
  return 0;
};

const FLAG_DIAG = {
  'run-script': "This ticket needs two things: <code>~/status.sh</code> must be executable (<code>chmod +x ~/status.sh</code>), and you must run it <i>in this ticket</i>. Running it is tracked per ticket, so even if you ran it earlier, run <code>./status.sh</code> again now (from your home directory, after the chmod). <code>check ~/status.sh</code> shows whether the executable bit is set.",
  'loop': "I confirm this by watching your script's output in this ticket. Run the loop script again now (for example <code>bash ~/releases.sh</code>) so I can see it list both releases.",
  'guard': "I check the line your script prints in this ticket. Run it again now with a directory that exists, e.g. <code>bash ~/check.sh /srv/halcyon</code>, so the success line appears.",
  'alive': "I watch for a request to localhost:8080 during this ticket. Run <code>curl -I http://localhost:8080</code> again now.",
  'list': "I watch for a <code>tar -tzf</code> listing during this ticket. Run it again now on your archive.",
  'logs': "I watch for a <code>docker logs</code> call during this ticket. Run <code>docker logs halcyon-web</code> again now.",
  'git-diff': "I watch for a <code>git diff</code> during this ticket. Run <code>git diff</code> again now (from inside <code>~/halcyon-app</code>)."
};
function checkInspect(arg, ctx) {
  const L = lookup(arg);
  if (!L.err) {
    const n = L.node;
    let out = `<b>check ${esc(L.abs)}</b><br>type: ${n.type === 'dir' ? 'directory' : 'file'} &middot; owner: ${esc(n.owner)}:${esc(n.group)} &middot; permissions: <code>${permStr(n)}</code> &middot; size: ${human(sizeOf(n))}`;
    if (n.type === 'file') {
      if (n.gz) out += '<br>(gzip-compressed)';
      else if (n.archive) out += `<br>(archive, ${n.archive.entries.length} entries)`;
      else { const body = splitLines(n.content).slice(0, 6); out += '<br>first lines:<br><code>' + (body.length ? body.map(esc).join('<br>') : '(empty)') + '</code>'; }
    } else {
      const names = Object.keys(n.children).filter(k => !k.startsWith('.'));
      out += '<br>contains: <code>' + (names.length ? esc(names.sort().join('  ')) : '(empty)') + '</code>';
    }
    emitSys(out, 'hint');
    return;
  }
  const svc = resolveSvc(arg);
  if (svc) { emitSys(`<b>check ${esc(arg)}</b><br>unit: ${esc(svc.unit)} &middot; ${svc.active ? 'active (running)' : 'inactive (dead)'} &middot; ${svc.enabled ? 'enabled' : 'disabled'}`, 'hint'); return; }
  const c = findC(arg);
  if (c) { emitSys(`<b>check ${esc(arg)}</b><br>container: ${esc(c.name)} &middot; image ${esc(c.image)} &middot; status: ${c.status}${c.ports ? ' &middot; ports ' + esc(c.ports) : ''}`, 'hint'); return; }
  if (S.packages && (S.packages.installed[arg] || S.packages.available[arg])) { emitSys(`<b>check ${esc(arg)}</b><br>package: ${S.packages.installed[arg] ? 'installed (' + S.packages.installed[arg] + ')' : 'available, not installed'}`, 'hint'); return; }
  emitSys(`<b>check ${esc(arg)}</b><br>Nothing is there &mdash; the game reports: ${esc(L.err)}. If you meant a file, give its full path, e.g. <code>check ~/status.sh</code>.`, 'hint');
}
CMDS.check = (a, ctx) => {
  const arg = a.join(' ').trim();
  if (arg) { checkInspect(arg, ctx); return 0; }
  if (S.finished) { emitSys('Every ticket is resolved &mdash; nothing left to check.', 'hint'); return 0; }
  const m = MISSIONS[S.mission];
  const head = `<b>Checking ${ticketId(S.mission)} &middot; ${esc(m.title)}</b><br>${md(m.objective)}`;
  if (m.answer) {
    emitSys(head + "<br><br>This is an <b>answer ticket</b>. Running the command that reveals the value is not enough on its own &mdash; you have to give me the answer with <code>submit YOUR_ANSWER</code> (for example <code>submit 200</code>). That is almost always why an answer ticket seems stuck.", 'hint');
    return 0;
  }
  if (m.check) {
    const objectiveMet = !!m.check();
    const masteryMet = !m.learning || learningMasteryPassed;
    const outcome = LSAFeedback.classifyOutcome({ objectiveMet: objectiveMet && masteryMet });
    if (outcome.category === 'success') {
      emitSys(head + `<br><br>&check; <b>${esc(outcome.title)}</b> — ${esc(outcome.reason)}<br>${esc(outcome.next)}`, 'ok');
      pendingComplete = true; return 0;
    }
    let extra = `<br><br><b>${esc(outcome.title)}</b><br>${esc(outcome.reason)}<br><b>Next step:</b> ${esc(outcome.next)}`;
    const fixed = repairWorld();
    if (fixed) extra += `<br><br>&#9888; The server was missing ${fixed} file${fixed === 1 ? '' : 's'} the game needs &mdash; something got deleted earlier. I restored ${fixed === 1 ? 'it' : 'them'} to the original state, so try the step again.`;
    if (FLAG_DIAG[m.id]) extra += '<br><br>' + FLAG_DIAG[m.id];
    if (m.fail) { const f = m.fail(); if (f) extra += '<br><br>&#9888; ' + md(f); }
    if (m.nudge) { const nu = m.nudge(); if (nu) extra += '<br><br>' + md(nu); }
    if (m.learning && !learningMasteryPassed) extra += '<br><br>Complete the understanding check in the Chapter learning guide on the left, then run <code>check</code> again.';
    emitSys(head + extra, 'hint');
    return 0;
  }
  emitSys(head, 'hint');
  return 0;
};

CMDS.submit = (a, ctx) => {
  if (S.finished) { ctx.out('All tickets are resolved.\n'); return 0; }
  const m = MISSIONS[S.mission];
  if (!m.answer) { ctx.out("This ticket closes on its own once the server is in the right state, so there is nothing to submit. Type `check` to see what it is waiting for.\n"); return 1; }
  const ans = a.join(' ').trim();
  if (!ans) { ctx.err('submit: type your answer after the word submit, for example: submit 42\n'); return 1; }
  if (m.answer(ans)) {
    if (m.learning && !learningMasteryPassed) {
      emitSys('That answer is right, but first complete the understanding check in the Chapter learning guide on the left. Then submit your answer again.', 'hint');
      return 0;
    }
    pendingComplete = true;
    return 0;
  }
  emitSys(`✗ "${esc(ans)}" isn't it. Check your output again, or type <code>hint</code>.`, 'warn');
  return 1;
};


/* ---------- processes, services, scheduling ---------- */
const SERVICE = n => S.services[n];
function fmtPs(list, full) {
  if (full) {
    const head = 'USER        PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
    const rows = list.map(p => `${p.user.padEnd(8)} ${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.vsz).padStart(6)} ${String(p.rss).padStart(5)} ${p.tty.padEnd(8)} ${p.stat.padEnd(4)} ${p.start.padStart(5)} ${p.time.padStart(6)} ${p.cmd}`);
    return head + '\n' + rows.join('\n') + '\n';
  }
  const head = '    PID TTY          TIME CMD';
  const rows = list.map(p => `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${p.time.padStart(8)} ${p.cmd.split(' ')[0].split('/').pop()}`);
  return head + '\n' + rows.join('\n') + '\n';
}
CMDS.ps = (a, ctx) => {
  const j = a.join('');
  const full = a.includes('aux') || a.includes('-ef') || a.includes('-e') || a.includes('-A') || a.includes('-ax') || (/a/.test(j) && /x/.test(j));
  let list = [...S.procs].sort((x, y) => x.pid - y.pid);
  if (!full) list = list.filter(x => x.user === RUNAS && x.tty !== '?');
  ctx.out(fmtPs(list, full));
  return 0;
};
CMDS.top = (a, ctx) => {
  const list = [...S.procs].sort((x, y) => y.cpu - x.cpu);
  const busy = list.filter(x => x.cpu > 50).length;
  ctx.out(`top - 11:03:42 up 1 day,  2:42,  1 user,  load average: 1.04, 0.71, 0.44\n`);
  ctx.out(`Tasks: ${list.length} total,   ${1 + busy} running, ${list.length - 1 - busy} sleeping,   0 stopped,   0 zombie\n`);
  ctx.out(`%Cpu(s): ${busy ? '96.7' : ' 3.1'} us,  1.1 sy,  0.0 ni, ${busy ? ' 2.0' : '95.6'} id,  0.1 wa,  0.0 hi,  0.1 si,  0.0 st\n`);
  ctx.out(`MiB Mem :   3936.0 total,    612.4 free,   1402.8 used,   1920.8 buff/cache\n\n`);
  ctx.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n');
  for (const p of list.slice(0, 12)) {
    const cmd = p.cmd.split(' ')[0].split('/').pop();
    ctx.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(8)} 20   0 ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)} ${String(Math.round(p.rss*0.3)).padStart(6)} ${p.stat[0]} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)} ${(p.time+'').padStart(8)} ${cmd}\n`);
  }
  return 0;
};
function releaseHeld(pid) {
  if (S.heldPid && S.heldPid === pid) { S.held = 0; S.heldPid = null; }
}
function stopProc(pid) {
  S.procs = S.procs.filter(z => z.pid !== pid);
  for (const k in S.services) if (S.services[k].mainpid === pid) S.services[k].active = false;
  releaseHeld(pid);
}
CMDS.kill = (a, ctx) => {
  const pids = [];
  for (const x of a) {
    if (x === '-l') { ctx.out(' 1) SIGHUP   2) SIGINT   3) SIGQUIT  9) SIGKILL 15) SIGTERM 18) SIGCONT 19) SIGSTOP\n'); return 0; }
    if (/^-(\d+)$/.test(x) || /^-(?:s)?(?:SIG)?[A-Z]+$/i.test(x) || x === '-s') continue;
    if (/^\d+$/.test(x)) pids.push(+x);
    else throw new Error(`invalid argument: ${x}`);
  }
  if (!pids.length) throw new Error('usage: kill [-SIGNAL] PID...');
  let sig = 'TERM';
  for (const x of a) { let m; if ((m = x.match(/^-(\d+)$/))) { sig = ({ '1': 'HUP', '2': 'INT', '3': 'QUIT', '9': 'KILL', '15': 'TERM', '18': 'CONT', '19': 'STOP' })[m[1]] || m[1]; } else if ((m = x.match(/^-(?:s)?(?:SIG)?([A-Z]+)$/i))) { if (x !== '-s') sig = m[1].toUpperCase(); } }
  const terminating = ['TERM', 'KILL', 'INT', 'QUIT', '9', '15'].includes(sig);
  let st = 0;
  for (const pid of pids) {
    const pr = S.procs.find(z => z.pid === pid);
    if (!pr) { ctx.err(`kill: (${pid}) - No such process\n`); st = 1; continue; }
    if (pid === 1 || (RUNAS !== 'root' && pr.user !== USER)) { ctx.err(`kill: (${pid}) - Operation not permitted\n`); st = 1; continue; }
    S.signalled = S.signalled || {}; S.signalled[pid] = sig;
    if (terminating) stopProc(pid);
  }
  return st;
};
CMDS.pkill = (a, ctx) => {
  const pat = a.filter(x => !x.startsWith('-')).pop();
  if (!pat) throw new Error('usage: pkill [-f] [-SIGNAL] PATTERN');
  let re; try { re = new RegExp(pat); } catch (e) { throw new Error(`invalid pattern: ${pat}`); }
  let killed = 0, denied = 0;
  for (const pr of [...S.procs]) {
    if (!re.test(pr.cmd)) continue;
    if (pr.pid === 1 || (RUNAS !== 'root' && pr.user !== USER)) { denied++; continue; }
    stopProc(pr.pid); killed++;
  }
  return killed ? 0 : 1;
};
function resolveSvc(raw) {
  if (!raw) return null;
  if (S.units && S.units[raw]) return S.units[raw];
  const base = raw.replace(/\.(service|timer)$/, '');
  if (S.services[base]) return S.services[base];
  if (S.units && S.units[base + '.service']) return S.units[base + '.service'];
  return null;
}
function daemonReload() {
  S.units = S.units || {};
  const dir = getNode('/etc/systemd/system');
  if (dir && dir.type === 'dir') for (const [fn, node] of Object.entries(dir.children)) {
    if (node.type !== 'file' || !/\.(service|timer)$/.test(fn)) continue;
    const c = node.content;
    const get = re => (c.match(re) || [])[1] || '';
    const prev = S.units[fn] || {};
    S.units[fn] = { unit: fn, desc: get(/^Description=(.*)$/m) || fn, exec: get(/^ExecStart=(.*)$/m), oncalendar: get(/^OnCalendar=(.*)$/m), kind: fn.endsWith('.timer') ? 'timer' : 'service', active: prev.active || false, enabled: prev.enabled || false, mainpid: prev.mainpid || 0, since: prev.since || 'Mon 2026-10-27 09:00:00 UTC' };
  }
  S.daemonReloaded = true;
}
CMDS.systemctl = (a, ctx) => {
  const sub = a[0];
  if (!sub) { ctx.err('systemctl: a command is required (try: systemctl status halcyon)\n'); return 1; }
  if (sub === 'list-units' || sub === 'list-unit-files') {
    ctx.out('UNIT                 LOAD   ACTIVE   SUB     DESCRIPTION\n');
    for (const k in S.services) { const v = S.services[k]; ctx.out(`${v.unit.padEnd(20)} loaded ${(v.active?'active':'inactive').padEnd(8)} ${(v.active?'running':'dead').padEnd(7)} ${v.desc}\n`); }
    return 0;
  }
  if (sub === 'daemon-reload' || sub === 'daemon-reexec') { if (needRoot(ctx, `Failed to reload daemon: Interactive authentication required.`)) return 1; daemonReload(); return 0; }
  if (sub === 'list-timers') {
    const timers = Object.values(S.units || {}).filter(u => u.kind === 'timer' && u.active);
    ctx.out('NEXT                        LEFT      UNIT                   ACTIVATES\n');
    for (const u of timers) ctx.out(`Wed 2026-10-28 00:00:00 UTC 13h left   ${u.unit.padEnd(22)} ${u.unit.replace(/\.timer$/, '.service')}\n`);
    ctx.out(`\n${timers.length} timers listed.\n`);
    return 0;
  }
  const rest1 = a.slice(1).filter(x => !x.startsWith('-'));
  const now = a.includes('--now');
  const name = rest1[0] || '';
  const svc = resolveSvc(name);
  if (sub === 'status') {
    if (!svc) { ctx.err(`Unit ${name || '(none)'}.service could not be found.\n`); return 4; }
    const dot = svc.active ? '●' : '○';
    ctx.out(`${dot} ${svc.unit} - ${svc.desc}\n`);
    ctx.out(`     Loaded: loaded (/lib/systemd/system/${svc.unit}; ${svc.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n`);
    ctx.out(`     Active: ${svc.active ? 'active (running)' : 'inactive (dead)'} since ${svc.since}\n`);
    if (svc.active) ctx.out(`   Main PID: ${svc.mainpid} (${svc.exec.split(' ')[0].split('/').pop()})\n`);
    ctx.out(`    CGroup: /system.slice/${svc.unit}\n             └─${svc.mainpid} ${svc.exec}\n`);
    return svc.active ? 0 : 3;
  }
  if (sub === 'is-active') { const quiet = a.includes('--quiet') || a.includes('-q'); if (!svc) { if (!quiet) ctx.out('inactive\n'); return 4; } if (!quiet) ctx.out((svc.active ? 'active' : 'inactive') + '\n'); return svc.active ? 0 : 3; }
  if (sub === 'is-enabled') { if (!svc) { ctx.out('not-found\n'); return 4; } ctx.out((svc.enabled ? 'enabled' : 'disabled') + '\n'); return svc.enabled ? 0 : 1; }
  if (['start', 'stop', 'restart', 'enable', 'disable', 'reload'].includes(sub)) {
    if (!svc) { ctx.err(`Failed to ${sub} ${name}.service: Unit ${name}.service not found.\n`); return 5; }
    if (needRoot(ctx, `Failed to ${sub} ${svc.unit}: Interactive authentication required.`)) return 1;
    if (sub === 'start' || sub === 'restart' || ((sub === 'enable') && now)) { svc.active = true; if (svc.mainpid && !S.procs.find(x => x.pid === svc.mainpid)) S.procs.push(reviveProc(name.replace(/\.(service|timer)$/, ''))); }
    if (sub === 'restart') { S.restarted = S.restarted || {}; S.restarted[name] = true; releaseHeld(svc.mainpid); }
    if (sub === 'start' && svc.mainpid) releaseHeld(svc.mainpid);
    if (sub === 'stop') stopProc(svc.mainpid);
    if (sub === 'disable' && now) stopProc(svc.mainpid);
    if (sub === 'enable') { svc.enabled = true; ctx.out(`Created symlink /etc/systemd/system/multi-user.target.wants/${svc.unit} -> /lib/systemd/system/${svc.unit}.\n`); }
    if (sub === 'disable') { svc.enabled = false; ctx.out(`Removed "/etc/systemd/system/multi-user.target.wants/${svc.unit}".\n`); }
    return 0;
  }
  ctx.err(`Unknown command verb ${sub}.\n`); return 1;
};
CMDS.journalctl = (a, ctx) => {
  const { f } = opts(a, 'exr', 'un', 'journalctl');
  let lines;
  if (f.u !== undefined) { const u = f.u.replace(/\.service$/, ''); lines = S.journal[u] ? [...S.journal[u]] : ['-- No entries --']; }
  else lines = Object.values(S.journal).flat();
  if (f.n !== undefined) { const n = parseInt(f.n, 10) || 10; lines = lines.slice(-n); }
  if (f.r) lines = [...lines].reverse();
  ctx.out(lines.join('\n') + '\n');
  return 0;
};
CMDS.crontab = (a, ctx) => {
  const { f, rest } = opts(a, 'lre', 'u', 'crontab');
  const user = f.u || RUNAS;
  if (user !== RUNAS && RUNAS !== 'root') { ctx.err('crontab: must be privileged to use -u\n'); return 1; }
  if (f.e) { ctx.err("crontab -e needs a full-screen editor, which this game doesn't have.\nUse `crontab -l` to view a crontab and `crontab -r` to remove it.\n"); return 1; }
  if (f.r) { if (!S.crontabs[user]) { ctx.err(`no crontab for ${user}\n`); return 1; } delete S.crontabs[user]; return 0; }
  if (rest.length) {
    let src;
    if (rest[0] === '-') src = ctx.stdin == null ? '' : ctx.stdin;
    else { const L = lookup(rest[0]); if (L.err || L.node.type !== 'file') { ctx.err(`crontab: ${rest[0]}: ${L.err || 'is a directory'}\n`); return 1; } src = L.node.content; }
    S.crontabs[user] = src.endsWith('\n') ? src : src + '\n';
    return 0;
  }
  if (!S.crontabs[user]) { ctx.err(`no crontab for ${user}\n`); return 1; }
  ctx.out(S.crontabs[user]);
  return 0;
};

/* ---------- networking ---------- */
CMDS.ss = (a, ctx) => {
  const { f } = opts(a, 'tulnp4aH', '', 'ss');
  const udpOnly = f.u && !f.t;
  const pcol = (proc, pid) => (f.p && RUNAS === 'root' && proc) ? `users:(("${proc}",pid=${pid},fd=6))` : '';
  const line = (st, la, lp, ra, rp, proc, pid) => `${st.padEnd(7)} 0      0     ${(la + ':' + lp).padEnd(22)} ${(ra + ':' + rp).padEnd(20)} ${pcol(proc, pid)}`.replace(/\s+$/, '');
  const out = ['State   Recv-Q Send-Q     Local Address:Port      Peer Address:Port  Process'];
  if (!udpOnly) {
    if (f.l || f.a) for (const c of S.net.listen) out.push(line('LISTEN', c.laddr, c.lport, c.laddr === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0', '*', c.proc, c.pid));
    if (!f.l) for (const c of S.net.estab) out.push(line('ESTAB', c.laddr, c.lport, c.raddr, c.rport, c.proc, c.pid));
  }
  ctx.out(out.join('\n') + '\n');
  return 0;
};
CMDS.ip = (a, ctx) => {
  const only6 = a.includes('-6');
  const obj = a.find(x => !x.startsWith('-'));
  if (obj === undefined || obj === 'a' || obj === 'addr' || obj === 'address') {
    S.net.ifaces.forEach((f, i) => {
      ctx.out(`${i + 1}: ${f.name}: <${f.flags}> mtu ${f.name === 'lo' ? 65536 : 1500} qdisc fq_codel state ${f.state} group default\n`);
      ctx.out(`    link/${f.name === 'lo' ? 'loopback' : 'ether'} ${f.mac} brd ff:ff:ff:ff:ff:ff\n`);
      if (!only6) ctx.out(`    inet ${f.ipv4}/${f.cidr} scope ${f.name === 'lo' ? 'host lo' : 'global ' + f.name}\n`);
    });
    return 0;
  }
  if (obj === 'r' || obj === 'route') { ctx.out(`default via ${S.net.gw} dev eth0 proto static\n10.0.4.0/24 dev eth0 proto kernel scope link src 10.0.4.12\n`); return 0; }
  if (obj === 'link') { S.net.ifaces.forEach((f, i) => ctx.out(`${i + 1}: ${f.name}: <${f.flags}> mtu ${f.name === 'lo' ? 65536 : 1500} state ${f.state}\n    link/${f.name === 'lo' ? 'loopback' : 'ether'} ${f.mac}\n`)); return 0; }
  ctx.err(`ip: unknown object "${obj}" (this game supports: a/addr, r/route, link)\n`); return 1;
};
CMDS.curl = (a, ctx) => {
  const { f, rest } = opts(a, 'IsSLkv', 'oH', 'curl');
  const url = rest[0];
  if (!url) { ctx.err("curl: try 'curl --help' for more information\n"); return 2; }
  let u = url; if (!/^[a-z]+:\/\//i.test(u)) u = 'http://' + u;
  const m = u.match(/^(https?):\/\/([^\/:]+)(?::(\d+))?(\/\S*)?$/i);
  if (!m) { ctx.err('curl: (3) URL using bad/illegal format or missing URL\n'); return 3; }
  const host = m[2], port = m[3] ? +m[3] : (m[1].toLowerCase() === 'https' ? 443 : 80);
  const local = host === 'localhost' || host === '127.0.0.1' || host === '10.0.4.12';
  if (local && port === 8080) {
    S.curledLocal = true;
    const body = '<!doctype html>\n<title>Halcyon Freight</title>\n<h1>Halcyon Freight</h1>\n<p>Shipment tracking is online.</p>\n';
    if (f.I) ctx.out(`HTTP/1.1 200 OK\nServer: halcyon/2.3.1\nContent-Type: text/html; charset=utf-8\nContent-Length: ${byteLen(body)}\nConnection: keep-alive\n\n`);
    else ctx.out(body);
    return 0;
  }
  if (local) { ctx.err(`curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Connection refused\n`); return 7; }
  ctx.err(`curl: (28) Failed to connect to ${host} port ${port}: Connection timed out\n`); return 28;
};
CMDS.ufw = (a, ctx) => {
  const sub = a[0];
  if (!sub || sub === 'status') {
    if (!S.firewall.active) { ctx.out('Status: inactive\n'); return 0; }
    let o = 'Status: active\n\nTo                         Action      From\n--                         ------      ----\n';
    for (const r of S.firewall.rules) o += `${(r.to || 'Anywhere').padEnd(26)} ${r.action.toUpperCase().padEnd(11)} ${r.from || 'Anywhere'}\n`;
    ctx.out(o); return 0;
  }
  if (needRoot(ctx, 'ERROR: You need to be root to run this script')) return 1;
  if (sub === 'enable') { S.firewall.active = true; ctx.out('Firewall is active and enabled on system startup\n'); return 0; }
  if (sub === 'disable') { S.firewall.active = false; ctx.out('Firewall stopped and disabled on system startup\n'); return 0; }
  if (sub === 'reset') { S.firewall = { active: false, rules: [] }; ctx.out('Backing up rules... done\nFirewall reset.\n'); return 0; }
  if (sub === 'deny' || sub === 'allow' || sub === 'reject') {
    const idx = a.indexOf('from');
    const from = idx >= 0 ? a[idx + 1] : null;
    let to = null;
    if (!from) { const port = a.slice(1).find(x => /^\d/.test(x)); to = port || 'Anywhere'; }
    S.firewall.rules.push({ action: sub, from, to: from ? 'Anywhere' : to });
    ctx.out('Rule added\n'); return 0;
  }
  ctx.err('ufw: unknown command (this game supports: status, enable, disable, deny from IP, allow PORT)\n'); return 1;
};
CMDS.ping = (a, ctx) => {
  const { f, rest } = opts(a, '', 'c', 'ping');
  const host = rest[0];
  if (!host) throw new Error('usage: ping [-c count] destination');
  const n = f.c ? Math.max(1, Math.min(10, parseInt(f.c, 10) || 4)) : 4;
  const known = { localhost: '127.0.0.1', '127.0.0.1': '127.0.0.1', '10.0.4.12': '10.0.4.12', '10.0.4.1': '10.0.4.1', '10.0.4.20': '10.0.4.20', 'halcyon-db01': '10.0.4.20', 'halcyon-web01': '10.0.4.12' };
  const ip = known[host];
  if (!ip) { ctx.err(`ping: ${host}: Name or service not known\n`); return 2; }
  ctx.out(`PING ${host} (${ip}) 56(84) bytes of data.\n`);
  let sum = 0;
  for (let i = 0; i < n; i++) { const t = (0.15 + Math.random() * 0.7).toFixed(3); sum += +t; ctx.out(`64 bytes from ${ip}: icmp_seq=${i + 1} ttl=64 time=${t} ms\n`); }
  ctx.out(`\n--- ${host} ping statistics ---\n${n} packets transmitted, ${n} received, 0% packet loss, time ${n * 1000 - 1}ms\n`);
  ctx.out(`rtt min/avg/max/mdev = 0.150/${(sum / n).toFixed(3)}/0.850/0.100 ms\n`);
  return 0;
};


/* ---------- storage, archives, packages ---------- */
function sizeToBytes(x) { const m = String(x).match(/^([\d.]+)\s*([KMGT]?)/i); return m ? Math.round(parseFloat(m[1]) * Math.pow(1024, ' KMGT'.indexOf((m[2] || ' ').toUpperCase()))) : 0; }
function allParts() { const out = []; for (const d of S.disks) for (const c of d.children) out.push(c); return out; }
CMDS.lsblk = (a, ctx) => {
  ctx.out('NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\n');
  S.disks.forEach((d, di) => {
    ctx.out(`${d.name.padEnd(6)} 25${di}:0    0 ${d.size.padStart(5)}  0 disk\n`);
    d.children.forEach((c, ci) => {
      const br = ci === d.children.length - 1 ? '└─' : '├─';
      ctx.out(`${(br + c.name).padEnd(6)} 25${di}:${ci + 1}    0 ${c.size.padStart(5)}  0 part ${c.mp || ''}\n`.replace(/\s+$/, '\n'));
    });
  });
  return 0;
};
CMDS.mount = (a, ctx) => {
  const { f, rest } = opts(a, 'a', 't', 'mount');
  if (f.a) {
    if (needRoot(ctx, 'mount: only root can do that')) return 1;
    let st = 0;
    for (const line of splitLines(getNode('/etc/fstab').content)) {
      if (/^\s*#/.test(line) || !line.trim()) continue;
      const pr = line.trim().split(/\s+/); const dev = pr[0], mp = pr[1], ty = pr[2] || 'ext4';
      if (!dev || !mp || mp === 'none') continue;
      if (S.mounts.find(m => m.mp === mp)) continue;
      const part = allParts().find(x => '/dev/' + x.name === dev);
      if (!/^\/dev\//.test(dev) || !part) continue;
      if (!getNode(mp) || getNode(mp).type !== 'dir') { ctx.err(`mount: mount point ${mp} does not exist\n`); st = 32; continue; }
      S.mounts.push({ dev, mp, fstype: ty, size: sizeToBytes(part.size) }); part.mp = mp; S.mountedAll = true;
    }
    return st;
  }
  if (!rest.length) { for (const m of S.mounts) ctx.out(`${m.dev} on ${m.mp} type ${m.fstype} (rw,relatime)\n`); return 0; }
  if (rest.length < 2) { ctx.err('mount: a device and a mount point are needed, e.g. mount /dev/vdb1 /mnt/backups\n'); return 1; }
  if (needRoot(ctx, 'mount: only root can use the mount(8) command')) return 1;
  const dev = rest[0], mp = norm(rest[1], S.cwd);
  const part = allParts().find(x => '/dev/' + x.name === dev);
  const lv = (S.lvm && S.lvm.lvs) ? S.lvm.lvs.find(l => l.dev === dev) : null;
  if (!part && !lv) { ctx.err(`mount: special device ${dev} does not exist.\n`); return 32; }
  const mn = getNode(mp);
  if (!mn || mn.type !== 'dir') { ctx.err(`mount: mount point ${rest[1]} does not exist.\n`); return 32; }
  if (S.mounts.find(m => m.mp === mp)) { ctx.err(`mount: ${rest[1]}: already mounted.\n`); return 32; }
  S.mounts.push({ dev, mp, fstype: (part || lv).fstype || 'ext4', size: lv ? sizeToBytes(lv.size) : sizeToBytes(part.size) }); if (part) part.mp = mp; else lv.mp = mp;
  return 0;
};
CMDS.umount = (a, ctx) => {
  const t = a.filter(x => !x.startsWith('-'))[0];
  if (!t) throw new Error('usage: umount DIR | DEVICE');
  if (needRoot(ctx, 'umount: only root can unmount filesystems')) return 1;
  const abs = norm(t, S.cwd);
  const idx = S.mounts.findIndex(m => m.mp === abs || m.dev === t);
  if (idx < 0) { ctx.err(`umount: ${t}: not mounted.\n`); return 32; }
  if (S.mounts[idx].mp === '/') { ctx.err('umount: /: target is busy.\n'); return 32; }
  const part = allParts().find(x => '/dev/' + x.name === S.mounts[idx].dev); if (part) part.mp = '';
  S.mounts.splice(idx, 1);
  return 0;
};
CMDS.findmnt = (a, ctx) => {
  const t = a.filter(x => !x.startsWith('-'))[0];
  const list = t ? S.mounts.filter(m => m.mp === norm(t, S.cwd) || m.dev === t) : S.mounts;
  if (t && !list.length) return 1;
  ctx.out('TARGET          SOURCE     FSTYPE OPTIONS\n');
  for (const m of list) ctx.out(`${m.mp.padEnd(15)} ${m.dev.padEnd(10)} ${m.fstype.padEnd(6)} rw,relatime\n`);
  return 0;
};
CMDS.tee = (a, ctx) => {
  const { f, rest } = opts(a, 'a', '', 'tee');
  const data = ctx.stdin == null ? '' : ctx.stdin;
  ctx.out(data);
  let st = 0;
  for (const t of rest) { const e = writeFile(norm(t, S.cwd), data, f.a); if (e) { ctx.err(`tee: ${t}: ${e}\n`); st = 1; } }
  return st;
};
function mkdirsUnder(baseAbs, relPath) {
  let cur = baseAbs;
  for (const seg of relPath.split('/').filter(Boolean)) {
    cur = joinAbs(cur, seg);
    if (!getNode(cur)) { const par = getNode(parentOf(cur)); if (par && par.type === 'dir') par.children[seg] = D({}, { owner: RUNAS, mtime: Date.now() }); }
  }
  return cur;
}
CMDS.tar = (a, ctx) => {
  let mode = null, v = false, file = null, cdir = null; const files = [];
  for (let i = 0; i < a.length; i++) {
    let x = a[i];
    if (x === '-C') { cdir = a[++i]; continue; }
    if (x === '--create') { mode = 'c'; continue; } if (x === '--extract' || x === '--get') { mode = 'x'; continue; }
    if (x === '--list') { mode = 't'; continue; } if (x === '--gzip') { continue; } if (x === '--verbose') { v = true; continue; }
    if (x === '--file') { file = a[++i]; continue; }
    if ((i === 0 || x[0] === '-') && /^-?[cxtzvjf]+$/.test(x)) {
      const fl = x.replace(/^-/, '');
      for (let j = 0; j < fl.length; j++) {
        const c = fl[j];
        if (c === 'c') mode = 'c'; else if (c === 'x') mode = 'x'; else if (c === 't') mode = 't';
        else if (c === 'z' || c === 'j' || c === 'v') { if (c === 'v') v = true; }
        else if (c === 'f') { let val = fl.slice(j + 1); if (val === '') val = a[++i]; file = val; j = fl.length; }
      }
      continue;
    }
    files.push(x);
  }
  if (!mode) throw new Error("You must specify one of the '-Actrux', '--delete' or '--test-label' options");
  if (!file) throw new Error('Refusing to read archive contents from terminal (missing -f option?)');
  const fabs = norm(file, S.cwd);
  if (mode === 'c') {
    if (!files.length) throw new Error('Cowardly refusing to create an empty archive');
    const entries = [];
    const add = (abs, rel, node) => { entries.push({ path: rel, type: node.type, node: JSON.parse(JSON.stringify(node)) }); if (v) ctx.out(rel + (node.type === 'dir' ? '/' : '') + '\n'); if (node.type === 'dir') for (const k of Object.keys(node.children).sort()) add(joinAbs(abs, k), rel + '/' + k, node.children[k]); };
    for (const fa of files) {
      const L = lookup(fa);
      if (L.err) { ctx.err(`tar: ${fa}: Cannot stat: ${L.err}\n`); continue; }
      if (!canRead(L.node)) { ctx.err(`tar: ${fa}: Cannot open: Permission denied\n`); continue; }
      add(L.abs, fa.replace(/^\//, '').replace(/^\.\//, '').replace(/\/$/, ''), L.node);
    }
    if (!entries.length) { ctx.err('tar: Error is not recoverable: exiting now\n'); return 2; }
    const node = F('(gzip-compressed data - tar archive)\n', { owner: RUNAS, mtime: Date.now() });
    node.archive = { entries }; node.size = Math.max(512, Math.round(entries.reduce((n, e) => n + (e.node.size || byteLen(e.node.content || '')), 0) * 0.35));
    const e = place(fabs, node);
    if (e) { ctx.err(`tar: ${file}: Cannot open: ${e}\n`); return 2; }
    return 0;
  }
  const L = lookup(file);
  if (L.err || L.node.type !== 'file') { ctx.err(`tar: ${file}: Cannot open: ${L.err || 'Is a directory'}\n`); return 2; }
  if (!L.node.archive) { ctx.err('\ngzip: stdin: not in gzip format\ntar: Child returned status 1\ntar: Error is not recoverable: exiting now\n'); return 2; }
  if (mode === 't') { S.tarListed = true; ctx.out(L.node.archive.entries.map(e => e.path + (e.type === 'dir' ? '/' : '')).join('\n') + '\n'); return 0; }
  const base = cdir ? norm(cdir, S.cwd) : S.cwd;
  if (!getNode(base) || getNode(base).type !== 'dir') { ctx.err(`tar: ${cdir}: Cannot change directory: No such file or directory\n`); return 2; }
  for (const en of L.node.archive.entries) {
    if (en.type === 'dir') { mkdirsUnder(base, en.path); }
    else { const slash = en.path.lastIndexOf('/'); if (slash > 0) mkdirsUnder(base, en.path.slice(0, slash)); const nn = JSON.parse(JSON.stringify(en.node)); nn.owner = RUNAS; nn.group = RUNAS; nn.mtime = Date.now(); place(joinAbs(base, en.path), nn); }
    if (v) ctx.out(en.path + (en.type === 'dir' ? '/' : '') + '\n');
  }
  return 0;
};
CMDS.gzip = (a, ctx) => {
  const { f, rest } = opts(a, 'dkcr', '', 'gzip');
  if (!rest.length) throw new Error('compressed data not written to a terminal. Give a file name.');
  let st = 0;
  for (const t of rest) {
    const L = lookup(t);
    if (L.err) { ctx.err(`gzip: ${t}: ${L.err}\n`); st = 1; continue; }
    if (L.node.type === 'dir') { ctx.err(`gzip: ${t} is a directory -- ignored\n`); st = 1; continue; }
    const par = getNode(parentOf(L.abs));
    if (f.d) {
      if (!t.endsWith('.gz')) { ctx.err(`gzip: ${t}: unknown suffix -- ignored\n`); st = 1; continue; }
      const out = baseName(L.abs).replace(/\.gz$/, '');
      if (!canWrite(L.abs)) { ctx.err(`gzip: ${t}: Permission denied\n`); st = 1; continue; }
      const node = L.node; delete node.gz; delete node.size;
      par.children[out] = node; syncRecordDeletion(L.abs, node); delete par.children[baseName(L.abs)];
    } else {
      if (t.endsWith('.gz')) { ctx.err(`gzip: ${t} already has .gz suffix -- unchanged\n`); st = 1; continue; }
      if (!canWrite(L.abs)) { ctx.err(`gzip: ${t}: Permission denied\n`); st = 1; continue; }
      const node = L.node; node.gz = true; node.size = Math.max(32, Math.round(sizeOf(node) * 0.4));
      par.children[baseName(L.abs) + '.gz'] = node; syncRecordDeletion(L.abs, node); delete par.children[baseName(L.abs)];
    }
  }
  return st;
};
CMDS.gunzip = (a, ctx) => CMDS.gzip(['-d', ...a], ctx);
CMDS.zcat = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'zcat'); ctx.out(I.res.map(x => x.content).join('')); return I.st; };
const PKG_DESC = { fail2ban: 'Ban hosts that cause multiple authentication errors', htop: 'interactive processes viewer', tree: 'displays an indented directory tree, in colour', ncdu: 'ncurses disk usage viewer', 'openssh-server': 'secure shell (SSH) server, for remote access', cron: 'process scheduling daemon', rsyslog: 'reliable system and kernel logging daemon', coreutils: 'GNU core utilities', bash: 'GNU Bourne Again SHell', ufw: 'program for managing a netfilter firewall', tar: 'GNU version of the tar archiving utility' };
function aptSearch(terms, ctx) {
  const q = (terms[0] || '').toLowerCase();
  const all = { ...S.packages.available, ...S.packages.installed };
  const hits = Object.keys(all).filter(n => n.includes(q) || (PKG_DESC[n] || '').toLowerCase().includes(q)).sort();
  if (q) S.aptSearched = true;
  for (const n of hits) ctx.out(`${n}/noble ${all[n]} amd64\n  ${PKG_DESC[n] || ''}\n`);
  return 0;
}
function aptGet(a, ctx) {
  const sub = a[0], pkgs = a.slice(1).filter(x => !x.startsWith('-'));
  if (sub === 'update') { if (needRoot(ctx, 'Reading package lists... Done\nE: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)')) return 1; S.aptUpdated = true; ctx.out('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nHit:2 http://security.ubuntu.com/ubuntu noble-security InRelease\nReading package lists... Done\n'); return 0; }
  if (sub === 'install') {
    if (needRoot(ctx, 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?')) return 1;
    if (!pkgs.length) { ctx.err('E: You must give at least one package to install\n'); return 1; }
    for (const name of pkgs) {
      if (S.packages.installed[name]) { ctx.out(`${name} is already the newest version (${S.packages.installed[name]}).\n`); continue; }
      const ver = S.packages.available[name];
      if (!ver) { ctx.err(`E: Unable to locate package ${name}\n`); return 100; }
      S.packages.installed[name] = ver; delete S.packages.available[name];
      ctx.out(`Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${name}\n0 upgraded, 1 newly installed, 0 to remove.\nSetting up ${name} (${ver}) ...\n`);
      if (name === 'fail2ban' && !S.services.fail2ban) S.services.fail2ban = { unit: 'fail2ban.service', desc: 'Fail2Ban Service', active: false, enabled: false, mainpid: 2890, since: '', exec: '/usr/bin/python3 /usr/bin/fail2ban-server -xf start' };
    }
    return 0;
  }
  if (sub === 'remove' || sub === 'purge') { if (needRoot(ctx, 'E: Unable to acquire the dpkg frontend lock, are you root?')) return 1; for (const name of pkgs) { if (S.packages.installed[name]) { S.packages.available[name] = S.packages.installed[name]; delete S.packages.installed[name]; ctx.out(`Removing ${name} ...\n`); } else ctx.err(`Package '${name}' is not installed, so not removed\n`); } return 0; }
  if (sub === 'upgrade' || sub === 'dist-upgrade') { if (needRoot(ctx, 'E: Unable to acquire the dpkg frontend lock, are you root?')) return 1; ctx.out('Reading package lists... Done\nBuilding dependency tree... Done\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n'); return 0; }
  ctx.err(`E: Invalid operation ${sub}\n`); return 100;
}
function aptShow(terms, ctx) {
  const n = terms[0]; const all = { ...S.packages.available, ...S.packages.installed };
  if (!all[n]) { ctx.err(`N: Unable to locate package ${n}\n`); return 100; }
  ctx.out(`Package: ${n}\nVersion: ${all[n]}\nPriority: optional\nDescription: ${PKG_DESC[n] || n}\n`);
  return 0;
}
CMDS.apt = (a, ctx) => {
  const sub = a[0];
  if (sub === 'search') return aptSearch(a.slice(1), ctx);
  if (sub === 'show') return aptShow(a.slice(1), ctx);
  if (sub === 'list') {
    const onlyInst = a.includes('--installed');
    const set = onlyInst ? S.packages.installed : { ...S.packages.installed, ...S.packages.available };
    ctx.out('Listing... Done\n');
    for (const n of Object.keys(set).sort()) ctx.out(`${n}/noble ${set[n]} amd64${S.packages.installed[n] ? ' [installed]' : ''}\n`);
    return 0;
  }
  if (['update', 'install', 'remove', 'purge', 'upgrade', 'full-upgrade'].includes(sub)) return aptGet(sub === 'full-upgrade' ? ['upgrade'] : a, ctx);
  ctx.err(`E: Invalid operation ${sub || ''}\n`); return 100;
};
CMDS['apt-get'] = (a, ctx) => aptGet(a, ctx);
CMDS['apt-cache'] = (a, ctx) => { if (a[0] === 'search') return aptSearch(a.slice(1), ctx); if (a[0] === 'show') return aptShow(a.slice(1), ctx); ctx.err('apt-cache: this game supports: search, show\n'); return 1; };
CMDS.dpkg = (a, ctx) => {
  const { f, rest } = opts(a, 'l', '', 'dpkg');
  if (f.l) {
    const q = rest[0];
    const pattern = q ? new RegExp('^' + q.split('*').map(reEsc).join('.*') + '$') : null;
    const names = Object.keys(S.packages.installed).filter(n => !q || n === q || pattern.test(n)).sort();
    if (q && !names.length) { ctx.err(`dpkg-query: no packages found matching ${q}\n`); return 1; }
    ctx.out('Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version        Architecture Description\n+++-==============-==============-============-=================================\n');
    for (const n of names) ctx.out(`ii  ${n.padEnd(14)} ${S.packages.installed[n].padEnd(14)} amd64        ${PKG_DESC[n] || n}\n`);
    return 0;
  }
  ctx.err("dpkg: need an action option (this game supports: dpkg -l [pattern])\n"); return 1;
};


/* ---------- log rotation, containers, version control ---------- */
function rotateOne(path, compress, rotateN) {
  const node = getNode(path); if (!node || node.type !== 'file') return false;
  const par = getNode(parentOf(path)); const base = baseName(path);
  for (let k = rotateN - 1; k >= 1; k--) {
    if (par.children[base + '.' + k + '.gz']) { par.children[base + '.' + (k + 1) + '.gz'] = par.children[base + '.' + k + '.gz']; delete par.children[base + '.' + k + '.gz']; }
    if (par.children[base + '.' + k]) { par.children[base + '.' + (k + 1)] = par.children[base + '.' + k]; delete par.children[base + '.' + k]; }
  }
  par.children[base + '.1'] = node;
  par.children[base] = F('', { owner: node.owner, group: node.group, mode: node.mode, mtime: Date.now() });
  if (compress) { const n1 = par.children[base + '.1']; n1.gz = true; n1.size = Math.max(32, Math.round(sizeOf(n1) * 0.4)); par.children[base + '.1.gz'] = n1; delete par.children[base + '.1']; }
  return true;
}
CMDS.logrotate = (a, ctx) => {
  const { f, rest } = opts(a, 'fv', '', 'logrotate');
  const cfg = rest[0];
  if (!cfg) { ctx.err('logrotate: a configuration file is required\n'); return 1; }
  const L = lookup(cfg);
  if (L.err || L.node.type !== 'file') { ctx.err(`logrotate: cannot read ${cfg}: ${L.err || 'is a directory'}\n`); return 1; }
  if (!f.f) { ctx.out('logrotate: nothing to do (use -f to force a rotation now)\n'); return 0; }
  if (needRoot(ctx, 'error: cannot rotate these logs without root (try sudo)')) return 1;
  const content = L.node.content;
  const compress = /^\s*compress\b/m.test(content);
  const rotateN = parseInt((content.match(/rotate\s+(\d+)/) || [])[1] || '4', 10);
  const pat = (content.match(/^\s*([^\s{#].*?)\s*\{/m) || [])[1];
  if (!pat) { ctx.err('logrotate: no log files specified in config\n'); return 1; }
  let rotated = 0;
  for (const g of pat.split(/\s+/)) for (const path of globExpand(norm(g, S.cwd))) {
    const n = getNode(path);
    if (n && n.type === 'file' && !/\.\d+(\.gz)?$/.test(path)) { if (rotateOne(path, compress, rotateN)) rotated++; }
  }
  if (f.v) ctx.out(`rotated ${rotated} log file(s)\n`);
  return 0;
};
function randHex(n) { let s2 = ''; for (let i = 0; i < n; i++) s2 += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s2; }
function findC(ref) { return S.containers.find(c => c.name === ref || c.id === ref || c.id.startsWith(ref)); }
function dockerCmd(a, ctx) {
  const sub = a[0];
  if (!sub || sub === '--help') { ctx.out('Usage: docker COMMAND\n\nCommands: images, pull, run, ps, logs, exec, stop, start, rm, rmi\n'); return 0; }
  if (sub === 'version' || sub === '--version') { ctx.out('Docker version 26.1.0, build 1234567\n'); return 0; }
  if (sub === 'images') {
    ctx.out('REPOSITORY     TAG       IMAGE ID       CREATED       SIZE\n');
    for (const im of S.images) ctx.out(`${im.repo.padEnd(14)} ${im.tag.padEnd(9)} ${im.id.padEnd(14)} 2 days ago    ${im.size}\n`);
    return 0;
  }
  if (sub === 'pull') { const ref = a[1] || ''; const [repo, tag = 'latest'] = ref.split(':'); if (!repo) { ctx.err('"docker pull" requires 1 argument\n'); return 1; } if (!S.images.find(im => im.repo === repo && im.tag === tag)) S.images.push({ repo, tag, id: randHex(12), size: '140MB' }); ctx.out(`${tag}: Pulling from ${repo}\nStatus: Downloaded newer image for ${ref}\n`); return 0; }
  if (sub === 'ps') {
    const all = a.includes('-a') || a.includes('--all');
    ctx.out('CONTAINER ID   IMAGE                COMMAND            STATUS           PORTS                      NAMES\n');
    for (const c of S.containers) { if (!all && c.status !== 'running') continue; ctx.out(`${c.id.slice(0, 12).padEnd(14)} ${c.image.padEnd(20)} "${c.cmd}"`.padEnd(54) + ` ${(c.status === 'running' ? 'Up 2 minutes' : 'Exited (0) 1h ago').padEnd(16)} ${(c.ports || '').padEnd(26)} ${c.name}\n`); }
    return 0;
  }
  if (sub === 'run') {
    let name = null, ports = null, image = null;
    for (let i = 1; i < a.length; i++) { const x = a[i]; if (x === '--name') name = a[++i]; else if (x === '-p' || x === '--publish') ports = a[++i]; else if (x.startsWith('-')) { continue; } else { image = x; break; } }
    if (!image) { ctx.err('"docker run" requires at least 1 argument\n'); return 1; }
    const img = S.images.find(im => `${im.repo}:${im.tag}` === image || (im.repo === image && im.tag === 'latest'));
    if (!img) { ctx.err(`Unable to find image '${image}' locally\ndocker: Error response from daemon: not found.\n`); return 125; }
    if (name && S.containers.find(c => c.name === name)) { ctx.err(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.\n`); return 125; }
    const id = randHex(64); const hp = ports ? ports.split(':')[0] : '';
    S.containers.push({ id, name: name || ('eager_' + randHex(4)), image, cmd: 'halcyon-worker', status: 'running', hostport: hp, ports: ports ? `0.0.0.0:${hp}->${(ports.split(':')[1] || hp)}/tcp` : '', logs: 'halcyon-worker: listening on 0.0.0.0:8080\nhalcyon-worker: 4 workers ready\nhalcyon-worker: health check ok\n' });
    ctx.out(id + '\n');
    return 0;
  }
  if (sub === 'logs') { const c = findC(a[a.length - 1]); if (!c) { ctx.err(`Error: No such container: ${a[a.length - 1]}\n`); return 1; } ctx.out(c.logs); S.dockerLogged = true; return 0; }
  if (sub === 'exec') {
    const args = a.slice(1).filter(x => !x.startsWith('-')); const c = findC(args[0]);
    if (!c) { ctx.err(`Error: No such container: ${args[0]}\n`); return 1; }
    if (c.status !== 'running') { ctx.err(`Error response from daemon: container ${c.name} is not running\n`); return 1; }
    const cmd = args.slice(1), joined = cmd.join(' ');
    if (cmd[0] === 'hostname') ctx.out(c.id.slice(0, 12) + '\n');
    else if (cmd[0] === 'ls') ctx.out('app  bin  etc  var\n');
    else if (/version|release/i.test(joined)) ctx.out('halcyon 2.4.0 (build 3f9a1c)\n');
    else if (cmd[0] === 'cat') ctx.out('2.4.0\n');
    else if (cmd[0] === 'env' || cmd[0] === 'printenv') ctx.out('HALCYON_ENV=production\nHALCYON_VERSION=2.4.0\n');
    else ctx.out('');
    return 0;
  }
  if (sub === 'stop') { const c = findC(a[a.length - 1]); if (!c) { ctx.err(`Error: No such container: ${a[a.length - 1]}\n`); return 1; } c.status = 'exited'; ctx.out(c.name + '\n'); return 0; }
  if (sub === 'start') { const c = findC(a[a.length - 1]); if (!c) { ctx.err(`Error: No such container: ${a[a.length - 1]}\n`); return 1; } c.status = 'running'; ctx.out(c.name + '\n'); return 0; }
  if (sub === 'rm') { const force = a.includes('-f') || a.includes('--force'); const ref = a[a.length - 1]; const i = S.containers.findIndex(c => c.name === ref || c.id.startsWith(ref)); if (i < 0) { ctx.err(`Error: No such container: ${ref}\n`); return 1; } if (S.containers[i].status === 'running' && !force) { ctx.err(`Error response from daemon: You cannot remove a running container. Stop the container before attempting removal or force remove (-f)\n`); return 1; } const nm = S.containers[i].name; S.containers.splice(i, 1); ctx.out(nm + '\n'); return 0; }
  if (sub === 'rmi') { const ref = a[a.length - 1]; const i = S.images.findIndex(im => `${im.repo}:${im.tag}` === ref || im.id.startsWith(ref)); if (i < 0) { ctx.err(`Error: No such image: ${ref}\n`); return 1; } S.images.splice(i, 1); ctx.out(`Untagged: ${ref}\n`); return 0; }
  ctx.err(`docker: '${sub}' is not a supported command in this game.\n`); return 1;
}
CMDS.docker = dockerCmd; CMDS.podman = dockerCmd;
CMDS.git = (a, ctx) => {
  const sub = a[0]; const R2 = S.repo;
  if (sub === '--version' || sub === 'version') { ctx.out('git version 2.43.0\n'); return 0; }
  const inRepo = S.cwd === R2.dir || S.cwd.startsWith(R2.dir + '/');
  if (!inRepo && sub !== 'init' && sub !== 'clone') { ctx.err('fatal: not a git repository (or any of the parent directories): .git\n'); return 128; }
  if (sub === 'status') {
    ctx.out(`On branch ${R2.branch}\n`);
    if (R2.staged.length) { ctx.out('Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n'); for (const f of R2.staged) ctx.out(`\tmodified:   ${f}\n`); ctx.out('\n'); }
    if (R2.unstaged.length) { ctx.out('Changes not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n'); for (const f of R2.unstaged) ctx.out(`\tmodified:   ${f}\n`); ctx.out('\n'); }
    if (R2.untracked.length) { ctx.out('Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n'); for (const f of R2.untracked) ctx.out(`\t${f}\n`); ctx.out('\n'); }
    if (!R2.staged.length && !R2.unstaged.length && !R2.untracked.length) ctx.out('nothing to commit, working tree clean\n');
    return 0;
  }
  if (sub === 'log') { const one = a.includes('--oneline'); for (const c of R2.commits) { if (one) ctx.out(`${c.hash} ${c.msg}\n`); else ctx.out(`commit ${c.hash}${randHex(33)}\nAuthor: rookie <rookie@halcyon-web01>\nDate:   Tue Oct 27 09:00:00 2026 +0000\n\n    ${c.msg}\n\n`); } return 0; }
  if (sub === 'diff') { const files = R2.unstaged.concat(R2.staged); if (!files.length) return 0; for (const f of files) ctx.out(`diff --git a/${f} b/${f}\nindex 1a2b3c4..5d6e7f8 100644\n--- a/${f}\n+++ b/${f}\n@@ -1,4 +1,4 @@\n [workers]\n-count = 2\n+count = 4\n`); S.gitDiffed = true; return 0; }
  if (sub === 'add') { const args = a.slice(1); let take = []; if (args.includes('-A') || args.includes('--all') || args.includes('.')) take = [...R2.unstaged, ...R2.untracked]; else for (const f of args) if (R2.unstaged.includes(f) || R2.untracked.includes(f)) take.push(f); for (const f of take) { if (!R2.staged.includes(f)) R2.staged.push(f); R2.unstaged = R2.unstaged.filter(x => x !== f); R2.untracked = R2.untracked.filter(x => x !== f); } return 0; }
  if (sub === 'commit') { const mi = a.indexOf('-m'); const msg = mi >= 0 ? a[mi + 1] : null; if (!msg) { ctx.err('this game needs a commit message: git commit -m "message"\n'); return 1; } if (!R2.staged.length) { ctx.out(`On branch ${R2.branch}\nnothing to commit, working tree clean\n`); return 1; } const hash = randHex(7); const n = R2.staged.length; R2.commits.unshift({ hash, msg }); R2.staged = []; ctx.out(`[${R2.branch} ${hash}] ${msg}\n ${n} file${n > 1 ? 's' : ''} changed\n`); return 0; }
  if (sub === 'branch') { if (a[1] && !a[1].startsWith('-')) { if (!R2.branches.includes(a[1])) R2.branches.push(a[1]); return 0; } for (const bn of R2.branches) ctx.out(`${bn === R2.branch ? '* ' : '  '}${bn}\n`); return 0; }
  if (sub === 'checkout' || sub === 'switch') { if (a[1] === '-b' || a[1] === '-c') { const bn = a[2]; if (!R2.branches.includes(bn)) R2.branches.push(bn); R2.branch = bn; ctx.out(`Switched to a new branch '${bn}'\n`); return 0; } const bn = a[1]; if (R2.branches.includes(bn)) { R2.branch = bn; ctx.out(`Switched to branch '${bn}'\n`); return 0; } ctx.err(`error: pathspec '${bn}' did not match any file(s) known to git\n`); return 1; }
  if (sub === 'tag') { if (a[1] && !a[1].startsWith('-')) { if (!R2.tags.includes(a[1])) R2.tags.push(a[1]); return 0; } for (const t of R2.tags) ctx.out(t + '\n'); return 0; }
  if (sub === 'init') { ctx.out('Initialized empty Git repository in ' + S.cwd + '/.git/\n'); return 0; }
  ctx.err(`git: '${sub}' is not supported in this game (try: status, log, diff, add, commit, branch, checkout, tag).\n`); return 1;
};


/* ---------- performance, accounts, integrity (chapters 16-20) ---------- */
CMDS.uptime = (a, ctx) => {
  const d = new Date(); const high = S.procs.some(x => x.cpu > 100);
  const la = S.iowait ? '12.40, 11.90, 8.30' : (high ? '4.21, 3.08, 1.74' : '0.09, 0.14, 0.11');
  ctx.out(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} up 6 days,  3:12,  1 user,  load average: ${la}\n`);
  return 0;
};
CMDS.free = (a, ctx) => {
  const h = a.includes('-h') || a.includes('-m');
  const mb = n => h ? (n >= 1024 ? (n / 1024).toFixed(1) + 'Gi' : n + 'Mi') : String(n * 1024);
  const total = 3936, used = S.procs.some(x => x.cpu > 100) ? 2680 : 1402, cache = 612, free2 = total - used - cache, avail = total - used;
  ctx.out('               total        used        free      shared  buff/cache   available\n');
  ctx.out('Mem:   ' + [total, used, free2, 18, cache, avail].map(v => String(mb(v)).padStart(12)).join('') + '\n');
  ctx.out('Swap:  ' + [2048, 0, 2048].map(v => String(mb(v)).padStart(12)).join('') + '\n');
  return 0;
};
CMDS.renice = (a, ctx) => {
  let n = null; const pids = [];
  for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === '-n') { n = parseInt(a[++i], 10); } else if (x === '-p') { continue; } else if (/^[+-]?\d+$/.test(x)) { if (n === null) n = parseInt(x, 10); else pids.push(parseInt(x, 10)); } }
  if (n === null || !pids.length) throw new Error('usage: renice [-n] PRIORITY [-p] PID...');
  let st = 0;
  for (const pid of pids) {
    const pr = S.procs.find(z => z.pid === pid);
    if (!pr) { ctx.err(`renice: failed to set priority for ${pid} (No such process)\n`); st = 1; continue; }
    if ((RUNAS !== 'root' && pr.user !== USER) || (n < (pr.nice || 0) && RUNAS !== 'root')) { ctx.err(`renice: failed to set priority for ${pid} (Operation not permitted)\n`); st = 1; continue; }
    const old = pr.nice || 0; pr.nice = n; ctx.out(`${pid} (process ID) old priority ${old}, new priority ${n}\n`);
  }
  return st;
};
CMDS.useradd = (a, ctx) => {
  const { f, rest } = opts(a, 'mMr', 'sgG', 'useradd');
  if (needRoot(ctx, 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.')) return 1;
  const name = rest[0];
  if (!name) throw new Error('usage: useradd [-m] [-s SHELL] [-G groups] NAME');
  if (pwEntries().find(x => x[0] === name)) { ctx.err(`useradd: user '${name}' already exists\n`); return 9; }
  const uids = pwEntries().map(x => +x[2]).filter(v => v >= 1000 && v < 60000);
  const uid = (uids.length ? Math.max(...uids) : 1000) + 1;
  const shell = f.s || '/bin/sh';
  getNode('/etc/group').content += `${name}:x:${uid}:\n`;
  getNode('/etc/passwd').content += `${name}:x:${uid}:${uid}::/home/${name}:${shell}\n`;
  getNode('/etc/shadow').content += `${name}:!:20450:0:99999:7:::\n`;
  if (f.m) { const home = getNode('/home'); if (home && !home.children[name]) home.children[name] = D({}, { owner: name, group: name, mode: 0o750 }); }
  if (f.G) for (const g of f.G.split(',').filter(Boolean)) { if (gidOf(g)) editEtc('/etc/group', x => { const mem = (x[3] || '').split(',').filter(Boolean); return x[0] === g && !mem.includes(name) ? [x[0], x[1], x[2], [...mem, name].join(',')].join(':') : null; }); }
  return 0;
};
CMDS.adduser = (a, ctx) => CMDS.useradd(a.some(x => x === '-m') ? a : ['-m', ...a], ctx);
CMDS.userdel = (a, ctx) => {
  const { f, rest } = opts(a, 'r', '', 'userdel');
  if (needRoot(ctx, 'userdel: Permission denied.')) return 1;
  const name = rest[0];
  if (!pwEntries().find(x => x[0] === name)) { ctx.err(`userdel: user '${name}' does not exist\n`); return 6; }
  for (const fp of ['/etc/passwd', '/etc/shadow', '/etc/group']) { const nn = getNode(fp); nn.content = splitLines(nn.content).map(l => { if (fp === '/etc/group') { const ff = l.split(':'); ff[3] = (ff[3] || '').split(',').filter(x => x && x !== name).join(','); return ff.join(':'); } return l; }).filter(l => !(fp !== '/etc/group' && l.split(':')[0] === name)).join('\n') + '\n'; }
  if (f.r) { const home = getNode('/home'); if (home && home.children[name]) { syncRecordDeletion('/home/' + name, home.children[name]); delete home.children[name]; } }
  return 0;
};
CMDS['ssh-keygen'] = (a, ctx) => {
  const { f } = opts(a, 'q', 'tfNCb', 'ssh-keygen');
  const type = f.t || 'ed25519';
  const file = norm(f.f || (HOME + '/.ssh/id_' + type), S.cwd);
  const dir = parentOf(file);
  if (!getNode(dir)) { const pp = getNode(parentOf(dir)); if (pp && pp.type === 'dir') pp.children[baseName(dir)] = D({}, { owner: RUNAS, mode: 0o700 }); }
  if (getNode(file)) { ctx.err(`${file} already exists.\n(In this game ssh-keygen will not overwrite an existing key; remove it first or use -f to pick another path.)\n`); return 1; }
  const comment = f.C || `${USER}@${HOST}`;
  writeFile(file, '-----BEGIN OPENSSH PRIVATE KEY-----\n(game key - not a real private key)\n-----END OPENSSH PRIVATE KEY-----\n', false);
  const kn = getNode(file); if (kn) kn.mode = 0o600;
  writeFile(file + '.pub', `ssh-${type} AAAAC3NzaC1lZDI1NTE5game${randHex(10)} ${comment}\n`, false);
  const pn = getNode(file + '.pub'); if (pn) pn.mode = 0o644;
  ctx.out(`Generating public/private ${type} key pair.\nYour identification has been saved in ${file}\nYour public key has been saved in ${file}.pub\nThe key fingerprint is:\nSHA256:${randHex(43)} ${comment}\n`);
  return 0;
};
function simpleHash(str, len) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const r = mulberry32(h || 1); let out = '';
  while (out.length < len) out += ('0000000' + Math.floor(r() * 0xffffffff).toString(16)).slice(-8);
  return out.slice(0, len);
}
function hashCmd(a, ctx, len, name) {
  const { f, rest } = opts(a, 'c', '', name);
  if (f.c) {
    const L = lookup(rest[0]);
    if (L.err || L.node.type !== 'file') { ctx.err(`${name}: ${rest[0]}: ${L.err || 'Is a directory'}\n`); return 1; }
    let st = 0;
    for (const line of splitLines(L.node.content)) { if (!line.trim()) continue; const m = line.match(/^(\w+)\s+\*?(.+)$/); if (!m) continue; const F2 = lookup(m[2]); if (F2.err || F2.node.type !== 'file') { ctx.out(`${m[2]}: FAILED open or read\n`); st = 1; continue; } const ok = simpleHash(F2.node.content, len) === m[1]; ctx.out(`${m[2]}: ${ok ? 'OK' : 'FAILED'}\n`); if (!ok) st = 1; }
    return st;
  }
  const I = inputs(rest, ctx, name);
  for (const it of I.res) ctx.out(`${simpleHash(it.content, len)}  ${it.name === '(standard input)' ? '-' : it.name}\n`);
  return I.st;
}
CMDS.sha256sum = (a, ctx) => hashCmd(a, ctx, 64, 'sha256sum');
CMDS.md5sum = (a, ctx) => hashCmd(a, ctx, 32, 'md5sum');
CMDS.diff = (a, ctx) => {
  const { rest } = opts(a, 'uq', '', 'diff');
  const [p1, p2] = rest;
  if (!p1 || !p2) { ctx.err('usage: diff FILE1 FILE2\n'); return 2; }
  const A = lookup(p1), B = lookup(p2);
  if (A.err || A.node.type !== 'file') { ctx.err(`diff: ${p1}: ${A.err || 'Is a directory'}\n`); return 2; }
  if (B.err || B.node.type !== 'file') { ctx.err(`diff: ${p2}: ${B.err || 'Is a directory'}\n`); return 2; }
  if (A.node.content === B.node.content) return 0;
  const la = splitLines(A.node.content), lb = splitLines(B.node.content), max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) { if (la[i] !== lb[i]) { if (la[i] !== undefined) ctx.out(`${i + 1}c${i + 1}\n< ${la[i]}\n`); if (lb[i] !== undefined) ctx.out(`---\n> ${lb[i]}\n`); } }
  return 1;
};


/* ---------- text filters, dns/net, kernel, shell (chapters 21-24) ---------- */
CMDS.nl = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'nl'); let n = 0; for (const it of I.res) for (const l of splitLines(it.content)) { if (l.trim() === '') { ctx.out('\n'); } else { n++; ctx.out(`${String(n).padStart(6)}\t${l}\n`); } } return I.st; };
CMDS.tac = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'tac'); const lines = []; for (const it of I.res) lines.push(...splitLines(it.content)); if (lines.length) ctx.out(lines.reverse().join('\n') + '\n'); return I.st; };
CMDS.rev = (a, ctx) => { const I = inputs(a.filter(x => !x.startsWith('-')), ctx, 'rev'); for (const it of I.res) for (const l of splitLines(it.content)) ctx.out([...l].reverse().join('') + '\n'); return I.st; };
CMDS.column = (a, ctx) => {
  const { f, rest } = opts(a, 't', 's', 'column');
  const I = inputs(rest, ctx, 'column');
  const sep = f.s !== undefined ? f.s : null;
  const rows = []; for (const it of I.res) for (const l of splitLines(it.content)) { if (l === '' ) continue; rows.push(sep ? l.split(sep) : l.trim().split(/\s+/)); }
  if (!f.t) { ctx.out(rows.map(r => r.join(' ')).join('\n') + (rows.length ? '\n' : '')); return I.st; }
  const w = []; for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, c.length); });
  ctx.out(rows.map(r => r.map((c, i) => i < r.length - 1 ? c.padEnd(w[i]) : c).join('  ')).join('\n') + (rows.length ? '\n' : ''));
  return I.st;
};
CMDS.comm = (a, ctx) => { const files = a.filter(x => !x.startsWith('-')); const A = lookup(files[0]), B = lookup(files[1]); if (A.err || B.err) { ctx.err('comm: cannot read one of the files\n'); return 1; } const sa = new Set(splitLines(A.node.content)), sb = new Set(splitLines(B.node.content)); const only1 = [...sa].filter(x => !sb.has(x)), only2 = [...sb].filter(x => !sa.has(x)), both = [...sa].filter(x => sb.has(x)); for (const l of only1) ctx.out(l + '\n'); for (const l of only2) ctx.out('\t' + l + '\n'); for (const l of both) ctx.out('\t\t' + l + '\n'); return 0; };
function dnsResolve(name) { if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name; return S.dns[name] || (getNode('/etc/hosts') ? (splitLines(getNode('/etc/hosts').content).map(l => l.trim().split(/\s+/)).find(f => f.slice(1).includes(name)) || [])[0] : null) || null; }
function dnsReverse(ip) { for (const k in S.dns) if (S.dns[k] === ip) return k.includes('.') && !k.endsWith('.example') ? k : (k + (k.includes('.') ? '' : '')); const h = getNode('/etc/hosts'); if (h) { const row = splitLines(h.content).map(l => l.trim().split(/\s+/)).find(f => f[0] === ip); if (row) return row[1]; } return null; }
CMDS.dig = (a, ctx) => {
  const short = a.includes('+short'); const args = a.filter(x => !x.startsWith('+') && !x.startsWith('-') && !x.startsWith('@'));
  const name = args.find(x => !/^(A|AAAA|MX|TXT|NS|PTR|ANY)$/i.test(x)) || '';
  const ip = dnsResolve(name);
  if (short) { if (ip) ctx.out(ip + '\n'); return ip ? 0 : 0; }
  ctx.out(`; <<>> DiG 9.18 <<>> ${name}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${ip ? 'NOERROR' : 'NXDOMAIN'}, id: ${Math.floor(Math.random() * 65535)}\n\n;; QUESTION SECTION:\n;${name}.\t\t\tIN\tA\n\n`);
  if (ip) ctx.out(`;; ANSWER SECTION:\n${name}.\t300\tIN\tA\t${ip}\n\n`);
  ctx.out(`;; Query time: 2 msec\n;; SERVER: 127.0.0.53#53\n`);
  return ip ? 0 : 0;
};
CMDS.host = (a, ctx) => {
  const q = a.filter(x => !x.startsWith('-'))[0] || '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(q)) { const n = dnsReverse(q); if (n) ctx.out(`${q.split('.').reverse().join('.')}.in-addr.arpa domain name pointer ${n}.\n`); else { ctx.out(`Host ${q} not found: 3(NXDOMAIN)\n`); return 1; } return 0; }
  const ip = dnsResolve(q); if (ip) ctx.out(`${q} has address ${ip}\n`); else { ctx.out(`Host ${q} not found: 3(NXDOMAIN)\n`); return 1; } return 0;
};
CMDS.nslookup = (a, ctx) => { const q = a.filter(x => !x.startsWith('-'))[0] || ''; ctx.out('Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\n'); if (/^\d+\.\d+\.\d+\.\d+$/.test(q)) { const n = dnsReverse(q); if (n) { ctx.out(`${q.split('.').reverse().join('.')}.in-addr.arpa\tname = ${n}.\n`); return 0; } ctx.out(`** server can't find ${q}: NXDOMAIN\n`); return 1; } const ip = dnsResolve(q); if (ip) { ctx.out(`Non-authoritative answer:\nName:\t${q}\nAddress: ${ip}\n`); return 0; } ctx.out(`** server can't find ${q}: NXDOMAIN\n`); return 1; };
CMDS.nc = (a, ctx) => {
  const flags = a.filter(x => x.startsWith('-')).join('');
  const rest = a.filter(x => !x.startsWith('-'));
  const hostArg = rest[0], port = parseInt(rest[1], 10);
  if (!hostArg || !port) { ctx.err('usage: nc -zv HOST PORT\n'); return 1; }
  const ip = dnsResolve(hostArg) || hostArg;
  const openPorts = { '10.0.4.20': [5432], '10.0.4.12': [22, 8080], 'localhost': [22, 8080], '127.0.0.1': [22, 8080, 5432] };
  const key = ip in openPorts ? ip : hostArg;
  const open = (openPorts[key] || []).includes(port);
  if (flags.includes('v')) ctx.err(`nc: connect to ${hostArg} ${port} port (tcp) ${open ? 'succeeded!' : 'failed: Connection refused'}\n`);
  else if (!open) ctx.err('');
  return open ? 0 : 1;
};
CMDS.traceroute = (a, ctx) => { const h = a.filter(x => !x.startsWith('-'))[0] || ''; const ip = dnsResolve(h) || h; ctx.out(`traceroute to ${h} (${ip}), 30 hops max, 60 byte packets\n 1  10.0.4.1 (10.0.4.1)  0.4 ms  0.3 ms  0.3 ms\n 2  ${ip} (${ip})  1.1 ms  0.9 ms  1.0 ms\n`); return 0; };
CMDS.sysctl = (a, ctx) => {
  const { f, rest } = opts(a, 'aw', '', 'sysctl');
  if (f.a) { for (const k of Object.keys(S.sysctl).sort()) ctx.out(`${k} = ${S.sysctl[k]}\n`); return 0; }
  if (f.w) { for (const kv of rest) { const i = kv.indexOf('='); if (i < 0) continue; const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); if (needRoot(ctx, `sysctl: permission denied on key "${k}"`)) return 1; S.sysctl[k] = v; ctx.out(`${k} = ${v}\n`); } return 0; }
  let st = 0;
  for (const kv of rest) { if (kv.includes('=')) { const i = kv.indexOf('='); const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); if (needRoot(ctx, `sysctl: permission denied on key "${k}"`)) return 1; S.sysctl[k] = v; ctx.out(`${k} = ${v}\n`); } else { if (kv in S.sysctl) ctx.out(`${kv} = ${S.sysctl[kv]}\n`); else { ctx.err(`sysctl: cannot stat /proc/sys/${kv.replace(/\./g, '/')}: No such file or directory\n`); st = 1; } } }
  return st;
};
CMDS.dmesg = (a, ctx) => {
  const lines = ['[    0.000000] Linux version 6.8.0-45-generic (buildd@lcy02) ', '[    0.210441] Command line: BOOT_IMAGE=/vmlinuz-6.8.0-45-generic root=UUID=7c3f-root ro quiet', '[    1.884302] virtio_net virtio0 eth0: renamed from eth0', '[    2.110554] EXT4-fs (vda1): mounted filesystem with ordered data mode', '[    2.945013] systemd[1]: Detected virtualization kvm.', '[   12.330901] ufw: initialized, default deny', '[  3421.882190] halcyon-worker[812]: started 4 workers'];
  if (S.oom) lines.push(
    `[889221.func] halcyon-worker invoked oom-killer: gfp_mask=0x100cca, order=0, oom_score_adj=0`,
    `[889221.502] Out of memory: Killed process ${S.oom} (halcyon-worker) total-vm:3904012kB, anon-rss:3122440kB, file-rss:0kB`,
    `[889221.540] oom_reaper: reaped process ${S.oom} (halcyon-worker), now anon-rss:0kB`);
  ctx.out(lines.join('\n') + '\n'); return 0;
};
CMDS.lsmod = (a, ctx) => { ctx.out('Module                  Size  Used by\nvirtio_net             57344  0\nvirtio_blk             20480  3\next4                  942080  2\nbr_netfilter           32768  0\noverlay               163840  1\n'); return 0; };
CMDS.modinfo = (a, ctx) => { const m = a.filter(x => !x.startsWith('-'))[0] || ''; ctx.out(`filename:       /lib/modules/6.8.0-45-generic/kernel/drivers/${m}.ko\nversion:        1.0\nlicense:        GPL\ndescription:    ${m} kernel module\n`); return 0; };
CMDS.alias = (a, ctx) => {
  const line = a.join(' ');
  if (!line.trim()) { for (const k of Object.keys(S.aliases).sort()) ctx.out(`alias ${k}='${S.aliases[k]}'\n`); return 0; }
  const m = line.match(/^([A-Za-z_][\w-]*)=(.*)$/);
  if (!m) { const name = line.trim(); if (S.aliases[name]) ctx.out(`alias ${name}='${S.aliases[name]}'\n`); else { ctx.err(`alias: ${name}: not found\n`); return 1; } return 0; }
  let val = m[2]; if ((val[0] === '"' && val.endsWith('"')) || (val[0] === "'" && val.endsWith("'"))) val = val.slice(1, -1);
  S.aliases[m[1]] = val; return 0;
};
CMDS.unalias = (a, ctx) => { for (const x of a.filter(y => !y.startsWith('-'))) delete S.aliases[x]; return 0; };
CMDS.which = (a, ctx) => { let st = 0; for (const name of a.filter(x => !x.startsWith('-'))) { if (S.aliases[name]) { ctx.out(`${name}: aliased to ${S.aliases[name]}\n`); } else if (CMDS[name] && !GAME_CMDS.includes(name)) { ctx.out(`/usr/bin/${name}\n`); } else { st = 1; } } return st; };
CMDS.type = (a, ctx) => { let st = 0; for (const name of a.filter(x => !x.startsWith('-'))) { if (S.aliases[name]) ctx.out(`${name} is aliased to \`${S.aliases[name]}'\n`); else if (['cd', 'export', 'alias', 'unalias', 'umask', 'source', 'unset', 'set', 'type', 'jobs', 'exit'].includes(name)) ctx.out(`${name} is a shell builtin\n`); else if (CMDS[name] && !GAME_CMDS.includes(name)) ctx.out(`${name} is /usr/bin/${name}\n`); else { ctx.err(`type: ${name}: not found\n`); st = 1; } } return st; };
CMDS.umask = (a, ctx) => { const v = a.find(x => !x.startsWith('-')); if (v === undefined) { ctx.out('0' + (S.umask || 0).toString(8).padStart(3, '0') + '\n'); return 0; } if (!/^[0-7]{1,4}$/.test(v)) { ctx.err(`umask: ${v}: invalid octal number\n`); return 1; } S.umask = parseInt(v, 8); return 0; };


/* ---------- acls, lvm, signals, observability, make (chapters 25-30) ---------- */
CMDS.getfacl = (a, ctx) => {
  const t = a.filter(x => !x.startsWith('-'))[0]; const L = lookup(t);
  if (L.err) { ctx.err(`getfacl: ${t}: ${L.err}\n`); return 1; }
  const n = L.node; const pm = permStr(n);
  ctx.out(`# file: ${t.replace(/^\//, '')}\n# owner: ${n.owner}\n# group: ${n.group}\n`);
  ctx.out(`user::${pm.slice(1, 4).replace(/[st]/gi, 'x')}\n`);
  if (n.acl) for (const e of n.acl) ctx.out(`user:${e.who}:${e.perms}\n`);
  ctx.out(`group::${pm.slice(4, 7).replace(/[st]/gi, 'x')}\n`);
  if (n.acl) ctx.out('mask::rwx\n');
  ctx.out(`other::${pm.slice(7, 10).replace(/[st]/gi, 'x')}\n`);
  return 0;
};
CMDS.setfacl = (a, ctx) => {
  const { f, rest } = opts(a, 'bR', 'mx', 'setfacl');
  const t = rest[0]; const L = lookup(t);
  if (L.err) { ctx.err(`setfacl: ${t}: ${L.err}\n`); return 1; }
  if (RUNAS !== 'root' && L.node.owner !== USER) { ctx.err(`setfacl: ${t}: Operation not permitted\n`); return 1; }
  L.node.acl = L.node.acl || [];
  if (f.b) { delete L.node.acl; return 0; }
  if (f.m) { const m = f.m.match(/^u(?:ser)?:([^:]+):([rwx-]+)$/); if (!m) { ctx.err(`setfacl: Option -m: Invalid argument near character ${1}\n`); return 1; } const perms = m[2].replace(/-/g, ''); const ex = L.node.acl.find(e => e.who === m[1]); if (ex) ex.perms = perms; else L.node.acl.push({ who: m[1], perms }); }
  return 0;
};
function sizeStr(x) { return String(x); }
CMDS.pvcreate = (a, ctx) => { const dev = a.filter(x => !x.startsWith('-'))[0]; if (needRoot(ctx, 'pvcreate: must be root')) return 1; const part = allParts().concat(S.disks).find(x => '/dev/' + x.name === dev); if (!part) { ctx.err(`  Device ${dev} not found.\n`); return 5; } if (S.lvm.pvs.find(pv => pv.name === dev)) { ctx.err(`  Physical volume ${dev} already in use\n`); return 5; } S.lvm.pvs.push({ name: dev, vg: null, size: part.size.replace('G', '.00g') }); ctx.out(`  Physical volume "${dev}" successfully created.\n`); return 0; };
CMDS.pvs = (a, ctx) => { ctx.out('  PV         VG   Fmt  Attr PSize   PFree\n'); for (const pv of S.lvm.pvs) ctx.out(`  ${pv.name.padEnd(10)} ${(pv.vg || '').padEnd(4)} lvm2 ${pv.vg ? 'a--' : '---'}  ${pv.size.padStart(6)}  ${pv.size.padStart(6)}\n`); return 0; };
CMDS.vgcreate = (a, ctx) => { const rest = a.filter(x => !x.startsWith('-')); const vg = rest[0], devs = rest.slice(1); if (needRoot(ctx, 'vgcreate: must be root')) return 1; if (!vg || !devs.length) { ctx.err('  Please provide volume group name and physical volumes.\n'); return 3; } for (const d of devs) { const pv = S.lvm.pvs.find(p => p.name === d); if (!pv) { ctx.err(`  Physical volume ${d} not found (run pvcreate first).\n`); return 5; } pv.vg = vg; } S.lvm.vgs.push({ name: vg, pvs: devs, size: '20.00g', free: '20.00g' }); ctx.out(`  Volume group "${vg}" successfully created\n`); return 0; };
CMDS.vgs = (a, ctx) => { ctx.out('  VG   #PV #LV #SN Attr   VSize   VFree\n'); for (const vg of S.lvm.vgs) ctx.out(`  ${vg.name.padEnd(4)} ${String(vg.pvs.length).padStart(3)} ${String(S.lvm.lvs.filter(l => l.vg === vg.name).length).padStart(3)}   0 wz--n- ${vg.size.padStart(6)} ${vg.free.padStart(6)}\n`); return 0; };
CMDS.lvcreate = (a, ctx) => {
  const { f, rest } = opts(a, '', 'nLl', 'lvcreate');
  if (needRoot(ctx, 'lvcreate: must be root')) return 1;
  const vg = rest[0]; const name = f.n; const size = f.L || f.l;
  if (!name || !size || !vg) { ctx.err('  Please specify -n NAME -L SIZE VG\n'); return 3; }
  if (!S.lvm.vgs.find(v => v.name === vg)) { ctx.err(`  Volume group "${vg}" not found\n`); return 5; }
  S.lvm.lvs.push({ name, vg, size, dev: `/dev/${vg}/${name}`, fstype: '' });
  ctx.out(`  Logical volume "${name}" created.\n`); return 0;
};
CMDS.lvs = (a, ctx) => { ctx.out('  LV      VG   Attr       LSize  \n'); for (const lv of S.lvm.lvs) ctx.out(`  ${lv.name.padEnd(7)} ${lv.vg.padEnd(4)} -wi-a----- ${lv.size.padStart(6)}\n`); return 0; };
function lvByDev(dev) { return S.lvm.lvs.find(l => l.dev === dev || l.dev === dev.replace('/dev/mapper/', '/dev/').replace('-', '/')); }
CMDS.mkfs = (a, ctx) => {
  let type = 'ext4'; const rest = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '-t') type = a[++i]; else if (!a[i].startsWith('-')) rest.push(a[i]); }
  const dev = rest[0];
  if (needRoot(ctx, 'mke2fs: Permission denied')) return 1;
  const lv = lvByDev(dev); const part = allParts().find(x => '/dev/' + x.name === dev);
  if (!lv && !part) { ctx.err(`mke2fs: Device ${dev} does not exist or access denied.\n`); return 1; }
  if (lv) lv.fstype = type; else part.fstype = type;
  ctx.out(`mke2fs 1.47.0\nCreating filesystem with blocks and inodes\nWriting superblocks and filesystem accounting information: done\n`);
  return 0;
};
CMDS['mkfs.ext4'] = (a, ctx) => CMDS.mkfs(['-t', 'ext4', ...a], ctx);
CMDS['mkfs.xfs'] = (a, ctx) => CMDS.mkfs(['-t', 'xfs', ...a], ctx);
CMDS.blkid = (a, ctx) => { let i = 0; for (const part of allParts()) { if (part.fstype) ctx.out(`/dev/${part.name}: UUID="${simpleHash(part.name, 36).replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5')}" TYPE="${part.fstype}"\n`); } for (const lv of S.lvm.lvs) if (lv.fstype) ctx.out(`${lv.dev}: UUID="${simpleHash(lv.name, 36).replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5')}" TYPE="${lv.fstype}"\n`); return 0; };
CMDS.lsof = (a, ctx) => {
  if (a.includes('+L1') || a.includes('+L') ) {
    ctx.out('COMMAND     PID   USER   FD   TYPE DEVICE  SIZE/OFF NLINK     NODE NAME\n');
    if (S.held && S.heldPid) ctx.out(`${(S.heldProc || 'proc').padEnd(11)} ${String(S.heldPid).padEnd(5)} ${(S.heldUser || 'root').padEnd(6)} ${(S.heldFd || '4w').padEnd(4)} REG  252,1 ${String(S.held).padStart(10)}     0 ${String(S.heldNode || 918273).padStart(8)} ${S.heldFile || '/var/log/app.log'} (deleted)\n`);
    return 0;
  }
  const { f } = opts(a, '', 'i', 'lsof');
  if (f.i !== undefined) { const port = (f.i.match(/:(\d+)/) || [])[1]; const lp = port ? +port : null; ctx.out('COMMAND   PID    USER   FD   TYPE  DEVICE NODE NAME\n'); let any = false; for (const l of S.net.listen) { if (lp && l.lport !== lp) continue; ctx.out(`${(l.proc || '-').slice(0, 9).padEnd(9)} ${String(l.pid || '-').padEnd(6)} ${(S.procs.find(p => p.pid === l.pid) || {}).user || 'root'}    ${String(3).padEnd(4)} IPv4   0  TCP *:${l.lport} (LISTEN)\n`); any = true; } return any ? 0 : 1; }
  const t = a.filter(x => !x.startsWith('-'))[0];
  if (t) { ctx.out('COMMAND   PID    USER   FD   TYPE DEVICE NODE NAME\n'); ctx.out(`halcyon-  812    halcyon  5w   REG    0    0  ${norm(t, S.cwd)}\n`); return 0; }
  ctx.out('COMMAND   PID USER   FD   TYPE NAME\n(too many open files to list; use lsof -i :PORT or lsof FILE)\n');
  return 0;
};
CMDS.timeout = (a, ctx) => { const rest = a.filter((x, i) => i > 0 || /^\d+/.test(x) ? true : false); let i = 0; if (/^\d+/.test(a[0])) i = 1; const dur = a[0]; const argv = a.slice(i); if (!argv.length) { ctx.err('timeout: usage: timeout DURATION COMMAND [ARG]...\n'); return 1; } return exec(argv, ctx); };
CMDS.nohup = (a, ctx) => { const argv = a.filter(x => x !== '&'); if (!argv.length) { ctx.err('nohup: usage: nohup COMMAND [ARG]...\n'); return 1; } ctx.out("nohup: ignoring input and appending output to 'nohup.out'\n"); const r = exec(argv, ctx); return r; };
CMDS.jobs = (a, ctx) => { return 0; };
CMDS.vmstat = (a, ctx) => { const busy = S.procs.some(p => p.cpu > 100); const io = S.iowait; ctx.out('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n'); ctx.out(` ${io ? '1  5' : (busy ? '3  0' : '1  0')}      0 ${busy ? '612000' : '1840000'}  61200 1920800    0    0 ${io ? ' 98420   140' : '    12    40'}  ${io ? '1820 2900' : ' 220  410'} ${io ? ' 4  3  9 84' : (busy ? '96  2  2  0' : ' 3  1 96  0')}  0\n`); return 0; };
CMDS.iostat = (a, ctx) => { const io = S.iowait; ctx.out('Linux 6.8.0-45-generic (halcyon-web01)\n\navg-cpu:  %user   %nice %system %iowait  %steal   %idle\n          ' + (io ? ' 4.10    0.00    2.80   84.30    0.00    8.80' : (S.procs.some(p => p.cpu > 100) ? '95.80    0.00    2.10    0.40    0.00    1.70' : '3.10    0.00    1.00    0.20    0.00   95.70')) + '\n\nDevice             tps    kB_read/s    kB_wrtn/s    kB_read    kB_wrtn\nvda1          ' + (io ? '1842.60     98420.00       140.20  812034110    1203110' : '  12.40       180.20        95.30    2104332    1203110') + '\n'); return 0; };
CMDS.watch = (a, ctx) => { const idx = a.findIndex(x => !x.startsWith('-') && !/^\d+$/.test(x) && a[a.indexOf(x) - 1] !== '-n'); const argv = a.slice(idx < 0 ? 1 : idx).filter(x => x !== '-n' && !/^\d+$/.test(x) || true); const cmd = a.filter((x, i) => !(x === '-n' || (a[i - 1] === '-n'))); const run = cmd.filter(x => !x.startsWith('-') || x.length > 2); if (!run.length) { ctx.err('watch: no command to run\n'); return 1; } ctx.out(`Every 2.0s: ${run.join(' ')}\n\n`); return exec(run, ctx); };
CMDS.make = (a, ctx) => {
  const dryRun = a.includes('-n'); const targets = a.filter(x => !x.startsWith('-'));
  const mf = getNode(norm('Makefile', S.cwd)) || getNode(norm('makefile', S.cwd));
  if (!mf || mf.type !== 'file') { ctx.err('make: *** No targets specified and no makefile found.  Stop.\n'); return 2; }
  const rules = {}; let cur = null;
  for (const raw of mf.content.split('\n')) {
    if (/^[\t]/.test(raw)) { if (cur) rules[cur].push(raw.replace(/^\t/, '')); continue; }
    const m = raw.match(/^([A-Za-z_][\w.-]*)\s*:(.*)$/);
    if (m && m[1] !== '.PHONY') { cur = m[1]; rules[cur] = []; }
  }
  const order = targets.length ? targets : [Object.keys(rules)[0]];
  for (const tg of order) {
    if (!rules[tg]) { ctx.err(`make: *** No rule to make target '${tg}'.  Stop.\n`); return 2; }
    for (const line of rules[tg]) { const show = line.replace(/^@/, ''); if (!line.startsWith('@')) ctx.out(show + '\n'); if (!dryRun) { runLine(show); if (S.lastStatus !== 0) { ctx.err(`make: *** [${tg}] Error ${S.lastStatus}\n`); return 2; } } else if (dryRun && line.startsWith('@')) ctx.out(show + '\n'); }
  }
  return 0;
};


/* ---------- login auditing & incident forensics (chapters 31-35) ---------- */
const INTRUDER_IP = '198.51.100.66';
function uid0Intruders() { return splitLines(getNode('/etc/passwd').content).map(l => l.split(':')).filter(f => f[2] === '0' && f[0] !== 'root' && /sh$/.test(f[6] || '')).map(f => f[0]); }
function loginRows() {
  const rows = [
    { user: 'rookie', tty: 'pts/0', from: '10.0.4.57', login: 'Wed 09:14', dur: 'still logged in' },
    { user: 'rookie', tty: 'pts/0', from: '10.0.4.57', login: 'Tue 08:52 - 11:06', dur: '(02:14)' },
    { user: 'dana', tty: 'pts/1', from: '10.0.4.31', login: 'Oct 22 17:58 - 18:01', dur: '(00:03)' }
  ];
  if (S.compromise) rows.unshift({ user: 'support', tty: 'pts/2', from: S.intruderIp || INTRUDER_IP, login: 'Mon 03:11', dur: 'still logged in' });
  return rows;
}
CMDS.last = (a, ctx) => {
  const num = (() => { const m = a.find(x => /^-\d+$/.test(x)); return m ? parseInt(m.slice(1), 10) : 99; })();
  const rows = loginRows().slice(0, num);
  for (const r of rows) ctx.out(`${r.user.padEnd(8)} ${r.tty.padEnd(8)} ${r.from.padEnd(15)} ${r.login.padEnd(18)} ${r.dur}\n`);
  ctx.out('\nwtmp begins Thu Oct 22 17:58:03 2026\n');
  return 0;
};
CMDS.lastb = (a, ctx) => {
  if (needRoot(ctx, 'lastb: /var/log/btmp: Permission denied')) return 1;
  const fails = [['admin', '203.0.113.9'], ['test', '203.0.113.140'], ['oracle', '192.0.2.55'], ['ubuntu', '203.0.113.9'], ['postgres', '192.0.2.55']];
  if (S.compromise) fails.unshift(['root', S.intruderIp || INTRUDER_IP]);
  for (const [u, ip] of fails) ctx.out(`${u.padEnd(8)} ssh:notty    ${ip.padEnd(15)} ${'Mon 03:0' + Math.floor(Math.random() * 9)}    (00:00)\n`);
  ctx.out('\nbtmp begins Mon Oct 26 00:00:01 2026\n');
  return 0;
};
CMDS.w = (a, ctx) => {
  const d = new Date();
  const sessions = [{ user: 'rookie', tty: 'pts/0', from: '10.0.4.57', at: '09:14', idle: '0.00s', what: 'w' }];
  for (const u of uid0Intruders()) sessions.push({ user: u, tty: 'pts/2', from: S.intruderIp || INTRUDER_IP, at: '03:11', idle: '2:14', what: `/tmp/.cache/kdevtmpfsi` });
  const high = S.iowait || S.procs.some(p => p.cpu > 100);
  ctx.out(` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} up 6 days,  3:20,  ${sessions.length} user${sessions.length > 1 ? 's' : ''},  load average: ${high ? '11.90, 9.40, 6.10' : '0.09, 0.14, 0.11'}\n`);
  ctx.out('USER     TTY      FROM             LOGIN@   IDLE   WHAT\n');
  for (const x of sessions) ctx.out(`${x.user.padEnd(8)} ${x.tty.padEnd(8)} ${x.from.padEnd(16)} ${x.at.padEnd(8)} ${x.idle.padEnd(6)} ${x.what}\n`);
  return 0;
};
CMDS.who = (a, ctx) => {
  ctx.out('rookie   pts/0        2026-10-28 09:14 (10.0.4.57)\n');
  for (const u of uid0Intruders()) ctx.out(`${u.padEnd(8) } pts/2        2026-10-26 03:11 (${S.intruderIp || INTRUDER_IP})\n`);
  return 0;
};

/* ---------- manual pages ---------- */
const MAN = {
  pwd: ['print the name of the current working directory', 'pwd', [], ['pwd']],
  ls: ['list directory contents', 'ls [OPTION]... [FILE]...', [['-a', 'include hidden entries (names starting with .), plus . and ..'], ['-A', 'like -a, without . and ..'], ['-l', 'long format: permissions, links, owner, group, size, date, name'], ['-h', 'with -l, show sizes like 4.0K or 2.1G'], ['-R', 'list subdirectories recursively'], ['-t', 'sort by modification time, newest first'], ['-S', 'sort by size, largest first'], ['-r', 'reverse the sort order'], ['-d', 'list a directory itself, not its contents'], ['-1', 'one entry per line'], ['-F', 'add / after directory names']], ['ls -la', 'ls -lh /var/log/halcyon']],
  cd: ['change the working directory', 'cd [DIR]', [['(no DIR)', 'go to your home directory'], ['~', 'your home directory'], ['..', 'the parent directory'], ['-', 'the previous directory']], ['cd /srv/halcyon', 'cd ..', 'cd -']],
  tree: ['list a directory as a tree', 'tree [-a] [-d] [DIR]', [['-a', 'include hidden files'], ['-d', 'list directories only']], ['tree ~', 'tree -d /srv']],
  cat: ['concatenate files and print them', 'cat [OPTION]... [FILE]...', [['-n', 'number every output line']], ['cat notes.txt', 'cat a.txt b.txt > both.txt']],
  less: ['view a file', 'less FILE', [], ['less /var/log/halcyon/app.log'], 'On a real system less shows one screen at a time (q quits, / searches). In this game it prints the whole file.'],
  more: ['view a file', 'more FILE', [], ['more README'], 'In this game, more prints the whole file.'],
  head: ['print the first lines of files', 'head [-n N] [FILE]...', [['-n N', 'print the first N lines (default 10)'], ['-N', 'same as -n N']], ['head -n 5 app.log', 'head -3 access.log']],
  tail: ['print the last lines of files', 'tail [-n N] [FILE]...', [['-n N', 'print the last N lines (default 10)'], ['-n +N', 'print everything from line N on'], ['-N', 'same as -n N']], ['tail -n 1 app.log', 'tail -n +2 data.csv'], 'Real tail also has -f to follow a growing file. That one is not in this game yet.'],
  wc: ['count lines, words and bytes', 'wc [OPTION]... [FILE]...', [['-l', 'count lines'], ['-w', 'count words'], ['-c', 'count bytes']], ['wc -l app.log', 'grep ERROR app.log | wc -l']],
  mkdir: ['make directories', 'mkdir [OPTION]... DIRECTORY...', [['-p', 'create parent directories as needed; no error if it already exists'], ['-v', 'print a message for each directory created']], ['mkdir notes', 'mkdir -p ~/a/b/c']],
  rmdir: ['remove empty directories', 'rmdir DIRECTORY...', [], ['rmdir old-folder']],
  touch: ['create an empty file, or update a file\'s timestamp', 'touch FILE...', [], ['touch todo.txt']],
  rm: ['remove files or directories', 'rm [OPTION]... FILE...', [['-r', 'remove directories and everything inside them'], ['-f', 'ignore missing files'], ['-v', 'print each removed file']], ['rm old.txt', 'rm -r old-folder'], 'There is no recycle bin on a server. Deleted means gone. (In this game, retry restores the start of the ticket.)'],
  cp: ['copy files and directories', 'cp [OPTION]... SOURCE... DEST', [['-r', 'copy directories recursively'], ['-v', 'print each copy made']], ['cp app.log app.log.bak', 'cp /etc/hosts ~/', 'cp -r configs ~/backup/']],
  mv: ['move or rename files', 'mv [OPTION]... SOURCE... DEST', [['-v', 'print each move made']], ['mv draft.txt final.txt', 'mv script.sh ~/quarantine/'], 'If DEST is an existing folder, the file moves into it. Otherwise the file is renamed to DEST.'],
  find: ['search for files in a directory tree', 'find [PATH]... [EXPRESSION]', [['-name PATTERN', 'match the file name (quote patterns: \'*.log\')'], ['-iname PATTERN', 'like -name, ignoring case'], ['-type f|d', 'only files (f) or directories (d)'], ['-size [+|-]N[ckMG]', 'larger (+) or smaller (-) than N bytes, KiB, MiB or GiB'], ['-mtime [+|-]N', 'modified more than (+N) or less than (-N) N days ago'], ['-mmin [+|-]N', 'modified N minutes ago (same +/- rule)'], ['-user NAME', 'owned by NAME'], ['-maxdepth N', 'descend at most N levels'], ['-delete', 'delete every match (check the list first!)'], ['-exec CMD {} \\;', 'run CMD on each match; {} is replaced by the path']], ["find /tmp -name '*.core'", 'find / -size +1G', "find . -type f -name '*.txt' -exec wc -l {} \\;"]],
  grep: ['print lines that match a pattern', 'grep [OPTION]... PATTERN [FILE]...', [['-i', 'ignore case'], ['-v', 'print lines that do NOT match'], ['-c', 'print only a count of matching lines'], ['-n', 'show line numbers'], ['-r', 'search every file under a directory'], ['-l', 'print only the names of files that match'], ['-L', 'print only the names of files that do not match'], ['-o', 'print only the matching part'], ['-w', 'match whole words only'], ['-h / -H', 'hide / show file names'], ['-E', 'extended regular expressions (+ ? | () work)'], ['-F', 'treat the pattern as plain text'], ['-e PATTERN', 'use PATTERN (useful if it starts with -)']], ['grep ERROR app.log', 'grep -c ERROR app.log', 'grep -ri "disk" /var/log/halcyon']],
  sort: ['sort lines of text', 'sort [OPTION]... [FILE]...', [['-n', 'compare as numbers'], ['-r', 'reverse the order'], ['-u', 'drop duplicate lines'], ['-k N', 'sort by field N (fields are separated by spaces)'], ['-t C', 'use C as the field separator'], ['-f', 'ignore case'], ['-h', 'compare sizes like 2K, 1G']], ['sort names.txt', 'sort -rn counts.txt', 'sort -t: -k3 -n /etc/passwd']],
  uniq: ['collapse repeated lines', 'uniq [OPTION]... [FILE]', [['-c', 'prefix each line with how many times it repeated'], ['-d', 'only print lines that repeat'], ['-u', 'only print lines that do not repeat'], ['-i', 'ignore case']], ['sort ips.txt | uniq -c'], 'uniq only collapses repeats that sit next to each other. Run sort first.'],
  cut: ['cut out selected parts of each line', 'cut OPTION... [FILE]...', [['-d C', 'use C as the field delimiter (default: TAB)'], ['-f LIST', 'fields to keep, e.g. 1 or 1,3 or 2-4'], ['-c LIST', 'characters to keep'], ['-s', 'skip lines without the delimiter']], ["cut -d' ' -f1 access.log", 'cut -d: -f1,7 /etc/passwd']],
  sed: ['stream editor: find and replace in text', 'sed [OPTION]... SCRIPT [FILE]...', [['s/OLD/NEW/', 'replace the first OLD on each line with NEW (add g for all, i to ignore case)'], ['/RE/d', 'delete lines matching RE'], ['Nd', 'delete line N ($ means the last line)'], ['-n with /RE/p', 'print only lines matching RE'], ['-i', 'edit the file in place'], ['-E', 'extended regular expressions']], ["sed 's/ERROR/E!/' app.log", "sed -n '/WARN/p' app.log", "sed -i 's/old/new/g' notes.txt"]],
  awk: ['scan text and print fields', "awk [-F SEP] 'PROGRAM' [FILE]...", [['-F SEP', 'field separator (default: runs of spaces)'], ['{print $1, $3}', 'print fields 1 and 3 of every line'], ['$0, $NF, NF, NR', 'whole line, last field, number of fields, line number'], ["/RE/ {print $2}", 'only for lines matching RE'], ['NR>1, $9 == 404', 'conditions on line number or a field'], ['END {print NR}', 'run once at the end']], ["awk '{print $1}' access.log", "awk -F: '{print $1, $7}' /etc/passwd", "awk '$9 == 404 {print $7}' access.log"], 'Real awk is a whole programming language. This game supports the print forms above.'],
  tr: ['translate or delete characters', 'tr [-d] [-s] SET1 [SET2]', [['a-z A-Z', 'map each character in SET1 to SET2'], ['-d', 'delete characters in SET1'], ['-s', 'squeeze repeats into one']], ['echo hello | tr a-z A-Z', "cat file | tr -d ','"], 'tr only reads from a pipe or < redirection, never from a file name.'],
  echo: ['print a line of text', 'echo [-n] [-e] [TEXT]...', [['-n', 'no newline at the end'], ['-e', 'understand \\n and \\t']], ['echo hello', 'echo "note" >> notes.txt']],
  du: ['estimate disk space used by files', 'du [OPTION]... [FILE]...', [['-s', 'only a total for each argument'], ['-h', 'human-readable sizes'], ['-a', 'list files too, not just directories']], ['du -sh /tmp', 'du -h ~']],
  df: ['report free disk space', 'df [-h]', [['-h', 'human-readable sizes']], ['df -h']],
  whoami: ['print your user name', 'whoami', [], ['whoami']],
  id: ['print your user and group IDs', 'id', [], ['id']],
  hostname: ['show the machine\'s name', 'hostname', [], ['hostname']],
  uname: ['print system information', 'uname [-a] [-r] [-n] [-m]', [['-a', 'everything'], ['-r', 'kernel release'], ['-n', 'host name'], ['-m', 'hardware type']], ['uname -a']],
  date: ['print the date and time', 'date', [], ['date']],
  history: ['list the commands you have run', 'history', [], ['history'], 'Press Up and Down to scroll through earlier commands.'],
  clear: ['clear the terminal screen', 'clear', [], ['clear'], 'Ctrl+L does the same.'],
  man: ['show the manual for a command', 'man COMMAND', [], ['man grep']],
  sudo: ['run a command as root', 'sudo COMMAND', [['-l', 'list what you are allowed to run']], ['sudo ls /root', 'sudo grep jmorrow /var/log/auth.log'], 'sudo runs one command as root and logs it to /var/log/auth.log. Redirection (>) is done by your own shell, not by root, so sudo echo x > /etc/file still fails. In the real world sudo asks for your password; this game skips that.'],
  chmod: ['change file permissions', 'chmod [-R] [-v] MODE FILE...', [['755, 644, 700', 'octal: r=4, w=2, x=1, added up for owner, group, others'], ['u+x, go-w, a-x', 'symbolic: u owner, g group, o others, a all; + adds, - removes, = sets'], ['-R', 'apply to a directory and everything inside it'], ['-v', 'print each change']], ['chmod 600 secrets.txt', 'chmod a-x script.sh', 'chmod -R go-rwx ~/private'], 'Only a file\'s owner (or root) can change its permissions. Directories need x to be entered.'],
  chown: ['change file owner and group', 'chown [-R] [-v] USER[:GROUP] FILE...', [['USER', 'new owner'], ['USER:GROUP', 'new owner and group'], [':GROUP', 'new group only'], ['-R', 'apply recursively']], ['sudo chown root:root script.sh', 'sudo chown -R rookie ~/incident'], 'Only root can give a file to someone else, so chown is almost always run with sudo.'],
  chgrp: ['change group ownership', 'chgrp [-R] GROUP FILE...', [['-R', 'apply recursively']], ['chgrp halcyon-ops notes.txt']],
  id: ['print user and group IDs', 'id [USER]', [], ['id', 'id jmorrow']],
  groups: ['print the groups a user is in', 'groups [USER]...', [], ['groups', 'groups jmorrow']],
  getent: ['look up entries in the user and group databases', 'getent passwd|group [NAME]...', [], ['getent passwd jmorrow', 'getent group sudo']],
  usermod: ['modify a user account', 'usermod [OPTIONS] LOGIN', [['-s SHELL', 'set the login shell (e.g. /usr/sbin/nologin)'], ['-L', 'lock the password'], ['-U', 'unlock the password'], ['-aG GROUPS', 'add the user to extra groups'], ['-G GROUPS', 'set the exact list of extra groups']], ['sudo usermod -s /usr/sbin/nologin olduser', 'sudo usermod -aG sudo newadmin'], 'Without -a, -G removes the user from every group not listed. That mistake has locked many admins out of sudo.'],
  gpasswd: ['administer group membership', 'gpasswd -a|-d USER GROUP', [['-a USER', 'add USER to GROUP'], ['-d USER', 'remove USER from GROUP']], ['sudo gpasswd -d olduser sudo']],
  passwd: ['change or lock a password', 'passwd [-l|-u] USER', [['-l', 'lock the password'], ['-u', 'unlock it']], ['sudo passwd -l olduser'], 'A locked password stops password logins. It does not necessarily stop logins with an SSH key.'],
  deluser: ['remove a user, or remove a user from a group', 'deluser USER GROUP', [], ['sudo deluser olduser sudo'], 'In this game only the USER GROUP form works: accounts are kept as evidence.'],
  ps: ['report a snapshot of running processes', 'ps [aux]', [['aux', 'every process, with user, PID, %CPU, %MEM and the full command'], ['-ef', 'every process, alternative columns']], ['ps aux', 'ps aux | grep halcyon'], 'With no options, ps shows only your own shell. The PID column is the number you pass to kill.'],
  top: ['show the busiest processes', 'top', [], ['top'], 'Real top refreshes continuously and quits with q. In this game it prints one snapshot, sorted by CPU, then returns.'],
  kill: ['send a signal to a process', 'kill [-SIGNAL] PID...', [['-15, -TERM', 'politely ask it to stop (the default)'], ['-9, -KILL', 'force it to stop'], ['-l', 'list signal names']], ['kill 2447', 'sudo kill -9 2447'], 'You can only signal your own processes unless you run kill with sudo.'],
  pkill: ['signal processes by name', 'pkill [-f] [-SIGNAL] PATTERN', [['-f', 'match against the whole command line, not just the program name']], ['sudo pkill -f sync_out.sh'], 'pkill signals every process that matches, so check with ps first.'],
  systemctl: ['control system services and timers', 'systemctl SUBCOMMAND [UNIT]', [['status', 'show whether a unit is running and enabled'], ['is-active, is-enabled', 'one-word answers'], ['start, stop, restart', 'change the running state (needs root)'], ['enable, disable', 'set whether it starts at boot (needs root)'], ['enable --now', 'enable and start in one step'], ['daemon-reload', 'read new or changed unit files (needs root)'], ['list-timers', 'show active timers and when they next fire']], ['systemctl status halcyon', 'sudo systemctl daemon-reload', 'sudo systemctl enable --now halcyon-backup.timer'], 'A .service says what to run; a .timer says when. After writing a unit file under /etc/systemd/system, run daemon-reload so systemd notices it. \'active\' means running now; \'enabled\' means it starts at boot.'],
  journalctl: ['read the systemd logs', 'journalctl [-u UNIT] [-n N] [-r]', [['-u UNIT', 'only this service'], ['-n N', 'the last N lines'], ['-r', 'newest first']], ['journalctl -u halcyon', 'journalctl -u halcyon -n 20']],
  crontab: ['manage scheduled jobs', 'crontab [-u USER] -l | -r', [['-l', 'list the crontab'], ['-r', 'remove the whole crontab'], ['-u USER', "act on another user's crontab (needs root)"]], ['crontab -l', 'sudo crontab -l -u halcyon', 'sudo crontab -r -u halcyon'], 'Each line is: minute hour day month weekday command. So `0 * * * *` runs at minute 0 of every hour.'],
  ss: ['list network sockets', 'ss [-t] [-u] [-l] [-n] [-p] [-a]', [['-t', 'TCP sockets'], ['-l', 'listening sockets only'], ['-n', "numeric ports (don't look up names)"], ['-p', 'show the owning process (needs root)'], ['-a', 'both listening and connected']], ['ss -tln', 'sudo ss -tlnp', 'ss -tn'], 'Without -l, ss shows established connections. A listening socket is an open door; an established one is someone already through it.'],
  ip: ['show network interfaces and routes', 'ip [-4] a | r', [['a, addr', 'list interfaces and their IP addresses'], ['r, route', 'show the routing table'], ['-4', 'IPv4 only']], ['ip a', 'ip -4 addr', 'ip route'], 'eth0 faces the network; lo (127.0.0.1) is internal to this machine only.'],
  ping: ['test whether a host responds', 'ping [-c COUNT] HOST', [['-c N', 'send N packets, then stop']], ['ping -c 4 10.0.4.20'], 'Real ping runs until you press Ctrl+C. In this game it is simulated for hosts on the local network.'],
  curl: ['make a web request from the command line', 'curl [-I] [-s] URL', [['-I', 'fetch the response headers only'], ['-s', 'quiet: no progress meter']], ['curl http://localhost:8080', 'curl -I http://localhost:8080'], "In this game curl can reach only this server's own services."],
  ufw: ['the uncomplicated firewall', 'ufw SUBCOMMAND', [['status', "show whether it's active and list the rules"], ['enable, disable', 'turn the firewall on or off (needs root)'], ['deny from IP', 'drop all traffic from an address (needs root)'], ['allow PORT', 'allow traffic to a port (needs root)']], ['sudo ufw deny from 203.0.113.77', 'sudo ufw enable', 'sudo ufw status'], 'A rule does nothing until the firewall is active.'],
  lsblk: ['list block devices', 'lsblk', [], ['lsblk'], 'Shows disks (type disk) and their partitions (type part). A partition with no mountpoint is not in use yet.'],
  mount: ['attach a filesystem, or list what is mounted', 'mount [DEVICE DIR] | -a', [['(no args)', 'list everything currently mounted'], ['DEVICE DIR', 'mount DEVICE at DIR (needs root; DIR must exist)'], ['-a', 'mount everything listed in /etc/fstab that is not already mounted']], ['mount', 'sudo mount /dev/vdb1 /mnt/backups', 'sudo mount -a'], 'A plain mount is forgotten on reboot. Add a line to /etc/fstab to make it permanent.'],
  umount: ['detach a mounted filesystem', 'umount DIR | DEVICE', [], ['sudo umount /mnt/backups'], 'Note the spelling: umount, not unmount.'],
  findmnt: ['show mounted filesystems as a list', 'findmnt [TARGET]', [], ['findmnt', 'findmnt /mnt/backups']],
  tee: ['copy input to a file and to the screen', 'tee [-a] FILE', [['-a', 'append instead of overwriting']], ["echo '...' | sudo tee -a /etc/fstab"], 'Redirection (>) is handled by your shell, so `sudo echo x > file` writes as you, not root. `... | sudo tee file` writes the file as root. That is why tee exists.'],
  tar: ['create or extract an archive', 'tar -czf FILE PATHS | -xzf FILE | -tzf FILE', [['-c', 'create an archive'], ['-x', 'extract an archive'], ['-t', 'list the contents without extracting'], ['-z', 'compress with gzip (a .tar.gz / .tgz file)'], ['-f FILE', 'use this archive file'], ['-v', 'verbose: list each file'], ['-C DIR', 'change to DIR first (handy when extracting)']], ['tar -czf backup.tar.gz /srv/halcyon', 'tar -tzf backup.tar.gz', 'tar -xzf backup.tar.gz -C /tmp/restore'], 'Remember the letters: c create, x extract, t list; z for gzip; f for the file name.'],
  gzip: ['compress a file', 'gzip [-d] [-k] FILE', [['-d', 'decompress (same as gunzip)'], ['-k', 'keep the original file too']], ['gzip app.log', 'gzip -d app.log.gz'], 'gzip replaces file with file.gz. gunzip (or gzip -d) puts it back.'],
  gunzip: ['decompress a .gz file', 'gunzip FILE.gz', [], ['gunzip app.log.gz']],
  zcat: ['print the contents of a .gz file', 'zcat FILE.gz', [], ['zcat app.log.gz | head']],
  apt: ['install and manage software packages', 'apt SUBCOMMAND', [['update', 'refresh the list of available packages'], ['search TERM', 'find a package'], ['install PKG', 'install a package (needs root)'], ['remove PKG', 'uninstall a package (needs root)'], ['list --installed', 'list installed packages']], ['sudo apt update', 'apt search fail2ban', 'sudo apt install fail2ban'], 'Run `apt update` before installing, so the package list is current. apt-get is the older, script-friendly name for the same thing.'],
  'apt-get': ['install and manage packages (older interface)', 'apt-get SUBCOMMAND', [['update', 'refresh the package list'], ['install PKG', 'install (needs root)'], ['remove PKG', 'uninstall (needs root)']], ['sudo apt-get update', 'sudo apt-get install -y fail2ban']],
  dpkg: ['query the installed-package database', 'dpkg -l [PATTERN]', [['-l', 'list installed packages (optionally matching PATTERN)']], ['dpkg -l', 'dpkg -l fail2ban'], 'dpkg -l asks "is it installed, and which version?" apt installs; dpkg reports.'],
  bash: ['run a shell script', 'bash FILE [args] | -c "commands"', [['-c CMDS', 'run the commands in the string']], ['bash backup.sh', './backup.sh prod', 'bash -c "echo hi"'], 'A script is a text file of commands. Start it with `#!/bin/bash` and run it with `bash FILE`, or make it executable (chmod +x) and run it as `./FILE`. This game supports variables, $(...), if/then/else/fi, for/in/do/done, test/[ ], and exit.'],
  sh: ['run a shell script (same as bash here)', 'sh FILE', [], ['sh backup.sh']],
  printf: ['print formatted text', 'printf FORMAT [ARGS]', [['%s', 'insert the next argument'], ['\\n \\t', 'newline, tab']], ["printf '%s = %s\\n' name value"], 'Unlike echo, printf does not add a newline on its own; put \\n in the format.'],
  test: ['evaluate a condition (exit status 0 = true)', 'test EXPR  |  [ EXPR ]', [['-d PATH', 'PATH is a directory'], ['-f PATH', 'PATH is a regular file'], ['-e PATH', 'PATH exists'], ['-z STR / -n STR', 'STR is empty / non-empty'], ['A = B, A != B', 'string compare'], ['A -eq B, -gt, -lt ...', 'number compare']], ['[ -d /srv/halcyon ] && echo yes', 'if [ "$1" = "prod" ]; then echo prod; fi'], '`[` is the same command as test; it just requires a closing `]`. It is used with if and with && / ||.'],
  export: ['set an environment variable', 'export NAME=VALUE', [], ['export EDITOR=nano'], 'A plain NAME=VALUE also sets a variable; export marks it for programs the shell starts.'],
  logrotate: ['rotate and compress log files', 'logrotate [-f] [-v] CONFIG', [['-f', 'force a rotation right now'], ['-v', 'verbose: say what it did']], ['sudo logrotate -f /etc/logrotate.d/halcyon'], 'A config under /etc/logrotate.d names the logs and how many to keep (rotate N), whether to compress, and how often. Rotating renames app.log to app.log.1, shifts older ones up, and starts a fresh empty app.log.'],
  docker: ['build and run containers', 'docker COMMAND', [['images', 'list local images'], ['pull IMAGE', 'download an image'], ['run -d --name N -p H:C IMG', 'start a container in the background'], ['ps [-a]', 'list running (or all) containers'], ['logs NAME', 'show a container\'s output'], ['exec NAME CMD', 'run a command inside a container'], ['stop / start / rm NAME', 'stop, start or remove a container']], ['docker images', 'docker run -d --name web -p 8080:8080 halcyon/web:2.4.0', 'docker ps', 'docker logs web'], 'An image is a template; a container is a running instance of one. -p H:C publishes container port C on host port H. This game simulates a small subset of docker.'],
  podman: ['run containers (same commands as docker here)', 'podman COMMAND', [], ['podman ps']],
  git: ['track changes to files', 'git COMMAND', [['status', 'what has changed'], ['log [--oneline]', 'the commit history'], ['diff', 'show unstaged changes'], ['add FILE | -A', 'stage changes for the next commit'], ['commit -m "MSG"', 'record the staged changes'], ['branch', 'list branches'], ['checkout -b NAME', 'make and switch to a branch'], ['tag NAME', 'mark a release']], ['git status', 'git log --oneline', 'git add -A', 'git commit -m "bump workers"'], 'The cycle is: change files, `git add` to stage them, `git commit -m` to record a snapshot. This game simulates one repository under ~/halcyon-app.'],
  uptime: ['show how long the system has been up and its load average', 'uptime', [], ['uptime'], 'The three load numbers are the average number of busy processes over the last 1, 5 and 15 minutes. On a 4-core box, 4.0 means fully loaded.'],
  free: ['show memory use', 'free [-h]', [['-h', 'human-readable sizes']], ['free -h'], 'Look at the "available" column, not "free": Linux uses spare memory for cache and hands it back when programs need it.'],
  renice: ['change the priority of a running process', 'renice [-n] PRIORITY [-p] PID', [['-n N', 'the new niceness, -20 (greediest) to 19 (most generous)'], ['-p PID', 'the process to change']], ['sudo renice -n 10 -p 812'], 'A higher niceness means the process yields the CPU to others. Only root can make a process greedier (lower the number).'],
  useradd: ['create a user account', 'useradd [-m] [-s SHELL] [-G GROUPS] NAME', [['-m', 'create the home directory'], ['-s SHELL', 'login shell'], ['-G G1,G2', 'add to these extra groups']], ['sudo useradd -m -s /bin/bash sam', 'sudo useradd -m -s /usr/sbin/nologin svc'], 'Needs root. adduser is a friendlier front-end for the same thing. After creating a user you still set their groups (usermod -aG) and a key or password.'],
  adduser: ['create a user account (friendly front-end)', 'adduser NAME', [], ['sudo adduser sam']],
  userdel: ['delete a user account', 'userdel [-r] NAME', [['-r', 'also remove the home directory']], ['sudo userdel -r olduser'], 'On a real server, prefer locking an account over deleting it if you may need its files later.'],
  'ssh-keygen': ['create an SSH key pair', 'ssh-keygen [-t TYPE] [-f FILE] [-C COMMENT]', [['-t TYPE', 'key type, e.g. ed25519'], ['-f FILE', 'where to save it (default ~/.ssh/id_ed25519)'], ['-C TEXT', 'a label for the key']], ['ssh-keygen -t ed25519 -C "sam@halcyon"'], 'Makes two files: the private key (keep secret, mode 600) and FILE.pub (the public key you share). Key logins replace passwords.'],
  sha256sum: ['compute or check a SHA-256 checksum', 'sha256sum [-c] FILE...', [['-c FILE', 'check files against a list of sums']], ['sha256sum app.conf', 'sha256sum -c sums.txt'], 'Two files with the same checksum have the same contents. Use it to prove a copy or a restore is intact. (This game uses a stand-in hash, not real SHA-256.)'],
  md5sum: ['compute or check an MD5 checksum', 'md5sum [-c] FILE...', [['-c FILE', 'check files against a list of sums']], ['md5sum app.conf']],
  diff: ['compare two files line by line', 'diff FILE1 FILE2', [], ['diff original.conf restored.conf'], 'No output means the files are identical. Otherwise it shows the lines that differ.'],
  nl: ['number the lines of a file', 'nl FILE', [], ['nl ~/backup.sh']],
  tac: ['print a file with its lines reversed (cat backwards)', 'tac FILE', [], ['tac /etc/hosts']],
  rev: ['reverse the characters of each line', 'rev FILE', [], ['echo hello | rev']],
  column: ['format input into aligned columns', 'column -t [-s SEP] [FILE]', [['-t', 'make a table'], ['-s C', 'split on character C (default: whitespace)']], ['cut -d: -f1,7 /etc/passwd | column -t -s:']],
  comm: ['compare two sorted files line by line', 'comm FILE1 FILE2', [], ['comm a.txt b.txt'], 'Column 1: only in FILE1. Column 2: only in FILE2. Column 3: in both. Both files must be sorted.'],
  dig: ['look up DNS records', 'dig [+short] NAME', [['+short', 'print just the answer']], ['dig +short halcyon-db01', 'dig halcyon.example'], 'Resolves a name to an address using the system resolver.'],
  host: ['simple DNS lookup, both directions', 'host NAME | IP', [], ['host halcyon.example', 'host 10.0.4.20'], 'Give it a name to get an address, or an address to get a name (reverse lookup).'],
  nslookup: ['query DNS interactively or by name', 'nslookup NAME | IP', [], ['nslookup halcyon.example']],
  nc: ['test or talk to a TCP port', 'nc -zv HOST PORT', [['-z', 'just scan, send no data'], ['-v', 'verbose: say whether it connected']], ['nc -zv 10.0.4.20 5432'], 'A quick way to check "is this port open and reachable?" without a full client.'],
  traceroute: ['show the network path to a host', 'traceroute HOST', [], ['traceroute halcyon-db01']],
  sysctl: ['read or change kernel parameters', 'sysctl [-a] [-w] KEY[=VALUE]', [['-a', 'list every parameter'], ['-w KEY=VAL', 'set a parameter (needs root)']], ['sysctl net.ipv4.ip_forward', 'sudo sysctl -w net.ipv4.ip_forward=1'], '`sysctl -w` changes a value now; it resets on reboot. To make it permanent, add the line to /etc/sysctl.conf.'],
  dmesg: ['print the kernel ring buffer (boot and hardware messages)', 'dmesg', [], ['dmesg | tail', 'dmesg | grep -i eth0']],
  lsmod: ['list loaded kernel modules', 'lsmod', [], ['lsmod']],
  modinfo: ['show information about a kernel module', 'modinfo MODULE', [], ['modinfo ext4']],
  alias: ['create a shortcut for a command', "alias [NAME='COMMAND']", [], ["alias ll='ls -l'", 'alias'], 'With no arguments it lists your aliases. Add the alias line to ~/.bashrc to keep it across sessions.'],
  unalias: ['remove an alias', 'unalias NAME', [], ['unalias ll']],
  which: ['show which file would run for a command', 'which NAME', [], ['which cat']],
  type: ['say how a name would be interpreted', 'type NAME', [], ['type ll', 'type cd'], 'Tells you whether a name is a command, a shell builtin, or an alias.'],
  umask: ['show or set the default-permission mask for new files', 'umask [MASK]', [], ['umask', 'umask 027'], 'The mask is subtracted from the default permissions, so 022 makes new files rw-r--r--.'],
  getfacl: ['show a file\'s access control list', 'getfacl FILE', [], ['getfacl report.txt']],
  setfacl: ['change a file\'s access control list', 'setfacl -m u:USER:PERMS FILE', [['-m', 'modify: add or change an entry'], ['-b', 'remove all ACL entries']], ['setfacl -m u:sam:rw report.txt'], 'ACLs grant one named user or group access beyond the normal owner/group/other permissions.'],
  pvcreate: ['mark a disk as an LVM physical volume', 'pvcreate DEVICE', [], ['sudo pvcreate /dev/vdc'], 'Step 1 of LVM: physical volume (pvcreate) -> volume group (vgcreate) -> logical volume (lvcreate).'],
  vgcreate: ['create an LVM volume group from physical volumes', 'vgcreate NAME DEVICE...', [], ['sudo vgcreate data /dev/vdc']],
  lvcreate: ['create a logical volume in a volume group', 'lvcreate -n NAME -L SIZE VG', [['-n NAME', 'name of the logical volume'], ['-L SIZE', 'size, e.g. 5G']], ['sudo lvcreate -n reports -L 5G data'], 'The result is a block device at /dev/VG/NAME you can mkfs and mount.'],
  pvs: ['list LVM physical volumes', 'pvs', [], ['pvs']],
  vgs: ['list LVM volume groups', 'vgs', [], ['vgs']],
  lvs: ['list LVM logical volumes', 'lvs', [], ['lvs']],
  mkfs: ['make a filesystem on a device', 'mkfs -t TYPE DEVICE  (or mkfs.ext4 DEVICE)', [['-t TYPE', 'filesystem type, e.g. ext4']], ['sudo mkfs.ext4 /dev/data/reports'], 'Formats the device. Then make a mountpoint and mount it, and add it to /etc/fstab to keep it.'],
  blkid: ['list block devices with their UUIDs and filesystem types', 'blkid', [], ['blkid']],
  lsof: ['list open files and the processes using them', 'lsof [-i :PORT] [FILE]', [['-i :PORT', 'what is listening on a port'], ['FILE', 'what has this file open']], ['sudo lsof -i :8080', 'sudo lsof /var/log/halcyon/app.log']],
  timeout: ['run a command, but kill it after a time limit', 'timeout DURATION COMMAND', [], ['timeout 5 ping 10.0.4.20']],
  nohup: ['run a command so it keeps going after you log out', 'nohup COMMAND &', [], ['nohup ./long-job.sh &']],
  jobs: ['list background jobs', 'jobs', [], ['jobs']],
  vmstat: ['report processes, memory, io and cpu activity', 'vmstat', [], ['vmstat']],
  iostat: ['report cpu and disk i/o statistics', 'iostat', [], ['iostat']],
  watch: ['run a command repeatedly and watch its output', 'watch [-n SECONDS] COMMAND', [['-n N', 'rerun every N seconds']], ['watch -n 2 systemctl status halcyon'], 'In this game it runs the command once.'],
  make: ['run the recipes in a Makefile', 'make [TARGET]', [['-n', 'dry run: print the commands without running them']], ['make backup', 'make deploy'], 'A Makefile names targets, each with tab-indented commands. `make TARGET` runs that target\'s commands.'],
  hint: ['game: reveal the next hint for this ticket', 'hint', [], ['hint'], 'Each hint lowers this ticket\'s reward by 25 XP (minimum 25).'],
  tracker: ['game: turn the optional speed tracker on or off', 'tracker', [], ['tracker'], 'When on, each ticket is timed and the time (and hints used) is logged. Toggle it with the Speed tracker button in the header too. Your log is kept when you turn it off.'],
  stats: ['game: show your speed-tracker log', 'stats', [], ['stats'], 'Prints the time you took on each resolved ticket, plus totals, average, fastest and slowest. Only records while the tracker is on.'],
  submit: ['game: answer a question ticket', 'submit ANSWER', [], ['submit 42', 'submit 03:47:12']],
  retry: ['game: restore the server to how it was when this ticket opened', 'retry', [], ['retry']]
};
const COMMAND_COACH = {
  pwd: { summary: 'Shows the absolute path of your current working directory.', example: 'pwd', pitfall: 'It reports your location; it does not change directories.' },
  whoami: { summary: 'Prints the account name used by this shell session.', example: 'id', pitfall: 'Use id when you also need UID, primary group, and supplementary groups.' },
  ls: { summary: 'Lists directory entries. Add options to reveal hidden files or useful metadata.', example: 'ls -lah /var/log', pitfall: 'A plain ls hides dotfiles. Try -a when a configuration file seems to be missing.' },
  cd: { summary: 'Changes the shell working directory. Relative paths start from where you are now.', example: 'cd /var/log', pitfall: 'A path beginning with / is absolute; .. means the parent directory.' },
  cat: { summary: 'Prints file contents to the terminal, making it useful for short text files.', example: 'cat /etc/hosts', pitfall: 'Large files can flood the terminal. Use less or tail for longer logs.' },
  grep: { summary: 'Finds lines matching a text pattern inside input or files; it is often combined with a pipe.', example: 'grep -i error /var/log/syslog', pitfall: 'Patterns are case-sensitive unless you add -i.' },
  tail: { summary: 'Shows the end of a file, where recent log entries usually appear.', example: 'tail -n 20 /var/log/syslog', pitfall: 'The default is only ten lines. Use -n to choose a useful window.' },
  df: { summary: 'Reports filesystem capacity and free space; -h makes sizes readable.', example: 'df -h', pitfall: 'df checks filesystem space. Use du to find which directory is consuming it.' },
  du: { summary: 'Estimates space used by files and directories.', example: 'du -sh /var/log', pitfall: 'du measures selected paths; df reports capacity for the mounted filesystem.' },
  ps: { summary: 'Takes a snapshot of processes. Options control which processes and columns appear.', example: 'ps aux', pitfall: 'ps is a snapshot, not a live view. Use top when you need continuous updates.' },
  systemctl: { summary: 'Inspects and controls systemd services and other units.', example: 'systemctl status halcyon', pitfall: 'status is read-only; restart changes service state. Check before changing production services.' },
  journalctl: { summary: 'Reads logs collected by systemd-journald. Filter by unit to focus on one service.', example: 'journalctl -u halcyon -n 30', pitfall: 'Without a filter, the journal can be very noisy. Add -u UNIT or -n N.' },
  ip: { summary: 'Inspects or configures network interfaces, addresses, and routes.', example: 'ip addr show', pitfall: 'ip addr shows addresses; ip route shows the routing table.' },
  ss: { summary: 'Displays socket and connection information, including listening ports.', example: 'ss -tuln', pitfall: 'Use -l to show listeners and -n to avoid name lookups.' },
  chmod: { summary: 'Changes permission bits that control who can read, write, or execute a file.', example: 'chmod u+x ~/health.sh', pitfall: 'Avoid 777 as a quick fix; grant only the permissions the owner or group needs.' },
  find: { summary: 'Searches directory trees by name, type, time, and other attributes.', example: 'find /var/log -name "*.log"', pitfall: 'Quote wildcard patterns so find, not the shell, expands them.' },
  free: { summary: 'Summarises memory use. The available column is a better headroom signal than free alone.', example: 'free -h', pitfall: 'Linux uses spare memory for cache; low free memory does not automatically mean a problem.' },
  uptime: { summary: 'Shows how long the system has run, logged-in users, and load averages.', example: 'uptime', pitfall: 'Load average includes runnable and I/O-waiting tasks; it is not a CPU percentage.' },
  dig: { summary: 'Queries DNS records and shows how a name resolves.', example: 'dig halcyon-web01', pitfall: 'A DNS answer is not proof that the application port is reachable.' }
};
const COACH_ACTIONS = new Set(['systemctl', 'apt', 'apt-get', 'ufw', 'mount', 'umount', 'git']);
const COMMAND_INCIDENT_STEPS = [
  { command: 'systemctl', args: ['status', 'halcyon'], task: '1 · Inspect the service. Check the current status of halcyon without changing it.', success: 'Service state checked. Now inspect its recent logs.' },
  { command: 'journalctl', args: ['-u', 'halcyon', '-n', '20'], task: '2 · Review recent logs. Read the latest 20 journal entries for halcyon.', success: 'Recent service logs reviewed. Now check whether the expected ports are listening.' },
  { command: 'ss', args: ['-tuln'], task: '3 · Check network listeners. List listening TCP and UDP sockets with numeric ports.', success: 'Listener state checked. Investigation complete — you have gathered service, log, and socket evidence.' }
];
const COMMAND_INCIDENT_UNLOCK_CH = 4; // Chapter 5: Processes & scheduling
let commandIncidentActive = false;
let commandIncidentStep = 0;
let commandIncidentUnlocked = false;
function isCommandIncidentUnlocked() {
  if (commandIncidentUnlocked || commandIncidentActive || commandIncidentStep > 0) return true;
  if (typeof S === 'undefined') return false;
  if (S.finished) return true;
  const current = typeof MISSIONS !== 'undefined' && MISSIONS[S.mission];
  return !!(current && current.ch >= COMMAND_INCIDENT_UNLOCK_CH);
}
function renderCommandIncident() {
  const unlocked = isCommandIncidentUnlocked();
  const lockedEl = document.getElementById('commandIncidentLocked');
  const lockCopy = document.getElementById('commandIncidentLockCopy');
  const bodyEl = document.getElementById('commandIncidentBody');
  if (lockedEl) lockedEl.hidden = unlocked;
  if (bodyEl) bodyEl.hidden = !unlocked;
  if (!unlocked && lockCopy && typeof S !== 'undefined' && typeof MISSIONS !== 'undefined') {
    const cur = MISSIONS[S.mission];
    const chNum = cur ? cur.ch + 1 : 1;
    lockCopy.textContent = 'Unlocks at Chapter 5 (Processes & services) once you\'ve mastered navigation, files, logs, and permissions. Currently on Chapter ' + chNum + '.';
  }
  const task = document.getElementById('commandIncidentTask');
  const progress = document.getElementById('commandIncidentProgress');
  const start = document.getElementById('commandIncidentStart');
  if (task) task.textContent = commandIncidentActive
    ? COMMAND_INCIDENT_STEPS[commandIncidentStep]?.task || 'Investigation complete. Summarise what the evidence tells you.'
    : 'Start the challenge when you\'re ready. You\'ll inspect service state, recent logs, and listening sockets.';
  if (progress) progress.textContent = commandIncidentStep + '/3 investigation steps';
  if (start) start.textContent = commandIncidentActive ? 'Restart investigation' : commandIncidentStep === 3 ? 'Run it again' : 'Start investigation';
}
function updateCommandIncident(name, args) {
  if (!commandIncidentActive) return;
  const step = COMMAND_INCIDENT_STEPS[commandIncidentStep];
  if (!step || name !== step.command) return;
  const feedback = document.getElementById('commandIncidentFeedback');
  if (!step.args.every(token => args.includes(token))) {
    if (feedback) { feedback.textContent = 'Not quite. This step is read-only; check the required action and options, then try again.'; feedback.dataset.result = 'retry'; }
    return;
  }
  commandIncidentStep += 1;
  if (feedback) {
    feedback.textContent = step.success;
    feedback.dataset.result = 'success';
  }
  if (commandIncidentStep === COMMAND_INCIDENT_STEPS.length) commandIncidentActive = false;
  renderCommandIncident();
  if (investigationTourOpen) setInvestigationTourStep(2 + commandIncidentStep);
}

const COMMAND_DRILLS = {
  whoami: { task: 'Confirm which account is running this shell.', command: 'whoami', args: [], success: 'Correct — whoami prints the current account name.' },
  ls: { task: 'List all entries, including hidden dotfiles, in the current directory.', command: 'ls', args: ['-a'], success: 'Correct — -a includes hidden entries.' },
  grep: { task: 'Find lines containing “error” in the system log, ignoring letter case.', command: 'grep', args: ['-i', 'error', '/var/log/syslog'], success: 'Correct — grep -i matches error regardless of letter case.' },
  df: { task: 'Show filesystem space in human-readable units.', command: 'df', args: ['-h'], success: 'Correct — -h displays sizes in readable units.' },
  systemctl: { task: 'Check the current status of the halcyon service without changing it.', command: 'systemctl', args: ['status', 'halcyon'], success: 'Correct — systemctl status inspects the service without restarting it.' },
  journalctl: { task: 'Read the latest 20 journal entries for the halcyon service.', command: 'journalctl', args: ['-u', 'halcyon', '-n', '20'], success: 'Correct — -u filters by unit and -n limits the number of entries.' },
  ss: { task: 'List listening TCP and UDP sockets using numeric ports.', command: 'ss', args: ['-tuln'], success: 'Correct — -tuln shows TCP/UDP listeners with numeric addresses.' }
};
const commandCoachSeen = new Set();
const completedCommandDrills = new Set();
let activeCommandDrill = null;
let commandCoachLastExample = '';
function renderCommandSkills() {
  const root = document.getElementById('commandSkillProgress');
  if (!root) return;
  const completed = new Set(S.commandSkills || []);
  const names = Object.keys(COMMAND_DRILLS);
  const count = names.filter(name => completed.has(name)).length;
  const track = root.querySelector('.skill-progress-track');
  const bar = track && track.querySelector('span');
  const progress = root.querySelector('[role="progressbar"]');
  const countLabel = document.getElementById('commandSkillCount');
  const summary = document.getElementById('commandSkillSummary');
  if (countLabel) countLabel.textContent = count + '/' + names.length;
  if (summary) summary.textContent = count === names.length ? 'All core command skills practised. Revisit any skill from the command coach.' : count + ' core command skill' + (count === 1 ? '' : 's') + ' practised. Your progress is saved on this device.';
  if (bar) bar.style.width = (count / names.length * 100) + '%';
  if (progress) progress.setAttribute('aria-valuenow', String(count));
  const grid = document.getElementById('commandSkillGrid');
  if (grid) grid.innerHTML = names.map(name => {
    const done = completed.has(name);
    return '<div class="skill-progress-item" data-skill="' + name + '" data-complete="' + done + '"><span class="skill-progress-mark" aria-hidden="true">' + (done ? '✓' : '○') + '</span><span class="skill-progress-name">' + name + '</span><span class="skill-progress-state">' + (done ? 'Practised' : 'Not yet') + '</span></div>';
  }).join('');
}
function updateCommandCoach(name, args) {
  updateCommandIncident(name, args);
  if (activeCommandDrill) {
    const drill = COMMAND_DRILLS[activeCommandDrill];
    if (drill && name === drill.command) {
      const passed = drill.args.every(token => args.includes(token));
      const feedback = document.getElementById('commandCoachDrillFeedback');
      if (passed) {
        completedCommandDrills.add(activeCommandDrill);
        S.commandSkills = Array.from(new Set([...(S.commandSkills || []), activeCommandDrill]));
        save();
        renderCommandSkills();
        feedback.textContent = drill.success;
        feedback.dataset.result = 'success';
        activeCommandDrill = null;
        document.getElementById('commandCoachDrillTask').hidden = true;
        document.getElementById('commandCoachDrillStart').textContent = 'Practise another skill';
      } else {
        feedback.textContent = 'Not quite yet. Check the task for the required option or argument, then try again.';
        feedback.dataset.result = 'retry';
      }
      feedback.hidden = false;
      document.getElementById('commandCoachDrillProgress').textContent = 'Saved skills: ' + (S.commandSkills || []).length + '/7 practised';
    }
  }
  const panel = document.getElementById('commandCoach');
  const toggle = document.getElementById('commandCoachToggle');
  if (!panel || !toggle || GAME_CMDS.includes(name)) return;
  const guide = COMMAND_COACH[name];
  const manual = MAN[name];
  if (!guide && !manual) return;
  const summary = guide ? guide.summary : manual[0] + '. Use the manual for options and syntax.';
  const example = guide ? guide.example : (manual[3] && manual[3][0]) || (name + ' --help');
  const pitfall = guide ? guide.pitfall : 'Check the target and options before running a command; try man ' + name + ' for details.';
  const tokens = [name, ...args];
  const parts = tokens.map((token, index) => {
    let kind = index === 0 ? 'command' : token.startsWith('-') ? 'option' :
      (COACH_ACTIONS.has(name) && index === 1) ? 'action' :
      (/^(\/|~|\.\.?($|\/))/.test(token) ? 'path' : 'argument');
    return '<span class="coach-part"><small>' + kind + '</small><code>' + esc(token) + '</code></span>';
  }).join('');
  document.getElementById('commandCoachSummary').textContent = summary;
  document.getElementById('commandCoachSummary').dataset.command = name;
  const drillButton = document.getElementById('commandCoachDrillStart');
  if (drillButton) {
    drillButton.hidden = !COMMAND_DRILLS[name];
    drillButton.textContent = completedCommandDrills.has(name) ? 'Practise this skill again' : 'Practice this skill';
  }
  document.getElementById('commandCoachDrillProgress').textContent = 'Saved skills: ' + (S.commandSkills || []).length + '/7 practised';
  document.getElementById('commandCoachParts').innerHTML = parts || '<span class="empty">No arguments</span>';
  document.getElementById('commandCoachExample').textContent = example;
  document.getElementById('commandCoachPitfall').textContent = 'Watch out: ' + pitfall;
  commandCoachLastExample = example;
  toggle.hidden = false;
  const firstUse = !commandCoachSeen.has(name);
  commandCoachSeen.add(name);
  panel.hidden = !firstUse;
  toggle.setAttribute('aria-expanded', String(firstUse));
}

function renderMan(n) {
  const [d, syn, op, ex, note] = MAN[n];
  const H = `${n.toUpperCase()}(1)`;
  let s = `${H}${' '.repeat(Math.max(2, 44 - H.length * 2))}${H}\n\nNAME\n       ${n} - ${d}\n\nSYNOPSIS\n       ${syn}\n`;
  if (op.length) { const w = Math.max(...op.map(o => o[0].length)) + 3; s += '\nOPTIONS\n' + op.map(o => `       ${o[0].padEnd(w)}${o[1]}`).join('\n') + '\n'; }
  if (ex.length) s += '\nEXAMPLES\n' + ex.map(e => '       ' + e).join('\n') + '\n';
  if (note) s += '\nNOTE\n       ' + note + '\n';
  return s;
}

/* ============================================================
   Missions
   ============================================================ */
const LEARNING_LEVELS = [
  { title: 'Linux foundations', first: 0, last: 3, description: 'Get comfortable with the shell, files, logs and accounts.' },
  { title: 'Everyday administration', first: 4, last: 9, description: 'Manage processes, networking, storage, backups and system security.' },
  { title: 'Automation and services', first: 10, last: 14, description: 'Use scripts, service managers, logs, containers and deployment workflows.' },
  { title: 'Advanced operations', first: 15, last: 29, description: 'Connect the concepts through reviews, deeper system work and a capstone.' },
  { title: 'Incident response lab', first: 30, last: 34, description: 'Investigate complex failures using evidence and a repeatable method.' }
];
const FINALE = { title: 'Chief Incident Commander', story: "Thirty chapters ago this box went down at 3am with a full disk and a secret, and you did not know whoami. You fixed the crash, closed the leak, locked the accounts, hardened the doors, automated the backups, scheduled them with systemd, read the traffic, rotated the logs, containerised the release, shipped it under version control, and did it all again under pressure. Then you went deeper \u2014 regex and DNS, the kernel and the shell, ACLs and LVM, signals and observability, automation \u2014 and finally built a whole new service from zero. Then came the incident files \u2014 the phantom disk, the inode flood, the intruder who was already root, the service the kernel kept killing, the ghost load that was really a stuck disk \u2014 the pages that wake real admins at 3am, and you worked every one of them to a clean close. Dana left you a broken server and a warning. You became the person the next Dana hopes answers the page.", next: 'You have reached the end', nextText: "Thirty-five chapters, 180-plus tickets, from `whoami` to commanding an incident. There is nothing left to teach you here \u2014 the sandbox, and every command in it, is yours." };
const P = {
  handover: HOME + '/.handover.txt', readme: '/srv/halcyon/README',
  conf: '/srv/halcyon/releases/v2.3.1/config/app.conf', oldconf: '/srv/halcyon/releases/v2.2.0/config/app.conf',
  draft: '/srv/halcyon/releases/v2.3.1/.dana/draft-report.md',
  sync: '/srv/halcyon/export/sync_out.sh', quar: HOME + '/incident/quarantine',
  keep: ['/tmp/session.lock', '/tmp/build/cache/deps.tar', '/tmp/build/notes-on-core-dumps.txt']
};
const isDir = p => getNode(p)?.type === 'dir';
const fileContent = p => { const n = getNode(p); return n && n.type === 'file' ? n.content : null; };
const anyFileWith = content => { let found = false; walkAll('/', S.fs, (p, n) => { if (n.type === 'file' && n.content === content) found = true; }); return found; };
const coresLeft = () => { let c = 0; walkAll('/tmp', getNode('/tmp'), (p, n) => { if (n.type === 'file' && p.endsWith('.core')) c++; }); return c; };

let learningMasteryPassed = false;
const { CHAPTERS, MISSIONS } = globalThis.LSAMissions.build({ APPLOG, BAD_IP, BASH_COUNT, D, ERR_COUNT, EVIDENCE, F, HOME, LAST_TIME, P, SYNC, USER, allParts, anyFileWith, coresLeft, editEtc, fileContent, findSync, getNode, grEntries, isDir, pwEntries, splitLines, walkAll, state: () => S, masteryPassed: () => learningMasteryPassed });
function findSync() {
  const q = getNode(P.quar + '/sync_out.sh');
  if (q && q.type === 'file' && q.content === SYNC) return { abs: P.quar + '/sync_out.sh', node: q };
  let hit = null; walkAll(HOME, getNode(HOME), (p, n) => { if (!hit && n.type === 'file' && n.content === SYNC) hit = { abs: p, node: n }; });
  return hit;
}

/* ============================================================
   Terminal UI
   ============================================================ */
const tout = $('#tout'), tin = $('#tin'), tbody = $('#tbody'), tprompt = $('#tprompt');
const fmtTerm = s => esc(s).replace(/\u0001([dxmfn])/g, '<span class="c-$1">').replace(/\u0001e/g, '</span>');
function trimOut() { while (tout.childElementCount > 800) tout.firstElementChild.remove(); }
function clearMistakeCoach() {
  const panel = document.getElementById('mistakeCoach');
  if (panel) panel.hidden = true;
}
function showMistakeCoach(raw) {
  const panel = document.getElementById('mistakeCoach');
  if (!panel) return;
  const feedback = window.LSAFeedback
    ? window.LSAFeedback.classifyCommandFailure({ discipline: 'linux', output: raw })
    : { title: 'Command or operation failed', reason: 'The command did not complete. Inspect the exact error and current state.', next: 'Check the command manual and repeat the original check after one targeted correction.' };
  const category = feedback.title, reason = feedback.reason, next = feedback.next;
  panel.querySelector('[data-mistake-category]').textContent = category;
  panel.querySelector('[data-mistake-reason]').textContent = reason;
  panel.querySelector('[data-mistake-next]').textContent = next;
  panel.hidden = false;
}
function emit(text, cls) {
  if (text === '' || text == null) return;
  if (cls !== 'err') { for (const tp of ECHO_TAPS) tp.v += text; if (OUT_CAPTURE) { OUT_CAPTURE.v += text; return; } }
  const div = document.createElement('div');
  div.className = 'o' + (cls ? ' ' + cls : '');
  div.innerHTML = fmtTerm(text.replace(/\n$/, ''));
  tout.appendChild(div); trimOut();
  if (cls === 'err') showMistakeCoach(text);
}
function emitSys(html, kind) {
  const div = document.createElement('div');
  div.className = 'sys ' + (kind || '');
  div.innerHTML = html;
  tout.appendChild(div); trimOut(); scrollEnd();
}
const promptPath = () => S.cwd === HOME ? '~' : S.cwd.startsWith(HOME + '/') ? '~' + S.cwd.slice(HOME.length) : S.cwd;
const promptHTML = () => `<span class="pu">${USER}@${HOST}</span>:<span class="pp">${esc(promptPath())}</span>$`;
function echoCmd(line) { const div = document.createElement('div'); div.className = 'o cmdl'; div.innerHTML = promptHTML() + ' ' + esc(line); tout.appendChild(div); }
function updatePrompt() { tprompt.innerHTML = promptHTML(); }
function scrollEnd() { tbody.scrollTop = tbody.scrollHeight; }

let pendingComplete = false;
function submitLine(line) {
  echoCmd(line);
  if (line.trim()) { S.history.push(line); if (S.history.length > 300) S.history.shift(); }
  pendingComplete = false;
  try { runLine(line); } catch (e) { emit('bash: internal error: ' + e.message, 'err'); }
  if (clearRequested) { tout.innerHTML = ''; clearRequested = false; }
  afterCommand();
  updatePrompt(); render(); renderCommandSkills(); save(); scrollEnd();
}
function afterCommand() {
  if (S.finished) return;
  const m = MISSIONS[S.mission];
  if (pendingComplete) { pendingComplete = false; completeMission(); return; }
  if (m.fail) { const f = m.fail(); if (f && !S.nudged.includes('F:' + f)) { S.nudged.push('F:' + f); emitSys('⚠ ' + md(f), 'warn'); } }
  if (m.nudge) { const n = m.nudge(); if (n && !S.nudged.includes(n)) { S.nudged.push(n); emitSys(md(n), 'nudge'); } }
  if (m.check && m.check() && (!m.learning || learningMasteryPassed)) completeMission();
}
const rewardFor = m => Math.max(25, 100 - 25 * (S.hints[m.id] || 0));
function fmtDur(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function trackerOn() { return !!S.tracker; }
function trackStart() { if (S.tracker && !S.finished) S.missionStart = Date.now(); }
let clockIv = null;
function tickClock() {
  const el = $('#clock');
  if (!el) return;
  if (S.tracker && !S.finished && S.missionStart) { const d = fmtDur(Date.now() - S.missionStart); el.textContent = d; const live = $('#spdLive'); if (live) live.textContent = d; }
}
function ensureClock() {
  if (clockIv) return;
  clockIv = setInterval(tickClock, 1000);
}
function toggleTracker() {
  S.tracker = !S.tracker;
  if (S.tracker) { S.times = S.times || []; S.missionStart = Date.now(); emitSys('<b>Speed tracker on.</b> This ticket is being timed; each ticket you resolve from now is logged. Type <code>stats</code> to see your times, or <code>tracker</code> to turn it off.', 'ok'); }
  else { S.missionStart = null; emitSys('Speed tracker off. Your log is kept — turn it back on any time with <code>tracker</code>.', 'hint'); }
  render(); save();
}
function statsLog(ctx) {
  const times = S.times || [];
  if (!S.tracker && !times.length) { if (ctx) ctx.out('The speed tracker is off and no tickets have been timed yet.\nTurn it on with: tracker\n'); return; }
  if (!times.length) { if (ctx) ctx.out('Speed tracker is on, but no tickets have been resolved yet. The clock is running on the current ticket.\n'); return; }
  const total = times.reduce((a, r) => a + r.ms, 0);
  const avg = total / times.length;
  const fastest = times.reduce((a, r) => r.ms < a.ms ? r : a);
  const slowest = times.reduce((a, r) => r.ms > a.ms ? r : a);
  const hintsUsed = times.reduce((a, r) => a + (r.hints || 0), 0);
  if (!ctx) return;
  ctx.out('SPEED TRACKER LOG\n');
  ctx.out('TICKET       TIME     HINTS  TITLE\n');
  for (let i = 0; i < times.length; i++) { const r = times[i]; ctx.out(`${(r.ticket || ('#' + (i + 1))).padEnd(12)} ${fmtDur(r.ms).padStart(7)}  ${String(r.hints || 0).padStart(5)}  ${r.title}\n`); }
  ctx.out('\n');
  ctx.out(`Tickets timed : ${times.length}\n`);
  ctx.out(`Total time    : ${fmtDur(total)}\n`);
  ctx.out(`Average       : ${fmtDur(avg)}\n`);
  ctx.out(`Fastest       : ${fmtDur(fastest.ms)}  (${fastest.title})\n`);
  ctx.out(`Slowest       : ${fmtDur(slowest.ms)}  (${slowest.title})\n`);
  ctx.out(`Hints used    : ${hintsUsed}\n`);
}
// Append minimal learning events separately from the latest-state attempts
// table. Each enrolled class gets its own scoped copy so staff never gain
// visibility into a learner's activity in another class.
async function recordLearningEvidence(eventType, m, durationMs) {
  if (typeof RACE !== 'undefined' && RACE.active) return;
  if (!authUser) return;
  const sb = await getSB(); if (!sb) return;
  try {
    const { data: enrollments, error } = await sb.from('enrollments')
      .select('class_id').eq('user_id', authUser.id).eq('role', 'student');
    if (error) return;
    const classIds = [...new Set((enrollments || []).map(e => e.class_id).filter(Boolean))];
    const targets = classIds.length ? classIds : [null];
    const hints = (S.hints && S.hints[m.id]) || 0;
    const rows = targets.map(classId => ({
      user_id: authUser.id, class_id: classId, mission_id: m.id,
      event_type: eventType, hints,
      duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null
    }));
    await sb.from('learning_evidence').insert(rows);
  } catch (e) {}
}
async function recordAttempt(m) {
  if (typeof RACE !== 'undefined' && RACE.active) return;
  if (!authUser) return;
  const sb = await getSB(); if (!sb) return;
  const ms = (S.tracker && S.missionStart) ? (Date.now() - S.missionStart) : null;
  const hints = (S.hints && S.hints[m.id]) || 0;
  try {
    await sb.from('attempts').upsert({
      user_id: authUser.id,
      mission_id: m.id,
      passed: true,
      ms: ms,
      hints: hints,
      attempts: 1,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,mission_id' });
  } catch (e) {}
}
function completeMission() {
  const m = MISSIONS[S.mission], gain = rewardFor(m);
  const elapsedMs = S.missionStart ? Date.now() - S.missionStart : null;
  S.xp += gain; S.done.push(m.id);
  revisionScheduleMission(m);
  let timeStr = '';
  if (S.tracker && S.missionStart) {
    const ms = Date.now() - S.missionStart; const hn = S.hints[m.id] || 0;
    S.times = S.times || []; S.times.push({ ticket: ticketId(S.mission), id: m.id, ch: m.ch, title: m.title, ms, hints: hn, at: Date.now() });
    S.missionStart = null; timeStr = ` · <span class="pu">${fmtDur(ms)}</span>`;
  }
  recordAttempt(m);
  recordLearningEvidence('mission_completed', m, elapsedMs);
  if (PRACTICE.active && PRACTICE.label === 'Linux Security & Recovery Lab') {
    try { const completed = JSON.parse(localStorage.getItem('lsa-ops-recovery-complete') || '[]'); if (!completed.includes(m.id)) completed.push(m.id); localStorage.setItem('lsa-ops-recovery-complete', JSON.stringify(completed)); } catch (e) {}
  }
  if (PRACTICE.active && m.id === 'cross-track-web-availability-linux') crossTrackWrite('linux');
  if (PRACTICE.active && m.id === 'cross-track-remote-admin-linux') crossTrackWrite('remoteLinux');
  if (PRACTICE.active && m.id === 'cross-track-ssh-hardening-linux') crossTrackWrite('hardeningLinux');
  if (PRACTICE.active && m.id === 'cross-track-contractor-containment-linux') crossTrackWrite('contractorLinux');
  emitSys(`<b>✓ ${ticketId(S.mission)} resolved</b> · ${esc(m.title)} · +${gain} XP${timeStr}`, 'ok');
  S.mission++;
  if (RACE.active) { raceAdvance(); updatePrompt(); render(); return; }
  if (typeof PRACTICE !== 'undefined' && PRACTICE.active) { practiceAdvance(); updatePrompt(); render(); return; }
  const next = MISSIONS[S.mission];
  if (!next || next.ch !== m.ch) emitSys(md(CHAPTERS[m.ch].outro), 'ok');
  if (!next) S.finished = true;
  else startMission();
}
const ticketId = i => `INC-1025-${pad(i + 1)}`;
function startMission() {
  learningMasteryPassed = false;
  S.readM = []; S.cmdsM = []; S.nudged = [];
  const m = MISSIONS[S.mission], prev = MISSIONS[S.mission - 1];
  if (m.onStart) m.onStart();
  if (typeof RACE === 'undefined' || !RACE.active) repairWorld();
  trackStart();
  S.checkpoint = JSON.stringify(S.fs);
  if (!prev || prev.ch !== m.ch) emitSys(`<span class="chap">${CHAPTERS[m.ch].label}</span>${CHAPTERS[m.ch].name}`, 'chapter');
  announceMission();
}
function announceMission() {
  if (S.finished) { emitSys(`All tickets for chapters 1–${CHAPTERS.length} are closed. Chapter ${CHAPTERS.length + 1} is coming.`, 'ticket'); return; }
  const m = MISSIONS[S.mission];
  emitSys(`<b>${ticketId(S.mission)} · ${esc(m.title)}</b><br>${md(m.objective)}`, 'ticket');
}
function showHint() {
  if (S.finished) return;
  const m = MISSIONS[S.mission], n = S.hints[m.id] || 0;
  if (n >= m.hints.length) { emitSys('No more hints for this ticket. The last one gives the full answer.', 'hint'); return; }
  S.hints[m.id] = n + 1;
  recordLearningEvidence('hint_requested', m, null);
  emitSys(`<b>Hint ${n + 1}/${m.hints.length}:</b> ${md(m.hints[n])}`, 'hint');
  render(); save();
}
/* Recreate any MISSING game-essential files from their canonical state, so a
   file deleted earlier can never permanently block a later ticket. Never
   overwrites existing files (your edits are safe) and never re-adds files that
   a clean-up ticket is meant to delete: /tmp crash dumps, the PHP session
   flood, and the quarantined export script. */
function repairWorld() {
  const canon = buildFS();
  const excluded = abs => abs === '/tmp' || abs.indexOf('/tmp/') === 0 || abs.indexOf('/var/lib/php/sessions') === 0 || abs === P.sync;
  let n = 0;
  const walk = (abs, cnode) => {
    if (excluded(abs)) return;
    const live = getNode(abs);
    if (!live) {
      const par = getNode(parentOf(abs));
      if (par && par.type === 'dir') { par.children[baseName(abs)] = JSON.parse(JSON.stringify(cnode)); n++; }
      return;
    }
    if (cnode.type === 'dir' && live.type === 'dir') for (const k in cnode.children) walk(abs === '/' ? '/' + k : abs + '/' + k, cnode.children[k]);
  };
  for (const k in canon.children) walk('/' + k, canon.children[k]);
  return n;
}
function doRetry() {
  if (S.finished || !S.checkpoint) { emitSys('Nothing to restore.', 'hint'); return; }
  S.fs = JSON.parse(S.checkpoint);
  repairWorld();
  if (!getNode(S.cwd)) S.cwd = HOME;
  S.nudged = [];
  emitSys('Restored the server from backup to how it was when this ticket opened.', 'hint');
  render(); save();
}

/* ---------- tab completion and keys ---------- */
let hIdx = null, hDraft = '';
function complete() {
  const v = tin.value, pos = tin.selectionStart ?? v.length;
  const before = v.slice(0, pos), after = v.slice(pos);
  const m = before.match(/(^|[\s|;&<>])([^\s|;&<>]*)$/);
  const word = m ? m[2] : '', wstart = pos - word.length;
  const lead = before.slice(0, wstart);
  const isCmd = /^\s*$/.test(lead) || /[|;&]\s*$/.test(lead);
  let cands = [];
  if (isCmd && !word.includes('/')) cands = Object.keys(CMDS).filter(c => c.startsWith(word)).sort().map(c => ({ full: c, disp: c, suffix: ' ' }));
  else {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '', pre = word.slice(slash + 1);
    const L = lookup(dirPart === '' ? '.' : dirPart);
    if (L.err || L.node.type !== 'dir' || !canRead(L.node)) return;
    for (const name of Object.keys(L.node.children).sort()) {
      if (!name.startsWith(pre) || (name.startsWith('.') && !pre.startsWith('.'))) continue;
      const d = L.node.children[name].type === 'dir';
      cands.push({ full: dirPart + name, disp: name + (d ? '/' : ''), suffix: d ? '/' : ' ' });
    }
  }
  const set = s => { tin.value = lead + s + after; const p = wstart + s.length; tin.setSelectionRange(p, p); };
  if (!cands.length) return;
  if (cands.length === 1) { set(cands[0].full + cands[0].suffix); return; }
  const common = cands.reduce((acc, c) => { let i = 0; while (i < acc.length && acc[i] === c.full[i]) i++; return acc.slice(0, i); }, cands[0].full);
  if (common.length > word.length) set(common);
  else { echoCmd(v); emit(cands.map(c => c.disp).join('  ')); scrollEnd(); }
}
function histMove(dir) {
  if (!S.history.length) return;
  if (dir < 0) { if (hIdx === null) { hDraft = tin.value; hIdx = S.history.length; } if (hIdx > 0) { hIdx--; tin.value = S.history[hIdx]; } }
  else { if (hIdx === null) return; hIdx++; if (hIdx >= S.history.length) { hIdx = null; tin.value = hDraft; } else tin.value = S.history[hIdx]; }
  const p = tin.value.length; requestAnimationFrame(() => tin.setSelectionRange(p, p));
}
function setPanelTab(tabName) {
  const target = tabName === 'files' || tabName === 'progress' ? tabName : 'mission';
  const tabs = [...document.querySelectorAll('.panel-tab[data-panel-tab]')];
  const panes = {
    mission: document.getElementById('panelPaneMission'),
    files: document.getElementById('panelPaneFiles'),
    progress: document.getElementById('panelPaneProgress')
  };
  tabs.forEach(tab => {
    const active = tab.dataset.panelTab === target;
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.setAttribute('tabindex', active ? '0' : '-1');
  });
  Object.entries(panes).forEach(([key, pane]) => {
    if (pane) pane.hidden = key !== target;
  });
  const panel = document.getElementById('panel');
  if (panel) panel.scrollTop = 0;
}
(function initPanelTabs() {
  const tabs = [...document.querySelectorAll('.panel-tab[data-panel-tab]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setPanelTab(tab.dataset.panelTab));
    tab.addEventListener('keydown', e => {
      let next = null;
      if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next !== null) {
        e.preventDefault();
        setPanelTab(tabs[next].dataset.panelTab);
        tabs[next].focus();
      }
    });
  });
})();
const commandIncidentUnlock = $('#commandIncidentUnlock');
if (commandIncidentUnlock) commandIncidentUnlock.addEventListener('click', () => {
  commandIncidentUnlocked = true;
  renderCommandIncident();
  $('#commandIncidentStart')?.focus({ preventScroll: true });
});
const commandIncidentStart = $('#commandIncidentStart');
if (commandIncidentStart) commandIncidentStart.addEventListener('click', () => {
  commandIncidentUnlocked = true;
  commandIncidentStep = 0;
  commandIncidentActive = true;
  if (investigationTourOpen) setInvestigationTourStep(2);
  const feedback = $('#commandIncidentFeedback');
  if (feedback) { feedback.textContent = 'Investigation started. Enter the requested command in the terminal, then press Enter.'; feedback.dataset.result = ''; }
  renderCommandIncident();
  tin.focus({ preventScroll: true });
});
renderCommandIncident();
const coachToggle = $('#commandCoachToggle'), coachPanel = $('#commandCoach');
if (coachToggle) coachToggle.addEventListener('click', () => {
  const open = coachPanel.hidden;
  coachPanel.hidden = !open;
  coachToggle.setAttribute('aria-expanded', String(open));
});
const coachClose = $('#commandCoachClose');
if (coachClose) coachClose.addEventListener('click', () => {
  coachPanel.hidden = true;
  coachToggle.setAttribute('aria-expanded', 'false');
});
const coachUse = $('#commandCoachUse');
if (coachUse) coachUse.addEventListener('click', () => {
  tin.value = commandCoachLastExample;
  tin.focus({ preventScroll: true });
  tin.setSelectionRange(tin.value.length, tin.value.length);
});
const coachDrillStart = $('#commandCoachDrillStart');
if (coachDrillStart) coachDrillStart.addEventListener('click', () => {
  const name = $('#commandCoachSummary').dataset.command;
  const drill = COMMAND_DRILLS[name];
  if (!drill) return;
  activeCommandDrill = name;
  $('#commandCoachDrillTask').textContent = 'Your task: ' + drill.task;
  $('#commandCoachDrillTask').hidden = false;
  $('#commandCoachDrillFeedback').hidden = true;
  $('#commandCoachDrillStart').textContent = 'Drill in progress…';
  tin.focus({ preventScroll: true });
});
tin.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const v = tin.value; tin.value = ''; hIdx = null; submitLine(v); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); histMove(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); histMove(1); }
  else if (e.key === 'Tab') { e.preventDefault(); complete(); }
  else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); tout.innerHTML = ''; }
  else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && tin.selectionStart === tin.selectionEnd) { e.preventDefault(); echoCmd(tin.value + '^C'); tin.value = ''; hIdx = null; scrollEnd(); }
});
tbody.addEventListener('mouseup', () => { if (!String(window.getSelection()).length) tin.focus({ preventScroll: true }); });
document.querySelectorAll('.key').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.k;
  if (k === 'tab') complete(); else if (k === 'up') histMove(-1); else if (k === 'down') histMove(1);
  else { const p = tin.selectionStart ?? tin.value.length; tin.value = tin.value.slice(0, p) + k + tin.value.slice(p); tin.setSelectionRange(p + 1, p + 1); }
  tin.focus({ preventScroll: true });
}));

/* ---------- side panel ---------- */
const RANKS = [[0, 'Intern'], [4, 'Junior Admin'], [9, 'Sysadmin'], [14, 'Incident Lead'], [21, 'Security Lead'], [27, 'Platform Engineer'], [33, 'Reliability Lead'], [41, 'Staff SRE'], [53, 'Principal SRE'], [63, 'Automation Lead'], [73, 'Distinguished Engineer'], [84, 'Systems Architect'], [100, 'Kernel Whisperer'], [120, 'Grandmaster Admin'], [140, 'Legend of Halcyon'], [160, 'Incident Commander'], [180, 'Chief Incident Commander']];
const rankName = () => RANKS.filter(r => S.done.length >= r[0]).pop()[1];
function renderJourney() {
  const root = $('#journey');
  if (!root) return;
  root.hidden = !!RACE.active;
  if (RACE.active) return;
  const completedMissions = MISSIONS.filter(m => S.done.includes(m.id)).length;
  const totalMissions = MISSIONS.length;
  const completedChapters = CHAPTERS.filter((_, ci) => {
    const chapterMissions = MISSIONS.filter(m => m.ch === ci);
    return chapterMissions.length > 0 && chapterMissions.every(m => S.done.includes(m.id));
  }).length;
  const currentMission = MISSIONS[S.mission];
  const currentChapter = currentMission ? currentMission.ch : CHAPTERS.length - 1;
  const currentLevel = LEARNING_LEVELS.findIndex(level => currentChapter >= level.first && currentChapter <= level.last);
  const pct = Math.round(completedMissions / totalMissions * 100);
  const openLevels = new Set([...root.querySelectorAll('details[open]')].map(el => Number(el.dataset.journeyLevel)));
  openLevels.add(currentLevel);
  const levelMarkup = LEARNING_LEVELS.map((level, li) => {
    const chapterRows = CHAPTERS.map((chapter, ci) => {
      if (ci < level.first || ci > level.last) return '';
      const chapterMissions = MISSIONS.filter(m => m.ch === ci);
      const done = chapterMissions.filter(m => S.done.includes(m.id)).length;
      const complete = done === chapterMissions.length;
      const status = complete ? 'complete' : ci === currentChapter ? 'current' : ci === currentChapter + 1 ? 'next' : 'locked';
      const statusText = complete ? 'Complete' : status === 'current' ? 'You are here' : status === 'next' ? 'Up next' : 'Later';
      return '<div class="journey-chapter" data-journey-chapter="' + (ci + 1) + '" data-status="' + status + '">' +
        '<span class="journey-chapter-mark" aria-hidden="true">' + (complete ? '✓' : String(ci + 1).padStart(2, '0')) + '</span>' +
        '<span class="journey-chapter-name"><strong>' + esc(chapter.name) + '</strong><span>' + esc(chapter.topic) + ' · ' + done + '/' + chapterMissions.length + ' missions</span></span>' +
        '<span class="journey-chapter-status">' + statusText + '</span></div>';
    }).join('');
    const levelDone = CHAPTERS.slice(level.first, level.last + 1).filter((_, offset) => {
      const chapterMissions = MISSIONS.filter(m => m.ch === level.first + offset);
      return chapterMissions.length > 0 && chapterMissions.every(m => S.done.includes(m.id));
    }).length;
    return '<details class="journey-level" data-journey-level="' + li + '"' + (openLevels.has(li) ? ' open' : '') + '>' +
      '<summary><span class="journey-level-name">Level ' + (li + 1) + ' · ' + esc(level.title) + '</span><span class="journey-level-count">' + levelDone + '/' + (level.last - level.first + 1) + '</span></summary>' +
      '<div class="journey-chapters"><p class="empty">' + esc(level.description) + '</p>' + chapterRows + '</div></details>';
  }).join('');
  const now = currentMission ? 'Now learning: Chapter ' + (currentChapter + 1) + ' · ' + CHAPTERS[currentChapter].name : 'All chapters complete — excellent work.';
  root.innerHTML = '<div class="journey-summary"><div><strong>Your Linux learning journey</strong><p id="journeyProgress">' + completedMissions + ' of ' + totalMissions + ' missions complete · ' + completedChapters + ' of ' + CHAPTERS.length + ' chapters</p></div><span class="journey-level-count">LEVEL ' + (currentLevel + 1) + ' / ' + LEARNING_LEVELS.length + '</span></div>' +
    '<div class="journey-track" role="progressbar" aria-label="Overall Linux learning progress" aria-valuemin="0" aria-valuemax="' + totalMissions + '" aria-valuenow="' + completedMissions + '"><span style="width:' + pct + '%"></span></div>' +
    '<div class="journey-now">' + esc(now) + '</div>' + levelMarkup;
  root.dataset.initialized = 'true';
}
let fsExplorerPath = '/', fsExplorerSelected = '';
function renderFilesystemExplorer() {
  const root = $('#fsExplorer');
  if (!root) return;
  const pathLabel = $('#fsExplorerPath'), list = $('#fsExplorerList'), preview = $('#fsExplorerPreview'), up = $('#fsExplorerUp');
  const current = lookup(fsExplorerPath);
  if (pathLabel) pathLabel.textContent = fsExplorerPath;
  if (up) up.disabled = fsExplorerPath === '/';
  if (!list || !preview) return;
  if (current.err || !current.node || current.node.type !== 'dir') {
    list.innerHTML = '<p class="empty">' + esc(current.err || 'Not a directory') + '</p>';
    preview.innerHTML = '<p class="fs-explorer-help">This location cannot be opened by the current simulated user.</p>';
    return;
  }
  if (!canRead(current.node) || !canEnter(current.node)) {
    list.innerHTML = '<p class="empty">Permission denied: you cannot list or enter this directory.</p>';
    preview.innerHTML = '<p class="fs-explorer-help">Use terminal commands to investigate permissions, or explore another location.</p>';
    return;
  }
  const entries = Object.entries(current.node.children || {}).sort((a,b) => {
    if (a[1].type !== b[1].type) return a[1].type === 'dir' ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });
  list.innerHTML = entries.map(([name,node]) => {
    const abs = joinAbs(fsExplorerPath,name), dir = node.type === 'dir';
    const label = (dir ? '📁 ' : '📄 ') + name;
    const meta = dir ? 'directory' : human(sizeOf(node));
    return '<button type="button" class="fs-explorer-entry" ' + (dir ? 'data-fs-open="' : 'data-fs-file="') + esc(abs) + '">' +
      '<span class="fs-name">' + esc(label) + '</span><span class="fs-meta">' + meta + '</span></button>';
  }).join('') || '<p class="empty">This directory is empty.</p>';
  const selected = fsExplorerSelected ? lookup(fsExplorerSelected) : null;
  if (!selected || selected.err || !selected.node || selected.node.type !== 'file') {
    preview.innerHTML = '<p class="fs-explorer-help">Select a file to inspect its contents and permissions. Directory changes made in the terminal appear here too.</p>';
    return;
  }
  const n = selected.node;
  const meta = permStr(n) + ' · ' + n.owner + ':' + n.group + ' · ' + human(sizeOf(n));
  if (!canRead(n)) {
    preview.innerHTML = '<strong>' + esc(fsExplorerSelected) + '</strong><p class="fs-explorer-help">' + esc(meta) + ' · Permission denied</p>';
    return;
  }
  const content = String(n.content || '');
  const display = content.startsWith('(binary file:') || content.startsWith('(binary core dump:')
    ? '[Binary file — use file, ls -l, or other inspection commands.]'
    : content.slice(0, 2400) + (content.length > 2400 ? '\n… preview truncated …' : '');
  preview.innerHTML = '<strong>' + esc(fsExplorerSelected) + '</strong><p class="fs-explorer-help">' + esc(meta) + '</p><pre>' + esc(display) + '</pre>';
}
function initFilesystemExplorer() {
  const root = $('#fsExplorer');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = 'true';
  root.addEventListener('click', ev => {
    const nav = ev.target.closest('[data-fs-nav]');
    const open = ev.target.closest('[data-fs-open]');
    const file = ev.target.closest('[data-fs-file]');
    if (nav) { fsExplorerPath = norm(nav.dataset.fsNav, '/'); fsExplorerSelected = ''; renderFilesystemExplorer(); }
    else if (open) { fsExplorerPath = open.dataset.fsOpen; fsExplorerSelected = ''; renderFilesystemExplorer(); }
    else if (file) { fsExplorerSelected = file.dataset.fsFile; renderFilesystemExplorer(); }
  });
  const up = $('#fsExplorerUp');
  if (up) up.addEventListener('click', () => {
    if (fsExplorerPath !== '/') { fsExplorerPath = parentOf(fsExplorerPath); fsExplorerSelected = ''; renderFilesystemExplorer(); }
  });
}
/* ---------- Server health dashboard (derived from the canonical simulator state) ---------- */
function healthMetric(label, value, detail, tone) {
  return '<article class="health-metric '+(tone||'')+'"><span>'+esc(label)+'</span><strong>'+esc(String(value))+'</strong><small>'+esc(detail)+'</small></article>';
}
function renderHealthTroubleshooting(services, stopped, top) {
  const target = (stopped[0] && stopped[0][1] && stopped[0][1].unit) || (services[0] && services[0][1] && services[0][1].unit) || 'nginx';
  const steps = [
    { title: '1 · Observe', why: 'Start with failed units. This gives you evidence before changing anything.', command: 'systemctl --failed' },
    { title: '2 · Inspect', why: 'Check the affected service state, recent logs and its failure reason.', command: 'systemctl status ' + target },
    { title: '3 · Find the cause', why: 'Read recent service logs; look for configuration, permission or dependency errors.', command: 'journalctl -u ' + target + ' --no-pager -n 30' },
    { title: '4 · Verify impact', why: 'Confirm whether the expected service endpoint is listening.', command: 'ss -lntup' }
  ];
  if (S.inodeBad) steps.push({ title: 'Storage check', why: 'Compare inode availability with block capacity before deleting files.', command: 'df -i' });
  if (top && top.cpu > 80) steps.push({ title: 'Performance check', why: 'Inspect the process table to identify CPU-heavy work before terminating anything.', command: 'ps aux --sort=-%cpu | head' });
  return '<section class="health-troubleshoot"><div class="health-troubleshoot-head"><div><h3>Guided troubleshooting</h3><p>Use an evidence-first loop: <b>Observe → Hypothesise → Test → Verify</b>. No command is run for you.</p></div><span class="health-troubleshoot-tag">LEARN BY INVESTIGATING</span></div><div class="health-steps">' +
    steps.map(step => '<article class="health-step"><div><b>' + esc(step.title) + '</b><p>' + esc(step.why) + '</p><code>' + esc(step.command) + '</code></div><button class="btn" type="button" data-health-command="' + esc(step.command) + '">Prepare command</button></article>').join('') +
    '</div><p class="health-troubleshoot-note">After each command, explain what the output proves. Change one thing at a time, then repeat the original check to verify the result.</p></section>';
}
function renderHealthDependencyExplorer(listeners) {
  const established=(S.net&&S.net.estab)||[], cronText=(S.crontabs&&S.crontabs.halcyon)||'', lanes=[];
  const addLane=(title,nodes)=>lanes.push('<section class="health-dependency-lane"><h4>'+esc(title)+'</h4><div class="health-dependency-chain">'+nodes.map((node,index)=>(index?'<span class="health-dependency-arrow" aria-hidden="true">→</span>':'')+'<button type="button" class="health-dependency-node '+(node.warning?'warn':node.ok?'ok':'')+'" data-health-node="'+esc(node.id)+'" data-health-detail="'+esc(node.detail)+'" aria-pressed="false"><b>'+esc(node.title)+'</b><small>'+esc(node.subtitle)+'</small></button>').join('')+'</div></section>');
  const service=(key,title,detail)=>{const s=(S.services||{})[key]||{};return{id:'service-'+key,title,subtitle:(s.active?'active':'inactive')+' · '+(s.unit||key),detail,ok:!!s.active,warning:!s.active};};
  const app=(S.services||{}).halcyon||{}, proc=(S.procs||[]).find(p=>p.pid===app.mainpid), listener=listeners.find(x=>x.pid===app.mainpid), db=established.find(x=>x.pid===app.mainpid);
  addLane('Application request path · observed host evidence',[
    {id:'host',title:'halcyon-web01',subtitle:'simulated host',detail:'This is the training simulator host. It does not inspect the learner’s computer.'},
    service('halcyon','Halcyon web service','Inspect with systemctl status halcyon.service.'),
    {id:'app-process',title:'Application process',subtitle:proc?'PID '+proc.pid:'No matching process',detail:proc?'Process evidence: PID '+proc.pid+', command '+proc.cmd+'. Verify with ps and systemctl status.':'No process matching the service main PID was found.',warning:!proc},
    {id:'app-listener',title:'HTTP listener',subtitle:listener?listener.laddr+':'+listener.lport:'No matching listener',detail:listener?'The service PID owns listener '+listener.laddr+':'+listener.lport+'. Confirm with ss -lntp.':'No listener matched the application service PID.',warning:!listener},
    {id:'db-connection',title:'Database connection',subtitle:db?db.raddr+':'+db.rport:'No matching connection',detail:db?'The simulator records an established connection from the application process to '+db.raddr+':'+db.rport+'. This is connection evidence, not proof of database health.':'No established connection matched the application process.',warning:!db}
  ]);
  const ssh=(S.services||{}).ssh||{},sshProc=(S.procs||[]).find(p=>p.pid===ssh.mainpid),sshListener=listeners.find(x=>x.pid===ssh.mainpid);
  addLane('Remote administration path',[service('ssh','SSH service','Inspect with systemctl status ssh.service.'),{id:'ssh-process',title:'sshd process',subtitle:sshProc?'PID '+sshProc.pid:'No matching process',detail:sshProc?'SSH main PID matches process '+sshProc.pid+'. Verify with ps.':'No process matched the SSH service main PID.',warning:!sshProc},{id:'ssh-listener',title:'SSH listener',subtitle:sshListener?sshListener.laddr+':'+sshListener.lport:'No matching listener',detail:sshListener?'The SSH service PID owns listener '+sshListener.laddr+':'+sshListener.lport+'. Confirm with ss -lntp.':'No listener matched the SSH service PID.',warning:!sshListener}]);
  addLane('Scheduled maintenance path',[service('cron','Cron service','Inspect with systemctl status cron.service.'),{id:'cron-job',title:'Scheduled export job',subtitle:cronText.trim()?'Halcyon crontab entry present':'No Halcyon crontab entry',detail:cronText.trim()?'The simulated Halcyon crontab contains: '+cronText.trim()+'. Inspect with crontab -l -u halcyon.':'No Halcyon crontab entry is present.'}]);
  return '<div class="health-dependency-map"><div class="health-dependency-lanes">'+lanes.join('')+'</div><div class="health-dependency-detail" id="healthDependencyDetail" aria-live="polite"><h4>Halcyon web service</h4><p>Inspect with systemctl status halcyon.service.</p></div><p class="health-dependency-legend">Select a node to inspect its evidence. Arrows show observed relationships in this scenario; a missing observation is not proof that a dependency is broken.</p></div>';
}

function healthResourceSnapshot() {
  const procs = Array.isArray(S.procs) ? S.procs : [];
  const top = procs.slice().sort((a,b)=>(b.cpu||0)-(a.cpu||0))[0] || null;
  // ps/top process percentages are per-core. Normalize their combined demand
  // against the simulator's four vCPUs; retain top-process pressure separately.
  const cpuCores = 4;
  const processCpu = procs.reduce((sum,p)=>sum+Math.max(0,Number(p.cpu)||0),0);
  const cpu = Math.min(100, processCpu / cpuCores);
  // Keep the dashboard aligned with the simulator's free(1) model.
  const memoryTotal = 3936;
  const memoryUsed = procs.some(p=>(Number(p.cpu)||0)>100) ? 2680 : 1402;
  const memoryAvailable = memoryTotal - memoryUsed;
  // Use the exact capacity calculation used by df(1), including deleted-but-open files.
  const diskTotal = DISK_TOTAL;
  const diskUsed = Math.min(diskTotal, DISK_BASE + treeSize(S.fs) + (S.held || 0));
  const diskPercent = diskTotal ? Math.min(100, diskUsed / diskTotal * 100) : 0;
  const cpuWarn = !!(S.iowait || (top && top.cpu > 80) || cpu >= 85);
  // Warn before headroom becomes critical; the busy simulator fixture leaves ~32% available.
  const memoryWarn = memoryAvailable / memoryTotal < 0.35;
  const diskWarn = diskPercent >= 85 || !!S.inodeBad;
  // Operational indicators are derived from the same canonical objects used by
  // systemctl, ps and ss. No parallel telemetry state is maintained.
  const services = Object.values(S.services || {});
  const servicePercent = services.length ? services.filter(service => service.active).length / services.length * 100 : 0;
  const serviceWarn = services.some(service => !service.active);
  const interfaces = (S.net && S.net.ifaces || []).filter(iface => iface.name !== 'lo');
  const networkPercent = interfaces.length ? interfaces.filter(iface => iface.state === 'UP' || (iface.flags || '').split(',').includes('UP')).length / interfaces.length * 100 : 0;
  const networkWarn = !interfaces.length || networkPercent < 100;
  const processPercent = Math.min(100, Math.max(0, top ? Number(top.cpu) || 0 : 0));
  const processWarn = !!(top && top.cpu > 80);
  return {
    top, cpu, cpuCores, cpuWarn,
    memoryTotal, memoryUsed, memoryAvailable,
    memoryPercent: memoryUsed / memoryTotal * 100, memoryWarn,
    diskTotal, diskUsed, diskPercent, diskWarn,
    processPercent, processWarn, processCount: procs.length,
    servicePercent, serviceWarn, serviceCount: services.length,
    networkPercent, networkWarn, interfaceCount: interfaces.length
  };
}
function healthResourceMetric(label, percent, detail, tone, valueText) {
  const value = Math.max(0,Math.min(100,Number(percent)||0));
  return '<article class="health-resource '+(tone||'')+'"><div class="health-resource-head"><b>'+esc(label)+'</b><strong>'+esc(valueText)+'</strong></div><div class="health-meter" role="meter" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+value.toFixed(1)+'" aria-valuetext="'+esc(valueText)+'"><span style="width:'+value.toFixed(1)+'%"></span></div><small>'+esc(detail)+'</small></article>';
}
function renderServerHealth() {
  const root=document.getElementById('serverHealthDialog'); if(!root)return;
  const services=Object.entries(S.services||{});
  const running=services.filter(([,s])=>s.active);
  const stopped=services.filter(([,s])=>!s.active);
  const procs=(S.procs||[]).slice().sort((a,b)=>(b.cpu||0)-(a.cpu||0));
  const mounts=S.mounts||[];
  const listeners=(S.net&&S.net.listen)||[];
  const top=procs[0];
  const resources=healthResourceSnapshot();
  const firewall=S.firewall&&S.firewall.active?'Active':'Inactive';
  const status=stopped.length||S.inodeBad||resources.cpuWarn||resources.memoryWarn||resources.diskWarn||resources.networkWarn?'Needs attention':'Operational';
  const healthClass=status==='Operational'?'ok':'warn';
  const resourceCards =
    healthResourceMetric('CPU demand',resources.cpu,'Combined process demand across '+resources.cpuCores+' simulated vCPUs'+(top?' · busiest PID '+top.pid+' at '+top.cpu+'%':'') ,resources.cpuWarn?'warn':'',resources.cpu.toFixed(1)+'%')+
    healthResourceMetric('Memory in use',resources.memoryPercent,'Available '+human(resources.memoryAvailable*1024*1024)+' of '+human(resources.memoryTotal*1024*1024),resources.memoryWarn?'warn':'',(resources.memoryPercent).toFixed(1)+'%')+
    healthResourceMetric('Root filesystem',resources.diskPercent,'Used '+human(resources.diskUsed)+' of '+human(resources.diskTotal)+(S.held?' · includes deleted-open files':''),resources.diskWarn?'warn':'',resources.diskPercent.toFixed(1)+'%')+
    healthResourceMetric('Process pressure',resources.processPercent,(top?'Busiest PID '+top.pid+' · ':'')+resources.processCount+' simulated processes',resources.processWarn?'warn':'',resources.processPercent.toFixed(1)+'%')+
    healthResourceMetric('Service availability',resources.servicePercent,Object.values(S.services||{}).filter(service=>service.active).length+' of '+resources.serviceCount+' services active',resources.serviceWarn?'warn':'',Math.round(resources.servicePercent)+'%')+
    healthResourceMetric('Network interface',resources.networkPercent,(S.net&&S.net.ifaces||[]).filter(iface=>iface.name!=='lo').map(iface=>iface.name+' '+iface.state+' · '+iface.ipv4).join(' · ')||'No non-loopback interface configured',resources.networkWarn?'warn':'',resources.networkWarn?'DEGRADED':'UP');
  root.innerHTML='<div class="health-backdrop" data-health-close></div><section class="health-dialog" role="dialog" aria-modal="true" aria-labelledby="healthTitle"><header><div><div class="eyebrow">SIMULATED HOST · HALCYON-WEB01</div><h2 id="healthTitle">Server health</h2><p>Live view of the current training scenario. Values are derived from the simulator state, not your computer.</p></div><button class="btn" type="button" data-health-close aria-label="Close server health">Close</button></header><div class="health-overview"><span class="health-state '+healthClass+'">'+status+'</span><span>Mission '+(S.mission+1)+' · '+(S.done||[]).length+' tickets resolved</span></div><section class="health-resource-section" aria-label="Resource utilisation"><h3>Resource utilisation</h3><div class="health-resource-grid">'+resourceCards+'</div><p class="health-resource-note">CPU is normalized from simulated per-process demand across four vCPUs. Memory follows the simulator’s <code>free -h</code> model; filesystem usage follows <code>df -h</code>. These are teaching estimates, not measurements of your device.</p></section><div class="health-metrics">'+healthMetric('Services running',running.length+'/'+services.length,'system service state',stopped.length?'warn':'')+healthMetric('Processes',procs.length,'simulated process table','')+healthMetric('Listening sockets',listeners.length,'configured local listeners','')+healthMetric('Mounted filesystems',mounts.length,'active mount records','')+healthMetric('Firewall',firewall,'host firewall state',S.firewall&&S.firewall.active?'':'warn')+healthMetric('Highest CPU process',top?top.cpu+'%':'—',top?top.cmd:'no process data',top&&top.cpu>80?'warn':'')+'</div><div class="health-columns"><section><h3>Service dependency view</h3>'+renderHealthDependencyExplorer(listeners)+'</section><section><h3>Attention points</h3>'+(stopped.length?'<ul>'+stopped.map(([k,s])=>'<li><b>'+esc(s.unit)+'</b> is inactive. Check <code>systemctl status '+esc(s.unit)+'</code> and the journal.</li>').join('')+'</ul>':'<p class="health-good">All currently modelled services are active.</p>')+(resources.cpuWarn?'<p class="health-warning">CPU pressure needs investigation. The busiest process is '+(top?'PID '+top.pid+' at '+top.cpu+'%':'not available')+'. Check <code>top</code>, <code>ps aux</code> and <code>iostat</code>; high process demand and I/O wait are different conditions.</p>':'<p>Process CPU demand and I/O wait are within the teaching thresholds.</p>')+(resources.memoryWarn?'<p class="health-warning">Memory headroom is low: '+human(resources.memoryAvailable*1024*1024)+' available. Inspect <code>free -h</code> and <code>ps aux</code> before terminating processes.</p>':'<p>Memory availability is above the low-headroom threshold.</p>')+(resources.diskWarn?'<p class="health-warning">Storage needs attention. Check <code>df -h</code> for block capacity and <code>df -i</code> for inode exhaustion.</p>':'<p>Root filesystem capacity is below the warning threshold.</p>')+(resources.networkWarn?'<p class="health-warning">One or more non-loopback network interfaces are not operational. Inspect <code>ip addr</code> and <code>ip route</code> before testing remote services.</p>':'<p>All configured non-loopback network interfaces are operational.</p>')+'<p>Firewall: '+firewall+'. Verify intended policy before changing rules.</p></section></div>'+renderHealthTroubleshooting(services,stopped,top)+'<footer><span>Read-only overview · use the terminal to investigate and remediate</span><button class="btn primary" type="button" id="healthRefresh">Refresh view</button></footer></section>';
  root.querySelectorAll('[data-health-close]').forEach(el=>el.addEventListener('click',closeServerHealth));
  root.querySelector('#healthRefresh').addEventListener('click',renderServerHealth);
  root.querySelectorAll('[data-health-node]').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('[data-health-node]').forEach(node=>node.setAttribute('aria-pressed',node===button?'true':'false'));
    const detail=root.querySelector('#healthDependencyDetail');
    if(detail){detail.querySelector('h4').textContent=button.querySelector('b').textContent;detail.querySelector('p').textContent=button.dataset.healthDetail||'';}
  }));
  const initialNode=root.querySelector('[data-health-node]');
  if(initialNode)initialNode.setAttribute('aria-pressed','true');
  root.querySelectorAll('[data-health-command]').forEach(button=>button.addEventListener('click',()=>{
    const input=document.getElementById('tin');
    if(input){input.value=button.dataset.healthCommand||'';closeServerHealth();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}
  }));
}
function openServerHealth(){let root=document.getElementById('serverHealthDialog');if(!root){root=document.createElement('div');root.id='serverHealthDialog';document.body.appendChild(root);}renderServerHealth();root.querySelector('.health-dialog button')?.focus();}
function closeServerHealth(){const root=document.getElementById('serverHealthDialog');if(root)root.innerHTML='';}


/* Bash scripting workshop — guided practice on the simulated shell */
const BASH_WORKSHOP = [
  {id:'variables',title:'1 · Variables and quoting',level:'Foundation',concept:'Store a value once, then reuse it. Double quotes allow variable expansion; single quotes keep text literal.',command:'NAME="Ada Lovelace" && echo "Hello, $NAME"',objective:'Set NAME and print a greeting that includes its value.'},
  {id:'conditions',title:'2 · Make a decision',level:'Branching',concept:'An if statement runs one branch when a test succeeds and another when it fails. The test command returns an exit status.',command:'bash -c \'if test -f /etc/hostname; then echo "Hostname file found"; else echo "Hostname file missing"; fi\'',objective:'Test whether the simulated hostname file exists.'},
  {id:'loops',title:'3 · Repeat with a loop',level:'Iteration',concept:'A for loop assigns each item to a variable and runs the body once per item.',command:'bash -c \'for service in ssh cron nginx; do echo "Reviewing $service"; done\'',objective:'Print one review line for each service name.'},
  {id:'script',title:'4 · Build and run a script',level:'Mini project',concept:'Create a script file, add a shebang and commands, make it executable, then run it by path. This combines loops and file permissions.',command:'mkdir -p ~/scripts && printf \'%s\\n\' \'#!/bin/bash\' \'for service in ssh cron nginx; do\' \'  echo "Reviewing $service"\' \'done\' > ~/scripts/service-check.sh && chmod +x ~/scripts/service-check.sh && ~/scripts/service-check.sh',objective:'Create an executable script and run it from the simulated filesystem.'}
];
function bashWorkshopIsComplete(id) {
  const history=S.history||[];
  if(id==='variables') return !!(S.vars&&S.vars.NAME==='Ada Lovelace'&&history.some(x=>x.indexOf('NAME="Ada Lovelace"')>=0));
  if(id==='conditions') return history.some(x=>x.indexOf("bash -c 'if test -f /etc/hostname")===0);
  if(id==='loops') return history.some(x=>x.indexOf("bash -c 'for service in ssh cron nginx")===0);
  if(id==='script') { const found=lookup('~/scripts/service-check.sh'); return !!(found&&!found.err&&found.node&&found.node.type==='file'&&(found.node.mode&0o111)&&S.lastScriptRun===found.abs); }
  return false;
}
function closeBashWorkshop(){const root=document.getElementById('bashWorkshopDialog');if(root)root.remove();}
function openBashWorkshop(){
  closeBashWorkshop();
  const root=document.createElement('div');root.id='bashWorkshopDialog';root.className='bash-workshop-backdrop';
  root.innerHTML='<section class="bash-workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="bashWorkshopTitle">'
  +'<div class="bash-workshop-head"><div><div class="eyebrow">Linux Sysadmin · Practical lab</div><h2 id="bashWorkshopTitle">Bash scripting workshop</h2></div><button class="btn" type="button" data-bash-close aria-label="Close Bash workshop">Close</button></div>'
  +'<p class="bash-workshop-intro">Learn by running Bash-style commands in this platform’s simulated Linux environment. Work through each exercise in order, or revisit any topic. Nothing runs on your computer or a real server.</p>'
  +'<div class="bash-workshop-grid">'+BASH_WORKSHOP.map(function(item){const done=bashWorkshopIsComplete(item.id);return '<article class="bash-workshop-card'+(done?' complete':'')+'"><div class="bash-status">'+(done?'✓ Completed':item.level)+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.concept)+'</p><div class="label">Practice objective</div><p>'+esc(item.objective)+'</p><pre><code>'+esc(item.command)+'</code></pre><div class="bash-workshop-actions"><button class="btn primary" type="button" data-bash-load="'+esc(item.command)+'">Load into terminal</button></div></article>';}).join('')+'</div>'
  +'<p class="bash-workshop-note">Loading a command only places it in the terminal input. Read it, edit it if you like, and press Enter to run it. Reopen this workshop to see your progress.</p></section>';
  root.addEventListener('click',function(event){if(event.target===root||event.target.closest('[data-bash-close]')){closeBashWorkshop();return;}const load=event.target.closest('[data-bash-load]');if(load){const input=document.getElementById('tin');if(input){input.value=load.getAttribute('data-bash-load')||'';closeBashWorkshop();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}}});
  root.addEventListener('keydown',function(event){if(event.key==='Escape')closeBashWorkshop();});
  document.body.appendChild(root);const close=root.querySelector('[data-bash-close]');if(close)close.focus();
}


/* Linux security operations and storage recovery — isolated, evidence-led practice. */
const OPS_RECOVERY_MISSIONS = [
  {id:'ops-revoke-contractor',title:'1 · Revoke unauthorised privileged access',story:'The access review found that a former contractor still belongs to the sudo group. Preserve the account and its evidence, but remove the unnecessary privilege.',objective:'Review the group and authentication evidence, then remove jmorrow from sudo. Do not delete the account or its home directory.',hints:['Compare the sudo group in /etc/group with the accepted SSH and sudo events in /var/log/auth.log.','Use sudo gpasswd -d USER GROUP to remove supplementary group membership.'],check_type:'group_not_member',check_arg1:'sudo',check_arg2:'jmorrow'},
  {id:'ops-protect-customer-export',title:'2 · Restrict exposed customer data',story:'A customer export was written to a public-facing directory. Reduce its permissions to owner-only while retaining the file for investigation.',objective:'Set /srv/halcyon/export/customers.csv to mode 0600 and verify the resulting permissions.',hints:['Use ls -l to inspect the current mode before changing it.','Use sudo chmod 600 /srv/halcyon/export/customers.csv, then verify with stat or ls -l.'],check_type:'file_mode',check_arg1:'/srv/halcyon/export/customers.csv',check_arg2:'600'},
  {id:'ops-disable-export-hook',title:'3 · Disable suspicious persistence safely',story:'An unauthorised export hook is present in the application directory. Keep it as evidence, but prevent it from being executed by the scheduled job.',objective:'Remove execute permission from /srv/halcyon/export/sync_out.sh without deleting or editing the evidence.',hints:['Inspect its owner, timestamp and mode with stat or ls -l.','Use sudo chmod 640 /srv/halcyon/export/sync_out.sh. The file should remain readable but not executable.'],check_type:'file_mode',check_arg1:'/srv/halcyon/export/sync_out.sh',check_arg2:'640'},
  {id:'ops-mount-backup-volume',title:'4 · Provision the backup volume',story:'A spare ext4 volume is available at /dev/vdb1. Prepare a dedicated mount point and mount the volume without touching the root filesystem.',objective:'Create /mnt/backups and mount /dev/vdb1 there. Verify the device-to-mount-point relationship.',hints:['Check lsblk and findmnt before making changes.','Use sudo mkdir -p /mnt/backups followed by sudo mount /dev/vdb1 /mnt/backups.'],check_type:'mount_state',check_arg1:'/mnt/backups',check_arg2:'/dev/vdb1'},
  {id:'ops-persist-backup-mount',title:'5 · Make the mount persistent',story:'The backup volume is mounted for this session, but it would not survive a reboot. Add a safe fstab entry and validate it.',objective:'Add /dev/vdb1 /mnt/backups ext4 defaults,nofail 0 2 to /etc/fstab, then inspect the entry.',hints:['Back up /etc/fstab before editing it.','Append the six-field entry with sudo tee -a /etc/fstab; use findmnt --verify if supported by the simulated tools.'],check_type:'file_matches',check_arg1:'/etc/fstab',check_arg2:'/dev/vdb1\\s+/mnt/backups\\s+ext4\\s+defaults,nofail\\s+0\\s+2'},
  {id:'ops-backup-and-restore',title:'6 · Prove the backup can restore',story:'A backup is only useful if it can be read back. Create a compressed archive of /etc on the mounted backup volume, then restore it to a separate test directory.',objective:'Create /mnt/backups/etc-backup.tar.gz from /etc and extract it under /mnt/restore. Verify /mnt/restore/etc/hostname exists.',hints:['Create the archive with tar -czf /mnt/backups/etc-backup.tar.gz /etc; absolute source paths are stored relative to the archive root.','Create /mnt/restore, then extract with tar -xzf ARCHIVE -C /mnt/restore.'],check_type:'file_exists',check_arg1:'/mnt/restore/etc/hostname'}
];
function opsRecoveryCompleted(){try{const ids=JSON.parse(localStorage.getItem('lsa-ops-recovery-complete')||'[]');return Array.isArray(ids)?ids:[];}catch(e){return [];}}
function closeOpsRecoveryLab(){const root=document.getElementById('opsRecoveryDialog');if(root)root.remove();}
function openOpsRecoveryLab(){
  closeOpsRecoveryLab();
  const completed=opsRecoveryCompleted();
  const root=document.createElement('div');root.id='opsRecoveryDialog';root.className='bash-workshop-backdrop';
  root.innerHTML='<section class="bash-workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="opsRecoveryTitle">'
  +'<div class="bash-workshop-head"><div><div class="eyebrow">Linux Sysadmin · Isolated practical lab</div><h2 id="opsRecoveryTitle">Security operations &amp; storage recovery</h2></div><button class="btn" type="button" data-ops-close aria-label="Close security and recovery lab">Close</button></div>'
  +'<p class="ops-lab-summary">Work through a realistic handover: investigate suspicious access, contain exposed data without destroying evidence, prepare persistent backup storage, and prove that a restore works. Each run uses a fresh simulated server; your campaign files and progress remain untouched.</p>'
  +'<div class="bash-workshop-grid">'+OPS_RECOVERY_MISSIONS.map(function(item){const done=completed.includes(item.id);return '<article class="ops-lab-card'+(done?' complete':'')+'"><div class="ops-lab-status">'+(done?'✓ Demonstrated':'Practice objective')+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.story)+'</p><p><strong>'+esc(item.objective)+'</strong></p></article>';}).join('')+'</div>'
  +'<div class="ops-lab-actions"><button class="btn primary" type="button" data-ops-start>Start isolated lab</button><button class="btn" type="button" data-ops-reset>Reset demonstrated progress</button></div>'
  +'<p class="ops-lab-safety">Simulation only — commands run in the browser-based Linux sandbox, never on your computer or a real server. Preserve evidence and verify each change before moving on.</p></section>';
  root.addEventListener('click',function(event){
    if(event.target===root||event.target.closest('[data-ops-close]')){closeOpsRecoveryLab();return;}
    if(event.target.closest('[data-ops-reset]')){try{localStorage.removeItem('lsa-ops-recovery-complete');}catch(e){}closeOpsRecoveryLab();openOpsRecoveryLab();return;}
    if(event.target.closest('[data-ops-start]')){closeOpsRecoveryLab();playAuthored(OPS_RECOVERY_MISSIONS,'Linux Security & Recovery Lab');}
  });
  root.addEventListener('keydown',function(event){if(event.key==='Escape')closeOpsRecoveryLab();});
  document.body.appendChild(root);const close=root.querySelector('[data-ops-close]');if(close)close.focus();
}


 


/* Virtual IT company: persistent service requests linked to canonical cross-track simulator outcomes. */
const COMPANY_DESK_KEY='lsa-virtual-company-desk-v1';
const COMPANY_REQUESTS=[
 {id:'SR-2401',title:'Halcyon portal unavailable',department:'Sales & Customer Experience',priority:'P1',impact:'Company-wide customer portal',summary:'Customers cannot reach the public portal. The application service is stopped and client name resolution is stale.',linux:'linux',network:'network',linuxLabel:'Restore the Halcyon web service',networkLabel:'Repair client DNS and verify delivery',linuxMission:'web',networkQuery:'web-availability'},
 {id:'SR-2402',title:'Operations team locked out of jump host',department:'IT Operations',priority:'P2',impact:'Systems administration team',summary:'The jump host responds to network checks, but SSH administration is unavailable. Restore the host service and repair the management access policy.',linux:'remoteLinux',network:'remoteNetwork',linuxLabel:'Restore SSH on jump01',networkLabel:'Repair the management ACL',linuxMission:'remote',networkQuery:'remote-admin'},
 {id:'SR-2403',title:'SSH protection is no longer active',department:'Security Operations',priority:'P1',impact:'Administrative access exposed to repeated attempts',summary:'Host-level brute-force protection is stopped and the network policy needs to be restricted to the operations subnet.',linux:'hardeningLinux',network:'hardeningNetwork',linuxLabel:'Restore Fail2Ban protection',networkLabel:'Limit SSH to the operations subnet',linuxMission:'hardening',networkQuery:'ssh-hardening'},
 {id:'SR-2404',title:'Former contractor access requires containment',department:'Identity & Security',priority:'P1',impact:'Privileged access and remote administration',summary:'Correlated evidence identifies a former contractor account with unnecessary sudo rights and a suspicious SSH source. Remove privilege and contain the source while preserving legitimate access.',linux:'contractorLinux',network:'contractorNetwork',linuxLabel:'Revoke contractor sudo privileges',networkLabel:'Contain the suspicious SSH source',linuxMission:'contractor',networkQuery:'contractor-containment'}
];
function companyDeskRead(){try{const v=JSON.parse(localStorage.getItem(COMPANY_DESK_KEY)||'{}');return v&&typeof v==='object'?v:{requests:{}};}catch(e){return {requests:{}};}}
function companyDeskWrite(data){try{localStorage.setItem(COMPANY_DESK_KEY,JSON.stringify(data));}catch(e){}}
function companyRequestState(request,progress,desk){
 const saved=desk.requests&&desk.requests[request.id]||{},linux=!!progress[request.linux],network=!!progress[request.network],notes=Array.isArray(saved.notes)?saved.notes:[];
 const ready=linux&&network,status=ready?(notes.length?'resolved':'ready'):(saved.claimedAt||saved.startedAt||notes.length||linux||network?'investigating':'new');
 return {...saved,notes,linux,network,ready,status};
}
function companyDeskSnapshot(){
 const progress=crossTrackRead(),desk=companyDeskRead();let priorClosed=true;
 return COMPANY_REQUESTS.map(request=>{
  const state=companyRequestState(request,progress,desk),locked=!priorClosed;
  const item={...request,...state,locked};
  if(state.status!=='resolved')priorClosed=false;
  return item;
 });
}
function companyDeskSaveRequest(id,mutate){
 const data=companyDeskRead();data.requests=data.requests&&typeof data.requests==='object'?data.requests:{};
 const old=data.requests[id]&&typeof data.requests[id]==='object'?data.requests[id]:{};
 data.requests[id]={...old,...mutate(old),updatedAt:new Date().toISOString()};data.updatedAt=new Date().toISOString();companyDeskWrite(data);
}
function closeCompanyDesk(){const root=document.getElementById('companyDeskDialog');if(root)root.remove();}
function openCompanyDesk(){
 closeCompanyDesk();const root=document.createElement('div');root.id='companyDeskDialog';root.className='bash-workshop-backdrop';
 const render=()=>{
  const current=companyDeskSnapshot(),resolved=current.filter(x=>x.status==='resolved').length,active=current.filter(x=>x.status==='investigating'||x.status==='ready').length;
  const cards=current.map(item=>{
   const notes=item.notes.slice(0,4).map(note=>'<div class="company-request-note"><b>'+esc(new Date(note.at).toLocaleString())+'</b> · '+esc(note.text)+'</div>').join('');
   const statusLabel=item.locked?'Locked · close prior request':item.status==='ready'?'Ready for closure':item.status==='resolved'?'Resolved':item.status==='investigating'?'In progress':'New';
   return '<article class="company-request" data-company-request="'+esc(item.id)+'" data-locked="'+item.locked+'"><div class="company-request-head"><h3>'+esc(item.title)+'</h3><span class="tk-pri tk-'+item.priority.toLowerCase()+'">'+esc(item.priority)+'</span><span class="company-request-status" data-status="'+item.status+'">'+statusLabel+'</span></div>'
    +'<div class="company-request-meta"><span>'+esc(item.id)+'</span><span>'+esc(item.department)+'</span><span>Impact: '+esc(item.impact)+'</span></div><p>'+esc(item.summary)+'</p>'
    +'<div class="company-request-progress"><div class="company-request-step" data-done="'+item.linux+'"><b>'+(item.linux?'✓':'○')+' Linux Sysadmin</b>'+esc(item.linuxLabel)+'</div><div class="company-request-step" data-done="'+item.network+'"><b>'+(item.network?'✓':'○')+' Network Sysadmin</b>'+esc(item.networkLabel)+'</div></div>'
    +'<div class="company-request-actions">'+(item.locked?'':(item.status==='new'?'<button class="btn sm primary" data-company-claim="'+item.id+'">Accept request</button>':''))
    +(item.locked?'':'<button class="btn sm" data-company-linux="'+item.id+'">Open Linux task</button><button class="btn sm" data-company-network="'+item.id+'">Open network task</button>')
    +'</div>'+(item.locked?'':('<div class="company-request-notes"><label for="companyNote-'+item.id+'">Investigation / handover note (required before closure)</label><textarea id="companyNote-'+item.id+'" maxlength="400" placeholder="Record the observed evidence, action taken and verification…"></textarea><div class="company-request-actions"><button class="btn sm" data-company-note="'+item.id+'">Save note</button></div>'+notes+'</div>'))
    +'</article>';
  }).join('');
  root.innerHTML='<section class="bash-workshop-dialog company-desk-dialog" role="dialog" aria-modal="true" aria-labelledby="companyDeskTitle"><div class="bash-workshop-head"><div><div class="eyebrow">Halcyon Digital · simulated IT operations</div><h2 id="companyDeskTitle">Company service desk</h2></div><button class="btn" type="button" data-company-close>Close</button></div>'
   +'<p class="company-desk-intro">Work the company queue from customer impact through investigation, cross-team remediation and documented closure. Requests persist in this browser profile and unlock in sequence as earlier work is completed.</p>'
   +'<div class="company-desk-summary"><div class="company-desk-metric"><strong>'+resolved+'</strong><span>Requests resolved</span></div><div class="company-desk-metric"><strong>'+active+'</strong><span>In progress / ready</span></div><div class="company-desk-metric"><strong>'+current.length+'</strong><span>Total company requests</span></div></div>'
   +cards
   +'<p class="company-desk-foot">Resolution requires both simulator objectives and at least one saved investigation / handover note. Completion is read from the existing Linux and Network learning records; the desk does not create a second simulation engine or alter campaign progress. All systems, departments and requests are fictional and browser-simulated.</p></section>';
 };
 render();
 root.addEventListener('click',event=>{
  if(event.target===root||event.target.closest('[data-company-close]')){closeCompanyDesk();return;}
  const claim=event.target.closest('[data-company-claim]');
  if(claim){companyDeskSaveRequest(claim.dataset.companyClaim,old=>({claimedAt:old.claimedAt||new Date().toISOString()}));render();return;}
  const note=event.target.closest('[data-company-note]');
  if(note){const id=note.dataset.companyNote,field=root.querySelector('#companyNote-'+id),value=field&&field.value.trim();if(!value){if(field){field.focus();field.setCustomValidity('Add a short evidence or handover note before saving.');field.reportValidity();}return;}if(field)field.setCustomValidity('');companyDeskSaveRequest(id,old=>({notes:[...(Array.isArray(old.notes)?old.notes:[]),{at:new Date().toISOString(),text:value.slice(0,400)}].slice(-20)}));render();return;}
  const linux=event.target.closest('[data-company-linux]');
  if(linux){const item=COMPANY_REQUESTS.find(x=>x.id===linux.dataset.companyLinux);if(!item)return;companyDeskSaveRequest(item.id,old=>({startedAt:old.startedAt||new Date().toISOString()}));closeCompanyDesk();const mission={web:CROSS_TRACK_LINUX_MISSION,remote:CROSS_TRACK_REMOTE_LINUX_MISSION,hardening:CROSS_TRACK_HARDENING_LINUX_MISSION,contractor:CROSS_TRACK_CONTAINMENT_LINUX_MISSION}[item.linuxMission];playAuthored(mission,'Halcyon Digital · '+item.id);return;}
  const network=event.target.closest('[data-company-network]');
  if(network){const item=COMPANY_REQUESTS.find(x=>x.id===network.dataset.companyNetwork);if(!item)return;companyDeskSaveRequest(item.id,old=>({startedAt:old.startedAt||new Date().toISOString()}));window.location.href='network-trainer/index.html?crossTrack='+encodeURIComponent(item.networkQuery);}
 });
 root.addEventListener('keydown',event=>{if(event.key==='Escape')closeCompanyDesk();});
 document.body.appendChild(root);const close=root.querySelector('[data-company-close]');if(close)close.focus();
}

/* Evidence-based portfolio: read-only aggregation of locally saved simulation outcomes. */
function portfolioReadStored(key){
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(e){return {};}
}
function portfolioSnapshot(){
  const linux=portfolioReadStored(KEY),network=portfolioReadStored('nettrainer');
  const completedLinux=(Array.isArray(linux.done)?linux.done:[]).map(id=>{
    const m=MISSIONS.find(item=>item.id===id);if(!m)return null;
    const timing=(Array.isArray(linux.times)?linux.times:[]).filter(t=>t.id===id).slice(-1)[0];
    return{id:m.id,title:m.title,chapter:CHAPTERS[m.ch]&&CHAPTERS[m.ch].name||'Linux',skillArea:CHAPTERS[m.ch]&&CHAPTERS[m.ch].topic||'Linux administration',evidence:'Completed simulated mission',durationMs:timing&&Number.isFinite(Number(timing.ms))?Number(timing.ms):null,hints:timing&&Number.isFinite(Number(timing.hints))?Number(timing.hints):null};
  }).filter(Boolean);
  const networkDone=network.done&&typeof network.done==='object'?Object.keys(network.done).filter(id=>network.done[id]):[];
  const networkEvidence=networkDone.map(id=>({id,title:id.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),skillArea:'Network operations',evidence:'Completed simulated network mission'}));
  const commandSkills=Array.isArray(linux.commandSkills)?linux.commandSkills.filter(x=>typeof x==='string'&&x.length<100):[];
  return{schemaVersion:1,generatedAt:new Date().toISOString(),evidenceBasis:'Local completion records from educational simulations; not a certification or proof of work on production systems.',summary:{linuxMissions:completedLinux.length,networkMissions:networkEvidence.length,commandDrills:commandSkills.length,networkJournalEntries:Array.isArray(network.journal)?network.journal.length:0},tracks:{linux:{missions:completedLinux,commandDrills:commandSkills},network:{missions:networkEvidence,journalEntryCount:Array.isArray(network.journal)?network.journal.length:0,configurationChanges:Array.isArray(network.changes)?network.changes.length:0,configurationArchives:Array.isArray(network.configArchives)?network.configArchives.length:0}}};
}
function closeSkillPortfolio(){const root=document.getElementById('portfolioDialog');if(root)root.remove();}
function openSkillPortfolio(){
  closeSkillPortfolio();const data=portfolioSnapshot(),root=document.createElement('div');root.id='portfolioDialog';root.className='bash-workshop-backdrop';
  const li=data.tracks.linux.missions.map(item=>'<li><strong>'+esc(item.title)+'</strong> <span class="portfolio-muted">· '+esc(item.skillArea)+'</span>'+(item.durationMs!=null?' <span class="portfolio-muted">· '+esc(fmtDur(item.durationMs))+'</span>':'')+'</li>').join('');
  const ni=data.tracks.network.missions.map(item=>'<li><strong>'+esc(item.title)+'</strong> <span class="portfolio-muted">· '+esc(item.skillArea)+'</span></li>').join('');
  const drills=data.tracks.linux.commandDrills.map(name=>'<li>'+esc(name)+'</li>').join('');
  root.innerHTML='<section class="bash-workshop-dialog portfolio-dialog" role="dialog" aria-modal="true" aria-labelledby="portfolioTitle"><div class="bash-workshop-head"><div><div class="eyebrow">Career evidence · Local learning record</div><h2 id="portfolioTitle">Professional skill portfolio</h2></div><button class="btn" type="button" data-portfolio-close>Close</button></div>'
    +'<p class="portfolio-intro">A transparent record of completed practice in both learning tracks. Counts come from saved simulation outcomes; they are not certifications, production experience or externally verified credentials.</p>'
    +'<div class="portfolio-stats"><div class="portfolio-stat"><strong>'+data.summary.linuxMissions+'</strong><span>Linux missions completed</span></div><div class="portfolio-stat"><strong>'+data.summary.networkMissions+'</strong><span>Network missions completed</span></div><div class="portfolio-stat"><strong>'+data.summary.commandDrills+'</strong><span>Command drills demonstrated</span></div></div>'
    +'<section class="portfolio-track"><h3>Linux system administration</h3><p class="portfolio-muted">Mission completions are grouped by their authored skill area. Optional recorded durations are shown only when available.</p><ul class="portfolio-evidence">'+(li||'<li>No completed Linux missions recorded yet.</li>')+'</ul>'
    +(drills?'<h3>Command skills demonstrated</h3><ul class="portfolio-evidence">'+drills+'</ul>':'')+'</section>'
    +'<section class="portfolio-track"><h3>Network operations</h3><p class="portfolio-muted">'+data.summary.networkMissions+' completed simulated network missions · '+data.tracks.network.journalEntryCount+' saved journal entries · '+data.tracks.network.configurationChanges+' recorded configuration changes.</p><ul class="portfolio-evidence">'+(ni||'<li>No completed network missions recorded yet.</li>')+'</ul></section>'
    +'<p class="portfolio-muted">Evidence is read from this browser profile only. This view does not upload, alter or merge either track’s progress. Export contains completion summaries, not terminal history, credentials or journal text.</p>'
    +'<div class="portfolio-actions"><button class="btn primary" type="button" data-portfolio-export>Export evidence JSON</button><button class="btn" type="button" data-portfolio-print>Print / save as PDF</button></div></section>';
  root.addEventListener('click',event=>{
    if(event.target===root||event.target.closest('[data-portfolio-close]')){closeSkillPortfolio();return;}
    if(event.target.closest('[data-portfolio-export]')){
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='the-last-sysadmin-skill-portfolio.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }
    if(event.target.closest('[data-portfolio-print]'))window.print();
  });
  root.addEventListener('keydown',event=>{if(event.key==='Escape')closeSkillPortfolio();});
  document.body.appendChild(root);const close=root.querySelector('[data-portfolio-close]');if(close)close.focus();
}

/* Adaptive spaced recall: schedule only completed, structured learning checkpoints. */
const REVISION_KEY='lsa-spaced-revision-v1';
const REVISION_DAY=24*60*60*1000;
const REVISION_INTERVALS=[1,3,7,14,30];
function revisionRead(){
  try{
    const value=JSON.parse(localStorage.getItem(REVISION_KEY)||'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))return{seeded:false,items:{}};
    if(!value.items||typeof value.items!=='object'||Array.isArray(value.items))value.items={};
    return value;
  }catch(e){return{seeded:false,items:{}};}
}
function revisionWrite(value){try{localStorage.setItem(REVISION_KEY,JSON.stringify(value));}catch(e){}}
function revisionEligible(m){
  return !!(m&&m.learning&&typeof m.learning.question==='string'&&Array.isArray(m.learning.choices)&&m.learning.choices.length>1&&typeof m.learning.answer==='string');
}
function revisionMission(id){return MISSIONS.find(m=>m.id===id)||null;}
function revisionBackfill(){
  const state=revisionRead();if(state.seeded)return;
  const completed=(S.done||[]).map(revisionMission).filter(revisionEligible).slice(-10);
  const now=Date.now();
  completed.forEach((m,index)=>{
    if(!state.items[m.id])state.items[m.id]={stage:0,dueAt:now+(index+1)*REVISION_DAY,lapses:0,reviews:0};
  });
  state.seeded=true;revisionWrite(state);
}
function revisionScheduleMission(m){
  if(!revisionEligible(m))return;
  const state=revisionRead();
  if(!state.items[m.id])state.items[m.id]={stage:0,dueAt:Date.now()+REVISION_DAY,lapses:0,reviews:0};
  revisionWrite(state);revisionUpdateButton();
}
function revisionItems(){
  const state=revisionRead();
  return Object.keys(state.items).map(id=>{
    const mission=revisionMission(id),record=state.items[id];
    if(!revisionEligible(mission)||!record||!Number.isFinite(Number(record.dueAt)))return null;
    return{id:id,mission:mission,record:record,dueAt:Number(record.dueAt)};
  }).filter(Boolean).sort((a,b)=>a.dueAt-b.dueAt);
}
function revisionDueCount(){const now=Date.now();return revisionItems().filter(item=>item.dueAt<=now).length;}
function revisionUpdateButton(){
  const button=document.getElementById('btnRevisionReview');if(!button)return;
  const due=revisionDueCount();
  button.textContent=due?'Recall review · '+due+' due':'Recall review';
  button.setAttribute('aria-label',due+' spaced-recall reviews due now');
}
function revisionDaysLabel(ms){
  const days=Math.max(1,Math.ceil(ms/REVISION_DAY));
  return days===1?'1 day':days+' days';
}
function closeRevisionReview(){
  const root=document.getElementById('revisionReviewDialog');if(root)root.remove();
}
function openRevisionReview(){
  closeRevisionReview();
  const root=document.createElement('div');root.id='revisionReviewDialog';root.className='bash-workshop-backdrop';
  root.innerHTML='<section class="bash-workshop-dialog revision-dialog" role="dialog" aria-modal="true" aria-labelledby="revisionTitle">'
    +'<div class="bash-workshop-head"><div><div class="eyebrow">Learning science · Spaced practice</div><h2 id="revisionTitle">Recall review</h2></div><button class="btn" type="button" data-revision-close aria-label="Close recall review">Close</button></div>'
    +'<p class="revision-summary">Bring important Linux concepts back to mind before they fade. Correct recalls earn longer intervals; missed concepts return sooner. Your schedule stays on this device and does not alter campaign progress.</p>'
    +'<div id="revisionContent" aria-live="polite"></div></section>';
  let queue=revisionItems().filter(item=>item.dueAt<=Date.now()),index=0,answered=false;
  const content=()=>root.querySelector('#revisionContent');
  function renderCard(){
    answered=false;
    if(!queue.length){
      const next=revisionItems()[0];
      if(next){
        content().innerHTML='<div class="revision-empty"><strong>No reviews due right now.</strong><p>Your next concept is scheduled in '+revisionDaysLabel(next.dueAt-Date.now())+'. You can practise it early if you want.</p><button class="btn" type="button" data-revision-early>Review next concept early</button></div>';
      }else{
        content().innerHTML='<div class="revision-empty"><strong>Your review deck is ready to grow.</strong><p>Complete a mission with a learning checkpoint. Its concept will return here for recall practice tomorrow.</p></div>';
      }
      return;
    }
    const item=queue[index],m=item.mission,l=m.learning;
    content().innerHTML='<div class="revision-meta"><span>Card '+(index+1)+' of '+queue.length+'</span><span>Lasting mastery · '+REVISION_INTERVALS[Math.min(4,Math.max(0,Number(item.record.stage)||0))]+'-day interval</span></div>'
      +'<article class="revision-question"><h3>'+esc(l.question)+'</h3><div class="revision-choices">'+l.choices.map(choice=>'<button class="revision-choice" type="button" data-revision-choice="'+esc(choice.value)+'">'+esc(choice.label)+'</button>').join('')+'</div>'
      +'<div class="revision-feedback" id="revisionFeedback" role="status" aria-live="polite">Choose the answer you can recall without looking it up.</div>'
      +'<div class="revision-actions" id="revisionActions"></div></article>';
  }
  root.addEventListener('click',function(event){
    if(event.target===root||event.target.closest('[data-revision-close]')){closeRevisionReview();return;}
    if(event.target.closest('[data-revision-early]')){const next=revisionItems()[0];if(next){queue=[next];index=0;renderCard();}return;}
    if(event.target.closest('[data-revision-next]')){index++;if(index>=queue.length)queue=[];renderCard();return;}
    const choice=event.target.closest('[data-revision-choice]');
    if(!choice||answered||!queue[index])return;
    answered=true;
    const item=queue[index],m=item.mission,l=m.learning,correct=choice.dataset.revisionChoice===l.answer;
    const state=revisionRead(),record=state.items[item.id]||{stage:0,lapses:0,reviews:0};
    if(correct){
      record.stage=Math.min(REVISION_INTERVALS.length-1,Math.max(0,Number(record.stage)||0)+1);
      record.reviews=(Number(record.reviews)||0)+1;
      record.dueAt=Date.now()+REVISION_INTERVALS[record.stage]*REVISION_DAY;
      record.lastResult='recalled';
    }else{
      record.stage=0;record.lapses=(Number(record.lapses)||0)+1;
      record.dueAt=Date.now()+REVISION_DAY;record.lastResult='missed';
    }
    record.lastReviewedAt=Date.now();state.items[item.id]=record;revisionWrite(state);revisionUpdateButton();
    root.querySelectorAll('[data-revision-choice]').forEach(button=>{button.disabled=true;if(button.dataset.revisionChoice===l.answer)button.setAttribute('aria-pressed','true');});
    const feedback=root.querySelector('#revisionFeedback');
    feedback.className='revision-feedback '+(correct?'good':'retry');
    feedback.innerHTML=(correct?'<strong>Correct recall.</strong>':'<strong>Not quite — the concept will return sooner.</strong>')+'<p>'+esc(l.review||l.concept||'Review the explanation, then apply it in the terminal.')+'</p><p>'+(correct?'Next review in '+REVISION_INTERVALS[record.stage]+' days.':'Try again tomorrow after a short break.')+'</p>';
    root.querySelector('#revisionActions').innerHTML='<button class="btn primary" type="button" data-revision-next>Continue</button>';
  });
  root.addEventListener('keydown',function(event){if(event.key==='Escape')closeRevisionReview();});
  document.body.appendChild(root);renderCard();
  const close=root.querySelector('[data-revision-close]');if(close)close.focus();
}


/* Cross-discipline case: one service outage, two independently verified disciplines. */
const CROSS_TRACK_KEY='lsa-cross-track-web-availability-v1';
function crossTrackRead(){try{const value=JSON.parse(localStorage.getItem(CROSS_TRACK_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch(e){return {};}}
function crossTrackWrite(track){const value=crossTrackRead();value[track]=true;value.updatedAt=new Date().toISOString();try{localStorage.setItem(CROSS_TRACK_KEY,JSON.stringify(value));}catch(e){}}
const CROSS_TRACK_LINUX_MISSION=[{
 id:'cross-track-web-availability-linux',title:'Restore the Halcyon web service',
 story:'The help desk reports that the Halcyon portal is unavailable. The network team has confirmed that the server is reachable and the application port is no longer responding. Investigate the service state and restore it safely.',
 objective:'Inspect halcyon.service, identify why the application is unavailable, restart it, and verify that it is active.',
 hints:['Use systemctl status halcyon to inspect the service before changing anything.','Use sudo systemctl restart halcyon, then run systemctl status halcyon again.'],
 check_type:'service_state',check_arg1:'halcyon',check_arg2:'active',
 onStart:()=>{if(S.services&&S.services.halcyon)S.services.halcyon.active=false;}
}];
const CROSS_TRACK_REMOTE_LINUX_MISSION=[{
 id:'cross-track-remote-admin-linux',title:'Restore secure remote administration',
 story:'The operations team cannot administer jump01 over SSH. The host is reachable, but the SSH service is stopped. Inspect the service before restoring it, then verify that it is active.',
 objective:'Inspect ssh.service, identify its inactive state, restart it with appropriate privileges, and verify that it is active.',
 hints:['Use systemctl status ssh to inspect the service and confirm its current state.','Use sudo systemctl restart ssh, then verify with systemctl is-active ssh.'],
 check_type:'service_state',check_arg1:'ssh',check_arg2:'active',
 onStart:()=>{if(S.services&&S.services.ssh)S.services.ssh.active=false;}
}];
const CROSS_TRACK_HARDENING_LINUX_MISSION=[{
 id:'cross-track-ssh-hardening-linux',title:'Restore brute-force protection',
 story:'The security review found repeated SSH authentication failures, but the host is no longer applying automatic bans. The Fail2Ban service is stopped. Inspect the unit, restore it and verify that protection is active.',
 objective:'Inspect fail2ban.service, restart it with appropriate privileges, and verify that the service is active.',
 hints:['Use systemctl status fail2ban to inspect the unit before changing anything.','Use sudo systemctl restart fail2ban, then verify with systemctl is-active fail2ban.'],
 check_type:'service_state',check_arg1:'fail2ban',check_arg2:'active',
 onStart:()=>{if(S.services&&S.services.fail2ban)S.services.fail2ban.active=false;}
}];
const CROSS_TRACK_CONTAINMENT_LINUX_MISSION=[{
 id:'cross-track-contractor-containment-linux',title:'Revoke compromised contractor privileges',
 story:'Security has correlated repeated SSH authentication activity from 198.51.100.200 with the former contractor account jmorrow. The account still belongs to sudo. Preserve the account and its home directory for investigation, but remove its unnecessary administrative privilege.',
 objective:'Review the authentication evidence and sudo group membership, then remove jmorrow from sudo. Do not delete the account or alter its home directory.',
 hints:['Use sudo grep -n jmorrow /var/log/auth.log to review the recorded SSH and privilege events, then inspect getent group sudo.','Use sudo gpasswd -d jmorrow sudo, then verify the sudo group no longer lists jmorrow.'],
 check_type:'group_not_member',check_arg1:'sudo',check_arg2:'jmorrow'
}];
function closeCrossTrackCase(){const root=document.getElementById('crossTrackCaseDialog');if(root)root.remove();}
function openCrossTrackCase(focusCase){
 closeCrossTrackCase();const state=crossTrackRead();
 const isFocused=id=>focusCase===id?' focused':'';
 const root=document.createElement('div');root.id='crossTrackCaseDialog';root.className='bash-workshop-backdrop';
 root.innerHTML='<section class="bash-workshop-dialog" role="dialog" aria-modal="true" aria-labelledby="crossTrackCaseTitle">'
 +'<div class="bash-workshop-head"><div><div class="eyebrow">Integrated operations · P1 service incident</div><h2 id="crossTrackCaseTitle">The unavailable Halcyon portal</h2></div><button class="btn" type="button" data-cross-close aria-label="Close integrated case">Close</button></div>'
 +'<p class="ops-lab-summary">Restore service end-to-end by completing two investigations: repair the application service on Linux, then correct the client-side network name record and verify delivery. Each half is graded by its own simulator; completing one does not auto-complete the other.</p>'
 +'<div class="ops-lab-card'+(state.linux?' complete':'')+isFocused('web-availability')+'" data-cross-case="web-availability"><div class="ops-lab-status">'+(state.linux?'✓ Linux task demonstrated':'1 · Linux Sysadmin')+'</div><h3>Restore the application service</h3><p>Inspect the simulated systemd service, restart it and verify its state. Campaign progress is untouched.</p><div class="ops-lab-actions"><button class="btn primary" type="button" data-cross-linux>Start Linux task</button></div></div>'
 +'<div class="ops-lab-card'+(state.network?' complete':'')+isFocused('web-availability')+'" data-cross-case="web-availability"><div class="ops-lab-status">'+(state.network?'✓ Network task demonstrated':'2 · Network Sysadmin')+'</div><h3>Restore client access</h3><p>Correct the stale local name record, then verify name resolution, IP reachability and the web service port.</p><div class="ops-lab-actions"><button class="btn" type="button" data-cross-network>Open Network task</button></div></div>'
 +'<div class="ops-lab-card'+(state.remoteLinux?' complete':'')+isFocused('remote-admin')+'" data-cross-case="remote-admin"><div class="ops-lab-status">'+(state.remoteLinux?'✓ Linux task demonstrated':'3 · Linux Sysadmin')+'</div><h3>Restore SSH on jump01</h3><p>Inspect the SSH daemon, restart it safely and confirm the service is active.</p><div class="ops-lab-actions"><button class="btn primary" type="button" data-remote-linux>Start Linux task</button></div></div>'
 +'<div class="ops-lab-card'+(state.remoteNetwork?' complete':'')+isFocused('remote-admin')+'" data-cross-case="remote-admin"><div class="ops-lab-status">'+(state.remoteNetwork?'✓ Network task demonstrated':'4 · Network Sysadmin')+'</div><h3>Repair the management access policy</h3><p>Correct ACL order to permit SSH while continuing to deny unrelated services.</p><div class="ops-lab-actions"><button class="btn" type="button" data-remote-network>Open Network task</button></div></div>'
 +'<div class="ops-lab-card'+(state.hardeningLinux?' complete':'')+isFocused('ssh-hardening')+'" data-cross-case="ssh-hardening"><div class="ops-lab-status">'+(state.hardeningLinux?'✓ Linux task demonstrated':'5 · Linux Sysadmin')+'</div><h3>Restore brute-force protection</h3><p>Inspect the Fail2Ban unit, restore the service and verify its state.</p><div class="ops-lab-actions"><button class="btn primary" type="button" data-hardening-linux>Start Linux task</button></div></div>'
 +'<div class="ops-lab-card'+(state.hardeningNetwork?' complete':'')+isFocused('ssh-hardening')+'" data-cross-case="ssh-hardening"><div class="ops-lab-status">'+(state.hardeningNetwork?'✓ Network task demonstrated':'6 · Network Sysadmin')+'</div><h3>Limit SSH to the operations subnet</h3><p>Apply least-privilege ACL rules while preserving client web access.</p><div class="ops-lab-actions"><button class="btn" type="button" data-hardening-network>Open Network task</button></div></div>'
 +'<div class="ops-lab-card'+(state.contractorLinux?' complete':'')+isFocused('contractor-containment')+'" data-cross-case="contractor-containment"><div class="ops-lab-status">'+(state.contractorLinux?'✓ Linux task demonstrated':'7 · Linux Sysadmin')+'</div><h3>Revoke compromised contractor privileges</h3><p>Correlate SSH evidence and remove the former contractor from sudo without destroying the account.</p><div class="ops-lab-actions"><button class="btn primary" type="button" data-contractor-linux>Start Linux task</button></div></div>'
 +'<div class="ops-lab-card'+(state.contractorNetwork?' complete':'')+isFocused('contractor-containment')+'" data-cross-case="contractor-containment"><div class="ops-lab-status">'+(state.contractorNetwork?'✓ Network task demonstrated':'8 · Network Sysadmin')+'</div><h3>Contain the suspicious SSH source</h3><p>Block the confirmed source IP from jump-host SSH while preserving operations access and public HTTPS.</p><div class="ops-lab-actions"><button class="btn" type="button" data-contractor-network>Open Network task</button></div></div>'
 +'<details class="ops-lab-card" data-incident-debrief><summary><strong>Incident debrief · evidence and learning outcomes</strong></summary><p>Use this review after attempting the cases. Completion records show which simulator objectives you demonstrated; they are not a substitute for retaining the investigation evidence.</p><div class="cross-track-status"><span>'+(state.linux?'✓':'○')+' Halcyon service recovery</span><span>'+(state.network?'✓':'○')+' Client connectivity recovery</span><span>'+(state.remoteLinux?'✓':'○')+' SSH service recovery</span><span>'+(state.remoteNetwork?'✓':'○')+' Management ACL repair</span><span>'+(state.hardeningLinux?'✓':'○')+' Fail2Ban restoration</span><span>'+(state.hardeningNetwork?'✓':'○')+' Least-privilege SSH policy</span><span>'+(state.contractorLinux?'✓':'○')+' Contractor privilege removal</span><span>'+(state.contractorNetwork?'✓':'○')+' Suspicious-source containment</span></div><h3>Evidence to preserve</h3><ul><li>Before-and-after service state, relevant journal/authentication lines, and the exact verification command.</li><li>Network path tests, ACL contents and order, interface attachment, and the permitted business traffic that remained available.</li><li>A short timeline linking the observed symptom, evidence, change, and post-change validation.</li></ul><h3>Debrief questions</h3><ol><li>Which observation established the likely root cause rather than merely describing the symptom?</li><li>What was the smallest safe change, and what evidence proves it worked?</li><li>Which legitimate user or service path did you deliberately protect?</li><li>What would you monitor next, and what would trigger escalation or rollback?</li></ol><p>Learning outcomes: evidence-led diagnosis, least-privilege containment, change validation, service continuity, and clear incident handover.</p></details>'
 +'<p class="ops-lab-safety">Simulation only. Both environments run in the browser and do not connect to real servers or network devices. Completion is stored locally in this browser profile.</p></section>';
 root.addEventListener('click',function(event){
  if(event.target===root||event.target.closest('[data-cross-close]')){closeCrossTrackCase();return;}
  if(event.target.closest('[data-cross-linux]')){closeCrossTrackCase();playAuthored(CROSS_TRACK_LINUX_MISSION,'Cross-discipline Service Recovery');return;}
  if(event.target.closest('[data-cross-network]')){window.location.href='network-trainer/index.html?crossTrack=web-availability';return;}
  if(event.target.closest('[data-remote-linux]')){closeCrossTrackCase();playAuthored(CROSS_TRACK_REMOTE_LINUX_MISSION,'Cross-discipline Remote Access');return;}
  if(event.target.closest('[data-remote-network]')){window.location.href='network-trainer/index.html?crossTrack=remote-admin';return;}
  if(event.target.closest('[data-hardening-linux]')){closeCrossTrackCase();playAuthored(CROSS_TRACK_HARDENING_LINUX_MISSION,'Cross-discipline SSH Hardening');return;}
  if(event.target.closest('[data-hardening-network]')){window.location.href='network-trainer/index.html?crossTrack=ssh-hardening';return;}
  if(event.target.closest('[data-contractor-linux]')){closeCrossTrackCase();playAuthored(CROSS_TRACK_CONTAINMENT_LINUX_MISSION,'Cross-discipline Contractor Containment');return;}
  if(event.target.closest('[data-contractor-network]')){window.location.href='network-trainer/index.html?crossTrack=contractor-containment';return;}
 });
 root.addEventListener('keydown',function(event){if(event.key==='Escape')closeCrossTrackCase();});
 document.body.appendChild(root);
 if(focusCase){const target=root.querySelector('[data-cross-case="'+focusCase+'"]');if(target&&target.scrollIntoView)target.scrollIntoView({block:'nearest'});}
 const close=root.querySelector('[data-cross-close]');if(close)close.focus();
}

function render() {
  $('#xp').textContent = S.xp;
  $('#rank').textContent = rankName();
  const leds = $('#leds'); leds.innerHTML = '';
  const curCh = MISSIONS[S.mission] ? MISSIONS[S.mission].ch : 0;
  CHAPTERS.forEach((c, ci) => {
    const g = document.createElement('div'); g.className = 'grp' + (ci === curCh ? ' current' : '');
    g.innerHTML = `<span class="gl">CH${ci + 1}</span>`;
    MISSIONS.forEach((m, mi) => {
      if (m.ch !== ci) return;
      const l = document.createElement('span');
      l.className = 'led' + (S.done.includes(m.id) ? ' done' : (!S.finished && mi === S.mission ? ' cur' : ''));
      l.title = `${ticketId(mi)} · ${m.title}`;
      g.appendChild(l);
    });
    const t = document.createElement('span'); t.className = 'gt'; t.textContent = c.topic; g.appendChild(t);
    leds.appendChild(g);
  });
  if (!rackExpanded) leds.classList.add('collapsed');
  else leds.classList.add('expanded');
  $('#doneCount').textContent = `${S.done.length} of ${MISSIONS.length} tickets resolved`;
  revisionUpdateButton();
  const bt = $('#btnTimer'); if (bt) bt.classList.toggle('on', !!S.tracker);
  const cs = $('#clockStat'); if (cs) cs.hidden = !(S.tracker && !S.finished);
  const sp = $('#speed'); const times = S.times || [];
  if (sp) {
    sp.hidden = !(S.tracker || times.length);
    if (!sp.hidden) {
      const total = times.reduce((x, r) => x + r.ms, 0);
      const best = times.length ? times.reduce((x, r) => r.ms < x.ms ? r : x) : null;
      $('#spdCount').textContent = times.length ? `${times.length} timed` : (S.tracker ? 'on' : '');
      let html = '';
      if (S.tracker && !S.finished) html += `<div class="spd-live" id="spdLive">${S.missionStart ? fmtDur(Date.now() - S.missionStart) : '0:00'}</div><div class="spd-hint">time on this ticket</div>`;
      if (times.length) {
        html += `<div class="spd-row"><span>Tickets timed</span><span class="sv">${times.length}</span></div>`;
        html += `<div class="spd-row"><span>Total time</span><span class="sv">${fmtDur(total)}</span></div>`;
        html += `<div class="spd-row"><span>Average</span><span class="sv">${fmtDur(total / times.length)}</span></div>`;
        if (best) html += `<div class="spd-row"><span>Fastest</span><span class="sv">${fmtDur(best.ms)}</span></div>`;
        html += `<div class="spd-hint">Type <code>stats</code> for the full log.</div>`;
      } else if (S.tracker) { html += `<div class="spd-hint">Resolve a ticket to start your log.</div>`; }
      $('#speedBody').innerHTML = html;
    }
  }
  const chips = $('#chips'); chips.innerHTML = '';
  if (!S.learned.length) chips.innerHTML = '<p class="empty">Commands appear here as you use them.</p>';
  const sorted = [...S.learned].sort();
  sorted.forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = c;
    b.addEventListener('click', () => { if (MAN[c]) { submitLine('man ' + c); tin.focus({ preventScroll: true }); } });
    chips.appendChild(b);
  });
  if (!chipsExpanded) chips.classList.add('collapsed');
  const cbtn = document.getElementById('btnChipsToggle');
  if (cbtn) cbtn.hidden = sorted.length <= CHIPS_DEFAULT;
  const fin = $('#finale');
  const show = (sel, on) => { const el = $(sel); el.hidden = !on; };
  renderJourney();
  renderFilesystemExplorer();
  renderCommandIncident();
  if (RACE.active) {
    setPanelTab('mission');
    show('#learningPath', false);
    renderBoard();
    if (RACE.finished) {
      $('#pChapter').textContent = 'Race';
      $('#pTicket').textContent = RACE.scenario ? RACE.scenario.name : '';
      $('#pTitle').textContent = 'Incident resolved ✓';
      $('#pStory').innerHTML = md(`Your time: **${fmtDur(RACE.myFinishMs)}**. Final standings are below.`);
      show('.objective', false); show('.hints', false); show('#finale', false); show('#learningPath', false);
      return;
    }
  }
  if (S.finished) {
    $('#pChapter').textContent = `Chapters 1–${CHAPTERS.length} complete`;
    $('#pTicket').textContent = 'Case file: open';
    $('#pTitle').textContent = FINALE.title;
    $('#pStory').textContent = FINALE.story;
    show('.objective', false); show('.hints', false); show('#finale', true); show('#learningPath', false);
    fin.innerHTML = `<div><div class="label">Final score</div><div class="big">${S.xp} XP</div><div class="ticket">Rank: ${rankName()} · ${Object.values(S.hints).reduce((x, y) => x + y, 0)} hints used</div></div>
      <div class="next"><div class="label">Coming next</div><b>${esc(FINALE.next)}</b><p>${esc(FINALE.nextText)}</p></div>`;
    return;
  }
  show('.objective', true); show('.hints', true); show('#finale', false);
  const m = MISSIONS[S.mission], used = S.hints[m.id] || 0;
  const guide = $('#learningPath');
  show('#learningPath', !!m.learning);
  if (m.learning) {
    const choices = m.learning.choices.map(c => '<button type="button" class="learn-choice" data-learning-choice="' + c.value + '">' + c.label + '</button>').join('');
    guide.innerHTML = '<h2>Learn the basics · then prove it</h2>' +
      '<div class="learning-card"><b>Learn</b><p>' + m.learning.concept + '</p></div>' +
      '<div class="learning-grid"><div class="learning-card"><b>See it in action</b><div class="learning-example">' + m.learning.example + '</div></div>' +
      '<div class="learning-card"><b>Investigate</b><p>' + m.learning.investigate + '</p></div></div>' +
      '<div class="learning-card"><b>Practise</b><p>' + m.learning.practice + '</p></div>' +
      '<div class="learning-question"><b>Prove your understanding</b><p>' + m.learning.question + '</p><div class="learning-choices">' + choices + '</div>' +
      '<div class="learning-feedback" id="learningFeedback" role="status" aria-live="polite">' + (learningMasteryPassed ? 'Correct — you can now complete the mission.' : 'Choose an answer to check your understanding.') + '</div></div>' +
      '<div class="learning-card"><b>Review</b><p>' + m.learning.review + '</p></div>';
    guide.querySelectorAll('[data-learning-choice]').forEach(button => button.addEventListener('click', () => {
      const correct = button.dataset.learningChoice === m.learning.answer;
      guide.querySelectorAll('[data-learning-choice]').forEach(choice => {
        choice.classList.toggle('correct', correct && choice === button);
        choice.classList.toggle('wrong', !correct && choice === button);
      });
      learningMasteryPassed = correct;
      const feedback = $('#learningFeedback');
      feedback.className = 'learning-feedback ' + (correct ? 'ok' : 'bad');
      const readyNow = correct && m.check && m.check();
      feedback.textContent = correct
        ? (m.learning.correctFeedback || (readyNow ? 'Correct — objective and understanding verified! Advancing to the next ticket…' : 'Correct. You can now complete the mission objective in the terminal.'))
        : (m.learning.incorrectFeedback || 'Not quite. Re-read the explanation and try again.');
      if (readyNow) {
        setTimeout(() => {
          if (!S.finished && MISSIONS[S.mission] === m && learningMasteryPassed && m.check && m.check()) {
            afterCommand(); updatePrompt(); render(); renderCommandSkills(); save(); scrollEnd();
          }
        }, 350);
      }
    }));
  }
  $('#pChapter').textContent = `${CHAPTERS[m.ch].label} · ${CHAPTERS[m.ch].name}`;
  $('#pTicket').textContent = `${ticketId(S.mission)} · reward ${rewardFor(m)} XP`;
  $('#pTitle').textContent = m.title;
  $('#pStory').innerHTML = md(m.story);
  $('#pObj').innerHTML = md(m.objective);
  $('#pHints').innerHTML = m.hints.slice(0, used).map(h => `<li>${md(h)}</li>`).join('');
  $('#hintCount').textContent = `${used} of ${m.hints.length} shown`;
  const hb = $('#btnHint');
  hb.disabled = used >= m.hints.length;
  hb.textContent = used >= m.hints.length ? 'No more hints' : (rewardFor(m) > 25 ? 'Show hint · −25 XP' : 'Show hint');
}
$('#btnHint').addEventListener('click', () => { showHint(); scrollEnd(); });
$('#btnRetry').addEventListener('click', () => { doRetry(); scrollEnd(); });
$('#btnTimer').addEventListener('click', () => { toggleTracker(); scrollEnd(); tin.focus({ preventScroll: true }); });
let newTimer = null;
$('#btnNew').addEventListener('click', e => {
  if (RACE.active) { emitSys('Finish or leave the race first (use <b>Leave race</b>).', 'hint'); return; }
  const b = e.currentTarget;
  if (!b.classList.contains('danger')) {
    b.classList.add('danger'); b.textContent = 'Erase progress?';
    newTimer = setTimeout(() => { b.classList.remove('danger'); b.textContent = 'New game'; }, 3500);
    return;
  }
  clearTimeout(newTimer); b.classList.remove('danger'); b.textContent = 'New game';
  S = freshState(); tout.innerHTML = ''; boot(false);
});

/* ---------- boot ---------- */
function motd(restored) {
  emit(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)

${MOTD}
Last login: Thu Oct 22 17:58:03 2026 from 10.0.4.31`);
  emitSys(restored ? 'Session restored. Your files and progress are as you left them.' : 'Type <code>help</code> to list commands, <code>man ls</code> to read a manual, or <code>hint</code> if you get stuck. If a ticket won\'t advance even though you did the step, type <code>check</code> and it will tell you what it is still waiting for.', 'hint');
}
function initFirstRunGuide(restored) {
  const panel = $('#firstRunGuide');
  if (!panel) return;
  let completed = false;
  try { completed = localStorage.getItem('lsa-first-run-complete') === '1'; } catch (e) {}
  panel.hidden = !!restored || completed;
  const dismiss = $('#firstRunDismiss');
  if (dismiss) dismiss.addEventListener('click', () => {
    panel.hidden = true;
    try { localStorage.setItem('lsa-first-run-complete', '1'); } catch (e) {}
  });
  panel.querySelectorAll('[data-onboard-command]').forEach(button => button.addEventListener('click', () => {
    tin.value = button.dataset.onboardCommand || '';
    tin.focus({ preventScroll: true });
    tin.setSelectionRange(tin.value.length, tin.value.length);
  }));
}

const INVESTIGATION_TOUR_STEPS = [
  { title: 'Your first investigation', body: 'A web service is reported unavailable. We will collect three kinds of evidence before recommending a change: service state, recent logs, and listening sockets. This is a safe, read-only simulation; it does not touch your computer or a real server.', target: '#commandIncidentChallenge' },
  { title: 'Start the investigation', body: 'Start the challenge. The task card will tell you exactly what to inspect, and the progress counter will confirm each check. We will not restart the service or change configuration while gathering evidence.', target: '#commandIncidentStart', action: 'start' },
  { title: '1 · Inspect service state', body: 'Check whether systemd considers the Halcyon service active and note its main process. A service can be running while the application is still unhealthy, so treat this as one clue—not the whole answer.', target: '#tin', command: 'systemctl status halcyon', commandStep: 0 },
  { title: '2 · Read recent service logs', body: 'Read the latest 20 journal entries for this service. Look for repeated errors, timestamps, and the process that emitted them. In this lab, pay attention to the export-hook permission failure; do not assume it is the only cause.', target: '#tin', command: 'journalctl -u halcyon -n 20', commandStep: 1 },
  { title: '3 · Check listening sockets', body: 'List listening TCP and UDP sockets with numeric ports. The flags mean TCP, UDP, listening only, and numeric output. Compare the application port you expect with the ports actually listening.', target: '#tin', command: 'ss -tuln', commandStep: 2 },
  { title: 'Correlate the evidence', body: 'You have collected service state, log evidence, and network-listener evidence. Correlate timestamps, process names, and ports; write down what is known, what is still uncertain, and the next safe test. Good incident work gathers evidence before changing or restarting anything.', target: '#commandIncidentFeedback' }
];
let investigationTourOpen = false;
let investigationTourStep = 0;
function clearInvestigationTourTarget() {
  document.querySelectorAll('.tour-focus').forEach(node => node.classList.remove('tour-focus'));
}
function renderInvestigationTour() {
  const root = $('#investigationTour');
  if (!root) return;
  root.hidden = !investigationTourOpen;
  clearInvestigationTourTarget();
  if (!investigationTourOpen) return;
  const step = INVESTIGATION_TOUR_STEPS[investigationTourStep];
  if (!step) return;
  $('#investigationTourAvatar').textContent = loadAvatar() || '🧑‍💻';
  $('#investigationTourTitle').textContent = step.title;
  $('#investigationTourCopy').textContent = step.body;
  $('#investigationTourStep').textContent = 'STEP ' + (investigationTourStep + 1) + ' / ' + INVESTIGATION_TOUR_STEPS.length;
  const action = $('#investigationTourAction');
  const status = $('#investigationTourStatus');
  action.hidden = !(step.action || step.command);
  action.disabled = false;
  if (step.action === 'start') {
    action.textContent = commandIncidentActive ? 'Investigation started' : 'Start investigation';
    action.disabled = commandIncidentActive;
    status.textContent = commandIncidentActive ? 'The challenge is active.' : 'Start the read-only challenge to unlock the first check.';
  } else if (step.command) {
    const complete = commandIncidentStep > step.commandStep;
    action.textContent = complete ? 'Evidence collected' : 'Load command into terminal';
    action.disabled = complete;
    status.textContent = complete ? 'This check is complete. Use Back to review earlier guidance.' : 'Load the command, review it, then press Enter in the terminal. The guide advances when the tracker confirms it.';
  } else {
    status.textContent = investigationTourStep === INVESTIGATION_TOUR_STEPS.length - 1
      ? 'Investigation complete · three read-only checks collected.'
      : 'Follow the highlighted area, then continue.';
  }
  const back = $('#investigationTourBack');
  const next = $('#investigationTourNext');
  back.disabled = investigationTourStep === 0;
  next.textContent = investigationTourStep === INVESTIGATION_TOUR_STEPS.length - 1 ? 'Finish tour' : 'Next';
  let canAdvance = investigationTourStep === 0 || investigationTourStep === INVESTIGATION_TOUR_STEPS.length - 1;
  if (investigationTourStep === 1) canAdvance = commandIncidentActive;
  if (step.commandStep !== undefined) canAdvance = commandIncidentStep > step.commandStep;
  next.disabled = !canAdvance;
  const target = document.querySelector(step.target);
  if (target) {
    target.classList.add('tour-focus');
    if (typeof target.scrollIntoView === 'function') {
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
}
function setInvestigationTourStep(index) {
  investigationTourStep = Math.max(0, Math.min(INVESTIGATION_TOUR_STEPS.length - 1, index));
  investigationTourOpen = true;
  renderInvestigationTour();
}
function openInvestigationTour() {
  commandIncidentUnlocked = true;
  renderCommandIncident();
  setPanelTab('progress');
  investigationTourOpen = true;
  investigationTourStep = commandIncidentActive ? 2 + commandIncidentStep : 0;
  renderInvestigationTour();
  $('#investigationTourNext')?.focus({ preventScroll: true });
}
function closeInvestigationTour(completed) {
  if (completed) {
    try { localStorage.setItem('lsa-investigation-tour-complete', '1'); } catch (e) {}
  }
  investigationTourOpen = false;
  renderInvestigationTour();
  $('#commandIncidentTour')?.focus({ preventScroll: true });
}
function runInvestigationTourAction() {
  const step = INVESTIGATION_TOUR_STEPS[investigationTourStep];
  if (!step) return;
  if (step.action === 'start') {
    $('#commandIncidentStart')?.click();
    if (commandIncidentActive) setInvestigationTourStep(2);
    return;
  }
  if (step.command && commandIncidentStep <= step.commandStep) {
    tin.value = step.command;
    tin.focus({ preventScroll: true });
    tin.setSelectionRange(tin.value.length, tin.value.length);
    $('#investigationTourStatus').textContent = 'Command loaded. Read it, then press Enter in the terminal.';
  }
}
$('#investigationTourAction')?.addEventListener('click', runInvestigationTourAction);
$('#investigationTourNext')?.addEventListener('click', () => {
  if (investigationTourStep === INVESTIGATION_TOUR_STEPS.length - 1) {
    closeInvestigationTour(true);
    return;
  }
  setInvestigationTourStep(investigationTourStep + 1);
});
$('#investigationTourBack')?.addEventListener('click', () => setInvestigationTourStep(investigationTourStep - 1));
$('#investigationTourSkip')?.addEventListener('click', () => closeInvestigationTour(false));
$('#investigationTourClose')?.addEventListener('click', () => closeInvestigationTour(false));

function boot(restored) {
  const healthButton = document.getElementById('btnHealthDashboard');
  if (healthButton && !healthButton.dataset.bound) { healthButton.dataset.bound='true'; healthButton.addEventListener('click',openServerHealth); }
  const bashButton=document.getElementById('btnBashWorkshop');
  if(bashButton&&!bashButton.dataset.bound){bashButton.dataset.bound='true';bashButton.addEventListener('click',openBashWorkshop);}
  const opsButton=document.getElementById('btnOpsRecoveryLab');
  if(opsButton&&!opsButton.dataset.bound){opsButton.dataset.bound='true';opsButton.addEventListener('click',openOpsRecoveryLab);}
  const companyDeskButton=document.getElementById('btnCompanyDesk');
  if(companyDeskButton&&!companyDeskButton.dataset.bound){companyDeskButton.dataset.bound='true';companyDeskButton.addEventListener('click',openCompanyDesk);}
  const portfolioButton=document.getElementById('btnSkillPortfolio');
  if(portfolioButton&&!portfolioButton.dataset.bound){portfolioButton.dataset.bound='true';portfolioButton.addEventListener('click',openSkillPortfolio);}
  const revisionButton=document.getElementById('btnRevisionReview');
  if(revisionButton&&!revisionButton.dataset.bound){revisionButton.dataset.bound='true';revisionButton.addEventListener('click',openRevisionReview);}
  revisionBackfill();
  const crossButton=document.getElementById('btnCrossTrackCase');
  if(crossButton&&!crossButton.dataset.bound){crossButton.dataset.bound='true';crossButton.addEventListener('click',openCrossTrackCase);}
  (S.commandSkills || []).forEach(name => completedCommandDrills.add(name));
  initFirstRunGuide(restored);
  for (const id of ['firstRunInvestigationTour', 'commandIncidentTour', 'commandIncidentLockedTour', 'btnInvestigationTour']) {
    const button = document.getElementById(id);
    if (button && !button.dataset.bound) {
      button.dataset.bound = 'true';
      button.addEventListener('click', openInvestigationTour);
    }
  }
  initFilesystemExplorer();
  motd(restored);
  if (restored) { const fixed = repairWorld(); if (fixed) { S.checkpoint = JSON.stringify(S.fs); emitSys(`Restored ${fixed} game file${fixed === 1 ? '' : 's'} that had been deleted, so you can keep going.`, 'hint'); } }
  if (restored && S.finished && S.mission < MISSIONS.length) {
    S.finished = false;
    emitSys(`<b>New chapter unlocked.</b> Your progress from earlier chapters is kept.`, 'ok');
    startMission();
  } else if (restored) { if (!S.finished) { const m = MISSIONS[S.mission]; emitSys(`<span class="chap">${CHAPTERS[m.ch].label}</span>${CHAPTERS[m.ch].name}`, 'chapter'); } announceMission(); }
  else startMission();
  if (S.tracker && !S.finished) S.missionStart = Date.now();
  ensureClock();
  updatePrompt(); render(); renderCommandSkills(); save(); scrollEnd();
  const crossTrackParam = new URLSearchParams(window.location.search).get('crossTrack');
  if (['web-availability', 'remote-admin', 'ssh-hardening', 'contractor-containment'].includes(crossTrackParam)) openCrossTrackCase(crossTrackParam);
  if (window.matchMedia && matchMedia('(pointer:fine)').matches) tin.focus({ preventScroll: true });
}
/* ============================================================
   Race mode — online head-to-head via the room capability
   ============================================================ */
const RACE_SCN = [
  { id: 'phantom',    startId: 'ph-df',      steps: 5, name: 'The Phantom Disk',            desc: 'Disk full, but du disagrees — a deleted file held open.' },
  { id: 'inodes',     startId: 'in-df',      steps: 5, name: 'No Space, Plenty of Room',     desc: 'Writes fail at 15% full — inode exhaustion.' },
  { id: 'compromise', startId: 'co-w',       steps: 6, name: 'Someone Else Is Root',         desc: 'Unknown login, box running hot — a live compromise.' },
  { id: 'oom',        startId: 'oom-status', steps: 5, name: 'The Service That Keeps Dying', desc: 'An app dies with no error of its own — the OOM killer.' },
  { id: 'ghost',      startId: 'gl-uptime',  steps: 5, name: 'The Ghost Load',               desc: 'Load sky-high, CPU idle — I/O wait on a stuck process.' }
];
const RACE_COLORS = ['#f2b04b', '#7fb2f5', '#78d39f', '#c79bf2', '#ff8471', '#5ad2d2', '#e68fd0', '#b9c24a'];
function raceReset() { return { active: false, roomObj: null, code: '', name: '', color: '', scnId: null, scenario: null, startIdx: 0, endIdx: 0, total: 0, phase: 'off', ready: false, isHost: false, myPeer: '', hostPeer: '', go: 0, goLock: 0, myStart: 0, myFinishMs: null, finished: false, unsubs: [], peerCache: [], countTimer: null, boardTimer: null }; }
let RACE = raceReset();
let campaignS = null;
/* Optional: hard-code a Supabase project here, or leave blank and let players
   enter it once in the Race dialog (saved in their browser). The anon key is a
   public client key by design. Used only when the claude.ai room backend is
   absent (i.e. a self-hosted / GitHub Pages copy). */
const SUPABASE_URL = 'https://yhzefqoplunmseuwcwku.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemVmcW9wbHVubXNldXdjd2t1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDM0NTQsImV4cCI6MjEwODgxOTQ1NH0.5CWs0AtbFtrAYOYiPjgKfvWivAMPeXGXSzOblZMCS3c';
let roomCap;
let RACE_BACKEND = '';
function supaConfig() {
  let url = SUPABASE_URL, key = SUPABASE_ANON_KEY;
  try { url = url || localStorage.getItem('lsa-sb-url') || ''; key = key || localStorage.getItem('lsa-sb-key') || ''; } catch (e) {}
  url = (url || '').trim(); key = (key || '').trim();
  return (url && key) ? { url, key } : null;
}
let supaLoading = null;
function loadSupabase() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  if (supaLoading) return supaLoading;
  supaLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
    s.onload = res; s.onerror = () => { supaLoading = null; rej(new Error('library')); };
    document.head.appendChild(s);
  });
  return supaLoading;
}
let sbClient = null;
async function getSB() {
  const cfg = supaConfig(); if (!cfg) return null;
  if (sbClient) return sbClient;
  try { await loadSupabase(); } catch (e) { return null; }
  if (!(window.supabase && window.supabase.createClient)) return null;
  sbClient = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 20 } }
  });
  return sbClient;
}
async function makeSupabaseRoom() {
  const client = await getSB();
  if (!client) throw new Error('library');
  return { backend: 'supabase', join: (name, isCreator) => supaJoin(client, name, isCreator) };
}
function supaJoin(client, name, isCreator) {
  return new Promise((resolve, reject) => {
    const myKey = (isCreator ? '0_' : 'p_') + Math.random().toString(36).slice(2, 10);
    let mine = {}, handlers = [], settled = false;
    const ch = client.channel('lsa_' + name, { config: { presence: { key: myKey } } });
    const buildPeers = () => {
      const st = ch.presenceState() || {}; const out = [];
      for (const k in st) { const arr = st[k] || []; const meta = arr[arr.length - 1] || {}; out.push({ peer: k, by: null, isMe: k === myKey, sameTab: k === myKey, kind: 'viewer', guest: false, presence: (meta && meta.p) || {} }); }
      return out;
    };
    const fire = () => { const peers = buildPeers(); const c = { peers, joined: peers, left: [], updated: peers }; handlers.slice().forEach(h => { try { h(c); } catch (e) {} }); };
    ch.on('presence', { event: 'sync' }, fire);
    ch.on('presence', { event: 'join' }, fire);
    ch.on('presence', { event: 'leave' }, fire);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !settled) {
        settled = true;
        ch.track({ p: mine }).then(() => resolve({
          name,
          presence: async (patch) => { for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } try { await ch.track({ p: mine }); } catch (e) {} },
          onPeers: (h) => { handlers.push(h); setTimeout(fire, 0); return () => { handlers = handlers.filter(x => x !== h); }; },
          peers: buildPeers,
          leave: async () => { try { await ch.untrack(); } catch (e) {} try { client.removeChannel(ch); } catch (e) {} }
        })).catch(() => { if (!settled) { settled = true; reject(new Error('track')); } });
      } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) { settled = true; reject(new Error(status)); }
    });
  });
}
async function getRoom() {
  if (roomCap !== undefined) return roomCap;
  try { if (typeof window !== 'undefined' && window.claude && window.claude.use) { const r = await window.claude.use('room'); if (r) { roomCap = r; RACE_BACKEND = 'claude'; return roomCap; } } } catch (e) {}
  const cfg = supaConfig();
  if (cfg) { try { roomCap = await makeSupabaseRoom(); RACE_BACKEND = 'supabase'; return roomCap; } catch (e) { roomCap = null; return roomCap; } }
  roomCap = null; return roomCap;
}
function raceSafeName(s) { s = (s || '').trim().replace(/[^\x20-\x7e]/g, '').slice(0, 18); return s || 'Player'; }
function raceCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function lockTin(on) { tin.disabled = !!on; }
const roEl = () => $('#raceOverlay');
function showOverlay() { roEl().hidden = false; }
function hideOverlay() { roEl().hidden = true; }
function renderContent(html) { $('#raceContent').innerHTML = html; }

async function openRace() {
  if (RACE.active || RACE.phase === 'lobby' || RACE.phase === 'countdown') { showOverlay(); return; }
  showOverlay();
  renderContent('<p class="rlead">Connecting…</p>');
  const room = await getRoom();
  if (room) { renderSetup(); return; }
  if (!supaConfig()) { renderSupabaseSetup(false); return; }
  renderSupabaseSetup(true);
}
function renderSupabaseSetup(failed, back) {
  back = back || renderSetup;
  let u = '', k = '';
  try { u = localStorage.getItem('lsa-sb-url') || ''; k = localStorage.getItem('lsa-sb-key') || ''; } catch (e) {}
  renderContent(`<h2>Set up online racing</h2>
    <p class="rlead">This copy of the game isn't running on claude.ai, so live racing needs a free realtime backend. Connect a <b>Supabase</b> project once and every player who opens this page can race. It's saved in your browser.</p>
    ${failed ? '<div class="race-err">Couldn\'t connect with the saved details. Double-check the Project URL and anon key below.</div>' : ''}
    <div class="rlabel">Supabase Project URL</div>
    <input id="sbUrl" type="text" placeholder="https://xxxxxxxx.supabase.co" value="${esc(u)}">
    <div class="rlabel">Supabase anon public key</div>
    <input id="sbKey" type="text" placeholder="eyJhbGciOi… (anon public key)" value="${esc(k)}">
    <div class="race-err" id="sbErr" hidden></div>
    <div class="race-row" style="margin-top:14px">
      <button class="btn primary" id="sbSave" type="button">Connect</button>
      <button class="btn" id="sbCancel" type="button">Cancel</button>
    </div>
    <div class="race-note">Create a free project at supabase.com → Project Settings → Data API (or API) for the Project URL and the <b>anon public</b> key. Realtime is on by default; no tables needed. The anon key is a public client key — safe to put in a page. This is only needed on self-hosted copies; on claude.ai it just works.</div>`);
  $('#sbCancel').addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
  $('#sbSave').addEventListener('click', async () => {
    const url = ($('#sbUrl').value || '').trim(), key = ($('#sbKey').value || '').trim();
    const er = $('#sbErr');
    if (!/^https:\/\/.+\.supabase\.(co|in|net)/.test(url) || key.length < 20) { er.hidden = false; er.textContent = 'Enter a valid https://… .supabase.co URL and the full anon key.'; return; }
    try { localStorage.setItem('lsa-sb-url', url); localStorage.setItem('lsa-sb-key', key); } catch (e) {}
    roomCap = undefined; RACE_BACKEND = '';
    renderContent('<p class="rlead">Connecting to Supabase…</p>');
    const room = await getRoom();
    if (room) back(); else renderSupabaseSetup(true, back);
  });
}
function renderSetup() {
  let saved = ''; try { saved = localStorage.getItem('lsa-race-name') || ''; } catch (e) {}
  renderContent(`<h2>Race another admin</h2>
    <p class="rlead">Two or more players pick the same incident and race to resolve it first. Everyone opens this same page (share the link), then joins with a room code.</p>
    <div class="rlabel">Your name</div>
    <input id="rName" type="text" maxlength="18" placeholder="e.g. Sam" value="${esc(saved)}">
    <div class="rlabel">Start or join a room</div>
    <div class="race-row">
      <button class="btn primary" id="rCreate" type="button">Create a room</button>
      <span style="color:var(--muted);font-size:13px">or</span>
      <input id="rJoin" type="text" maxlength="8" placeholder="room code" style="flex:1 1 110px;min-width:90px;text-transform:uppercase">
      <button class="btn" id="rJoinBtn" type="button">Join</button>
    </div>
    <div class="race-err" id="rErr" hidden></div>
    ${RACE_BACKEND === 'supabase' ? '<div class="race-row" style="margin-top:12px"><button class="btn" id="rBoard" type="button">🏆 Leaderboard</button></div>' : ''}
    <div class="race-note">Everyone must open this same page (the same link/URL) to race together.${RACE_BACKEND === 'supabase' ? ' Connected via your Supabase project.' : ''}</div>`);
  const nameEl = $('#rName');
  const go = (create) => {
    const nm = raceSafeName(nameEl.value);
    try { localStorage.setItem('lsa-race-name', nm); } catch (e) {}
    const code = create ? raceCode() : ($('#rJoin').value || '').trim().toUpperCase();
    if (!create && !/^[A-Z0-9]{3,8}$/.test(code)) { const er = $('#rErr'); er.hidden = false; er.textContent = 'Enter the room code the other player shared (letters and numbers).'; return; }
    doJoin(code, nm, create);
  };
  $('#rCreate').addEventListener('click', () => go(true));
  $('#rJoinBtn').addEventListener('click', () => go(false));
  $('#rJoin').addEventListener('keydown', e => { if (e.key === 'Enter') go(false); });
  const lb = $('#rBoard'); if (lb) lb.addEventListener('click', () => renderLeaderboard(RACE_SCN[0].id));
  nameEl.focus();
}
async function renderLeaderboard(scnId) {
  const scn = RACE_SCN.find(s => s.id === scnId) || RACE_SCN[0];
  const tabs = RACE_SCN.map(s => `<button class="scn ${s.id === scn.id ? 'sel' : ''}" type="button" data-lb="${s.id}" style="padding:7px 10px"><span class="sn" style="font-size:13px">${esc(s.name)}</span></button>`).join('');
  renderContent(`<h2>🏆 Leaderboard</h2>
    <p class="rlead">Fastest clean resolutions, all-time. Pick a scenario.</p>
    <div class="scenarios" id="lbTabs">${tabs}</div>
    <div id="lbBody" style="margin-top:12px"><p class="rlead">Loading…</p></div>
    <div class="race-row" style="margin-top:14px"><button class="btn" id="lbBack" type="button">Back</button></div>`);
  document.querySelectorAll('#lbTabs .scn[data-lb]').forEach(b => b.addEventListener('click', () => renderLeaderboard(b.dataset.lb)));
  $('#lbBack').addEventListener('click', renderSetup);
  const rows = await fetchLeaderboard(scn.id);
  const body = $('#lbBody'); if (!body) return;
  if (rows === null) { body.innerHTML = '<p class="race-err">Couldn\'t load the leaderboard.</p>'; return; }
  if (!rows.length) { body.innerHTML = '<p class="empty">No times yet for this scenario. Be the first — race it!</p>'; return; }
  body.innerHTML = rows.map((r, i) => {
    const nm = (r.profiles && r.profiles.display_name) || 'Someone';
    return `<div class="rb-row ${i === 0 ? 'win' : ''}"><span class="rbrank">${i + 1}</span><span class="rb-name">${esc(nm)}</span><span class="rb-prog"><span class="rb-time">${fmtDur(r.finish_ms)}</span></span></div>`;
  }).join('');
}
async function doJoin(code, name, isCreator) {
  RACE.name = name; RACE.color = RACE_COLORS[Math.floor(Math.random() * RACE_COLORS.length)];
  RACE.code = code; RACE.phase = 'lobby'; RACE.ready = false;
  RACE.scnId = isCreator ? RACE_SCN[0].id : null;
  renderContent('<p class="rlead">Joining room…</p>');
  const room = await getRoom();
  try { RACE.roomObj = await room.join('lsa-' + code.toLowerCase(), isCreator); }
  catch (e) { renderContent(`<h2>Couldn't join</h2><p class="race-err">The room is unavailable (${esc(e && e.code || 'error')}). <button class="btn" id="rBack" type="button">Back</button></p>`); const bk = $('#rBack'); if (bk) bk.addEventListener('click', renderSetup); return; }
  RACE.unsubs.push(RACE.roomObj.onPeers(onPeersChange, () => {}));
  racePresence();
  renderLobby();
}
function racePresence() {
  if (!RACE.roomObj) return;
  const p = {
    name: RACE.name, color: RACE.color,
    scn: RACE.scnId || null,
    phase: RACE.phase,
    ready: RACE.ready ? true : null,
    go: (RACE.isHost && RACE.go) ? RACE.go : null,
    step: RACE.active ? Math.max(0, S.mission - RACE.startIdx) : 0,
    total: RACE.total || 0,
    finishMs: (RACE.myFinishMs != null) ? RACE.myFinishMs : null
  };
  RACE.roomObj.presence(p).catch(() => {});
}
function viewerPeers() { return RACE.peerCache.filter(p => p.kind !== 'agent'); }
function onPeersChange(change) {
  RACE.peerCache = change.peers;
  const vs = viewerPeers();
  const me = vs.find(p => p.isMe && p.sameTab);
  if (me) RACE.myPeer = me.peer;
  const ids = vs.map(p => p.peer).sort();
  RACE.hostPeer = ids[0] || '';
  RACE.isHost = !!RACE.myPeer && RACE.myPeer === RACE.hostPeer;
  const host = vs.find(p => p.peer === RACE.hostPeer);
  const hostScn = host && host.presence && host.presence.scn;
  if (!RACE.isHost && hostScn) RACE.scnId = hostScn;
  if (RACE.isHost && !RACE.scnId) { RACE.scnId = RACE_SCN[0].id; racePresence(); }
  if (RACE.phase === 'lobby') {
    const g = host && host.presence && host.presence.go;
    if (g && !RACE.goLock) { RACE.goLock = g; beginCountdown(); }
  }
  if (RACE.phase === 'lobby') renderLobby();
  renderBoard();
}
function renderLobby() {
  const vs = viewerPeers();
  const scn = RACE_SCN.find(s => s.id === RACE.scnId) || RACE_SCN[0];
  let scnHTML;
  if (RACE.isHost) {
    scnHTML = '<div class="scenarios">' + RACE_SCN.map(s =>
      `<button class="scn ${s.id === RACE.scnId ? 'sel' : ''}" type="button" data-scn="${s.id}"><span><span class="sn">${esc(s.name)}</span><span class="sd">${esc(s.desc)}</span></span><span class="sx">${s.steps} steps</span></button>`).join('') + '</div>';
  } else {
    scnHTML = `<div class="scn sel" style="cursor:default"><span><span class="sn">${esc(scn.name)}</span><span class="sd">${esc(scn.desc)}</span></span><span class="sx">${scn.steps} steps</span></div><p class="race-note" style="border:0;padding:4px 0 0">The host chooses the scenario.</p>`;
  }
  const others = vs.filter(p => !(p.isMe && p.sameTab));
  const allReady = others.length >= 1 && others.every(p => p.presence && p.presence.ready);
  const canStart = RACE.isHost && vs.length >= 2 && allReady;
  const list = vs.map(p => {
    const pr = p.presence || {};
    const you = p.isMe && p.sameTab;
    const isHost = p.peer === RACE.hostPeer;
    const rdy = you ? RACE.ready : !!pr.ready;
    return `<div class="lobby-p"><span class="pdot" style="background:${esc(pr.color || '#888')}"></span>${esc(pr.name || 'Player')}${you ? ' <span style="color:var(--amber);font-size:11px">(you)</span>' : ''}${isHost ? ' <span style="color:var(--muted);font-size:11px">· host</span>' : ''}<span class="pst ${rdy ? 'ready' : ''}">${isHost ? (rdy ? 'ready' : 'host') : (rdy ? 'ready ✓' : 'not ready')}</span></div>`;
  }).join('');
  renderContent(`<h2>Room <span class="rcode">${esc(RACE.code)}</span></h2>
    <p class="rlead">Share this code and the page link. When everyone's in and ready, the host starts the race. First to resolve the incident wins.</p>
    <div class="rlabel">Scenario</div>${scnHTML}
    <div class="rlabel">Players (${vs.length})</div>
    <div class="lobby-list">${list}</div>
    <div class="race-row" style="margin-top:14px">
      <button class="btn ${RACE.ready ? 'on' : ''}" id="rReady" type="button">${RACE.ready ? "I'm ready ✓" : "I'm ready"}</button>
      ${RACE.isHost ? `<button class="btn primary" id="rStart" type="button" ${canStart ? '' : 'disabled'}>Start race</button>` : '<span style="color:var(--muted);font-size:13px">waiting for the host to start…</span>'}
    </div>
    <div class="race-note">${vs.length < 2 ? 'Waiting for at least one more player to join…' : (RACE.isHost ? (allReady ? 'Everyone is ready — start when you like.' : 'Waiting for all players to ready up.') : 'Tap “I’m ready”, then the host starts.')}</div>`);
  if (RACE.isHost) document.querySelectorAll('#raceContent .scn[data-scn]').forEach(b => b.addEventListener('click', () => { RACE.scnId = b.dataset.scn; racePresence(); renderLobby(); }));
  const rr = $('#rReady'); if (rr) rr.addEventListener('click', () => { RACE.ready = !RACE.ready; racePresence(); renderLobby(); });
  const rs = $('#rStart'); if (rs) rs.addEventListener('click', hostStart);
}
function hostStart() {
  if (!RACE.isHost) return;
  RACE.go = Date.now(); racePresence();
  if (!RACE.goLock) { RACE.goLock = RACE.go; beginCountdown(); }
}
function beginCountdown() {
  if (RACE.phase === 'countdown' || RACE.active) return;
  RACE.phase = 'countdown';
  const scn = RACE_SCN.find(s => s.id === RACE.scnId) || RACE_SCN[0];
  raceBuildSandbox(scn);
  let n = 5; renderCountdown(n, scn);
  RACE.countTimer = setInterval(() => { n--; if (n <= 0) { clearInterval(RACE.countTimer); RACE.countTimer = null; raceBegin(); } else renderCountdown(n, scn); }, 1000);
}
function renderCountdown(n, scn) {
  renderContent(`<h2>Get ready…</h2><p class="rlead">Scenario: <b>${esc(scn.name)}</b> · ${scn.steps} steps</p><div class="count-big">${n}</div><p class="rlead" style="text-align:center">First to resolve the incident wins. Type fast.</p>`);
}
function raceBuildSandbox(scn) {
  campaignS = S;
  const startIdx = MISSIONS.findIndex(x => x.id === scn.startId);
  S = freshState(); S.sudo = true;
  S.mission = startIdx; S.done = MISSIONS.slice(0, startIdx).map(x => x.id); S.xp = 0;
  RACE.scenario = scn; RACE.startIdx = startIdx; RACE.endIdx = startIdx + scn.steps - 1; RACE.total = scn.steps;
  RACE.active = true; RACE.finished = false; RACE.myFinishMs = null;
  document.body.classList.add('racing');
  setPanelTab('mission');
  $('#raceBoard').hidden = false;
  lockTin(true);
}
function raceBegin() {
  RACE.phase = 'racing'; RACE.myStart = Date.now();
  hideOverlay();
  tout.innerHTML = '';
  emitSys('<b>Race started.</b> Resolve the incident as fast as you can — live standings are on the left. Good luck.', 'ok');
  startMission();
  lockTin(false);
  racePresence();
  if (!RACE.boardTimer) RACE.boardTimer = setInterval(renderBoard, 1000);
  updatePrompt(); render(); scrollEnd();
  tin.focus({ preventScroll: true });
}
function raceAdvance() {
  racePresence();
  if (S.mission > RACE.endIdx) { raceFinish(); }
  else { startMission(); }
}
function raceFinish() {
  RACE.finished = true; RACE.phase = 'done';
  RACE.myFinishMs = Date.now() - RACE.myStart;
  lockTin(true); racePresence();
  if (RACE.scenario && typeof saveRaceResult === 'function') saveRaceResult(RACE.scenario.id, RACE.myFinishMs);
  emitSys(`<b>✓ Incident resolved — your time ${fmtDur(RACE.myFinishMs)}.</b> See the final standings on the left. Use <b>Leave race</b> to return to your campaign.`, 'ok');
  renderBoard();
}
function raceStandings() {
  const ps = viewerPeers().filter(p => p.presence && p.presence.name);
  const done = ps.filter(p => typeof (p.presence.finishMs) === 'number').sort((a, b) => a.presence.finishMs - b.presence.finishMs);
  const live = ps.filter(p => typeof (p.presence.finishMs) !== 'number').sort((a, b) => (b.presence.step || 0) - (a.presence.step || 0));
  return { done, live, all: done.concat(live) };
}
function renderBoard() {
  const board = $('#raceBoard'); if (!board || !RACE.active) return;
  board.hidden = false;
  const st = raceStandings();
  $('#rbMeta').textContent = RACE.scenario ? RACE.scenario.name : '';
  let html = '';
  if (st.done.length) {
    const w = st.done[0].presence;
    html += `<div class="race-winner">🏆 ${esc(w.name || 'Someone')} finished first</div>`;
  }
  let rank = 0;
  html += st.all.map(p => {
    const pr = p.presence || {}; const you = p.isMe && p.sameTab;
    const isDone = typeof pr.finishMs === 'number';
    const total = pr.total || RACE.total || 1;
    const step = Math.min(total, pr.step || 0);
    rank++;
    let right;
    if (isDone) right = `<span class="rb-time">${fmtDur(pr.finishMs)}</span>`;
    else if (you && RACE.phase === 'racing') right = `<span class="rb-time">${fmtDur(Date.now() - RACE.myStart)}</span>`;
    else right = `<span class="rb-time">${step}/${total}</span>`;
    const win = isDone && rank === 1;
    return `<div class="rb-row ${isDone ? 'done' : ''} ${win ? 'win' : ''}"><span class="rbrank">${isDone ? rank : '·'}</span><span class="rb-name" style="color:${esc(pr.color || 'inherit')}">${esc(pr.name || 'Player')}${you ? '<span class="you">you</span>' : ''}</span><span class="rb-prog"><span class="rb-bar"><i style="width:${Math.round(step / total * 100)}%;background:${esc(pr.color || 'var(--green)')}"></i></span>${right}</span></div>`;
  }).join('');
  $('#rbBody').innerHTML = html || '<p class="empty">Waiting for players…</p>';
}
function exitRace() {
  RACE.unsubs.forEach(u => { try { u(); } catch (e) {} });
  if (RACE.roomObj) { try { RACE.roomObj.leave(); } catch (e) {} }
  if (RACE.countTimer) clearInterval(RACE.countTimer);
  if (RACE.boardTimer) clearInterval(RACE.boardTimer);
  const wasActive = RACE.active, hadCampaign = campaignS;
  RACE = raceReset();
  document.body.classList.remove('racing');
  $('#raceBoard').hidden = true;
  hideOverlay(); lockTin(false);
  if (wasActive && hadCampaign) {
    S = campaignS; campaignS = null; tout.innerHTML = '';
    emitSys('Left the race — back to your campaign. Your progress was untouched.', 'hint');
    if (S.finished) { announceMission(); } else { const m = MISSIONS[S.mission]; emitSys(`<span class="chap">${CHAPTERS[m.ch].label}</span>${CHAPTERS[m.ch].name}`, 'chapter'); announceMission(); }
    updatePrompt(); render(); save(); scrollEnd();
  } else { render(); }
  tin.focus({ preventScroll: true });
}
$('#btnRace').addEventListener('click', openRace);

/* ---------- Authored-mission playback (M10) ---------- */
/* Turn a stored authored mission {check_type, check_arg1, check_arg2} into a
   live check() closure over the sandbox game state. */
function authoredCheck(m) {
  const t = m.check_type, a1 = (m.check_arg1 || '').trim(), a2 = (m.check_arg2 || '');
  const absPath = p => { p = (p || '').trim(); if (p.startsWith('~')) return HOME + p.slice(1); if (p.startsWith('/')) return p; return HOME + '/' + p; };
  switch (t) {
    case 'file_exists':
      return () => !!getNode(absPath(a1));
    case 'file_contains':
      return () => { const n = getNode(absPath(a1)); return !!(n && n.type === 'file' && String(n.content || '').includes(a2)); };
    case 'file_matches': {
      let re = null; try { re = new RegExp(a2); } catch (e) { re = null; }
      return () => { if (!re) return false; const n = getNode(absPath(a1)); return !!(n && n.type === 'file' && re.test(String(n.content || ''))); };
    }
    case 'command_run':
      return () => S.cmdsM.includes(a1);
    case 'service_state': {
      const want = /^(active|running|start|up|on|enabled|true)/i.test(a2 || 'active');
      return () => { const s = S.services[a1]; return !!s && (!!s.active === want); };
    }
    case 'file_mode':
      return () => { const n = getNode(absPath(a1)); const want = parseInt(a2, 8); return !!(n && n.type === 'file' && Number.isFinite(want) && n.mode === want); };
    case 'group_not_member':
      return () => { const row = splitLines(getNode('/etc/group')?.content || '').map(line => line.split(':')).find(parts => parts[0] === a1); return !!row && !(row[3] || '').split(',').includes(a2); };
    case 'mount_state':
      return () => (S.mounts || []).some(mount => mount.mp === a1 && mount.dev === a2);
    default:
      return () => false;
  }
}
let PRACTICE = { active: false };
let practiceS = null;
/* Play one or more authored missions in an isolated sandbox. The campaign state
   is set aside and restored on exit, exactly like Race, so nothing a student
   does here touches their own progress. Completing a mission records an attempt
   (by the mission's id) so the class grade updates. */
function playAuthored(missions, label) {
  missions = (missions || []).filter(m => m && m.id && m.check_type);
  if (!missions.length) { emitSys('No playable missions in this assignment yet.', 'hint'); return; }
  if (typeof RACE !== 'undefined' && RACE.active) { emitSys('Finish or leave the race first.', 'hint'); return; }
  if (PRACTICE.active) exitPractice(true);
  hideOverlay();
  practiceS = S;
  const chIdx = CHAPTERS.length;
  CHAPTERS.push({ label: 'PRACTICE', name: label || 'Class mission', intro: '', outro: '' });
  const startIdx = MISSIONS.length;
  missions.forEach(m => MISSIONS.push({
    ch: chIdx, id: m.id, title: m.title || 'Mission',
    story: m.story || '', objective: m.objective || 'Complete the task.',
    hints: Array.isArray(m.hints) ? m.hints.slice(0, 3) : [],
    check: typeof m.check === 'function' ? m.check : authoredCheck(m),
    onStart: typeof m.onStart === 'function' ? m.onStart : undefined
  }));
  PRACTICE = { active: true, startIdx, endIdx: MISSIONS.length - 1, label: label || '' };
  S = freshState(); S.sudo = true; S.mission = startIdx;
  document.body.classList.add('practicing');
  let bar = $('#practiceBar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'practiceBar';
    bar.innerHTML = '<span id="practiceMsg"></span><button class="btn" id="practiceExit" type="button">Exit practice</button>';
    document.body.appendChild(bar);
    $('#practiceExit').addEventListener('click', () => exitPractice(false));
  }
  $('#practiceMsg').textContent = `Practice · ${label || 'class mission'} — your campaign is untouched`;
  bar.hidden = false;
  tout.innerHTML = '';
  emitSys(`<b>Practice mode.</b> ${missions.length > 1 ? missions.length + ' missions' : '1 mission'} from <b>${esc(label || 'your class')}</b>. Nothing here affects your campaign. Click <b>Exit practice</b> any time.`, 'ok');
  setPanelTab('mission');
  startMission();
  updatePrompt(); render(); scrollEnd(); tin.focus({ preventScroll: true });
}
function practiceAdvance() {
  if (S.mission > PRACTICE.endIdx) practiceFinish();
  else startMission();
}
function practiceFinish() {
  endPractice();
  emitSys('<b>✓ Practice complete.</b> Your campaign is unchanged; your class progress is saved. Open the classroom to see your updated grade.', 'ok');
}
function exitPractice() {
  endPractice();
  emitSys('Left practice — back to your campaign.', 'hint');
}
function endPractice() {
  if (!PRACTICE.active) return;
  MISSIONS.length = PRACTICE.startIdx;   // drop the synthetic missions
  CHAPTERS.pop();                        // drop the synthetic chapter
  PRACTICE = { active: false };
  if (practiceS) { S = practiceS; practiceS = null; }
  document.body.classList.remove('practicing');
  const bar = $('#practiceBar'); if (bar) bar.hidden = true;
  tout.innerHTML = '';
  if (!S.finished && MISSIONS[S.mission]) { const m = MISSIONS[S.mission]; emitSys(`<span class="chap">${CHAPTERS[m.ch].label}</span>${CHAPTERS[m.ch].name}`, 'chapter'); announceMission(); }
  updatePrompt(); render(); scrollEnd();
}
$('#raceClose').addEventListener('click', exitRace);
$('#btnRaceExit').addEventListener('click', exitRace);

/* ============================================================
   Accounts — Supabase Auth (magic link), progress sync, leaderboard
   Active only when a Supabase project is configured (self-hosted copies).
   ============================================================ */
let authUser = null;
let authReady = false;
async function authInit() {
  if (!supaConfig()) { renderAuthBtn(); return; }
  const sb = await getSB(); if (!sb) { renderAuthBtn(); return; }
  authReady = true;
  try { const { data } = await sb.auth.getSession(); applyUser(data && data.session ? data.session.user : null, true); } catch (e) {}
  try { sb.auth.onAuthStateChange((_evt, session) => applyUser(session ? session.user : null, false)); } catch (e) {}
  renderAuthBtn();
}
function userLabel(u) { return (u && (u.user_metadata && u.user_metadata.name)) || (u && u.email ? u.email.split('@')[0] : 'Account'); }
function applyUser(u, initial) {
  const prevId = authUser && authUser.id;
  authUser = u ? { id: u.id, email: u.email, name: userLabel(u) } : null;
  renderAuthBtn();
  if (authUser) hideGate();
  else if (gateNeeded()) showGate();
  if (authUser && authUser.id !== prevId) onLogin();
  else if (!authUser && prevId) emitSys('Signed out. Progress stays saved in this browser.', 'hint');
}

/* ---------- Mandatory sign-in gate ----------
   When a Supabase project is configured, the app requires sign-in before use:
   the whole UI is covered by a full-screen login page until a session exists.
   Bypassed under browser automation (navigator.webdriver) and with an explicit
   lsa-e2e flag, so the test suite and local dev run without a backend session.
   This is a UI/account gate, not content protection — the app is a static page,
   so it controls what a visitor sees first and enables cross-device progress sync. */
function gateBypassed() {
  try { if (localStorage.getItem('lsa-e2e') === '1' || localStorage.getItem('lsa-guest') === '1') return true; } catch (e) {}
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}
function gateNeeded() { return !!supaConfig() && !gateBypassed(); }
function renderGate() {
  const body = document.getElementById('authGateBody'); if (!body) return;
  let saved = ''; try { saved = localStorage.getItem('lsa-auth-email') || ''; } catch (e) {}
  const oauthBtns = OAUTH_PROVIDERS.map(p => `<button class="btn" data-oauth="${p.id}" type="button">${esc(p.label)}</button>`).join('');
  body.innerHTML = `<div class="auth-gate-brand"><span class="mark"><svg viewBox="74 88 364 364"><g fill="#f2b04b"><rect x="112" y="104" width="288" height="96" rx="24"/><rect x="112" y="212" width="288" height="96" rx="24"/></g><g fill="#0f141c"><circle cx="160" cy="152" r="15"/><circle cx="160" cy="260" r="15"/><rect x="320" y="142" width="44" height="11" rx="5.5"/><rect x="320" y="160" width="44" height="11" rx="5.5"/><rect x="320" y="250" width="44" height="11" rx="5.5"/><rect x="320" y="268" width="44" height="11" rx="5.5"/></g><path d="M150 336 L214 378 L150 420" fill="none" stroke="#f2b04b" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/><rect x="250" y="361" width="112" height="34" rx="17" fill="#f2b04b"/></svg></span><b>The Last Sysadmin</b></div>
    <h2 id="authGateTitle">Sign in to continue</h2>
    <p class="rlead">Sign in to sync campaign progress across devices, or practice locally right away as a guest.</p>
    <div class="rlabel">Email</div>
    <input id="auEmail" type="text" inputmode="email" placeholder="you@example.com" value="${esc(saved)}" autocomplete="email" aria-label="Email">
    <div class="rlabel" style="margin-top:8px">Password</div>
    <input id="auPass" type="password" placeholder="••••••••" autocomplete="current-password" aria-label="Password">
    <div class="race-err" id="auErr" hidden></div>
    <div class="race-row" style="margin-top:12px;flex-wrap:wrap">
      <button class="btn primary" id="auSignin" type="button">Sign in</button>
      <button class="btn" id="auSignup" type="button">Create account</button>
      <button class="btn" id="auLink" type="button">Email me a link</button>
    </div>
    <div class="auth-gate-sep">or continue with</div>
    <div class="auth-gate-oauth">${oauthBtns}</div>
    <div class="auth-gate-sep">or start right away</div>
    <button class="btn auth-gate-guest" id="auGuest" type="button">Continue as Guest (practice locally)</button>
    <div class="race-note">Guest progress saves automatically in this browser. You can sign in anytime via <b>⚙ Settings</b> to sync across devices.</div>`;
  body.querySelectorAll('[data-oauth]').forEach(btn => btn.addEventListener('click', () => doOAuth(btn.dataset.oauth)));
  const si = document.getElementById('auSignin'); if (si) si.addEventListener('click', () => doPasswordAuth(false));
  const su = document.getElementById('auSignup'); if (su) su.addEventListener('click', () => doPasswordAuth(true));
  const lk = document.getElementById('auLink'); if (lk) lk.addEventListener('click', doMagicLink);
  const gu = document.getElementById('auGuest'); if (gu) gu.addEventListener('click', () => {
    try { localStorage.setItem('lsa-guest', '1'); } catch (e) {}
    hideGate();
    renderAuthBtn();
    emitSys('<b>Practicing locally as Guest.</b> Progress saves in this browser; sign in anytime via <b>⚙ Settings</b>.', 'hint');
    tin.focus({ preventScroll: true });
  });
}
function showGate() {
  const g = document.getElementById('authGate'); if (!g) return;
  renderGate();
  g.hidden = false;
  const app = document.querySelector('.app'); if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
  const first = document.getElementById('auEmail'); if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
}
function hideGate() {
  const g = document.getElementById('authGate'); if (!g || g.hidden) return;
  g.hidden = true;
  const app = document.querySelector('.app'); if (app) { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
}
function renderAuthBtn() {
  const b = $('#btnSettings'); if (!b) return;
  b.textContent = authUser ? `⚙ ${loadAvatar()} ${authUser.name}` : '⚙ Settings';
  b.classList.toggle('on', !!authUser);
  b.title = authUser ? `Signed in as ${authUser.name} — themes, avatar, account` : 'Themes, avatar, and account';
}
async function onLogin() {
  try { localStorage.removeItem('lsa-guest'); } catch (e) {}
  emitSys(`<b>Signed in as ${esc(authUser.name)}.</b> Your progress now syncs to this account.`, 'ok');
  const sb = await getSB(); if (!sb) return;
  let nm = ''; try { nm = localStorage.getItem('lsa-race-name') || ''; } catch (e) {}
  try { await sb.from('profiles').upsert({ id: authUser.id, display_name: nm || authUser.name }); } catch (e) {}
  syncPull();
}
// Merge independently changed devices instead of choosing the device with the
// largest ticket count. File mtimes resolve same-path edits; directory children
// are merged recursively so work in separate parts of the simulated filesystem survives.
function syncRecordDeletion(path, node) {
  const root = norm(path, S.cwd);
  const deletedAt = new Date().toISOString();
  if (!Array.isArray(S.syncTombstones)) S.syncTombstones = [];
  const record = abs => {
    S.syncTombstones = S.syncTombstones.filter(t => t && t.path !== abs);
    S.syncTombstones.push({ path: abs, deletedAt });
  };
  const walk = (abs, current) => {
    record(abs);
    if (current && current.type === 'dir') {
      for (const [name, child] of Object.entries(current.children || {})) {
        walk(abs === '/' ? '/' + name : abs + '/' + name, child);
      }
    }
  };
  walk(root, node);
}
function syncMergeTombstones(local, remote) {
  const latest = new Map();
  [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])].forEach(item => {
    if (!item || typeof item.path !== 'string' || !item.path.startsWith('/') || typeof item.deletedAt !== 'string') return;
    const previous = latest.get(item.path);
    if (!previous || Date.parse(item.deletedAt) > Date.parse(previous.deletedAt)) latest.set(item.path, item);
  });
  return [...latest.values()];
}
function syncApplyTombstones(node, path, tombstones) {
  if (!node) return null;
  const deletion = (Array.isArray(tombstones) ? tombstones : [])
    .filter(item => item && item.path === path)
    .reduce((latest, item) => Math.max(latest, Date.parse(item.deletedAt) || 0), 0);
  if (node.type === 'dir') {
    const children = {};
    for (const [name, child] of Object.entries(node.children || {})) {
      const childPath = path === '/' ? '/' + name : path + '/' + name;
      const kept = syncApplyTombstones(child, childPath, tombstones);
      if (kept) children[name] = kept;
    }
    if (!Object.keys(children).length && deletion && deletion >= (Number(node.mtime) || 0)) return null;
    return { ...node, children };
  }
  if (deletion && deletion >= (Number(node.mtime) || 0)) return null;
  return node;
}
function syncMergeNode(local, remote) {
  if (!local) return remote ? JSON.parse(JSON.stringify(remote)) : local;
  if (!remote) return JSON.parse(JSON.stringify(local));
  if (local.type === 'dir' && remote.type === 'dir') {
    const merged = { ...local, ...remote, type: 'dir', children: {} };
    const names = new Set([...Object.keys(local.children || {}), ...Object.keys(remote.children || {})]);
    names.forEach(name => {
      const child = syncMergeNode(local.children && local.children[name], remote.children && remote.children[name]);
      if (child) merged.children[name] = child;
    });
    merged.mtime = Math.max(Number(local.mtime) || 0, Number(remote.mtime) || 0);
    return merged;
  }
  const localTime = Number(local.mtime) || 0;
  const remoteTime = Number(remote.mtime) || 0;
  return JSON.parse(JSON.stringify(remoteTime >= localTime ? remote : local));
}
function syncMergeList(local, remote, keyFn) {
  const values = new Map();
  [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])].forEach(item => {
    const key = keyFn(item);
    if (!values.has(key)) values.set(key, item);
  });
  return [...values.values()];
}
function mergeProgressStates(local, remote, remoteUpdatedAt) {
  if (!local || !local.fs) return remote && remote.fs ? JSON.parse(JSON.stringify(remote)) : local;
  if (!remote || !remote.fs) return JSON.parse(JSON.stringify(local));
  const localTime = Date.parse(local.syncUpdatedAt || '') || 0;
  const remoteTime = Date.parse(remote.syncUpdatedAt || remoteUpdatedAt || '') || 0;
  const preferred = remoteTime >= localTime ? remote : local;
  const merged = JSON.parse(JSON.stringify(preferred));
  merged.fs = syncMergeNode(local.fs, remote.fs);
  for (const key of ['done', 'learned', 'history', 'readM', 'cmdsM', 'nudged']) {
    merged[key] = syncMergeList(local[key], remote[key], item => typeof item === 'string' ? item : JSON.stringify(item));
  }
  merged.times = syncMergeList(local.times, remote.times, item => item && (item.id || item.startedAt || item.mission) ? JSON.stringify([item.id, item.startedAt, item.mission, item.ms]) : JSON.stringify(item));
  merged.hints = { ...(local.hints || {}), ...(remote.hints || {}) };
  merged.syncTombstones = syncMergeTombstones(local.syncTombstones, remote.syncTombstones);
  if (merged.syncTombstones.length) merged.fs = syncApplyTombstones(merged.fs, '/', merged.syncTombstones);
  merged.xp = Math.max(Number(local.xp) || 0, Number(remote.xp) || 0);
  merged.mission = Math.max(Number(local.mission) || 0, Number(remote.mission) || 0);
  merged.finished = !!(local.finished || remote.finished);
  merged.syncUpdatedAt = new Date(Math.max(localTime, remoteTime, Date.now())).toISOString();
  return merged;
}
async function syncPull() {
  const sb = await getSB(); if (!sb || !authUser || RACE.active) return;
  let row = null;
  try {
    const result = await sb.from('progress').select('data,updated_at').eq('user_id', authUser.id).maybeSingle();
    if (result.error) return;
    row = result.data;
  } catch (e) { return; }
  const remote = row && row.data;
  if (remote && remote.v === 1 && remote.fs) {
    const before = JSON.stringify(S);
    S = mergeProgressStates(S, remote, row.updated_at);
    try { migrate(); } catch (e) {}
    if (!getNode(S.cwd)) S.cwd = HOME;
    const changed = JSON.stringify(S) !== before;
    if (changed) reloadUI(`Merged progress across devices — ${(S.done || []).length} tickets resolved.`);
    else syncPushNow();
  } else {
    syncPushNow();
  }
}
let pushTimer = null;
function syncPushSoon() { if (!authUser || RACE.active) return; clearTimeout(pushTimer); pushTimer = setTimeout(syncPushNow, 1500); }
let syncPushInFlight = false;
let syncPushRequested = false;
async function syncPushNow() {
  const sb = await getSB(); if (!sb || !authUser || RACE.active) return;
  if (syncPushInFlight) { syncPushRequested = true; return; }
  syncPushInFlight = true;
  try {
    do {
      syncPushRequested = false;
      S.syncUpdatedAt = new Date().toISOString();
      const snapshot = JSON.parse(JSON.stringify(S));
      const beforeRequest = JSON.stringify(snapshot);
      const { data, error } = await sb.rpc('merge_progress', { p_data: snapshot });
      if (error) throw error;
      if (data && data.v === 1 && data.fs) {
        const changedDuringRequest = JSON.stringify(S) !== beforeRequest;
        S = mergeProgressStates(S, data);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
        if (changedDuringRequest) syncPushRequested = true;
      }
    } while (syncPushRequested);
  } catch (e) {
    // Keep the local copy; the next save or sign-in will retry synchronization.
  } finally {
    syncPushInFlight = false;
    if (syncPushRequested) syncPushSoon();
  }
}
function reloadUI(note) {
  tout.innerHTML = '';
  if (note) emitSys(note, 'ok');
  if (!S.finished) { const m = MISSIONS[S.mission]; emitSys(`<span class="chap">${CHAPTERS[m.ch].label}</span>${CHAPTERS[m.ch].name}`, 'chapter'); announceMission(); }
  ensureClock(); updatePrompt(); render(); save(); scrollEnd();
}
async function saveRaceResult(scn, ms) {
  const sb = await getSB(); if (!sb || !authUser) return;
  try { await sb.from('race_results').insert({ user_id: authUser.id, scenario: scn, finish_ms: Math.round(ms) }); } catch (e) {}
}
async function fetchLeaderboard(scn) {
  const sb = await getSB(); if (!sb) return null;
  try { const { data } = await sb.from('race_results').select('finish_ms,created_at,profiles(display_name)').eq('scenario', scn).order('finish_ms', { ascending: true }).limit(10); return data || []; }
  catch (e) { return null; }
}
/* auth modal (reuses the race overlay shell) */
const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'azure', label: 'Microsoft / Outlook' },
  { id: 'github', label: 'GitHub' },
  { id: 'linkedin_oidc', label: 'LinkedIn' }
];
function openAuth() {
  if (!supaConfig()) return;
  showOverlay();
  if (authUser) {
    renderContent(`<h2>Account</h2>
      <p class="rlead">Signed in as <b>${esc(authUser.email || authUser.name)}</b>. Your campaign progress and race results sync to this account across devices.</p>
      <div class="race-row"><button class="btn" id="auOut" type="button">Sign out</button><button class="btn primary" id="auClose" type="button">Done</button></div>`);
    $('#auClose').addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
    $('#auOut').addEventListener('click', async () => { const sb = await getSB(); if (sb) { try { await sb.auth.signOut(); } catch (e) {} } hideOverlay(); });
    return;
  }
  let saved = ''; try { saved = localStorage.getItem('lsa-auth-email') || ''; } catch (e) {}
  const oauthBtns = OAUTH_PROVIDERS.map(p => `<button class="btn" data-oauth="${p.id}" type="button" style="margin:0 6px 6px 0">${p.label}</button>`).join('');
  renderContent(`<h2>Sign in</h2>
    <p class="rlead">Sign in with email and password, or use a provider. Signing in syncs progress across devices.</p>
    <div class="rlabel">Email</div>
    <input id="auEmail" type="text" inputmode="email" placeholder="you@example.com" value="${esc(saved)}" autocomplete="email">
    <div class="rlabel" style="margin-top:8px">Password</div>
    <input id="auPass" type="password" placeholder="••••••••" autocomplete="current-password">
    <div class="race-err" id="auErr" hidden></div>
    <div class="race-row" style="margin-top:12px;flex-wrap:wrap">
      <button class="btn primary" id="auSignin" type="button">Sign in</button>
      <button class="btn" id="auSignup" type="button">Create account</button>
      <button class="btn" id="auLink" type="button">Email me a link</button>
    </div>
    <div class="rlabel" style="margin-top:16px">Or continue with</div>
    <div>${oauthBtns}</div>
    <div class="race-row" style="margin-top:8px"><button class="btn" id="auCancel" type="button">Cancel</button></div>
    <div class="race-note">Password sign-in works immediately. Magic link and OAuth need the matching providers enabled in your Supabase project (Authentication → Providers).</div>`);
  $('#auCancel').addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
  document.querySelectorAll('[data-oauth]').forEach(btn => btn.addEventListener('click', () => doOAuth(btn.dataset.oauth)));
  $('#auSignin').addEventListener('click', () => doPasswordAuth(false));
  $('#auSignup').addEventListener('click', () => doPasswordAuth(true));
  $('#auLink').addEventListener('click', doMagicLink);
}
async function doPasswordAuth(isSignup) {
  const email = ($('#auEmail').value || '').trim();
  const pass = $('#auPass').value || '';
  const er = $('#auErr');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { er.hidden = false; er.textContent = 'Enter a valid email address.'; return; }
  if (pass.length < 6) { er.hidden = false; er.textContent = 'Password must be at least 6 characters.'; return; }
  try { localStorage.setItem('lsa-auth-email', email); } catch (e) {}
  const sb = await getSB(); if (!sb) { er.hidden = false; er.textContent = 'Not connected to Supabase.'; return; }
  er.hidden = true;
  let error = null;
  try {
    const r = isSignup
      ? await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.href.split('#')[0] } })
      : await sb.auth.signInWithPassword({ email, password: pass });
    error = r.error;
  } catch (e) { error = e; }
  if (error) { er.hidden = false; er.textContent = error.message || 'Error'; return; }
  if (isSignup) {
    renderContent(`<h2>Account created</h2><p class="rlead">If email confirmation is on, check <b>${esc(email)}</b> for a confirm link. Otherwise you are signed in.</p><div class="race-row"><button class="btn primary" id="auOk" type="button">Done</button></div>`);
    $('#auOk').addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
  } else {
    hideOverlay();
    tin.focus({ preventScroll: true });
  }
}
async function doMagicLink() {
  const email = ($('#auEmail').value || '').trim(); const er = $('#auErr');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { er.hidden = false; er.textContent = 'Enter a valid email address.'; return; }
  try { localStorage.setItem('lsa-auth-email', email); } catch (e) {}
  const sb = await getSB(); if (!sb) { er.hidden = false; er.textContent = 'Not connected to Supabase.'; return; }
  renderContent('<p class="rlead">Sending your link…</p>');
  const redirect = location.href.split('#')[0];
  let error = null;
  try { const r = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }); error = r.error; } catch (e) { error = e; }
  if (error) { renderContent(`<h2>Couldn't send the link</h2><p class="race-err">${esc(error.message || 'Error')}.</p><p class="rlead">On Supabase's free built-in email, sign-in emails are rate-limited to a few per hour. For real sign-ups, add a custom SMTP sender in your project.</p><div class="race-row"><button class="btn" id="auBack" type="button">Back</button></div>`); const bk = $('#auBack'); if (bk) bk.addEventListener('click', openAuth); return; }
  renderContent(`<h2>Check your email</h2><p class="rlead">We sent a sign-in link to <b>${esc(email)}</b>. Open it on this device to finish signing in. You can close this.</p><div class="race-row"><button class="btn primary" id="auOk" type="button">Done</button></div>`);
  $('#auOk').addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
}
async function doOAuth(provider) {
  const sb = await getSB(); if (!sb) return;
  const redirect = location.href.split('#')[0];
  try {
    await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirect } });
  } catch (e) {
    const er = $('#auErr'); if (er) { er.hidden = false; er.textContent = e.message || 'Provider not enabled. Turn it on in Supabase → Authentication → Providers.'; }
  }
}
/* ---------- appearance themes ---------- */
const THEMES = [
  { id: '', name: 'Halcyon Dark', bg: '#0f141c', dot: '#f2b04b' },
  { id: 'amber', name: 'Amber CRT', bg: '#120d02', dot: '#ffb224' },
  { id: 'green', name: 'Green Phosphor', bg: '#02100a', dot: '#7dff9e' },
  { id: 'nord', name: 'Nord Night', bg: '#2e3440', dot: '#88c0d0' },
  { id: 'tokyo-night', name: 'Tokyo Night', bg: '#1a1b26', dot: '#7aa2f7' },
  { id: 'dracula', name: 'Dracula', bg: '#282a36', dot: '#bd93f9' },
  { id: 'catppuccin', name: 'Catppuccin Mocha', bg: '#181825', dot: '#cba6f7' },
  { id: 'gruvbox', name: 'Gruvbox', bg: '#282828', dot: '#fabd2f' },
  { id: 'solarized', name: 'Solarized Dark', bg: '#002b36', dot: '#b58900' },
  { id: 'rose-pine', name: 'Rosé Pine', bg: '#191724', dot: '#ebbcba' },
  { id: 'latte', name: 'Catppuccin Latte', bg: '#eff1f5', dot: '#8839ef' },
  { id: 'solarized-light', name: 'Solarized Light', bg: '#fdf6e3', dot: '#b58900' }
];
function currentTheme() { try { return localStorage.getItem('lsa-theme') || ''; } catch (e) { return ''; } }
function applyTheme(id) {
  if (id) document.documentElement.setAttribute('data-theme', id);
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('lsa-theme', id); } catch (e) {}
}
/* ---------- ⚙ Settings panel (theme + avatar + account) ---------- */
function openSettings() {
  showOverlay();
  const cur = currentTheme();
  const themeRows = THEMES.map(t => `<button class="tm-row ${t.id === cur ? 'sel' : ''}" type="button" data-th="${t.id}"><span class="tm-sw" style="background:${t.bg}"><i style="background:${t.dot}"></i></span>${esc(t.name)}${t.id === cur ? '<span class="tm-check">✓</span>' : ''}</button>`).join('');
  const av = loadAvatar();
  const avGrid = '<div class="set-avgrid">' + AVATARS.map(a => `<button class="avatar-opt ${a === av ? 'sel' : ''}" type="button" data-av="${a}" aria-label="Avatar ${a}">${a}</button>`).join('') + '</div>';
  let account;
  if (!supaConfig()) account = `<p class="rlead" style="margin:0 0 9px">Sign-in, cross-device progress sync, and the leaderboard need a free <b>Supabase</b> project. This is a self-hosted feature (not on the claude.ai version).</p><button class="btn" id="setConnect" type="button">Connect Supabase</button>`;
  else if (authUser) account = `<p class="rlead" style="margin:0 0 9px">Signed in as <b>${esc(authUser.email || authUser.name)}</b>. Your progress and race results sync to this account across devices.</p><button class="btn" id="setOut" type="button">Sign out</button>`;
  else account = `<p class="rlead" style="margin:0 0 9px">Sign in with a one-time email link (no password) to sync progress across devices and record your race times.</p><div class="race-row"><button class="btn primary" id="setSignin" type="button">Sign in</button><button class="btn" id="setReconnect" type="button">Supabase settings</button></div>`;
  const classroom = authUser
    ? `<div class="rlabel">Classroom</div><p class="rlead" style="margin:0 0 9px">Join a class with a code, or create one to teach.</p><button class="btn" id="setClassroom" type="button">Open classroom</button>`
    : '';
  renderContent(`<h2>Settings</h2>
    <div class="rlabel">Theme</div>
    <div id="setThemes" style="display:flex;flex-direction:column;gap:6px">${themeRows}</div>
    <div class="rlabel">Your avatar</div>
    ${avGrid}
    <div class="rlabel">Account</div>
    <div>${account}</div>
    ${classroom}
    <div class="race-row" style="margin-top:16px"><button class="btn primary" id="setDone" type="button">Done</button></div>`);
  document.querySelectorAll('#setThemes .tm-row').forEach(b => b.addEventListener('click', () => { applyTheme(b.dataset.th); openSettings(); }));
  document.querySelectorAll('#raceContent .avatar-opt[data-av]').forEach(bn => bn.addEventListener('click', () => { saveAvatar(bn.dataset.av); document.querySelectorAll('#raceContent .avatar-opt').forEach(x => x.classList.toggle('sel', x === bn)); }));
  const done = $('#setDone'); if (done) done.addEventListener('click', () => { hideOverlay(); tin.focus({ preventScroll: true }); });
  const conn = $('#setConnect'); if (conn) conn.addEventListener('click', () => renderSupabaseSetup(false, openSettings));
  const rec = $('#setReconnect'); if (rec) rec.addEventListener('click', () => renderSupabaseSetup(false, openSettings));
  const si = $('#setSignin'); if (si) si.addEventListener('click', openAuth);
  const out = $('#setOut'); if (out) out.addEventListener('click', async () => { const sb = await getSB(); if (sb) { try { await sb.auth.signOut(); } catch (e) {} } openSettings(); });
  const cr = $('#setClassroom'); if (cr) cr.addEventListener('click', openClassroom);
}
$('#btnSettings').addEventListener('click', openSettings);
function openAbout() {
  showOverlay();
  renderContent(`<h2>About The Last Sysadmin</h2>
    <p class="rlead">The Last Sysadmin is a browser-based learning platform for practical Linux and network administration.</p>
    <p class="rlead">Learn through guided missions, simulated terminals, troubleshooting labs, incident workflows, and evidence-led practice. It is designed to help learners build practical skills step by step, from foundational commands to operational problem-solving.</p>
    <p class="rlead">All commands and network activity run in an isolated browser simulation. The platform does not connect to your computer, real servers, or physical network devices.</p>
    <div class="rlabel">Application version</div><p class="rlead"><strong>Version ${esc(APP_VERSION)} · build ${esc(APP_BUILD)}</strong></p>
    <div class="race-row" style="margin-top:16px"><button class="btn primary" id="aboutDone" type="button">Done</button></div>`);
  $('#aboutDone')?.addEventListener('click', hideOverlay);
}
$('#btnAbout').addEventListener('click', openAbout);

/* ---------- Classroom (M2: create class + join by code + enrollment) ---------- */
async function cxLoad() {
  const sb = await getSB(); if (!sb || !authUser) return null;
  const out = { isTeacher: false, enrolled: [], owned: [] };
  try {
    const { data: prof } = await sb.from('profiles').select('is_teacher').eq('id', authUser.id).maybeSingle();
    out.isTeacher = !!(prof && prof.is_teacher);
  } catch (e) {}
  try {
    const { data } = await sb.from('enrollments').select('role,class_id,classes(name,term,join_code)').eq('user_id', authUser.id);
    out.enrolled = data || [];
  } catch (e) {}
  if (out.isTeacher) {
    try {
      const { data } = await sb.from('classes').select('id,name,term,join_code,created_at').eq('owner_id', authUser.id).order('created_at', { ascending: false });
      out.owned = data || [];
    } catch (e) {}
  }
  return out;
}
async function loadFeedback(classId, studentId) {
  const sb = await getSB(); if (!sb) return [];
  try {
    let q = sb.from('feedback').select('id, body, created_at, author_id, student_id, assignment_id, mission_id, profiles!feedback_author_id_fkey(display_name)').eq('class_id', classId);
    if (studentId) q = q.eq('student_id', studentId);
    const { data, error } = await q.order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}
async function addFeedback(classId, studentId, body, assignmentId, missionId) {
  const sb = await getSB(); if (!sb) return { error: { message: 'Not connected' } };
  return sb.from('feedback').insert({
    class_id: classId, student_id: studentId, author_id: authUser.id,
    assignment_id: assignmentId || null, mission_id: missionId || null, body: body.trim()
  });
}
async function loadLearnerReflections(classId, userId) {
  const sb = await getSB(); if (!sb) return [];
  try {
    let q = sb.from('learner_reflections')
      .select('id, user_id, assignment_id, mission_id, learned, approach, evidence, next_step, created_at')
      .eq('class_id', classId);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q.order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}
async function saveLearnerReflection(classId, values, reflectionId) {
  const sb = await getSB(); if (!sb) return { error: { message: 'Not connected' } };
  const payload = {
    class_id: classId, user_id: authUser.id,
    assignment_id: values.assignmentId || null, mission_id: values.missionId || null,
    learned: values.learned.trim(), approach: values.approach.trim(),
    evidence: values.evidence.trim(), next_step: values.nextStep.trim(),
    updated_at: new Date().toISOString()
  };
  return reflectionId
    ? sb.from('learner_reflections').update(payload).eq('id', reflectionId).eq('user_id', authUser.id)
    : sb.from('learner_reflections').insert(payload);
}
async function loadMyScenarios() {
  const sb = await getSB(); if (!sb || !authUser) return [];
  try {
    const { data, error } = await sb.from('scenarios').select('id, title, mission_ids, created_at').eq('author_id', authUser.id).order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}
async function createScenario(title, missionIds) {
  const sb = await getSB(); if (!sb) return { error: { message: 'Not connected' } };
  return sb.from('scenarios').insert({ title: title.trim(), mission_ids: missionIds, author_id: authUser.id });
}
async function loadMyMissions() {
  const sb = await getSB(); if (!sb || !authUser) return [];
  try {
    const { data, error } = await sb.from('authored_missions').select('id, title, check_type, created_at').eq('author_id', authUser.id).order('created_at', { ascending: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}
async function createMission(m) {
  const sb = await getSB(); if (!sb) return { error: { message: 'Not connected' } };
  return sb.from('authored_missions').insert({ ...m, author_id: authUser.id });
}
async function loadAssignments(classId) {
  const sb = await getSB(); if (!sb || !authUser) return [];
  try {
    const { data, error } = await sb.from('assignments')
      .select('id, title, mission_ids, due_at')
      .eq('class_id', classId)
      .order('due_at', { ascending: true, nullsFirst: false });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}
async function createAssignment(classId, title, missionIds, dueAt) {
  const sb = await getSB(); if (!sb) return { error: { message: 'Not connected' } };
  return sb.from('assignments').insert({
    class_id: classId,
    title: title.trim(),
    mission_ids: missionIds,
    due_at: dueAt || null
  });
}
async function openClassroom() {
  if (!authUser) { openSettings(); return; }
  showOverlay();
  renderContent('<h2>Classroom</h2><p class="rlead">Loading…</p>');
  const d = await cxLoad();
  if (!d) {
    renderContent('<h2>Classroom</h2><p class="race-err">Couldn\'t reach your account. Try again.</p><div class="race-row"><button class="btn" id="cxBack" type="button">Back</button></div>');
    const b = $('#cxBack'); if (b) b.addEventListener('click', openSettings); return;
  }
  const enrolledHtml = d.enrolled.length
    ? d.enrolled.map(e => { const c = e.classes || {}; return `<div class="cx-item"><div><b>${esc(c.name || 'Class')}</b>${c.term ? ` <span class="cx-dim">· ${esc(c.term)}</span>` : ''}${e.role === 'ta' ? ' <span class="cx-badge">TA</span>' : ''}</div></div>`; }).join('')
    : '<p class="cx-dim">You haven\'t joined any classes yet.</p>';
  let studentDash = '';
  if (d.enrolled.length) {
    const sb = await getSB();
    let myAttempts = [];
    try {
      const { data } = await sb.from('attempts').select('mission_id, passed').eq('user_id', authUser.id);
      myAttempts = data || [];
    } catch (e) {}
    const passedSet = new Set(myAttempts.filter(a => a.passed).map(a => a.mission_id));
    studentDash = `<div class="rlabel" style="margin-top:8px">My dashboard</div>`;
    window._cxPlay = window._cxPlay || {};
    for (const e of d.enrolled) {
      const cname = e.classes?.name || 'Class';
      const asns = await loadAssignments(e.class_id);
      const fbs = await loadFeedback(e.class_id, authUser.id);
      const reflections = await loadLearnerReflections(e.class_id, authUser.id);
      // authored missions assigned to this class, delivered via the server function
      let classMissions = [];
      try { const { data } = await sb.rpc('get_class_missions', { p_class_id: e.class_id }); classMissions = data || []; } catch (_) {}
      window._cxPlay[e.class_id] = classMissions;
      const playBtn = classMissions.length
        ? `<button class="btn sm primary" data-playclass="${esc(e.class_id)}" data-cname="${esc(cname)}" type="button">▶ Play ${classMissions.length} custom mission${classMissions.length > 1 ? 's' : ''}</button>`
        : '';
      let asnHtml = '';
      if (asns.length) {
        asnHtml = asns.map(a => {
          const mids = a.mission_ids || [];
          const done = mids.filter(id => passedSet.has(id)).length;
          const grade = mids.length ? Math.round(done / mids.length * 100) : 0;
          const due = a.due_at ? new Date(a.due_at).toLocaleString() : 'No due date';
          const cert = grade === 100 ? `<button class="btn sm" data-cert="${esc(a.title)}" data-class="${esc(cname)}" type="button">Certificate</button>` : '';
          return `<div class="cx-item"><div><b>${esc(a.title)}</b><br><span class="cx-dim">${due} · ${done}/${mids.length} · ${grade}%</span></div><div style="display:flex;gap:6px"><button class="btn sm" data-open="${esc(mids[0]||'')}">Open</button>${cert}</div></div>`;
        }).join('');
      } else {
        asnHtml = '<p class="cx-dim">No assignments yet.</p>';
      }
      let fbHtml = fbs.length
        ? fbs.map(f => {
            const linkedAssignment = asns.find(a => a.id === f.assignment_id);
            const context = [linkedAssignment ? 'Assignment: ' + linkedAssignment.title : '', f.mission_id ? 'Mission: ' + f.mission_id : ''].filter(Boolean).join(' · ');
            return `<div class="cx-item"><div><b>${esc(f.profiles?.display_name || 'Teacher')}</b> <span class="cx-dim">· ${new Date(f.created_at).toLocaleString()}</span>${context ? `<div class="cx-dim" style="margin:3px 0">${esc(context)}</div>` : ''}<div>${esc(f.body)}</div></div></div>`;
          }).join('')
        : '<p class="cx-dim">No feedback yet.</p>';
      const reflectionContext = reflections.length
        ? reflections.map(r => {
            const assignment = asns.find(a => a.id === r.assignment_id);
            const context = [assignment ? assignment.title : '', r.mission_id || ''].filter(Boolean).join(' · ');
            return `<article class="cx-reflection"><div class="cx-reflection-meta">${new Date(r.created_at).toLocaleString()}${context ? ' · '+esc(context) : ''}</div>
              <strong>What I learned</strong><p>${esc(r.learned)}</p>
              <strong>How I approached it</strong><p>${esc(r.approach)}</p>
              ${r.evidence ? '<strong>Evidence I observed</strong><p>'+esc(r.evidence)+'</p>' : ''}
              ${r.next_step ? '<strong>What I will try next</strong><p>'+esc(r.next_step)+'</p>' : ''}
            </article>`;
          }).join('')
        : '<p class="cx-dim">No reflections saved yet. Your first note can capture what you learned from a task.</p>';
      const reflectionId = 'lr-' + String(e.class_id).replace(/[^a-zA-Z0-9_-]/g, '');
      const reflectionMissions = asns.flatMap(a => (a.mission_ids || []).map(id => ({ id, assignment: a.id })));
      const reflectionForm = `<form class="cx-reflection-form" data-reflection-form="${esc(e.class_id)}">
        <label for="${reflectionId}-assignment">Assignment (optional)</label>
        <select id="${reflectionId}-assignment" data-reflection-assignment>
          <option value="">General class reflection</option>${asns.map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}
        </select>
        <label for="${reflectionId}-mission">Mission (optional)</label>
        <select id="${reflectionId}-mission" data-reflection-mission disabled>
          <option value="">Choose an assignment first</option>${reflectionMissions.map(m => `<option value="${esc(m.id)}" data-assignment="${esc(m.assignment)}">${esc(m.id)}</option>`).join('')}
        </select>
        <label for="${reflectionId}-learned">What did I learn? <span aria-hidden="true">*</span></label>
        <textarea id="${reflectionId}-learned" data-reflection-learned maxlength="1200" required placeholder="Describe the concept or skill you understand better now…"></textarea>
        <label for="${reflectionId}-approach">How did I approach the task? <span aria-hidden="true">*</span></label>
        <textarea id="${reflectionId}-approach" data-reflection-approach maxlength="1200" required placeholder="Describe the steps you tried, including what changed after a mistake…"></textarea>
        <label for="${reflectionId}-evidence">What evidence did I observe?</label>
        <textarea id="${reflectionId}-evidence" data-reflection-evidence maxlength="1600" placeholder="Summarise relevant output or the final state. Do not include passwords, tokens or private data."></textarea>
        <label for="${reflectionId}-next">What will I try next?</label>
        <textarea id="${reflectionId}-next" data-reflection-next maxlength="800" placeholder="Name one useful next step…"></textarea>
        <button class="btn primary" type="button" data-reflection-save="${esc(e.class_id)}">Save reflection</button>
        <p class="cx-dim" data-reflection-status aria-live="polite">Your reflection is visible to you and staff of this class. It is learner-reported evidence, not a verified grade.</p>
      </form>`;
      studentDash += `<div style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><span style="font-weight:600">${esc(cname)}${e.role==='ta'?' <span class="cx-badge">TA</span>':''}</span>${playBtn}</div>
        <div class="rlabel">Assignments</div>${asnHtml}
        <div class="rlabel" style="margin-top:8px">Feedback</div>${fbHtml}
        <div class="rlabel" style="margin-top:12px">My reflections &amp; evidence</div>${reflectionContext}${e.role==='student'?reflectionForm:'<p class="cx-dim">Reflection entries are available to enrolled learners.</p>'}
      </div>`;
    }
  }
  let teach;
  if (d.isTeacher) {
    const ownedHtml = d.owned.length
      ? d.owned.map(c => `<div class="cx-item"><div><b>${esc(c.name)}</b>${c.term ? ` <span class="cx-dim">· ${esc(c.term)}</span>` : ''}</div><code class="cx-code" data-code="${esc(c.join_code)}" title="Click to copy join code">${esc(c.join_code)}</code></div>`).join('')
      : '<p class="cx-dim">No classes yet — create one below.</p>';
    let assignHtml = '';
    if (d.owned.length) {
      const cid = d.owned[0].id;
      const asns = await loadAssignments(cid);
      assignHtml = `<div class="rlabel" style="margin-top:14px">Assignments</div>` +
        (asns.length
          ? asns.map(a => `<div class="cx-item"><div><b>${esc(a.title)}</b><br><span class="cx-dim">${a.due_at ? new Date(a.due_at).toLocaleString() : 'No due date'} · ${(a.mission_ids||[]).length} missions</span></div></div>`).join('')
          : '<p class="cx-dim">No assignments yet.</p>') +
        `<div class="cx-form" style="margin-top:8px">
           <input id="asTitle" type="text" placeholder="Assignment title">
           <input id="asDue" type="datetime-local">
           <input id="asMissions" type="text" placeholder="Mission ids, comma-separated (e.g. 1-1,1-2)">
           <button class="btn primary" id="asCreate" type="button">Assign</button>
         </div>`;
      const myM = await loadMyMissions();
      assignHtml += `<div class="rlabel" style="margin-top:14px">Mission editor</div>
        <p class="cx-dim" style="margin:0 0 6px">Author a mission, then use its id (or a scenario's) in an assignment. Students play it from <b>My dashboard → ▶ Play custom missions</b>. Tip: checks that need a file to already exist work best as <i>file exists</i> / <i>command was run</i> / <i>service state</i> — the sandbox starts from the standard server, so your mission can't pre-create files.</p>` +
        (myM.length ? myM.map(m => `<div class="cx-item"><div><b>${esc(m.title)}</b> <span class="cx-dim">· ${esc(m.check_type)}</span><br><code class="cx-dim">${esc(m.id)}</code></div></div>`).join('') : '<p class="cx-dim">No authored missions yet.</p>') +
        `<div class="cx-form" style="margin-top:8px;flex-direction:column;align-items:stretch;gap:6px">
           <input id="mTitle" type="text" placeholder="Title">
           <input id="mStory" type="text" placeholder="Story">
           <input id="mObj" type="text" placeholder="Objective">
           <input id="mHints" type="text" placeholder="Hints, comma-separated (up to 3)">
           <select id="mCheck" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px">
             <option value="file_exists">File exists</option>
             <option value="file_contains">File contains text</option>
             <option value="file_matches">File matches regex</option>
             <option value="command_run">Command was run</option>
             <option value="service_state">Service state</option>
           </select>
           <input id="mArg1" type="text" placeholder="Arg 1 (path, command, or service)">
           <input id="mArg2" type="text" placeholder="Arg 2 (text, regex, or state) — optional">
           <button class="btn primary" id="mCreate" type="button">Save mission</button>
         </div>`;
      const scns = await loadMyScenarios();
      assignHtml += `<div class="rlabel" style="margin-top:14px">Scenarios</div>
        <p class="cx-dim" style="margin:0 0 6px">Group authored missions into a scenario, then paste its id into an assignment.</p>` +
        (scns.length ? scns.map(s => `<div class="cx-item"><div><b>${esc(s.title)}</b> <span class="cx-dim">· ${(s.mission_ids||[]).length} missions</span><br><code class="cx-dim">${esc(s.id)}</code></div></div>`).join('') : '<p class="cx-dim">No scenarios yet.</p>') +
        `<div class="cx-form" style="margin-top:8px;flex-direction:column;align-items:stretch;gap:6px">
           <input id="scTitle" type="text" placeholder="Scenario title">
           <input id="scMissions" type="text" placeholder="Mission ids, comma-separated">
           <button class="btn primary" id="scCreate" type="button">Save scenario</button>
         </div>`;
    }
    let dashHtml = '';
    if (d.owned.length) {
      const cid = d.owned[0].id;
      const asns = await loadAssignments(cid);
      const assigned = new Set();
      asns.forEach(a => (a.mission_ids||[]).forEach(id => assigned.add(id)));
      const total = assigned.size || 0;
      try {
        const { data: ens } = await (await getSB()).from('enrollments')
          .select('user_id, role, profiles(display_name, avatar)')
          .eq('class_id', cid);
        const roster = ens || [];
        if (roster.length) {
          const ids = roster.map(e => e.user_id);
          const { data: atts } = await (await getSB()).from('attempts')
            .select('user_id, mission_id, passed, hints, updated_at')
            .in('user_id', ids);
          const byUser = {};
          const lastAt = {};
          const highHints = {};
          (atts||[]).forEach(a => {
            if (a.passed) (byUser[a.user_id] = byUser[a.user_id] || new Set()).add(a.mission_id);
            const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            if (t > (lastAt[a.user_id]||0)) lastAt[a.user_id] = t;
            if ((a.hints||0) >= 3) highHints[a.user_id] = true;
          });
          const now = Date.now();
          const rows = roster.map(e => {
            const name = e.profiles?.display_name || 'User';
            const av = e.profiles?.avatar || '';
            const passed = total ? [...(byUser[e.user_id]||[])].filter(id => assigned.has(id)).length : (byUser[e.user_id]?.size||0);
            const grade = total ? Math.round(passed / total * 100) : 0;
            const stale = !lastAt[e.user_id] || (now - lastAt[e.user_id] > 7*864e5);
            const stuck = highHints[e.user_id] || (stale && passed < total);
            return { e, name, av, passed, grade, stuck, last: lastAt[e.user_id] };
          });
          window._cxRows = rows; window._cxClass = d.owned[0].name; window._cxTotal = total;
          // Cohort analytics: per-mission pass rate and hint use
          const missionStats = {};
          (atts||[]).forEach(a => {
            if (!assigned.size || assigned.has(a.mission_id)) {
              const s = missionStats[a.mission_id] = missionStats[a.mission_id] || { tries: 0, passed: 0, hints: 0 };
              s.tries++; if (a.passed) s.passed++; s.hints += (a.hints||0);
            }
          });
          const hardest = Object.entries(missionStats)
            .map(([id, s]) => ({ id, rate: s.tries ? s.passed/s.tries : 0, hints: s.hints, tries: s.tries }))
            .sort((a,b) => a.rate - b.rate || b.hints - a.hints)
            .slice(0, 5);
          const analyticsHtml = hardest.length
            ? `<div class="rlabel" style="margin-top:14px">Where the class is stuck</div>
               <div style="font-size:13px;border:1px solid var(--line);border-radius:8px;overflow:hidden">
               <div style="display:grid;grid-template-columns:1fr 80px 70px;gap:6px;padding:6px 10px;background:var(--raise);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)"><span>Mission</span><span>Pass rate</span><span>Hints</span></div>` +
               hardest.map(h => `<div style="display:grid;grid-template-columns:1fr 80px 70px;gap:6px;padding:8px 10px;border-top:1px solid var(--line)"><span><code>${esc(h.id)}</code></span><span>${Math.round(h.rate*100)}%</span><span>${h.hints}</span></div>`).join('') +
               '</div>'
            : '';
          // Skill diagnostics use only assignment-scoped learner outcome records.
          // Mission IDs are mapped to authored Linux chapters or recognizable network labs;
          // unknown custom IDs remain explicitly unclassified rather than guessed.
          const skillEvidence = {};
          (atts||[]).forEach(a => {
            if (assigned.size && !assigned.has(a.mission_id)) return;
            const id = String(a.mission_id || '');
            const chapterMatch = id.match(/^(\d+)-/);
            const networkMatch = /^(?:net|network|nt|protocol|topology|vlan|routing|switching|dhcp|dns)[-_:]/i.test(id);
            const chapter = chapterMatch ? CHAPTERS[Number(chapterMatch[1]) - 1] : null;
            const key = chapter ? 'linux:' + chapterMatch[1] : networkMatch ? 'network' : 'custom:' + id;
            const area = chapter ? chapter.topic : networkMatch ? 'Network operations' : 'Custom mission';
            const title = chapter ? chapter.name : networkMatch ? 'Network practice' : id || 'Unidentified mission';
            const group = skillEvidence[key] = skillEvidence[key] || { area, title, records: 0, passed: 0, hints: 0, learners: new Set(), missions: {} };
            group.records++;
            if (a.passed) group.passed++;
            group.hints += Number(a.hints) || 0;
            if (a.user_id) group.learners.add(a.user_id);
            const mission = group.missions[id] = group.missions[id] || { records: 0, passed: 0, hints: 0 };
            mission.records++;
            if (a.passed) mission.passed++;
            mission.hints += Number(a.hints) || 0;
          });
          const skillGaps = Object.entries(skillEvidence).map(([key, s]) => {
            const rate = s.records ? s.passed / s.records : 0;
            const focus = Object.entries(s.missions).filter(([, m]) => m.passed < m.records || m.hints > 0)
              .sort((a,b) => (a[1].passed / a[1].records) - (b[1].passed / b[1].records) || b[1].hints - a[1].hints)
              .map(([id]) => id);
            return { key, ...s, rate, focus };
          }).filter(s => s.records >= 2 && (s.rate < 0.7 || s.hints >= s.records * 1.5))
            .sort((a,b) => a.rate - b.rate || (b.hints / b.records) - (a.hints / a.records));
          const skillDiagnosticsHtml = '<div class="rlabel" style="margin-top:14px">Skill diagnostics</div>' +
            '<p class="cx-dim" style="margin:0 0 7px">Formative signals from recorded assignment outcomes, not grades or verified production experience. A skill is flagged only after at least two learner-outcome records.</p>' +
            (skillGaps.length
              ? skillGaps.slice(0, 6).map(s => {
                  const recommendation = s.focus.length ? 'Revisit mission ' + s.focus.slice(0, 3).join(', ') : 'Review this skill area with a guided exercise';
                  return '<div class="cx-skill-diagnostic" style="border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin:7px 0;background:var(--panel)">' +
                    '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>' + esc(s.area) + '</strong><strong>' + Math.round(s.rate * 100) + '% passed</strong></div>' +
                    '<div class="cx-dim">' + esc(s.title) + ' · ' + s.records + ' recorded outcomes · ' + s.passed + '/' + s.records + ' passed · ' + s.hints + ' hints · ' + s.learners.size + ' learners</div>' +
                    '<div style="font-size:12px;margin-top:5px"><b>Targeted practice:</b> ' + esc(recommendation) + '</div></div>';
                }).join('')
              : '<p class="cx-dim" style="margin:0">No skill gap is supported by enough current evidence. Keep collecting assignment outcomes; fewer than two records is shown as insufficient evidence, not as mastery.</p>');
          // Assignment-level mastery is calculated from the same authorized
          // roster and attempt evidence already loaded for this class.
          // Percentages always show their learner/mission denominator.
          const assignmentInsightHtml = asns.length
            ? `<div class="rlabel" style="margin-top:14px">Assignment mastery</div>` +
              asns.map(a => {
                const mids = Array.isArray(a.mission_ids) ? [...new Set(a.mission_ids)] : [];
                const learners = roster.filter(e => e.role === 'student');
                const scores = learners.map(e => {
                  const passed = mids.filter(id => byUser[e.user_id] && byUser[e.user_id].has(id)).length;
                  return { name: e.profiles?.display_name || 'User', passed, total: mids.length, percent: mids.length ? Math.round(passed / mids.length * 100) : 0 };
                });
                const pairs = learners.length * mids.length;
                const earned = scores.reduce((sum, score) => sum + score.passed, 0);
                const average = pairs ? Math.round(earned / pairs * 100) : null;
                const complete = scores.filter(score => score.total > 0 && score.passed === score.total).length;
                const due = a.due_at ? new Date(a.due_at).toLocaleDateString() : 'No due date';
                const summary = !mids.length ? 'No missions assigned' : !learners.length ? 'No students enrolled' : `${average}% cohort progress · ${complete}/${learners.length} complete`;
                const detail = !mids.length
                  ? '<p class="cx-dim">Add mission IDs to this assignment to measure mastery.</p>'
                  : !learners.length
                    ? '<p class="cx-dim">Student-level progress will appear when learners join the class.</p>'
                    : `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:6px">` +
                      scores.map(score => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 90px 58px;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--line)"><span>${esc(score.name)}</span><span>${score.passed}/${score.total} missions</span><strong style="text-align:right">${score.percent}%</strong></div>`).join('') +
                      '</div>';
                return `<details class="cx-assignment-insight" style="border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin:7px 0;background:var(--panel)">
                  <summary style="display:flex;justify-content:space-between;gap:10px;align-items:center;cursor:pointer;flex-wrap:wrap"><span><strong>${esc(a.title)}</strong> <small class="cx-dim">· ${mids.length} mission${mids.length===1?'':'s'} · ${due}</small></span><span class="cx-dim">${summary}</span></summary>
                  ${detail}
                </details>`;
              }).join('')
            : '';
          const classReflections = await loadLearnerReflections(cid);
          // Cohort pulse uses only enrolled student rows and assignment-scoped attempt evidence.
          // Missing attempts/reflections are reported as missing evidence, never as zero mastery.
          const cohortStudents = roster.filter(member => member.role === 'student');
          const cohortStudentIds = new Set(cohortStudents.map(member => member.user_id));
          // Read only this class's assigned mission evidence; RLS independently enforces staff access.
          let cohortEvidence = [];
          if (assigned.size) {
            try {
              const { data: evidenceRows, error: evidenceError } = await (await getSB()).from('learning_evidence')
                .select('user_id, mission_id, event_type, created_at')
                .eq('class_id', cid).in('mission_id', [...assigned])
                .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
                .order('created_at', { ascending: false });
              if (!evidenceError) cohortEvidence = (evidenceRows || []).filter(event =>
                cohortStudentIds.has(event.user_id) && assigned.has(event.mission_id));
            } catch (e) { cohortEvidence = []; }
          }
          const evidenceNow = Date.now();
          const recentEvidence = cohortEvidence.filter(event => {
            const at = new Date(event.created_at).getTime();
            return Number.isFinite(at) && at >= evidenceNow - 14 * 864e5;
          });
          const previousEvidence = cohortEvidence.filter(event => {
            const at = new Date(event.created_at).getTime();
            return Number.isFinite(at) && at >= evidenceNow - 28 * 864e5 && at < evidenceNow - 14 * 864e5;
          });
          const eventCount = (events, type) => events.filter(event => event.event_type === type).length;
          const recentCompletions = eventCount(recentEvidence, 'mission_completed');
          const previousCompletions = eventCount(previousEvidence, 'mission_completed');
          const recentHints = eventCount(recentEvidence, 'hint_requested');
          const previousHints = eventCount(previousEvidence, 'hint_requested');
          const hintHotspots = Object.entries(cohortEvidence.reduce((groups, event) => {
            if (event.event_type !== 'hint_requested') return groups;
            const group = groups[event.mission_id] = groups[event.mission_id] || { requests: 0, learners: new Set() };
            group.requests++;
            group.learners.add(event.user_id);
            return groups;
          }, {})).map(([missionId, stats]) => ({ missionId, ...stats }))
            .filter(item => item.requests >= 2)
            .sort((a, b) => b.requests - a.requests || b.learners.size - a.learners.size)
            .slice(0, 4);
          const learnerEvidenceHtml = '<div class="rlabel" style="margin-top:14px">Learner activity review · last 30 days</div>' +
            '<p class="cx-dim" style="margin:0 0 7px">Recorded events for enrolled learners and assigned missions only. Expand a learner to review recent activity; missing events are not evidence of missing learning.</p>' +
            '<div class="cx-learner-evidence-review" data-learner-evidence-review>' +
            (cohortStudents.length ? cohortStudents.map(learner => {
              const events = cohortEvidence.filter(event => event.user_id === learner.user_id)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              const learnerName = learner.profiles?.display_name || 'Learner';
              const rows = events.slice(0, 6).map(event => {
                const label = event.event_type === 'hint_requested' ? 'Hint requested' : 'Mission completed';
                const when = new Date(event.created_at);
                return '<div class="cx-learner-event"><span>' + label + ' · <code>' + esc(event.mission_id) + '</code></span><time>' + (Number.isFinite(when.getTime()) ? esc(when.toLocaleString()) : 'Date unavailable') + '</time></div>';
              }).join('');
              return '<details class="cx-learner-evidence"><summary><strong>' + esc(learnerName) + '</strong><span class="cx-dim">' + events.length + ' recorded event' + (events.length === 1 ? '' : 's') + '</span></summary>' +
                (rows || '<p class="cx-dim" style="margin:8px 0 0">No activity events recorded in this period.</p>') + '</details>';
            }).join('') : '<p class="cx-dim">No enrolled learners in this class.</p>') +
            '</div>';
          const cohortTrendHtml = '<div class="rlabel" style="margin-top:14px">Learning activity · last 14 days</div>' +
            '<p class="cx-dim" style="margin:0 0 7px">Compared with the previous 14 days. Counts reflect recorded events only, not total practice or learning.</p>' +
            '<div class="cx-cohort-trends" data-cohort-trends><div class="cx-cohort-trend-grid">' +
              '<div class="cx-cohort-trend" data-trend="completions"><strong>' + recentCompletions + '</strong><span>Mission completions · ' + (recentCompletions - previousCompletions >= 0 ? '+' : '') + (recentCompletions - previousCompletions) + ' vs previous period</span></div>' +
              '<div class="cx-cohort-trend" data-trend="hints"><strong>' + recentHints + '</strong><span>Hint requests · ' + (recentHints - previousHints >= 0 ? '+' : '') + (recentHints - previousHints) + ' vs previous period</span></div>' +
            '</div><div class="rlabel" style="margin-top:10px">Repeated hint requests · last 30 days</div>' +
            '<p class="cx-dim" style="margin:0 0 4px">A prompt to review or clarify a mission, not proof of a misconception.</p>' +
            (hintHotspots.length ? hintHotspots.map(item => '<div class="cx-cohort-hotspot"><code>' + esc(item.missionId) + '</code><span>' + item.requests + ' requests · ' + item.learners.size + ' learners</span></div>').join('') :
              '<p class="cx-dim" data-no-hint-hotspots>No repeated hint-request pattern is supported by the current evidence.</p>') +
            '</div>';
          const cohortAttempts = assigned.size
            ? (atts || []).filter(attempt => assigned.has(attempt.mission_id) && cohortStudentIds.has(attempt.user_id))
            : [];
          const activeCohortLearners = new Set(cohortAttempts.map(attempt => attempt.user_id));
          const cohortPasses = cohortAttempts.filter(attempt => attempt.passed).length;
          const reflectedCohortLearners = new Set(classReflections
            .filter(reflection => cohortStudentIds.has(reflection.user_id))
            .map(reflection => reflection.user_id));
          const activityValue = cohortStudents.length
            ? activeCohortLearners.size + '/' + cohortStudents.length + ' active'
            : 'No learners';
          const outcomesValue = cohortAttempts.length
            ? Math.round(cohortPasses / cohortAttempts.length * 100) + '%'
            : 'Not enough evidence';
          const reflectionValue = cohortStudents.length
            ? reflectedCohortLearners.size + '/' + cohortStudents.length + ' learners'
            : 'No learners';
          const cohortInsightHtml = '<div class="rlabel" style="margin-top:14px">Cohort insight</div>' +
            '<p class="cx-dim" style="margin:0 0 7px">A class-level snapshot of recorded activity. These are formative signals, not grades; missing records do not imply a learner has not learned.</p>' +
            '<div class="cx-cohort-insight">' +
              '<div class="cx-cohort-metric" data-cohort-metric="activity"><strong>' + esc(activityValue) + '</strong><span>Learners with at least one assigned mission attempt</span></div>' +
              '<div class="cx-cohort-metric" data-cohort-metric="outcomes"><strong>' + esc(outcomesValue) + '</strong><span>' + cohortPasses + ' passed from ' + cohortAttempts.length + ' recorded assigned attempts</span></div>' +
              '<div class="cx-cohort-metric" data-cohort-metric="reflections"><strong>' + esc(reflectionValue) + '</strong><span>Learners who submitted a reflection; no reflection is not a learning judgement</span></div>' +
            '</div>';
          const reflectionInsightHtml = '<div class="rlabel" style="margin-top:14px">Learner reflections &amp; evidence</div>' +
            '<p class="cx-dim" style="margin:0 0 7px">Learner-reported notes help guide coaching. They are not verified grades or proof of production work.</p>' +
            (classReflections.length
              ? classReflections.slice(0, 20).map(r => {
                  const learner = roster.find(member => member.user_id === r.user_id);
                  const assignment = asns.find(a => a.id === r.assignment_id);
                  const context = [assignment ? assignment.title : '', r.mission_id || ''].filter(Boolean).join(' · ');
                  return '<article class="cx-reflection"><div class="cx-reflection-meta"><strong>' + esc(learner?.profiles?.display_name || 'Learner') + '</strong> · ' + new Date(r.created_at).toLocaleString() + (context ? ' · ' + esc(context) : '') + '</div>' +
                    '<strong>Learned</strong><p>' + esc(r.learned) + '</p><strong>Approach</strong><p>' + esc(r.approach) + '</p>' +
                    (r.evidence ? '<strong>Observed evidence</strong><p>' + esc(r.evidence) + '</p>' : '') +
                    (r.next_step ? '<strong>Next step</strong><p>' + esc(r.next_step) + '</p>' : '') + '</article>';
                }).join('')
              : '<p class="cx-dim">No learner reflections have been shared in this class yet.</p>');
          dashHtml = analyticsHtml + skillDiagnosticsHtml + cohortInsightHtml + cohortTrendHtml + learnerEvidenceHtml + assignmentInsightHtml + reflectionInsightHtml + `<div class="rlabel" style="margin-top:14px">Admin · Roster · ${esc(d.owned[0].name)} <button class="btn sm" id="cxCsv" type="button" style="margin-left:8px">Export CSV</button></div>
            <div class="cx-form" style="margin:6px 0 10px">
              <input id="addEmail" type="email" placeholder="student@example.com">
              <button class="btn primary" id="addStudent" type="button">Add student</button>
            </div>
            <div style="font-size:13px;border:1px solid var(--line);border-radius:8px;overflow:hidden">
            <div style="display:grid;grid-template-columns:1fr 70px 90px 70px 70px 110px;gap:6px;padding:6px 10px;background:var(--raise);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)"><span>Member</span><span>Role</span><span>Passed</span><span>Grade</span><span>Stuck</span><span></span></div>` +
            rows.map(r => {
              const roleSel = `<select data-role="${esc(r.e.user_id)}" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:2px 4px">
                <option value="student"${r.e.role==='student'?' selected':''}>student</option>
                <option value="ta"${r.e.role==='ta'?' selected':''}>ta</option>
              </select>`;
              const flag = r.stuck ? '<span style="color:var(--red)">stuck</span>' : '<span class="cx-dim">—</span>';
              return `<div style="display:grid;grid-template-columns:1fr 70px 90px 70px 70px 110px;gap:6px;padding:8px 10px;border-top:1px solid var(--line);align-items:center"><span>${r.av} ${esc(r.name)}</span><span>${roleSel}</span><span>${r.passed}/${total||'—'}</span><span>${total?r.grade+'%':'—'}</span><span>${flag}</span><span><button class="btn sm" data-remove="${esc(r.e.user_id)}" type="button">Remove</button></span></div>`;
            }).join('') + '</div>' +
            `<div class="cx-form" style="margin-top:8px">
              <select id="fbStudent" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px">
                ${roster.map(e => `<option value="${esc(e.user_id)}">${esc(e.profiles?.display_name || e.user_id)}</option>`).join('')}
              </select>
              <select id="fbAssignment" aria-label="Feedback assignment" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px">
                <option value="">General class feedback</option>
                ${asns.map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}
              </select>
              <select id="fbMission" aria-label="Feedback mission" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px">
                <option value="">No specific mission</option>
                ${[...new Map(asns.flatMap(a => (a.mission_ids || []).map(id => [id, { id, assignment: a.id, title: a.title }]))).values()].map(m => `<option value="${esc(m.id)}" data-assignment="${esc(m.assignment)}">${esc(m.id)} · ${esc(m.title)}</option>`).join('')}
              </select>
              <input id="fbBody" type="text" placeholder="Leave feedback…">
              <button class="btn primary" id="fbSend" type="button">Send feedback</button>
            </div>`;
        } else {
          dashHtml = `<div class="rlabel" style="margin-top:14px">Admin · Roster</div>
            <div class="cx-form" style="margin:6px 0 10px">
              <input id="addEmail" type="email" placeholder="student@example.com">
              <button class="btn primary" id="addStudent" type="button">Add student</button>
            </div>
            <p class="cx-dim">No members yet.</p>`;
        }
      } catch (e) {
        dashHtml = `<div class="rlabel" style="margin-top:14px">Roster</div><p class="cx-dim">Could not load roster.</p>`;
      }
    }
    teach = `<div class="rlabel">Classes you teach</div>${ownedHtml}
      <div class="cx-form">
        <input id="cxName" type="text" placeholder="Class name (e.g. Linux Admin 101)">
        <input id="cxTerm" type="text" placeholder="Term (optional)">
        <button class="btn primary" id="cxCreate" type="button">Create class</button>
      </div>${assignHtml}${dashHtml}`;
  } else {
    teach = `<div class="rlabel">Teaching?</div><p class="cx-dim" style="margin:0 0 8px">Enable teacher tools to create classes and (soon) see your students' progress.</p><button class="btn" id="cxBecome" type="button">Enable teacher tools</button>`;
  }
  const qbankHtml = `<div class="rlabel">Question bank</div>
    <p class="cx-dim" style="margin:0 0 8px">1000 Linux admin questions. Filter, select, and print.</p>
    <div class="cx-form" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <select id="qbCat" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px"><option value="">All categories</option></select>
      <select id="qbDiff" style="font:inherit;background:var(--raise);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px">
        <option value="">All levels</option>
        <option value="intro">Intro</option>
        <option value="intermediate">Intermediate</option>
        <option value="advanced">Advanced</option>
      </select>
      <input id="qbSearch" type="text" placeholder="Search…" style="flex:1;min-width:120px">
      <button class="btn" id="qbPrint" type="button">Print selected</button>
      <button class="btn" id="qbPrintAns" type="button">Print with answers</button>
    </div>
    <div id="qbList" style="max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:8px;font-size:13px"></div>
    <p class="cx-dim" id="qbCount" style="margin:6px 0 0"></p>`;
  const tabs = [
    { id: 'join', label: 'Join', html: `<div class="rlabel">Join a class</div>
      <div class="cx-form">
        <input id="cxCode" type="text" autocapitalize="characters" autocomplete="off" placeholder="Enter join code (e.g. 7FQ2K9)">
        <button class="btn primary" id="cxJoin" type="button">Join</button>
      </div>
      <div class="rlabel" style="margin-top:12px">Classes you're in</div>
      ${enrolledHtml}` },
    { id: 'dash', label: 'My dashboard', html: studentDash || '<p class="cx-dim">Join a class to see your dashboard.</p>' },
    { id: 'teach', label: 'Teach', html: teach },
    { id: 'qbank', label: 'Question bank', html: qbankHtml }
  ];
  renderContent(`<h2>Classroom</h2>
    <div id="cxTabs" class="cx-tabs" role="tablist">
      ${tabs.map((t,i) => `<button role="tab" aria-selected="${i===0}" class="${i===0?'on':''}" data-cxtab="${t.id}" type="button">${t.label}</button>`).join('')}
    </div>
    <div class="race-err" id="cxErr" hidden></div>
    ${tabs.map((t,i) => `<div id="cxt-${t.id}" ${i? 'hidden':''}>${t.html}</div>`).join('')}
    <div class="race-row" style="margin-top:16px"><button class="btn" id="cxBack" type="button">Back</button></div>`);
  document.querySelectorAll('[data-cert]').forEach(btn => btn.addEventListener('click', () => {
    const name = authUser.name || authUser.email || 'Student';
    const title = btn.dataset.cert;
    const cls = btn.dataset.class;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Certificate</title>
      <style>body{font-family:Georgia,serif;text-align:center;padding:60px;background:#f7f4ee;color:#1a1a1a}
      .box{border:8px double #c47f12;padding:48px;max-width:700px;margin:0 auto;background:#fff}
      h1{font-size:36px;letter-spacing:.12em;text-transform:uppercase;color:#c47f12;margin:0 0 8px}
      .sub{letter-spacing:.2em;text-transform:uppercase;font-size:12px;color:#666}
      .name{font-size:28px;margin:24px 0;border-bottom:1px solid #ccc;display:inline-block;padding:0 24px 4px}
      .meta{margin-top:24px;color:#444}</style></head><body>
      <div class="box"><div class="sub">The Last Sysadmin</div><h1>Certificate</h1>
      <p>This certifies that</p><div class="name">${name}</div>
      <p>has completed</p><p><b>${title}</b></p>
      <p class="meta">${cls}<br>${new Date().toLocaleDateString()}</p></div>
      <script>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
  }));
  // Play custom (authored) class missions in the isolated practice sandbox
  document.querySelectorAll('[data-playclass]').forEach(btn => btn.addEventListener('click', () => {
    const missions = (window._cxPlay || {})[btn.dataset.playclass] || [];
    playAuthored(missions, btn.dataset.cname || 'class');
  }));
  // Question bank
  let qbData = null;
  async function loadQB() {
    if (qbData) return qbData;
    try { const r = await fetch('questions.json'); qbData = await r.json(); } catch (e) { qbData = []; }
    return qbData;
  }
  function renderQB() {
    const list = $('#qbList'); if (!list || !qbData) return;
    const cat = ($('#qbCat')||{}).value || '';
    const diff = ($('#qbDiff')||{}).value || '';
    const q = (($('#qbSearch')||{}).value || '').toLowerCase();
    const filtered = qbData.filter(x => (!cat || x.category === cat) && (!diff || x.difficulty === diff) && (!q || x.question.toLowerCase().includes(q) || x.answer.toLowerCase().includes(q)));
    const cats = [...new Set(qbData.map(x => x.category))].sort();
    const sel = $('#qbCat');
    if (sel && sel.options.length <= 1) cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    list.innerHTML = filtered.slice(0, 200).map(x => `<label style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);align-items:flex-start"><input type="checkbox" data-qid="${esc(x.id)}"><span><b>${esc(x.id)}</b> <span class="cx-dim">${esc(x.category)} · ${esc(x.difficulty)}</span><br>${esc(x.question)}</span></label>`).join('') || '<p class="cx-dim" style="padding:10px">No matches.</p>';
    const cnt = $('#qbCount'); if (cnt) cnt.textContent = filtered.length + ' questions' + (filtered.length > 200 ? ' (showing first 200)' : '');
  }
  function printQB(withAns) {
    if (!qbData) return;
    const ids = new Set([...document.querySelectorAll('#qbList input:checked')].map(i => i.dataset.qid));
    const items = qbData.filter(x => ids.has(x.id));
    if (!items.length) return;
    const body = items.map((x,i) => `<div style="margin:0 0 16px"><b>${i+1}. ${x.question}</b><div style="color:#555;font-size:13px">${x.category} · ${x.difficulty}</div>${withAns ? '<div style="margin-top:4px"><i>Answer:</i> '+x.answer+'</div>' : ''}</div>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Question bank</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111} h1{font-size:22px}</style></head><body><h1>Linux Admin Questions</h1>${body}<script>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
  }
  const qbTab = document.querySelector('[data-cxtab="qbank"]');
  if (qbTab) qbTab.addEventListener('click', async () => { await loadQB(); renderQB(); });
  const qbCat = $('#qbCat'), qbDiff = $('#qbDiff'), qbSearch = $('#qbSearch');
  if (qbCat) qbCat.addEventListener('change', renderQB);
  if (qbDiff) qbDiff.addEventListener('change', renderQB);
  if (qbSearch) qbSearch.addEventListener('input', renderQB);
  const qbP = $('#qbPrint'); if (qbP) qbP.addEventListener('click', () => printQB(false));
  const qbPA = $('#qbPrintAns'); if (qbPA) qbPA.addEventListener('click', () => printQB(true));
  document.querySelectorAll('#cxTabs [data-cxtab]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.cxtab;
    document.querySelectorAll('#cxTabs [data-cxtab]').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
    document.querySelectorAll('[id^="cxt-"]').forEach(p => { p.hidden = p.id !== 'cxt-' + id; });
  }));
  $('#cxBack').addEventListener('click', openSettings);
  $('#cxJoin').addEventListener('click', cxDoJoin);
  const code = $('#cxCode'); if (code) code.addEventListener('keydown', ev => { if (ev.key === 'Enter') cxDoJoin(); });
  const bc = $('#cxBecome'); if (bc) bc.addEventListener('click', async () => {
    const sb = await getSB(); if (!sb) return;
    try { await sb.from('profiles').update({ is_teacher: true }).eq('id', authUser.id); } catch (e) {}
    openClassroom();
  });
  const cc = $('#cxCreate'); if (cc) cc.addEventListener('click', cxDoCreate);
  const scBtn = $('#scCreate');
  if (scBtn) scBtn.addEventListener('click', async () => {
    const title = ($('#scTitle')||{}).value?.trim() || '';
    const mids = (($('#scMissions')||{}).value || '').split(',').map(s => s.trim()).filter(Boolean);
    const er = $('#cxErr');
    if (!title || !mids.length) { if (er) { er.hidden = false; er.textContent = 'Title and at least one mission id required.'; } return; }
    const { error } = await createScenario(title, mids);
    if (error) { if (er) { er.hidden = false; er.textContent = error.message; } return; }
    openClassroom();
  });
  const mBtn = $('#mCreate');
  if (mBtn) mBtn.addEventListener('click', async () => {
    const title = ($('#mTitle')||{}).value?.trim() || '';
    const story = ($('#mStory')||{}).value?.trim() || '';
    const objective = ($('#mObj')||{}).value?.trim() || '';
    const hints = (($('#mHints')||{}).value || '').split(',').map(s => s.trim()).filter(Boolean).slice(0,3);
    const check_type = ($('#mCheck')||{}).value || 'file_exists';
    const check_arg1 = ($('#mArg1')||{}).value?.trim() || null;
    const check_arg2 = ($('#mArg2')||{}).value?.trim() || null;
    const er = $('#cxErr');
    if (!title || !objective) { if (er) { er.hidden = false; er.textContent = 'Title and objective required.'; } return; }
    const { error } = await createMission({ title, story, objective, hints, check_type, check_arg1, check_arg2 });
    if (error) { if (er) { er.hidden = false; er.textContent = error.message; } return; }
    openClassroom();
  });
  const asBtn = $('#asCreate');
  if (asBtn) asBtn.addEventListener('click', async () => {
    const title = ($('#asTitle')||{}).value?.trim() || '';
    const due = ($('#asDue')||{}).value || null;
    const mids = (($('#asMissions')||{}).value || '').split(',').map(s => s.trim()).filter(Boolean);
    const er = $('#cxErr');
    if (!title || !mids.length) { if (er) { er.hidden = false; er.textContent = 'Title and at least one mission required.'; } return; }
    if (!d.owned.length) return;
    const { error } = await createAssignment(d.owned[0].id, title, mids, due);
    if (error) { if (er) { er.hidden = false; er.textContent = error.message; } return; }
    openClassroom();
  });
  const csvBtn = $('#cxCsv');
  if (csvBtn) csvBtn.addEventListener('click', () => {
    const rows = window._cxRows || [];
    const total = window._cxTotal || 0;
    const lines = [['name','role','passed','total','grade','stuck','last_active']];
    rows.forEach(r => lines.push([r.name, r.e.role, r.passed, total, total?r.grade:'', r.stuck?'yes':'', r.last?new Date(r.last).toISOString():'']));
    const csv = lines.map(l => l.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (window._cxClass||'class')+'-gradebook.csv'; a.click();
  });
  document.querySelectorAll('#raceContent [data-reflection-save]').forEach(btn => btn.addEventListener('click', async () => {
    const classId = btn.dataset.reflectionSave;
    const form = document.querySelector('[data-reflection-form="' + CSS.escape(classId) + '"]');
    if (!form) return;
    const field = name => form.querySelector('[data-reflection-' + name + ']');
    const learned = field('learned')?.value.trim() || '';
    const approach = field('approach')?.value.trim() || '';
    const evidence = field('evidence')?.value.trim() || '';
    const nextStep = field('next')?.value.trim() || '';
    const assignmentId = field('assignment')?.value || null;
    const missionId = field('mission')?.value || null;
    const status = field('status');
    if (!learned || !approach) { if (status) status.textContent = 'Add both what you learned and how you approached the task.'; return; }
    if (missionId && !assignmentId) { if (status) status.textContent = 'Choose an assignment before selecting a mission.'; return; }
    if (assignmentId && missionId) {
      const assignment = await loadAssignments(classId).then(items => items.find(a => a.id === assignmentId));
      if (!assignment || !(assignment.mission_ids || []).includes(missionId)) {
        if (status) status.textContent = 'Choose a mission that belongs to the selected assignment.';
        return;
      }
    }
    const { error } = await saveLearnerReflection(classId, { learned, approach, evidence, nextStep, assignmentId, missionId });
    if (error) { if (status) status.textContent = 'Could not save reflection: ' + error.message; return; }
    openClassroom();
  }));
  document.querySelectorAll('#raceContent [data-reflection-assignment]').forEach(sel => sel.addEventListener('change', () => {
    const form = sel.closest('[data-reflection-form]');
    const mission = form && form.querySelector('[data-reflection-mission]');
    if (!mission) return;
    mission.disabled = !sel.value;
    if (!sel.value) mission.value = '';
    [...mission.options].forEach(option => {
      if (!option.value) { option.hidden = false; return; }
      option.hidden = !!sel.value && option.dataset.assignment !== sel.value;
    });
    if (mission.selectedOptions[0]?.hidden) mission.value = '';
  }));
  const fbAssignment = $('#fbAssignment'), fbMission = $('#fbMission');
  if (fbAssignment && fbMission) fbAssignment.addEventListener('change', () => {
    [...fbMission.options].forEach(option => {
      if (!option.value) { option.hidden = false; return; }
      option.hidden = !!fbAssignment.value && option.dataset.assignment !== fbAssignment.value;
    });
    if (fbMission.selectedOptions[0]?.hidden) fbMission.value = '';
  });
  const fbBtn = $('#fbSend');
  if (fbBtn) fbBtn.addEventListener('click', async () => {
    const sid = ($('#fbStudent')||{}).value;
    const assignmentId = ($('#fbAssignment')||{}).value || null;
    const missionId = ($('#fbMission')||{}).value || null;
    const body = ($('#fbBody')||{}).value?.trim() || '';
    const er = $('#cxErr');
    if (!sid || !body) { if (er) { er.hidden = false; er.textContent = 'Pick a student and write a comment.'; } return; }
    if (!d.owned.length) return;
    if (assignmentId && missionId) {
      const assignment = await loadAssignments(d.owned[0].id).then(items => items.find(a => a.id === assignmentId));
      if (!assignment || !(assignment.mission_ids || []).includes(missionId)) {
        if (er) { er.hidden = false; er.textContent = 'Choose a mission that belongs to the selected assignment.'; }
        return;
      }
    }
    const { error } = await addFeedback(d.owned[0].id, sid, body, assignmentId, missionId);
    if (error) { if (er) { er.hidden = false; er.textContent = error.message; } return; }
    openClassroom();
  });
  const addBtn = $('#addStudent');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const email = ($('#addEmail')||{}).value?.trim() || '';
    const er = $('#cxErr');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (er) { er.hidden = false; er.textContent = 'Enter a valid email.'; } return; }
    const sb = await getSB(); if (!sb || !d.owned.length) return;
    const { data, error } = await sb.rpc('enroll_by_email', { p_class_id: d.owned[0].id, p_email: email });
    if (error || (data && data.error)) { if (er) { er.hidden = false; er.textContent = (error && error.message) || (data && data.error) || 'Could not add'; } return; }
    openClassroom();
  });
  document.querySelectorAll('#raceContent [data-role]').forEach(sel => sel.addEventListener('change', async () => {
    const uid = sel.dataset.role, role = sel.value;
    const sb = await getSB(); if (!sb || !d.owned.length) return;
    try { await sb.from('enrollments').update({ role }).eq('class_id', d.owned[0].id).eq('user_id', uid); } catch (e) {}
  }));
  document.querySelectorAll('#raceContent [data-remove]').forEach(btn => btn.addEventListener('click', async () => {
    const uid = btn.dataset.remove;
    const sb = await getSB(); if (!sb || !d.owned.length) return;
    try { await sb.from('enrollments').delete().eq('class_id', d.owned[0].id).eq('user_id', uid); } catch (e) {}
    openClassroom();
  }));
  document.querySelectorAll('#raceContent .cx-code[data-code]').forEach(el => el.addEventListener('click', () => {
    const t = el.dataset.code; try { navigator.clipboard && navigator.clipboard.writeText(t); } catch (e) {}
    const old = el.textContent; el.textContent = 'copied'; setTimeout(() => { el.textContent = old; }, 900);
  }));
}
async function cxDoJoin() {
  const inp = $('#cxCode'), er = $('#cxErr'); if (!inp) return;
  const code = (inp.value || '').trim();
  if (!code) { er.hidden = false; er.textContent = 'Enter a join code.'; return; }
  const sb = await getSB(); if (!sb) { er.hidden = false; er.textContent = 'Not connected.'; return; }
  er.hidden = true;
  let error = null, row = null;
  try { const r = await sb.rpc('enroll_by_code', { code }); error = r.error; row = r.data && r.data[0]; } catch (e) { error = e; }
  if (error) { er.hidden = false; er.textContent = String(error.message || 'Could not join').replace(/\.*$/, '') + '.'; return; }
  hideOverlay(); tin.focus({ preventScroll: true });
  emitSys(row && row.already_enrolled
    ? `You're already in <b>${esc(row.cname)}</b>.`
    : `Joined <b>${esc(row ? row.cname : 'the class')}</b>.`, 'ok');
}
async function cxDoCreate() {
  const nm = ($('#cxName').value || '').trim(), term = ($('#cxTerm').value || '').trim(), er = $('#cxErr');
  if (!nm) { er.hidden = false; er.textContent = 'Enter a class name.'; return; }
  const sb = await getSB(); if (!sb) return;
  let error = null, row = null;
  try { const r = await sb.from('classes').insert({ owner_id: authUser.id, name: nm, term: term || null }).select('name,join_code').single(); error = r.error; row = r.data; } catch (e) { error = e; }
  if (error) { er.hidden = false; er.textContent = String(error.message || 'Could not create class') + '.'; return; }
  await openClassroom();
  emitSys(`Created <b>${esc(row ? row.name : nm)}</b>. Share join code <code>${esc(row ? row.join_code : '')}</code> with your students.`, 'ok');
}

if (gateNeeded()) showGate();   // cover the app before anything renders; authInit() lifts it if a session exists
boot(load());
try { authInit(); } catch (e) {}

// Avatar picker init
/* Wire the rack / chips toggles and default the rack collapsed.
   (Avatar selection now lives in the ⚙ Settings panel.) */
(function initPanels() {
  const rt = document.getElementById('btnRackToggle');
  if (rt) rt.onclick = toggleRack;
  const ct = document.getElementById('btnChipsToggle');
  if (ct) ct.onclick = toggleChips;
  rackExpanded = false;
  const ledsEl = document.getElementById('leds');
  if (ledsEl) ledsEl.classList.add('collapsed');
})();

})();
