// Exercise learner-authored reflections in the real classroom UI with a stubbed Supabase client.
const path = require('path');
const { chromium } = require('playwright');
const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const calls = window.__calls = [];
    const user = { id: 'u-student', email: 'student@uni.edu', user_metadata: { name: 'Student One' } };
    function query(table) {
      const state = { table, filters: {} };
      const api = {
        select() { return api; },
        eq(key, value) { state.filters[key] = value; return api; },
        order() { return api; },
        insert(payload) { calls.push(['insert', table, payload]); return api; },
        update(payload) { calls.push(['update', table, payload]); return api; },
        then(resolve) {
          calls.push(['select', table, state.filters]);
          const data = table === 'profiles' ? { is_teacher: false }
            : table === 'enrollments' ? [{ role: 'student', class_id: 'c1', classes: { name: 'Intro Linux', term: 'F26' } }]
            : table === 'assignments' ? [{ id: 'a1', title: 'Linux fundamentals', mission_ids: ['1-1', '1-2'], due_at: null }]
            : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        }
      };
      return api;
    }
    window.supabase = {
      createClient() {
        return {
          from: query,
          rpc(fn, args) { calls.push(['rpc', fn, args]); return Promise.resolve({ data: [], error: null }); },
          auth: {
            getSession() { return Promise.resolve({ data: { session: { user } } }); },
            onAuthStateChange(cb) { setTimeout(() => cb('SIGNED_IN', { user }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
            signOut() { return Promise.resolve({}); },
            signInWithOtp() { return Promise.resolve({ error: null }); }
          }
        };
      }
    };
    localStorage.setItem('lsa-sb-url', 'https://x.supabase.co');
    localStorage.setItem('lsa-sb-key', 'anon-key');
  });
  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#btnSettings');
  await page.waitForTimeout(100);
  await page.click('#setClassroom');
  await page.waitForTimeout(250);
  await page.click('#cxTabs [data-cxtab="dash"]');
  const form = page.locator('[data-reflection-form="c1"]');
  if (!(await form.isVisible())) throw new Error('learner reflection form did not render in My dashboard');
  if (!(await form.getByLabel('Mission (optional)').isDisabled())) throw new Error('mission selector should require an assignment');
  await page.click('[data-reflection-save="c1"]');
  if (!(await form.locator('[data-reflection-status]').innerText()).includes('Add both')) throw new Error('required reflection prompts were not validated');
  await form.locator('[data-reflection-assignment]').selectOption('a1');
  if (!(await form.locator('[data-reflection-mission]').isEnabled())) throw new Error('mission selector did not enable after choosing an assignment');
  await form.locator('[data-reflection-mission]').selectOption('1-2');
  await form.locator('[data-reflection-learned]').fill('I learned how Linux navigation commands locate files.');
  await form.locator('[data-reflection-approach]').fill('I compared pwd, ls and find, then checked the path.');
  await form.locator('[data-reflection-evidence]').fill('The final command returned the expected path.');
  await form.locator('[data-reflection-next]').fill('Practise searching from a different directory.');
  await page.click('[data-reflection-save="c1"]');
  await page.waitForFunction(() => (window.__calls || []).some(call => call[0] === 'insert' && call[1] === 'learner_reflections'));
  const payload = await page.evaluate(() => window.__calls.find(call => call[0] === 'insert' && call[1] === 'learner_reflections')[2]);
  for (const [key, value] of Object.entries({
    class_id: 'c1', user_id: 'u-student', assignment_id: 'a1', mission_id: '1-2',
    learned: 'I learned how Linux navigation commands locate files.',
    approach: 'I compared pwd, ls and find, then checked the path.',
    evidence: 'The final command returned the expected path.',
    next_step: 'Practise searching from a different directory.'
  })) if (payload[key] !== value) throw new Error('reflection payload mismatch for ' + key);
  if (errors.length) throw new Error('browser errors: ' + errors.join('; '));
  console.log('✓ Learners can record assignment/mission reflections with required prompts and evidence fields.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
