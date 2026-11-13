// Browser regression coverage for the docked device console and the top-bar
// "Build ▾" dropdown that opens it. The dropdown is anchored in the fixed header,
// so its controls stay in a stable place and can never float over the page.
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
  if (await page.locator('#terminalWindow').evaluate(el => el.classList.contains('terminal-dock'))) ok('device console uses the in-workbench dock layout');
  else fail('device console is not using the dock layout');

  // The console is docked inside the workbench and starts collapsed.
  if (await page.locator('#terminalWindow').isHidden()) ok('device console starts collapsed so the topology has full height');
  else fail('device console was not collapsed on load');

  // The opener is a menu item in the top-bar "Build ▾" dropdown, closed by default.
  if (await page.locator('#buildMenu').isHidden()) ok('Build dropdown is closed by default');
  else fail('Build dropdown was open on load');
  if (await page.locator('#terminalRestore').evaluate(el => !!el.closest('#top .build-menu'))) ok('Device terminal control lives in the fixed top-bar Build menu, not floating over the page');
  else fail('Device terminal control is not anchored in the top-bar Build menu');

  // Open the menu and launch the console from it.
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#terminalRestore');
  await page.waitForFunction(() => document.activeElement?.id === 'tin');
  if (await page.locator('#terminalWindow').isVisible()) ok('Build ▾ → Device terminal opens the docked console and focuses the input');
  else fail('Build menu did not open the console');
  if (await page.locator('#buildMenu').isHidden()) ok('selecting a menu item closes the dropdown');
  else fail('dropdown stayed open after selecting an item');

  // The dock has a dedicated titlebar and an accessible collapse control.
  if (await page.locator('#terminalWindow .terminal-dock-titlebar').isVisible()) ok('docked console has a visible titlebar');
  else fail('docked console missing titlebar');
  if (await page.locator('#terminalWindow .terminal-dock-titlebar #terminalMinimize').isVisible()) ok('docked console titlebar exposes its collapse control');
  else fail('docked console titlebar missing collapse control');

  // Collapse from the dock titlebar.
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  ok('console collapses from its titlebar button');

  // Double-click a device opens its console directly (no menu needed).
  await page.waitForSelector('#topo .node');
  const first = page.locator('#topo .node').first();
  const device = await first.getAttribute('data-dev');
  await first.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, device);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-clicking a topology device opens its docked terminal');
  else fail('double-click did not open the docked terminal');

  // Leaving the workspace hides the workbench, so the console collapses with it.
  await page.click('#navIncidents');
  if (await page.locator('#terminalWindow').isHidden()) ok('console is scoped to the workbench and hidden on other workspaces');
  else fail('console leaked onto another workspace');
  // The Build menu stays reachable from the header on any workspace.
  if (await page.locator('#btnBuild').isVisible()) ok('Build ▾ stays available in the header from any workspace');
  else fail('Build ▾ disappeared off the workbench');

  // From another workspace, Build ▾ → Device terminal returns to the workbench and opens it.
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#terminalRestore');
  await page.waitForSelector('#cols:not([hidden])');
  if (await page.locator('#terminalWindow').isVisible()) ok('Device terminal from another workspace returns to the workbench and opens the console');
  else fail('Device terminal did not restore the workbench console');

  // Build mode via the dropdown.
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#buildMenuOpen');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');
  await page.click('#terminalMinimize').catch(() => {});
  const buildDevice = page.locator('#topo .node').first();
  const buildId = await buildDevice.getAttribute('data-dev');
  await buildDevice.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, buildId);
  if (await page.locator('#terminalWindow').isVisible()) ok('Build ▾ → Open build workspace enters Build mode and double-click opens the console');
  else fail('Build workspace or its console did not open from the menu');

  // Mobile: the Build button stays within the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBtn = await page.locator('#btnBuild').boundingBox();
  if (mobileBtn && mobileBtn.x >= 0 && mobileBtn.x + mobileBtn.width <= 390 && mobileBtn.y >= 0) ok('mobile Build ▾ button stays inside the viewport');
  else fail('mobile Build ▾ button is outside the viewport');

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
