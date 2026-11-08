// Change management workflow: create, approve, implement, verify and persist a controlled change.
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
  await page.locator('#navWorkbench').click();
  const device = page.locator('#brief [data-explorer-dev]').first();
  const deviceId = await device.getAttribute('data-explorer-dev');
  if (!deviceId) fail('active scenario has no selectable simulator device');
  await page.locator('#navChanges').click();
  if (await page.locator('#changeView h1').innerText() === 'Change management') ok('Change Management is a first-class workspace');
  else fail('Change Management workspace did not open');

  await page.locator('#changeNew').click();
  const fields = {
    title: 'Add VLAN 30 to access switch',
    reason: 'Enable the new Finance user segment with controlled impact.',
    affected: 'SW-ACCESS-1, VLAN 30, Finance endpoints',
    window: '2026-11-08 20:00–20:30 CET',
    prechecks: 'Capture show vlan brief and show interfaces trunk; confirm backup.',
    steps: 'Create VLAN 30; configure access ports; verify trunk allowance.',
    rollback: 'Restore previous port VLANs and remove VLAN 30 if unused.',
    successCriteria: 'Finance endpoints obtain expected addressing and reach approved services.'
  };
  for (const [name,value] of Object.entries(fields)) await page.locator('[name="'+name+'"]').fill(value);
  const deviceLink = page.locator('input[name="deviceIds"][value="' + deviceId + '"]');
  if (await deviceLink.count()) await deviceLink.check();
  else fail('change form did not offer active simulator devices');
  await page.locator('#changeForm button[type="submit"]').click();
  if (await page.locator('#changeDetail [data-change-device]').count() === 1) ok('change record keeps a structured link to its affected simulator device');
  else fail('affected simulator device link was not saved');
  await page.locator('#changeDetail [data-change-device]').click();
  if (await page.locator('#cols').isVisible() && await page.locator('#termTarget').innerText() === deviceId) ok('change record hands implementation directly to the linked device console');
  else fail('change-to-Workbench handoff selected the wrong device');
  await page.locator('#navChanges').click();
  if (await page.locator('.change-state').first().innerText() === 'Draft') ok('new change is saved as a draft with a unique record');
  else fail('new change draft was not created');

  await page.locator('#changeSubmit').click();
  if (await page.locator('#changeDetail .change-state').innerText() === 'Awaiting approval') ok('draft can be submitted for approval');
  else fail('change submission did not update status');
  await page.locator('#changeApprove').click();
  if (await page.locator('#changeDetail .change-state').innerText() === 'Approved') ok('approval is an explicit workflow stage');
  else fail('change approval did not update status');
  await page.locator('#changeStart').click();
  if (await page.locator('#changeValidation').count()) ok('implementation requires a separate verification step');
  else fail('implementation state did not expose verification controls');
  await page.locator('#changeVerify').click();
  if (await page.locator('#changeDetail .change-state').innerText() === 'In progress') ok('verification is blocked until evidence is supplied');
  else fail('change should remain in progress without verification evidence');
  await page.locator('#changeValidation').fill('show vlan brief confirms VLAN 30; trunk allows VLAN 30; endpoint reachability verified.');
  await page.locator('#changeVerify').click();
  if (await page.locator('#changeDetail .change-state').innerText() === 'Verified') ok('change closes only after recording post-change evidence');
  else fail('change did not reach verified state');

  await page.reload({ waitUntil: 'load' });
  await page.locator('#navChanges').click();
  if (await page.locator('.change-list-item').count() === 1 && await page.locator('#changeDetail').innerText().then(t=>t.includes('show vlan brief confirms VLAN 30')))
    ok('change record and verification evidence persist after reload');
  else fail('change record did not persist');
  await page.locator('#navJournal').click();
  if (await page.locator('#journalView').innerText().then(t=>t.includes('change verified'))) ok('change lifecycle is recorded in the Engineering Journal');
  else fail('change lifecycle was not journalled');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#navChanges').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('Change Management remains usable on mobile widths');
  else fail('Change Management causes horizontal page overflow on mobile');

  await browser.close();
  if (errors.length) { console.error('\\nCHANGE MANAGEMENT TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nCHANGE MANAGEMENT OK.');
})();
