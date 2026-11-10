// Drives the real classroom UI against a stubbed Supabase client to verify
// wiring: Settings -> Open classroom -> create class / join by code.
const path = require('path');
const { chromium } = require('playwright');

const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // Install a fake window.supabase BEFORE any script runs.
  await page.addInitScript(() => {
    const calls = (window.__calls = []);
    const user = { id: 'u-test-1', email: 'prof@uni.edu', user_metadata: { name: 'Prof Test' } };
    function qb(table) {
      const state = { table };
      const api = {
        select() { return api; },
        eq(column, value) { state.filters = state.filters || {}; state.filters[column] = value; return api; },
        in() { return api; },
        order() { return api; },
        maybeSingle() {
          calls.push(['select', state.table]);
          if (state.table === 'profiles') return Promise.resolve({ data: { is_teacher: true }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          calls.push(['insert.select', state.table, state.payload]);
          return Promise.resolve({ data: { name: state.payload.name, join_code: 'ABC123' }, error: null });
        },
        insert(p) { state.payload = p; calls.push(['insert', state.table, p]); return api; },
        update(p) { calls.push(['update', state.table, p]); return { eq() { return Promise.resolve({ error: null }); } }; },
        then(res) { // for `select(...).eq(...)` awaited directly (enrollments/classes lists)
          calls.push(['list', state.table]);
          const data = state.table === 'enrollments'
            ? (state.filters && state.filters.class_id
              ? [{ user_id: 'u-student', role: 'student', profiles: { display_name: 'Student One', avatar: '🧑' } }]
              : [{ role: 'student', class_id: 'c1', classes: { name: 'Intro Linux', term: 'F26', join_code: 'ZZZ999' } }])
            : state.table === 'classes'
            ? [{ id: 'c9', name: 'My Course', term: 'F26', join_code: 'ABC123', created_at: '2026-01-01' }]
            : state.table === 'assignments'
            ? [{ id: 'a1', title: 'Linux fundamentals', mission_ids: ['1-1', '1-2', 'network-vlan', 'network-dhcp'], due_at: null }]
            : state.table === 'attempts'
            ? [
                { user_id: 'u-student', mission_id: '1-1', passed: true, hints: 0, updated_at: '2026-11-10T10:00:00Z' },
                { user_id: 'u-student', mission_id: '1-2', passed: false, hints: 1, updated_at: '2026-11-10T10:05:00Z' },
                { user_id: 'u-student', mission_id: 'network-vlan', passed: true, hints: 1, updated_at: '2026-11-10T10:10:00Z' },
                { user_id: 'u-student', mission_id: 'network-dhcp', passed: false, hints: 2, updated_at: '2026-11-10T10:15:00Z' }
              ]
            : [];
          return Promise.resolve({ data, error: null }).then(res);
        },
      };
      return api;
    }
    window.supabase = {
      createClient() {
        return {
          from: qb,
          rpc(fn, args) { calls.push(['rpc', fn, args]); return Promise.resolve({ data: [{ cid: 'c1', cname: 'Intro Linux', already_enrolled: false }], error: null }); },
          auth: {
            getSession() { return Promise.resolve({ data: { session: { user } } }); },
            onAuthStateChange(cb) { setTimeout(() => cb('SIGNED_IN', { user }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
            signOut() { return Promise.resolve({}); },
            signInWithOtp() { return Promise.resolve({ error: null }); },
          },
        };
      },
    };
    try { localStorage.setItem('lsa-sb-url', 'https://x.supabase.co'); localStorage.setItem('lsa-sb-key', 'anon-key'); } catch (e) {}
  });

  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(600); // let authInit resolve the fake session

  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };
  const ok = m => console.log('  ✓ ' + m);

  // Open Settings
  await page.click('#btnSettings');
  await page.waitForTimeout(150);
  if (await page.$('#setClassroom')) ok('Settings shows "Open classroom" when signed in');
  else fail('no #setClassroom button');

  // Open classroom
  await page.click('#setClassroom');
  await page.waitForTimeout(250);
  if (await page.$('#cxJoin')) ok('Classroom panel renders (Join tab present)');
  else fail('classroom panel did not render');
  // classroom is tabbed (Join / My dashboard / Teach / Question bank)
  const tabs = await page.$$eval('#cxTabs [data-cxtab]', els => els.map(e => e.dataset.cxtab));
  if (['join', 'teach'].every(t => tabs.includes(t))) ok('Classroom tabs present (' + tabs.join(', ') + ')');
  else fail('expected Join/Teach tabs, got: ' + JSON.stringify(tabs));
  // Enrolled class shows in the Join tab (textContent includes it even before switching)
  const enrolledTxt = await page.textContent('#raceContent');
  if (/Intro Linux/.test(enrolledTxt)) ok('Enrolled class listed'); else fail('enrolled class not listed');
  // Switch to the Teach tab: teacher should see the create form + owned class code
  await page.click('#cxTabs [data-cxtab="teach"]'); await page.waitForTimeout(150);
  if (await page.$('#cxCreate')) ok('Teacher sees create-class form in Teach tab'); else fail('no create form in Teach tab');
  const codeShown = await page.$$eval('.cx-code', els => els.map(e => e.textContent));
  if (codeShown.includes('ABC123')) ok('Owned class shows its join code'); else fail('join code not shown: ' + JSON.stringify(codeShown));
  const assignmentInsight = page.locator('.cx-assignment-insight');
  if (await assignmentInsight.count() === 1) ok('Teacher sees assignment-level mastery details');
  else fail('assignment-level mastery details missing');
  const assignmentText = await assignmentInsight.first().textContent();
  if (/Linux fundamentals/.test(assignmentText) && /Student One/.test(assignmentText) && /50%/.test(assignmentText)) ok('Assignment mastery reports learner evidence and the correct percentage');
  else fail('assignment mastery evidence incorrect: ' + assignmentText);

  const diagnostics = page.locator('.cx-skill-diagnostic');
  if (await diagnostics.count() === 2) ok('Teacher sees Linux and network skill diagnostics');
  else fail('skill diagnostics missing or unexpected count: ' + await diagnostics.count());
  const diagnosticText = await page.locator('#raceContent').textContent();
  if (/Navigation/.test(diagnosticText) && /Network operations/.test(diagnosticText) && /Revisit mission 1-2/.test(diagnosticText) && /Revisit mission network-dhcp/.test(diagnosticText)) ok('Skill diagnostics map Linux and network evidence to targeted practice');
  else fail('skill diagnostic evidence or recommendation incorrect: ' + diagnosticText);

  const feedbackControls = await page.locator('#fbAssignment').count();
  if (feedbackControls === 1 && await page.locator('#fbMission').count() === 1) ok('Teacher can target feedback to an assignment and mission');
  else fail('contextual feedback controls missing');
  await page.selectOption('#fbAssignment', 'a1');
  await page.selectOption('#fbMission', '1-2');
  await page.fill('#fbBody', 'Review the navigation sequence, then try again.');
  await page.click('#fbSend');
  await page.waitForTimeout(120);
  const feedbackInsert = await page.evaluate(() => window.__calls.find(c => c[0] === 'insert' && c[1] === 'feedback'));
  if (feedbackInsert && feedbackInsert[2].assignment_id === 'a1' && feedbackInsert[2].mission_id === '1-2' && feedbackInsert[2].student_id === 'u-student') ok('Feedback is stored with learner, assignment and mission context');
  else fail('contextual feedback payload incorrect: ' + JSON.stringify(feedbackInsert));

  // Join by code is tested separately; successful join closes the classroom overlay.
  await page.click('#cxTabs [data-cxtab="join"]'); await page.waitForTimeout(120);
  await page.fill('#cxCode', ' abc 123 ');
  await page.click('#cxJoin');
  await page.waitForTimeout(200);
  // Joining closes the classroom overlay; reopen it below for the create-class test.

  const calls = await page.evaluate(() => window.__calls);
  const rpc = calls.find(c => c[0] === 'rpc' && c[1] === 'enroll_by_code');
  if (rpc && rpc[2] && typeof rpc[2].code === 'string') ok('Join calls rpc enroll_by_code with {code}');
  else fail('rpc enroll_by_code not called correctly: ' + JSON.stringify(rpc));

  // Create class (in the Teach tab)
  await page.click('#btnSettings'); await page.waitForTimeout(120);
  await page.click('#setClassroom'); await page.waitForTimeout(250);
  await page.click('#cxTabs [data-cxtab="teach"]'); await page.waitForTimeout(150);
  await page.fill('#cxName', 'New Course');
  await page.click('#cxCreate');
  await page.waitForTimeout(250);
  const calls2 = await page.evaluate(() => window.__calls);
  const ins = calls2.find(c => c[0] === 'insert.select' && c[1] === 'classes');
  if (ins && ins[2] && ins[2].name === 'New Course' && ins[2].owner_id) ok('Create calls classes.insert with name + owner_id');
  else fail('classes.insert not called correctly: ' + JSON.stringify(ins));

  await browser.close();
  if (errors.length) { console.error('\nCLASSROOM UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nCLASSROOM UI OK.');
})();
