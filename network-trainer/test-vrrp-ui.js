// Breadth · VRRP UI: the first-hop redundancy mission plays end-to-end through
// the real terminal — diagnose, configure VRRP on both routers (switching the
// device session between r1 and r2), and the Check passes once r1 is Master,
// r2 is Backup, and the host reaches the server through the virtual gateway.
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

  await gotoMission(page, /One gateway, two routers/);
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('#check'))) throw new Error('objective/check did not appear after diagnosis');

  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(60); };
  const onDevice = async id => { await page.click(`#topo .node[data-dev="${id}"]`); await page.waitForTimeout(100); };

  await onDevice('r1');
  for (const c of ['enable', 'configure terminal', 'interface eth0', 'vrrp 1 ip 10.30.0.1', 'vrrp 1 priority 110', 'vrrp 1 preempt', 'vrrp 1 track eth1 decrement 20', 'end']) await run(c);
  await onDevice('r2');
  for (const c of ['enable', 'configure terminal', 'interface eth0', 'vrrp 1 ip 10.30.0.1', 'vrrp 1 priority 100', 'vrrp 1 preempt', 'end']) await run(c);

  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('VRRP mission did not resolve after config: ' + await page.$eval('#status', e => e.textContent.slice(0, 140)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('VRRP (first-hop redundancy) UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
