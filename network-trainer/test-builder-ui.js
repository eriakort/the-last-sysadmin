// Headless UI test for the scenario builder: enter build mode, author a
// build-from-scratch scenario (place endpoints + set an objective), play it,
// then build the network up through the UI until the grader accepts it.
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
  const node = d => `#topo .node[data-dev="${d}"]`;
  const clickNode = async d => { await page.click(node(d)); await page.waitForTimeout(60); };
  const addDev = async kind => { await page.click(`#config .pal[data-add="${kind}"]`); await page.waitForTimeout(70); };
  const wire = async (a, b) => { await clickNode(a); await page.click('#wireBtn'); await page.waitForTimeout(40); await clickNode(b); };
  const setAddr = async (d, ip, pfx) => {
    await clickNode(d);
    await page.fill(`#config .ifrow[data-if="eth0"] .ip`, ip);     // address first (kept),
    await page.fill(`#config .ifrow[data-if="eth0"] .pfx`, pfx);   // then prefix commits it
    await page.$eval(`#config .ifrow[data-if="eth0"] .pfx`, el => el.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForTimeout(70);
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // --- enter build mode ---
  await page.click('#btnBuild'); await page.waitForTimeout(150);
  if (await page.$('#aTitle')) ok('build mode: authoring panel shown'); else fail('authoring panel missing; brief=' + (await page.locator('#brief').innerText().catch(() => '<unavailable>')));
  if (await page.$('#config .pal[data-add="host"]')) ok('device palette present'); else fail('palette missing; config=' + (await page.locator('#config').innerText().catch(() => '<unavailable>')));
  if (await page.$('.canvas-empty')) ok('canvas starts empty'); else fail('expected empty canvas; topology=' + (await page.locator('#topoWrap').innerText().catch(() => '<unavailable>')));
  if (errors.length) console.error('  Browser errors after entering build mode: ' + errors.join(' | '));

  // --- author: place the two endpoints the student will start with ---
  await addDev('host'); await addDev('host');
  const built = await page.$$eval('#topo .node', ns => ns.map(n => n.dataset.dev));
  if (built.includes('h1') && built.includes('h2')) ok('placed h1 and h2 (' + built.join(', ') + ')'); else fail('endpoints not placed: ' + JSON.stringify(built));

  // --- author: set the objective (reachable h1 <-> h2) ---
  await page.selectOption('#chkType', 'reachable'); await page.waitForTimeout(60);
  await page.fill('#chkArgs .chkarg[data-arg="a"]', 'h1');
  await page.fill('#chkArgs .chkarg[data-arg="b"]', 'h2');
  await page.click('#addChk'); await page.waitForTimeout(80);
  if ((await page.textContent('#brief .rev-list')).includes('h1 can reach h2')) ok('objective added'); else fail('objective not listed');

  // --- play the scenario ---
  await page.click('#playScn'); await page.waitForTimeout(150);
  if (await page.$('#check')) ok('play mode: Check available'); else fail('Check button missing in play');
  // it must NOT already be solved (student has to build it)
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'bad') ok('starts unsolved — student must build'); else fail('scenario should start unsolved');

  // --- student builds from scratch: switch, links, addresses ---
  await addDev('switch');                 // sw1
  await wire('h1', 'sw1');
  await wire('h2', 'sw1');
  const links = await page.$$eval('#topo .edge', es => es.length);
  if (links === 2) ok('student wired both hosts to the switch'); else fail('expected 2 links, got ' + links);
  await setAddr('h1', '10.0.1.10', '24');
  await setAddr('h2', '10.0.1.20', '24');

  // --- grade ---
  await page.click('#check'); await page.waitForTimeout(120);
  const cls = await page.getAttribute('#status', 'class');
  const txt = await page.textContent('#status');
  if (cls === 'ok' && /complete/.test(txt)) ok('grader accepts the built network'); else fail('scenario not accepted: [' + cls + '] ' + txt);

  // --- exit build returns to the campaign ---
  await browser.close();
  if (errors.length) { console.error('\nBUILDER UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nBUILDER UI OK.');
})();
