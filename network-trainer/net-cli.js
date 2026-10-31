// Networking Trainer — M2: the CLI layer, wired to the M1 forwarding engine.
// Headless and testable: a CLI is bound to a world (`net`) and a "current
// device" (the console you're on). run(line) returns { out, code } and may
// mutate the model. The terminal UI is a later layer; this is the brain.
const M = require('./net-model');

const primaryIp = dev => { for (const n in dev.ifaces) { const f = dev.ifaces[n]; if (f.up !== false && f.ip != null) return f.ip; } return null; };
// Resolve a token to an IP int: a device id (-> its primary IP) or a dotted address.
function resolve(net, token) {
  if (net.devices[token]) return primaryIp(net.devices[token]);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(token)) return M.ip(token);
  return null;
}
const ok = s => ({ out: s, code: 0 });
const err = s => ({ out: s, code: 1 });

function makeCLI(net, cur) {
  const cli = { net, cur, lastPing: null, on(id) { this.cur = id; return this; } };
  cli.run = line => dispatch(cli, String(line).trim());
  return cli;
}

function dispatch(cli, line) {
  if (!line) return ok('');
  const a = line.split(/\s+/); const cmd = a[0];
  const H = COMMANDS[cmd];
  if (!H) return err(`${cmd}: command not found (try 'help')`);
  return H(cli, a.slice(1));
}

