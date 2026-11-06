// Infrastructure inventory: current-scenario device records, filters, device
// detail sections and direct handoff to the active Workbench session.
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
  await page.locator('#navInfrastructure').click();

  if (await page.locator('#infrastructureView').isVisible()) ok('Infrastructure is a first-class workspace destination');
  else fail('Infrastructure view did not open');
  if (await page.locator('#infrastructureView .infra-summary article').count() === 4)
    ok('inventory summary reports device and health counts');
  else fail('inventory summary metrics are missing');

  const rows = page.locator('#infrastructureView [data-infra-device]');
  if (await rows.count() >= 2) ok('device inventory lists the active scenario');
  else fail('inventory does not contain the active scenario devices');

  const firstId = await rows.first().getAttribute('data-infra-device');
  await page.locator('#infraSearch').fill(firstId);
  if (await rows.evaluateAll(items => items.filter(x => !x.hidden).length) === 1)
    ok('inventory search filters by device identifier');
  else fail('inventory search did not isolate the matching device');
  await page.locator('#infraSearch').fill('');

  await page.locator('#infraKind').selectOption('switch');
  const switchRows = page.locator('#infrastructureView [data-infra-device]');
  if (await switchRows.count() > 0) ok('device-type filter isolates switches');
  else fail('switch filter returned no devices');
  const switchId = await switchRows.first().getAttribute('data-infra-device');
  await switchRows.first().click();
  if ((await page.locator('.infra-detail-heading').innerText()).includes(switchId))
    ok('selecting an inventory record opens its device detail');
  else fail('selected switch detail is missing');

  if (await page.locator('.infra-table').count() >= 2 && await page.locator('.infra-section').innerText().then(t => t.toLowerCase().includes('spanning-tree')))
    ok('switch detail includes interface and VLAN / spanning-tree inventory');
  else fail('switch detail is missing interface or VLAN data');

  await page.locator('#infraOpenWorkbench').click();
  if (await page.locator('#cols').isVisible() && await page.locator('#termTarget').innerText() === switchId)
    ok('inventory device opens in the Workbench with the matching console selected');
  else fail('inventory-to-Workbench handoff did not preserve device selection');

  await page.locator('#navInfrastructure').click();
  await page.locator('#infraKind').selectOption('host');
  const hostRows = page.locator('#infrastructureView [data-infra-device]');
  if (await hostRows.count() > 0) {
    await hostRows.first().click();
    const detailText = (await page.locator('.infra-detail-panel').innerText()).toLowerCase();
    if (detailText.includes('routing table') && detailText.includes('configured services'))
      ok('endpoint detail includes routes and configured service state');
    else fail('endpoint detail is missing route or service sections');
  } else fail('host inventory filter returned no endpoints');

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('infrastructure inventory reflows without horizontal page overflow on mobile');
  else fail('infrastructure inventory causes horizontal overflow on mobile');

  await browser.close();
  if (errors.length) { console.error('\\nINFRASTRUCTURE INVENTORY TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nINFRASTRUCTURE INVENTORY OK.');
})();
