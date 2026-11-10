// Browser regression coverage for the docked, collapsible device terminal.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => errors.push(message);

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#terminalWindow #term', { state: 'attached' });

  // The console is docked inside the workbench and starts collapsed, so it
  // never overlaps the topology or the header.
  if (await page.locator('#terminalWindow').isHidden()) ok('device console starts collapsed so the topology has full height');
  else fail('device console was not collapsed on load');

  // The toggle lives in the topology deskbar — contextual to this workspace.
  const toggle = page.locator('#terminalRestore');
  if (await toggle.isVisible() && await toggle.evaluate(el => !!el.closest('#cols .desk-tools'))) ok('terminal toggle sits in the topology deskbar, not floating over the page');
  else fail('terminal toggle is not mounted in the topology deskbar');

  await page.waitForSelector('#topo .node');
  const first = page.locator('#topo .node').first();
  const device = await first.getAttribute('data-dev');
  await first.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, device);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-clicking a topology device opens its docked terminal');
  else fail('double-click did not open the docked terminal');

  // The dock sits below the top toolbar — it can never cover the header.
  const dockBox = await page.locator('#terminalWindow').boundingBox();
  const topBox = await page.locator('#top').boundingBox();
  if (dockBox && topBox && dockBox.y >= topBox.y + topBox.height && dockBox.x + dockBox.width <= 1440) ok('docked console stays below the top toolbar instead of covering header controls');
  else fail('docked console overlaps the top toolbar');

  // Collapse it from the dock titlebar, then reopen from the toggle with focus.
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  if (await toggle.isVisible()) ok('collapsing the console keeps the deskbar toggle available');
  else fail('toggle disappeared after collapsing the console');

  await page.click('#terminalRestore');
  await page.waitForFunction(() => document.activeElement?.id === 'tin');
  if (await page.locator('#terminalWindow').isVisible()) ok('toggle reopens the console and returns focus to the command input');
  else fail('toggle did not reopen the console');

  // Leaving the workspace hides the whole workbench, so both the console and
  // its toggle go with it — nothing is left floating on other views.
  await page.click('#navIncidents');
  if (await page.locator('#terminalWindow').isHidden() && await page.locator('#terminalRestore').isHidden()) ok('console and toggle are scoped to the workbench and hidden on other workspaces');
  else fail('console or toggle leaked onto another workspace');

  // Build mode: double-click a device to open its console in the dock.
  await page.click('#btnBuild');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  const buildDevice = page.locator('#topo .node').first();
  const buildId = await buildDevice.getAttribute('data-dev');
  await buildDevice.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, buildId);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-click opens the selected device console in Build mode');
  else fail('double-click did not open the console in Build mode');

  // Mobile: the deskbar toggle stays within the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileToggle = await page.locator('#terminalRestore').boundingBox();
  if (mobileToggle && mobileToggle.x >= 0 && mobileToggle.x + mobileToggle.width <= 390 && mobileToggle.y >= 0) ok('mobile terminal toggle stays inside the viewport within the deskbar');
  else fail('mobile terminal toggle is outside the viewport');

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
