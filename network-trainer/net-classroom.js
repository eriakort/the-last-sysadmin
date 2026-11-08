// Classroom data-access layer for the network trainer. A thin, headless wrapper
// over a Supabase client (`sb`) — no DOM, so it's tested against a mock client.
// It mirrors the sysadmin game's classroom calls and reuses the shared tables
// (classes, enrollments, assignments, attempts); the only network-specific
// pieces are net_scenarios and the get_class_net_scenarios delivery RPC.
//
// Attempt ids are namespaced `net:<scenarioId>` so network attempts never
// collide with sysadmin mission ids in the shared `attempts` table.

const ATTEMPT_PREFIX = 'net:';

// Save (insert or update) an authored scenario. `scenario.dbId` means update.
function saveScenario(sb, authorId, scenario) {
  const title = scenario.title || 'Untitled scenario';
  if (scenario.dbId) {
    return sb.from('net_scenarios').update({ title, data: scenario, updated_at: new Date().toISOString() }).eq('id', scenario.dbId).select();
  }
  return sb.from('net_scenarios').insert({ author_id: authorId, title, data: scenario }).select();
}

// List the signed-in author's own scenarios (metadata only).
function myScenarios(sb, authorId) {
  return sb.from('net_scenarios').select('id, title, created_at').eq('author_id', authorId).order('created_at', { ascending: false });
}

// Load one scenario's full data (author only; students use assignedScenarios).
function loadScenario(sb, id) {
  return sb.from('net_scenarios').select('id, title, data').eq('id', id).maybeSingle();
}

// Assign scenarios to a class (reuses the shared assignments table).
function assignScenarios(sb, classId, title, scenarioIds, dueAt) {
  return sb.from('assignments').insert({ class_id: classId, title, mission_ids: scenarioIds, due_at: dueAt || null });
}

// The scenarios a member of this class has been assigned (SECURITY DEFINER RPC).
function assignedScenarios(sb, classId) {
  return sb.rpc('get_class_net_scenarios', { p_class_id: classId });
}

// Record (upsert) a student's attempt at a scenario.
function recordAttempt(sb, userId, scenarioId, res) {
  res = res || {};
  return sb.from('attempts').upsert({
    user_id: userId,
    mission_id: ATTEMPT_PREFIX + scenarioId,
    passed: !!res.passed,
    ms: res.ms != null ? res.ms : null,
    hints: res.hints || 0,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,mission_id' });
}

// A student's own attempts across network scenarios (for marking solved).
function myAttempts(sb, userId) {
  return sb.from('attempts').select('mission_id, passed').eq('user_id', userId).like('mission_id', ATTEMPT_PREFIX + '%');
}

module.exports = { ATTEMPT_PREFIX, saveScenario, myScenarios, loadScenario, assignScenarios, assignedScenarios, recordAttempt, myAttempts };
