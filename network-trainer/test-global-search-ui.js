// Global workstation search: keyboard shortcut, device handoff, command launch and dismissal.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html') + '?view=workbench';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  await page.keyboard.press('Control+k');
  if (await page.locator('#workstationPalette').isVisible()) ok('Ctrl+K opens the global workstation search');
  else fail('Ctrl+K did not open the search palette');

  const deviceId = await page.locator('#brief [data-explorer-dev]').first().getAttribute('data-explorer-dev');
  await page.locator('#paletteSearch').fill(deviceId);
  const deviceResult = page.locator('.palette-result').filter({ hasText: deviceId }).first();
  if (await deviceResult.count()) ok('search indexes devices in the active simulator scenario');
  else fail('active simulator device was not indexed');
  await deviceResult.click();
  if (await page.locator('#workstationPalette').count() === 0 && await page.locator('#termTarget').innerText() === deviceId) ok('device result opens Workbench with the exact console target selected');
  else fail('device result did not hand off to the matching Workbench session');

  await page.keyboard.press('Control+k');
  await page.locator('#paletteSearch').fill('show');
  const commandResult = page.locator('.palette-result').filter({ hasText: 'Command' }).first();
  if (await commandResult.count()) {
    const commandText = await commandResult.locator('.palette-result-copy b').innerText();
    await commandResult.click();
    if (await page.locator('#tin').inputValue() === commandText) ok('command result is placed into the device console without auto-execution');
    else fail('command result was not placed in the console');
  } else fail('command reference entries were not indexed');

  await page.keyboard.press('Control+k');
  await page.locator('#paletteSearch').fill('no-such-workstation-record-98765');
  if (await page.locator('.palette-empty').count()) ok('empty searches provide a clear no-results state');
  else fail('empty search state is missing');
  await page.keyboard.press('Escape');
  if (await page.locator('#workstationPalette').count() === 0) ok('Escape dismisses the palette');
  else fail('Escape did not dismiss the palette');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#btnSearch').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('search palette fits mobile viewport width');
  else fail('search palette causes horizontal overflow');
  await browser.close();
  if (errors.length) { console.error('\\nGLOBAL SEARCH TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nGLOBAL SEARCH OK.');
})();
