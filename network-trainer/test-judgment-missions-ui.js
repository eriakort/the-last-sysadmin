// Phase 3 UI: the decision/tradeoff and incident-command mission types play
// end-to-end, and the multi-fault fault checklist now renders in the brief.
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const browserType = { firefox, webkit }[process.env.PLAYWRIGHT_BROWSER] || chromium;
const URL = 'file://' + path.join(process.cwd(), 'index.html');

async function gotoMission(page, re) {
  const val = await page.$$eval('#pick option', (os, src) => {
    const rx = new RegExp(src);
    const o = os.find(x => rx.test(x.textContent));
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

  // ---- Decision / tradeoff ----
  await gotoMission(page, /saturated branch uplink/);
  if (!(await page.$('.decide-list'))) throw new Error('decision options did not render');
  await page.click('#check'); await page.waitForTimeout(150);
  if (!/bad/.test(await page.$eval('#status', e => e.className))) throw new Error('decision passed before any choice');
  // Choose a below-bar option -> still fails.
  await page.evaluate(() => { const r = document.querySelector('[data-decide="wait"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  await page.click('#check'); await page.waitForTimeout(150);
  if (!/bad/.test(await page.$eval('#status', e => e.className))) throw new Error('decision accepted a below-bar option');
  // Choose a passing option -> resolves.
  await page.evaluate(() => { const r = document.querySelector('[data-decide="qos"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  if (!(await page.$('.decide-rationale'))) throw new Error('rationale did not show after a choice');
  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) throw new Error('decision did not resolve with a passing option');

  // ---- Incident command ----
  await gotoMission(page, /Cascading core outage/);
  if (!(await page.$('.incident-stages'))) throw new Error('incident stages did not render');
  if (!(await page.$('.incident-comms [data-comms]'))) throw new Error('incident comms options did not render');
  // Fix the route on r1 via the device terminal.
  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(80);
  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  await page.fill('#tin', 'ip route add 10.0.3.0/24 via 10.0.12.2'); await page.press('#tin', 'Enter'); await page.waitForTimeout(120);
  // Wrong comms alone must not pass.
  await page.evaluate(() => { const r = document.querySelector('[data-comms="silent"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(150);
  if (!/bad/.test(await page.$eval('#status', e => e.className))) throw new Error('incident passed with the wrong status update');
  // Correct comms -> resolves.
  await page.evaluate(() => { const r = document.querySelector('[data-comms="p1all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) throw new Error('incident did not resolve after fix + correct comms: ' + await page.$eval('#status', e => e.textContent.slice(0, 120)));

  // ---- Multi-fault checklist now renders (previously dead renderFaults) ----
  // This mission is gated behind a diagnosis step; clear it, then the fault
  // checklist must appear (it was computed but never inserted before this fix).
  await gotoMission(page, /Multi-fault — Three things wrong/);
  const diag = await page.$('.diag-opt[data-di="0"]');   // correct diagnosis index for this mission
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('[data-fault]'))) throw new Error('multi-fault mission did not render its fault checklist after diagnosis');

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Judgment (decision + incident) and multi-fault UI tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
