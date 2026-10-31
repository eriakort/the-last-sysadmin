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

module.exports = { primaryIp, reachable, notReachable, routeExists, subnetCorrect, aclBlocks, serviceUp };
