// Canvas regression: (1) arrow keys move a device on every press (not just the
// first — the grid-snap no longer traps it in one cell), and (2) a device's own
// name/type labels travel with the device when it is moved by keyboard or by
// mouse drag, even after the labels have been independently repositioned.
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const browserType = { firefox, webkit }[process.env.PLAYWRIGHT_BROWSER] || chromium;
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });

  await page.click('#btnBuild'); await page.click('#buildMenuOpen');
  await page.waitForSelector('#config .pal[data-add="host"]');
  await page.click('#config .pal[data-add="host"]');
  await page.waitForSelector('#topo .node');

  const devX = () => page.$eval('#topo .node', n => +n.getAttribute('transform').match(/translate\(([-\d.]+),/)[1]);
  const nameXY = () => page.$eval('.device-label[data-label-kind="name"]', t => [+t.getAttribute('x'), +t.getAttribute('y')]);

  // --- (1) repeated arrow presses keep moving the device ---
  await page.locator('#topo .node').first().focus();
  await page.keyboard.press('Enter'); await page.waitForTimeout(40);
  await page.locator('#topo .node').first().focus();
  const xs = [await devX()];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(70); xs.push(await devX()); }
  for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) throw new Error('device stopped advancing on arrow press ' + i + ': ' + xs.join(' -> '));

  // --- (2a) a device's own label follows it on KEYBOARD move ---
  // First reposition the name label independently so it is stored as absolute.
  await page.locator('.device-label[data-label-kind="name"]').first().focus();
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(50);
  let l0 = await nameXY(), d0 = await devX();
  await page.locator('#topo .node').first().focus();
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(70);
  let l1 = await nameXY(), d1 = await devX();
  if (Math.abs((l1[0] - l0[0]) - (d1 - d0)) > 0.5) throw new Error('label did not follow device on keyboard move (device +' + (d1 - d0) + ', label +' + (l1[0] - l0[0]) + ')');
  if (l1[1] !== l0[1]) throw new Error('horizontal move should not shift the label vertically');

  // --- (2b) a device's own label follows it on MOUSE DRAG ---
  l0 = await nameXY(); d0 = await devX();
  const node = page.locator('#topo .node').first(); const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 48, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(100);
  l1 = await nameXY(); d1 = await devX();
  if (Math.abs((l1[0] - l0[0]) - (d1 - d0)) > 1) throw new Error('label did not track the dragged device (device +' + (d1 - d0) + ', label +' + (l1[0] - l0[0]) + ')');

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('Device label-follow + arrow-key repeat UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
