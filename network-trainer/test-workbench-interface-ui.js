// Workbench interface inventory: operational state, peer details and safe CLI handoff.
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

  const tab = page.locator('#config [data-inspector-tab="interfaces"]');
  if (await tab.count()) {
    await tab.click();
    const rows = page.locator('#config .iface-table tbody tr');
    if (await rows.count()) ok('selected device exposes an interface inventory');
    else fail('interface inventory has no rows for the selected device');
    const action = page.locator('#config [data-iface-command]').first();
    if (await action.count()) {
      const iface = await action.getAttribute('data-iface-command');
      await action.click();
      if (await page.locator('#tin').inputValue() === 'show interfaces ' + iface) ok('interface inspection safely stages the matching CLI command');
      else fail('interface CLI handoff did not stage the expected command');
    } else fail('interface inventory has no CLI handoff action');
    if (await page.locator('#config .iface-state').count()) ok('interface operational state is displayed');
    else fail('interface state indicators are missing');
  } else fail('Interfaces inspector tab is missing');

  if (errors.length) { console.error('\\nWORKBENCH INTERFACE TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKBENCH INTERFACE TEST OK.');
  await browser.close();
})();
