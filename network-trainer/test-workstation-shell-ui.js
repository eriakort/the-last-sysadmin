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

  if (await page.locator('#navOverview').getAttribute('aria-current') === 'page')
    ok('Overview is identified as the active destination');
  else fail('Overview active state is missing');

  if (await page.locator('#navIncidents').isEnabled() && await page.locator('#navJournal').isEnabled())
    ok('implemented Incidents and Journal destinations are enabled');
  else fail('implemented navigation actions are disabled');

  await page.locator('#navIncidents').click();
  if (await page.locator('#incidentsView').isVisible() && await page.locator('#incidentList .incident-row').count() > 0)
    ok('Incidents navigation opens the dedicated incident workspace');
  else fail('Incidents navigation did not open the incident workspace');
  await page.locator('#navOverview').click();

  await page.locator('#navJournal').click();
  if (await page.locator('#journalView').isVisible() && await page.locator('#journalView .journal-page-list').count() > 0) ok('Journal navigation opens the first-class Engineering Journal workspace');
  else fail('Journal navigation did not open the Engineering Journal workspace');

  await page.locator('#navWorkbench').click();
  if (await page.locator('#cols').isVisible() && await page.locator('#overview').isHidden())
    ok('Workbench navigation opens the operational workspace');
  else fail('Workbench navigation did not switch views');
  await page.locator('#navOverview').click();
  if (await page.locator('#overview').isVisible()) ok('Overview navigation returns to the landing view');
  else fail('Overview navigation did not return to the landing view');

  await page.setViewportSize({ width: 390, height: 844 });
  const appTabs = page.locator('nav.apptabs');
  const environmentTabs = appTabs.locator('a.apptab');
  const environmentLabels = (await environmentTabs.allTextContents()).map(text => text.trim());
  if (await appTabs.isVisible() && await environmentTabs.count() === 2 &&
      await environmentTabs.nth(0).isVisible() && await environmentTabs.nth(1).isVisible() &&
      environmentLabels.some(label => label.includes('Linux Sysadmin')) &&
      environmentLabels.some(label => label.includes('Network Sysadmin')))
    ok('application switcher remains visible and both environments are reachable on mobile');
  else fail('application switcher is hidden or an environment link is unavailable on mobile: ' + environmentLabels.join(' | '));
  const railBox = await rail.boundingBox();
  const mainBox = await page.locator('#mainArea').boundingBox();
  if (railBox && mainBox && Math.abs(railBox.width - 390) < 3 && mainBox.width >= 380)
    ok('navigation and workbench reflow for a mobile viewport');
  else fail('mobile shell layout is incorrect: rail=' + JSON.stringify(railBox) + ', main=' + JSON.stringify(mainBox));

  await browser.close();
  if (errors.length) { console.error('\\nWORKSTATION SHELL TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKSTATION SHELL OK.');
})();
