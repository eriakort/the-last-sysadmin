// Breadth · Observability UI: the connection-log mission plays end-to-end through
// the real terminal — diagnose, generate an HTTPS and a Telnet flow from h1, read
// r1's connection log with `show flows` (HTTPS forwarded, Telnet denied), and the
// Check passes once both flows are present in r1's log.
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
const recordDiagnosticEvidence = async page => {
  await page.evaluate(() => { const restore = document.querySelector('#terminalRestore'); if (restore) restore.click(); });
  await page.waitForTimeout(120);
  const command = await page.evaluate(() => {
    const current = (document.querySelector('#termTarget')?.textContent || '').trim();
    const node = [...document.querySelectorAll('#topo .node')].find(item => item.dataset.dev === current);
    const classes = node?.getAttribute('class') || '';
    if (classes.includes('k-switch')) return 'show vlan brief';
    if (classes.includes('k-snort')) return 'show snort status';
    if (classes.includes('k-fw')) return 'show version';
    if (classes.includes('k-router')) return 'show ip interface brief';
    return 'ip addr';
  });
  await page.fill('#tin', command);
  await page.press('#tin', 'Enter');
  await page.waitForTimeout(120);
  if (!/Evidence captured/.test(await page.locator('#diagEvidence').innerText()))
    throw new Error('successful diagnostic command was not recorded as evidence: ' + command);
  const minimize = page.locator('#terminalMinimize');
  if (await minimize.count()) await minimize.click();
};

  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  await gotoMission(page, /Prove it with the connection log/);
  await recordDiagnosticEvidence(page);
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  if (!(await page.$('#check'))) throw new Error('objective/check did not appear after diagnosis');

  const restore = async () => { await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); }); await page.waitForTimeout(120); };
  const run = async c => { await page.fill('#tin', c); await page.press('#tin', 'Enter'); await page.waitForTimeout(80); };

  // The console starts on h1 — generate both connections to the DMZ web server.
  await restore();
  await run('ping web -p tcp --dport 443');
  await run('ping web -p tcp --dport 23');

  // Switch to r1 and read its connection log.
  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(80);
  await restore();
  await run('show flows');
  const out = await page.$eval('#tout', e => e.textContent);
  if (!/443\s+eth0 -> eth1\s+FORWARD/.test(out)) throw new Error('show flows missing the FORWARD HTTPS flow; got: ' + out.slice(-300));
  if (!/23\s+eth0 -> -\s+DENY/.test(out)) throw new Error('show flows missing the DENY Telnet flow; got: ' + out.slice(-300));

  await page.click('#check'); await page.waitForTimeout(200);
  if (!/\bok\b/.test(await page.$eval('#status', e => e.className))) {
    throw new Error('connection-log mission did not resolve: ' + await page.$eval('#status', e => e.textContent.slice(0, 160)));
  }

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Connection / flow logging UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
