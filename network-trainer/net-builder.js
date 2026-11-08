// Builder ops — pure, headless mutations of a topology ({ devices, links }).
// The design-mode UI and the no-code authoring tool are thin layers over these;
// keeping them pure means the builder is testable without a DOM. Every op keeps
// the topology valid for the engine (unique ids, real interfaces, no dangling links).
const PREFIX = { host: 'h', server: 'srv', switch: 'sw', router: 'r', firewall: 'fw' };
const SPEC = {
  host:     () => ({ kind: 'host',     ifaces: { eth0: { up: true } }, routes: [] }),
  server:   () => ({ kind: 'host',     ifaces: { eth0: { up: true } }, routes: [], services: {} }),
  switch:   () => ({ kind: 'switch',   ifaces: { p1: { up: true }, p2: { up: true }, p3: { up: true }, p4: { up: true } } }),
  router:   () => ({ kind: 'router',   ifaces: { eth0: { up: true }, eth1: { up: true } }, routes: [], acls: [] }),
  firewall: () => ({ kind: 'firewall', ifaces: { eth0: { up: true }, eth1: { up: true } }, routes: [], acls: [] })
};
const KINDS = Object.keys(SPEC);

function blank() { return { devices: {}, links: [] }; }

function uniqueId(topo, base) { let i = 1; while (topo.devices[base + i]) i++; return base + i; }

// Add a device of `kind` (host/server/switch/router/firewall). Returns its id.
function addDevice(topo, kind, id) {
  if (!SPEC[kind]) throw new Error('unknown device kind: ' + kind);
  const newId = id || uniqueId(topo, PREFIX[kind]);
  if (topo.devices[newId]) throw new Error('device id already exists: ' + newId);
  topo.devices[newId] = { id: newId, ...SPEC[kind]() };
  return newId;
}

// Remove a device and any links touching it.
function removeDevice(topo, id) {
  if (!topo.devices[id]) return false;
  delete topo.devices[id];
  if (topo.pos) delete topo.pos[id];
  topo.links = topo.links.filter(l => l.a[0] !== id && l.b[0] !== id);
  return true;
}

// An interface on `id` not already occupied by a link, or null if all are used.
function freePort(topo, id) {
  const dev = topo.devices[id]; if (!dev) return null;
  const used = new Set();
  for (const l of topo.links) {
    if (l.a[0] === id) used.add(l.a[1]);
    if (l.b[0] === id) used.add(l.b[1]);
  }
  for (const ifn in dev.ifaces) if (!used.has(ifn)) return ifn;
  return null;
}

// A free port, growing switches (pN) and routers/firewalls (ethN) when full.
// Hosts/servers keep their single interface.
function ensurePort(topo, id) {
  const p = freePort(topo, id); if (p) return p;
  const dev = topo.devices[id]; if (!dev) return null;
  if (dev.kind === 'switch') { const np = 'p' + (Object.keys(dev.ifaces).length + 1); dev.ifaces[np] = { up: true }; return np; }
  if (dev.kind === 'router' || dev.kind === 'firewall') { const np = 'eth' + Object.keys(dev.ifaces).length; dev.ifaces[np] = { up: true }; return np; }
  return null;
}

// Wire two devices. Picks free ports unless given. Returns the link, or throws.
function addLink(topo, aId, bId, aIf, bIf) {
  if (!topo.devices[aId] || !topo.devices[bId]) throw new Error('link endpoint does not exist');
  if (aId === bId) throw new Error('cannot link a device to itself');
  const a = aIf || ensurePort(topo, aId);
  const b = bIf || ensurePort(topo, bId);
  if (!a || !b) throw new Error('no free port available');
  const taken = (d, i) => topo.links.some(l => (l.a[0] === d && l.a[1] === i) || (l.b[0] === d && l.b[1] === i));
  if (taken(aId, a) || taken(bId, b)) throw new Error('port already in use');
  const link = { a: [aId, a], b: [bId, b], up: true };
  topo.links.push(link);
  return link;
}

function removeLink(topo, index) {
  if (index < 0 || index >= topo.links.length) return false;
  topo.links.splice(index, 1); return true;
}

// Duplicate a device's configuration without copying its physical links.
// The new device receives a unique id and a nearby canvas position.
function cloneDevice(topo, id) {
  const source = topo.devices[id]; if (!source) throw new Error('no such device: ' + id);
  const kind = source.services ? 'server' : source.kind;
  const newId = uniqueId(topo, PREFIX[kind] || PREFIX.host);
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = newId;
  if (copy.hostname === id) copy.hostname = newId;
  topo.devices[newId] = copy;
  if (topo.pos && topo.pos[id]) topo.pos[newId] = [topo.pos[id][0] + 32, topo.pos[id][1] + 32];
  return newId;
}

// Set (or clear) an interface address. Empty ip clears it.
function setAddress(topo, id, iface, ipStr, prefix) {
  const dev = topo.devices[id]; if (!dev || !dev.ifaces[iface]) throw new Error('no such interface');
  const M = require('./net-model');
  if (!ipStr) { delete dev.ifaces[iface].ip; delete dev.ifaces[iface].mask; }
  else { dev.ifaces[iface].ip = M.ip(ipStr); dev.ifaces[iface].mask = Number(prefix); dev.ifaces[iface].up = true; }
}

module.exports = { KINDS, blank, addDevice, cloneDevice, removeDevice, freePort, ensurePort, addLink, removeLink, setAddress };
