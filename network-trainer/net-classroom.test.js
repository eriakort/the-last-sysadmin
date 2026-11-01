#!/usr/bin/env node
// The classroom data-access layer, driven against a mock Supabase client that
// records every call. Proves each operation hits the right table / RPC with the
// right shape — without needing a live database.
const C = require('./net-classroom');
const S = require('./net-scenario');

let passed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const assert = (c, m) => { if (!c) throw new Error(m); };

// Minimal chainable Supabase stub (mirrors the sysadmin game's test stub).
function mockSb(canned) {
  canned = canned || {};
  const calls = [];
  const builder = table => {
    const api = {
      select(cols) { calls.push(['select', table, cols]); return api; },
      insert(p) { calls.push(['insert', table, p]); return api; },
      update(p) { calls.push(['update', table, p]); return api; },
      upsert(p, o) { calls.push(['upsert', table, p, o]); return api; },
      eq(k, v) { calls.push(['eq', table, k, v]); return api; },
      like(k, v) { calls.push(['like', table, k, v]); return api; },
      order() { return api; },
      maybeSingle() { return Promise.resolve({ data: (canned[table] || [])[0] || null, error: null }); },
      then(resolve) { return Promise.resolve({ data: canned[table] || [], error: null }).then(resolve); }
    };
    return api;
  };
  const sb = { from: t => builder(t), rpc: (fn, args) => { calls.push(['rpc', fn, args]); return Promise.resolve({ data: canned['rpc:' + fn] || [], error: null }); } };
  return { sb, calls };
}
const find = (calls, op, table) => calls.find(c => c[0] === op && c[1] === table);

test('saveScenario inserts a new scenario with author_id, title, and data', async () => {
  const { sb, calls } = mockSb();
  const scn = { title: 'Connect the floor', success: [{ type: 'reachable', a: 'h1', b: 'h2' }], start: { devices: {}, links: [] } };
  await C.saveScenario(sb, 'user-1', scn);
  const ins = find(calls, 'insert', 'net_scenarios');
  assert(ins, 'inserts into net_scenarios');
  assert(ins[2].author_id === 'user-1', 'carries author_id');
  assert(ins[2].title === 'Connect the floor', 'carries title');
  assert(ins[2].data && ins[2].data.success.length === 1, 'stores the full scenario in data');
  assert(find(calls, 'select', 'net_scenarios'), 'chains .select() to return the row');
});

test('saveScenario updates when the scenario already has a dbId', async () => {
  const { sb, calls } = mockSb();
  await C.saveScenario(sb, 'user-1', { dbId: 'scn-9', title: 'Edited', start: {}, success: [] });
  const up = find(calls, 'update', 'net_scenarios');
  assert(up, 'updates net_scenarios');
  assert(calls.some(c => c[0] === 'eq' && c[2] === 'id' && c[3] === 'scn-9'), 'targets the right id');
});

test('assignScenarios writes an assignment row referencing the scenario ids', async () => {
  const { sb, calls } = mockSb();
  await C.assignScenarios(sb, 'class-1', 'Week 3 — build a DMZ', ['scn-a', 'scn-b'], '2026-12-01T00:00:00Z');
  const ins = find(calls, 'insert', 'assignments');
  assert(ins, 'inserts into the shared assignments table');
  assert(ins[2].class_id === 'class-1', 'for the right class');
  assert(JSON.stringify(ins[2].mission_ids) === JSON.stringify(['scn-a', 'scn-b']), 'carries the scenario ids');
  assert(ins[2].due_at === '2026-12-01T00:00:00Z', 'carries the due date');
});

test('assignedScenarios calls the SECURITY DEFINER delivery RPC', async () => {
  const { sb, calls } = mockSb({ 'rpc:get_class_net_scenarios': [{ id: 'scn-a', title: 'DMZ', data: {} }] });
  const { data } = await C.assignedScenarios(sb, 'class-1');
  const rpc = find(calls, 'rpc', undefined) || calls.find(c => c[0] === 'rpc');
  assert(rpc && rpc[1] === 'get_class_net_scenarios', 'calls get_class_net_scenarios');
  assert(rpc[2].p_class_id === 'class-1', 'passes the class id');
  assert(data[0].id === 'scn-a', 'returns the delivered scenarios');
});

test('recordAttempt upserts a namespaced attempt into the shared table', async () => {
  const { sb, calls } = mockSb();
  await C.recordAttempt(sb, 'user-1', 'scn-a', { passed: true, ms: 42000, hints: 1 });
  const up = find(calls, 'upsert', 'attempts');
  assert(up, 'upserts into attempts');
  assert(up[2].user_id === 'user-1', 'for the student');
  assert(up[2].mission_id === 'net:scn-a', 'namespaces the id so it never collides with sysadmin missions');
  assert(up[2].passed === true && up[2].ms === 42000 && up[2].hints === 1, 'records the result');
  assert(up[3] && up[3].onConflict === 'user_id,mission_id', 'upsert keyed on (user, mission)');
});

test('myAttempts reads only the student\'s network attempts', async () => {
  const { sb, calls } = mockSb({ attempts: [{ mission_id: 'net:scn-a', passed: true }] });
  await C.myAttempts(sb, 'user-1');
  assert(find(calls, 'eq', 'attempts'), 'scoped to the user');
  assert(calls.some(c => c[0] === 'like' && c[3] === 'net:%'), 'filters to net: attempts');
});

// a delivered scenario is directly playable by the engine
test('a delivered scenario (data column) converts to a runnable mission', () => {
  const scn = { title: 'DMZ', mode: 'build', objective: 'Expose the server', start: { devices: { web: { id: 'web', kind: 'host', ifaces: { eth0: { up: true } } } }, links: [] }, success: [{ type: 'subnet_correct', dev: 'web', iface: 'eth0', cidr: '10.0.1.0/24' }] };
  const m = S.toMission(scn);
  assert(typeof m.build === 'function' && m.success.length === 1, 'toMission produces a runnable mission');
});

let failed = 0;
(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + '\n      ' + e.message); } }
  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total.`);
  if (failed) process.exit(1);
})();
