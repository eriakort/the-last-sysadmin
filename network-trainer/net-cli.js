// Networking Trainer — M2: the CLI layer, wired to the M1 forwarding engine.
// Headless and testable: a CLI is bound to a world (`net`) and a "current
// device" (the console you're on). run(line) returns { out, code } and may
// mutate the model. The terminal UI is a later layer; this is the brain.
const M = require('./net-model');

const primaryIp = dev => { for (const n in dev.ifaces) { const f = dev.ifaces[n]; if (f.up !== false && f.ip != null) return f.ip; } return null; };
// Validate all user-entered IPv4 values before the permissive model converter.
function parseIPv4(value) {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(String(value))) return null;
  const octets = String(value).split('.').map(Number);
  if (octets.some(n => n > 255)) return null;
  return M.ip(String(value));
}
function parseCIDR(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(value));
  if (!match) return null;
  const address = parseIPv4(match[1]), prefix = Number(match[2]);
  if (address == null || prefix > 32) return null;
  return { net: M.networkOf(address, prefix), prefix };
}
// Resolve a token to an IP int: a device id (-> its primary IP) or a dotted address.
function resolve(net, token) {
  if (net.devices[token]) return primaryIp(net.devices[token]);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(token)) return M.ip(token);
  return null;
}
// Resolve a target token to an IP, trying device id / literal first, then DNS
// (so `ping www.corp.local` works and surfaces the real resolution failure).
function resolveTarget(cli, token) {
  const direct = resolve(cli.net, token);
  if (direct != null) return { ip: direct };
  const dns = M.resolveName(cli.net, cli.cur, token);
  return dns.ok ? { ip: dns.ip, dns: true } : { err: dns.reason };
}
const ok = s => ({ out: s, code: 0 });
const err = s => ({ out: s, code: 1 });
const parseVlanId = value => /^\\d{1,4}$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 4094 ? Number(value) : null;

function makeCLI(net, cur) {
  if (!net || !net.devices || (cur != null && !net.devices[cur])) throw new Error('makeCLI: unknown device ' + cur);
  const cli = { net, cur: cur == null ? null : cur, contextIface: null, lastPing: null, flows: [], on(id) { if (!this.net.devices[id]) throw new Error('unknown device ' + id); if (this.cur !== id) this.contextIface = null; this.cur = id; return this; } };
  cli.run = line => dispatch(cli, String(line).trim());
  return cli;
}

function dispatch(cli, line) {
  if (!line) return ok('');
  const a = line.split(/\s+/); const cmd = a[0];
  if (cli.cur == null || !cli.net.devices[cli.cur]) return err('no device selected — click a device before running network commands');
  const H = COMMANDS[cmd];
  if (!H) return err(`${cmd}: command not found (try 'help')`);
  return H(cli, a.slice(1));
}

