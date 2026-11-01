// Mission checks — pure functions of the model that return { ok, reason }.
// These are what a mission's success criteria are built from, and what the
// no-code mission editor would expose. Direct parallel to the sysadmin checkers.
const M = require('./net-model');

// Primary address of a device (first up interface with an IP).
function primaryIp(dev) {
  for (const n in dev.ifaces) { const f = dev.ifaces[n]; if (f.up !== false && f.ip != null) return f.ip; }
  return null;
}

// Host A can reach host B (round trip), optionally for a specific proto/port.
function reachable(net, aId, bId, base = {}) {
  const b = net.devices[bId]; if (!b) return { ok: false, reason: `no device ${bId}` };
  const dst = primaryIp(b); if (dst == null) return { ok: false, reason: `${bId} has no IP` };
  const r = M.ping(net, aId, dst, base);
  return { ok: r.ok, reason: r.ok ? `${aId} reaches ${bId}` : `${aId} cannot reach ${bId}: ${r.reason}` };
}
function notReachable(net, aId, bId, base = {}) {
  const r = reachable(net, aId, bId, base);
  return { ok: !r.ok, reason: r.ok ? `${aId} can reach ${bId} but should not` : `${aId} correctly cannot reach ${bId}` };
}

// Device has a route covering the given CIDR (e.g. "10.0.2.0/24").
function routeExists(net, devId, cidrStr) {
  const d = net.devices[devId]; if (!d) return { ok: false, reason: `no device ${devId}` };
  const c = M.cidr(cidrStr);
  const hit = (d.routes || []).some(r => M.networkOf(r.dest, c.prefix) === c.net && r.mask >= c.prefix);
  return { ok: hit, reason: hit ? `${devId} has a route to ${cidrStr}` : `${devId} has no route to ${cidrStr}` };
}

// An interface has an address inside the intended CIDR.
function subnetCorrect(net, devId, ifaceName, cidrStr) {
  const d = net.devices[devId]; const f = d && d.ifaces[ifaceName];
  if (!f) return { ok: false, reason: `no interface ${devId}/${ifaceName}` };
  const c = M.cidr(cidrStr);
  const ok = f.ip != null && f.mask === c.prefix && M.networkOf(f.ip, c.prefix) === c.net;
  return { ok, reason: ok ? `${devId}/${ifaceName} is correctly in ${cidrStr}` : `${devId}/${ifaceName} (${f.ip == null ? 'unset' : M.ipStr(f.ip) + '/' + f.mask}) is not in ${cidrStr}` };
}

// A firewall/host blocks a specific packet from a source host to a destination IP.
function aclBlocks(net, srcId, dstCidrOrIp, pkt) {
  const dst = typeof dstCidrOrIp === 'number' ? dstCidrOrIp : M.ip(dstCidrOrIp);
  const r = M.forward(net, srcId, { src: M.sourceIpToward(net, srcId, dst), dst, proto: pkt.proto, dport: pkt.dport });
  const blocked = !r.ok && /ACL/.test(r.reason);
  return { ok: blocked, reason: blocked ? `traffic is blocked (${r.reason} at ${r.at})` : `traffic was NOT blocked (${r.reason})` };
}

// A device is offering a service on a port.
function serviceUp(net, devId, port) {
  const d = net.devices[devId];
  const ok = !!(d && d.services && d.services[port]);
  return { ok, reason: ok ? `${devId} offers ${d.services[port]} on ${port}` : `${devId} has no service on port ${port}` };
}

// A name resolves, from devId's point of view, to the expected address.
function resolves(net, devId, name, expectIp) {
  const r = M.resolveName(net, devId, name);
  if (!r.ok) return { ok: false, reason: `${devId} cannot resolve ${name}: ${r.reason}` };
  if (expectIp == null) return { ok: true, reason: `${devId} resolves ${name} to ${M.ipStr(r.ip)}` };
  const want = typeof expectIp === 'number' ? expectIp : M.ip(expectIp);
  const ok = r.ip === want;
  return { ok, reason: ok ? `${devId} resolves ${name} to ${M.ipStr(r.ip)}` : `${devId} resolves ${name} to ${M.ipStr(r.ip)}, expected ${M.ipStr(want)}` };
}

function ospfNeighbor(net, devId, peerId) {
  const ns = M.ospfNeighbors(net, devId);
  const hit = ns.some(n => !peerId || n.id === peerId);
  return { ok: hit, reason: hit ? `${devId} has OSPF neighbor ${peerId || ns.map(n=>n.id).join(',')}` : `${devId} has no OSPF neighbor${peerId ? ' ' + peerId : ''}` };
}
function ospfRoute(net, devId, cidrStr) {
  const c = M.cidr(cidrStr);
  const hit = M.ospfLearned(net, devId).some(r => M.networkOf(r.dest, c.prefix) === c.net && r.mask >= c.prefix);
  return { ok: hit, reason: hit ? `${devId} learned ${cidrStr} via OSPF` : `${devId} has not learned ${cidrStr} via OSPF` };
}
function bgpSession(net, devId, peerId) {
  const ss = M.bgpSessions(net, devId);
  const hit = ss.some(s => s.up && (!peerId || s.peer === peerId));
  return { ok: hit, reason: hit ? `${devId} has an Established BGP session${peerId ? ' with ' + peerId : ''}` : `${devId} has no Established BGP session${peerId ? ' with ' + peerId : ''}` };
}
function bgpRoute(net, devId, cidrStr) {
  const c = M.cidr(cidrStr);
  const hit = M.bgpLearned(net, devId).some(r => M.networkOf(r.dest, c.prefix) === c.net && r.mask >= c.prefix);
  return { ok: hit, reason: hit ? `${devId} learned ${cidrStr} via BGP` : `${devId} has not learned ${cidrStr} via BGP` };
}
// A port-forward works: from `fromId`, traffic to `publicIp:dport` is delivered
// to the internal `serverId` (not just to the NAT box that owns the public IP).
function portForward(net, fromId, publicIp, dport, serverId, proto = 'tcp') {
  const r = M.ping(net, fromId, typeof publicIp === 'number' ? publicIp : M.ip(publicIp), { proto, dport });
  if (!r.ok) return { ok: false, reason: `${fromId} cannot reach ${typeof publicIp === 'number' ? M.ipStr(publicIp) : publicIp}:${dport}: ${r.reason}` };
  const ok = r.to === serverId;
  return { ok, reason: ok ? `${fromId} reaches ${serverId} via the forwarded port ${dport}` : `traffic reaches the gateway but is not forwarded to ${serverId} (lands on ${r.to})` };
}

module.exports = { primaryIp, reachable, notReachable, routeExists, subnetCorrect, aclBlocks, serviceUp, resolves, ospfNeighbor, ospfRoute, bgpSession, bgpRoute, portForward };
