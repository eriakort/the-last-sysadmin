// Breadth · Observability UI: the mission plays end-to-end through the real
// terminal — diagnose, read `show logging` (which surfaces the down-interface
// system event) and `show counters`, bring the interface up, and the Check
// passes once the fault log clears and h1 reaches srv.
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

  await gotoMission(page, /Let the logs tell you/);
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('#check'))) throw new Error('objective/check did not appear after diagnosis');

  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(80);
  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(70); };

  // Read the evidence: the system log must name the down interface.
  await run('show logging');
  const out = await page.$eval('#tout', e => e.textContent);
  if (!/changed state to down/.test(out)) throw new Error('show logging did not surface the system event; got: ' + out.slice(-200));

  // Fix it.
  await run('ip link set eth1 up');

  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('observability mission did not resolve after the fix: ' + await page.$eval('#status', e => e.textContent.slice(0, 160)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Observability (logs & metrics) UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
