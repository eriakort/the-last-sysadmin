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
    await page.locator('#menuProgress summary').click();
    await page.click('#btnHealthDashboard');
    const dialog = page.locator('#serverHealthDialog [role="dialog"]');
    if (!(await dialog.isVisible())) fail('Server health dialog did not open');
    if ((await page.locator('.health-resource').count()) !== 6) fail('Expected CPU, memory, filesystem, process, service and network resource cards');
    if ((await page.locator('.health-meter[role="meter"]').count()) !== 6) fail('Each resource card must expose an accessible meter');
    for (const label of ['CPU demand', 'Memory in use', 'Root filesystem', 'Process pressure', 'Service availability', 'Network interface']) {
      const meter = page.getByRole('meter', { name: label });
      if (!(await meter.count())) fail('Missing accessible resource meter: ' + label);
      const value = Number(await meter.getAttribute('aria-valuenow'));
      if (!Number.isFinite(value) || value < 0 || value > 100) fail('Invalid percentage for ' + label + ': ' + value);
    }
    if (!(await page.locator('.health-resource-note').textContent()).includes('not measurements of your device')) {
      fail('Dashboard must clearly distinguish simulated metrics from real host telemetry');
    }
    if (Number(await page.getByRole('meter', { name: 'Process pressure' }).getAttribute('aria-valuenow')) < 80) fail('The runaway process must be visible as process pressure');
    if (Number(await page.getByRole('meter', { name: 'Service availability' }).getAttribute('aria-valuenow')) !== 100) fail('All active simulated services should report full availability');
    if (await page.getByRole('meter', { name: 'Network interface' }).getAttribute('aria-valuetext') !== 'UP') fail('The configured non-loopback interface should report UP');
    if (!(await page.locator('.health-resource-note').textContent()).includes('simulated')) fail('All health indicators must remain clearly labelled as simulated');
    if (!(await page.locator('.health-state').textContent()).trim()) fail('Overall health state is missing');
    // The default incident fixture includes a CPU-heavy process; the dashboard
    // must surface it without exposing private simulator state to browser scripts.
    const attention = await page.locator('.health-columns').innerText();
    if (!attention.includes('CPU pressure needs investigation')) fail('High process CPU should produce actionable attention guidance');
    if (!(await page.locator('.health-state').textContent()).includes('Needs attention')) fail('A resource warning must affect the overall health state');
    await page.click('#healthRefresh');
    if ((await page.locator('.health-resource').count()) !== 6) fail('Refresh lost one or more health indicators');
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
    console.log('✓ CPU, memory, disk, process, service and network indicators render as accessible simulator-derived meters');
    console.log('✓ dashboard refresh and dependency evidence selection work');
    console.log('✓ guided command handoff works without executing the command');
    console.log('✓ simulated telemetry disclaimer is visible');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
