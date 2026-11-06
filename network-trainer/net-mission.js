// Networking Trainer — M3: the mission layer.
// A mission is DATA: a starting topology + a list of declarative checks. The
// runner builds the world, binds a CLI, and grades the checks after any command.
// Same shape as the sysadmin game's missions and its authored-mission check types,
// so a no-code mission editor can emit these directly.
const C = require('./net-checks');
const { makeCLI } = require('./net-cli');

// Map a declarative check spec -> a { ok, reason } result.
function evalCheck(net, s) {
  const opt = {}; if (s.proto) opt.proto = s.proto; if (s.dport != null) opt.dport = s.dport;
  switch (s.type) {
    case 'reachable':      return C.reachable(net, s.a, s.b, opt);
    case 'not_reachable':  return C.notReachable(net, s.a, s.b, opt);
    case 'route_exists':   return C.routeExists(net, s.dev, s.cidr);
    case 'subnet_correct': return C.subnetCorrect(net, s.dev, s.iface, s.cidr);
    case 'acl_blocks':     return C.aclBlocks(net, s.src, s.dst, { proto: s.proto, dport: s.dport });
    case 'service_up':     return C.serviceUp(net, s.dev, s.port);
    case 'resolves':       return C.resolves(net, s.dev, s.name, s.ip);
    case 'ospf_neighbor':  return C.ospfNeighbor(net, s.dev, s.peer);
    case 'ospf_route':     return C.ospfRoute(net, s.dev, s.cidr);
    case 'bgp_session':    return C.bgpSession(net, s.dev, s.peer);
    case 'bgp_route':      return C.bgpRoute(net, s.dev, s.cidr);
    case 'port_forward':   return C.portForward(net, s.from, s.public, s.dport, s.server, s.proto);
    case 'mac_entry':      return C.macEntry(net, s.dev, s.device, s.vlan, s.port);
    case 'stp_root':       return C.stpRoot(net, s.dev, s.vlan, s.root);
    case 'stp_blocked':    return C.stpBlocked(net, s.dev, s.port, s.vlan);
    case 'dhcp_lease':     return C.dhcpLease(net, s.dev, s.iface, s.cidr);
    case 'ntp_sync':       return C.ntpSynchronized(net, s.dev);
    case 'syslog_received':return C.syslogReceived(net, s.collector, s.source);
    default:               return { ok: false, reason: `unknown check type: ${s.type}` };
  }
}

// Start a mission: fresh world + a console on the starting device.
function startMission(mission) {
  const net = mission.build();
  const cli = makeCLI(net, mission.console);
  const api = {
    net, cli, mission,
    run: line => cli.run(line),
    on: dev => { cli.on(dev); return api; },
    results: () => mission.success.map(s => ({ spec: s, ...evalCheck(net, s) })),
    done: () => api.results().every(r => r.ok) && api.reviewOk() && api.faultsOk(),
    // Diagnosis gate: the player must localize the fault before fixing it.
    // A mission with no `diagnose` block has no gate (ok for any index).
    requiresDiagnosis: !!mission.diagnose,
    // Design-review: planted findings the player must identify (and not the distractors).
    review: mission.review || null,
    selectedFindings: new Set(),
    foundFaults: new Set(),
    toggleFault(id) {
      if (api.foundFaults.has(id)) api.foundFaults.delete(id);
      else api.foundFaults.add(id);
    },
    faultsOk() {
      const fs = mission.faults; if (!fs) return true;
      const need = new Set(fs.filter(f => f.present).map(f => f.id));
      if (api.foundFaults.size !== need.size) return false;
      for (const id of need) if (!api.foundFaults.has(id)) return false;
      return true;
    },
    toggleFinding(id) {
      if (api.selectedFindings.has(id)) api.selectedFindings.delete(id);
      else api.selectedFindings.add(id);
    },
    reviewOk() {
      const r = mission.review; if (!r) return true;
      const planted = new Set(r.findings.filter(f => f.planted).map(f => f.id));
      if (api.selectedFindings.size !== planted.size) return false;
      for (const id of planted) if (!api.selectedFindings.has(id)) return false;
      return true;
    },
    gradeDiagnosis(idx) {
      const d = mission.diagnose;
      if (!d) return { ok: true, because: '' };
      return { ok: idx === d.answer, because: d.because };
    },
    // The `check` command: what's still unmet and why (the teaching moment).
    status() {
      const unmet = api.results().filter(r => !r.ok);
      const lines = unmet.map(r => '  ✗ ' + r.reason);
      if (mission.review && !api.reviewOk()) lines.push('  ✗ design review incomplete — check every real fault, and only those');
      if (mission.faults && !api.faultsOk()) lines.push('  ✗ localize every real fault before the ticket closes');
      return lines.length
        ? 'Not resolved yet:\n' + lines.join('\n')
        : '✓ All objectives met — ticket resolved.';
    }
  };
  cli.mission = mission;
  cli.selected = api.selectedFindings;
  cli.found = api.foundFaults;
  return api;
}

module.exports = { evalCheck, startMission };
