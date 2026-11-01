// Scenario format — a portable, authorable mission. A scenario is plain data:
// a starting topology, a success spec (the objectives), and the framing text.
// It serializes to JSON (shareable / assignable), validates, and converts to a
// mission object the existing startMission() runner can play. This is what the
// no-code builder emits and what a student is assigned.
//
// scenario = {
//   id, title, mode: 'build' | 'fix',
//   ticket?: { id, from, priority, symptom },
//   objective, hints: [..], diagnose?: {..},
//   start: { devices, links },      // for 'build' this may be minimal/blank
//   success: [ check specs ],       // the spec the student must satisfy
//   palette?: [kinds]               // which devices the student may add
// }

// Check types the author can pick, and the fields each needs. Mirrors evalCheck.
const CHECKS = {
  reachable:      ['a', 'b'],
  not_reachable:  ['a', 'b'],
  subnet_correct: ['dev', 'iface', 'cidr'],
  route_exists:   ['dev', 'cidr'],
  acl_blocks:     ['src', 'dst'],
  service_up:     ['dev', 'port'],
  resolves:       ['dev', 'name'],
  ospf_neighbor:  ['dev', 'peer'],
  ospf_route:     ['dev', 'cidr'],
  bgp_session:    ['dev', 'peer'],
  bgp_route:      ['dev', 'cidr'],
  port_forward:   ['from', 'public', 'dport', 'server']
};

function validate(scn) {
  const errors = [];
  if (!scn || typeof scn !== 'object') return { ok: false, errors: ['scenario is not an object'] };
  if (!scn.title) errors.push('scenario needs a title');
  const start = scn.start || { devices: {}, links: [] };
  if (!start.devices || typeof start.devices !== 'object') errors.push('start.devices must be an object');
  // links must reference real devices + interfaces
  for (const l of start.links || []) {
    for (const end of [l.a, l.b]) {
      if (!Array.isArray(end)) { errors.push('a link endpoint is malformed'); continue; }
      const d = start.devices[end[0]];
      if (!d) errors.push(`link references missing device "${end[0]}"`);
      else if (!d.ifaces || !d.ifaces[end[1]]) errors.push(`link references missing interface "${end[0]}/${end[1]}"`);
    }
  }
  // success spec
  if (!Array.isArray(scn.success) || scn.success.length === 0) errors.push('a scenario needs at least one success check');
  for (const s of scn.success || []) {
    if (!s || !CHECKS[s.type]) { errors.push(`unknown or missing check type: ${s && s.type}`); continue; }
    for (const field of CHECKS[s.type]) if (s[field] == null) errors.push(`check "${s.type}" needs "${field}"`);
  }
  return { ok: errors.length === 0, errors };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

// Convert a scenario into a mission object the runner understands.
function toMission(scn) {
  const start = scn.start || { devices: {}, links: [] };
  const configurable = Object.keys(start.devices).find(id => ['host', 'router', 'firewall'].includes(start.devices[id].kind));
  return {
    id: scn.id || 'authored-' + String(scn.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    chapter: scn.chapter || 'Authored',
    title: scn.title || 'Untitled scenario',
    story: scn.story || scn.objective || '',
    objective: scn.objective || '',
    hints: scn.hints || [],
    ticket: scn.ticket || null,
    diagnose: scn.diagnose || null,
    console: configurable || Object.keys(start.devices)[0] || null,
    build: () => clone(start),
    success: clone(scn.success || []),
    authored: true,
    mode: scn.mode || 'build',
    palette: scn.palette || ['host', 'server', 'switch', 'router', 'firewall']
  };
}

// Capture the live topology from a running mission back into a scenario's start,
// including hand-placed node positions so a saved/exported layout is preserved.
function fromTopology(topo) {
  const out = { devices: clone(topo.devices), links: clone(topo.links) };
  if (topo.pos && Object.keys(topo.pos).length) out.pos = clone(topo.pos);
  return out;
}

function toJSON(scn) { return JSON.stringify(scn, null, 2); }
function fromJSON(text) {
  const scn = JSON.parse(text);
  const v = validate(scn);
  if (!v.ok) throw new Error('invalid scenario: ' + v.errors.join('; '));
  return scn;
}

module.exports = { CHECKS, validate, toMission, fromTopology, toJSON, fromJSON, clone };
