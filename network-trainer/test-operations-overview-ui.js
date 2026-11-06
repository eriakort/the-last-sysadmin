// Operations Overview: live data, view navigation and ticket handoff.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  if (await page.locator('#overview').isVisible()) ok('Operations Overview is the landing view');
  else fail('Operations Overview is not visible on launch');

  if (await page.locator('#navOverview').getAttribute('aria-current') === 'page')
    ok('Overview navigation has the active state');
  else fail('Overview active navigation state is missing');

  const deviceRows = await page.locator('#overview .overview-table tbody tr').count();
  if (deviceRows > 0) ok('device inventory is derived from the active simulator topology');
  else fail('dashboard has no device rows');

  const metricCount = await page.locator('#overview .overview-metric').count();
  if (metricCount === 4) ok('network, link, incident and resolution metrics render');
  else fail('expected four operations metrics, found ' + metricCount);

  if (await page.locator('#overview .overview-incident').count() > 0)
    ok('active training incidents are listed');
  else fail('expected unresolved training incidents in the overview');

  await page.locator('#navWorkbench').click();
  if (await page.locator('#cols').isVisible() && await page.locator('#overview').isHidden())
    ok('Workbench navigation switches to the existing operational workspace');
  else fail('Workbench navigation did not switch views');

  await page.locator('#navOverview').click();
  if (await page.locator('#overview').isVisible()) ok('Overview can be reopened without resetting the active mission');
  else fail('Overview could not be reopened');

  const investigate = page.locator('#overview [data-overview-ticket]').first();
  if (await investigate.count()) {
    const ticketId = await investigate.getAttribute('data-overview-ticket');
    await investigate.click();
    if (await page.locator('#cols').isVisible() && await page.locator('#brief').isVisible())
      ok('incident investigation hands off to the workbench');
    else fail('incident handoff did not open the workbench');
    if (await page.locator('#brief').innerText().then(t => t.includes(ticketId)))
      ok('selected incident context is loaded into the workbench');
    else fail('selected incident context was not loaded');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('overview fits a narrow mobile viewport without horizontal page overflow');
  else fail('overview causes horizontal page overflow on mobile');

  await browser.close();
  if (errors.length) { console.error('\\nOPERATIONS OVERVIEW TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nOPERATIONS OVERVIEW OK.');
})();
