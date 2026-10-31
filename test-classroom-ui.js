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
        eq() { return api; },
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
        insert(p) { state.payload = p; return api; },
        update(p) { calls.push(['update', state.table, p]); return { eq() { return Promise.resolve({ error: null }); } }; },
        then(res) { // for `select(...).eq(...)` awaited directly (enrollments/classes lists)
          calls.push(['list', state.table]);
          const data = state.table === 'enrollments'
            ? [{ role: 'student', class_id: 'c1', classes: { name: 'Intro Linux', term: 'F26', join_code: 'ZZZ999' } }]
            : state.table === 'classes'
            ? [{ id: 'c9', name: 'My Course', term: 'F26', join_code: 'ABC123', created_at: '2026-01-01' }]
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

  // Join by code (Join tab is the default)
  await page.click('#cxTabs [data-cxtab="join"]'); await page.waitForTimeout(120);
  await page.fill('#cxCode', ' abc 123 ');
  await page.click('#cxJoin');
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => window.__calls);
  const rpc = calls.find(c => c[0] === 'rpc');
  if (rpc && rpc[1] === 'enroll_by_code' && rpc[2] && typeof rpc[2].code === 'string') ok('Join calls rpc enroll_by_code with {code}');
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
