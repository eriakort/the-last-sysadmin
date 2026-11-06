// Networking Trainer — M1 engine spike.
// Pure, headless network model + forwarding engine. No DOM, no UI.
// IPs are stored as unsigned 32-bit integers so subnet math is bitwise.

/* ---------- IP / subnet math ---------- */
const ip = s => { const p = String(s).split('.').map(Number); return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0); };
const ipStr = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const maskOf = prefix => (prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
const networkOf = (addr, prefix) => (addr & maskOf(prefix)) >>> 0;
const sameNet = (a, b, prefix) => networkOf(a, prefix) === networkOf(b, prefix);
// parse "10.0.1.0/24" -> { net, prefix }
const cidr = s => { const [a, p] = String(s).split('/'); return { net: networkOf(ip(a), Number(p)), prefix: Number(p) }; };

/* ---------- topology helpers ---------- */
// Is a device interface present and up?
function ifaceUp(net, dev, name) {
  const d = net.devices[dev]; const f = d && d.ifaces && d.ifaces[name];
  return !!(f && f.up !== false);
}
// The interface on the other end of the link from (dev, name), if the link and both ends are up.
function neighbor(net, dev, name) {
  for (const l of net.links) {
    if (l.up === false) continue;
    const match = (l.a[0] === dev && l.a[1] === name) ? l.b
      : (l.b[0] === dev && l.b[1] === name) ? l.a : null;
    if (match && ifaceUp(net, dev, name) && ifaceUp(net, match[0], match[1])) return match.slice();
  }
  return null;
}
// All host/router interfaces in the same L2 broadcast domain as (startDev, startIface).
// Switches are transparent (we expand to their other ports in the same VLAN);
// hosts and routers are endpoints (we don't forward through them at L2).
function switchAccessVlan(port) { return Number(port.accessVlan ?? port.vlan ?? 1); }
function switchNativeVlan(port) { return Number(port.nativeVlan ?? 1); }
function switchPortAllowsVlan(port, vlan) {
  if (port.mode === 'trunk') return !Array.isArray(port.allowedVlans) || port.allowedVlans.includes(vlan);
  return switchAccessVlan(port) === vlan;
}
function switchIngressVlan(port, taggedVlan) {
  if (port.mode === 'trunk') {
    const vlan = taggedVlan == null ? switchNativeVlan(port) : taggedVlan;
    return switchPortAllowsVlan(port, vlan) ? vlan : null;
  }
  const vlan = switchAccessVlan(port);
  return taggedVlan == null || taggedVlan === vlan ? vlan : null;
}
function l2Domain(net, startDev, startIface) {
  const endpoints = [], seen = new Set();
  const first = neighbor(net, startDev, startIface);
  if (!first) return endpoints;
  const [fd, fi] = first, firstDev = net.devices[fd];
  if (!firstDev || firstDev.kind !== 'switch') return [first];
  const firstPort = firstDev.ifaces[fi];
  const firstVlan = firstPort && switchIngressVlan(firstPort, null);
  if (firstVlan == null) return endpoints;
  const stack = [[fd, fi, firstVlan]];
  while (stack.length) {
    const [d, i, vlan] = stack.pop(), key = d + '|' + i + '|' + vlan;
    if (seen.has(key)) continue; seen.add(key);
    const dev = net.devices[d]; if (!dev || dev.kind !== 'switch') continue;
    for (const p in dev.ifaces) {
      const port = dev.ifaces[p];
      if (p === i || port.up === false || !switchPortAllowsVlan(port, vlan)) continue;
      const nb = neighbor(net, d, p); if (!nb) continue;
      const [nd, ni] = nb, next = net.devices[nd];
      if (!next) continue;
      if (next.kind === 'switch') {
        const ingress = next.ifaces[ni];
        const mapped = ingress && switchIngressVlan(ingress, vlan);
        if (mapped === vlan) stack.push([nd, ni, vlan]);
      } else if (port.mode !== 'trunk' || switchNativeVlan(port) === vlan) {
        endpoints.push([nd, ni]);
      }
    }
  }
  return endpoints;
}

/* ---------- device lookups ---------- */
const ownsIp = (dev, addr) => Object.values(dev.ifaces || {}).some(f => f.up !== false && f.ip === addr);
function directIface(dev, addr) {                 // iface whose subnet contains addr
  for (const name in dev.ifaces) {
    const f = dev.ifaces[name];
    if (f.up === false || f.ip == null) continue;
    if (sameNet(f.ip, addr, f.mask)) return name;
  }
  return null;
}
function routeLookup(dev, addr) {                 // longest-prefix match
  let best = null;
  for (const r of dev.routes || []) if (sameNet(addr, r.dest, r.mask)) if (!best || r.mask > best.mask) best = r;
  return best;
}
// Like routeLookup, but skip a next hop that is not reachable on a connected subnet.
// Lets a second, equal-length route take over when the primary gateway is down.
function routeLookupReachable(net, devId, addr) {
  const dev = net.devices[devId];
  const cands = allRoutes(net, devId).filter(r => sameNet(addr, r.dest, r.mask));
  cands.sort((a, b) => b.mask - a.mask);
  for (const r of cands) {
    const gwIface = directIface(dev, r.via);
    if (!gwIface) continue;
    const gw = l2Domain(net, devId, gwIface).find(([d, i]) => net.devices[d].ifaces[i].ip === r.via && net.devices[d].ifaces[i].up !== false);
    if (gw) return r;
  }
  return null;
}
function deviceOwning(net, addr) {
  for (const id in net.devices) if (ownsIp(net.devices[id], addr)) return id;
  return null;
}


/* ---------- OSPF (minimal: interface areas, neighbors, connected-route learning) ---------- */
function ospfArea(dev, iface) {
  const f = dev.ifaces[iface];
  return f && f.ospf != null ? f.ospf : null;
}
function ospfNeighbors(net, devId) {
  const dev = net.devices[devId]; if (!dev) return [];
  const out = [];
  for (const ifn in dev.ifaces) {
    const area = ospfArea(dev, ifn);
    if (area == null || dev.ifaces[ifn].up === false) continue;
    for (const [nd, ni] of l2Domain(net, devId, ifn)) {
      if (nd === devId) continue;
      const peer = net.devices[nd];
      if (ospfArea(peer, ni) !== area) continue;
      if (peer.ifaces[ni].up === false || peer.ifaces[ni].ip == null) continue;
      out.push({ id: nd, iface: ni, area, ip: peer.ifaces[ni].ip, via: ifn });
    }
  }
  return out;
}
// Connected subnets a device advertises (OSPF-enabled interfaces).
function ospfAdvertised(dev) {
  const ads = [];
  for (const ifn in dev.ifaces) {
    const f = dev.ifaces[ifn];
    if (f.ospf == null || f.up === false || f.ip == null) continue;
    ads.push({ dest: networkOf(f.ip, f.mask), mask: f.mask, area: f.ospf });
  }
  return ads;
}
// Routes learned from OSPF neighbors: their advertised connected nets, via the neighbor.
function ospfLearned(net, devId) {
  const learned = [];
  for (const n of ospfNeighbors(net, devId)) {
    const peer = net.devices[n.id];
    for (const ad of ospfAdvertised(peer)) {
      if (ad.area !== n.area) continue;
      learned.push({ dest: ad.dest, mask: ad.mask, via: n.ip, proto: 'ospf', from: n.id });
    }
  }
  return learned;
}
function allRoutes(net, devId) {
  const dev = net.devices[devId];
  return (dev.routes || []).concat(ospfLearned(net, devId)).concat(bgpLearned(net, devId));
}


/* ---------- BGP (minimal: ASN, neighbors, network statements, session + learned routes) ---------- */
function bgpConfig(dev) { return dev.bgp || null; }
function bgpSessions(net, devId) {
  const dev = net.devices[devId]; const cfg = bgpConfig(dev);
  if (!cfg || cfg.asn == null) return [];
  const out = [];
  for (const n of cfg.neighbors || []) {
    const peerId = deviceOwning(net, n.ip);
    const peer = peerId && net.devices[peerId];
    const pc = peer && bgpConfig(peer);
    const back = pc && (pc.neighbors || []).some(x => {
      const mine = sourceIpToward(net, devId, n.ip);
      return x.ip === mine;
    });
    const reachable = peer && ping(net, devId, n.ip).ok;
    const up = !!(peer && pc && pc.asn === n.remoteAs && back && reachable);
    out.push({ ip: n.ip, remoteAs: n.remoteAs, peer: peerId, up, reason: !peer ? 'no such neighbor' : !pc ? 'peer has no BGP' : pc.asn !== n.remoteAs ? 'ASN mismatch' : !back ? 'peer has no matching neighbor' : !reachable ? 'neighbor unreachable' : 'Established' });
  }
  return out;
}
function bgpLearned(net, devId) {
  const learned = [];
  for (const s of bgpSessions(net, devId)) {
    if (!s.up) continue;
    const peer = net.devices[s.peer];
    for (const netw of (peer.bgp.networks || [])) {
      const c = cidr(netw);
      learned.push({ dest: c.net, mask: c.prefix, via: s.ip, proto: 'bgp', from: s.peer });
    }
  }
  return learned;
}

/* ---------- ACLs (inbound, first match wins, default allow) ---------- */
function aclMatch(rule, dir, iface, pkt) {
  if (rule.any) return true;
  if (rule.dir && rule.dir !== dir) return false;
  if (rule.dev && rule.dev !== iface) return false;
  if (rule.proto && rule.proto !== pkt.proto) return false;
  if (rule.dport != null && rule.dport !== pkt.dport) return false;
  if (rule.src != null && rule.src !== pkt.src) return false;
  if (rule.dst != null && rule.dst !== pkt.dst) return false;
  if (rule.dstnet && !sameNet(pkt.dst, rule.dstnet.net, rule.dstnet.prefix)) return false;
  return true;
}
function aclDecision(dev, dir, iface, pkt) {
  for (const r of dev.acls || []) if (aclMatch(r, dir, iface, pkt)) return r.action;
  return 'allow';
}

/* ---------- NAT (applied as a packet passes a boundary device) ---------- */
// On arrival: forward DNAT (port-forward to an inside server) or, on a reply,
// reverse the SNAT/DNAT recorded for this flow. `ct` is a one-flow conntrack.
function applyNat(dev, pkt, ct, reverse) {
  let p = pkt;
  if (reverse) {
    if (ct && ct.snat && p.dst === ct.snat.translated && ownsIp(dev, p.dst)) p = { ...p, dst: ct.snat.orig };
    if (ct && ct.dnat && p.src === ct.dnat.newDst) p = { ...p, src: ct.dnat.origDst };
    return p;
  }
  for (const r of dev.nat) {
    if (r.kind === 'dnat' && dev.ifaces[r.oif] && dev.ifaces[r.oif].ip === p.dst
        && (!r.proto || r.proto === p.proto) && r.dport === p.dport) {
      if (ct) ct.dnat = { origDst: p.dst, newDst: r.toIp };
      return { ...p, dst: r.toIp };
    }
  }
  return p;
}
// On egress via the outside interface: SNAT (masquerade) an inside source.
function applySnat(dev, pkt, eg, ct) {
  for (const r of dev.nat) {
    if (r.kind === 'snat' && r.oif === eg && dev.ifaces[eg] && dev.ifaces[eg].ip != null
        && sameNet(pkt.src, r.srcNet.net, r.srcNet.prefix)) {
      if (ct) ct.snat = { orig: pkt.src, translated: dev.ifaces[eg].ip };
      return { ...pkt, src: dev.ifaces[eg].ip };
    }
  }
  return pkt;
}

/* ---------- the forwarding engine ---------- */
// Walk a packet hop by hop from srcDev toward pkt.dst. Returns
// { ok, path:[deviceIds], reason, at?, pkt? }. Every reason is a teachable failure.
// Failover-aware (routeLookupReachable skips a dead next hop) and NAT-aware
// (boundary devices rewrite the packet; opts.ct threads a one-flow conntrack so
// ping() can reverse the translation on the reply).
function forward(net, srcDev, pktIn, opts = {}) {
  const ttl = opts.ttl || 16, path = [];
  const ct = opts.ct, reverse = !!opts.reverse;
  let pkt = { ...pktIn }, cur = srcDev;
  for (let hop = 0; hop < ttl; hop++) {
    const dev = net.devices[cur];
    if (!dev) return { ok: false, path, reason: 'unknown device', at: cur };
    path.push(cur);
    if (dev.nat) pkt = applyNat(dev, pkt, ct, reverse);   // DNAT / reverse-NAT on arrival
    const dst = pkt.dst;
    if (ownsIp(dev, dst)) return { ok: true, path, reason: 'delivered', pkt };

    // choose the egress interface: directly connected, else via a (failover-aware) route
    let eg = directIface(dev, dst), targetIp = dst, viaRoute = null;
    if (!eg) {
      viaRoute = routeLookupReachable(net, cur, dst);      // skip a dead next hop
      if (!viaRoute) return { ok: false, path, reason: 'no route to ' + ipStr(dst), at: cur };
      eg = directIface(dev, viaRoute.via);
      if (!eg) return { ok: false, path, reason: 'next hop not on a connected subnet', at: cur };
      targetIp = viaRoute.via;
    }
    if (dev.nat && !reverse) pkt = applySnat(dev, pkt, eg, ct);   // masquerade on egress

    const ep = l2Domain(net, cur, eg).find(([d, i]) => net.devices[d].ifaces[i].ip === targetIp && net.devices[d].ifaces[i].up !== false);
    if (!ep) return { ok: false, path, reason: viaRoute ? 'gateway ' + ipStr(viaRoute.via) + ' unreachable' : 'no host with that address on the segment', at: cur };
    const [nd, ni] = ep;
    if (aclDecision(net.devices[nd], 'in', ni, pkt) === 'deny') return { ok: false, path: path.concat(nd), reason: 'blocked by ACL', at: nd };
    if (!viaRoute && !net.devices[nd].nat) return { ok: true, path: path.concat(nd), reason: 'delivered', pkt };
    cur = nd;                                      // advance (to the gateway, or into a NAT box to translate)
  }
  return { ok: false, path, reason: 'TTL exceeded (routing loop?)' };
}

// The source address a device would use to reach dst (for reply packets).
function sourceIpToward(net, devId, dst) {
  const d = net.devices[devId];
  const di = directIface(d, dst); if (di) return d.ifaces[di].ip;
  const r = routeLookup(d, dst); if (r) { const gi = directIface(d, r.via); if (gi) return d.ifaces[gi].ip; }
  for (const n in d.ifaces) if (d.ifaces[n].ip != null) return d.ifaces[n].ip;
  return null;
}

/* ---------- DNS (authoritative, static records) ---------- */
// Resolve a name from srcDev's point of view. A device queries its configured
// `resolver` (a DNS server IP); that server holds a `dns` zone of name -> ipInt.
// Returns { ok, ip?, reason? } — every failure is a teachable one.
function resolveName(net, srcDev, name) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return { ok: true, ip: ip(name), name };   // already an address
  const dev = net.devices[srcDev];
  const res = dev && dev.resolver;
  if (res == null) return { ok: false, reason: 'no DNS resolver configured' };
  const q = ping(net, srcDev, res, { proto: 'udp', dport: 53 });                    // can we reach the resolver?
  if (!q.ok) return { ok: false, reason: 'cannot reach DNS server ' + ipStr(res) };
  const serverId = deviceOwning(net, res);
  const zone = serverId && net.devices[serverId].dns;
  const rec = zone && zone[String(name).toLowerCase()];
  if (rec == null) return { ok: false, reason: 'NXDOMAIN — no DNS record for ' + name };
  return { ok: true, ip: rec, name };
}