/* ---------------- commands ---------------- */
const COMMANDS = {
  help: () => ok('commands: ip, ping, traceroute, arp, tcpdump, iptables, nmap, man, help\n  ip addr | ip addr add <A>/<p> dev <if> | ip route | ip route add [default|<cidr>] via <ip>\n  ping <host|ip> · traceroute <host|ip> · arp · tcpdump · iptables -L|-A ... · nmap <host|ip>'),

  man: (cli, a) => ok(MAN[a[0]] || `no manual entry for ${a[0] || ''}`),

  ip: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    const sub = a[0];
    if (sub === 'addr' || sub === 'a' || sub === 'address') {
      if (a[1] === 'add') {                                   // ip addr add 10.0.1.10/24 dev eth0
        const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(a[2] || '');
        const di = a.indexOf('dev'); const ifn = di >= 0 ? a[di + 1] : null;
        if (!m || !ifn) return err('usage: ip addr add <A.B.C.D>/<prefix> dev <iface>');
        dev.ifaces[ifn] = { ...(dev.ifaces[ifn] || {}), ip: M.ip(m[1]), mask: Number(m[2]), up: true };
        return ok('');
      }
      const lines = Object.entries(dev.ifaces).map(([n, f]) =>
        `${n}: ${f.up === false ? 'DOWN' : 'UP'}  ${f.ip != null ? M.ipStr(f.ip) + '/' + f.mask : '(no address)'}${f.vlan != null ? ' vlan ' + f.vlan : ''}`);
      return ok(lines.join('\n'));
    }
    if (sub === 'route' || sub === 'r') {
      if (a[1] === 'add') {                                    // ip route add default via 10.0.1.1  |  ip route add 10.0.3.0/24 via 10.0.12.2
        const vi = a.indexOf('via'); if (vi < 0) return err('usage: ip route add <default|CIDR> via <gateway>');
        const via = M.ip(a[vi + 1]);
        dev.routes = dev.routes || [];
        if (a[2] === 'default') dev.routes.push({ dest: 0, mask: 0, via });
        else { const c = M.cidr(a[2]); dev.routes.push({ dest: c.net, mask: c.prefix, via }); }
        return ok('');
      }
      if (a[1] === 'del' || a[1] === 'delete') {
        const target = a[2];
        dev.routes = (dev.routes || []).filter(r => routeLabel(cli.net, cli.cur, r) !== target && !(target === 'default' && r.mask === 0));
        return ok('');
      }
      const rs = (dev.routes || []).map(r => routeLabel(cli.net, cli.cur, r));
      return ok(rs.length ? rs.join('\n') : '(no routes)');
    }
    if (sub === 'neigh' || sub === 'neighbor') return COMMANDS.arp(cli, []);
    return err(`ip: unknown object '${sub || ''}'`);
  },

  arp: cli => {
    const dev = cli.net.devices[cli.cur]; const seen = {};
    for (const ifn in dev.ifaces) {
      const f = dev.ifaces[ifn]; if (f.up === false || f.ip == null) continue;
      for (const [d, i] of M.l2Domain(cli.net, cli.cur, ifn)) {
        const nf = cli.net.devices[d].ifaces[i];
        if (nf.ip != null) seen[M.ipStr(nf.ip)] = `${M.ipStr(nf.ip)} dev ${ifn} (${d})`;
      }
    }
    const rows = Object.values(seen);
    return ok(rows.length ? rows.join('\n') : '(no neighbours learned)');
  },

  ping: (cli, a) => {
    const t = a[0]; if (!t) return err('usage: ping <host|ip>');
    const dst = resolve(cli.net, t); if (dst == null) return err(`ping: cannot resolve ${t}`);
    const base = {};
    const pi = a.indexOf('-p'); if (pi >= 0) base.proto = a[pi + 1];
    const di = a.indexOf('--dport'); if (di >= 0) base.dport = Number(a[di + 1]);
    const r = M.ping(cli.net, cli.cur, dst, base);
    cli.lastPing = { src: M.sourceIpToward(cli.net, cli.cur, dst), dst, proto: base.proto || 'icmp', dport: base.dport, path: (r.forward && r.forward.path) || [cli.cur], ok: r.ok };
    const path = ((r.forward && r.forward.path) || [cli.cur]).join(' -> ');
    if (r.ok) return ok(`PING ${t} (${M.ipStr(dst)}): reply received — reachable\npath: ${path}`);
    return err(`PING ${t} (${M.ipStr(dst)}): ${r.reason}\npath: ${path}`);
  },

  traceroute: (cli, a) => {
    const t = a[0]; if (!t) return err('usage: traceroute <host|ip>');
    const dst = resolve(cli.net, t); if (dst == null) return err(`traceroute: cannot resolve ${t}`);
    const src = M.sourceIpToward(cli.net, cli.cur, dst);
    const f = M.forward(cli.net, cli.cur, { src, dst, proto: 'icmp' });
    const lines = f.path.map((d, i) => {
      const dev = cli.net.devices[d]; const inIf = M.directIface(dev, src) || Object.keys(dev.ifaces)[0];
      const hopIp = dev.ifaces[inIf] && dev.ifaces[inIf].ip != null ? M.ipStr(dev.ifaces[inIf].ip) : '*';
      return ` ${i + 1}  ${d}  ${hopIp}`;
    });
    if (!f.ok) lines.push(` *  ${f.reason}`);
    return { out: `traceroute to ${t} (${M.ipStr(dst)})\n` + lines.join('\n'), code: f.ok ? 0 : 1 };
  },

  tcpdump: cli => {
    const p = cli.lastPing;
    if (!p) return ok('(no packets captured — run a ping first)');
    const proto = p.proto.toUpperCase();
    const svc = p.dport ? ` ${proto} ${M.ipStr(p.dst)}.${p.dport}` : ` ${proto}`;
    const lines = [`${M.ipStr(p.src)} > ${M.ipStr(p.dst)}:${svc} request`];
    if (p.ok) lines.push(`${M.ipStr(p.dst)} > ${M.ipStr(p.src)}:${svc} reply`);
    else lines.push(`(no reply — delivery failed along ${p.path.join(' -> ')})`);
    return ok(lines.map(l => 'IP ' + l).join('\n'));
  },

  iptables: (cli, a) => {
    const dev = cli.net.devices[cli.cur]; dev.acls = dev.acls || [];
    if (a[0] === '-L' || a[0] === '--list') {
      if (!dev.acls.length) return ok('Chain INPUT (policy ACCEPT)\n  (no rules)');
      const rows = dev.acls.map(r => `  ${r.action === 'deny' ? 'DROP' : 'ACCEPT'}  ${r.proto || 'all'}  in:${r.dev || 'any'}${r.src != null ? ' src:' + M.ipStr(r.src) : ''}${r.dport != null ? ' dpt:' + r.dport : ''}${r.any ? '  anywhere' : ''}`);
      return ok('Chain INPUT\n' + rows.join('\n'));
    }
    if (a[0] === '-A') {                                       // iptables -A INPUT -i eth0 -p tcp --dport 23 -j DROP
      const get = flag => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : null; };
      const chain = a[1];
      if (!/^INPUT$|^IN$/i.test(chain || '')) return err('this prototype supports the INPUT chain only');
      const rule = { dir: 'in', dev: get('-i') || undefined };
      const proto = get('-p'); if (proto) rule.proto = proto;
      const dport = get('--dport'); if (dport) rule.dport = Number(dport);
      const src = get('-s'); if (src) rule.src = M.ip(src);
      const j = get('-j'); rule.action = /DROP|REJECT/i.test(j || '') ? 'deny' : 'allow';
      dev.acls.push(rule);
      return ok('');
    }
    if (a[0] === '-F') { dev.acls = []; return ok(''); }
    return err('usage: iptables -L | -A INPUT -i <if> [-p tcp] [--dport N] -j DROP|ACCEPT | -F');
  },

  nmap: (cli, a) => {                                          // read-only, defensive: what is this host exposing?
    const t = a[0]; if (!t) return err('usage: nmap <host|ip>');
    const dst = resolve(cli.net, t); if (dst == null) return err(`nmap: cannot resolve ${t}`);
    const owner = M.deviceOwning(cli.net, dst);
    if (!owner) return ok(`Host ${M.ipStr(dst)} seems down (no such host).`);
    const reach = M.ping(cli.net, cli.cur, dst);
    if (!reach.ok) return ok(`Host ${M.ipStr(dst)} is unreachable from here (${reach.reason}).`);
    const svcs = cli.net.devices[owner].services || {};
    const ports = Object.keys(svcs);
    const body = ports.length ? ports.map(p => `${p}/tcp  open  ${svcs[p]}`).join('\n') : '(no open ports)';
    return ok(`Scan report for ${t} (${M.ipStr(dst)}) — host is up\nPORT     STATE SERVICE\n${body}`);
  }
};

