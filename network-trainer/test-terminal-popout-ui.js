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
  if (await page.locator('#terminalWindow').isVisible()) ok('terminal remains visible when navigating away from the workbench');
  else fail('terminal disappeared after workspace navigation');

  await page.click('#terminalMinimize');
  if (!(await page.locator('#terminalWindow').isVisible()) && await page.locator('#terminalRestore').isVisible()) ok('terminal can be minimized without destroying its session');
  else fail('minimize/restore controls did not preserve the terminal window');

  await page.click('#terminalRestore');
  await page.waitForFunction(() => document.activeElement?.id === 'tin');
  if (await page.locator('#terminalWindow').isVisible()) ok('terminal can be restored and returns focus to the command input');
  else fail('terminal did not restore');

  await page.click('#btnBuild');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');
  // The floating console intentionally stays above workspaces. Minimize it to
  // expose the canvas, then double-clicking a device should reopen it.
  await page.click('#terminalMinimize');
  await page.waitForFunction(() => document.querySelector('#terminalWindow')?.hidden === true);
  const buildDevice = page.locator('#topo .node').first();
  const buildId = await buildDevice.getAttribute('data-dev');
  await buildDevice.dblclick();
  await page.waitForFunction(id => document.querySelector('#termTarget')?.textContent === id, buildId);
  if (await page.locator('#terminalWindow').isVisible()) ok('double-click opens the selected device console in Build mode');

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
