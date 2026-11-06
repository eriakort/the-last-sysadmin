// Browser-level regression for switch VLAN configuration and verification.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const run = async line => {
    await page.fill('#tin', line);
    await page.press('#tin', 'Enter');
    await page.waitForTimeout(90);
  };
  const node = id => '#topo .node[data-dev="' + id + '"]';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  const missionOption = await page.locator('#pick option').filter({ hasText: 'Put Finance back in its VLAN' }).getAttribute('value');
  if (missionOption == null) throw new Error('access VLAN mission was not listed');
  await page.selectOption('#pick', missionOption);
  await page.waitForTimeout(180);
  await page.click(node('h1'));
  await run('ping srv');
  if (!(await page.locator('#tout').innerText()).includes('no host with that address')) {
    throw new Error('VLAN mismatch should make the initial ping fail');
  }
  await page.click(node('sw1'));
  await run('show vlan brief');
  await run('vlan 10');
  await run('vlan 20');
  await run('interface p1');
  await run('switchport mode access');
  await run('switchport access vlan 20');
  await run('exit');
  await run('interface p2');
  await run('switchport mode access');
  await run('switchport access vlan 20');
  await run('exit');
  const panel = await page.locator('#config').innerText();
  if (!panel.includes('VLAN 20')) throw new Error('switch panel did not reflect configured access VLANs');
  await page.click(node('h1'));
  await run('ping srv');
  const output = await page.locator('#tout').innerText();
  if (!output.includes('reply received')) throw new Error('configured VLAN should restore reachability');
  if (errors.length) throw new Error('browser errors: ' + errors.join(' | '));
  console.log('✓ VLAN troubleshooting flow works in the browser');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
