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
    done: () => api.results().every(r => r.ok),
    // The `check` command: what's still unmet and why (the teaching moment).
    status() {
      const unmet = api.results().filter(r => !r.ok);
      return unmet.length
        ? 'Not resolved yet:\n' + unmet.map(r => '  ✗ ' + r.reason).join('\n')
        : '✓ All objectives met — ticket resolved.';
    }
  };
  return api;
}

module.exports = { evalCheck, startMission };
