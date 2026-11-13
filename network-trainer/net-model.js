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

/* ---------- IPv6 address math (128-bit, via BigInt) ----------
 * Dual-stack basics: a parallel L3 space alongside IPv4. Addresses are stored on
 * interfaces as BigInt in `ip6` with prefix length in `mask6`; static v6 routes
 * live in `dev.routes6`. Forwarding reuses the same L2 engine (l2Domain). */
function ip6(s) {                                  // "2001:db8::1" -> BigInt (null if invalid)
  s = String(s).trim().toLowerCase().split('%')[0];
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) || []).length > 1) return null;
  let head, tail;
  if (s.includes('::')) { const parts = s.split('::'); head = parts[0] ? parts[0].split(':') : []; tail = parts[1] ? parts[1].split(':') : []; }
  else { head = s.split(':'); tail = null; }
  let groups;
  if (tail === null) groups = head;
  else { const miss = 8 - head.length - tail.length; if (miss < 0) return null; groups = [...head, ...Array(miss).fill('0'), ...tail]; }
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) { if (!/^[0-9a-f]{1,4}$/.test(g)) return null; n = (n << 16n) | BigInt(parseInt(g, 16)); }
  return n;
}
function ip6Str(n) {                               // BigInt -> canonical compressed string
  const groups = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((n >> BigInt(i * 16)) & 0xffffn).toString(16));
  let best = { start: -1, len: 0 }, cur = { start: -1, len: 0 };
  groups.forEach((g, i) => {
    if (g === '0') { if (cur.start < 0) cur = { start: i, len: 0 }; cur.len++; if (cur.len > best.len) best = { ...cur }; }
    else cur = { start: -1, len: 0 };
  });
  if (best.len > 1) { const before = groups.slice(0, best.start).join(':'), after = groups.slice(best.start + best.len).join(':'); return (before + '::' + after).replace(/:::/g, '::') || '::'; }
  return groups.join(':');
}
const mask6 = prefix => prefix <= 0 ? 0n : (((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix));
const networkOf6 = (addr, prefix) => addr & mask6(prefix);
const sameNet6 = (a, b, prefix) => networkOf6(a, prefix) === networkOf6(b, prefix);
function cidr6(s) { const [a, p] = String(s).split('/'); const addr = ip6(a); if (addr == null) return null; const prefix = Number(p); if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null; return { net: networkOf6(addr, prefix), prefix }; }

/* ---------- topology helpers ---------- */
// Is a device interface present and up?
function ifaceUp(net, dev, name) {
  const d = net.devices[dev]; const f = d && d.ifaces && d.ifaces[name];
  return !!(f && f.up !== false && f.errDisabled !== true);
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
function switchVlanExists(dev, vlan) { return !Array.isArray(dev.vlans) || dev.vlans.includes(vlan); }
function switchIngressVlan(port, taggedVlan) {
  if (port.mode === 'trunk') {
    const vlan = taggedVlan == null ? switchNativeVlan(port) : taggedVlan;
    return switchPortAllowsVlan(port, vlan) ? vlan : null;
  }
  const vlan = switchAccessVlan(port);
  return taggedVlan == null ? vlan : null;
}
// Deterministic per-VLAN spanning tree. Lowest bridge priority wins; device ID
// breaks ties. A breadth-first tree gives one root port per non-root switch.
function stpPriority(dev, vlan) {
  const perVlan = dev.stpPriorities || {};
  return Number(perVlan[vlan] ?? dev.stpPriority ?? 32768);
}
function bridgeCompare(net, vlan, a, b) {
  const pa = stpPriority(net.devices[a], vlan), pb = stpPriority(net.devices[b], vlan);
  return pa - pb || String(a).localeCompare(String(b));
}
/* ---------- LACP / EtherChannel link aggregation ----------
 * Member ports carry `channelGroup`. A bundle between two switches contributes a
 * single logical link: its deterministic active member link forwards, standby
 * members are skipped by STP and L2 traversal — so no member is ever STP-blocked
 * (the win over two independent links), there is no loop, and the bundle survives
 * the loss of any member. Bandwidth aggregation is conceptual (no bandwidth model). */
function linkKey(l) { return [l.a[0] + '/' + l.a[1], l.b[0] + '/' + l.b[1]].sort().join('|'); }
function linkOf(net, devId, portName) {
  return (net.links || []).find(l => (l.a[0] === devId && l.a[1] === portName) || (l.b[0] === devId && l.b[1] === portName)) || null;
}
function bundleLinksBetween(net, aId, bId) {
  return (net.links || []).filter(l => {
    const between = (l.a[0] === aId && l.b[0] === bId) || (l.a[0] === bId && l.b[0] === aId);
    if (!between) return false;
    const pa = net.devices[l.a[0]].ifaces[l.a[1]], pb = net.devices[l.b[0]].ifaces[l.b[1]];
    return pa && pb && pa.channelGroup != null && pb.channelGroup != null;
  });
}
// The single forwarding member link of the bundle between two switches (stable
// regardless of which side asks), or null if every member is down.
function activeBundleLink(net, aId, bId) {
  const live = bundleLinksBetween(net, aId, bId).filter(l =>
    l.up !== false && ifaceUp(net, l.a[0], l.a[1]) && ifaceUp(net, l.b[0], l.b[1]));
  if (!live.length) return null;
  return live.slice().sort((p, q) => linkKey(p).localeCompare(linkKey(q)))[0];
}
// Is this port usable for forwarding? A non-bundled port always is; a bundle
// member is only usable when it is its bundle's active member link.
function portForwards(net, devId, portName) {
  const port = net.devices[devId] && net.devices[devId].ifaces[portName];
  if (!port || port.channelGroup == null) return true;
  const link = linkOf(net, devId, portName); if (!link) return false;
  const peer = (link.a[0] === devId && link.a[1] === portName) ? link.b[0] : link.a[0];
  const active = activeBundleLink(net, devId, peer);
  return !!active && linkKey(active) === linkKey(link);
}
// Status of a port-channel group on a switch: its members, which peer it bonds
// to, and whether the bundle is up (a peer that also bundles these links, with
// at least one member live on both ends).
function etherChannelStatus(net, devId, group) {
  const dev = net.devices[devId]; if (!dev) return null;
  const members = Object.keys(dev.ifaces || {}).filter(p => dev.ifaces[p].channelGroup === group);
  if (!members.length) return null;
  let peer = null;
  for (const p of members) { const l = linkOf(net, devId, p); if (l) { peer = l.a[0] === devId ? l.b[0] : l.a[0]; break; } }
  const active = peer ? activeBundleLink(net, devId, peer) : null;
  const memberInfo = members.map(p => ({ port: p, up: ifaceUp(net, devId, p), active: !!active && (() => { const l = linkOf(net, devId, p); return l && linkKey(l) === linkKey(active); })() }));
  return { group, peer, members: memberInfo, up: !!active, bundled: members.length };
}
function spanningTree(net, vlan = 1) {
  const ids = Object.keys(net.devices).filter(id => net.devices[id].kind === 'switch' && switchVlanExists(net.devices[id], vlan)).sort();
  const edges = [];
  for (const l of net.links || []) {
    if (l.up === false) continue;
    const [a, ap] = l.a, [b, bp] = l.b, da = net.devices[a], db = net.devices[b];
    if (!da || !db || da.kind !== 'switch' || db.kind !== 'switch') continue;
    const pa = da.ifaces[ap], pb = db.ifaces[bp];
    if (!pa || !pb || pa.up === false || pb.up === false) continue;
    // LACP: a bundle is one logical edge — only its active member link is an STP
    // edge, so standby members are neither forwarding-duplicated nor blocked.
    if (pa.channelGroup != null && pb.channelGroup != null) {
      const active = activeBundleLink(net, a, b);
      if (!active || linkKey(active) !== linkKey(l)) continue;
    }
    if (!switchVlanExists(da, vlan) || !switchVlanExists(db, vlan)
        || !switchPortAllowsVlan(pa, vlan) || !switchPortAllowsVlan(pb, vlan)) continue;
    const aWire = pa.mode === 'trunk' && vlan !== switchNativeVlan(pa) ? vlan : null;
    const bWire = pb.mode === 'trunk' && vlan !== switchNativeVlan(pb) ? vlan : null;
    if (switchIngressVlan(pb, aWire) !== vlan || switchIngressVlan(pa, bWire) !== vlan) continue;
    edges.push({ a, ap, b, bp });
  }
  const adj = Object.fromEntries(ids.map(id => [id, []]));
  edges.forEach((e, index) => {
    adj[e.a].push({ id: e.b, port: e.ap, peerPort: e.bp, index });
    adj[e.b].push({ id: e.a, port: e.bp, peerPort: e.ap, index });
  });
  for (const id of ids) adj[id].sort((x,y) => String(x.id).localeCompare(String(y.id)) || x.port.localeCompare(y.port));
  const info = Object.fromEntries(ids.map(id => [id, {
    root: null, distance: Infinity, priority: stpPriority(net.devices[id], vlan), ports: {}
  }]));
  const visited = new Set(), treeEdges = new Set(), parent = {};
  for (const start of ids) {
    if (visited.has(start)) continue;
    const component = [], queue = [start]; visited.add(start);
    while (queue.length) {
      const id = queue.shift(); component.push(id);
      for (const e of adj[id]) if (!visited.has(e.id)) { visited.add(e.id); queue.push(e.id); }
    }
    const root = component.slice().sort((a,b)=>bridgeCompare(net,vlan,a,b))[0];
    const bfs = [root]; info[root].root = root; info[root].distance = 0;
    const treeSeen = new Set([root]);
    while (bfs.length) {
      const id = bfs.shift();
      for (const e of adj[id]) {
        if (treeSeen.has(e.id)) continue;
        treeSeen.add(e.id); bfs.push(e.id); parent[e.id] = { id, edge: e.index };
        treeEdges.add(e.index); info[e.id].root = root; info[e.id].distance = info[id].distance + 1;
      }
    }
  }
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const e = edges[edgeIndex], ia = info[e.a], ib = info[e.b];
    let ra, rb;
    if (treeEdges.has(edgeIndex)) {
      if (parent[e.a] && parent[e.a].edge === edgeIndex) { ra = 'root'; rb = 'designated'; }
      else { ra = 'designated'; rb = 'root'; }
    } else {
      const aWins = ia.distance < ib.distance || (ia.distance === ib.distance && bridgeCompare(net,vlan,e.a,e.b) < 0);
      ra = aWins ? 'designated' : 'alternate'; rb = aWins ? 'alternate' : 'designated';
    }
    info[e.a].ports[e.ap] = { role: ra, state: ra === 'alternate' ? 'blocking' : 'forwarding', neighbor: e.b, peerPort: e.bp };
    info[e.b].ports[e.bp] = { role: rb, state: rb === 'alternate' ? 'blocking' : 'forwarding', neighbor: e.a, peerPort: e.ap };
  }
  for (const id of ids) {
    for (const [port, p] of Object.entries(net.devices[id].ifaces || {})) {
      if (!info[id].ports[port]) info[id].ports[port] = { role: 'designated', state: p.up === false ? 'down' : 'forwarding', neighbor: null, peerPort: null };
    }
  }
  return { vlan, switches: info };
}
function stableMac(devId, ifaceName, dev, iface) {
  const known = iface.mac || dev.mac;
  if (known) return String(known).toLowerCase();
  let h = 2166136261;
  for (const ch of String(devId) + '/' + String(ifaceName)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const bytes = [2, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, (h >>> 4) & 255];
  return bytes.map(x => x.toString(16).padStart(2,'0')).join(':');
}
function learnMacOnSegment(net, devId, ifaceName) {
  const dev = net.devices[devId], iface = dev && dev.ifaces[ifaceName];
  if (!dev || dev.kind === 'switch' || !iface || iface.up === false) return;
  const first = neighbor(net, devId, ifaceName);
  if (!first) return;
  const [firstSwitch, firstPort] = first, sw = net.devices[firstSwitch];
  if (!sw || sw.kind !== 'switch') return;
  const vlan = switchIngressVlan(sw.ifaces[firstPort], null);
  if (vlan == null || !switchVlanExists(sw, vlan)) return;
  const mac = stableMac(devId, ifaceName, dev, iface);
  const stp = spanningTree(net, vlan), visited = new Set(), queue = [[firstSwitch, firstPort]];
  while (queue.length) {
    const [swId, ingress] = queue.shift(), key = swId + '|' + ingress;
    if (visited.has(key)) continue; visited.add(key);
    const current = net.devices[swId], state = stp.switches[swId];
    if (!current || !state || (state.ports[ingress] && state.ports[ingress].state === 'blocking')) continue;
    const ingressPort = current.ifaces[ingress], security = ingressPort && ingressPort.portSecurity;
    if (security && security.enabled) {
      security.secureMacs = security.secureMacs || [];
      security.stickyMacs = security.stickyMacs || [];
      if (!security.secureMacs.includes(mac)) {
        const maximum = Number(security.maximum || 1);
        if (security.secureMacs.length >= maximum) {
          security.violations = Number(security.violations || 0) + 1;
          if ((security.violation || 'shutdown') === 'shutdown') ingressPort.errDisabled = true;
          return false;
        }
        security.secureMacs.push(mac);
        if (security.sticky) security.stickyMacs.push(mac);
      }
    }
    net.macTables = net.macTables || {};
    net.macTables[swId] = net.macTables[swId] || {};
    net.macTables[swId][vlan] = net.macTables[swId][vlan] || {};
    net.macTables[swId][vlan][mac] = { vlan, mac, port: ingress, device: devId, iface: ifaceName, type: 'dynamic' };
    for (const port of Object.keys(current.ifaces).sort()) {
      const p = current.ifaces[port];
      if (port === ingress || p.up === false || !switchPortAllowsVlan(p, vlan)
          || (state.ports[port] && state.ports[port].state === 'blocking')) continue;
      const nb = neighbor(net, swId, port); if (!nb) continue;
      const [nextId, nextPort] = nb, next = net.devices[nextId];
      if (!next || next.kind !== 'switch' || next.ifaces[nextPort].up === false) continue;
      const nextState = stp.switches[nextId];
      if (!nextState || (nextState.ports[nextPort] && nextState.ports[nextPort].state === 'blocking')) continue;
      const wireVlan = p.mode === 'trunk' && vlan !== switchNativeVlan(p) ? vlan : null;
      if (switchIngressVlan(next.ifaces[nextPort], wireVlan) !== vlan || !switchVlanExists(next, vlan)) continue;
      queue.push([nextId, nextPort]);
    }
  }
  return true;
}
function switchMacTable(net, switchId, vlan) {
  const table = net.macTables && net.macTables[switchId];
  if (!table) return [];
  const vlans = vlan == null ? Object.keys(table).map(Number) : [Number(vlan)];
  const entries = [];
  for (const vid of vlans) {
    for (const entry of Object.values(table[vid] || {})) {
      const sw = net.devices[switchId], port = sw && sw.ifaces[entry.port];
      const state = spanningTree(net, vid).switches[switchId];
      if (!port || port.up === false || !switchVlanExists(sw, vid) || (state && state.ports[entry.port] && state.ports[entry.port].state === 'blocking')) continue;
      if (port.mode === 'trunk' ? !switchPortAllowsVlan(port, vid) : switchAccessVlan(port) !== vid) continue;
      entries.push({ ...entry });
    }
  }
  return entries.sort((a,b)=>a.vlan-b.vlan || a.mac.localeCompare(b.mac));
}
function l2Domain(net, startDev, startIface) {
  const endpoints = [], seen = new Set();
  const first = neighbor(net, startDev, startIface);
  if (!first) return endpoints;
  const [fd, fi] = first, firstDev = net.devices[fd];
  if (!firstDev || firstDev.kind !== 'switch') return [first];
  const firstPort = firstDev.ifaces[fi];
  const firstVlan = firstPort && switchIngressVlan(firstPort, null);
  if (firstVlan == null || !switchVlanExists(firstDev, firstVlan)) return endpoints;
  const stack = [[fd, fi, firstVlan]];
  while (stack.length) {
    const [d, i, vlan] = stack.pop(), key = d + '|' + i + '|' + vlan;
    if (seen.has(key)) continue; seen.add(key);
    const dev = net.devices[d]; if (!dev || dev.kind !== 'switch' || !switchVlanExists(dev, vlan)) continue;
    const stp = spanningTree(net, vlan).switches[d];
    for (const p in dev.ifaces) {
      const port = dev.ifaces[p];
      if (p === i || port.up === false || !switchPortAllowsVlan(port, vlan) || (stp && stp.ports[p] && stp.ports[p].state === 'blocking')) continue;
      if (port.channelGroup != null && !portForwards(net, d, p)) continue;   // LACP: skip standby bundle members
      const nb = neighbor(net, d, p); if (!nb) continue;
      const [nd, ni] = nb, next = net.devices[nd];
      if (!next) continue;
      if (next.kind === 'switch') {
        const ingress = next.ifaces[ni], nextStp = spanningTree(net, vlan).switches[nd];
        if (nextStp && nextStp.ports[ni] && nextStp.ports[ni].state === 'blocking') continue;
        const wireVlan = port.mode === 'trunk' && vlan !== switchNativeVlan(port) ? vlan : null;
        const mapped = ingress && switchIngressVlan(ingress, wireVlan);
        if (mapped != null && switchVlanExists(next, mapped)) stack.push([nd, ni, mapped]);
      } else if (port.mode !== 'trunk' || switchNativeVlan(port) === vlan) {
        endpoints.push([nd, ni]);
      }
    }
  }
  return endpoints;
}


/* ---------- ARP (deterministic Layer 2 resolution) ---------- */
// Resolves an IPv4 neighbor only when it is reachable in the source interface's
// current broadcast domain. This models the ARP request/reply outcome, not timers.
function arpResolve(net, srcDev, srcIface, targetIp) {
  const source = net.devices[srcDev], iface = source && source.ifaces && source.ifaces[srcIface];
  if (!source || !iface || iface.up === false || iface.ip == null) {
    return { ok: false, reason: 'Source interface is unavailable', targetIp };
  }
  const target = ip(targetIp);
  if (!sameNet(iface.ip, target, iface.mask)) {
    return { ok: false, reason: 'Target is outside the source subnet; resolve the next-hop gateway instead', targetIp: ipStr(target) };
  }
  const first = neighbor(net, srcDev, srcIface);
  if (!first) return { ok: false, reason: 'No Layer 2 neighbor is connected to the source interface', targetIp: ipStr(target) };
  const [firstId, firstPort] = first, firstDevice = net.devices[firstId];
  const vlan = firstDevice && firstDevice.kind === 'switch'
    ? switchIngressVlan(firstDevice.ifaces[firstPort], null) : null;
  const candidates = firstDevice && firstDevice.kind === 'switch'
    ? l2Domain(net, srcDev, srcIface) : [first];
  const match = candidates.find(([id, name]) => {
    const device = net.devices[id], port = device && device.ifaces && device.ifaces[name];
    return device && device.kind !== 'switch' && port && port.up !== false && port.ip === target;
  });
  if (!match) {
    return { ok: false, reason: 'No device with that address is present in the same Layer 2 broadcast domain', targetIp: ipStr(target), vlan };
  }
  const [targetDeviceId, targetIface] = match, destination = net.devices[targetDeviceId], targetPort = destination.ifaces[targetIface];
  return {
    ok: true, sourceDeviceId: srcDev, sourceIface: srcIface, sourceIp: ipStr(iface.ip),
    sourceMac: stableMac(srcDev, srcIface, source, iface), targetDeviceId, targetIface,
    targetIp: ipStr(target), targetMac: stableMac(targetDeviceId, targetIface, destination, targetPort),
    vlan, broadcastMac: 'ff:ff:ff:ff:ff:ff', scope: 'local broadcast domain'
  };
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
    const gw = l2Domain(net, devId, gwIface).find(([d, i]) => (net.devices[d].ifaces[i].ip === r.via || ownsVirtualIp(net, d, r.via)) && net.devices[d].ifaces[i].up !== false);
    if (gw) return r;
  }
  return null;
}
function hsrpStatus(net, devId, ifaceName) {
  const dev = net.devices[devId], port = dev && dev.ifaces && dev.ifaces[ifaceName], cfg = port && port.hsrp;
  if (!cfg || cfg.virtualIp == null) return null;
  const peers = [[devId, ifaceName], ...l2Domain(net, devId, ifaceName)]
    .filter(([id, name]) => {
      const d = net.devices[id], p = d && d.ifaces && d.ifaces[name], h = p && p.hsrp;
      return d && d.kind === 'router' && p && p.up !== false && h &&
        h.group === cfg.group && h.virtualIp === cfg.virtualIp;
    });
  const candidates = peers.map(([id, name]) => {
    const p = net.devices[id].ifaces[name], h = p.hsrp;
    const decrement = (h.track || []).filter(t => !net.devices[id].ifaces[t.iface] || net.devices[id].ifaces[t.iface].up === false)
      .reduce((sum, t) => sum + t.decrement, 0);
    return { id, iface: name, priority: Math.max(0, Number(h.priority || 100) - decrement), ip: p.ip || 0 };
  }).sort((a,b) => b.priority - a.priority || a.ip - b.ip || a.id.localeCompare(b.id));
  const active = candidates[0];
  const local = candidates.find(x => x.id === devId && x.iface === ifaceName);
  return { group: cfg.group, virtualIp: cfg.virtualIp, state: active && active.id === devId && active.iface === ifaceName ? 'Active' : 'Standby',
    active: active ? active.id : null, priority: local ? local.priority : 0, activePriority: active ? active.priority : 0 };
}
// VRRP: first-hop redundancy, the IETF analog of HSRP. Election is by effective
// priority (the address owner — whose real interface IP is the virtual IP — is
// always 255), then highest interface IP. State is Master / Backup.
function vrrpStatus(net, devId, ifaceName) {
  const dev = net.devices[devId], port = dev && dev.ifaces && dev.ifaces[ifaceName], cfg = port && port.vrrp;
  if (!cfg || cfg.virtualIp == null) return null;
  const effective = (id, name) => {
    const p = net.devices[id].ifaces[name], v = p.vrrp;
    if (p.ip != null && p.ip === v.virtualIp) return 255;                      // address owner
    const decrement = (v.track || []).filter(t => !net.devices[id].ifaces[t.iface] || net.devices[id].ifaces[t.iface].up === false)
      .reduce((sum, t) => sum + t.decrement, 0);
    return Math.max(0, Number(v.priority || 100) - decrement);
  };
  const peers = [[devId, ifaceName], ...l2Domain(net, devId, ifaceName)].filter(([id, name]) => {
    const d = net.devices[id], p = d && d.ifaces && d.ifaces[name], v = p && p.vrrp;
    return d && d.kind === 'router' && p && p.up !== false && v && v.group === cfg.group && v.virtualIp === cfg.virtualIp;
  });
  const candidates = peers.map(([id, name]) => ({ id, iface: name, priority: effective(id, name), ip: net.devices[id].ifaces[name].ip || 0 }))
    .sort((a, b) => b.priority - a.priority || b.ip - a.ip || a.id.localeCompare(b.id));
  const master = candidates[0];
  const local = candidates.find(x => x.id === devId && x.iface === ifaceName);
  return { group: cfg.group, virtualIp: cfg.virtualIp, state: master && master.id === devId && master.iface === ifaceName ? 'Master' : 'Backup',
    master: master ? master.id : null, priority: local ? local.priority : 0, masterPriority: master ? master.priority : 0 };
}
function ownsVirtualIp(net, devId, addr) {
  const dev = net.devices[devId]; if (!dev || dev.kind !== 'router') return false;
  return Object.entries(dev.ifaces || {}).some(([name, p]) =>
    (p.hsrp && p.hsrp.virtualIp === addr && hsrpStatus(net, devId, name)?.state === 'Active') ||
    (p.vrrp && p.vrrp.virtualIp === addr && vrrpStatus(net, devId, name)?.state === 'Master'));
}
function deviceOwning(net, addr) {
  for (const id in net.devices) if (ownsIp(net.devices[id], addr) || ownsVirtualIp(net, id, addr)) return id;
  return null;
}


/* ---------- OSPF (minimal: interface areas, neighbors, connected-route learning) ---------- */
function ospfArea(dev, iface) {
  const f = dev.ifaces[iface];
  return f && f.ospf != null ? String(f.ospf) : null;
}
function ospfPassive(dev, iface) {
  return (dev.ospf && dev.ospf.passiveInterfaces || []).includes(iface);
}
function ospfNeighbors(net, devId) {
  const dev = net.devices[devId]; if (!dev) return [];
  const out = [];
  for (const ifn in dev.ifaces) {
    const area = ospfArea(dev, ifn), local = dev.ifaces[ifn];
    if (area == null || local.up === false || local.ip == null || ospfPassive(dev, ifn)) continue;
    for (const [nd, ni] of l2Domain(net, devId, ifn)) {
      if (nd === devId) continue;
      const peer = net.devices[nd], remote = peer.ifaces[ni];
      if (peer.kind !== 'router' || ospfArea(peer, ni) !== area || remote.up === false || remote.ip == null || ospfPassive(peer, ni)) continue;
      if (!sameNet(local.ip, remote.ip, local.mask) || local.mask !== remote.mask) continue;
      out.push({ id: nd, iface: ni, area, ip: remote.ip, via: ifn, state: 'FULL' });
    }
  }
  return out;
}
// Connected subnets enabled for OSPF are advertised, including passive LANs.
function ospfAdvertised(dev) {
  const ads = [];
  for (const ifn in dev.ifaces) {
    const f = dev.ifaces[ifn];
    if (f.ospf == null || f.up === false || f.ip == null) continue;
    ads.push({ dest: networkOf(f.ip, f.mask), mask: f.mask, area: String(f.ospf), iface: ifn });
  }
  return ads;
}
// Flood the single-area link-state view through adjacent routers. Routes retain
// the first-hop neighbor as their next hop; no dynamic cost/DR election is modeled.
function ospfLearned(net, devId) {
  const learned = [], seen = new Set(), queue = [];
  for (const n of ospfNeighbors(net, devId)) queue.push({ id: n.id, firstHop: n.ip, area: n.area, depth: 1 });
  const visited = new Set([devId]);
  while (queue.length) {
    const item = queue.shift();
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    const peer = net.devices[item.id];
    for (const ad of ospfAdvertised(peer)) {
      if (ad.area !== item.area) continue;
      const key = ad.dest + '/' + ad.mask;
      if (seen.has(key) || Object.values(net.devices[devId].ifaces || {}).some(f => f.ip != null && f.up !== false && f.mask === ad.mask && networkOf(f.ip,f.mask) === ad.dest)) continue;
      seen.add(key);
      learned.push({ dest: ad.dest, mask: ad.mask, via: item.firstHop, proto: 'ospf', from: item.id, hops: item.depth });
    }
    for (const n of ospfNeighbors(net, item.id)) {
      if (n.area === item.area && !visited.has(n.id)) queue.push({ id: n.id, firstHop: item.firstHop, area: item.area, depth: item.depth + 1 });
    }
  }
  return learned;
}
function allRoutes(net, devId) {
  const dev = net.devices[devId];
  return (dev.routes || []).concat(ospfLearned(net, devId)).concat(bgpLearned(net, devId));
}


/* ---------- BGP (bounded eBGP/iBGP peering and prefix-list policy) ---------- */
function bgpConfig(dev) { return dev && dev.bgp || null; }
function bgpPrefixListAllows(dev, name, dest, mask) {
  if (!name) return true;
  const entries = dev.bgp && dev.bgp.prefixLists && dev.bgp.prefixLists[String(name).toUpperCase()];
  if (!Array.isArray(entries)) return false; // a referenced but missing list fails closed
  for (const entry of entries.slice().sort((a,b) => a.seq - b.seq)) {
    const min = entry.ge == null ? entry.mask : entry.ge;
    const max = entry.le == null ? (entry.ge == null ? entry.mask : 32) : entry.le;
    if (mask >= min && mask <= max && sameNet(dest, entry.dest, entry.mask))
      return entry.action === 'permit';
  }
  return false; // prefix-list implicit deny
}
function bgpNetworkValid(dev, network) {
  const c = cidr(network);
  const connected = Object.values(dev.ifaces || {}).some(f => f.up !== false && f.ip != null
    && f.mask === c.prefix && networkOf(f.ip, f.mask) === c.net);
  const routed = (dev.routes || []).some(r => r.dest === c.net && r.mask === c.prefix);
  return connected || routed;
}
function bgpAdvertised(net, devId, neighborIp) {
  const dev = net.devices[devId], cfg = bgpConfig(dev);
  if (!cfg) return [];
  const peer = neighborIp == null ? null : (cfg.neighbors || []).find(n => n.ip === neighborIp);
  const list = peer && peer.outPrefixList;
  return (cfg.networks || []).filter(n => bgpNetworkValid(dev, n)).map(n => {
    const c = cidr(n); return { dest: c.net, mask: c.prefix, network: n, proto: 'bgp', from: devId };
  }).filter(r => bgpPrefixListAllows(dev, list, r.dest, r.mask));
}
function bgpSessions(net, devId) {
  const dev = net.devices[devId], cfg = bgpConfig(dev);
  if (!cfg || cfg.asn == null) return [];
  const out = [];
  for (const n of cfg.neighbors || []) {
    const peerId = deviceOwning(net, n.ip), peer = peerId && net.devices[peerId], pc = bgpConfig(peer);
    const localIp = sourceIpToward(net, devId, n.ip);
    const peerNeighbor = pc && (pc.neighbors || []).find(x => x.ip === localIp);
    const reachable = !!(peer && ping(net, devId, n.ip).ok);
    const up = !!(peer && pc && pc.asn === n.remoteAs && peerNeighbor && reachable);
    out.push({ ip: n.ip, remoteAs: n.remoteAs, peer: peerId, peerNeighbor: peerNeighbor || null,
      localNeighbor: n, type: pc && pc.asn === cfg.asn ? 'iBGP' : 'eBGP', up,
      reason: !peer ? 'no such neighbor' : !pc ? 'peer has no BGP' : pc.asn !== n.remoteAs ? 'ASN mismatch' : !peerNeighbor ? 'peer has no matching neighbor' : !reachable ? 'neighbor unreachable' : 'Established' });
  }
  return out;
}
function bgpLearned(net, devId) {
  const learned = [];
  for (const s of bgpSessions(net, devId)) {
    if (!s.up) continue;
    const peer = net.devices[s.peer];
    for (const route of bgpAdvertised(net, s.peer, sourceIpToward(net, devId, s.ip))) {
      if (!bgpPrefixListAllows(net.devices[devId], s.localNeighbor.inPrefixList, route.dest, route.mask)) continue;
      learned.push({ dest: route.dest, mask: route.mask, via: s.ip, proto: 'bgp', from: s.peer, asPath: [peer.bgp.asn] });
    }
  }
  return learned;
}

/* ---------- ACLs: legacy firewall rules plus bound IOS interface ACLs ---------- */
function aclWildcardMatch(value, base, wildcard) {
  return value != null && base != null && ((value & ~wildcard) === (base & ~wildcard));
}
function asaGroupMatches(dev, name, address) {
  const group = dev.asaObjectGroups && dev.asaObjectGroups[name];
  if (!group || group.type !== 'network') return false;
  return (group.members || []).some(member => member.host != null
    ? address === member.host
    : !!(member.network && sameNet(address, member.network.net, member.network.prefix)));
}
function aclMatch(rule, dir, iface, pkt, dev) {
  if (rule.any) return true;
  if (rule.dir && rule.dir !== dir) return false;
  if (rule.dev && rule.dev !== iface) return false;
  if (rule.proto && rule.proto !== 'ip' && rule.proto !== pkt.proto) return false;
  if (rule.dport != null && rule.dport !== pkt.dport) return false;
  if (rule.srcGroup && !asaGroupMatches(dev, rule.srcGroup, pkt.src)) return false;
  if (rule.dstGroup && !asaGroupMatches(dev, rule.dstGroup, pkt.dst)) return false;
  if (rule.serviceGroup) {
    const group = dev.asaObjectGroups && dev.asaObjectGroups[rule.serviceGroup];
    if (!group || group.type !== 'service' || group.protocol !== pkt.proto || !(group.ports || []).includes(pkt.dport)) return false;
  }
  if (rule.src != null && (rule.srcWildcard != null ? !aclWildcardMatch(pkt.src, rule.src, rule.srcWildcard) : rule.src !== pkt.src)) return false;
  if (rule.dst != null && (rule.dstWildcard != null ? !aclWildcardMatch(pkt.dst, rule.dst, rule.dstWildcard) : rule.dst !== pkt.dst)) return false;
  if (rule.srcnet && !sameNet(pkt.src, rule.srcnet.net, rule.srcnet.prefix)) return false;
  if (rule.dstnet && !sameNet(pkt.dst, rule.dstnet.net, rule.dstnet.prefix)) return false;
  return true;
}
function aclDecision(dev, dir, iface, pkt) {
  const binding = dev.ifaces && dev.ifaces[iface] && dev.ifaces[iface].accessGroups && dev.ifaces[iface].accessGroups[dir];
  if (binding) {
    const rules = (dev.acls || []).filter(r => r.aclName === binding).sort((a,b) => (a.seq || 0) - (b.seq || 0));
    for (const r of rules) if (aclMatch(r, dir, iface, pkt, dev)) { r.hits = (r.hits || 0) + 1; return r.action; }
    return 'deny';
  }
  for (const r of dev.acls || []) if (!r.aclName && dir === 'in' && aclMatch(r, dir, iface, pkt)) return r.action;
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
  let pkt = { ...pktIn }, cur = srcDev, ingressIface = null;
  for (let hop = 0; hop < ttl; hop++) {
    const dev = net.devices[cur];
    if (!dev) return { ok: false, path, reason: 'unknown device', at: cur };
    path.push(cur);
    const snort = dev.brand === 'snort3' ? snortInspect(dev, pkt, path) : null;
    if (snort && snort.blocked) return { ok: false, path, reason: 'blocked by Snort 3 IPS rule ' + snort.sid, at: cur, alert: snort.alert };
    if (dev.nat) pkt = applyNat(dev, pkt, ct, reverse);   // DNAT / reverse-NAT on arrival
    const dst = pkt.dst;
    if (ownsIp(dev, dst) || ownsVirtualIp(net, cur, dst)) return { ok: true, path, reason: 'delivered', pkt };

    // VPN: an established site-to-site tunnel carries traffic for its remote
    // protected subnet straight to the far endpoint (the underlay is hidden).
    // `noTunnel` is set when probing underlay reachability, to avoid recursion.
    if (!opts.noTunnel) {
      const tun = establishedTunnelFor(net, cur, dst);
      if (tun) {
        const peerId = deviceOwning(net, tun.tunnelDest);
        if (peerId && peerId !== cur) { cur = peerId; ingressIface = null; continue; }
      }
    }

    // choose the egress interface: directly connected, else via a (failover-aware) route
    let eg = directIface(dev, dst), targetIp = dst, viaRoute = null;
    if (!eg) {
      viaRoute = routeLookupReachable(net, cur, dst);      // skip a dead next hop
      if (!viaRoute) return { ok: false, path, reason: 'no route to ' + ipStr(dst), at: cur };
      eg = directIface(dev, viaRoute.via);
      if (!eg) return { ok: false, path, reason: 'next hop not on a connected subnet', at: cur };
      targetIp = viaRoute.via;
    }
    if (aclDecision(dev, 'out', eg, pkt) === 'deny') return { ok: false, path, reason: 'blocked by ACL', at: cur };
    if (dev.firewallOS === 'asa' && ingressIface != null) {
      const inPort = dev.ifaces[ingressIface], outPort = dev.ifaces[eg];
      const hasIngressAcl = !!(inPort && inPort.accessGroups && inPort.accessGroups.in);
      const inLevel = Number(inPort && inPort.securityLevel != null ? inPort.securityLevel : 0);
      const outLevel = Number(outPort && outPort.securityLevel != null ? outPort.securityLevel : 0);
      const sessions = ct && Array.isArray(ct.asaSessions) ? ct.asaSessions : [];
      const established = sessions.some(x => x.proto === pkt.proto && x.src === pkt.dst && x.dst === pkt.src && x.dport === pkt.dport);
      if (!hasIngressAcl && inLevel <= outLevel && !established)
        return { ok: false, path, reason: 'ASA security-level policy denied traffic (' + inLevel + ' to ' + outLevel + ')', at: cur };
      if (ct && !reverse && inLevel > outLevel) {
        ct.asaSessions = ct.asaSessions || [];
        if (!ct.asaSessions.some(x => x.proto === pkt.proto && x.src === pkt.src && x.dst === pkt.dst && x.dport === pkt.dport))
          ct.asaSessions.push({ proto: pkt.proto, src: pkt.src, dst: pkt.dst, dport: pkt.dport });
      }
    }
    if (dev.nat && !reverse) pkt = applySnat(dev, pkt, eg, ct);   // masquerade on egress
    if (learnMacOnSegment(net, cur, eg) === false) return { ok: false, path, reason: 'switch port-security violation', at: cur };

    const ep = l2Domain(net, cur, eg).find(([d, i]) => (net.devices[d].ifaces[i].ip === targetIp || ownsVirtualIp(net, d, targetIp)) && net.devices[d].ifaces[i].up !== false);
    if (!ep) return { ok: false, path, reason: viaRoute ? 'gateway ' + ipStr(viaRoute.via) + ' unreachable' : 'no host with that address on the segment', at: cur };
    const [nd, ni] = ep;
    if (aclDecision(net.devices[nd], 'in', ni, pkt) === 'deny') return { ok: false, path: path.concat(nd), reason: 'blocked by ACL', at: nd };
    if (!viaRoute && !net.devices[nd].nat) return { ok: true, path: path.concat(nd), reason: 'delivered', pkt };
    cur = nd; ingressIface = ni;                 // remember the ASA ingress interface for security-level policy
  }
  return { ok: false, path, reason: 'TTL exceeded (routing loop?)' };
}

/* ---------- Snort 3 IDS/IPS inspection (educational subset) ---------- */
function snortInspect(dev, pkt, path = []) {
  const cfg = dev && dev.snort3;
  if (!cfg) return null;
  cfg.rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  cfg.alerts = Array.isArray(cfg.alerts) ? cfg.alerts : [];
  cfg.stats = cfg.stats || { inspected: 0, matched: 0, blocked: 0 };
  if (cfg.enabled === false) return null;
  cfg.stats.inspected = (cfg.stats.inspected || 0) + 1;
  const rule = cfg.rules.find(r => r.enabled !== false &&
    (r.proto === 'any' || r.proto === String(pkt.proto || 'icmp').toLowerCase()) &&
    (r.dport == null || r.dport === Number(pkt.dport || 0)) &&
    (r.src == null || r.src === pkt.src) &&
    (r.dst == null || r.dst === pkt.dst));
  if (!rule) return null;
  const alert = { sid: rule.sid, message: rule.message, action: rule.action || 'alert',
    proto: pkt.proto || 'icmp', src: pkt.src, dst: pkt.dst, dport: pkt.dport || null,
    path: path.slice(), timestamp: new Date().toISOString() };
  cfg.stats.matched = (cfg.stats.matched || 0) + 1;
  const blocked = cfg.mode === 'ips' && rule.action === 'drop';
  if (blocked) cfg.stats.blocked = (cfg.stats.blocked || 0) + 1;
  cfg.alerts.push(alert);
  if (cfg.alerts.length > 200) cfg.alerts.shift();
  return { alert, sid: rule.sid, blocked };
}

/* ---------- VPN tunnels & PKI (site-to-site) ---------- */
// A tunnel interface is { kind:'tunnel', up, tunnelSrc, tunnelDest, remote:{net,prefix}, key? }.
// A device cert is { issuer, expired?, valid? }; trust comes from dev.trustedCAs or net.pki.trusted.
function certValid(c) { return !!c && c.valid !== false && c.expired !== true; }
function trustsCA(net, devId, issuer) {
  const dev = net.devices[devId];
  const list = (dev && dev.trustedCAs) || (net.pki && net.pki.trusted) || [];
  return issuer != null && list.includes(issuer);
}
// Authentication for a tunnel: a matching pre-shared key, else mutual PKI (both
// present valid certs issued by a CA the other end trusts). No auth => down.
function tunnelAuthOk(net, aId, ta, bId, tb) {
  if (ta.key != null || tb.key != null) return ta.key != null && ta.key === tb.key;
  const ca = net.devices[aId].cert, cb = net.devices[bId].cert;
  if (ca && cb) return certValid(ca) && certValid(cb) && trustsCA(net, aId, cb.issuer) && trustsCA(net, bId, ca.issuer);
  return false;
}
// A tunnel is established iff the underlay reaches the remote endpoint, the far
// router has a mirror-image tunnel, and authentication matches on both ends.
function tunnelEstablished(net, devId, tn) {
  const dev = net.devices[devId], t = dev && dev.ifaces && dev.ifaces[tn];
  if (!t || t.kind !== 'tunnel' || t.up === false || t.tunnelSrc == null || t.tunnelDest == null) return false;
  const under = forward(net, devId, { src: t.tunnelSrc, dst: t.tunnelDest, proto: 'icmp' }, { noTunnel: true });
  if (!under.ok) return false;
  const peerId = deviceOwning(net, t.tunnelDest); if (!peerId) return false;
  const match = Object.values(net.devices[peerId].ifaces || {}).find(p =>
    p.kind === 'tunnel' && p.up !== false && p.tunnelSrc === t.tunnelDest && p.tunnelDest === t.tunnelSrc);
  if (!match) return false;
  return tunnelAuthOk(net, devId, t, peerId, match);
}
// The established tunnel on devId whose protected remote subnet contains dst.
function establishedTunnelFor(net, devId, dst) {
  const dev = net.devices[devId]; if (!dev) return null;
  for (const [tn, t] of Object.entries(dev.ifaces || {})) {
    if (t.kind === 'tunnel' && t.remote && sameNet(dst, t.remote.net, t.remote.prefix) && tunnelEstablished(net, devId, tn)) return t;
  }
  return null;
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
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return { ok: true, ip: ip(name), name };
  const dev = net.devices[srcDev];
  const local = dev && dev.hosts && dev.hosts[String(name).toLowerCase()];
  if (local != null) return { ok: true, ip: local, name, source: 'local' };
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
    if (dev.dhcp && (dev.dhcp.iface === i || !dev.dhcp.network || (dev.ifaces[i] && dev.ifaces[i].ip != null && sameNet(dev.ifaces[i].ip, dev.dhcp.network.net, dev.dhcp.network.prefix)))) return { id: d, pool: dev.dhcp, relayed: false };
    if (dev.kind === 'router' || dev.kind === 'firewall') {
      const helper = dev.ifaces[i] && dev.ifaces[i].helperAddress;
      if (helper != null) {
        const serverId = deviceOwning(net, helper), server = serverId && net.devices[serverId];
        if (server && server.dhcp && server.services && server.services[67] && ping(net, d, helper, { proto: 'udp', dport: 67 }).ok)
          return { id: serverId, pool: server.dhcp, relayed: true, relay: d };
      }
    }
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
  if (!p.range && !p.network) return { ok: false, reason: 'DHCP pool has no network statement' };
  const prefix = Number(p.prefix ?? p.network?.prefix ?? 24);
  const first = p.range ? p.range[0] : (p.network.net + 1) >>> 0;
  const last = p.range ? p.range[1] : (p.network.net + Math.pow(2, 32 - prefix) - 2) >>> 0;
  const gateway = p.gw ?? p.defaultRouter ?? null;
  const excluded = p.excluded || [];
  p.bindings = p.bindings || {};
  let addr = null;
  for (let a = first; a <= last; a++) {
    if (a === gateway || excluded.some(x => a >= x.start && a <= (x.end ?? x.start))) continue;
    const owner = deviceOwning(net, a);
    const leased = Object.entries(p.bindings).some(([id, lease]) => id !== hostId && lease.ip === a);
    if ((owner && owner !== hostId) || leased) continue;
    addr = a; break;
  }
  if (addr == null) return { ok: false, reason: 'DHCP pool exhausted — no free address' };
  host.ifaces[ifaceName] = { ...host.ifaces[ifaceName], ip: addr, mask: prefix, up: true };
  host.routes = (host.routes || []).filter(r => r.mask !== 0);
  const gw = gateway, dns = p.dns ?? p.dnsServer ?? null;
  if (gw != null) host.routes.push({ dest: 0, mask: 0, via: gw });
  if (dns != null) host.resolver = dns;
  if (p.domainName) host.domainName = p.domainName;
  p.bindings[hostId] = { ip: addr, iface: ifaceName, prefix, gateway: gw, dns, domainName: p.domainName || null, leaseDays: p.leaseDays || 1 };
  return { ok: true, ip: addr, gw, dns, prefix, domainName: p.domainName || null, relayed: srv.relayed };
}


// NTP is deliberately small: a configured peer must be reachable on UDP/123
// and advertise itself as an NTP master before a client reports synchronization.
function ntpStatus(net, devId) {
  const dev = net.devices[devId], cfg = dev && dev.ntp || {};
  if (!dev) return { synchronized: false, reason: 'device not found', associations: [] };
  if (cfg.master) return { synchronized: true, stratum: Number(cfg.stratum || 8), source: 'local clock', associations: [] };
  const associations = (cfg.servers || []).map(address => {
    const id = deviceOwning(net, address), peer = id && net.devices[id];
    const reachable = !!(peer && ping(net, devId, address, { proto: 'udp', dport: 123 }).ok);
    const master = !!(peer && peer.ntp && peer.ntp.master && peer.services && peer.services[123]);
    return { address, peer: id, reachable, synchronized: reachable && master, stratum: master ? Number(peer.ntp.stratum || 8) : null };
  });
  const active = associations.find(x => x.synchronized);
  return active
    ? { synchronized: true, stratum: Math.min(15, active.stratum + 1), source: ipStr(active.address), associations }
    : { synchronized: false, stratum: 16, source: null, reason: associations.length ? 'no reachable NTP master' : 'no NTP servers configured', associations };
}

// Observability: diagnostic system events derived from the device's CURRENT
// state (not a time series) — the "read the evidence" layer. These are the log
// lines a real device would emit for the faults present right now.
function systemLog(net, devId) {
  const dev = net.devices[devId]; if (!dev) return [];
  const out = [];
  for (const [n, f] of Object.entries(dev.ifaces || {})) {
    if (f.errDisabled) out.push({ severity: 4, facility: 'PM', message: `%PM-4-ERR_DISABLE: security violation detected, putting ${n} in err-disable state` });
    else if (f.up === false) out.push({ severity: 3, facility: 'LINK', message: `%LINK-3-UPDOWN: Interface ${n}, changed state to down` });
  }
  const ospfOn = dev.ospf || Object.values(dev.ifaces || {}).some(f => f.ospf != null);
  if (ospfOn && ospfNeighbors(net, devId).length === 0)
    out.push({ severity: 5, facility: 'OSPF', message: `%OSPF-5-ADJCHG: no neighbor reached FULL state (check interface areas, subnet and link state)` });
  const bgpNeighbors = (dev.bgp && dev.bgp.neighbors) || [];
  if (bgpNeighbors.length) {
    const upCount = bgpSessions(net, devId).filter(s => s.up).length;
    if (upCount < bgpNeighbors.length) out.push({ severity: 5, facility: 'BGP', message: `%BGP-5-ADJCHANGE: ${bgpNeighbors.length - upCount} neighbor(s) not in Established state` });
  }
  return out;
}
// Per-device traffic counters, bumped as a packet is forwarded/delivered/dropped
// along a forwarding path. User-initiated pings record these; grading does not.
function recordTraffic(net, fwd) {
  const path = (fwd && fwd.path) || [];
  path.forEach((id, i) => {
    const d = net.devices[id]; if (!d) return;
    d.counters = d.counters || { forwarded: 0, delivered: 0, dropped: 0 };
    if (i === path.length - 1) { if (fwd.ok) d.counters.delivered++; else d.counters.dropped++; }
    else d.counters.forwarded++;
  });
}

// Record a local operational event and forward it to configured, reachable collectors.
function recordSyslog(net, devId, message, severity = 6) {
  const dev = net.devices[devId]; if (!dev) return { recorded: false, forwarded: 0 };
  dev.syslog = dev.syslog || { enabled: true, hosts: [], severity: 6, local: [], forwarded: 0 };
  const cfg = dev.syslog, event = { sequence: (cfg.local.length ? cfg.local[cfg.local.length - 1].sequence : 0) + 1,
    device: dev.hostname || dev.id || devId, deviceId: devId, message: String(message), severity, timestamp: new Date().toISOString() };
  cfg.local.push(event); if (cfg.local.length > 100) cfg.local.shift();
  let forwarded = 0;
  if (cfg.enabled !== false && severity <= Number(cfg.severity ?? 6)) for (const address of cfg.hosts || []) {
    const collectorId = deviceOwning(net, address), collector = collectorId && net.devices[collectorId];
    if (!collector || !ping(net, devId, address, { proto: 'udp', dport: 514 }).ok) continue;
    if (!(collector.syslogCollector || (collector.services && collector.services[514]))) continue;
    collector.syslogEvents = collector.syslogEvents || [];
    collector.syslogEvents.push({ ...event, sourceIp: primaryAddress(dev, cfg.sourceInterface) });
    if (collector.syslogEvents.length > 500) collector.syslogEvents.shift();
    forwarded++;
  }
  cfg.forwarded = (cfg.forwarded || 0) + forwarded;
  return { recorded: true, forwarded };
}
function primaryAddress(dev, ifaceName) {
  const f = (ifaceName && dev.ifaces && dev.ifaces[ifaceName]) || Object.values(dev.ifaces || {}).find(x => x.up !== false && x.ip != null);
  return f && f.up !== false && f.ip != null ? ipStr(f.ip) : 'unassigned';
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

/* ---------- IPv6 forwarding (dual-stack basics: direct + static routes) ----------
 * A parallel hop-by-hop path over the same L2 engine. No NDP timers, NAT or v6
 * ACLs in this slice — the teaching core is addressing, static routing and
 * reachability. */
// IPv6 addresses live in the model as canonical STRINGS (so the network object
// stays JSON-serializable — no BigInt leaks into saved state); math parses them.
const eq6 = (a, b) => a != null && b != null && ip6(a) === ip6(b);
function ownsIp6(dev, dst) { return Object.values(dev.ifaces || {}).some(f => f.ip6 != null && f.up !== false && eq6(f.ip6, dst)); }
function directIface6(dev, dst) { const d = ip6(dst); if (d == null) return null; for (const [n, f] of Object.entries(dev.ifaces || {})) if (f.ip6 != null && f.up !== false && sameNet6(ip6(f.ip6), d, f.mask6)) return n; return null; }
function routeLookup6(dev, dst) { const d = ip6(dst); let best = null; for (const r of dev.routes6 || []) if (sameNet6(d, ip6(r.dest), r.prefix)) if (!best || r.prefix > best.prefix) best = r; return best; }
function forward6(net, srcDev, dst) {
  let cur = srcDev; const path = [];
  for (let hop = 0; hop < 32; hop++) {
    const dev = net.devices[cur]; if (!dev) return { ok: false, path, reason: 'unknown device' };
    path.push(cur);
    if (ownsIp6(dev, dst)) return { ok: true, path, reason: 'delivered' };
    let eg = directIface6(dev, dst), target = dst, via = null;
    if (!eg) {
      const r = routeLookup6(dev, dst); if (!r) return { ok: false, path, reason: 'no route to ' + dst };
      via = r.via; eg = directIface6(dev, via); if (!eg) return { ok: false, path, reason: 'next hop not on a connected subnet' };
      target = via;
    }
    const ep = l2Domain(net, cur, eg).find(([d, i]) => { const f = net.devices[d].ifaces[i]; return f && f.up !== false && eq6(f.ip6, target); });
    if (!ep) return { ok: false, path, reason: via ? 'gateway ' + via + ' unreachable' : 'no host with that IPv6 address on the segment' };
    if (ep[0] === cur) return { ok: true, path, reason: 'delivered' };
    cur = ep[0];
  }
  return { ok: false, path, reason: 'hop limit exceeded (routing loop?)' };
}
function sourceIp6Toward(net, devId, dst) {
  const d = net.devices[devId];
  const di = directIface6(d, dst); if (di) return d.ifaces[di].ip6;
  const r = routeLookup6(d, dst); if (r) { const gi = directIface6(d, r.via); if (gi) return d.ifaces[gi].ip6; }
  for (const n in d.ifaces) if (d.ifaces[n].ip6 != null) return d.ifaces[n].ip6;
  return null;
}
// Reachability over IPv6: the request must deliver and the reply must return.
function ping6(net, srcDev, dst) {
  const fwd = forward6(net, srcDev, dst);
  if (!fwd.ok) return { ok: false, dir: 'request', reason: fwd.reason, forward: fwd };
  const dstDev = deviceOwning6(net, dst);
  if (!dstDev) return { ok: false, dir: 'request', reason: 'no such host' };
  const srcIp = sourceIp6Toward(net, srcDev, dst);
  if (srcIp == null) return { ok: false, dir: 'reply', reason: 'source has no IPv6 address' };
  const rev = forward6(net, dstDev, srcIp);
  return { ok: rev.ok, to: dstDev, reason: rev.ok ? 'reachable' : 'reply: ' + rev.reason, forward: fwd, reply: rev };
}
function deviceOwning6(net, addr) { for (const id in net.devices) if (ownsIp6(net.devices[id], addr)) return id; return null; }

/* ---------- packet journey view model ---------- */
// A presentation-safe trace built from the same forwarding engine as ping().
// L2 switches remain transparent when the engine treats them as one segment;
// the journey never invents intermediate devices or forwarding decisions.
function packetJourney(net, srcDev, destination, opts = {}) {
  const dst = typeof destination === 'number' ? destination : ip(String(destination));
  const proto = opts.proto || 'icmp';
  const dport = opts.dport;
  const result = ping(net, srcDev, dst, { proto, dport });
  const describe = (path, direction, ok, reason) => (path || []).map((id, index) => {
    const dev = net.devices[id] || {};
    const previous = path[index - 1] || null;
    const outgoing = path[index + 1] || null;
    let ingress = null, egress = null;
    if (previous) for (const name of Object.keys(dev.ifaces || {})) {
      const peer = l2Domain(net, id, name).find(([peerId]) => peerId === previous);
      if (peer) { ingress = { local: name, peer: peer[1] }; break; }
    }
    if (outgoing) for (const name of Object.keys(dev.ifaces || {})) {
      const peer = l2Domain(net, id, name).find(([peerId]) => peerId === outgoing);
      if (peer) { egress = { local: name, peer: peer[1] }; break; }
    }
    const local = Object.entries(dev.ifaces || {}).find(([, iface]) => iface.up !== false && iface.ip != null);
    return {
      index: index + 1, deviceId: id, deviceName: dev.label || dev.hostname || id,
      kind: dev.kind || 'device', address: local ? ipStr(local[1].ip) : null,
      nextDeviceId: outgoing,
      localInterface: ingress ? ingress.local : (egress ? egress.local : null),
      peerInterface: ingress ? ingress.peer : (egress ? egress.peer : null),
      ingressInterface: ingress ? ingress.local : null,
      ingressPeerInterface: ingress ? ingress.peer : null,
      egressInterface: egress ? egress.local : null,
      egressPeerInterface: egress ? egress.peer : null,
      state: index === path.length - 1 ? (ok ? 'delivered' : 'stopped') : 'forwarded',
      direction, detail: index === path.length - 1 ? reason : (outgoing ? 'Forwarded toward ' + (net.devices[outgoing].label || net.devices[outgoing].hostname || outgoing) : 'Packet entered this device')
    };
  });
  const requestPath = result.forward && result.forward.path || [];
  const replyPath = result.reply && result.reply.path || [];
  return {
    ok: result.ok, sourceDeviceId: srcDev, destinationIp: ipStr(dst), protocol: proto,
    destinationPort: dport == null ? null : Number(dport), reason: result.reason,
    request: describe(requestPath, 'request', !!(result.forward && result.forward.ok), result.forward ? result.forward.reason : result.reason),
    reply: describe(replyPath, 'reply', !!(result.reply && result.reply.ok), result.reply ? result.reply.reason : 'Reply path not reached'),
    requestResult: result.forward ? result.forward.reason : result.reason,
    replyResult: result.reply ? result.reply.reason : 'Not attempted'
  };
}

module.exports = {
  ip, ipStr, maskOf, networkOf, sameNet, cidr,
  ip6, ip6Str, mask6, networkOf6, sameNet6, cidr6, ping6, forward6, deviceOwning6, directIface6, ownsIp6,
  neighbor, l2Domain, arpResolve, switchAccessVlan, switchNativeVlan, switchPortAllowsVlan, switchVlanExists, spanningTree, switchMacTable, stableMac, learnMacOnSegment, ownsIp, directIface, routeLookup, routeLookupReachable, deviceOwning,
  portForwards, etherChannelStatus,
  aclDecision, forward, ping, packetJourney, sourceIpToward,
  tunnelEstablished, establishedTunnelFor, certValid, trustsCA,
  ospfNeighbors, ospfLearned, ospfAdvertised, hsrpStatus, vrrpStatus, ownsVirtualIp,
  bgpSessions, bgpLearned, bgpAdvertised, bgpPrefixListAllows,
  resolveName, dhclient, dhcpServerFor, ntpStatus, recordSyslog, systemLog, recordTraffic, snortInspect
};
