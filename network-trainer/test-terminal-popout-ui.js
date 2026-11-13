// Browser regression coverage for the draggable floating device console and its opener.
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
  if (await page.locator('#terminalWindow').evaluate(el => el.classList.contains('terminal-floating') && getComputedStyle(el).position === 'fixed')) ok('device console is an independent fixed-position floating window');
  else fail('device console is not using the floating layout');

  // The console floats independently of the workbench and starts collapsed.
  if (await page.locator('#terminalWindow').isHidden()) ok('device console starts collapsed so the topology has full height');
  else fail('device console was not collapsed on load');

  // The opener is a menu item in the top-bar "Build ▾" dropdown, closed by default.
  if (await page.locator('#buildMenu').isHidden()) ok('Build dropdown is closed by default');
  else fail('Build dropdown was open on load');
  if (await page.locator('#terminalRestore').evaluate(el => !!el.closest('#top .build-menu'))) ok('Device terminal can still be restored from the fixed top-bar Build menu');
  else fail('Device terminal restore control is missing from the top-bar Build menu');

  // Open the menu and launch the console from it.
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#terminalRestore');
  await page.waitForFunction(() => document.activeElement?.id === 'tin');
  if (await page.locator('#terminalWindow').isVisible()) ok('Build ▾ → Device terminal opens the floating console and focuses the input');
  else fail('Build menu did not open the console');
  if (await page.locator('#buildMenu').isHidden()) ok('selecting a menu item closes the dropdown');
  else fail('dropdown stayed open after selecting an item');

  // The floating window has an accessible drag handle, expand control and minimize control.
  if (await page.locator('#terminalWindow #terminalDragHandle').isVisible()) ok('floating console exposes a draggable titlebar');
  else fail('floating console missing drag handle');
  if (await page.locator('#terminalWindow #terminalMinimize').isVisible() && await page.locator('#terminalWindow #terminalExpand').isVisible()) ok('titlebar exposes minimize and expand controls');
  else fail('titlebar missing minimize or expand control');

  // Drag the window and confirm it stays inside the viewport.
  const beforeDrag = await page.locator('#terminalWindow').boundingBox();
  await page.locator('#terminalDragHandle').hover();
  await page.mouse.down(); await page.mouse.move(beforeDrag.x + 90, beforeDrag.y + 70); await page.mouse.up();
  const afterDrag = await page.locator('#terminalWindow').boundingBox();
  if (afterDrag && (Math.abs(afterDrag.x - beforeDrag.x) > 20 || Math.abs(afterDrag.y - beforeDrag.y) > 20)) ok('dragging the titlebar repositions the floating console');
  else fail('dragging the titlebar did not reposition the console');
  if (afterDrag && afterDrag.x >= 0 && afterDrag.y >= 0 && afterDrag.x + afterDrag.width <= 1440 && afterDrag.y + afterDrag.height <= 1000) ok('dragged console remains within viewport bounds');
  else fail('dragged console escaped viewport bounds');

  // Expand and restore the floating window without changing its saved position.
  await page.click('#terminalExpand');
  if (await page.locator('#terminalWindow').evaluate(el => el.classList.contains('terminal-expanded'))) ok('expand control maximizes the console');
  else fail('expand control did not maximize the console');
  await page.click('#terminalExpand');
  if (!(await page.locator('#terminalWindow').evaluate(el => el.classList.contains('terminal-expanded')))) ok('expand control restores the previous floating size and position');
  else fail('expand control did not restore the floating window');

  // Collapse from the floating titlebar.
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  ok('console minimizes from its titlebar button');

  // The user's placement survives a page reload and a minimized state.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#terminalWindow #term', { state: 'attached' });
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#terminalRestore');
  await page.waitForFunction(() => !document.querySelector('#terminalWindow')?.hidden);
  const restoredPosition = await page.locator('#terminalWindow').boundingBox();
  if (restoredPosition && Math.abs(restoredPosition.x - afterDrag.x) < 5 && Math.abs(restoredPosition.y - afterDrag.y) < 5) ok('floating position persists across reload and minimize');
  else fail('floating position was not preserved across reload');

  // Double-click a device opens its console directly (no menu needed).
  await page.waitForSelector('#topo .node');
  const first = page.locator('#topo .node').first();
  const device = await first.getAttribute('data-dev');
  await first.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, device);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-clicking a topology device opens its floating terminal');
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
  if (await page.locator('#terminalWindow').isVisible()) ok('Device terminal from another workspace returns to the workbench and opens the floating console');
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
  if (await page.locator('#terminalWindow').isVisible()) ok('Build ▾ → Open build workspace enters Build mode and double-click opens the floating console');
  else fail('Build workspace or its console did not open from the menu');

  // Mobile: the Build button stays within the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => matchMedia('(max-width: 760px)').matches);
  // Earlier clicks can auto-scroll the desktop page while opening the builder.
  // Reset the document scroll before measuring whether the header control fits
  // inside the mobile viewport; otherwise the test measures scroll position,
  // not responsive header layout.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mobileBtn = await page.locator('#btnBuild').boundingBox();
  if (mobileBtn && mobileBtn.x >= 0 && mobileBtn.x + mobileBtn.width <= 390 && mobileBtn.y >= 0) ok('mobile Build ▾ button stays inside the viewport');
  else fail('mobile Build ▾ button is outside the viewport');

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