/* ---------- DHCP (a pool on one segment hands out IP + gateway + DNS) ---------- */
// A device advertises a pool as `dhcp: { iface, range:[lo,hi], prefix, gw, dns }`,
// served to the L2 segment attached to that interface.
function dhcpServerFor(net, hostId, ifaceName) {
  for (const [d, i] of l2Domain(net, hostId, ifaceName)) {
    const dev = net.devices[d];
    if (dev.dhcp && dev.dhcp.iface === i) return { id: d, pool: dev.dhcp };
  }
  return null;
}
// Request a lease on hostId's interface. Mutates the host: sets the address,
// installs the default route, records the resolver. Returns { ok, ip?, reason? }.
function dhclient(net, hostId, ifaceName) {
  const host = net.devices[hostId];
  if (!host || !host.ifaces[ifaceName]) return { ok: false, reason: 'no such interface ' + ifaceName };
  const srv = dhcpServerFor(net, hostId, ifaceName);
  if (!srv) return { ok: false, reason: 'no DHCP server responded on the segment' };
  const p = srv.pool;
  let addr = null;
  for (let a = p.range[0]; a <= p.range[1]; a++) {
    if (a === p.gw) continue;
    const owner = deviceOwning(net, a);
    if (owner && owner !== hostId) continue;        // taken by someone else
    addr = a; break;
  }
  if (addr == null) return { ok: false, reason: 'DHCP pool exhausted — no free address' };
  host.ifaces[ifaceName] = { ...host.ifaces[ifaceName], ip: addr, mask: p.prefix, up: true };
  host.routes = (host.routes || []).filter(r => r.mask !== 0);     // replace any old default
  if (p.gw != null) host.routes.push({ dest: 0, mask: 0, via: p.gw });
  if (p.dns != null) host.resolver = p.dns;
  return { ok: true, ip: addr, gw: p.gw, dns: p.dns, prefix: p.prefix };
}

