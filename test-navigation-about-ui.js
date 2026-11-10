// Browser regression coverage for compact Linux navigation, tooltips and About.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');
const VERSION = fs.readFileSync(path.join(process.cwd(), 'src/version.txt'), 'utf8').trim();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => errors.push(message);

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(350);

  for (const id of ['menuPractice', 'menuProgress', 'menuHelp']) {
    if (await page.locator('#' + id).count() === 1) ok(id + ' groups its related toolbar actions');
    else fail(id + ' dropdown is missing');
  }
  await page.locator('#menuPractice summary').click();
  if (await page.locator('#btnBashWorkshop').isVisible() && await page.locator('#btnOpsRecoveryLab').isVisible())
    ok('Practice dropdown exposes the practical learning labs');
  else fail('Practice dropdown did not expose its actions');

  await page.locator('#menuHelp summary').click();
  await page.locator('#btnAbout').click();
  const about = await page.locator('body').innerText();
  if (/About The Last Sysadmin/.test(about) && about.includes('Version ' + VERSION))
    ok('About displays the application purpose and the generated current version');
  else fail('About purpose or version is missing: ' + about.slice(-1200));
  if (/browser-based learning platform/.test(about) && /isolated browser simulation/.test(about))
    ok('About explains the learning purpose and simulation safety boundary');
  else fail('About does not clearly explain the app purpose and simulation boundary');
  await page.locator('#aboutDone').click();

  if (await page.locator('nav.apptabs a[title]').count() === 2 && await page.locator('#btnNew').getAttribute('title'))
    ok('primary navigation and destructive action provide tooltips');
  else fail('navigation tooltips are missing');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    header: document.querySelector('.top')?.getBoundingClientRect().width,
    stats: document.querySelector('.stats')?.getBoundingClientRect().width
  }));
  if (layout.document <= layout.viewport && layout.header <= layout.viewport && layout.stats <= layout.viewport)
    ok('compact toolbar fits a 390px viewport without horizontal overflow');
  else fail('mobile toolbar overflows: ' + JSON.stringify(layout));

  await page.locator('#menuProgress summary').click();
  const menuBox = await page.locator('#menuProgress .top-menu-list').boundingBox();
  if (menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 390)
    ok('dropdown menu remains inside the mobile viewport');
  else fail('mobile dropdown is clipped or outside the viewport: ' + JSON.stringify(menuBox));

  await browser.close();
  if (errors.length) {
    console.error('\nNAVIGATION / ABOUT UI TEST FAILED (' + errors.length + ')');
    errors.forEach(error => console.error('  ✗ ' + error));
    process.exit(1);
  }
  console.log('\nNAVIGATION / ABOUT UI OK.');
})().catch(error => { console.error(error); process.exit(1); });
