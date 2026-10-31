// Headless UI test: boot the page, solve a mission via the terminal AND via the
// config panel, and confirm Check reports resolved. Catches real page errors.
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

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // topology rendered for mission 1 (first-contact: h1, srv, sw1)
  const nodes = await page.$$eval('#topo .node', ns => ns.map(n => n.dataset.dev));
  if (nodes.includes('h1') && nodes.includes('srv') && nodes.includes('sw1')) ok('topology renders (' + nodes.join(', ') + ')');
  else fail('topology missing nodes: ' + JSON.stringify(nodes));

  // before solving, Check says not resolved
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'bad') ok('Check shows unresolved initially');
  else fail('expected unresolved status initially');

  // --- solve via the TERMINAL (console is h1 by default) ---
  await page.fill('#tin', 'ip addr add 10.0.1.10/24 dev eth0');
  await page.press('#tin', 'Enter'); await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'ok') ok('solved first-contact via the terminal');
  else fail('terminal solution did not resolve: ' + (await page.textContent('#status')));

  // the terminal echoed a command + the topology updated to show h1's new IP
  const h1sub = await page.$eval('#topo .node[data-dev="h1"] .n-sub', e => e.textContent);
  if (h1sub === '10.0.1.10') ok('topology reflects the configured address'); else fail('h1 sub = ' + h1sub);

  // --- switch to mission 3 and solve via the CONFIG PANEL ---
  await page.selectOption('#pick', { label: 'Routing — Off the local network' }); await page.waitForTimeout(200);
  // h1 is the console/selected device; its config panel is on the right. Add a default route.
  await page.fill('#config .rdest', 'default');
  await page.fill('#config .rvia', '10.0.1.1');
  await page.click('#addrt'); await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'ok') ok('solved find-the-gateway via the config panel');
  else fail('panel solution did not resolve: ' + (await page.textContent('#status')));

  // --- selecting a device by clicking it updates the panel + terminal target ---
  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(100);
  if ((await page.textContent('#config')).includes('r1 · router')) ok('clicking a node selects it for config');
  else fail('selecting r1 did not update the config panel');

  // --- game systems: XP + progress HUD updated after two solves ---
  const xp = await page.textContent('#xp'), prog = await page.textContent('#prog');
  if (+xp >= 200 && prog === '2/8') ok(`XP + progress tracked (XP ${xp}, solved ${prog})`);
  else fail(`HUD not tracking: XP ${xp}, solved ${prog}`);

  // --- progress persists across reload (localStorage) ---
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  if ((await page.textContent('#prog')) === '2/8') ok('progress persists across reload');
  else fail('progress did not persist: ' + (await page.textContent('#prog')));

  // --- settings opens and a theme applies ---
  await page.click('#btnSet'); await page.waitForTimeout(150);
  if (await page.$('#modal .themes')) ok('settings modal opens with themes');
  else fail('settings modal did not open');
  await page.click('#modal .tm[data-th="paper"]'); await page.waitForTimeout(150);
  if ((await page.getAttribute('html', 'data-theme')) === 'paper') ok('selecting a theme applies it');
  else fail('theme not applied: ' + (await page.getAttribute('html', 'data-theme')));

  await browser.close();
  if (errors.length) { console.error('\nUI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nUI OK.');
})();