// A full round trip (like ICMP echo): request must arrive AND the reply must come back.
// Catches asymmetric ACLs / missing return routes, which pure one-way reachability misses.
function ping(net, srcDev, dst, base = {}) {
  const proto = base.proto || 'icmp', dport = base.dport;
  const ct = {};                                   // one-flow conntrack, so NAT can be reversed on the reply
  const srcIp = sourceIpToward(net, srcDev, dst);
  const fwd = forward(net, srcDev, { src: srcIp, dst, proto, dport }, { ct });
  if (!fwd.ok) return { ok: false, dir: 'request', reason: fwd.reason, forward: fwd };
  const arrivedDst = fwd.pkt ? fwd.pkt.dst : dst;  // after any DNAT
  const arrivedSrc = fwd.pkt ? fwd.pkt.src : srcIp; // after any SNAT
  const dstDev = deviceOwning(net, arrivedDst);
  if (!dstDev) return { ok: false, dir: 'request', reason: 'no such host' };
  const rev = forward(net, dstDev, { src: arrivedDst, dst: arrivedSrc, proto, dport }, { ct, reverse: true });
  return { ok: rev.ok, to: dstDev, reason: rev.ok ? 'reachable' : ('reply: ' + rev.reason), forward: fwd, reply: rev };
}

module.exports = {
  ip, ipStr, maskOf, networkOf, sameNet, cidr,
  neighbor, l2Domain, switchAccessVlan, switchNativeVlan, switchPortAllowsVlan, ownsIp, directIface, routeLookup, routeLookupReachable, deviceOwning,
  aclDecision, forward, ping, sourceIpToward,
  ospfNeighbors, ospfLearned, ospfAdvertised,
  bgpSessions, bgpLearned,
  resolveName, dhclient, dhcpServerFor
};
