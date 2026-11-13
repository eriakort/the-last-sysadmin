// Regression: the Workspace (brief) side panel must stay clamped to the viewport
// so its whole body — objective, hints, Check, and the resolved-ticket feedback
// at the very bottom — is reachable by scrolling. A grid row that sized to content
// (instead of minmax(0,1fr)) previously let the panel grow past the viewport, so
// the bottom of the feedback was cut off and unscrollable at shorter window heights.
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
  // A deliberately short window (at the app's min-height floor) is where the bug bit.
  const page = await browser.newPage({ viewport: { width: 1200, height: 620 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  // A mission with a long brief: diagnose, fix, resolve — the feedback lands at the bottom.
  await gotoMission(page, /Let the logs tell you/);
  const diag = await page.$('.diag-opt[data-di="0"]');
  if (diag) { await diag.click(); await page.waitForTimeout(250); }
  await page.evaluate(() => { const t = document.querySelector('#terminalRestore'); if (t) t.click(); });
  await page.waitForTimeout(120);
  await page.fill('#tin', 'ip link set eth1 up'); await page.press('#tin', 'Enter'); await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector('#check')?.click()); await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const panel = document.querySelector('#briefPanel');
    const body = document.querySelector('#briefPanel .side-panel-body');
    const status = document.querySelector('#status');
    if (!panel || !body || !status) return { err: 'panel/body/status missing' };
    const pr = panel.getBoundingClientRect();
    // The panel must not extend past the viewport (the bug: it ran ~75px below the fold).
    const panelWithinViewport = pr.bottom <= window.innerHeight + 1;
    // The body must be an internal scroll container with real overflow.
    const scrollable = body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto';
    // Scrolling to the bottom must fully reveal the resolved-ticket feedback.
    body.scrollTop = body.scrollHeight;
    const br = body.getBoundingClientRect(), sr = status.getBoundingClientRect();
    const statusFullyVisible = sr.bottom <= br.bottom + 1 && sr.top >= br.top - 1;
    return { panelWithinViewport, scrollable, statusFullyVisible, panelBottom: Math.round(pr.bottom), winH: window.innerHeight };
  });
  if (r.err) throw new Error(r.err);
  if (!/ok/.test(await page.$eval('#status', e => e.className))) throw new Error('precondition: mission should be resolved so the feedback is present');
  if (!r.panelWithinViewport) throw new Error(`brief panel overflows the viewport (bottom ${r.panelBottom} > ${r.winH}) — it is not clamped`);
  if (!r.scrollable) throw new Error('brief body is not an internal scroll container');
  if (!r.statusFullyVisible) throw new Error('resolved-ticket feedback is not fully reachable by scrolling the brief body');

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Brief panel scroll-clamp UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