function routeLabel(net, cur, r) {
  const dev = net.devices[cur]; const di = M.directIface(dev, r.via);
  const dest = r.mask === 0 ? 'default' : `${M.ipStr(r.dest)}/${r.mask}`;
  return `${dest} via ${M.ipStr(r.via)}${di ? ' dev ' + di : ''}`;
}

const MAN = {
  ip: 'ip — show / configure addresses and routes.\n  ip addr                     list interfaces and addresses\n  ip addr add A/p dev IF      give an interface an address\n  ip route                    show the routing table\n  ip route add default via G  set a default gateway\n  ip route add CIDR via G     add a static route',
  ping: 'ping HOST — send an echo and wait for the reply. Reports the path and, on failure, where the packet died.',
  traceroute: 'traceroute HOST — list the hops a packet passes through toward HOST.',
  iptables: 'iptables -L — list firewall rules.\n  iptables -A INPUT -i IF -p tcp --dport N -j DROP — drop matching inbound traffic.\n  Rules match top-down, first match wins.',
  nmap: 'nmap HOST — (read-only) list the services a host is exposing. Use it to see your own attack surface.',
  tcpdump: 'tcpdump — print the packets from your last ping on the wire.',
  arp: 'arp — show the neighbours learned on each interface (same L2 segment).'
};

module.exports = { makeCLI, resolve, primaryIp };
