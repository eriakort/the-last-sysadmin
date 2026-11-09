// Pure spaced-recall scheduling for Network Trainer concepts.
const DAY_MS = 86400000;
const INTERVALS = [1, 3, 7, 14, 30];
function cloneState(state) {
  return state && typeof state === 'object' && !Array.isArray(state) ? JSON.parse(JSON.stringify(state)) : {};
}
function add(state, command, now = Date.now()) {
  const next = cloneState(state);
  if (typeof command !== 'string' || !command.trim()) return next;
  if (!next[command]) next[command] = { stage: 0, dueAt: now + DAY_MS, reviews: 0, lapses: 0 };
  return next;
}
function items(state, getGuide, now = Date.now()) {
  const source = cloneState(state);
  return Object.keys(source).map(command => {
    const guide = typeof getGuide === 'function' ? getGuide(command) : null;
    const record = source[command];
    if (!guide || !record || !Number.isFinite(Number(record.dueAt))) return null;
    return { command, guide, record, dueAt: Number(record.dueAt), due: Number(record.dueAt) <= now };
  }).filter(Boolean).sort((a, b) => a.dueAt - b.dueAt);
}
function review(state, command, remembered, now = Date.now()) {
  const next = cloneState(state), record = next[command];
  if (!record || typeof command !== 'string') return null;
  if (remembered) {
    record.stage = Math.min(INTERVALS.length - 1, Math.max(0, Number(record.stage) || 0) + 1);
    record.reviews = (Number(record.reviews) || 0) + 1;
    record.lastResult = 'recalled';
    record.dueAt = now + INTERVALS[record.stage] * DAY_MS;
  } else {
    record.stage = 0;
    record.lapses = (Number(record.lapses) || 0) + 1;
    record.lastResult = 'needs-practice';
    record.dueAt = now + DAY_MS;
  }
  record.lastReviewedAt = now;
  return next;
}
function dueCount(state, now = Date.now()) {
  return Object.values(cloneState(state)).filter(record => record && Number.isFinite(Number(record.dueAt)) && Number(record.dueAt) <= now).length;
}
module.exports = { DAY_MS, INTERVALS, add, items, review, dueCount };