/* ---------------- commands ---------------- */
const COMMANDS = {
  vlan: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    if (dev.kind !== 'switch') return err('vlan: this command is only available on switches');
    const id = parseVlanId(a[0]);
    if (a.length !== 1 || id == null) return err('usage: vlan <1-4094>');
    dev.vlans = Array.isArray(dev.vlans) ? dev.vlans : [1];
    if (!dev.vlans.includes(1)) dev.vlans.unshift(1);
    if (dev.vlans.includes(id)) return ok('VLAN ' + id + ' already exists');
    dev.vlans.push(id); dev.vlans.sort((x, y) => x - y);
    return ok('VLAN ' + id + ' created');
  },
  interface: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    if (dev.kind !== 'switch') return err('interface: this command is only available on switches');
    const name = a[0];
    if (a.length !== 1 || !name || !dev.ifaces[name]) return err('interface: unknown switch port ' + (name || ''));
    cli.contextIface = name;
    return ok('configuring ' + name + ' — use switchport commands, then exit');
  },
  exit: cli => { cli.contextIface = null; return ok('left interface configuration mode'); },
  switchport: (cli, a) => {
    const dev = cli.net.devices[cli.cur], name = cli.contextIface;
    if (dev.kind !== 'switch') return err('switchport: this command is only available on switches');
    if (!name || !dev.ifaces[name]) return err('switchport: enter interface configuration mode first (interface <port>)');
    const port = dev.ifaces[name], sub = a[0];
    if (sub === 'mode' && a.length === 2 && ['access', 'trunk'].includes(a[1])) {
      port.mode = a[1];
      if (a[1] === 'access') { port.accessVlan = Number(port.accessVlan ?? port.vlan ?? 1); port.vlan = port.accessVlan; }
      return ok(name + ': switchport mode ' + a[1]);
    }
    if (sub === 'access' && a[1] === 'vlan') {
      const id = parseVlanId(a[2]), vlans = Array.isArray(dev.vlans) ? dev.vlans : [1];
      if (a.length !== 3 || id == null) return err('usage: switchport access vlan <1-4094>');
      if (!vlans.includes(id)) return err('switchport: VLAN ' + id + ' does not exist — create it with vlan ' + id);
      port.mode = 'access'; port.accessVlan = id; port.vlan = id;
      return ok(name + ': access VLAN ' + id);
    }
    if (sub === 'trunk' && a[1] === 'native' && a[2] === 'vlan') {
      const id = parseVlanId(a[3]), vlans = Array.isArray(dev.vlans) ? dev.vlans : [1];
      if (a.length !== 4 || id == null) return err('usage: switchport trunk native vlan <1-4094>');
      if (!vlans.includes(id)) return err('switchport: VLAN ' + id + ' does not exist — create it with vlan ' + id);
      port.mode = 'trunk'; port.nativeVlan = id;
      return ok(name + ': trunk native VLAN ' + id);
    }
    if (sub === 'trunk' && a[1] === 'allowed' && a[2] === 'vlan') {
      const raw = a[3];
      if (a.length !== 4 || !raw) return err('usage: switchport trunk allowed vlan <all|10,20,...>');
      if (raw === 'all') { delete port.allowedVlans; port.mode = 'trunk'; return ok(name + ': all configured VLANs allowed on trunk'); }
      const ids = raw.split(',').map(parseVlanId), vlans = Array.isArray(dev.vlans) ? dev.vlans : [1];
      if (!ids.length || ids.some(id => id == null)) return err('switchport: invalid VLAN list');
      const missing = ids.find(id => !vlans.includes(id));
      if (missing != null) return err('switchport: VLAN ' + missing + ' does not exist — create it with vlan ' + missing);
      port.mode = 'trunk'; port.allowedVlans = [...new Set(ids)].sort((x, y) => x - y);
      return ok(name + ': allowed VLANs ' + port.allowedVlans.join(','));
    }
    return err('usage: switchport mode access|trunk | switchport access vlan <id> | switchport trunk native vlan <id> | switchport trunk allowed vlan <all|id,id,...>');
  },
  show: (cli, a) => {
    const dev = cli.net.devices[cli.cur], sub = a[0], detail = a[1];
    if (dev.kind !== 'switch') return err('show: switching commands are only available on switches');
    if (sub === 'vlan' && (!detail || detail === 'brief')) {
      const vlans = [...new Set([1, ...(dev.vlans || []), ...Object.values(dev.ifaces).filter(p => p.mode !== 'trunk').map(p => Number(p.accessVlan ?? p.vlan ?? 1))])].sort((x,y)=>x-y);
      const rows = vlans.map(id => {
        const ports = Object.entries(dev.ifaces).filter(([,p]) => p.mode !== 'trunk' && Number(p.accessVlan ?? p.vlan ?? 1) === id).map(([n])=>n);
        return id + '  VLAN' + id + '  active  ' + (ports.join(', ') || '(none)');
      });
      return ok('VLAN  Name    Status  Ports\n' + rows.join('\n'));
    }
    if (sub === 'interfaces' && detail === 'trunk') {
      const rows = Object.entries(dev.ifaces).filter(([,p])=>p.mode==='trunk').map(([n,p]) =>
        n + '  trunk  native ' + Number(p.nativeVlan ?? 1) + '  allowed ' + (Array.isArray(p.allowedVlans) ? p.allowedVlans.join(',') : 'all'));
      return ok(rows.length ? 'Port  Mode  Native VLAN  Allowed VLANs\n' + rows.join('\n') : '(no trunk ports)');
    }
    if (sub === 'interfaces' && (detail === 'switchport' || !detail)) {
      const only = a[2] === 'switchport' ? detail : null;
      const rows = Object.entries(dev.ifaces).filter(([n])=>!only || n===only).map(([n,p]) =>
        n + '  ' + (p.mode === 'trunk' ? 'trunk native ' + Number(p.nativeVlan ?? 1) + ' allowed ' + (Array.isArray(p.allowedVlans) ? p.allowedVlans.join(',') : 'all') : 'access VLAN ' + Number(p.accessVlan ?? p.vlan ?? 1)));
      return ok(rows.length ? rows.join('\n') : '(no matching switch ports)');
    }
    return err('usage: show vlan brief | show interfaces trunk | show interfaces switchport');
  },

  fault: (cli, a) => {
    const id = a[0]; if (!id) return err('usage: fault <id>');
    const m = cli.mission; if (!m || !m.faults) return err('fault: not a multi-fault mission');
    const f = m.faults.find(x => x.id === id);
    if (!f) return err('fault: unknown ' + id);
    cli.found = cli.found || new Set();
    if (cli.found.has(id)) cli.found.delete(id); else cli.found.add(id);
    return ok('fault: ' + (cli.found.has(id) ? 'noted' : 'cleared') + ' ' + id);
  },
  review: (cli, a) => {
    const id = a[0]; if (!id) return err('usage: review <finding-id>');
    const m = cli.mission; if (!m || !m.review) return err('review: not a design-review mission');
    const f = m.review.findings.find(x => x.id === id);
    if (!f) return err('review: unknown finding ' + id);
    cli.selected = cli.selected || new Set();
    if (cli.selected.has(id)) cli.selected.delete(id); else cli.selected.add(id);
    return ok('review: ' + (cli.selected.has(id) ? 'checked' : 'unchecked') + ' ' + id);
  },
  bgp: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    dev.bgp = dev.bgp || { asn: null, neighbors: [], networks: [] };
    if (a[0] === 'asn' && a[1]) { dev.bgp.asn = Number(a[1]); return ok('BGP ASN ' + a[1]); }
    if (a[0] === 'neighbor' && a[1] && a[2] === 'remote-as') {
      const ip = M.ip(a[1]);
      dev.bgp.neighbors = dev.bgp.neighbors.filter(n => n.ip !== ip).concat([{ ip, remoteAs: Number(a[3]) }]);
      return ok(`BGP neighbor ${a[1]} remote-as ${a[3]}`);
    }
    if (a[0] === 'network' && a[1]) {
      if (!dev.bgp.networks.includes(a[1])) dev.bgp.networks.push(a[1]);
      return ok('BGP network ' + a[1]);
    }
    if (a[0] === 'summary' || a[0] === 'neighbor' && !a[1]) {
      const ss = M.bgpSessions(cli.net, cli.cur);
      if (!ss.length) return ok('BGP: no neighbors configured');
      return ok('BGP sessions:\n' + ss.map(s => `  ${M.ipStr(s.ip)}  AS${s.remoteAs}  ${s.up ? 'Established' : s.reason}`).join('\n'));
    }
    return err('usage: bgp asn <n> | bgp neighbor <ip> remote-as <n> | bgp network <cidr> | bgp summary');
  },
  ospf: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    if (a[0] === 'neighbor' || a[0] === 'neighbors' || (a[0] === 'show' )) {
      const ns = M.ospfNeighbors(cli.net, cli.cur);
      if (!ns.length) return ok('OSPF neighbors: (none)');
      return ok('OSPF neighbors:\n' + ns.map(n => `  ${n.id}  ${M.ipStr(n.ip)}  area ${n.area}  via ${n.via}`).join('\n'));
    }
    // ip-style: ospf <iface> area <n>
    const ifn = a[0], area = a[2];
    if (!ifn || a[1] !== 'area' || area == null) return err('usage: ospf <iface> area <n>   |   ospf neighbor');
    if (!dev.ifaces[ifn]) return err('ospf: no interface ' + ifn);
    dev.ifaces[ifn].ospf = Number(area);
    return ok(`OSPF enabled on ${ifn} area ${area}`);
  },
  help: () => ok('commands: ip, vlan, interface, switchport, show, exit, ping, traceroute, arp, tcpdump, iptables, nmap, dig, dhclient, resolvectl, man, help\n  ip addr | ip addr add|replace|del <A>/<p> dev <if> | ip link set <if> up|down\n  ip route | ip route add|replace [default|<cidr>] via <ip> | ip route del [default|<cidr>]\n  vlan <id> · interface <port> · switchport mode access|trunk · switchport access vlan <id>\n  switchport trunk native vlan <id> · switchport trunk allowed vlan <all|id,id> · show vlan brief · show interfaces trunk\n  ping <host|ip|name> · traceroute <host|ip> · arp · tcpdump · iptables -L|-A ... · nmap <host|ip>\n  dig <name> · dhclient <if> · resolvectl dns <if> <ip> | resolvectl status'),

  man: (cli, a) => ok(MAN[a[0]] || `no manual entry for ${a[0] || ''}`),

  ip: (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    const sub = a[0];
    if (sub === 'link') {                                   // ip link set eth0 up|down
      const si = a.indexOf('set'); const ifn = si >= 0 ? a[si + 1] : null;
      const state = (a[si + 2] || '').toLowerCase();
      if (!ifn || !dev.ifaces[ifn] || !['up', 'down'].includes(state))
        return err('usage: ip link set <iface> up|down');
      dev.ifaces[ifn].up = state === 'up';
      return ok(ifn + ': ' + state);
    }
    if (sub === 'addr' || sub === 'a' || sub === 'address') {
      if (a[1] === 'add' || a[1] === 'replace') {
        const di = a.indexOf('dev'); const ifn = di >= 0 ? a[di + 1] : null;
        const parsed = parseCIDR(a[2]);
        if (!parsed || !ifn) return err('usage: ip addr add <valid-IPv4>/<0-32> dev <existing-interface>');
        if (!dev.ifaces[ifn]) return err('ip addr: no such interface ' + ifn);
        const address = parseIPv4(String(a[2]).split('/')[0]);
        if (a[1] === 'add' && dev.ifaces[ifn].ip != null
            && (dev.ifaces[ifn].ip !== address || dev.ifaces[ifn].mask !== parsed.prefix))
          return err('ip addr: interface already has an address; use replace or delete it first');
        for (const [id, other] of Object.entries(cli.net.devices)) {
          for (const [otherIf, f] of Object.entries(other.ifaces || {})) {
            if (f.up !== false && f.ip === address && !(id === cli.cur && otherIf === ifn))
              return err('ip addr: address already in use by ' + id + '/' + otherIf);
          }
        }
        dev.ifaces[ifn] = { ...dev.ifaces[ifn], ip: address, mask: parsed.prefix };
        return ok(ifn + ': ' + M.ipStr(address) + '/' + parsed.prefix);
      }
      if (a[1] === 'del' || a[1] === 'delete') {
        const di = a.indexOf('dev'); const ifn = di >= 0 ? a[di + 1] : null;
        const parsed = parseCIDR(a[2]);
        if (!parsed || !ifn) return err('usage: ip addr del <valid-IPv4>/<0-32> dev <existing-interface>');
        const iface = dev.ifaces[ifn];
        if (!iface) return err('ip addr: no such interface ' + ifn);
        const address = parseIPv4(String(a[2]).split('/')[0]);
        if (iface.ip !== address || iface.mask !== parsed.prefix) return err('ip addr: address not configured on ' + ifn);
        delete iface.ip; delete iface.mask;
        return ok(ifn + ': address removed');
      }
      const lines = Object.entries(dev.ifaces).map(([n, f]) =>
        `${n}: ${f.up === false ? 'DOWN' : 'UP'}  ${f.ip != null ? M.ipStr(f.ip) + '/' + f.mask : '(no address)'}${f.vlan != null ? ' vlan ' + f.vlan : ''}`);
      return ok(lines.join('\n'));
    }
    if (sub === 'route' || sub === 'r') {
      if (a[1] === 'add' || a[1] === 'replace') {
        const vi = a.indexOf('via');
        if (vi !== 3 || !a[vi + 1]) return err('usage: ip route add <default|valid-CIDR> via <gateway-IPv4>');
        const via = parseIPv4(a[vi + 1]);
        const target = a[2] === 'default' ? { net: 0, prefix: 0 } : parseCIDR(a[2]);
        if (!target || via == null) return err('ip route: invalid destination or gateway address');
        const gatewayIface = M.directIface(dev, via);
        if (!gatewayIface || dev.ifaces[gatewayIface].up === false)
          return err('ip route: gateway ' + a[vi + 1] + ' is not on an active connected subnet');
        if (Object.values(dev.ifaces).some(f => f.ip === via && f.up !== false))
          return err('ip route: gateway cannot be this device own address');
        dev.routes = dev.routes || [];
        const samePrefix = r => r.mask === target.prefix && r.dest === target.net;
        if (a[1] === 'replace') dev.routes = dev.routes.filter(r => !samePrefix(r));
        else if (dev.routes.some(r => samePrefix(r) && r.via === via))
          return err('ip route: identical route already exists');
        dev.routes.push({ dest: target.net, mask: target.prefix, via });
        return ok('route ' + (target.prefix === 0 ? 'default' : M.ipStr(target.net) + '/' + target.prefix) + ' via ' + a[vi + 1]);
      }
      if (a[1] === 'del' || a[1] === 'delete') {
        const target = a[2] === 'default' ? { net: 0, prefix: 0 } : parseCIDR(a[2]);
        if (!target) return err('usage: ip route del <default|valid-CIDR>');
        const before = (dev.routes || []).length;
        dev.routes = (dev.routes || []).filter(r => !(r.mask === target.prefix && r.dest === target.net));
        if (dev.routes.length === before) return err('ip route: no matching route to delete');
        return ok('route removed');
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
    const t = a[0]; if (!t) return err('usage: ping <host|ip|name>');
    const rt = resolveTarget(cli, t); if (rt.err) return err(`PING ${t}: ${rt.err}`);
    const dst = rt.ip;
    const base = {};
    const pi = a.indexOf('-p'); if (pi >= 0) base.proto = a[pi + 1];
    const di = a.indexOf('--dport'); if (di >= 0) base.dport = Number(a[di + 1]);
    const r = M.ping(cli.net, cli.cur, dst, base);
    cli.lastPing = { src: M.sourceIpToward(cli.net, cli.cur, dst), dst, proto: base.proto || 'icmp', dport: base.dport, path: (r.forward && r.forward.path) || [cli.cur], ok: r.ok };
    cli.flows = cli.flows || [];
    cli.flows.unshift({ t: Date.now(), from: cli.cur, ...cli.lastPing });
    if (cli.flows.length > 12) cli.flows.length = 12;
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
    if (a[0] === '-t' && a[1] === 'nat') return iptablesNat(cli, dev, a.slice(2));
    if (a[0] === '-t') a = a.slice(2);                       // -t filter (the default)
    if (a[0] === '-L' || a[0] === '--list') {
      if (!dev.acls.length) return ok('Chain INPUT (policy ACCEPT)\n  (no rules)');
      const dstTxt = r => r.dst != null ? ' dst:' + M.ipStr(r.dst) : r.dstnet ? ' dst:' + M.ipStr(r.dstnet.net) + '/' + r.dstnet.prefix : '';
      const rows = dev.acls.map(r => `  ${r.action === 'deny' ? 'DROP' : 'ACCEPT'}  ${r.proto || 'all'}  in:${r.dev || 'any'}${r.src != null ? ' src:' + M.ipStr(r.src) : ''}${dstTxt(r)}${r.dport != null ? ' dpt:' + r.dport : ''}${r.any ? '  anywhere' : ''}`);
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
      const dst = get('-d'); if (dst) { if (dst.includes('/')) rule.dstnet = M.cidr(dst); else rule.dst = M.ip(dst); }
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
  },

  dig: (cli, a) => {                                          // resolve a name via this host's configured DNS server
    const name = a[0]; if (!name) return err('usage: dig <name>');
    const r = M.resolveName(cli.net, cli.cur, name);
    if (r.ok) return ok(`; <<>> dig ${name}\n;; ANSWER SECTION:\n${name}.\t\tIN\tA\t${M.ipStr(r.ip)}`);
    return err(`; <<>> dig ${name}\n;; resolution failed: ${r.reason}`);
  },

  dhclient: (cli, a) => {                                     // request a DHCP lease on an interface
    const ifn = a[0] || 'eth0';
    const r = M.dhclient(cli.net, cli.cur, ifn);
    if (!r.ok) return err(`dhclient ${ifn}: ${r.reason}`);
    return ok(`dhclient ${ifn}: lease acquired\n  address ${M.ipStr(r.ip)}/${r.prefix}\n  gateway ${r.gw != null ? M.ipStr(r.gw) : '(none)'}\n  dns     ${r.dns != null ? M.ipStr(r.dns) : '(none)'}`);
  },

  resolvectl: (cli, a) => {                                   // systemd-resolved: show/set the DNS server for a link
    const dev = cli.net.devices[cli.cur];
    if (a[0] === 'dns' && a[1] && a[2]) {                     // resolvectl dns eth0 10.0.0.53
      if (!dev.ifaces[a[1]]) return err(`resolvectl: no such link ${a[1]}`);
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(a[2])) return err(`resolvectl: '${a[2]}' is not an address`);
      dev.resolver = M.ip(a[2]);
      return ok(`Set DNS server for ${a[1]} to ${a[2]}.`);
    }
    if (!a[0] || a[0] === 'status') return ok(`Current DNS Server: ${dev.resolver != null ? M.ipStr(dev.resolver) : '(none)'}`);
    return err('usage: resolvectl dns <link> <server-ip> | resolvectl status');
  }
};

// iptables -t nat: PREROUTING DNAT (port-forward) + POSTROUTING MASQUERADE/SNAT.
function iptablesNat(cli, dev, a) {
  dev.nat = dev.nat || [];
  const get = flag => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : null; };
  if (a[0] === '-L' || a[0] === '--list') {
    if (!dev.nat.length) return ok('Chain PREROUTING\n  (no rules)\nChain POSTROUTING\n  (no rules)');
    const rows = dev.nat.map(r => r.kind === 'dnat'
      ? `  DNAT   ${r.proto || 'all'}  in:${r.oif}${r.dport != null ? ' dpt:' + r.dport : ''}  ->  ${M.ipStr(r.toIp)}`
      : `  MASQ   out:${r.oif}  src:${M.ipStr(r.srcNet.net)}/${r.srcNet.prefix}`);
    return ok('Chain NAT\n' + rows.join('\n'));
  }
  if (a[0] === '-F') { dev.nat = []; return ok(''); }
  if (a[0] === '-A') {
    const chain = (a[1] || '').toUpperCase();
    const j = (get('-j') || '').toUpperCase();
    if (chain === 'PREROUTING' && j === 'DNAT') {            // -A PREROUTING -i eth1 -p tcp --dport 80 -j DNAT --to-destination 10.0.1.10
      const oif = get('-i'); const toArg = get('--to-destination');
      if (!oif || !toArg) return err('usage: iptables -t nat -A PREROUTING -i <if> -p tcp --dport <N> -j DNAT --to-destination <ip>');
      const rule = { kind: 'dnat', oif, toIp: M.ip(toArg.split(':')[0]) };
      const proto = get('-p'); if (proto) rule.proto = proto;
      const dport = get('--dport'); if (dport) rule.dport = Number(dport);
      dev.nat.push(rule); return ok('');
    }
    if (chain === 'POSTROUTING' && (j === 'MASQUERADE' || j === 'SNAT')) {   // -A POSTROUTING -o eth1 -s 10.0.1.0/24 -j MASQUERADE
      const oif = get('-o'); const s = get('-s');
      if (!oif || !s) return err('usage: iptables -t nat -A POSTROUTING -o <if> -s <cidr> -j MASQUERADE');
      dev.nat.push({ kind: 'snat', oif, srcNet: M.cidr(s) }); return ok('');
    }
    return err('nat supports: -A PREROUTING ... -j DNAT --to-destination <ip> | -A POSTROUTING -o <if> -s <cidr> -j MASQUERADE');
  }
  return err('usage: iptables -t nat -L | -A PREROUTING ... | -A POSTROUTING ... | -F');
}

