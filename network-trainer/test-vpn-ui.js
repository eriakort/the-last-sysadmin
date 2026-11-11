// Breadth · VPN UI: the site-to-site VPN mission plays end-to-end through the
// real terminal — diagnose, configure the GRE tunnel + PSK + route on r1, and
// the Check passes once the tunnel establishes and the LANs reach each other.
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

  await gotoMission(page, /Bring up the branch VPN/);
  // Clear the diagnosis gate (correct option index 0 for this mission).
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('#check'))) throw new Error('objective/check did not appear after diagnosis');

  // Configure r1's half of the tunnel through the device terminal.
  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(80);
  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(80); };
  await run('ip tunnel add tun0 mode gre local 203.0.113.1 remote 198.51.100.1');
  await run('ip tunnel key tun0 Branch-VPN-7f3a');
  await run('ip route add 10.0.2.0/24 dev tun0');

  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('VPN mission did not resolve after tunnel config: ' + await page.$eval('#status', e => e.textContent.slice(0, 140)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('VPN (site-to-site tunnel) UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
