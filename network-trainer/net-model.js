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
function l2Domain(net, startDev, startIface) {
  const endpoints = [], seen = new Set();
  const first = neighbor(net, startDev, startIface);
  if (!first) return endpoints;
  const stack = [first];
  while (stack.length) {
    const [d, i] = stack.pop(); const key = d + '|' + i;
    if (seen.has(key)) continue; seen.add(key);
    const dev = net.devices[d]; if (!dev) continue;
    if (dev.kind === 'switch') {
      const vlan = dev.ifaces[i] ? (dev.ifaces[i].vlan ?? null) : null;
      for (const p in dev.ifaces) {
        if (p === i || dev.ifaces[p].up === false) continue;
        if ((dev.ifaces[p].vlan ?? null) !== vlan) continue;   // VLAN segmentation
        const nb = neighbor(net, d, p); if (nb) stack.push(nb);
      }
    } else {
      endpoints.push([d, i]);
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
function deviceOwning(net, addr) {
  for (const id in net.devices) if (ownsIp(net.devices[id], addr)) return id;
  return null;
}

/* ---------- ACLs (inbound, first match wins, default allow) ---------- */
function aclMatch(rule, dir, iface, pkt) {
  if (rule.any) return true;
  if (rule.dir && rule.dir !== dir) return false;
  if (rule.dev && rule.dev !== iface) return false;
  if (rule.proto && rule.proto !== pkt.proto) return false;
  if (rule.dport != null && rule.dport !== pkt.dport) return false;
  if (rule.src != null && rule.src !== pkt.src) return false;
  return true;
}
function aclDecision(dev, dir, iface, pkt) {
  for (const r of dev.acls || []) if (aclMatch(r, dir, iface, pkt)) return r.action;
  return 'allow';
}

/* ---------- the forwarding engine ---------- */
// Walk a packet hop by hop from srcDev toward pkt.dst. Returns
// { ok, path:[deviceIds], reason, at? }. Every reason is a teachable failure.
function forward(net, srcDev, pkt, opts = {}) {
  const ttl = opts.ttl || 16, dst = pkt.dst, path = [];
  let cur = srcDev;
  for (let hop = 0; hop < ttl; hop++) {
    const dev = net.devices[cur];
    if (!dev) return { ok: false, path, reason: 'unknown device', at: cur };
    path.push(cur);
    if (ownsIp(dev, dst)) return { ok: true, path, reason: 'delivered' };

    const eg = directIface(dev, dst);
    if (eg) {                                      // destination is on a directly-connected subnet
      const ep = l2Domain(net, cur, eg).find(([d, i]) => net.devices[d].ifaces[i].ip === dst && net.devices[d].ifaces[i].up !== false);
      if (!ep) return { ok: false, path, reason: 'no host with that address on the segment', at: cur };
      const [dd, di] = ep;
      if (aclDecision(net.devices[dd], 'in', di, pkt) === 'deny') return { ok: false, path: path.concat(dd), reason: 'blocked by ACL', at: dd };
      return { ok: true, path: path.concat(dd), reason: 'delivered' };
    }

    const r = routeLookup(dev, dst);               // otherwise route it
    if (!r) return { ok: false, path, reason: 'no route to ' + ipStr(dst), at: cur };
    const gwIface = directIface(dev, r.via);
    if (!gwIface) return { ok: false, path, reason: 'next hop not on a connected subnet', at: cur };
    const gw = l2Domain(net, cur, gwIface).find(([d, i]) => net.devices[d].ifaces[i].ip === r.via && net.devices[d].ifaces[i].up !== false);
    if (!gw) return { ok: false, path, reason: 'gateway ' + ipStr(r.via) + ' unreachable', at: cur };
    const [nd, ni] = gw;
    if (aclDecision(net.devices[nd], 'in', ni, pkt) === 'deny') return { ok: false, path: path.concat(nd), reason: 'blocked by ACL', at: nd };
    cur = nd;                                      // advance to next hop
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

// A full round trip (like ICMP echo): request must arrive AND the reply must come back.
// Catches asymmetric ACLs / missing return routes, which pure one-way reachability misses.
function ping(net, srcDev, dst, base = {}) {
  const proto = base.proto || 'icmp', dport = base.dport;
  const srcIp = sourceIpToward(net, srcDev, dst);
  const fwd = forward(net, srcDev, { src: srcIp, dst, proto, dport });
  if (!fwd.ok) return { ok: false, dir: 'request', reason: fwd.reason, forward: fwd };
  const dstDev = deviceOwning(net, dst);
  if (!dstDev) return { ok: false, dir: 'request', reason: 'no such host' };
  const rev = forward(net, dstDev, { src: dst, dst: srcIp, proto, dport });
  return { ok: rev.ok, reason: rev.ok ? 'reachable' : ('reply: ' + rev.reason), forward: fwd, reply: rev };
}

module.exports = {
  ip, ipStr, maskOf, networkOf, sameNet, cidr,
  neighbor, l2Domain, ownsIp, directIface, routeLookup, deviceOwning,
  aclDecision, forward, ping, sourceIpToward
};
