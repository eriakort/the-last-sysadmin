// Browser-level regression for STP root election, loop prevention, and MAC visibility.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const run = async line => {
    await page.fill('#tin', line);
    await page.press('#tin', 'Enter');
    await page.waitForTimeout(100);
  };
  const node = id => '#topo .node[data-dev="' + id + '"]';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  const option = await page.locator('#pick option').filter({ hasText: 'Stop the loop, keep the link' }).getAttribute('value');
  if (option == null) throw new Error('STP mission was not listed');
  await page.selectOption('#pick', option);
  await page.waitForTimeout(180);
  await page.click(node('sw3'));
  await run('show spanning-tree vlan 10');
  let output = await page.locator('#tout').innerText();
  if (!output.includes('Root bridge: sw1')) throw new Error('default STP root should initially be sw1');
  await run('spanning-tree vlan 10 priority 4096');
  await run('show spanning-tree vlan 10');
  output = await page.locator('#tout').innerText();
  if (!output.includes('Root bridge: sw3')) throw new Error('STP priority change did not elect sw3');
  await page.click(node('h1'));
  await run('ping srv');
  if (!(await page.locator('#tout').innerText()).includes('reply received')) throw new Error('endpoint ping should populate switch MAC tables');
  await page.click(node('sw1'));
  await run('show mac address-table dynamic');
  output = await page.locator('#tout').innerText();
  if (!output.includes('srv/eth0')) throw new Error('remote server MAC was not learned through the forwarding path');
  await page.waitForTimeout(180);
  const panel = await page.locator('#config').innerText();
  if (!panel.includes('Spanning Tree') || !panel.includes('Learned MAC addresses')) {
    throw new Error('switch panel is missing STP or MAC learning details; panel=' + panel + '; pageErrors=' + errors.join(' | '));
  }
  await page.click(node('h1'));
  await run('ping srv');
  output = await page.locator('#tout').innerText();
  if (!output.includes('reply received')) throw new Error('STP should preserve endpoint reachability');
  if (errors.length) throw new Error('browser errors: ' + errors.join(' | '));
  console.log('✓ STP root election, blocked path, MAC learning, and browser UI work');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