function routeLabel(net, cur, r) {
  const dev = net.devices[cur]; const di = M.directIface(dev, r.via);
  const dest = r.mask === 0 ? 'default' : `${M.ipStr(r.dest)}/${r.mask}`;
  return `${dest} via ${M.ipStr(r.via)}${di ? ' dev ' + di : ''}`;
}

const MAN = {
  ip: 'ip — show / configure addresses and routes.\n  ip addr                     list interfaces and addresses\n  ip addr add A/p dev IF      assign a validated address to an existing interface\n  ip addr del A/p dev IF      remove the matching address\n  ip link set IF up|down      change interface state\n  ip route                    show the routing table\n  ip route add default via G  set or replace the default gateway\n  ip route add CIDR via G     add or replace a static route\n  ip route del default|CIDR   remove a matching route\n  Address and gateway input is validated; gateways must be on an active connected subnet.',
  ping: 'ping HOST — send an echo and wait for the reply. Reports the path and, on failure, where the packet died.',
  traceroute: 'traceroute HOST — list the hops a packet passes through toward HOST.',
  iptables: 'iptables -L — list firewall rules.\n  iptables -A INPUT -i IF -p tcp --dport N -j DROP — drop matching inbound traffic (rules match top-down, first match wins).\n  iptables -t nat -A PREROUTING -i IF -p tcp --dport N -j DNAT --to-destination IP — port-forward inbound traffic to an inside host.\n  iptables -t nat -A POSTROUTING -o IF -s CIDR -j MASQUERADE — share the outside IP for an inside network (source NAT).\n  iptables -t nat -L — list NAT rules.',
  nmap: 'nmap HOST — (read-only) list the services a host is exposing. Use it to see your own attack surface.',
  tcpdump: 'tcpdump — print the packets from your last ping on the wire.',
  arp: 'arp — show the neighbours learned on each interface (same L2 segment).',
  dig: 'dig NAME — ask this host\'s configured DNS server to resolve NAME to an address. Fails with NXDOMAIN (no record) or if no resolver is set / reachable.',
  dhclient: 'dhclient [IF] — request a DHCP lease on IF (default eth0): an address, a default gateway, and a DNS server, all handed out by the segment\'s DHCP pool.',
  resolvectl: 'resolvectl dns IF SERVER — set the DNS resolver for a link.\n  resolvectl status — show the current DNS server.',
  vlan: 'vlan ID — create a VLAN (1–4094) on the selected switch.\n  interface PORT — enter switch-port configuration mode.\n  switchport mode access|trunk — set the port mode.\n  switchport access vlan ID — assign an existing VLAN to an access port.\n  switchport trunk native vlan ID — set the untagged VLAN on a trunk.\n  switchport trunk allowed vlan all|10,20 — set the VLANs carried by a trunk.\n  show vlan brief — list VLANs and access ports.\n  show interfaces trunk — inspect trunk native and allowed VLANs.\n  show interfaces switchport — inspect port modes and VLAN membership.'
};

module.exports = { makeCLI, resolve, primaryIp };
