// Protocol visual labs use the canonical network model on isolated mission fixtures.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=protocols');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  if (!(await page.locator('#protocolsView').isVisible())) throw new Error('Protocol labs workspace did not open from its URL');
  if ((await page.locator('#navProtocols').getAttribute('aria-current')) !== 'page') throw new Error('Protocol labs navigation is not marked active');
  if (!(await page.locator('#protocolLabResult').innerText()).includes('10.0.2.10')) throw new Error('DNS lab did not resolve the authored A record');
  if (!(await page.locator('#protocolLabResult').innerText()).includes('UDP/53')) throw new Error('DNS lab did not show the observed UDP/53 path');
  console.log('✓ DNS lab resolves the record and displays packet-path evidence');

  await page.locator('[data-protocol-lab="dhcp"]').click();
  let output = await page.locator('#protocolLabResult').innerText();
  if (!output.includes('10.0.1.100/24') || !output.includes('10.0.1.1')) throw new Error('DHCP lab did not show the allocated lease and gateway');
  if (!output.includes('Discover') || !output.includes('Acknowledge')) throw new Error('DHCP DORA learning sequence is incomplete');
  console.log('✓ DHCP lab applies a lease and explains the DORA sequence');

  await page.locator('[data-protocol-lab="http"]').click();
  output = await page.locator('#protocolLabResult').innerText();
  if (!output.includes('TCP / destination port 80') || !output.includes('Request path')) throw new Error('TCP lab did not show HTTP service path evidence');
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('✓ TCP/HTTP lab shows the engine-observed request and reply path');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
