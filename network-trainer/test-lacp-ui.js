// Breadth · LACP UI: the EtherChannel mission plays end-to-end through the real
// terminal — diagnose, bundle p3/p4 into channel-group 1 on both switches, and
// the Check passes once the bundle is formed on both ends and h1 reaches srv.
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const browserType = { firefox, webkit }[process.env.PLAYWRIGHT_BROWSER] || chromium;
const URL = 'file://' + path.join(process.cwd(), 'index.html');

async function gotoMission(page, re) {
  const val = await page.$$eval('#pick option', (os, src) => {
    const o = os.find(x => new RegExp(src).test(x.textContent));
    return o ? o.value : null;
  }, re.source);
  if (val == null) throw new Error('mission not found in picker: ' + re);
  await page.evaluate(v => { const s = document.querySelector('#pick'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, val);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  await gotoMission(page, /Bundle the distribution uplinks/);
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('#check'))) throw new Error('objective/check did not appear after diagnosis');

  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(60); };
  const onDevice = async id => { await page.click(`#topo .node[data-dev="${id}"]`); await page.waitForTimeout(100); };

  for (const sw of ['sw1', 'sw2']) {
    await onDevice(sw);
    for (const c of ['interface p3', 'channel-group 1 mode active', 'interface p4', 'channel-group 1 mode active']) await run(c);
  }

  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('LACP mission did not resolve after bundling: ' + await page.$eval('#status', e => e.textContent.slice(0, 140)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('LACP (EtherChannel) UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
