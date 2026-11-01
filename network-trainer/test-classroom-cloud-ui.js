// Drives the classroom UI against a stubbed Supabase client (no live DB) to
// verify the wiring: a signed-in teacher sees classes + saved scenarios and can
// assign one; the assigned scenario plays. Mirrors the sysadmin game's
// test-classroom-ui.js stub approach.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const ok = m => console.log('  ✓ ' + m);
  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };

  // Install a fake window.supabase + config BEFORE any script runs.
  await page.addInitScript(() => {
    const SCEN = { id: 'authored-expose', title: 'Expose the server', mode: 'build', objective: 'Put web on 10.0.1.0/24',
      start: { devices: { web: { id: 'web', kind: 'host', ifaces: { eth0: { up: true } }, routes: [] } }, links: [] },
      success: [{ type: 'subnet_correct', dev: 'web', iface: 'eth0', cidr: '10.0.1.0/24' }] };
    const canned = {
      profiles: { single: { is_teacher: true } },
      enrollments: { list: [{ class_id: 'c1', classes: { name: 'Net 101' } }] },
      classes: { list: [{ id: 'c1', name: 'Net 101' }] },
      net_scenarios: { list: [{ id: 's1', title: 'Expose the server' }] },
      'rpc:get_class_net_scenarios': [{ id: 's1', title: 'Expose the server', data: SCEN }]
    };
    window.__calls = [];
    const builder = table => {
      const api = {
        select() { return api; }, eq() { return api; }, order() { return api; }, like() { return api; },
        insert(p) { window.__calls.push(['insert', table, p]); return api; },
        update(p) { window.__calls.push(['update', table, p]); return api; },
        upsert(p, o) { window.__calls.push(['upsert', table, p, o]); return api; },
        maybeSingle() { return Promise.resolve({ data: (canned[table] && canned[table].single) || null, error: null }); },
        then(res) { return Promise.resolve({ data: (canned[table] && canned[table].list) || [], error: null }).then(res); }
      };
      return api;
    };
    window.supabase = {
      createClient() {
        return {
          from: t => builder(t),
          rpc: (fn, args) => { window.__calls.push(['rpc', fn, args]); return Promise.resolve({ data: canned['rpc:' + fn] || [], error: null }); },
          auth: {
            getSession: () => Promise.resolve({ data: { session: { user: { id: 't1', email: 'teacher@x.edu' } } }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: {} } })
          }
        };
      }
    };
    try { localStorage.setItem('lsa-sb-url', 'https://x.supabase.co'); localStorage.setItem('lsa-sb-key', 'anon-key'); } catch (e) {}
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);   // let initCloud resolve the session

  // open the classroom
  await page.click('#btnClass'); await page.waitForTimeout(250);
  const body = await page.textContent('#modal .cx-body').catch(() => '');
  if (/Net 101/.test(body)) ok('classroom lists the enrolled class'); else fail('class not listed: ' + body);
  if (/Expose the server/.test(body)) ok('assigned scenario listed with Play'); else fail('assigned scenario missing');
  if (await page.$('#modal #doAssign')) ok('teacher assign controls shown'); else fail('assign controls missing (teacher)');

  // assign a scenario
  await page.click('#modal #doAssign'); await page.waitForTimeout(150);
  const asg = await page.evaluate(() => (window.__calls || []).find(c => c[0] === 'insert' && c[1] === 'assignments'));
  if (asg && asg[2].class_id === 'c1' && JSON.stringify(asg[2].mission_ids) === JSON.stringify(['s1'])) ok('Assign inserts an assignment for class c1 referencing s1');
  else fail('assignment insert wrong: ' + JSON.stringify(asg));

  // student plays the assigned scenario
  await page.click('#modal .playScn'); await page.waitForTimeout(200);
  if (!(await page.$('#modal'))) ok('Play closes the classroom'); else fail('modal did not close on Play');
  const brief = await page.textContent('#brief').catch(() => '');
  if (/Put web on 10\.0\.1\.0\/24/.test(brief) && await page.$('#check')) ok('assigned scenario is now playable'); else fail('scenario not loaded into play: ' + brief.slice(0, 80));
  const dbid = await page.evaluate(() => window.__PLAYING_DBID_PROBE);  // set below via a hook, else skip
  // completing it records an attempt
  // (build web on 10.0.1.0/24 quickly via the config panel)
  await page.click('#topo .node[data-dev="web"]'); await page.waitForTimeout(80);
  await page.fill('#config .ifrow[data-if="eth0"] .ip', '10.0.1.10');
  await page.fill('#config .ifrow[data-if="eth0"] .pfx', '24');
  await page.$eval('#config .ifrow[data-if="eth0"] .pfx', el => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(80);
  await page.click('#check'); await page.waitForTimeout(150);
  const st = await page.textContent('#status').catch(() => '');
  if (/complete/.test(st)) ok('student completes the scenario'); else fail('not completed: ' + st);
  const att = await page.evaluate(() => (window.__calls || []).find(c => c[0] === 'upsert' && c[1] === 'attempts'));
  if (att && att[2].mission_id === 'net:s1' && att[2].passed === true) ok('completion records a net:s1 attempt'); else fail('attempt not recorded: ' + JSON.stringify(att));

  await browser.close();
  if (errors.length) { console.error('\nCLASSROOM CLOUD UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nCLASSROOM CLOUD UI OK.');
})();
