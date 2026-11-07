// Workbench engineering tools: explorer, inspector, per-device sessions and topology navigation.
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

  const explorer = page.locator('#brief [data-explorer-dev]');
  const devices = await explorer.count();
  if (devices >= 2) ok('device explorer lists the active scenario devices');
  else fail('expected at least two devices in the explorer');

  const firstId = await explorer.first().getAttribute('data-explorer-dev');
  const secondId = await explorer.nth(1).getAttribute('data-explorer-dev');
  const search = page.locator('#deviceSearch');
  await search.fill(firstId);
  const visibleExplorerRows = await explorer.evaluateAll(rows => rows.filter(row => !row.hidden).length);
  if (visibleExplorerRows === 1 && await explorer.first().isVisible())
    ok('device explorer search filters by device identifier');
  else fail('device explorer search did not retain only the matching device');
  await search.fill('');

  await page.locator('#terminalRestore').click();
  await page.waitForSelector('#terminalWindow:not([hidden])');

  const sessionTabs = page.locator('#sessionTabs [data-session-device]');
  if (await sessionTabs.count() === devices) ok('console session tabs are provided for every device');
  else fail('console session tabs do not match the device inventory');

  await page.locator('#sessionTabs [data-session-device="' + firstId + '"]').click();
  await page.locator('#tin').fill('help');
  await page.locator('#tin').press('Enter');
  const firstOutput = await page.locator('#tout').innerText();
  if (firstOutput.includes(firstId)) ok('first device console records its own command output');
  else fail('first device output was not recorded');

  await page.locator('#sessionTabs [data-session-device="' + secondId + '"]').click();
  if (await page.locator('#termTarget').innerText() === secondId) ok('switching session changes the active console device');
  else fail('active console device did not change');
  await page.locator('#tin').fill('help');
  await page.locator('#tin').press('Enter');
  const secondOutput = await page.locator('#tout').innerText();
  if (secondOutput.includes(secondId)) ok('second device has an independent console output buffer');
  else fail('second device output was not recorded');

  await page.locator('#sessionTabs [data-session-device="' + firstId + '"]').click();
  if ((await page.locator('#tout').innerText()).includes(firstOutput.trim().split('\n').slice(-1)[0]))
    ok('returning to a device restores its previous console output');
  else fail('device console output was not preserved when switching sessions');
  await page.locator('#tin').focus();
  await page.locator('#tin').press('ArrowUp');
  if (await page.locator('#tin').inputValue() === 'help') ok('command history is maintained per device session');
  else fail('per-device command history was not restored');

  const routingTab = page.locator('#config .inspector-tab[data-inspector-tab="routing"]');
  if (await routingTab.count()) {
    await routingTab.click();
    if (await page.locator('#config .inspector-panel').innerText().then(t => t.toLowerCase().includes('static routes')))
      ok('device inspector routing tab renders route operations');
    else fail('routing inspector tab did not render its panel');
  } else fail('routing inspector tab is missing for a routed endpoint');

  const svg = page.locator('#topo');
  const before = await svg.getAttribute('viewBox');
  await page.locator('#topoZoomIn').click();
  const zoomed = await svg.getAttribute('viewBox');
  if (Number(zoomed.split(' ')[2]) < Number(before.split(' ')[2])) ok('topology zoom-in reduces the viewBox');
  else fail('topology zoom-in did not change scale');
  await page.locator('#topoZoomOut').click();
  await page.locator('#topoFit').click();
  if (await svg.getAttribute('viewBox') === before) ok('topology Fit restores the full topology');
  else fail('topology Fit did not restore the initial view');

  const box = await svg.boundingBox();
  const viewBeforePan = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  // Start well inside an empty canvas area (not on the SVG border or a device hit target).
  const panStart = { x: box.x + box.width * 0.82, y: box.y + box.height * 0.82 };
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down();
  await page.mouse.move(panStart.x + 55, panStart.y + 35, { steps: 5 });
  await page.mouse.up();
  const viewAfterPan = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  if (Math.abs(viewAfterPan[0] - viewBeforePan[0]) > 0.1 || Math.abs(viewAfterPan[1] - viewBeforePan[1]) > 0.1)
    ok('topology canvas pans independently of device dragging');
  else fail('topology canvas did not pan');

  await browser.close();
  if (errors.length) { console.error('\\nWORKBENCH ENGINEERING TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKBENCH ENGINEERING OK.');
})();
