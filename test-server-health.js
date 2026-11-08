// Browser regression for the read-only, simulator-derived Linux health dashboard.
const path = require('path');
const { chromium } = require('playwright');
const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  const fail = message => { throw new Error(message); };
  try {
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    await page.click('#btnHealthDashboard');
    const dialog = page.locator('#serverHealthDialog [role="dialog"]');
    if (!(await dialog.isVisible())) fail('Server health dialog did not open');
    if ((await page.locator('.health-resource').count()) !== 3) fail('Expected CPU, memory and filesystem resource cards');
    if ((await page.locator('.health-meter[role="meter"]').count()) !== 3) fail('Each resource card must expose an accessible meter');
    for (const label of ['CPU demand', 'Memory in use', 'Root filesystem']) {
      const meter = page.getByRole('meter', { name: label });
      if (!(await meter.count())) fail('Missing accessible resource meter: ' + label);
      const value = Number(await meter.getAttribute('aria-valuenow'));
      if (!Number.isFinite(value) || value < 0 || value > 100) fail('Invalid percentage for ' + label + ': ' + value);
    }
    if (!(await page.locator('.health-resource-note').textContent()).includes('not measurements of your device')) {
      fail('Dashboard must clearly distinguish simulated metrics from real host telemetry');
    }
    if (!(await page.locator('.health-state').textContent()).trim()) fail('Overall health state is missing');
    // Drive the real simulator model into simultaneous CPU, memory, disk and inode pressure.
    await page.evaluate(() => {
      S.procs[0].cpu = 150;
      S.iowait = true;
      S.held = DISK_TOTAL;
      S.inodeBad = true;
      renderServerHealth();
    });
    if ((await page.locator('.health-resource.warn').count()) !== 3) fail('CPU, memory and disk pressure must each raise a warning');
    if (!(await page.locator('.health-state').textContent()).includes('Needs attention')) fail('Resource pressure must affect the overall health state');
    const attention = await page.locator('.health-columns').innerText();
    for (const phrase of ['CPU pressure needs investigation', 'Memory headroom is low', 'Storage needs attention']) {
      if (!attention.includes(phrase)) fail('Missing actionable warning: ' + phrase);
    }
    await page.click('#healthRefresh');
    if ((await page.locator('.health-resource').count()) !== 3) fail('Refresh lost resource cards');
    const node = page.locator('[data-health-node]').first();
    const expectedDetail = await node.getAttribute('data-health-detail');
    await node.click();
    if ((await page.locator('#healthDependencyDetail p').textContent()) !== expectedDetail) fail('Dependency evidence selection did not update its detail panel');
    const prepare = page.locator('[data-health-command]').first();
    const command = await prepare.getAttribute('data-health-command');
    await prepare.click();
    if (await page.locator('#serverHealthDialog [role="dialog"]').count()) fail('Preparing a command should close the health dialog');
    if ((await page.locator('#tin').inputValue()) !== command) fail('Prepared troubleshooting command was not transferred to the terminal');
    if (errors.length) fail('Browser errors: ' + errors.join('\n'));
    console.log('✓ CPU, memory and disk metrics render as accessible simulator-derived meters');
    console.log('✓ dashboard refresh and dependency evidence selection work');
    console.log('✓ guided command handoff works without executing the command');
    console.log('✓ simulated telemetry disclaimer is visible');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
