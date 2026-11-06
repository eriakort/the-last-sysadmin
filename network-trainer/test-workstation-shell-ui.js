// Network workstation shell regression: persistent navigation, legacy workflow
// entry points, and the narrow-screen navigation layout must remain usable.
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
  await page.waitForTimeout(200);

  const rail = page.locator('#navRail');
  if (await rail.isVisible()) ok('persistent workspace navigation renders');
  else fail('workspace navigation is missing');

  const navLabels = await rail.locator('.nav-item').allTextContents();
  for (const label of ['Overview', 'Incidents', 'Workbench', 'Infrastructure', 'Knowledge', 'Journal']) {
    if (navLabels.some(text => text.includes(label))) ok(label + ' destination is represented');
    else fail(label + ' destination is missing');
  }

  if (await page.locator('#navWorkbench').getAttribute('aria-current') === 'page')
    ok('Workbench is identified as the active destination');
  else fail('Workbench active state is missing');

  if (await page.locator('#navIncidents').isEnabled() && await page.locator('#navJournal').isEnabled())
    ok('implemented Incidents and Journal destinations are enabled');
  else fail('implemented navigation actions are disabled');

  await page.locator('#navIncidents').click();
  if (await page.locator('#modal .ticket-desk').isVisible()) ok('Incidents navigation opens the existing ticket queue');
  else fail('Incidents navigation did not open the ticket queue');
  await page.locator('#modal #closeS').click();

  await page.locator('#navJournal').click();
  if (await page.locator('#modal .journal-list').isVisible()) ok('Journal navigation opens the existing work journal');
  else fail('Journal navigation did not open the work journal');
  await page.locator('#modal #closeS').click();

  await page.locator('#navWorkbench').click();
  if (await page.locator('#tin').evaluate(el => document.activeElement === el))
    ok('Workbench navigation returns focus to the device console');
  else fail('Workbench navigation did not return focus to the console');

  await page.setViewportSize({ width: 390, height: 844 });
  const railBox = await rail.boundingBox();
  const mainBox = await page.locator('#mainArea').boundingBox();
  if (railBox && mainBox && Math.abs(railBox.width - 390) < 3 && mainBox.width >= 380)
    ok('navigation and workbench reflow for a mobile viewport');
  else fail('mobile shell layout is incorrect: rail=' + JSON.stringify(railBox) + ', main=' + JSON.stringify(mainBox));

  await browser.close();
  if (errors.length) { console.error('\\nWORKSTATION SHELL TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKSTATION SHELL OK.');
})();
