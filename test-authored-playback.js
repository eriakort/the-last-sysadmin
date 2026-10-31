// End-to-end: a student opens their class, launches a delivered authored
// mission in the practice sandbox, solves it with a real command, and an
// attempt is recorded (so the grade would update). Drives the real game against
// a stubbed Supabase client.
const path = require('path');
const { chromium } = require('playwright');
const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.addInitScript(() => {
    const calls = (window.__calls = []);
    const user = { id: 'stu-1', email: 'student@uni.edu', user_metadata: { name: 'Sam Student' } };
    const authoredMission = {
      id: '0a111111-1111-1111-1111-111111111111', author_id: 't-1',
      title: 'Check the uptime', story: 'The teacher wants you to report uptime.',
      objective: 'Run `uptime` to see how long the box has been up.',
      hints: ['Just type uptime.'], check_type: 'command_run',
      check_arg1: 'uptime', check_arg2: null, created_at: '2026-01-01'
    };
    function qb(table) {
      const st = { table };
      const api = {
        select() { return api; }, eq() { return api; }, order() { return api; },
        maybeSingle() { if (st.table === 'profiles') return Promise.resolve({ data: { is_teacher: false }, error: null }); return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve({ data: {}, error: null }); },
        insert(p) { st.payload = p; return api; },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        upsert(p, opts) { calls.push(['upsert', st.table, p, opts]); return Promise.resolve({ error: null }); },
        then(res) {
          calls.push(['list', st.table]);
          const data = st.table === 'enrollments'
            ? [{ role: 'student', class_id: 'c1', classes: { name: 'Linux Admin 101', term: 'F26', join_code: 'ZZZ999' } }]
            : st.table === 'attempts' ? []
            : st.table === 'assignments' ? []
            : st.table === 'feedback' ? []
            : [];
          return Promise.resolve({ data, error: null }).then(res);
        }
      };
      return api;
    }
    window.supabase = {
      createClient() {
        return {
          from: qb,
          rpc(fn, args) {
            calls.push(['rpc', fn, args]);
            if (fn === 'get_class_missions') return Promise.resolve({ data: [authoredMission], error: null });
            return Promise.resolve({ data: [], error: null });
          },
          auth: {
            getSession() { return Promise.resolve({ data: { session: { user } } }); },
            onAuthStateChange(cb) { setTimeout(() => cb('SIGNED_IN', { user }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
            signOut() { return Promise.resolve({}); }, signInWithOtp() { return Promise.resolve({ error: null }); }
          }
        };
      }
    };
    try { localStorage.setItem('lsa-sb-url', 'https://x.supabase.co'); localStorage.setItem('lsa-sb-key', 'anon'); } catch (e) {}
  });

  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };
  const ok = m => console.log('  ✓ ' + m);

  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // Open classroom -> My dashboard tab
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  await page.click('#setClassroom'); await page.waitForTimeout(400);
  await page.click('#cxTabs [data-cxtab="dash"]'); await page.waitForTimeout(300);

  const playBtn = await page.$('[data-playclass]');
  if (playBtn) ok('Student dashboard shows a Play-custom-missions button');
  else fail('no Play button for delivered authored missions');

  // Launch practice
  if (playBtn) { await playBtn.click(); await page.waitForTimeout(400); }
  if (await page.$('#practiceBar')) ok('Practice sandbox launched (practice bar visible)');
  else fail('practice bar did not appear');

  // The objective should mention uptime; solve it by running the command
  await page.fill('#tin', 'uptime');
  await page.press('#tin', 'Enter');
  await page.waitForTimeout(400);

  // An attempt should have been recorded for the authored mission, passed=true
  const calls = await page.evaluate(() => window.__calls);
  const att = calls.find(c => c[0] === 'upsert' && c[1] === 'attempts');
  if (att && att[2] && att[2].mission_id === '0a111111-1111-1111-1111-111111111111' && att[2].passed === true)
    ok('Completing the mission recorded an attempt (passed) for the authored mission id');
  else fail('attempt not recorded correctly: ' + JSON.stringify(att));

  // get_class_missions was actually called (delivery path exercised)
  if (calls.find(c => c[0] === 'rpc' && c[1] === 'get_class_missions')) ok('Delivery function get_class_missions was called');
  else fail('get_class_missions was not called');

  // Solving the only mission auto-finishes practice and returns to the campaign
  const barVisible = await page.$eval('#practiceBar', el => !el.hidden).catch(() => false);
  if (!barVisible) ok('Practice auto-finished and returned to campaign after the last mission');
  else fail('practice bar still showing after completing the only mission');
  // and the campaign terminal is interactive again (campaign state restored)
  if (await page.$('#tin')) ok('Back in the campaign terminal');

  await browser.close();
  if (errors.length) { console.error('\nAUTHORED PLAYBACK TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nAUTHORED PLAYBACK OK.');
})();
