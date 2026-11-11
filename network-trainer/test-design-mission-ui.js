// Headless UI test for the design-from-requirements mission type. Navigates to
// the "Design a routed two-subnet network" mission, confirms the requirements
// brief renders (not an incident ticket), confirms build tools are available
// in-mission, confirms an empty network fails the Check, then builds the
// reference topology through the UI (add router, wire both subnets, configure
// the gateways) and confirms the Check passes.
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const browserType = { firefox, webkit }[process.env.PLAYWRIGHT_BROWSER] || chromium;
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  // Find the design mission in the picker and navigate to it via its change handler.
  const val = await page.$$eval('#pick option', os => {
    const o = os.find(x => /Design a routed/.test(x.textContent));
    return o ? o.value : null;
  });
  if (val == null) throw new Error('design mission not present in the mission picker');
  await page.evaluate(v => {
    const s = document.querySelector('#pick');
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, val);
  await page.waitForTimeout(350);

  // The brief must render as a design brief (requirements), not an incident ticket.
  if (!(await page.$('.design-brief-card .req-list'))) throw new Error('design requirements brief did not render');
  if (await page.$('.ticket-card')) throw new Error('design mission should not show an incident ticket');

  // Build tools must be available inside a design mission.
  if (!(await page.$('#config .pal[data-add="router"]'))) throw new Error('build palette not available in the design mission');

  // An empty network must fail the Check.
  await page.click('#check');
  await page.waitForTimeout(150);
  if (!/bad/.test(await page.$eval('#status', e => e.className))) throw new Error('unbuilt network should not pass the Check');

  // Build the reference: add a router, wire each subnet to it.
  await page.click('#config .pal[data-add="router"]');
  await page.waitForTimeout(150);
  const rid = await page.$$eval('#topo .node', ns => {
    const r = ns.find(n => /^r\d/.test(n.dataset.dev));
    return r ? r.dataset.dev : null;
  });
  if (!rid) throw new Error('router was not added from the palette');
  await page.click('#topo .node[data-dev="h1"]'); await page.click('#wireBtn'); await page.click(`#topo .node[data-dev="${rid}"]`); await page.waitForTimeout(80);
  await page.click('#topo .node[data-dev="srv"]'); await page.click('#wireBtn'); await page.click(`#topo .node[data-dev="${rid}"]`); await page.waitForTimeout(80);
  if ((await page.$$eval('#topo .edge', e => e.length)) !== 2) throw new Error('both subnets were not wired to the router');

  // Configure the router gateways via the device terminal.
  await page.click(`#topo .node[data-dev="${rid}"]`); await page.waitForTimeout(80);
  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(60); };
  await run('ip addr add 10.0.1.1/24 dev eth0');
  await run('ip addr add 10.0.2.1/24 dev eth1');

  // The built, configured network must pass the Check.
  await page.click('#check');
  await page.waitForTimeout(250);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('configured design network did not pass the Check: ' + await page.$eval('#status', e => e.textContent.slice(0, 120)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Design-from-requirements mission UI tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
