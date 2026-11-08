const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  // Build mode starts with an intentionally empty canvas. Add a device before
  // asserting keyboard behavior; the default mission is not a reliable source
  // of topology nodes for this isolated builder test.
  await page.click('#btnBuild');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');
  const node = page.locator('#topo .node').first();
  const label = await node.getAttribute('aria-label');
  if (!label || await node.getAttribute('role') !== 'button' || await node.getAttribute('tabindex') !== '0') throw new Error('Topology device lacks an accessible name or keyboard focus');
  await node.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  if (!(await page.locator('#topo .node').first().evaluate(el => el.classList.contains('sel')))) throw new Error('Enter did not select the focused device');
  await page.locator('#topo .node').first().focus();
  await page.keyboard.press('Shift+F10');
  await page.waitForSelector('.topo-context-menu');
  const items = page.locator('.topo-context-menu [role="menuitem"]:not(:disabled)');
  if (await items.count() < 2) throw new Error('Device context menu has no usable actions');
  await page.keyboard.press('ArrowDown');
  if (!(await items.nth(1).evaluate(el => el === document.activeElement))) throw new Error('ArrowDown did not move menu focus');
  await page.keyboard.press('Home');
  if (!(await items.first().evaluate(el => el === document.activeElement))) throw new Error('Home did not focus first menu item');
  await page.keyboard.press('Escape');
  if (await page.locator('.topo-context-menu').count()) throw new Error('Escape did not close context menu');
  if (!(await page.locator('#topo .node').first().evaluate(el => el === document.activeElement))) throw new Error('Closing menu did not restore focus to invoking device');
  await page.locator('#topo .node').first().focus();
  await page.keyboard.press('ContextMenu');
  await page.waitForSelector('.topo-context-menu');
  await page.keyboard.press('Escape');
  if (errors.length) throw new Error(errors.join(' | '));
  await browser.close();
  console.log('TOPOLOGY KEYBOARD TEST OK');
})().catch(e => { console.error(e); process.exit(1); });
