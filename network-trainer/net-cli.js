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
const parseVlanId = value => /^\d{1,4}$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 4094 ? Number(value) : null;

function makeCLI(net, cur) {
  if (!net || !net.devices || (cur != null && !net.devices[cur])) throw new Error('makeCLI: unknown device ' + cur);
  const cli = { net, cur: cur == null ? null : cur, contextIface: null, lastPing: null, flows: [], iosMode: 'user', iosIface: null, iosOspf: null, asaMode: 'user', asaIface: null, asaObject: null, cfgMode: false, cfg: [], on(id) { if (!this.net.devices[id]) throw new Error('unknown device ' + id); if (this.cur !== id) { this.contextIface = null; this.iosIface = null; this.iosOspf = null; this.iosMode = 'user'; this.asaMode = 'user'; this.asaIface = null; this.asaObject = null; this.cfgMode = false; this.cfg = []; } this.cur = id; return this; } };
  cli.run = line => {
    const command = String(line).trim(), result = runCisco(cli, command);
    if (result.code === 0 && cli.cur && /^(?:ip dhcp|ip name-server|ip host|ip helper-address|ntp |no ntp|logging |no logging|hostname |interface |ip route|ip access-list|access-list|no ip dhcp|router ospf|network |no network|router-id |passive-interface |no passive-interface|bgp |write memory|copy running-config)/i.test(command))
      M.recordSyslog(cli.net, cli.cur, 'CONFIG: ' + command, 5);
    return result;
  };
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


/* ---------------- Cisco IOS-style operational CLI ----------------
 * This is a deliberately bounded command-language layer over the same
 * network model. It is not an IOS image; only commands implemented here
 * mutate the simulator. Legacy Linux commands remain available as a bridge.
 */
function ciscoMaskPrefix(mask) {
  const parts = String(mask || '').split('.');
  if (parts.length !== 4 || parts.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  const bits = parts.map(x => Number(x).toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(bits)) return null;
  return bits.indexOf('0') < 0 ? 32 : bits.indexOf('0');
}
function ospfAreaId(value) {
  if (/^\d+$/.test(String(value))) { const n = Number(value); return n >= 0 && n <= 4294967295 ? String(n) : null; }
  const n = parseIPv4(value); return n == null ? null : String(n);
}
function applyOspfNetworks(dev) {
  for (const p of Object.values(dev.ifaces || {})) delete p.ospf;
  for (const n of dev.ospf && dev.ospf.networks || []) {
    const mask = (~n.wildcard) >>> 0;
    for (const p of Object.values(dev.ifaces || {})) if (p.ip != null && ((p.ip & mask) >>> 0) === ((n.address & mask) >>> 0)) p.ospf = n.area;
  }
}
function ciscoIface(dev, token) {
  if (!token) return null;
  if (dev.ifaces[token]) return token;
  const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = norm(token);
  const keys = Object.keys(dev.ifaces);
  const alias = value => norm(value).replace(/^gigabitethernet/, 'gi').replace(/^tengigabitethernet/, 'te').replace(/^fastethernet/, 'fa').replace(/^ethernet/, 'e');
  return keys.find(k => norm(k) === wanted || alias(k) === wanted || norm(k) === alias(token))
    || keys.find(k => norm(k).startsWith(wanted) && wanted.length >= 2)
    || keys.find(k => alias(k).startsWith(wanted) && wanted.length >= 2)
    || null;
}
function ciscoRunConfig(dev) {
  const lines = ['hostname ' + (dev.hostname || dev.id || 'Router')];
  for (const [name, p] of Object.entries(dev.ifaces || {})) {
    lines.push('!', 'interface ' + name);
    if (p.description) lines.push(' description ' + p.description);
    if (dev.kind === 'switch') {
      lines.push(' switchport');
      if (p.mode) lines.push(' switchport mode ' + p.mode);
      if (p.mode === 'trunk') {
        lines.push(' switchport trunk native vlan ' + Number(p.nativeVlan ?? 1));
        if (Array.isArray(p.allowedVlans)) lines.push(' switchport trunk allowed vlan ' + p.allowedVlans.join(','));
      } else lines.push(' switchport access vlan ' + Number(p.accessVlan ?? p.vlan ?? 1));
      if (p.portSecurity && p.portSecurity.enabled) {
        lines.push(' switchport port-security');
        if (p.portSecurity.maximum !== 1) lines.push(' switchport port-security maximum ' + p.portSecurity.maximum);
        if (p.portSecurity.violation && p.portSecurity.violation !== 'shutdown') lines.push(' switchport port-security violation ' + p.portSecurity.violation);
        if (p.portSecurity.sticky) lines.push(' switchport port-security mac-address sticky');
        for (const mac of p.portSecurity.stickyMacs || []) lines.push(' switchport port-security mac-address ' + mac);
      }
    } else if (p.ip != null) lines.push(' ip address ' + M.ipStr(p.ip) + ' ' + ciscoPrefixMask(p.mask));
    if (p.hsrp) {
      const h = p.hsrp;
      lines.push(' standby ' + h.group + ' ip ' + M.ipStr(h.virtualIp));
      if (h.priority != null && h.priority !== 100) lines.push(' standby ' + h.group + ' priority ' + h.priority);
      if (h.preempt) lines.push(' standby ' + h.group + ' preempt');
      for (const t of h.track || []) lines.push(' standby ' + h.group + ' track ' + t.iface + ' decrement ' + t.decrement);
    }
    for (const dir of ['in','out']) {
      const acl = p.accessGroups && p.accessGroups[dir];
      if (acl) lines.push(' ip access-group ' + acl + ' ' + dir);
    }
    lines.push(p.up === false ? ' shutdown' : ' no shutdown');
  }
  for (const id of dev.vlans || []) if (id !== 1) lines.push('!', 'vlan ' + id + ((dev.vlanNames || {})[id] ? '\n name ' + dev.vlanNames[id] : ''));
  for (const [name,p] of Object.entries(dev.ifaces || {})) if (p.helperAddress != null) lines.push('!', 'interface ' + name, ' ip helper-address ' + M.ipStr(p.helperAddress));
  for (const r of dev.routes || []) lines.push('ip route ' + (r.mask === 0 ? '0.0.0.0 0.0.0.0' : M.ipStr(r.dest) + ' ' + ciscoPrefixMask(r.mask)) + ' ' + M.ipStr(r.via));
  if (dev.ospf && dev.ospf.processId != null) {
    lines.push('!', 'router ospf ' + dev.ospf.processId);
    if (dev.ospf.routerId != null) lines.push(' router-id ' + M.ipStr(dev.ospf.routerId));
    for (const n of dev.ospf.networks || []) lines.push(' network ' + M.ipStr(n.address) + ' ' + M.ipStr(n.wildcard) + ' area ' + n.area);
    for (const name of dev.ospf.passiveInterfaces || []) lines.push(' passive-interface ' + name);
  }
  if (dev.bgp && dev.bgp.asn != null) {
    lines.push('!', 'bgp asn ' + dev.bgp.asn);
    for (const n of dev.bgp.networks || []) lines.push('bgp network ' + n);
    for (const [name, entries] of Object.entries(dev.bgp.prefixLists || {}))
      for (const entry of entries.slice().sort((a,b) => a.seq - b.seq))
        lines.push('bgp prefix-list ' + name + ' seq ' + entry.seq + ' ' + entry.action + ' ' +
          M.ipStr(entry.dest) + '/' + entry.mask + (entry.ge == null ? '' : ' ge ' + entry.ge) + (entry.le == null ? '' : ' le ' + entry.le));
    for (const n of dev.bgp.neighbors || []) {
      lines.push('bgp neighbor ' + M.ipStr(n.ip) + ' remote-as ' + n.remoteAs);
      if (n.inPrefixList) lines.push('bgp neighbor ' + M.ipStr(n.ip) + ' prefix-list ' + n.inPrefixList + ' in');
      if (n.outPrefixList) lines.push('bgp neighbor ' + M.ipStr(n.ip) + ' prefix-list ' + n.outPrefixList + ' out');
    }
  }
  if (dev.dhcp && dev.dhcp.name) {
    for (const x of dev.dhcp.excluded || []) lines.push('ip dhcp excluded-address ' + M.ipStr(x.start) + (x.end != null && x.end !== x.start ? ' ' + M.ipStr(x.end) : ''));
    lines.push('!', 'ip dhcp pool ' + dev.dhcp.name);
    if (dev.dhcp.network) lines.push(' network ' + M.ipStr(dev.dhcp.network.net) + ' ' + ciscoPrefixMask(dev.dhcp.network.prefix));
    if (dev.dhcp.defaultRouter != null) lines.push(' default-router ' + M.ipStr(dev.dhcp.defaultRouter));
    if (dev.dhcp.dnsServer != null) lines.push(' dns-server ' + M.ipStr(dev.dhcp.dnsServer));
    if (dev.dhcp.domainName) lines.push(' domain-name ' + dev.dhcp.domainName);
    if (dev.dhcp.leaseDays) lines.push(' lease ' + dev.dhcp.leaseDays);
  }
  if (dev.resolver != null) lines.push('ip name-server ' + M.ipStr(dev.resolver));
  for (const [name,address] of Object.entries(dev.hosts || {})) lines.push('ip host ' + name + ' ' + M.ipStr(address));
  if (dev.ntp && dev.ntp.master) lines.push('ntp master ' + Number(dev.ntp.stratum || 8));
  for (const address of dev.ntp && dev.ntp.servers || []) lines.push('ntp server ' + M.ipStr(address));
  if (dev.syslog) {
    for (const address of dev.syslog.hosts || []) lines.push('logging host ' + M.ipStr(address));
    if (dev.syslog.severity != null) lines.push('logging trap ' + Number(dev.syslog.severity));
    if (dev.syslog.sourceInterface) lines.push('logging source-interface ' + dev.syslog.sourceInterface);
    if (dev.syslog.enabled === false) lines.push('no logging on');
  }
  const aclNames = [...new Set((dev.acls || []).filter(r => r.aclName).map(r => r.aclName))];
  for (const name of aclNames) {
    lines.push('!', 'ip access-list extended ' + name);
    for (const r of (dev.acls || []).filter(x => x.aclName === name).sort((a,b)=>(a.seq||0)-(b.seq||0))) lines.push(' ' + ciscoAclRuleText(r));
  }
  for (const r of dev.acls || []) if (!r.aclName) lines.push('access-list ' + (r.list || 101) + ' ' + (r.action === 'deny' ? 'deny' : 'permit') + ' ' + (r.proto || 'ip') + ' ' + (r.src == null ? 'any' : M.ipStr(r.src)) + ' ' + (r.dst == null ? 'any' : M.ipStr(r.dst)));
  return lines.join('\n') + '\n';
}
function ciscoPrefixMask(prefix) {
  const n = Number(prefix);
  const bits = '1'.repeat(n) + '0'.repeat(32 - n);
  return [0, 8, 16, 24].map(i => parseInt(bits.slice(i, i + 8), 2)).join('.');
}
function ciscoAclAddress(words, at) {
  const token = words[at];
  if (!token) return null;
  if (token === 'any') return { value: null, wildcard: null, next: at + 1 };
  if (token === 'host') {
    const value = parseIPv4(words[at + 1]);
    return value == null ? null : { value, wildcard: 0, next: at + 2 };
  }
  const value = parseIPv4(token), wildcard = parseIPv4(words[at + 1]);
  return value == null || wildcard == null ? null : { value, wildcard, next: at + 2 };
}
function ciscoAclRule(words, aclName, defaultSeq) {
  let at = 0, seq = defaultSeq;
  if (/^\d+$/.test(words[0] || '')) { seq = Number(words[0]); at++; }
  const action = words[at++], proto = words[at++];
  if (!['permit','deny'].includes(action) || !['ip','tcp','udp','icmp'].includes(proto)) return null;
  const src = ciscoAclAddress(words, at); if (!src) return null; at = src.next;
  const dst = ciscoAclAddress(words, at); if (!dst) return null; at = dst.next;
  let dport = null;
  if (words[at] === 'eq' && ['tcp','udp'].includes(proto)) {
    dport = Number(words[at + 1]);
    if (!Number.isInteger(dport) || dport < 1 || dport > 65535 || at + 2 !== words.length) return null;
    at += 2;
  }
  if (at !== words.length) return null;
  return { aclName, seq, action: action === 'deny' ? 'deny' : 'allow', proto, src: src.value, srcWildcard: src.wildcard, dst: dst.value, dstWildcard: dst.wildcard, dport };
}
function ciscoAclAddressText(value, wildcard) {
  if (value == null) return 'any';
  if (wildcard === 0) return 'host ' + M.ipStr(value);
  return M.ipStr(value) + ' ' + M.ipStr(wildcard);
}
function ciscoAclRuleText(r) {
  return (r.seq || 10) + ' ' + (r.action === 'deny' ? 'deny' : 'permit') + ' ' + (r.proto || 'ip') + ' ' +
    ciscoAclAddressText(r.src, r.srcWildcard) + ' ' + ciscoAclAddressText(r.dst, r.dstWildcard) +
    (r.dport == null ? '' : ' eq ' + r.dport);
}
function ciscoShow(cli, words) {
  const dev = cli.net.devices[cli.cur], q = words.join(' ').toLowerCase();
  if (q === 'running-config' || q === 'run') return ok('Building configuration...\n!\n' + ciscoRunConfig(dev) + 'end');
  if (q === 'access-lists' || q.startsWith('access-lists ')) {
    const wanted = words[1] && words[1].toUpperCase();
    const names = [...new Set((dev.acls || []).filter(r => r.aclName && (!wanted || r.aclName === wanted)).map(r => r.aclName))];
    if (wanted && !names.length) return ok('% No access lists found');
    return ok(names.map(name => 'Extended IP access list ' + name + '\n' +
      (dev.acls || []).filter(r => r.aclName === name).sort((a,b)=>(a.seq||0)-(b.seq||0))
        .map(r => ' ' + ciscoAclRuleText(r) + ' (' + (r.hits || 0) + ' matches)').join('\n')).join('\n') || '% No access lists configured');
  }
  if (q.startsWith('ip interface ') && q !== 'ip interface brief') {
    const name = ciscoIface(dev, words[2]);
    if (!name) return err('% Invalid interface');
    const groups = dev.ifaces[name].accessGroups || {};
    return ok(name + ' is ' + (dev.ifaces[name].up === false ? 'administratively down' : 'up') +
      '\n  Inbound access list is ' + (groups.in || 'not set') +
      '\n  Outbound access list is ' + (groups.out || 'not set') +
      '\n  DHCP relay is ' + (dev.ifaces[name].helperAddress == null ? 'not configured' : M.ipStr(dev.ifaces[name].helperAddress)));
  }
  if (q === 'port-security' || q.startsWith('port-security interface ')) {
    if (dev.kind !== 'switch') return err('% Port security is available on switches only');
    const wanted=q.startsWith('port-security interface ')?ciscoIface(dev,words[2]):null;
    if(q.startsWith('port-security interface ')&&!wanted)return err('% Invalid interface');
    const rows=Object.entries(dev.ifaces).filter(([n,p])=>(!wanted||n===wanted)&&p.portSecurity&&p.portSecurity.enabled).map(([n,p])=>{const x=p.portSecurity;return n+'  '+(p.errDisabled?'err-disabled':'secure-up')+'  max '+Number(x.maximum||1)+'  current '+(x.secureMacs||[]).length+'  violation '+(x.violation||'shutdown')+'  count '+Number(x.violations||0)+'  MACs '+((x.secureMacs||[]).join(', ')||'(none)');});
    return ok('Port                 Status        Max  Current  Violation  Count  Secure MACs\\n'+(rows.join('\\n')||'(no port-security configuration)'));
  }
  if (q === 'hosts') {
    const rows = Object.entries(dev.hosts || {}).map(([n,a]) => n.padEnd(22) + M.ipStr(a).padEnd(16) + 'static');
    return ok('Host                  Address         Source\n' + (rows.join('\n') || '(no local host entries)'));
  }
  if (q === 'ntp status' || q === 'ntp associations') {
    const status = M.ntpStatus(cli.net, cli.cur);
    if (q === 'ntp status') return ok('Clock is ' + (status.synchronized ? 'synchronized' : 'unsynchronized') + '\nStratum: ' + status.stratum + '\nReference: ' + (status.source || 'none') + (status.reason ? '\nReason: ' + status.reason : ''));
    return ok('Address         Peer       Reachable  Status       Stratum\n' + (status.associations || []).map(x => M.ipStr(x.address).padEnd(16) + String(x.peer || '--').padEnd(11) + String(x.reachable).padEnd(11) + (x.synchronized ? 'synchronized' : 'unsynchronized').padEnd(13) + (x.stratum ?? '--')).join('\n') || '(no NTP associations)');
  }
  if (q === 'logging') {
    if (dev.syslogCollector || (dev.services && dev.services[514])) return ok('Syslog collector: ' + (dev.syslogEvents || []).length + ' events received\n' + (dev.syslogEvents || []).slice(-20).map(x => x.timestamp + ' ' + x.device + ' [' + (x.sourceIp || 'unknown') + '] ' + x.message).join('\n'));
    const cfg = dev.syslog || {};
    return ok('Syslog logging: ' + (cfg.enabled === false ? 'disabled' : 'enabled') + '\nTrap severity: ' + (cfg.severity ?? 6) + '\nSource interface: ' + (cfg.sourceInterface || 'default') + '\nHosts: ' + (cfg.hosts || []).map(M.ipStr).join(', ') + '\nLocal messages: ' + (cfg.local || []).length + '\nForwarded messages: ' + (cfg.forwarded || 0) + '\n' + (cfg.local || []).slice(-10).map(x => x.timestamp + ' ' + x.message).join('\n'));
  }
  if (q === 'ip dhcp pool' || q === 'ip dhcp binding' || q === 'ip dhcp server statistics') {
    const pool = dev.dhcp;
    if (q === 'ip dhcp binding') return ok('IP address       Client ID   Lease (days)\n' + Object.entries(pool && pool.bindings || {}).map(([id,x]) => M.ipStr(x.ip).padEnd(17) + id.padEnd(12) + x.leaseDays).join('\n') || '(no DHCP bindings)');
    if (q === 'ip dhcp server statistics') return ok('Pool: ' + (pool && pool.name || 'not configured') + '\nBindings: ' + Object.keys(pool && pool.bindings || {}).length + '\nExcluded ranges: ' + (pool && pool.excluded || []).length + '\nDHCP relay requests served: ' + Object.keys(pool && pool.bindings || {}).length);
    return ok(pool ? 'Pool ' + (pool.name || '(unnamed)') + '\nNetwork: ' + (pool.network ? M.ipStr(pool.network.net) + '/' + pool.network.prefix : 'not configured') + '\nDefault router: ' + (pool.defaultRouter == null ? 'not set' : M.ipStr(pool.defaultRouter)) + '\nDNS server: ' + (pool.dnsServer == null ? 'not set' : M.ipStr(pool.dnsServer)) + '\nDomain: ' + (pool.domainName || 'not set') + '\nLeases: ' + Object.keys(pool.bindings || {}).length : '% No DHCP pool configured');
  }
  if (q === 'startup-config' || q === 'start') return ok(dev.startupConfig || '% startup-config is not saved; use copy running-config startup-config');
  if (q === 'version') return ok('Network Operations Simulator\nIOS-style command profile (implemented subset)\nDevice: ' + (dev.hostname || dev.id) + '\nModel: ' + dev.kind + '\nConfiguration register: 0x2102');
  if (q === 'ip interface brief' || q === 'ip int brief' || q === 'interfaces' || q === 'ip interface') {
    const rows = Object.entries(dev.ifaces || {}).map(([n,p]) => {
      const ip = p.ip == null ? 'unassigned' : M.ipStr(p.ip);
      const status = p.up === false ? 'administratively down' : 'up';
      return n.padEnd(24) + ip.padEnd(16) + ' YES manual ' + status.padEnd(12) + (p.up === false ? 'down' : 'up');
    });
    return ok('Interface               IP-Address      OK? Method Status                Protocol\n' + rows.join('\n'));
  }
  if (q === 'ip route' || q === 'route') {
    const connected = Object.entries(dev.ifaces || {}).filter(([,p]) => p.ip != null && p.up !== false)
      .map(([n,p]) => 'C    ' + M.ipStr(M.networkOf(p.ip,p.mask)) + '/' + p.mask + ' is directly connected, ' + n);
    const statics = (dev.routes || []).map(r => 'S    ' + (r.mask === 0 ? '0.0.0.0/0' : M.ipStr(r.dest) + '/' + r.mask) + ' [1/0] via ' + M.ipStr(r.via));
    const ospf = M.ospfLearned(cli.net, cli.cur).map(r => 'O    ' + M.ipStr(r.dest) + '/' + r.mask + ' [110/' + (r.hops || 1) + '] via ' + M.ipStr(r.via) + ', OSPF');
    const bgp = M.bgpLearned(cli.net, cli.cur).map(r => 'B    ' + M.ipStr(r.dest) + '/' + r.mask + ' [20/0] via ' + M.ipStr(r.via) + ', BGP');
    return ok('Codes: C - connected, S - static, O - OSPF, B - BGP\\n' + (connected.concat(statics, ospf, bgp).join('\\n') || '% No routes'));
  }
  if (q === 'standby brief' || q === 'standby') {
    const rows = [];
    for (const [name, p] of Object.entries(dev.ifaces || {})) if (p.hsrp) {
      const s = M.hsrpStatus(cli.net, cli.cur, name);
      rows.push(String(p.hsrp.group).padEnd(7) + M.ipStr(p.hsrp.virtualIp).padEnd(17) +
        String(s && s.state || 'Unknown').padEnd(10) + String(s && s.priority || 0).padEnd(10) +
        (s && s.active || 'none') + ' (' + name + ')');
    }
    return ok('Grp    Virtual IP       State     Priority  Active router\n' + (rows.join('\n') || '(no HSRP groups configured)'));
  }
  if (q === 'ip bgp summary') {
    const sessions = M.bgpSessions(cli.net, cli.cur);
    return ok('BGP router identifier ' + (dev.bgp && dev.bgp.routerId != null ? M.ipStr(dev.bgp.routerId) : 'not set') +
      ', local AS number ' + (dev.bgp && dev.bgp.asn != null ? dev.bgp.asn : 'not configured') +
      '\\nNeighbor        V    AS       State/PfxRcd\\n' +
      (sessions.map(s => M.ipStr(s.ip).padEnd(16) + '4    ' + String(s.remoteAs).padEnd(9) +
        (s.up ? 'Established / ' + M.bgpLearned(cli.net,cli.cur).filter(r=>r.via===s.ip).length + ' prefixes' : s.reason)).join('\\n') || '(no BGP neighbors configured)'));
  }
  if (q === 'ip bgp' || q === 'ip bgp ipv4 unicast') {
    const rows = M.bgpLearned(cli.net, cli.cur).map(r => M.ipStr(r.dest) + '/' + r.mask + '     ' + M.ipStr(r.via) + '     ' + (r.asPath || []).join(' '));
    return ok('Network              Next Hop        Path\\n' + (rows.join('\\n') || '(no BGP routes received)'));
  }
  if (q === 'ip bgp neighbors') {
    const sessions = M.bgpSessions(cli.net, cli.cur);
    return ok(sessions.map(s => 'Neighbor ' + M.ipStr(s.ip) + ' remote AS ' + s.remoteAs +
      '\\n  Type: ' + s.type + '\\n  State: ' + (s.up ? 'Established' : s.reason) +
      '\\n  Inbound prefix-list: ' + (s.localNeighbor.inPrefixList || 'none') +
      '\\n  Outbound prefix-list: ' + (s.localNeighbor.outPrefixList || 'none')).join('\\n\\n') || '(no BGP neighbors configured)');
  }
  if (q.startsWith('ip bgp advertised-routes')) {
    const peerIp = words[3] ? parseIPv4(words[3]) : null;
    const rows = M.bgpAdvertised(cli.net, cli.cur, peerIp).map(r => M.ipStr(r.dest) + '/' + r.mask);
    return ok('Advertised prefixes' + (peerIp == null ? '' : ' to ' + M.ipStr(peerIp)) + ':\\n' + (rows.join('\\n') || '(none)'));
  }
  if (q === 'ip ospf neighbor') {
    const ns = M.ospfNeighbors(cli.net, cli.cur);
    return ok('Neighbor ID       State   Address         Interface\\n' + (ns.map(n => String((cli.net.devices[n.id].ospf && cli.net.devices[n.id].ospf.routerId != null) ? M.ipStr(cli.net.devices[n.id].ospf.routerId) : n.id).padEnd(18) + String(n.state || 'FULL').padEnd(8) + M.ipStr(n.ip).padEnd(16) + n.via).join('\\n') || '(no OSPF neighbors)'));
  }
  if (q === 'ip ospf interface brief') {
    const rows = Object.entries(dev.ifaces || {}).filter(([,p]) => p.ospf != null).map(([name,p]) => name.padEnd(18) + String(p.ospf).padEnd(10) + (p.up === false ? 'down' : 'up') + (dev.ospf && (dev.ospf.passiveInterfaces || []).includes(name) ? ' passive' : ''));
    return ok('Interface         Area      State\\n' + (rows.join('\\n') || '(no OSPF-enabled interfaces)'));
  }
  if (q === 'ip protocols') {
    const cfg = dev.ospf;
    return ok('Routing Protocol is ' + (cfg ? 'ospf ' + cfg.processId : 'not configured') + (cfg && cfg.routerId != null ? '\\nRouter ID: ' + M.ipStr(cfg.routerId) : '') + '\\nOSPF neighbors: ' + M.ospfNeighbors(cli.net, cli.cur).length + '\\nOSPF learned routes: ' + M.ospfLearned(cli.net, cli.cur).length);
  }
  if (q === 'vlan brief' || q === 'vlan') {
    if (dev.kind !== 'switch') return err('% VLAN database is available on switches only');
    const ids = [...new Set([1, ...(dev.vlans || [])])].sort((a,b)=>a-b);
    return ok('VLAN Name                             Status    Ports\n' + ids.map(id => {
      const ports = Object.entries(dev.ifaces).filter(([,p]) => p.mode !== 'trunk' && Number(p.accessVlan ?? p.vlan ?? 1) === id).map(([n])=>n).join(',');
      return String(id).padEnd(5) + String((dev.vlanNames || {})[id] || ('VLAN' + id)).padEnd(33) + 'active    ' + (ports || '');
    }).join('\n'));
  }
  if (q === 'interfaces status' || q === 'int status') {
    if (dev.kind !== 'switch') return err('% Port status is available on switches only');
    return ok('Port        Name                 Status       VLAN  Duplex Speed Type\n' + Object.entries(dev.ifaces).map(([n,p]) =>
      n.padEnd(12) + String(p.description || '').slice(0,20).padEnd(21) + (p.up === false ? 'disabled' : 'connected').padEnd(13) +
      String(p.mode === 'trunk' ? 'trunk' : Number(p.accessVlan ?? p.vlan ?? 1)).padEnd(6) + 'auto   auto  10/100/1000').join('\n'));
  }
  if (q === 'interfaces trunk' || q === 'int trunk') {
    if (dev.kind !== 'switch') return err('% Trunk status is available on switches only');
    const rows = Object.entries(dev.ifaces).filter(([,p])=>p.mode==='trunk').map(([n,p]) =>
      n.padEnd(12) + 'on'.padEnd(8) + String(p.nativeVlan ?? 1).padEnd(12) + (Array.isArray(p.allowedVlans) ? p.allowedVlans.join(',') : 'all'));
    return ok('Port        Mode    Native VLAN  Vlans allowed on trunk\n' + (rows.join('\n') || '(no trunk ports)'));
  }
  if (q === 'mac address-table dynamic' || q === 'mac address-table') {
    if (dev.kind !== 'switch') return err('% MAC address table is available on switches only');
    const rows = M.switchMacTable(cli.net, cli.cur).map(e => e.vlan + '    ' + e.mac + '    DYNAMIC     ' + e.port);
    return ok('          Mac Address Table\n-------------------------------------------\n' + (rows.join('\n') || '(no dynamically learned entries)'));
  }
  if (q === 'spanning-tree' || q === 'spanning-tree vlan 1' || /^spanning-tree vlan \d+$/.test(q)) {
    if (dev.kind !== 'switch') return err('% Spanning tree is available on switches only');
    const id = Number((q.match(/vlan (\d+)/) || [,'1'])[1]), tree = M.spanningTree(cli.net,id), state = tree.switches[cli.cur];
    if (!state) return err('% VLAN ' + id + ' is not active on this switch');
    const rows = Object.entries(state.ports).map(([p,x])=>p.padEnd(16)+x.role.padEnd(14)+x.state);
    return ok('VLAN' + id + ' spanning tree\nRoot ID    Priority ' + tree.switches[state.root].priority + ', Address ' + state.root +
      '\nBridge ID  Priority ' + state.priority + ', Address ' + cli.cur + '\nInterface        Role          Sts\n' + rows.join('\n'));
  }
  if (q === 'interfaces' || q === 'interface') {
    return ok(Object.entries(dev.ifaces).map(([n,p]) => n + ' is ' + (p.up === false ? 'down' : 'up') +
      ', line protocol is ' + (p.up === false ? 'down' : 'up') + (p.ip == null ? '' : ', Internet address is ' + M.ipStr(p.ip) + '/' + p.mask)).join('\n'));
  }
  return err('% Invalid input detected at show command — supported: show version, show running-config, show startup-config, show ip interface brief, show ip route, show vlan brief, show interfaces status|trunk, show mac address-table dynamic, show spanning-tree');
}
/* ---------------- Cisco ASA-style firewall operations ----------------
 * A separate, intentionally bounded ASA command profile. It shares the
 * packet engine but does not accept IOS router ACL command syntax.
 */
function asaPhysical(dev, nameif) {
  return Object.keys(dev.ifaces || {}).find(n => dev.ifaces[n].nameif === nameif) || null;
}
function asaAddress(words, at) {
  if (words[at] === 'object-group' && words[at + 1]) return { value: null, wildcard: null, group: words[at + 1].toUpperCase(), next: at + 2 };
  if (words[at] === 'any') return { value: null, wildcard: null, next: at + 1 };
  if (words[at] === 'host') {
    const value = parseIPv4(words[at + 1]);
    return value == null ? null : { value, wildcard: 0, next: at + 2 };
  }
  const value = parseIPv4(words[at]), mask = parseIPv4(words[at + 1]);
  const prefix = ciscoMaskPrefix(words[at + 1]);
  if (value == null || mask == null || prefix == null) return null;
  return { value: M.networkOf(value, prefix), wildcard: (~mask) >>> 0, next: at + 2 };
}
function asaAclEntry(words, name, seq, dev) {
  let at = 0;
  if (words[at] === 'line') { if (!/^\d+$/.test(words[at + 1] || '')) return null; seq = Number(words[at + 1]); at += 2; }
  if (words[at++] !== 'extended') return null;
  const action = words[at++], proto = words[at++];
  if (!['permit','deny'].includes(action) || !['ip','tcp','udp','icmp'].includes(proto)) return null;
  const src = asaAddress(words, at); if (!src) return null; at = src.next;
  const dst = asaAddress(words, at); if (!dst) return null; at = dst.next;
  for (const groupName of [src.group,dst.group].filter(Boolean)) if (!dev.asaObjectGroups || !dev.asaObjectGroups[groupName] || dev.asaObjectGroups[groupName].type !== 'network') return null;
  let dport = null, serviceGroup = null;
  if (words[at] === 'object-group' && words[at + 1]) { serviceGroup = words[at + 1].toUpperCase(); at += 2; const group = dev.asaObjectGroups && dev.asaObjectGroups[serviceGroup]; if (!group || group.type !== 'service' || group.protocol !== proto) return null; }
  else if (words[at] === 'eq' && ['tcp','udp'].includes(proto)) {
    const services = { www: 80, http: 80, https: 443, ssh: 22, domain: 53, smtp: 25 };
    dport = services[words[at + 1]] || Number(words[at + 1]);
    if (!Number.isInteger(dport) || dport < 1 || dport > 65535 || at + 2 !== words.length) return null;
    at += 2;
  }
  if (at !== words.length) return null;
  return { aclName: name, seq, action: action === 'deny' ? 'deny' : 'allow', proto, src: src.value, srcWildcard: src.wildcard, srcGroup: src.group || null, dst: dst.value, dstWildcard: dst.wildcard, dstGroup: dst.group || null, dport, serviceGroup };
}
function asaRunConfig(dev) {
  const lines = ['hostname ' + (dev.hostname || dev.id || 'ASA'), '!', 'interface configuration'];
  for (const [name, p] of Object.entries(dev.ifaces || {})) {
    lines.push('interface ' + name);
    if (p.nameif) lines.push(' nameif ' + p.nameif);
    if (p.securityLevel != null) lines.push(' security-level ' + p.securityLevel);
    if (p.ip != null) lines.push(' ip address ' + M.ipStr(p.ip) + ' ' + ciscoPrefixMask(p.mask));
    lines.push(p.up === false ? ' shutdown' : ' no shutdown');
  }
  for (const [name, group] of Object.entries(dev.asaObjectGroups || {})) {
    lines.push('object-group ' + group.type + ' ' + name);
    if (group.type === 'network') for (const member of group.members || []) { if (member.host != null) lines.push(' network-object host ' + M.ipStr(member.host)); else if (member.network) lines.push(' network-object ' + M.ipStr(member.network.net) + ' ' + ciscoPrefixMask(member.network.prefix)); }
    if (group.type === 'service') for (const port of group.ports || []) lines.push(' service-object ' + group.protocol + ' destination eq ' + port);
  }
  for (const name of [...new Set((dev.acls || []).map(r => r.aclName).filter(Boolean))]) {
    for (const r of (dev.acls || []).filter(x => x.aclName === name).sort((a,b)=>(a.seq||0)-(b.seq||0))) {
      const address = (v,w) => v == null ? 'any' : (w === 0 ? 'host ' + M.ipStr(v) : M.ipStr(v) + ' ' + M.ipStr((~w) >>> 0));
      lines.push('access-list ' + name + ' extended ' + (r.action === 'deny' ? 'deny' : 'permit') + ' ' + r.proto + ' ' +
        (r.srcGroup ? 'object-group ' + r.srcGroup : address(r.src,r.srcWildcard)) + ' ' + (r.dstGroup ? 'object-group ' + r.dstGroup : address(r.dst,r.dstWildcard)) +
        (r.serviceGroup ? ' object-group ' + r.serviceGroup : (r.dport == null ? '' : ' eq ' + r.dport)));
    }
  }
  for (const [name,p] of Object.entries(dev.ifaces || {})) if (p.accessGroups && p.accessGroups.in)
    lines.push('access-group ' + p.accessGroups.in + ' in interface ' + (p.nameif || name));
  for (const [name,obj] of Object.entries(dev.asaObjects || {})) {
    lines.push('object network ' + name);
    if (obj.host != null) lines.push(' host ' + M.ipStr(obj.host));
    for (const r of dev.nat || []) if (r.asaObject === name)
      lines.push(' nat (' + r.insideName + ',' + r.outsideName + ') static interface service ' + r.proto + ' ' + r.publicPort + ' ' + r.privatePort);
  }
  for (const r of dev.routes || []) lines.push('route ' + r.iface + ' ' + (r.mask === 0 ? '0.0.0.0 0.0.0.0' : M.ipStr(r.dest) + ' ' + ciscoPrefixMask(r.mask)) + ' ' + M.ipStr(r.via));
  return lines.join('\n') + '\n';
}
function asaShow(cli, words) {
  const dev = cli.net.devices[cli.cur], q = words.join(' ').toLowerCase();
  if (q === 'version') return ok('Cisco Adaptive Security Appliance Software (simulated command profile)\nDevice: ' + (dev.hostname || dev.id) + '\nModel: ASA-style firewall operations\nThis is an educational command subset, not Cisco ASA software.');
  if (q === 'running-config' || q === 'run') return ok('Building configuration...\n!\n' + asaRunConfig(dev) + 'end');
  if (q === 'interface ip brief' || q === 'interface') {
    return ok('Interface              IP-Address      Nameif     Security-level  Status\n' +
      Object.entries(dev.ifaces).map(([n,p]) => n.padEnd(23) + (p.ip == null ? 'unassigned' : M.ipStr(p.ip)).padEnd(16) +
        String(p.nameif || '--').padEnd(11) + String(p.securityLevel ?? 0).padEnd(17) + (p.up === false ? 'administratively down' : 'up')).join('\n'));
  }
  if (q === 'access-list' || q.startsWith('access-list ')) {
    const wanted = words[1] && words[1].toUpperCase();
    const names = [...new Set((dev.acls || []).filter(r => r.aclName && (!wanted || r.aclName === wanted)).map(r => r.aclName))];
    if (wanted && !names.length) return ok('% No access lists found');
    const addr = (v,w) => v == null ? 'any' : (w === 0 ? 'host ' + M.ipStr(v) : M.ipStr(v) + ' ' + M.ipStr((~w) >>> 0));
    return ok(names.map(name => 'access-list ' + name + '\n' +
      (dev.acls || []).filter(r => r.aclName === name).sort((a,b)=>(a.seq||0)-(b.seq||0))
        .map(r => ' ' + (r.seq || 10) + ': ' + (r.action === 'deny' ? 'deny' : 'permit') + ' ' + r.proto + ' ' +
          (r.srcGroup ? 'object-group ' + r.srcGroup : addr(r.src,r.srcWildcard)) + ' ' + (r.dstGroup ? 'object-group ' + r.dstGroup : addr(r.dst,r.dstWildcard)) + (r.serviceGroup ? ' object-group ' + r.serviceGroup : (r.dport == null ? '' : ' eq ' + r.dport)) +
          ' (' + (r.hits || 0) + matchesText(r.hits) + ')').join('\n')).join('\n') || '% No access lists configured');
  }
  if (q === 'object-group' || q.startsWith('object-group ')) {
    const wanted = words[1] && words[1].toUpperCase();
    const groups = Object.entries(dev.asaObjectGroups || {}).filter(([name])=>!wanted || name===wanted);
    return ok(groups.map(([name,g]) => 'object-group ' + g.type + ' ' + name + '\n' + (g.type === 'network' ? (g.members || []).map(x=>x.host != null ? ' network-object host ' + M.ipStr(x.host) : ' network-object ' + M.ipStr(x.network.net) + ' ' + ciscoPrefixMask(x.network.prefix)).join('\n') : (g.ports || []).map(port=>' service-object '+g.protocol+' destination eq '+port).join('\n'))).join('\n') || '% No object groups configured');
  }
  if (q === 'access-group') {
    const rows = Object.entries(dev.ifaces).filter(([,p])=>p.accessGroups && p.accessGroups.in)
      .map(([n,p])=>p.accessGroups.in + ' in interface ' + (p.nameif || n));
    return ok(rows.join('\n') || '(no access groups applied)');
  }
  if (q === 'nat' || q === 'nat detail') {
    const rows = (dev.nat || []).filter(r=>r.asaObject).map(r =>
      '1 (' + r.insideName + ') to (' + r.outsideName + ') source static ' + r.asaObject + ' interface service ' + r.proto + ' ' + r.publicPort + ' ' + r.privatePort);
    return ok(rows.join('\n') || '(no ASA object NAT rules configured)');
  }
  if (q === 'route' || q === 'route detail') {
    const rows = [];
    for (const [n,p] of Object.entries(dev.ifaces)) if (p.ip != null && p.up !== false)
      rows.push('C ' + M.ipStr(M.networkOf(p.ip,p.mask)) + '/' + p.mask + ' is directly connected, ' + (p.nameif || n));
    for (const r of dev.routes || []) rows.push('S ' + M.ipStr(r.dest) + '/' + r.mask + ' via ' + M.ipStr(r.via));
    return ok(rows.join('\n') || '(no routes)');
  }
  return err('% Invalid show command — supported: show version, show running-config, show interface ip brief, show access-list, show access-group, show nat, show route');
}
function matchesText(hits) { return hits === 1 ? ' match' : ' matches'; }
function runASA(cli, line) {
  const raw = line.trim(), words = raw.toLowerCase().split(/\s+/), dev = cli.net.devices[cli.cur];
  if (!raw) return ok('');
  if (words[0] === 'enable') { cli.asaMode = 'privileged'; return ok(''); }
  if (words[0] === 'disable') { cli.asaMode = 'user'; return ok(''); }
  if (words[0] === 'configure' && words[1] === 'terminal') {
    if (cli.asaMode === 'user') return err('% Enable mode required');
    cli.asaMode = 'config'; return ok('Enter configuration commands, one per line.');
  }
  if (words[0] === 'end') { cli.asaMode = 'privileged'; cli.asaIface = null; cli.asaObject = null; return ok(''); }
  if (words[0] === 'exit') {
    if (cli.asaMode === 'interface' || cli.asaMode === 'object' || cli.asaMode === 'object-group') { cli.asaMode = 'config'; cli.asaIface = null; cli.asaObject = null; cli.asaObjectGroup = null; return ok(''); }
    if (cli.asaMode === 'config') { cli.asaMode = 'privileged'; return ok(''); }
    if (cli.asaMode === 'privileged') { cli.asaMode = 'user'; return ok(''); }
  }
  if (words[0] === 'show') {
    const q = words.slice(1);
    if (q[0] === 'access-list' || q[0] === 'access-group' || q[0] === 'object-group' || q[0] === 'nat' || q[0] === 'route' || q[0] === 'interface' || q[0] === 'version' || q[0] === 'running-config' || q[0] === 'run')
      return asaShow(cli,q);
  }
  if (words[0] === 'packet-tracer' && words[1] === 'input') {
    if (words.length !== 8 || !['tcp','udp','icmp'].includes(words[3])) return err('usage: packet-tracer input <nameif> tcp|udp|icmp <src-ip> <src-port> <dst-ip> <dst-port>');
    const phys = asaPhysical(dev, words[2]), src = parseIPv4(words[4]), dst = parseIPv4(words[6]);
    const sport = Number(words[5]), dport = Number(words[7]);
    if (!phys || src == null || dst == null || !Number.isInteger(sport) || !Number.isInteger(dport) || sport < 0 || sport > 65535 || dport < 0 || dport > 65535)
      return err('% Invalid packet-tracer interface, address, or port');
    const sourceDev = M.deviceOwning(cli.net, src);
    if (!sourceDev || !M.l2Domain(cli.net, cli.cur, phys).some(pair=>pair[0]===sourceDev))
      return err('% Source host is not present on the selected ingress segment');
    const trace = M.forward(cli.net, sourceDev, { src, dst, proto: words[3], sport, dport });
    return ok('Phase: ACCESS-LIST / NAT / ROUTE\nInput interface: ' + words[2] + '\n' +
      'Result: ' + (trace.ok ? 'ALLOW' : 'DROP') + '\nReason: ' + trace.reason + '\nPath: ' + trace.path.join(' -> '));
  }
  if (words[0] === 'clear' && words[1] === 'access-list' && (words.length===2 || words.length===3)) {
    if(cli.asaMode==='user')return err('% Enable mode required'); const name=words[2]&&words[2].toUpperCase(); let count=0;
    for(const rule of dev.acls||[])if(rule.aclName&&(!name||rule.aclName===name)){rule.hits=0;count++;} return ok('Cleared hit counters on '+count+' ACL entries');
  }
  if (words[0] === 'write' && words[1] === 'memory') {
    if (cli.asaMode === 'user') return err('% Enable mode required');
    dev.startupConfig = asaRunConfig(dev); return ok('Cryptochecksum: simulated\n[OK]');
  }
  if (cli.asaMode === 'config') {
    if (words[0] === 'hostname' && words[1]) { dev.hostname = raw.split(/\s+/).slice(1).join(' '); return ok(''); }
    if (words[0] === 'interface' && words[1]) {
      const name = ciscoIface(dev, raw.split(/\s+/)[1]);
      if (!name) return err('% Invalid interface');
      cli.asaIface = name; cli.asaMode = 'interface'; return ok('Interface configuration mode');
    }
    if (words[0] === 'access-list' && words[1]) {
      const name = words[1].toUpperCase(); let at = 2;
      let seq = Math.max(0,...(dev.acls || []).filter(r=>r.aclName===name).map(r=>r.seq || 0)) + 10;
      const entry = asaAclEntry(words.slice(at),name,seq,dev);
      if (!entry) return err('% Invalid ASA ACL — use access-list NAME extended permit|deny ip|tcp|udp|icmp source destination [eq port]');
      dev.acls = dev.acls || [];
      if (dev.acls.some(r=>r.aclName===name && r.seq===entry.seq)) return err('% ACL line already exists');
      dev.acls.push(entry); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'access-list' && words[2] && words[3] === 'line' && /^\d+$/.test(words[4] || '')) {
      const seq = Number(words[4]); dev.acls = (dev.acls || []).filter(r=>!(r.aclName === words[2].toUpperCase() && r.seq === seq)); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'access-list' && words[2]) {
      dev.acls = (dev.acls || []).filter(r=>r.aclName !== words[2].toUpperCase()); return ok('');
    }
    if (words[0] === 'access-group' && words.length === 5 && words[2] === 'in' && words[3] === 'interface') {
      const name = words[1].toUpperCase(), phys = asaPhysical(dev, words[4]);
      if (!phys || !(dev.acls || []).some(r=>r.aclName===name)) return err('% ACL or interface nameif not found');
      dev.ifaces[phys].accessGroups = dev.ifaces[phys].accessGroups || {};
      dev.ifaces[phys].accessGroups.in = name; return ok('');
    }
    if (words[0] === 'no' && words[1] === 'access-group' && words[2] && words[3] === 'in' && words[4] === 'interface') {
      const phys = asaPhysical(dev, words[5]);
      if (!phys) return err('% Interface nameif not found');
      const groups = dev.ifaces[phys].accessGroups || {};
      if (groups.in === words[2].toUpperCase()) delete groups.in;
      return ok('');
    }
    if (words[0] === 'object-group' && ['network','service'].includes(words[1]) && words[2]) {
      const name = words[2].toUpperCase(), type = words[1]; dev.asaObjectGroups = dev.asaObjectGroups || {};
      if (dev.asaObjectGroups[name] && dev.asaObjectGroups[name].type !== type) return err('% Object-group type cannot be changed');
      dev.asaObjectGroups[name] = dev.asaObjectGroups[name] || {type,members:[],ports:[],protocol:type==='service'?'tcp':null};
      cli.asaObjectGroup = name; cli.asaMode = 'object-group'; return ok('Object-group configuration mode');
    }
    if (words[0] === 'no' && words[1] === 'object-group' && words[2]) {
      const name=(words.length===4 && ['network','service'].includes(words[2]) ? words[3] : words[2]).toUpperCase();
      if ((dev.acls||[]).some(r=>r.srcGroup===name||r.dstGroup===name||r.serviceGroup===name)) return err('% Object-group is referenced by an ACL');
      delete (dev.asaObjectGroups||{})[name]; return ok('');
    }
    if (words[0] === 'object' && words[1] === 'network' && words[2]) {
      dev.asaObjects = dev.asaObjects || {}; dev.asaObjects[words[2].toUpperCase()] = dev.asaObjects[words[2].toUpperCase()] || {};
      cli.asaObject = words[2].toUpperCase(); cli.asaMode = 'object'; return ok('Network object configuration mode');
    }
    if (words[0] === 'route' && (words.length === 5 || words.length === 6)) {
      const phys = asaPhysical(dev, words[1]), dest = parseIPv4(words[2]), prefix = ciscoMaskPrefix(words[3]), via = parseIPv4(words[4]);
      const metric = words[5] == null ? 1 : Number(words[5]);
      const gwIf = via == null ? null : M.directIface(dev,via);
      if (!phys || dest == null || prefix == null || via == null || gwIf !== phys ||
          Object.values(dev.ifaces).some(p=>p.ip===via) || !Number.isInteger(metric) || metric < 1 || metric > 255)
        return err('% Invalid ASA route — use route <nameif> <network> <mask> <next-hop> [1-255]');
      const network = M.networkOf(dest,prefix);
      dev.routes = (dev.routes || []).filter(r=>!(r.dest===network && r.mask===prefix && r.iface===phys));
      dev.routes.push({dest:network,mask:prefix,via,iface:phys,metric});
      return ok('');
    }
    if (words[0] === 'no' && words[1] === 'route' && words.length === 5) {
      const phys = asaPhysical(dev, words[2]), dest = parseIPv4(words[3]), prefix = ciscoMaskPrefix(words[4]);
      if (!phys || dest == null || prefix == null) return err('% Invalid ASA route removal');
      const network = M.networkOf(dest,prefix), before = (dev.routes || []).length;
      dev.routes = (dev.routes || []).filter(r=>!(r.dest===network && r.mask===prefix && r.iface===phys));
      return before === dev.routes.length ? err('% Route not found') : ok('');
    }
    return err('% Invalid input in ASA global configuration mode');
  }
  if (cli.asaMode === 'interface') {
    const p = dev.ifaces[cli.asaIface]; if (!p) return err('% Interface context no longer exists');
    if (words[0] === 'nameif' && words[1] && words.length === 2) {
      if (Object.entries(dev.ifaces).some(([n,x])=>n!==cli.asaIface && x.nameif===words[1])) return err('% nameif is already assigned');
      p.nameif = words[1]; return ok('');
    }
    if (words[0] === 'security-level' && words.length === 2) {
      const n = Number(words[1]); if (!Number.isInteger(n) || n < 0 || n > 100) return err('% Security level must be 0–100');
      p.securityLevel = n; return ok('');
    }
    if (words[0] === 'ip' && words[1] === 'address' && words.length === 4) {
      const address = parseIPv4(words[2]), prefix = ciscoMaskPrefix(words[3]);
      if (address == null || prefix == null) return err('% Invalid IP address or subnet mask');
      for (const [id,other] of Object.entries(cli.net.devices)) for (const [n,f] of Object.entries(other.ifaces || {}))
        if (f.up !== false && f.ip === address && !(id===cli.cur && n===cli.asaIface)) return err('% Address already in use');
      p.ip = address; p.mask = prefix; return ok('');
    }

    if (words[0] === 'description') { p.description = raw.split(/\s+/).slice(1).join(' '); return ok(''); }
    if (words[0] === 'shutdown') { p.up = false; return ok(''); }
    if (words[0] === 'no' && words[1] === 'shutdown') { p.up = true; return ok(''); }
    return err('% Invalid ASA interface command');
  }
  if (cli.asaMode === 'object-group') {
    const group=dev.asaObjectGroups && dev.asaObjectGroups[cli.asaObjectGroup]; if (!group) return err('% Object-group context no longer exists');
    if (group.type==='network' && words[0]==='network-object' && words[1]==='host' && words.length===3) { const host=parseIPv4(words[2]); if(host==null)return err('% Invalid host address'); if(!group.members.some(x=>x.host===host))group.members.push({host}); return ok(''); }
    if (group.type==='network' && words[0]==='network-object' && words.length===3) { const address=parseIPv4(words[1]),prefix=ciscoMaskPrefix(words[2]); if(address==null||prefix==null)return err('% Invalid network-object subnet'); const network={net:M.networkOf(address,prefix),prefix}; if(!group.members.some(x=>x.network&&x.network.net===network.net&&x.network.prefix===prefix))group.members.push({network}); return ok(''); }
    if (group.type==='service' && words[0]==='service-object' && words.length===5 && ['tcp','udp'].includes(words[1]) && words[2]==='destination' && words[3]==='eq') { const port=Number(words[4]); if(!Number.isInteger(port)||port<1||port>65535)return err('% Invalid service port'); if(group.ports.length&&group.protocol!==words[1])return err('% A service group uses one protocol'); group.protocol=words[1]; if(!group.ports.includes(port))group.ports.push(port); return ok(''); }
    return err(group.type==='network'?'% Use network-object host <ip> or network-object <network> <mask>':'% Use service-object tcp|udp destination eq <port>');
  }
  if (cli.asaMode === 'object') {
    const obj = dev.asaObjects[cli.asaObject];
    if (words[0] === 'host' && words.length === 2) {
      const host = parseIPv4(words[1]); if (host == null) return err('% Invalid host address');
      obj.host = host; return ok('');
    }
    if (words[0] === 'subnet' && words.length === 3) {
      const net = parseIPv4(words[1]), prefix = ciscoMaskPrefix(words[2]);
      if (net == null || prefix == null) return err('% Invalid subnet');
      obj.network = { net: M.networkOf(net,prefix), prefix }; return ok('');
    }
    if (words[0] === 'nat' && words.length === 8 && words[1].startsWith('(') && words[2] === 'static' && words[3] === 'interface' && words[4] === 'service' && words[5] === 'tcp') {
      const pair = words[1].slice(1,-1).split(','), inside = asaPhysical(dev,pair[0]), outside = asaPhysical(dev,pair[1]);
      const publicPort = Number(words[6]), privatePort = Number(words[7]);
      if (pair.length !== 2 || !inside || !outside || obj.host == null || publicPort !== privatePort ||
          !Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535) return err('% Supported static PAT requires known nameifs, a host object, TCP, and identical public/private ports');
      dev.nat = (dev.nat || []).filter(r=>r.asaObject!==cli.asaObject);
      dev.nat.push({kind:'dnat',oif:outside,toIp:obj.host,proto:'tcp',dport:publicPort,asaObject:cli.asaObject,insideName:pair[0],outsideName:pair[1],publicPort,privatePort});
      return ok('');
    }
    if (words[0] === 'no' && words[1] === 'nat') {
      dev.nat = (dev.nat || []).filter(r=>r.asaObject!==cli.asaObject); return ok('');
    }
    return err('% Invalid network object command — use host, subnet, or nat (inside,outside) static interface service tcp <port> <port>');
  }
  if (words[0] === 'help' || words[0] === '?') return ok([
    'ASA FIREWALL COMMANDS',
    '',
    'DEVICE SETUP',
    '  enable                         Enter privileged mode',
    '  configure terminal             Enter global configuration mode',
    '  interface <physical-if>        Select a physical firewall interface',
    '  nameif <name>                   Give an interface a logical name',
    '  security-level <0-100>          Set the interface trust level',
    '',
    'NETWORK OBJECTS',
    '  object-group network <name>     Create a reusable network group',
    '  network-object host <ip>        Add one host to a network group',
    '  network-object <network> <mask> Add a subnet to a network group',
    '  object-group service <name>     Create a reusable service group',
    '  service-object tcp|udp ...      Add a protocol and destination port',
    '',
    'ACCESS CONTROL AND NAT',
    '  access-list <name> ...          Permit or deny matching traffic',
    '  access-group <name> in ...      Apply an access list to an interface',
    '  no access-group ...             Remove an access-list binding',
    '  show access-list                Review firewall access rules',
    '  show access-group               Check where access lists are applied',
    '  show object-group               Inspect network and service groups',
    '  show nat                        Review address-translation rules',
    '',
    'TROUBLESHOOTING AND SAVING',
    '  packet-tracer input ...         Simulate a packet through firewall policy',
    '  show route                      Inspect the firewall routing table',
    '  clear access-list [name]        Clear access-list counters',
    '  write memory                    Save the running configuration',
    '',
    'Traffic not matched by an access rule is denied by the implicit deny rule.',
    'This is an educational ASA-style command subset, not Cisco ASA software.'
  ].join('\n'));
  if (words[0] === 'ping' || words[0] === 'traceroute' || words[0] === 'nmap' || words[0] === 'help' || words[0] === 'man')
    return dispatch(cli, raw);
  return err('% Invalid ASA command — use show, packet-tracer, configure terminal, or help');
}

/* ---------------- device brands / command dialects ----------------
 * A brand sets which command surface a device presents. `family` is what the
 * simulator can actually EXECUTE:
 *   'linux'     — the generic hybrid command set (today's default)
 *   'ios'       — Cisco IOS; Arista EOS maps here too (IOS-compatible)
 *   'asa'       — Cisco ASA firewall (routed to the ASA engine)
 *   'reference' — no native execution yet; `help` is the accurate vendor
 *                 command card and the device runs the core engine. Used for
 *                 Juniper Junos and Palo Alto PAN-OS, whose set/commit syntax
 *                 would need dedicated parsers.
 * Default is 'generic' so the existing missions (which set no brand) are
 * unaffected. `note` is shown under the help header. */
const BRANDS = {
  'generic':        { label: 'Generic (Linux)',   kinds: ['host', 'server', 'switch', 'router', 'firewall'], family: 'linux' },
  'cisco-ios':      { label: 'Cisco IOS',          kinds: ['switch', 'router', 'firewall'], family: 'ios' },
  'arista-eos':     { label: 'Arista EOS',         kinds: ['switch', 'router'], family: 'ios', note: 'Arista EOS uses Cisco-style syntax; the IOS commands below apply.' },
  'cisco-asa':      { label: 'Cisco ASA',          kinds: ['firewall'], family: 'asa' },
  'juniper-junos':  { label: 'Juniper Junos',      kinds: ['switch', 'router', 'firewall'], family: 'junos' },
  'paloalto-panos': { label: 'Palo Alto PAN-OS',   kinds: ['firewall'], family: 'panos' },
};
function deviceBrand(dev) { const b = dev && dev.brand; return BRANDS[b] ? b : 'generic'; }
function brandProfile(dev) { return BRANDS[deviceBrand(dev)]; }
function brandsForKind(kind) { return Object.keys(BRANDS).filter(id => BRANDS[id].kinds.includes(kind)); }
function isLinuxDialect(words) {
  if (['iptables', 'ip6tables', 'dhclient', 'resolvectl', 'ifconfig', 'tcpdump', 'nmap', 'dig'].includes(words[0])) return true;
  if (words[0] === 'ip' && ['addr', 'a', 'link', 'l'].includes(words[1])) return true;   // Linux `ip addr` / `ip link`
  return false;
}

/* Accurate, publicly-documented command references for brands the engine does
 * not natively execute. Each item is [command, description, kinds]. These teach
 * the vendor CLI vocabulary; exact syntax/options should be checked against the
 * vendor's current documentation. */
const JUNOS_REF = {
  intro: 'Juniper Junos reference. Operational commands run from the prompt; configuration is entered under "configure" and applied with "commit".',
  sections: [
    { h: 'OPERATIONAL MODE', items: [
      ['show interfaces terse', 'Summarise interfaces and addresses', ['switch', 'router', 'firewall']],
      ['show route', 'Display the routing table', ['router', 'firewall']],
      ['show ospf neighbor', 'Check OSPF adjacencies', ['router']],
      ['show bgp summary', 'Inspect BGP sessions', ['router']],
      ['show vlans', 'List VLAN membership (EX switches)', ['switch']],
      ['show spanning-tree bridge', 'Inspect spanning-tree state', ['switch']],
      ['show security policies', 'Review security policies (SRX)', ['firewall']],
      ['show security flow session', 'List active sessions (SRX)', ['firewall']],
      ['show arp', 'Display the ARP table', ['switch', 'router', 'firewall']],
      ['show configuration', 'Display the active configuration', ['switch', 'router', 'firewall']],
      ['ping <host> / traceroute <host>', 'Test reachability and path', ['switch', 'router', 'firewall']],
    ]},
    { h: 'CONFIGURATION MODE (configure)', items: [
      ['set interfaces <if> unit 0 family inet address <ip>/<pfx>', 'Assign an interface address', ['switch', 'router', 'firewall']],
      ['set routing-options static route <dest>/<pfx> next-hop <ip>', 'Add a static route', ['router', 'firewall']],
      ['set protocols ospf area 0.0.0.0 interface <if>', 'Enable OSPF on an interface', ['router']],
      ['set vlans <name> vlan-id <id>', 'Create a VLAN (EX switches)', ['switch']],
      ['set security policies from-zone <z> to-zone <z> policy <name> ...', 'Define a security policy (SRX)', ['firewall']],
      ['set security nat source rule-set <name> ...', 'Define source NAT (SRX)', ['firewall']],
      ['commit', 'Apply the candidate configuration', ['switch', 'router', 'firewall']],
      ['delete <path>', 'Remove configuration', ['switch', 'router', 'firewall']],
      ['rollback', 'Discard candidate changes', ['switch', 'router', 'firewall']],
    ]},
  ],
};
const PANOS_REF = {
  intro: 'Palo Alto PAN-OS reference. Operational commands run from the prompt; configuration is entered under "configure" and applied with "commit".',
  sections: [
    { h: 'OPERATIONAL MODE', items: [
      ['show interface all', 'List interfaces and addresses', ['firewall']],
      ['show routing route', 'Display the routing table', ['firewall']],
      ['show session all', 'List active sessions', ['firewall']],
      ['show running security-policy', 'Show the effective security rules', ['firewall']],
      ['test security-policy-match from <z> to <z> source <ip> destination <ip> ...', 'Check which rule a flow matches', ['firewall']],
      ['show system info', 'Display system and version details', ['firewall']],
      ['ping host <ip> / traceroute host <ip>', 'Test reachability and path', ['firewall']],
    ]},
    { h: 'CONFIGURATION MODE (configure)', items: [
      ['set network interface ethernet <if> layer3 ip <ip>/<pfx>', 'Assign an interface address', ['firewall']],
      ['set network virtual-router <vr> routing-table ip static-route <name> ...', 'Add a static route', ['firewall']],
      ['set rulebase security rules <name> from <z> to <z> source <x> destination <y> application <a> service <s> action <allow|deny>', 'Define a security rule', ['firewall']],
      ['set network nat-rules <name> ...', 'Define a NAT rule', ['firewall']],
      ['commit', 'Apply the candidate configuration', ['firewall']],
      ['delete <path>', 'Remove configuration', ['firewall']],
    ]},
  ],
};
const REFERENCE_CARDS = { 'juniper-junos': JUNOS_REF, 'paloalto-panos': PANOS_REF };

/* ---------------- vendor execution layers (Juniper Junos, Palo Alto PAN-OS) ----------------
 * These translate vendor CLI into the SAME model mutations the IOS path uses
 * (dev.ifaces[x].ip/mask, dev.routes, dev.ifaces[x].ospf, dev.acls), so they
 * drive the real engine — reachability, routing and ACL filtering all apply.
 * Both model the candidate/commit workflow: set/delete stage changes on
 * cli.cfg, commit applies them. Coverage is the core L3 config+verify loop
 * (plus OSPF for Junos and security policy for PAN-OS); other listed commands
 * remain reference. */
function vParseCidr(tok) {
  if (!tok) return null;
  const parts = String(tok).split('/'); const ip = parseIPv4(parts[0]); const prefix = parts.length > 1 ? Number(parts[1]) : 32;
  if (ip == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { ip, prefix };
}
function vCidrNet(tok) { if (!tok || String(tok).toLowerCase() === 'any') return null; const c = vParseCidr(tok); return c ? { net: M.networkOf(c.ip, c.prefix), prefix: c.prefix } : null; }
function vSetIface(dev, iface, ip, prefix) { dev.ifaces[iface] = dev.ifaces[iface] || { up: true }; dev.ifaces[iface].ip = ip; dev.ifaces[iface].mask = prefix; dev.ifaces[iface].up = true; }
function vAddRoute(dev, dest, prefix, via) { dev.routes = (dev.routes || []).filter(r => !(r.dest === dest && r.mask === prefix)); dev.routes.push({ dest, mask: prefix, via }); }
function vStage(cli, sign, describe, apply) { cli.cfg = cli.cfg || []; cli.cfg.push({ sign, describe, apply }); }
function vResolveJunosIface(dev, tok) { if (!tok) return null; if (dev.ifaces[tok]) return tok; const m = /^(?:ge|xe|et|em|fe)-\d+\/\d+\/(\d+)$/.exec(tok); return (m && dev.ifaces['eth' + m[1]]) ? 'eth' + m[1] : null; }
function vResolvePanIface(dev, tok) { if (!tok) return null; if (dev.ifaces[tok]) return tok; const m = /^ethernet\d+\/(\d+)$/.exec(tok); if (m) { const cand = 'eth' + (Number(m[1]) - 1); if (dev.ifaces[cand]) return cand; } return null; }
function vServicePort(svc) {
  if (!svc) return null; const key = String(svc).toLowerCase();
  if (['any', 'application-default'].includes(key)) return null;
  const map = { 'service-http': { proto: 'tcp', dport: 80 }, http: { proto: 'tcp', dport: 80 }, 'web-browsing': { proto: 'tcp', dport: 80 }, 'service-https': { proto: 'tcp', dport: 443 }, https: { proto: 'tcp', dport: 443 }, ssl: { proto: 'tcp', dport: 443 }, ssh: { proto: 'tcp', dport: 22 }, 'service-ssh': { proto: 'tcp', dport: 22 }, dns: { proto: 'udp', dport: 53 } };
  if (map[key]) return map[key];
  const m = /^(tcp|udp)\/(\d+)$/.exec(key); return m ? { proto: m[1], dport: Number(m[2]) } : null;
}
function vPingTo(cli, token) {
  if (!token) return err('error: expected a destination host');
  const rt = resolveTarget(cli, token); if (rt.err) return err('ping: ' + rt.err);
  const r = M.ping(cli.net, cli.cur, rt.ip, {});
  const path = ((r.forward && r.forward.path) || [cli.cur]).join(' -> ');
  cli.flows = cli.flows || []; cli.flows.unshift({ t: Date.now(), from: cli.cur, dst: rt.ip, ok: r.ok, path: (r.forward && r.forward.path) || [cli.cur] }); if (cli.flows.length > 12) cli.flows.length = 12;
  return r.ok ? ok('PING ' + token + ' (' + M.ipStr(rt.ip) + '): reachable\npath: ' + path) : err('PING ' + token + ' (' + M.ipStr(rt.ip) + '): ' + r.reason + '\npath: ' + path);
}
function vTraceTo(cli, token) {
  if (!token) return err('error: expected a destination host');
  const rt = resolveTarget(cli, token); if (rt.err) return err('traceroute: ' + rt.err);
  const r = M.ping(cli.net, cli.cur, rt.ip, {}); const path = (r.forward && r.forward.path) || [cli.cur];
  return ok(path.map((h, i) => ' ' + (i + 1) + '  ' + h).join('\n') + (r.ok ? '' : '\n (destination not reached)'));
}
function vShowArp(cli, dev) {
  const id = cli.cur, rows = [];
  for (const l of cli.net.links || []) {
    let myIf, peerId, peerIf;
    if (l.a[0] === id) { myIf = l.a[1]; peerId = l.b[0]; peerIf = l.b[1]; }
    else if (l.b[0] === id) { myIf = l.b[1]; peerId = l.a[0]; peerIf = l.a[1]; }
    else continue;
    const f = dev.ifaces[myIf], peer = cli.net.devices[peerId], pf = peer && peer.ifaces && peer.ifaces[peerIf];
    if (f && f.ip != null && f.up !== false && pf && pf.ip != null) rows.push(M.ipStr(pf.ip).padEnd(18) + M.stableMac(peerId, peerIf).padEnd(20) + myIf);
  }
  return ok(rows.length ? 'Address           MAC                 Interface\n' + rows.join('\n') : '(no ARP entries)');
}

function runJunos(cli, raw) {
  const dev = cli.net.devices[cli.cur];
  const line = raw.trim(), words = line.split(/\s+/), w = words.map(s => s.toLowerCase());
  if (!w[0]) return ok('');
  if (w[0] === 'help' || w[0] === '?') return ok(buildHelp(dev));
  if (line === 'configure' || line === 'edit' || line === 'configure exclusive') { cli.cfgMode = true; cli.cfg = cli.cfg || []; return ok('Entering configuration mode\n[edit]'); }
  if (cli.cfgMode) return junosConfig(cli, words, w, line, dev);
  return junosOperational(cli, words, w, dev);
}
function junosConfig(cli, words, w, line, dev) {
  if (w[0] === 'commit') { const ops = cli.cfg || []; ops.forEach(o => o.apply()); const n = ops.length; cli.cfg = []; if (w.includes('and-quit')) cli.cfgMode = false; return ok('commit complete' + (n ? '' : ' (no changes to commit)')); }
  if (w[0] === 'rollback') { cli.cfg = []; return ok('load complete (candidate configuration discarded)'); }
  if (line === 'show | compare' || (w[0] === 'show' && w[1] === '|' && w[2] === 'compare')) { const ops = cli.cfg || []; return ok(ops.length ? ops.map(o => o.sign + ' ' + o.describe).join('\n') : '(no uncommitted changes)'); }
  if (w[0] === 'run') return junosOperational(cli, words.slice(1), w.slice(1), dev);
  if (w[0] === 'exit' || w[0] === 'quit') { cli.cfgMode = false; return ok('Exiting configuration mode'); }
  if (w[0] === 'top' || w[0] === 'up') return ok('');
  if (w[0] === 'set' || w[0] === 'delete') return junosSet(cli, words, w, dev, w[0] === 'delete');
  return err('error: in configuration mode use set/delete, commit, rollback, "show | compare", or run <operational>.');
}
function junosSet(cli, words, w, dev, del) {
  const sign = del ? '-' : '+';
  if (w[1] === 'interfaces') {
    const iface = vResolveJunosIface(dev, words[2]);
    if (!iface) return err('error: interface "' + (words[2] || '') + '" not found (available: ' + Object.keys(dev.ifaces).join(', ') + ')');
    const ai = w.indexOf('address');
    if (ai > 0 && words[ai + 1]) { const c = vParseCidr(words[ai + 1]); if (!c) return err('error: invalid address, expected <ip>/<prefix>'); vStage(cli, sign, 'interfaces ' + iface + ' family inet address ' + words[ai + 1], () => { if (del) { delete dev.ifaces[iface].ip; delete dev.ifaces[iface].mask; } else vSetIface(dev, iface, c.ip, c.prefix); }); return ok(''); }
    if (w.includes('disable')) { vStage(cli, sign, 'interfaces ' + iface + ' disable', () => { dev.ifaces[iface].up = del ? true : false; }); return ok(''); }
    return err('error: expected "unit 0 family inet address <ip>/<prefix>"');
  }
  if (w[1] === 'routing-options' && w[2] === 'static' && w[3] === 'route') {
    const c = vParseCidr(words[4]); if (!c) return err('error: invalid route, expected <dest>/<prefix>');
    if (del) { vStage(cli, '-', 'routing-options static route ' + words[4], () => { dev.routes = (dev.routes || []).filter(r => !(r.dest === M.networkOf(c.ip, c.prefix) && r.mask === c.prefix)); }); return ok(''); }
    const nhi = w.indexOf('next-hop'); const via = nhi > 0 ? parseIPv4(words[nhi + 1]) : null;
    if (via == null) return err('error: expected "next-hop <ip>"');
    vStage(cli, '+', 'routing-options static route ' + words[4] + ' next-hop ' + words[nhi + 1], () => vAddRoute(dev, M.networkOf(c.ip, c.prefix), c.prefix, via)); return ok('');
  }
  if (w[1] === 'protocols' && w[2] === 'ospf') {
    const ii = w.indexOf('interface'), ai = w.indexOf('area');
    const iface = ii > 0 ? vResolveJunosIface(dev, words[ii + 1]) : null; const area = ai > 0 ? words[ai + 1] : '0';
    if (!iface) return err('error: expected "area <id> interface <if>"');
    vStage(cli, sign, 'protocols ospf area ' + area + ' interface ' + iface, () => { if (del) { delete dev.ifaces[iface].ospf; } else { dev.ospf = dev.ospf || { networks: [], passiveInterfaces: [] }; dev.ifaces[iface].ospf = area; } }); return ok('');
  }
  return err('error: unsupported statement. Models: interfaces … family inet address, routing-options static route, protocols ospf area … interface.');
}
function junosOperational(cli, words, w, dev) {
  if (!w[0]) return ok('');
  if (w[0] === 'configure') { cli.cfgMode = true; cli.cfg = cli.cfg || []; return ok('Entering configuration mode\n[edit]'); }
  if (w[0] === 'help' || w[0] === '?') return ok(buildHelp(dev));
  if (w[0] === 'ping') return vPingTo(cli, words[1]);
  if (w[0] === 'traceroute') return vTraceTo(cli, words[1]);
  if (w[0] === 'show') {
    const q = w.slice(1).join(' ');
    if (q === 'interfaces terse' || q === 'interfaces') { const rows = ['Interface        Admin Link Proto Local']; for (const [n, f] of Object.entries(dev.ifaces)) { const s = f.up === false ? 'down' : 'up'; rows.push(n.padEnd(16) + ' ' + s.padEnd(5) + s.padEnd(5) + (f.ip != null ? 'inet  ' + M.ipStr(f.ip) + '/' + f.mask : '')); } return ok(rows.join('\n')); }
    if (q === 'route' || q.startsWith('route ')) { const lines = ['inet.0: routing table']; for (const [n, f] of Object.entries(dev.ifaces)) if (f.ip != null && f.up !== false) lines.push((M.ipStr(M.networkOf(f.ip, f.mask)) + '/' + f.mask).padEnd(20) + '*[Direct] via ' + n); for (const r of dev.routes || []) lines.push((r.mask === 0 ? '0.0.0.0/0' : M.ipStr(r.dest) + '/' + r.mask).padEnd(20) + '*[Static/5] via ' + M.ipStr(r.via)); for (const r of M.ospfLearned(cli.net, cli.cur)) lines.push((M.ipStr(r.dest) + '/' + r.mask).padEnd(20) + '*[OSPF/10] via ' + M.ipStr(r.via)); return ok(lines.join('\n')); }
    if (q === 'ospf neighbor') { const ns = M.ospfNeighbors(cli.net, cli.cur); return ok(ns.length ? 'Address          Interface State ID\n' + ns.map(n => M.ipStr(n.ip).padEnd(16) + ' ' + String(n.via).padEnd(9) + ' Full  ' + n.id).join('\n') : '(no OSPF neighbors)'); }
    if (q === 'arp') return vShowArp(cli, dev);
    if (q === 'configuration' || q.startsWith('configuration')) { const lines = []; for (const [n, f] of Object.entries(dev.ifaces)) if (f.ip != null) lines.push('set interfaces ' + n + ' unit 0 family inet address ' + M.ipStr(f.ip) + '/' + f.mask); for (const r of dev.routes || []) lines.push('set routing-options static route ' + (r.mask === 0 ? '0.0.0.0/0' : M.ipStr(r.dest) + '/' + r.mask) + ' next-hop ' + M.ipStr(r.via)); for (const [n, f] of Object.entries(dev.ifaces)) if (f.ospf != null) lines.push('set protocols ospf area ' + f.ospf + ' interface ' + n); return ok(lines.length ? lines.join('\n') : '## no interface or routing configuration yet'); }
    return err('error: unsupported show — try show interfaces terse, show route, show ospf neighbor, show arp, show configuration');
  }
  return err('error: unknown command "' + words[0] + '" (type help)');
}

function runPanos(cli, raw) {
  const dev = cli.net.devices[cli.cur];
  const line = raw.trim(), words = line.split(/\s+/), w = words.map(s => s.toLowerCase());
  if (!w[0]) return ok('');
  if (w[0] === 'help' || w[0] === '?') return ok(buildHelp(dev));
  if (line === 'configure') { cli.cfgMode = true; cli.cfg = cli.cfg || []; return ok('Entering configuration mode'); }
  if (cli.cfgMode) return panosConfig(cli, words, w, line, dev);
  return panosOperational(cli, words, w, dev);
}
function panosConfig(cli, words, w, line, dev) {
  if (w[0] === 'commit') { const ops = cli.cfg || []; ops.forEach(o => o.apply()); const n = ops.length; cli.cfg = []; return ok(n ? 'Commit job completed successfully' : 'Commit: there are no changes to commit'); }
  if (w[0] === 'run') return panosOperational(cli, words.slice(1), w.slice(1), dev);
  if (w[0] === 'exit' || w[0] === 'quit') { cli.cfgMode = false; return ok(''); }
  if (w[0] === 'set' || w[0] === 'delete') return panosSet(cli, words, w, dev, w[0] === 'delete');
  return err('error: in configuration mode use set/delete, commit, or exit.');
}
function panosSet(cli, words, w, dev, del) {
  const sign = del ? '-' : '+';
  const val = key => { const i = w.indexOf(key); return i > 0 ? words[i + 1] : null; };
  if (w[1] === 'network' && w[2] === 'interface') {
    const iface = vResolvePanIface(dev, words[3]);
    if (!iface) return err('error: interface "' + (words[3] || '') + '" not found (available: ' + Object.keys(dev.ifaces).join(', ') + ')');
    const ii = w.indexOf('ip'); const c = ii > 0 ? vParseCidr(words[ii + 1]) : null;
    if (!c) return err('error: expected "layer3 ip <ip>/<prefix>"');
    vStage(cli, sign, 'network interface ' + iface + ' layer3 ip ' + words[ii + 1], () => { if (del) { delete dev.ifaces[iface].ip; delete dev.ifaces[iface].mask; } else vSetIface(dev, iface, c.ip, c.prefix); }); return ok('');
  }
  if (w[1] === 'network' && w[2] === 'virtual-router' && w.includes('static-route')) {
    const c = vParseCidr(val('destination'));
    const via = parseIPv4(val('ip-address') || (w.indexOf('nexthop') > 0 ? words[w.indexOf('nexthop') + 1] : null));
    if (!c) return err('error: expected "destination <dest>/<prefix>"');
    if (del) { vStage(cli, '-', 'static-route destination ' + val('destination'), () => { dev.routes = (dev.routes || []).filter(r => !(r.dest === M.networkOf(c.ip, c.prefix) && r.mask === c.prefix)); }); return ok(''); }
    if (via == null) return err('error: expected "nexthop ip-address <ip>"');
    vStage(cli, '+', 'static-route destination ' + val('destination') + ' nexthop ' + M.ipStr(via), () => vAddRoute(dev, M.networkOf(c.ip, c.prefix), c.prefix, via)); return ok('');
  }
  if (w[1] === 'rulebase' && w[2] === 'security' && w[3] === 'rules') {
    const name = words[4]; if (!name) return err('error: expected a rule name');
    const action = (val('action') || 'allow').toLowerCase();
    const rule = { panName: name, panFrom: val('from'), panTo: val('to'), panSvc: val('service') || val('application'), action: action === 'deny' ? 'deny' : 'permit' };
    const s = vCidrNet(val('source')); if (s) rule.srcnet = s;
    const d = vCidrNet(val('destination')); if (d) rule.dstnet = d;
    const svc = vServicePort(val('service') || val('application')); if (svc) { rule.proto = svc.proto; rule.dport = svc.dport; }
    vStage(cli, sign, 'security rule "' + name + '" ' + (val('source') || 'any') + '->' + (val('destination') || 'any') + ' ' + (rule.panSvc || 'any') + ' ' + rule.action, () => {
      // Store explicit rules, evaluated first-match on inbound traffic. We do NOT
      // add PAN-OS's implicit interzone deny: the model is stateless and zoneless,
      // so a blanket default-deny would also drop return traffic. Rules do exactly
      // what they state; absent a match, the engine's default (allow) applies.
      dev.acls = (dev.acls || []).filter(r => r.panName !== name);
      if (!del) dev.acls.push(rule);
    }); return ok('');
  }
  return err('error: unsupported statement. Models: network interface … layer3 ip, network virtual-router … static-route, rulebase security rules.');
}
function panosOperational(cli, words, w, dev) {
  if (!w[0]) return ok('');
  if (w[0] === 'configure') { cli.cfgMode = true; cli.cfg = cli.cfg || []; return ok('Entering configuration mode'); }
  if (w[0] === 'help' || w[0] === '?') return ok(buildHelp(dev));
  if (w[0] === 'ping') { const hi = w.indexOf('host'); return vPingTo(cli, hi >= 0 ? words[hi + 1] : words[1]); }
  if (w[0] === 'traceroute') { const hi = w.indexOf('host'); return vTraceTo(cli, hi >= 0 ? words[hi + 1] : words[1]); }
  if (w[0] === 'test' && w[1] === 'security-policy-match') {
    const val = key => { const i = w.indexOf(key); return i > 0 ? words[i + 1] : null; };
    const src = parseIPv4(val('source')), dst = parseIPv4(val('destination'));
    const svc = vServicePort(val('service') || val('application'));
    const proto = svc ? svc.proto : ({ '6': 'tcp', '17': 'udp', '1': 'icmp' }[val('protocol')] || 'ip');
    const dport = svc ? svc.dport : (val('destination-port') != null ? Number(val('destination-port')) : undefined);
    for (const r of (dev.acls || []).filter(x => x.panName && x.panName !== '_default-deny')) {
      if (r.srcnet && (src == null || !M.sameNet(src, r.srcnet.net, r.srcnet.prefix))) continue;
      if (r.dstnet && (dst == null || !M.sameNet(dst, r.dstnet.net, r.dstnet.prefix))) continue;
      if (r.proto && proto !== 'ip' && r.proto !== proto) continue;
      if (r.dport != null && r.dport !== dport) continue;
      return ok('"' + r.panName + '" {\n    action: ' + (r.action === 'permit' ? 'allow' : 'deny') + ';\n}');
    }
    return ok('No explicit rule matched (simulator default: allow; note real PAN-OS defaults to deny).');
  }
  if (w[0] === 'show') {
    const q = w.slice(1).join(' ');
    if (q === 'interface all' || q === 'interface' || q === 'interfaces') { const rows = ['name          state ip']; for (const [n, f] of Object.entries(dev.ifaces)) rows.push(n.padEnd(14) + (f.up === false ? 'down ' : 'up   ') + ' ' + (f.ip != null ? M.ipStr(f.ip) + '/' + f.mask : 'N/A')); return ok(rows.join('\n')); }
    if (q === 'routing route' || q === 'routing') { const lines = ['destination        nexthop          flags']; for (const [n, f] of Object.entries(dev.ifaces)) if (f.ip != null && f.up !== false) lines.push((M.ipStr(M.networkOf(f.ip, f.mask)) + '/' + f.mask).padEnd(19) + 'connect'.padEnd(17) + 'C'); for (const r of dev.routes || []) lines.push((r.mask === 0 ? '0.0.0.0/0' : M.ipStr(r.dest) + '/' + r.mask).padEnd(19) + M.ipStr(r.via).padEnd(17) + 'S'); return ok(lines.join('\n')); }
    if (q === 'running security-policy' || q === 'security-policy') { const rules = (dev.acls || []).filter(r => r.panName && r.panName !== '_default-deny'); return ok(rules.length ? 'name            src           dst           service  action\n' + rules.map(r => (r.panName || '').padEnd(15) + ' ' + (r.srcnet ? M.ipStr(r.srcnet.net) + '/' + r.srcnet.prefix : 'any').padEnd(13) + ' ' + (r.dstnet ? M.ipStr(r.dstnet.net) + '/' + r.dstnet.prefix : 'any').padEnd(13) + ' ' + (r.panSvc || 'any').padEnd(8) + ' ' + (r.action === 'permit' ? 'allow' : 'deny')).join('\n') + '\n(rules evaluated first-match; no implicit default-deny in this simulator)' : '(no security rules configured)'); }
    if (q === 'system info') return ok('hostname: ' + (dev.hostname || dev.id) + '\nmodel: PA-VM (simulated)\nsw-version: PAN-OS (simulator subset)');
    if (q === 'config running' || q === 'configuration') { const lines = []; for (const [n, f] of Object.entries(dev.ifaces)) if (f.ip != null) lines.push('set network interface ' + n + ' layer3 ip ' + M.ipStr(f.ip) + '/' + f.mask); for (const r of dev.routes || []) lines.push('set network virtual-router default routing-table ip static-route S destination ' + (r.mask === 0 ? '0.0.0.0/0' : M.ipStr(r.dest) + '/' + r.mask) + ' nexthop ip-address ' + M.ipStr(r.via)); for (const r of (dev.acls || []).filter(x => x.panName && x.panName !== '_default-deny')) lines.push('set rulebase security rules ' + r.panName + ' action ' + (r.action === 'permit' ? 'allow' : 'deny')); return ok(lines.length ? lines.join('\n') : '## no configuration yet'); }
    return err('error: unsupported show — try show interface all, show routing route, show running security-policy, show system info');
  }
  return err('error: unknown command "' + words[0] + '"');
}

function runCisco(cli, line) {
  if (!line) return ok('');
  const raw = line.trim(), lower = raw.toLowerCase(), words = lower.split(/\s+/), dev = cli.cur == null ? null : cli.net.devices[cli.cur];
  if (!dev) return dispatch(cli, raw);
  const brandFamily = brandProfile(dev).family;
  if (brandFamily === 'asa' || dev.firewallOS === 'asa') return runASA(cli, raw);
  if (brandFamily === 'junos') return runJunos(cli, raw);
  if (brandFamily === 'panos') return runPanos(cli, raw);
  // An IOS-family device (Cisco IOS, Arista EOS) only exposes IOS commands;
  // steer Linux-dialect tools to the IOS way.
  if (brandFamily === 'ios' && isLinuxDialect(words))
    return err('% Invalid input — ' + (dev.hostname || dev.id) + ' runs ' + brandProfile(dev).label + '. Use IOS-style commands (e.g. "show ip interface brief", "configure terminal" then "interface <port>"). Type "help" for the command set.');
  if (lower === 'enable' || lower === 'en') {
    if (cli.iosMode === 'user') { cli.iosMode = 'privileged'; return ok(''); }
    return ok('% Already in privileged EXEC mode');
  }
  if (lower === 'disable') { cli.iosMode = 'user'; cli.iosIface = null; return ok(''); }
  if (lower === 'configure terminal' || lower === 'conf t' || lower === 'config t') {
    if (cli.iosMode === 'user') return err('% Privileged EXEC required — enter enable first');
    cli.iosMode = 'config'; cli.iosIface = null; return ok('Enter configuration commands, one per line. End with CNTL/Z.');
  }
  if (lower === 'end' || lower === 'end\n') { cli.iosMode = 'privileged'; cli.iosIface = null; cli.contextIface = null; return ok(''); }
  if (lower === 'exit') {
    if (cli.iosMode === 'acl' || cli.iosMode === 'dhcp-pool' || cli.iosMode === 'router-ospf') { cli.iosMode = 'config'; cli.iosAcl = null; cli.iosDhcpPool = null; cli.iosOspf = null; return ok(''); }
    if (cli.iosMode === 'interface' || cli.iosMode === 'vlan') { cli.iosMode = 'config'; cli.iosIface = null; return ok(''); }
    if (cli.iosMode === 'config') { cli.iosMode = 'privileged'; return ok(''); }
    if (cli.iosMode === 'privileged') { cli.iosMode = 'user'; return ok(''); }
  }
  if (words[0] === 'show') {
    const query = words.slice(1).join(' ');
    const iosOnly = ['port-security','version','running-config','run','startup-config','start','ip interface brief','ip int brief','ip route','route','ip bgp','ip bgp ipv4 unicast','ip bgp summary','ip bgp neighbors','ip bgp advertised-routes','ip ospf neighbor','ip ospf interface brief','standby brief','standby','ip protocols','interfaces status','int status','access-lists','hosts','ntp status','ntp associations','logging','ip dhcp pool','ip dhcp binding','ip dhcp server statistics'];
    if (query.startsWith('port-security interface ') || query.startsWith('access-lists ') || query.startsWith('ip interface ') || query.startsWith('ip bgp advertised-routes')) return ciscoShow(cli, words.slice(1));
    return iosOnly.includes(query) ? ciscoShow(cli, words.slice(1)) : dispatch(cli, raw);
  }
  if (lower === 'write memory' || lower === 'wr mem' || lower === 'copy running-config startup-config') {
    if (cli.iosMode === 'user') return err('% Privileged EXEC required');
    dev.startupConfig = ciscoRunConfig(dev);
    return ok('Building configuration...\n[OK]');
  }
  if (lower === 'copy startup-config running-config') {
    if (!dev.startupConfig) return err('% No startup-config saved');
    return err('% Restore is not available in this simulator profile; use the scenario reset to return to the baseline');
  }
  if (cli.iosMode === 'config') {
    if (words[0] === 'hostname' && words[1]) { dev.hostname = raw.split(/\s+/).slice(1).join(' '); return ok(''); }
    if (words[0] === 'ip' && words[1] === 'dhcp' && words[2] === 'excluded-address' && (words.length === 4 || words.length === 5)) {
      const first = parseIPv4(words[3]), last = words[4] ? parseIPv4(words[4]) : first;
      if (first == null || last == null || first > last) return err('% Invalid DHCP excluded-address range');
      dev.dhcp = dev.dhcp || { excluded: [], bindings: {} }; dev.dhcp.excluded = dev.dhcp.excluded || [];
      if (!dev.dhcp.excluded.some(x => x.start === first && x.end === last)) dev.dhcp.excluded.push({ start: first, end: last });
      return ok('');
    }
    if (words[0] === 'ip' && words[1] === 'dhcp' && words[2] === 'pool' && words[3] && words.length === 4) {
      dev.dhcp = dev.dhcp || { excluded: [], bindings: {} };
      dev.dhcp.name = words[3]; dev.dhcp.excluded = dev.dhcp.excluded || []; dev.dhcp.bindings = dev.dhcp.bindings || {};
      cli.iosDhcpPool = words[3]; cli.iosMode = 'dhcp-pool'; return ok('DHCP pool configuration mode');
    }
    if (words[0] === 'no' && words[1] === 'ip' && words[2] === 'dhcp' && words[3] === 'pool' && words[4]) {
      if (dev.dhcp && dev.dhcp.name === words[4]) { delete dev.dhcp; return ok(''); }
      return err('% DHCP pool not found');
    }
    if (words[0] === 'ip' && words[1] === 'name-server' && words[2]) {
      const address = parseIPv4(words[2]); if (address == null) return err('% Invalid DNS server address');
      dev.resolver = address; return ok('');
    }
    if (words[0] === 'ip' && words[1] === 'host' && words[2] && words[3]) {
      const address = parseIPv4(words[3]); if (address == null) return err('% Invalid host address');
      dev.hosts = dev.hosts || {}; dev.hosts[words[2].toLowerCase()] = address; return ok('');
    }
    if (words[0] === 'ntp' && words[1] === 'server' && words[2] && words.length === 3) {
      const address = parseIPv4(words[2]); if (address == null) return err('% Invalid NTP server address');
      dev.ntp = dev.ntp || { servers: [] }; dev.ntp.servers = [...new Set([...(dev.ntp.servers || []), address])]; return ok('');
    }
    if (lower === 'no ntp master') { if (dev.ntp) dev.ntp.master = false; return ok(''); }
    if (words[0] === 'ntp' && words[1] === 'master' && words.length <= 3) {
      const stratum = words[2] == null ? 8 : Number(words[2]);
      if (!Number.isInteger(stratum) || stratum < 1 || stratum > 15) return err('% NTP stratum must be 1–15');
      dev.ntp = dev.ntp || { servers: [] }; dev.ntp.master = true; dev.ntp.stratum = stratum; return ok('');
    }
    if (words[0] === 'no' && words[1] === 'ntp' && words[2] === 'server' && words[3]) {
      const address = parseIPv4(words[3]); if (dev.ntp) dev.ntp.servers = (dev.ntp.servers || []).filter(x => x !== address); return ok('');
    }
    if (words[0] === 'logging' && words[1] === 'host' && words[2] && words.length === 3) {
      const address = parseIPv4(words[2]); if (address == null) return err('% Invalid syslog host address');
      dev.syslog = dev.syslog || { enabled: true, hosts: [], severity: 6, local: [], forwarded: 0 };
      dev.syslog.hosts = [...new Set([...(dev.syslog.hosts || []), address])]; return ok('');
    }
    if (words[0] === 'no' && words[1] === 'logging' && words[2] === 'host' && words[3]) {
      const address = parseIPv4(words[3]); if (dev.syslog) dev.syslog.hosts = (dev.syslog.hosts || []).filter(x => x !== address); return ok('');
    }
    if (words[0] === 'logging' && words[1] === 'trap' && words[2]) {
      const levels = { emergencies: 0, alerts: 1, critical: 2, errors: 3, warnings: 4, notifications: 5, informational: 6, debugging: 7 };
      const level = /^\d$/.test(words[2]) ? Number(words[2]) : levels[words[2]];
      if (level == null || level < 0 || level > 7) return err('% Use a syslog severity name or 0–7');
      dev.syslog = dev.syslog || { enabled: true, hosts: [], local: [], forwarded: 0 };
      dev.syslog.severity = level; return ok('');
    }
    if (words[0] === 'logging' && words[1] === 'source-interface' && words[2]) {
      const name = ciscoIface(dev, words[2]); if (!name) return err('% Invalid source interface');
      dev.syslog = dev.syslog || { enabled: true, hosts: [], severity: 6, local: [], forwarded: 0 };
      dev.syslog.sourceInterface = name; return ok('');
    }
    if (lower === 'logging on' || lower === 'logging buffered') {
      dev.syslog = dev.syslog || { hosts: [], severity: 6, local: [], forwarded: 0 }; dev.syslog.enabled = true; return ok('');
    }
    if (lower === 'no logging on') { if (dev.syslog) dev.syslog.enabled = false; return ok(''); }
    if (words[0] === 'interface' && words[1]) {
      const name = ciscoIface(dev, raw.split(/\s+/)[1]);
      if (!name) return err('% Invalid interface — use show ip interface brief');
      cli.iosIface = name; cli.iosMode = 'interface'; return ok('Enter interface configuration commands.');
    }
    if (words[0] === 'ip' && words[1] === 'access-list' && words[2] === 'extended' && words[3] && ['router','firewall'].includes(dev.kind)) {
      cli.iosAcl = words[3].toUpperCase(); dev.acls = dev.acls || []; cli.iosMode = 'acl';
      return ok('Extended access-list configuration mode');
    }
    if (words[0] === 'access-list' && words.length >= 5 && ['router','firewall'].includes(dev.kind)) {
      const name = words[1];
      if (!/^(?:1[0-9]{2}|2[0-6][0-9]{2})$/.test(name)) return err('% Supports numbered extended ACLs 100-199 and 2000-2699');
      dev.acls = dev.acls || [];
      const seq = Math.max(0, ...dev.acls.filter(r=>r.aclName===name).map(r=>r.seq||0)) + 10;
      const rule = ciscoAclRule(words.slice(2), name, seq);
      if (!rule) return err('% Invalid extended ACL rule');
      dev.acls.push(rule); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'access-list' && words[2]) {
      dev.acls = (dev.acls || []).filter(r=>r.aclName !== words[2].toUpperCase()); return ok('');
    }
    if (words[0] === 'vlan' && words[1] && dev.kind === 'switch') {
      const id = parseVlanId(words[1]); if (id == null) return err('% VLAN must be between 1 and 4094');
      dev.vlans = [...new Set([1, ...(dev.vlans || []), id])].sort((a,b)=>a-b);
      cli.iosMode = 'vlan'; cli.iosVlan = id; return ok('VLAN configuration mode');
    }
    if (words[0] === 'router' && words[1] === 'ospf' && words.length === 3) {
      const processId = Number(words[2]);
      if (!Number.isInteger(processId) || processId < 1 || processId > 65535) return err('% OSPF process ID must be 1–65535');
      if (dev.kind !== 'router') return err('% OSPF is available on routers only');
      dev.ospf = dev.ospf || { networks: [], passiveInterfaces: [] };
      dev.ospf.processId = processId; dev.ospf.networks = dev.ospf.networks || []; dev.ospf.passiveInterfaces = dev.ospf.passiveInterfaces || [];
      cli.iosOspf = processId; cli.iosMode = 'router-ospf'; return ok('OSPF router configuration mode');
    }
    if (words[0] === 'no' && words[1] === 'router' && words[2] === 'ospf' && words.length === 4) {
      if (dev.ospf && dev.ospf.processId === Number(words[3])) { delete dev.ospf; applyOspfNetworks(dev); return ok(''); }
      return err('% OSPF process not found');
    }
    if (words[0] === 'ip' && words[1] === 'route' && words.length === 5) {
      if (!['router','firewall'].includes(dev.kind)) return err('% Static routes can only be configured on routers/firewalls');
      const dest = parseIPv4(words[2]), prefix = ciscoMaskPrefix(words[3]), via = parseIPv4(words[4]);
      if (dest == null || prefix == null || via == null) return err('% Invalid static route address or mask');
      const gwIf = M.directIface(dev,via);
      if (!gwIf || dev.ifaces[gwIf].up === false || Object.values(dev.ifaces).some(p=>p.ip===via)) return err('% Next hop must be another address on an active connected subnet');
      const network = M.networkOf(dest,prefix);
      dev.routes = (dev.routes || []).filter(r=>!(r.dest===network && r.mask===prefix));
      dev.routes.push({dest:network,mask:prefix,via});
      return ok('');
    }
    return err('% Invalid input in global configuration mode');
  }
  if (cli.iosMode === 'router-ospf') {
    dev.ospf = dev.ospf || { processId: cli.iosOspf, networks: [], passiveInterfaces: [] };
    dev.ospf.networks = dev.ospf.networks || []; dev.ospf.passiveInterfaces = dev.ospf.passiveInterfaces || [];
    if (words[0] === 'router-id' && words.length === 2) {
      const id = parseIPv4(words[1]); if (id == null || id === 0) return err('% Invalid OSPF router ID');
      dev.ospf.routerId = id; return ok('');
    }
    if (words[0] === 'network' && words.length === 5 && words[3] === 'area') {
      const address = parseIPv4(words[1]), wildcard = parseIPv4(words[2]), area = ospfAreaId(words[4]);
      if (address == null || wildcard == null || area == null) return err('% Use network <address> <wildcard> area <area-id>');
      if (!dev.ospf.networks.some(n => n.address === address && n.wildcard === wildcard && n.area === area))
        dev.ospf.networks.push({ address, wildcard, area });
      applyOspfNetworks(dev); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'network' && words.length === 6 && words[4] === 'area') {
      const address = parseIPv4(words[2]), wildcard = parseIPv4(words[3]), area = ospfAreaId(words[5]);
      dev.ospf.networks = dev.ospf.networks.filter(n => !(n.address === address && n.wildcard === wildcard && n.area === area));
      applyOspfNetworks(dev); return ok('');
    }
    if (words[0] === 'passive-interface' && words.length === 2) {
      const name = ciscoIface(dev, words[1]); if (!name) return err('% Invalid interface');
      if (!dev.ospf.passiveInterfaces.includes(name)) dev.ospf.passiveInterfaces.push(name); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'passive-interface' && words.length === 3) {
      const name = ciscoIface(dev, words[2]); if (!name) return err('% Invalid interface');
      dev.ospf.passiveInterfaces = dev.ospf.passiveInterfaces.filter(x => x !== name); return ok('');
    }
    return err('% Use router-id, network <address> <wildcard> area <area-id>, or passive-interface <interface>');
  }
  if (cli.iosMode === 'dhcp-pool') {
    dev.dhcp = dev.dhcp || { excluded: [], bindings: {} };
    if (words[0] === 'network' && words.length === 3) {
      const address = parseIPv4(words[1]), prefix = ciscoMaskPrefix(words[2]);
      if (address == null || prefix == null || prefix < 8 || prefix > 30) return err('% DHCP network must use a valid IPv4 network and a /8 through /30 mask');
      const network = M.networkOf(address, prefix);
      if (dev.dhcp.defaultRouter != null && !M.sameNet(dev.dhcp.defaultRouter, network, prefix)) return err('% Default router must be inside the DHCP pool network');
      dev.dhcp.network = { net: network, prefix }; dev.dhcp.prefix = prefix; return ok('');
    }
    if (words[0] === 'default-router' && words[1] && words.length === 2) {
      const address = parseIPv4(words[1]); if (address == null) return err('% Invalid default-router address');
      if (dev.dhcp.network && !M.sameNet(address, dev.dhcp.network.net, dev.dhcp.network.prefix)) return err('% Default router must be inside the DHCP pool network');
      dev.dhcp.defaultRouter = address; return ok('');
    }
    if (words[0] === 'dns-server' && words[1] && words.length === 2) {
      const address = parseIPv4(words[1]); if (address == null) return err('% Invalid DNS server address');
      dev.dhcp.dnsServer = address; return ok('');
    }
    if (words[0] === 'domain-name' && words[1] && words.length === 2) { dev.dhcp.domainName = words[1]; return ok(''); }
    if (words[0] === 'lease' && words[1] && words.length === 2) {
      const days = Number(words[1]); if (!Number.isInteger(days) || days < 1 || days > 365) return err('% Lease must be 1–365 days');
      dev.dhcp.leaseDays = days; return ok('');
    }
    return err('% Use network, default-router, dns-server, domain-name or lease in DHCP pool mode');
  }
  if (cli.iosMode === 'acl') {
    dev.acls = dev.acls || [];
    if (words[0] === 'no' && /^\d+$/.test(words[1] || '')) {
      const seq = Number(words[1]); dev.acls = dev.acls.filter(r => !(r.aclName === cli.iosAcl && r.seq === seq)); return ok('');
    }
    const seq = Math.max(0, ...dev.acls.filter(r=>r.aclName===cli.iosAcl).map(r=>r.seq||0)) + 10;
    const rule = ciscoAclRule(words, cli.iosAcl, seq);
    if (!rule) return err('% Invalid ACL entry — use [sequence] permit|deny ip|tcp|udp|icmp source destination [eq port]');
    if (dev.acls.some(r=>r.aclName===cli.iosAcl && r.seq===rule.seq)) return err('% Sequence number already exists; remove it with no <sequence>');
    dev.acls.push(rule); return ok('');
  }
  if (cli.iosMode === 'interface') {
    const p = dev.ifaces[cli.iosIface];
    if (!p) return err('% Interface context no longer exists');
    if (lower === 'shutdown') { p.up = false; return ok(''); }
    if (lower === 'no shutdown' || lower === 'no shut') { p.up = true; p.errDisabled = false; return ok(''); }
    if (words[0] === 'switchport' && words[1] === 'port-security' && dev.kind === 'switch') {
      if (words.length === 2) { p.portSecurity = { ...(p.portSecurity || {}), enabled: true, maximum: Number(p.portSecurity && p.portSecurity.maximum || 1), violation: p.portSecurity && p.portSecurity.violation || 'shutdown', sticky: !!(p.portSecurity && p.portSecurity.sticky), secureMacs: p.portSecurity && p.portSecurity.secureMacs || [], stickyMacs: p.portSecurity && p.portSecurity.stickyMacs || [], violations: Number(p.portSecurity && p.portSecurity.violations || 0) }; return ok('Port security enabled'); }
      if (words[2] === 'maximum' && words.length === 4) { const n=Number(words[3]); if(!Number.isInteger(n)||n<1||n>50)return err('% Port-security maximum must be 1-50'); p.portSecurity=p.portSecurity||{enabled:true,violation:'shutdown',secureMacs:[],stickyMacs:[],violations:0}; p.portSecurity.enabled=true; p.portSecurity.maximum=n; return ok('Maximum secure MAC addresses: '+n); }
      if (words[2] === 'violation' && words.length === 4 && ['protect','restrict','shutdown'].includes(words[3])) { p.portSecurity=p.portSecurity||{enabled:true,maximum:1,secureMacs:[],stickyMacs:[],violations:0}; p.portSecurity.enabled=true; p.portSecurity.violation=words[3]; return ok('Violation mode: '+words[3]); }
      if (words[2] === 'mac-address' && words[3] === 'sticky' && words.length === 4) { p.portSecurity=p.portSecurity||{enabled:true,maximum:1,violation:'shutdown',secureMacs:[],stickyMacs:[],violations:0}; p.portSecurity.enabled=true; p.portSecurity.sticky=true; return ok('Sticky secure MAC learning enabled'); }
    }
    if (words[0] === 'no' && words[1] === 'switchport' && words[2] === 'port-security' && dev.kind === 'switch') { delete p.portSecurity; p.errDisabled=false; return ok('Port security removed'); }
    if (words[0] === 'standby' && words[1] && words[2] === 'ip' && words.length === 4) {
      const group = Number(words[1]), virtualIp = parseIPv4(words[3]);
      if (!Number.isInteger(group) || group < 0 || group > 255 || virtualIp == null) return err('% Use standby <0-255> ip <virtual-ip>');
      if (dev.kind !== 'router' || p.ip == null || M.sameNet(p.ip, virtualIp, p.mask) === false) return err('% HSRP requires a router interface and a virtual IP in its connected subnet');
      p.hsrp = { ...(p.hsrp || {}), group, virtualIp, priority: p.hsrp && p.hsrp.priority || 100, preempt: !!(p.hsrp && p.hsrp.preempt), track: p.hsrp && p.hsrp.track || [] };
      return ok('');
    }
    if (words[0] === 'standby' && words[1] && words[2] === 'priority' && words.length === 4) {
      const group = Number(words[1]), priority = Number(words[3]);
      if (!p.hsrp || p.hsrp.group !== group) return err('% Configure standby <group> ip first');
      if (!Number.isInteger(priority) || priority < 0 || priority > 255) return err('% HSRP priority must be 0-255');
      p.hsrp.priority = priority; return ok('');
    }
    if (words[0] === 'standby' && words[1] && words[2] === 'preempt' && words.length === 3) {
      const group = Number(words[1]); if (!p.hsrp || p.hsrp.group !== group) return err('% Configure standby <group> ip first');
      p.hsrp.preempt = true; return ok('');
    }
    if (words[0] === 'standby' && words[1] && words[2] === 'track' && words.length === 6 && words[4] === 'decrement') {
      const group = Number(words[1]), tracked = ciscoIface(dev, words[3]), decrement = Number(words[5]);
      if (!p.hsrp || p.hsrp.group !== group) return err('% Configure standby <group> ip first');
      if (!tracked || !Number.isInteger(decrement) || decrement < 1 || decrement > 255) return err('% Use standby <group> track <interface> decrement <1-255>');
      p.hsrp.track = (p.hsrp.track || []).filter(t => t.iface !== tracked).concat([{ iface: tracked, decrement }]); return ok('');
    }
    if (words[0] === 'no' && words[1] === 'standby' && words.length >= 3) {
      const group = Number(words[2]);
      if (p.hsrp && p.hsrp.group === group) delete p.hsrp;
      return ok('');
    }

    if (words[0] === 'description') { p.description = raw.split(/\s+/).slice(1).join(' '); return ok(''); }
    if (words[0] === 'ip' && words[1] === 'helper-address' && words[2] && words.length === 3) {
      const address = parseIPv4(words[2]); if (address == null) return err('% Invalid helper address');
      p.helperAddress = address; return ok('');
    }
    if (words[0] === 'no' && words[1] === 'ip' && words[2] === 'helper-address') { delete p.helperAddress; return ok(''); }
    if (words[0] === 'ip' && words[1] === 'access-group' && words[2] && ['in','out'].includes(words[3])) {
      const name = words[2].toUpperCase();
      if (!(dev.acls || []).some(r=>r.aclName===name)) return err('% Access list does not exist');
      p.accessGroups = p.accessGroups || {}; p.accessGroups[words[3]] = name; return ok('');
    }
    if (words[0] === 'no' && words[1] === 'ip' && words[2] === 'access-group' && words[3] && ['in','out'].includes(words[4])) {
      const groups = p.accessGroups || {}; if (groups[words[4]] === words[3].toUpperCase()) delete groups[words[4]]; return ok('');
    }
    if (words[0] === 'ip' && words[1] === 'address' && words.length === 4 && dev.kind !== 'switch') {
      const address = parseIPv4(words[2]), prefix = ciscoMaskPrefix(words[3]);
      if (address == null || prefix == null) return err('% Invalid IP address or subnet mask');
      for (const [id, other] of Object.entries(cli.net.devices)) for (const [n,f] of Object.entries(other.ifaces || {}))
        if (f.up !== false && f.ip === address && !(id === cli.cur && n === cli.iosIface)) return err('% Address already in use');
      p.ip = address; p.mask = prefix; return ok('');
    }
    if (words[0] === 'switchport' && dev.kind === 'switch') {
      if (words[1] === 'mode' && ['access','trunk'].includes(words[2])) {
        p.mode = words[2]; if (p.mode === 'access') { p.accessVlan = Number(p.accessVlan ?? p.vlan ?? 1); p.vlan = p.accessVlan; } return ok('');
      }
      if (words[1] === 'access' && words[2] === 'vlan') {
        const id = parseVlanId(words[3]); if (id == null || !(dev.vlans || [1]).includes(id)) return err('% Access VLAN must exist first');
        p.mode = 'access'; p.accessVlan = id; p.vlan = id; return ok('');
      }
      if (words[1] === 'trunk' && words[2] === 'native' && words[3] === 'vlan') {
        const id = parseVlanId(words[4]); if (id == null || !(dev.vlans || [1]).includes(id)) return err('% Native VLAN must exist first');
        p.mode = 'trunk'; p.nativeVlan = id; return ok('');
      }
      if (words[1] === 'trunk' && words[2] === 'allowed' && words[3] === 'vlan') {
        const list = words[4] === 'all' ? null : words[4].split(',').map(parseVlanId);
        if (words.length !== 5 || (list && (list.some(x=>x==null) || list.some(x=>!(dev.vlans || [1]).includes(x))))) return err('% Invalid allowed VLAN list');
        p.mode = 'trunk'; if (list) p.allowedVlans = [...new Set(list)].sort((a,b)=>a-b); else delete p.allowedVlans; return ok('');
      }
    }
    return err('% Invalid input in interface configuration mode');
  }
  if (cli.iosMode === 'vlan') {
    if (words[0] === 'name' && words[1]) { dev.vlanNames = dev.vlanNames || {}; dev.vlanNames[cli.iosVlan] = raw.split(/\s+/).slice(1).join(' '); return ok(''); }
    return err('% Invalid input in VLAN configuration mode');
  }
  // User EXEC and privileged EXEC keep the original Linux-like operational
  // commands available for the existing missions while IOS coverage grows.
  if (cli.iosMode === 'user' && ['ping','traceroute','arp','tcpdump','iptables','nmap','dig','dhclient','resolvectl','ip','vlan','interface','switchport','spanning-tree','clear','bgp','ospf','fault','review','help','man'].includes(words[0]))
    return dispatch(cli, raw);
  if (cli.iosMode === 'privileged' && ['ping','traceroute','arp','tcpdump','iptables','nmap','dig','dhclient','resolvectl','ip','vlan','interface','switchport','spanning-tree','clear','bgp','ospf','fault','review','help','man'].includes(words[0]))
    return dispatch(cli, raw);
  return dispatch(cli, raw);
}

/* ---------------- device-scoped help ----------------
 * Each entry is [command, description, kinds]. `help` shows only the entries
 * whose `kinds` include the selected device's kind, so the reference matches
 * what that device can actually run (the handlers enforce the same gating).
 * kinds: 'host' | 'server' | 'switch' | 'router' | 'firewall'; ALL = every kind.
 * An optional 4th element limits an entry to certain brands (e.g. ['generic']
 * for Linux-dialect tools, ['cisco-ios'] for IOS-only hints); omit it for both. */
const ALL_KINDS = ['host', 'server', 'switch', 'router', 'firewall'];
// 4th-element filters are by execution FAMILY: GENERIC = linux-family only
// (hidden on IOS devices), IOS = ios-family only. Untagged entries show on both.
const GENERIC = ['linux'], IOS = ['ios'];
const HELP_SECTIONS = [
  { h: 'DEVICE AND INTERFACE', items: [
    ['show ip interface brief', 'Summarise interface addresses and status', ['switch', 'router', 'firewall']],
    ['ip addr', 'List or configure IP addresses', ['host', 'server', 'router', 'firewall'], GENERIC],
    ['ip link', 'View or change interface state', ['host', 'server', 'router', 'firewall'], GENERIC],
    ['configure terminal → interface <port>', 'Configure an interface, then ip address <ip> <mask>', ['switch', 'router', 'firewall'], IOS],
    ['interface <port>', 'Select a switch port for configuration', ['switch']],
    ['shutdown / no shutdown', 'Disable or re-enable an interface', ['switch']],
    ['vlan <id>', 'Create a VLAN on a switch', ['switch']],
    ['switchport mode access|trunk', 'Set a switch port mode', ['switch']],
    ['switchport access vlan <id>', 'Assign an access port to a VLAN', ['switch']],
    ['switchport trunk allowed vlan ...', 'Choose VLANs carried by a trunk', ['switch']],
    ['show vlan brief', 'List VLANs configured on a switch', ['switch']],
    ['show interfaces trunk', 'Review active trunk ports', ['switch']],
    ['show spanning-tree', 'Inspect spanning-tree state', ['switch']],
  ]},
  { h: 'IP ROUTING', items: [
    ['ip route', 'Display the routing table', ['router', 'firewall']],
    ['ip route add ... via <ip>', 'Add a route through a next-hop router', ['router', 'firewall']],
    ['ip route del ...', 'Remove a configured route', ['router', 'firewall']],
    ['router ospf <process-id>', 'Enter OSPF routing configuration', ['router']],
    ['network <address> <wildcard> ...', 'Advertise a network into OSPF', ['router']],
    ['show ip ospf neighbor', 'Check OSPF neighbour relationships', ['router']],
    ['standby <group> ip <virtual-ip>', 'Configure HSRP first-hop redundancy', ['router']],
    ['show ip protocols', 'Review active routing protocols', ['router']],
    ['bgp summary / bgp neighbor', 'Inspect BGP peers and session state', ['router']],
    ['show ip bgp', 'Review routes learned through BGP', ['router']],
  ]},
  { h: 'CONNECTIVITY AND DIAGNOSTICS', items: [
    ['ping <host|ip>', 'Test whether a destination is reachable', ALL_KINDS],
    ['traceroute <host|ip>', 'Show the network path to a destination', ALL_KINDS],
    ['arp', 'Display the local IP-to-MAC address cache', ALL_KINDS],
    ['tcpdump', 'Capture and inspect network packets', ALL_KINDS, GENERIC],
    ['nmap <host|ip>', 'Discover reachable hosts and open ports', ALL_KINDS, GENERIC],
    ['dig <name>', 'Query DNS records for a hostname', ALL_KINDS, GENERIC],
    ['dhclient <interface>', 'Request an IP address using DHCP', ['host', 'server'], GENERIC],
    ['resolvectl status', 'Inspect DNS resolver configuration', ['host', 'server', 'router', 'firewall'], GENERIC],
  ]},
  { h: 'NETWORK SERVICES', items: [
    ['ip dhcp pool <name>', 'Create a DHCP address pool', ['router']],
    ['ip helper-address <ip>', 'Relay DHCP requests to another subnet', ['router']],
    ['ip name-server <ip>', 'Configure the DNS server used by a device', ['router', 'firewall']],
    ['ip host <name> <ip>', 'Add a static hostname mapping', ['router', 'firewall']],
    ['ntp server <ip>', 'Synchronise time with an NTP server', ['router', 'firewall']],
    ['logging host <ip>', 'Send device logs to a remote collector', ['router', 'firewall']],
    ['show ip dhcp binding', 'List DHCP leases assigned to clients', ['router']],
    ['show ntp status', 'Check time synchronisation', ['router', 'firewall']],
    ['show logging', 'Review recent device log messages', ['router', 'firewall']],
  ]},
  { h: 'SECURITY AND FIREWALL', items: [
    ['iptables -L', 'List firewall filtering rules', ['host', 'server', 'firewall'], GENERIC],
    ['iptables -A ...', 'Add a packet-filtering rule', ['host', 'server', 'firewall'], GENERIC],
    ['access-list ...', 'Define traffic to permit or deny', ['router', 'firewall']],
    ['access-group ...', 'Apply an access list to an interface', ['router', 'firewall']],
    ['ip nat inside/outside ...', 'Translate addresses at the border', ['router', 'firewall']],
    ['packet-tracer input ...', 'Simulate how a firewall handles a packet', ['firewall']],
  ]},
  { h: 'CONFIGURATION AND HELP', items: [
    ['show running-config', 'Display the active device configuration', ALL_KINDS],
    ['show startup-config', 'Display the saved startup configuration', ['switch', 'router', 'firewall']],
    ['write memory', 'Save the current configuration', ['switch', 'router', 'firewall']],
    ['enable', 'Enter privileged device mode', ['switch', 'router', 'firewall']],
    ['configure terminal', 'Enter global configuration mode', ['switch', 'router', 'firewall']],
    ['exit / end', 'Leave the current configuration mode', ['switch', 'router', 'firewall']],
    ['man <command>', 'Read command-specific usage notes', ALL_KINDS],
    ['help or ?', 'Display this command reference', ALL_KINDS],
  ]},
];
function renderHelpSections(sections, kind, family, pad) {
  const out = [];
  for (const sec of sections) {
    const rows = sec.items.filter(it => (!kind || it[2].includes(kind)) && (!it[3] || !family || it[3].includes(family)));
    if (!rows.length) continue;
    out.push(sec.h);
    for (const [cmd, desc] of rows) out.push('  ' + (cmd.length < pad ? cmd.padEnd(pad) : cmd + '  ') + desc);
    out.push('');
  }
  return out;
}
function buildHelp(dev) {
  const kind = dev && dev.kind;
  const brand = deviceBrand(dev);
  const prof = BRANDS[brand];
  const label = dev ? (dev.hostname || dev.id) : '';
  const titleBrand = brand === 'generic' ? '' : ' · ' + prof.label;

  // Vendor-CLI brands (Juniper Junos, Palo Alto PAN-OS): show the vendor command
  // card. Configuration is applied with commit; a core subset actually executes.
  if (REFERENCE_CARDS[brand]) {
    const card = REFERENCE_CARDS[brand];
    const supported = brand === 'juniper-junos'
      ? 'interface addressing, static routes and OSPF'
      : 'interface addressing, static routes and security policy';
    const out = [
      `${prof.label.toUpperCase()} COMMANDS — ${label} (${kind})`,
      card.intro, ''
    ];
    out.push(...renderHelpSections(card.sections, kind, null, 58));
    out.push('Enter "configure" to edit, then "commit" to apply. Supported in the simulator:');
    out.push(supported + ', plus the show/ping commands above. Other listed commands are');
    out.push('reference — verify exact syntax against the vendor\'s current docs.');
    return out.join('\n');
  }

  const out = [
    'NETWORK TERMINAL HELP' + (kind ? ` — ${label} (${kind}${titleBrand})` : ''),
    'Commands available on this device. Replace values in <angle brackets> with your own.'
  ];
  if (prof.note) out.push(prof.note);
  out.push('');
  out.push(...renderHelpSections(HELP_SECTIONS, kind, prof.family, 34));
  out.push('This is an educational network CLI. Only commands implemented in the simulator are available.');
  return out.join('\n');
}

/* ---------------- commands ---------------- */
const COMMANDS = {
  clear: (cli, a) => {
    if (cli.net.devices[cli.cur].kind !== 'switch') return err('clear: switching commands are only available on switches');
    if (a.join(' ') !== 'mac address-table dynamic') return err('usage: clear mac address-table dynamic');
    if (cli.net.macTables) delete cli.net.macTables[cli.cur];
    return ok('dynamic MAC address table cleared on ' + cli.cur);
  },
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
  'spanning-tree': (cli, a) => {
    const dev = cli.net.devices[cli.cur];
    if (dev.kind !== 'switch') return err('spanning-tree: this command is only available on switches');
    const vlan = a[1] === 'priority' ? null : parseVlanId(a[1]);
    if (a[0] !== 'vlan' || vlan == null || a[2] !== 'priority' || a.length !== 4)
      return err('usage: spanning-tree vlan <1-4094> priority <0-61440, step 4096>');
    const priority = /^\d{1,5}$/.test(a[3]) ? Number(a[3]) : NaN;
    if (!Number.isInteger(priority) || priority < 0 || priority > 61440 || priority % 4096 !== 0)
      return err('spanning-tree: priority must be 0–61440 in increments of 4096');
    const vlans = Array.isArray(dev.vlans) ? dev.vlans : [1];
    if (!vlans.includes(vlan)) return err('spanning-tree: VLAN ' + vlan + ' does not exist');
    dev.stpPriorities = { ...(dev.stpPriorities || {}), [vlan]: priority };
    return ok('VLAN ' + vlan + ' bridge priority set to ' + priority);
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
    if (sub === 'mac' && detail === 'address-table' && (a.length === 2 || a[2] === 'dynamic')) {
      const rows = M.switchMacTable(cli.net, cli.cur).map(e => e.vlan + '  ' + e.mac + '  DYNAMIC  ' + e.port + '  (' + e.device + '/' + e.iface + ')');
      return ok(rows.length ? 'VLAN  MAC Address        Type     Port  Learned from\n' + rows.join('\n') : '(no dynamically learned MAC addresses)');
    }
    if (sub === 'spanning-tree') {
      const vlan = detail === 'vlan' ? parseVlanId(a[2]) : (detail ? parseVlanId(detail) : 1);
      if (vlan == null || (detail === 'vlan' && a.length !== 3) || (detail && detail !== 'vlan' && a.length !== 2) || (!detail && a.length !== 1))
        return err('usage: show spanning-tree [vlan <1-4094>]');
      const tree = M.spanningTree(cli.net, vlan), state = tree.switches[cli.cur];
      if (!state) return err('show spanning-tree: VLAN ' + vlan + ' is not active on this switch');
      const rows = Object.entries(state.ports).sort(([a],[b])=>a.localeCompare(b)).map(([port,p]) =>
        port + '  ' + p.role + '  ' + p.state + (p.neighbor ? '  to ' + p.neighbor + '/' + p.peerPort : ''));
      return ok('VLAN ' + vlan + ' spanning tree\nRoot bridge: ' + state.root + ' (priority ' + tree.switches[state.root].priority + ')\nLocal bridge: ' + cli.cur + ' (priority ' + state.priority + ')\nPort  Role        State       Neighbor\n' + rows.join('\n'));
    }
    if (sub === 'vlan' && (!detail || detail === 'brief')) {
      const vlans = [...new Set([1, ...(dev.vlans || []), ...Object.values(dev.ifaces).filter(p => p.mode !== 'trunk').map(p => Number(p.accessVlan ?? p.vlan ?? 1))])].sort((x,y)=>x-y);
      const rows = vlans.map(id => {
        const ports = Object.entries(dev.ifaces).filter(([,p]) => p.mode !== 'trunk' && Number(p.accessVlan ?? p.vlan ?? 1) === id).map(([n])=>n);
        return id + '  VLAN' + id + ((dev.vlanNames || {})[id] ? ' [' + dev.vlanNames[id] + ']' : '') + '  active  ' + (ports.join(', ') || '(none)');
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
    return err('usage: show vlan brief | show interfaces trunk | show interfaces switchport | show mac address-table [dynamic] | show spanning-tree [vlan <id>]');
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
    const ensure = () => { dev.bgp = dev.bgp || { asn: null, neighbors: [], networks: [], prefixLists: {} }; dev.bgp.neighbors = dev.bgp.neighbors || []; dev.bgp.networks = dev.bgp.networks || []; dev.bgp.prefixLists = dev.bgp.prefixLists || {}; return dev.bgp; };
    if (a[0] === 'asn' && a.length === 2) {
      const asn = Number(a[1]); if (!Number.isInteger(asn) || asn < 1 || asn > 4294967295) return err('bgp: ASN must be an integer from 1 to 4294967295');
      ensure().asn = asn; return ok('BGP ASN ' + asn);
    }
    if (a[0] === 'neighbor' && a[1] && a[2] === 'remote-as' && a.length === 4) {
      const ip = parseIPv4(a[1]), remoteAs = Number(a[3]);
      if (ip == null || !Number.isInteger(remoteAs) || remoteAs < 1 || remoteAs > 4294967295) return err('usage: bgp neighbor <IPv4> remote-as <1-4294967295>');
      const cfg = ensure(); cfg.neighbors = cfg.neighbors.filter(n => n.ip !== ip).concat([{ ip, remoteAs }]);
      return ok('BGP neighbor ' + a[1] + ' remote-as ' + remoteAs);
    }
    if (a[0] === 'neighbor' && a[1] && a[2] === 'prefix-list' && a.length === 5 && ['in','out'].includes(a[4])) {
      const ip = parseIPv4(a[1]), name = a[3].toUpperCase(), cfg = dev.bgp;
      if (ip == null || !cfg || !(cfg.prefixLists && cfg.prefixLists[name])) return err('bgp: create the prefix-list before attaching it');
      const n = cfg.neighbors.find(x => x.ip === ip); if (!n) return err('bgp: neighbor is not configured');
      n[a[4] === 'in' ? 'inPrefixList' : 'outPrefixList'] = name; return ok('BGP ' + a[4] + ' prefix-list ' + name + ' attached to ' + a[1]);
    }
    if (a[0] === 'prefix-list' && a[1] && a[2] === 'seq' && a[3] && a[4] && a[5]) {
      const cfg = ensure(), name = a[1].toUpperCase(), seq = Number(a[3]), action = a[4], network = parseCIDR(a[5]);
      if (!Number.isInteger(seq) || seq < 1 || seq > 65535 || !['permit','deny'].includes(action) || !network) return err('usage: bgp prefix-list <name> seq <1-65535> permit|deny <CIDR> [ge <n>] [le <n>]');
      const opts = a.slice(6); let ge = null, le = null;
      if (opts.length && opts.length !== 2 && opts.length !== 4) return err('bgp prefix-list: invalid ge/le options');
      for (let i=0;i<opts.length;i+=2) { const n=Number(opts[i+1]); if (!['ge','le'].includes(opts[i]) || !Number.isInteger(n) || n < network.prefix || n > 32) return err('bgp prefix-list: invalid ge/le value'); if(opts[i]==='ge')ge=n;else le=n; }
      if (ge != null && le != null && ge > le) return err('bgp prefix-list: ge cannot exceed le');
      const list = cfg.prefixLists[name] = cfg.prefixLists[name] || [];
      if (list.some(x=>x.seq===seq)) return err('bgp prefix-list: sequence already exists');
      list.push({ seq, action, dest: network.net, mask: network.prefix, ge, le }); list.sort((x,y)=>x.seq-y.seq);
      return ok('BGP prefix-list ' + name + ' sequence ' + seq + ' added');
    }
    if (a[0] === 'prefix-list' && a[1] && ['permit','deny'].includes(a[2]) && a[3]) {
      const cfg = ensure(), name = a[1].toUpperCase(), network = parseCIDR(a[3]);
      if (!network) return err('bgp prefix-list: invalid IPv4 CIDR');
      const opts = a.slice(4); let ge = null, le = null;
      if (opts.length && opts.length !== 2 && opts.length !== 4) return err('bgp prefix-list: invalid ge/le options');
      for (let i=0;i<opts.length;i+=2) { const n=Number(opts[i+1]); if (!['ge','le'].includes(opts[i]) || !Number.isInteger(n) || n < network.prefix || n > 32) return err('bgp prefix-list: invalid ge/le value'); if(opts[i]==='ge')ge=n;else le=n; }
      if (ge != null && le != null && ge > le) return err('bgp prefix-list: ge cannot exceed le');
      const list = cfg.prefixLists[name] = cfg.prefixLists[name] || [], seq = Math.max(0,...list.map(x=>x.seq))+10;
      list.push({seq,action:a[2],dest:network.net,mask:network.prefix,ge,le}); return ok('BGP prefix-list ' + name + ' sequence ' + seq + ' added');
    }
    if (a[0] === 'no' && a[1] === 'prefix-list' && a[2]) {
      const cfg = dev.bgp, name = a[2].toUpperCase();
      if (!cfg || !cfg.prefixLists || !cfg.prefixLists[name]) return err('bgp: prefix-list not found');
      if (a[3] === 'seq' && a[4]) { const seq=Number(a[4]), before=cfg.prefixLists[name].length; cfg.prefixLists[name]=cfg.prefixLists[name].filter(x=>x.seq!==seq); return before===cfg.prefixLists[name].length?err('bgp: sequence not found'):ok(''); }
      if ((cfg.neighbors||[]).some(n=>n.inPrefixList===name||n.outPrefixList===name)) return err('bgp: prefix-list is attached to a neighbor; detach it first');
      delete cfg.prefixLists[name]; return ok('');
    }
    if (a[0] === 'no' && a[1] === 'neighbor' && a[2] && a.length === 3) {
      const cfg=dev.bgp, ip=parseIPv4(a[2]); if(!cfg||ip==null)return err('bgp: invalid or unknown neighbor');
      const before=cfg.neighbors.length; cfg.neighbors=cfg.neighbors.filter(n=>n.ip!==ip);
      return before===cfg.neighbors.length?err('bgp: neighbor not found'):ok('');
    }
    if (a[0] === 'no' && a[1] === 'neighbor' && a[2] && a[3] === 'prefix-list' && a[4] && ['in','out'].includes(a[5])) {
      const cfg=dev.bgp, ip=parseIPv4(a[2]), n=cfg&&(cfg.neighbors||[]).find(x=>x.ip===ip);
      if(!n)return err('bgp: neighbor not found'); const key=a[5]==='in'?'inPrefixList':'outPrefixList';
      if(n[key]!==a[4].toUpperCase())return err('bgp: matching prefix-list is not attached');
      delete n[key]; return ok('');
    }
    if (a[0] === 'network' && a[1] && a.length === 2) {
      const network = parseCIDR(a[1]); if (!network) return err('bgp: use a valid IPv4 CIDR');
      const cfg=ensure(); if (!cfg.networks.includes(a[1])) cfg.networks.push(a[1]); return ok('BGP network ' + a[1]);
    }
    if (a[0] === 'no' && a[1] === 'network' && a[2]) {
      const cfg=dev.bgp, before=cfg?(cfg.networks||[]).length:0;
      if(cfg)cfg.networks=cfg.networks.filter(x=>x!==a[2]);
      return before===(cfg?(cfg.networks||[]).length:0)?err('bgp: network statement not found'):ok('');
    }
    if (a[0] === 'advertised') {
      const peer = a[1] ? parseIPv4(a[1]) : null;
      if (a[1] && peer == null) return err('bgp: invalid neighbor address');
      return ok('Advertised prefixes:\\n' + (M.bgpAdvertised(cli.net,cli.cur,peer).map(r=>M.ipStr(r.dest)+'/'+r.mask).join('\\n') || '(none)'));
    }
    if (a[0] === 'received') {
      const rows=M.bgpLearned(cli.net,cli.cur).map(r=>M.ipStr(r.dest)+'/'+r.mask+' via '+M.ipStr(r.via)+' AS path '+(r.asPath||[]).join(' '));
      return ok('Received prefixes:\\n'+(rows.join('\\n')||'(none)'));
    }
    if (a[0] === 'summary' || a[0] === 'neighbor' && !a[1]) {
      const ss = M.bgpSessions(cli.net, cli.cur);
      if (!ss.length) return ok('BGP: no neighbors configured');
      return ok('BGP sessions:\\n' + ss.map(s => '  ' + M.ipStr(s.ip) + '  AS' + s.remoteAs + '  ' + s.type + '  ' + (s.up ? 'Established' : s.reason) + '  prefixes ' + M.bgpLearned(cli.net,cli.cur).filter(r=>r.via===s.ip).length).join('\\n'));
    }
    return err('usage: bgp asn <n> | bgp neighbor <ip> remote-as <n> | bgp neighbor <ip> prefix-list <name> in|out | bgp network <cidr> | bgp prefix-list <name> permit|deny <cidr> | bgp summary|advertised|received');
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
  help: (cli) => ok(buildHelp(cli.net.devices[cli.cur])),
  '?': (cli) => ok(buildHelp(cli.net.devices[cli.cur])),

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
  'access-list': 'Cisco IOS extended ACLs: enable, configure terminal, ip access-list extended NAME, then [sequence] permit|deny ip|tcp|udp|icmp SOURCE DESTINATION [eq PORT]. Address forms: any, host IP, or IP WILDCARD. Apply under interface mode with ip access-group NAME in|out. Verify with show access-lists and show ip interface IF. Rules are first-match-wins; unmatched traffic is implicitly denied. Remove a sequence with no SEQUENCE. IOS-style router ACL subset; not ASA syntax.',
  asa: 'Cisco ASA-style firewall profile (separate from IOS router ACLs). Enable, configure terminal; interface eth0; nameif outside; security-level 0; access-list OUTSIDE_IN extended permit tcp any host IP eq 443; access-group OUTSIDE_IN in interface outside. Use object network WEB; host IP; nat (inside,outside) static interface service tcp 443 443. Verify with show access-list, show access-group, show nat, show interface ip brief, packet-tracer input outside tcp SRC SPORT DST DPORT. This is a bounded educational command profile, not Cisco ASA software.',
  iptables: 'iptables -L — list firewall rules.\n  iptables -A INPUT -i IF -p tcp --dport N -j DROP — drop matching inbound traffic (rules match top-down, first match wins).\n  iptables -t nat -A PREROUTING -i IF -p tcp --dport N -j DNAT --to-destination IP — port-forward inbound traffic to an inside host.\n  iptables -t nat -A POSTROUTING -o IF -s CIDR -j MASQUERADE — share the outside IP for an inside network (source NAT).\n  iptables -t nat -L — list NAT rules.',
  nmap: 'nmap HOST — (read-only) list the services a host is exposing. Use it to see your own attack surface.',
  tcpdump: 'tcpdump — print the packets from your last ping on the wire.',
  arp: 'arp — show the neighbours learned on each interface (same L2 segment).',
  dig: 'dig NAME — ask this host\'s configured DNS server to resolve NAME to an address. Fails with NXDOMAIN (no record) or if no resolver is set / reachable.',
  dhclient: 'dhclient [IF] — request a DHCP lease on IF (default eth0): an address, a default gateway, and a DNS server, all handed out by the segment\'s DHCP pool.',
  resolvectl: 'resolvectl dns IF SERVER — set the DNS resolver for a link.\n  resolvectl status — show the current DNS server.',
  services: 'IOS service operations: ip dhcp excluded-address LOW [HIGH]; ip dhcp pool NAME; network NET MASK; default-router IP; dns-server IP; domain-name NAME; lease DAYS. Configure DHCP relay under the client-facing interface with ip helper-address SERVER. Configure DNS with ip name-server IP and ip host NAME IP. Configure time with ntp server IP (or ntp master STRATUM on a time source); verify show ntp status and show ntp associations. Configure remote logging with logging host IP, logging trap informational, logging source-interface IF; verify show logging on sender and collector. This is an educational IOS-style subset, not a full IOS implementation.',
  mac: 'show mac address-table dynamic — inspect learned endpoint MAC addresses, VLANs, and switch ports. Entries are derived from the current Layer 2 topology.',
  'spanning-tree': 'spanning-tree vlan ID priority N — set a switch bridge priority (0–61440 in steps of 4096). Lower priority wins root bridge election.\n  show spanning-tree [vlan ID] — inspect the elected root, root/designated/alternate port roles, and forwarding/blocking state.',
  vlan: 'vlan ID — create a VLAN (1–4094) on the selected switch.\n  interface PORT — enter switch-port configuration mode.\n  switchport mode access|trunk — set the port mode.\n  switchport access vlan ID — assign an existing VLAN to an access port.\n  switchport trunk native vlan ID — set the untagged VLAN on a trunk.\n  switchport trunk allowed vlan all|10,20 — set the VLANs carried by a trunk.\n  switchport port-security — enable access-port MAC security; maximum N, violation protect|restrict|shutdown, mac-address sticky.\n  show port-security [interface PORT] — inspect secure MACs and violation counters.\n  show vlan brief — list VLANs and access ports.\n  show interfaces trunk — inspect trunk native and allowed VLANs.\n  show interfaces switchport — inspect port modes and VLAN membership.'
};

/* ---------------- tab completion ----------------
 * Candidate next-tokens for a partial line, derived from the SAME command
 * vocabulary `help` uses (so it is brand/kind-aware automatically), plus dynamic
 * completion of interface names and ping/traceroute targets. A token is a
 * placeholder (matches any typed value, not completed literally) when it carries
 * <>, |, / or . — e.g. <if>, <ip>/<pfx>, 0.0.0.0. */
const ASA_PHRASES = ['enable', 'disable', 'configure terminal', 'interface <physical-if>', 'nameif <name>', 'ip address <ip> <mask>', 'security-level <n>', 'object network <name>', 'object-group service <name>', 'access-list <name> extended permit <proto> <src> <dst>', 'access-list <name> extended deny <proto> <src> <dst>', 'access-group <name> in interface <name>', 'route <name> <dest> <mask> <gw>', 'show running-config', 'show interface ip brief', 'show route', 'show access-list', 'show nat', 'show xlate', 'packet-tracer input <name> tcp <src> <sport> <dst> <dport>', 'ping <host>', 'traceroute <host>', 'write memory', 'help'];
function tokenizeTemplate(phrase) { return phrase.trim().split(/\s+/).map(t => ({ t, ph: /[<>|/.]/.test(t) || t === '...' })); }
function commandTemplates(cli) {
  const dev = cli.net.devices[cli.cur]; if (!dev) return [];
  const kind = dev.kind, brand = deviceBrand(dev), prof = BRANDS[brand] || BRANDS.generic, fam = prof.family;
  const phrases = [];
  if (REFERENCE_CARDS[brand]) { for (const sec of REFERENCE_CARDS[brand].sections) for (const it of sec.items) if (!kind || it[2].includes(kind)) phrases.push(String(it[0])); }
  else if (fam === 'asa' || dev.firewallOS === 'asa') phrases.push(...ASA_PHRASES);
  else for (const sec of HELP_SECTIONS) for (const it of sec.items) { if (kind && !it[2].includes(kind)) continue; if (it[3] && fam && !it[3].includes(fam)) continue; phrases.push(String(it[0])); }
  const out = [];
  for (const p of phrases) for (const seg of p.split(' / ')) out.push(tokenizeTemplate(seg));
  return out;
}
function completions(cli, line) {
  const dev = cli && cli.cur != null ? cli.net.devices[cli.cur] : null;
  if (!dev) return [];
  const raw = String(line), trailing = /\s$/.test(raw);
  const toks = raw.trim().length ? raw.trim().split(/\s+/) : [];
  const pos = trailing ? toks.length : Math.max(0, toks.length - 1);
  const partial = (trailing ? '' : (toks[toks.length - 1] || '')).toLowerCase();
  const typed = toks.slice(0, pos).map(s => s.toLowerCase());
  const cand = new Set();
  const addDyn = ph => {
    const p = ph.toLowerCase();
    if (/<(if|port|physical-if|interface)/.test(p)) Object.keys(dev.ifaces).forEach(n => cand.add(n));
    else if (/<(host|name)/.test(p) || p.includes('host|ip')) {
      if (['ping', 'traceroute', 'dig', 'nmap', 'host'].includes(typed[pos - 1]) || /<(host|name)/.test(p))
        Object.keys(cli.net.devices).forEach(id => { if (id !== cli.cur) { cand.add(id); const h = cli.net.devices[id].hostname; if (h) cand.add(h); } });
    }
  };
  for (const tpl of commandTemplates(cli)) {
    if (tpl.length <= pos) continue;
    let match = true;
    for (let i = 0; i < pos; i++) { const tt = tpl[i]; if (!tt || (!tt.ph && tt.t.toLowerCase() !== typed[i])) { match = false; break; } }
    if (!match) continue;
    const next = tpl[pos];
    if (next.ph) addDyn(next.t); else cand.add(next.t);
  }
  return [...cand].filter(c => c.toLowerCase().startsWith(partial)).sort();
}

module.exports = { makeCLI, resolve, primaryIp, BRANDS, brandsForKind, completions };
