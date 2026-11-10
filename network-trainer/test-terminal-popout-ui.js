// Browser regression coverage for the persistent floating device terminal.
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
  await page.waitForSelector('#topo .node');
  const first = page.locator('#topo .node').first();
  const device = await first.getAttribute('data-dev');
  await first.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, device);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-clicking a topology device opens its floating terminal');
  else fail('double-click did not open the floating terminal');

  await page.click('#navIncidents');
  if (await page.locator('#terminalWindow').isHidden()) ok('terminal auto-minimizes when leaving the topology workspace so other tools stay visible');
  else fail('terminal remained open and could cover other workspace tools');
  const dock = page.locator('#terminalRestore');
  if (await dock.isVisible() && await dock.evaluate(el => el.parentElement?.id === 'navRail')) ok('terminal launcher is docked in the persistent navigation rail outside the workbench');
  else fail('terminal launcher is not docked in the navigation rail');
  const dockBox = await dock.boundingBox(), topBox = await page.locator('#top').boundingBox();
  const separated = dockBox && topBox && (dockBox.x + dockBox.width <= topBox.x || dockBox.x >= topBox.x + topBox.width || dockBox.y + dockBox.height <= topBox.y || dockBox.y >= topBox.y + topBox.height);
  if (separated) ok('terminal launcher occupies reserved navigation space without covering the top toolbar');
  else fail('terminal launcher overlaps the top toolbar');

  await page.click('#terminalRestore');
  await page.waitForFunction(() => document.activeElement?.id === 'tin');
  if (await page.locator('#terminalWindow').isVisible()) ok('terminal can be restored and returns focus to the command input');
  else fail('terminal did not restore');
  const dockedBox = await page.locator('#terminalWindow').boundingBox();
  if (dockedBox && dockedBox.y > topBox.y + topBox.height && dockedBox.x + dockedBox.width <= 1440) ok('terminal opens in the lower workspace area instead of covering the header controls');
  else fail('terminal is not safely positioned outside the top toolbar');

  await page.click('#btnBuild');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');
  // Minimize the console to expose the canvas, then double-clicking a device
  // should reopen it in the topology workspace.
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  const buildDevice = page.locator('#topo .node').first();
  const buildId = await buildDevice.getAttribute('data-dev');
  await buildDevice.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, buildId);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-click opens the selected device console in Build mode');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#navIncidents');
  if (await page.locator('#terminalWindow').isHidden() && await page.locator('#terminalRestore').isVisible()) ok('mobile navigation keeps the terminal minimized and launcher accessible');
  else fail('mobile workspace navigation is obstructed by the terminal');
  const mobileDock = await page.locator('#terminalRestore').boundingBox();
  if (mobileDock && mobileDock.x >= 0 && mobileDock.x + mobileDock.width <= 390 && mobileDock.y >= 0 && mobileDock.y + mobileDock.height <= 844) ok('mobile terminal launcher remains inside the navigation rail viewport');
  else fail('mobile terminal launcher is outside the viewport');

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
