// Responsive, accessible collapse controls for the workspace and inspector panels.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html') + '?view=workbench';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.removeItem('network-workbench-panels-v1'));
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };
  const ok = message => console.log('  ✓ ' + message);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  for (const [panel, title] of [['briefPanel', 'workspace'], ['configPanel', 'inspector']]) {
    const root = page.locator('#' + panel);
    const toggle = root.locator('.side-panel-toggle');
    if (!(await toggle.count())) { fail(title + ' panel toggle is missing'); continue; }
    if (await toggle.getAttribute('aria-expanded') !== 'true') fail(title + ' panel should start expanded on desktop');
    await toggle.click();
    if (await toggle.getAttribute('aria-expanded') !== 'false' || await root.locator('.side-panel-body').isVisible()) fail(title + ' panel did not collapse');
    await toggle.click();
    if (await toggle.getAttribute('aria-expanded') !== 'true' || !(await root.locator('.side-panel-body').isVisible())) fail(title + ' panel did not expand');
  }
  if (errors.length) { await browser.close(); console.error('WORKSPACE PANEL TEST FAILED'); process.exit(1); }
  ok('both panels collapse and expand with synchronized accessible state');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(100);
  if (await page.locator('#briefPanel .side-panel-toggle').getAttribute('aria-expanded') !== 'true') fail('expanded state was not persisted');
  await page.setViewportSize({ width: 700, height: 900 });
  await page.evaluate(() => localStorage.removeItem('network-workbench-panels-v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(100);
  for (const panel of ['briefPanel', 'configPanel']) {
    if (await page.locator('#' + panel + ' .side-panel-toggle').getAttribute('aria-expanded') !== 'false') fail(panel + ' should default collapsed on a narrow screen');
  }
  await page.locator('#briefPanel .side-panel-toggle').click();
  if (!(await page.locator('#briefPanel .side-panel-body').isVisible())) fail('workspace panel cannot expand on a narrow screen');
  if (errors.length) { await browser.close(); console.error('WORKSPACE PANEL TEST FAILED'); process.exit(1); }
  ok('panel preferences persist and narrow layouts start compact but remain expandable');
  await browser.close();
  console.log('WORKSPACE PANEL TEST OK.');
})();
