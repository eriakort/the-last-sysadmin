// Browser regression for the guided first service investigation.
const path = require('path');
const { chromium } = require('playwright');
const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(INDEX, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(150);

  if (await page.locator('#firstRunInvestigationTour').isVisible()) ok('first-session orientation offers the investigation tour');
  else fail('first-session orientation is missing the investigation tour entry point');

  await page.click('#firstRunInvestigationTour');
  if (await page.locator('#investigationTour').isVisible() && (await page.locator('#investigationTourCopy').innerText()).includes('read-only simulation'))
    ok('tour opens with a safe, evidence-first introduction');
  else fail('tour did not open with its introductory guidance');
  if ((await page.locator('#investigationTourAvatar').innerText()).trim()) ok('tour includes the existing learner avatar as its guide');
  else fail('tour guide avatar is missing');

  await page.click('#investigationTourSkip');
  if (!(await page.locator('#investigationTour').isVisible()) && await page.evaluate(() => localStorage.getItem('lsa-investigation-tour-complete')) !== '1')
    ok('skipping closes the tour without marking it complete');
  else fail('skipping incorrectly marked the tour complete');

  await page.locator('#menuHelp summary').click();
  await page.click('#btnInvestigationTour');
  if (await page.locator('#investigationTour').isVisible()) ok('tour can be replayed from Account & help');
  else fail('help menu did not reopen the investigation tour');

  await page.click('#investigationTourNext');
  await page.click('#investigationTourAction');
  if ((await page.locator('#commandIncidentProgress').innerText()).includes('0/3') && (await page.locator('#investigationTourTitle').innerText()).includes('Inspect service state'))
    ok('tour starts the existing investigation challenge and follows its first step');
  else fail('tour did not start the existing investigation challenge');

  const commands = [
    { command: 'systemctl status halcyon', title: '1 · Inspect service state', progress: '1/3' },
    { command: 'journalctl -u halcyon -n 20', title: '2 · Read recent service logs', progress: '2/3' },
    { command: 'ss -tuln', title: '3 · Check listening sockets', progress: '3/3' }
  ];
  for (const item of commands) {
    const before = await page.locator('#tout .cmdl').count();
    await page.click('#investigationTourAction');
    if (await page.inputValue('#tin') === item.command && await page.locator('#tout .cmdl').count() === before)
      ok('tour safely loads ' + item.command + ' without executing it');
    else fail('tour did not safely load ' + item.command);
    await page.locator('#tin').press('Enter');
    if ((await page.locator('#commandIncidentProgress').innerText()).includes(item.progress) && (await page.locator('#investigationTourTitle').innerText()) === item.title)
      ok('running the command advances the real investigation tracker and tour');
    else fail('investigation did not advance after ' + item.command);
  }

  const finalCopy = await page.locator('#investigationTourCopy').innerText();
  if (finalCopy.includes('Correlate the evidence')) ok('final tour step teaches evidence correlation before making changes');
  else fail('final tour step omitted evidence correlation guidance');
  await page.click('#investigationTourNext');
  if (!(await page.locator('#investigationTour').isVisible()) && await page.evaluate(() => localStorage.getItem('lsa-investigation-tour-complete')) === '1')
    ok('finishing the tour records completion');
  else fail('finishing the tour did not record completion');

  await page.locator('#menuHelp summary').click();
  await page.click('#btnInvestigationTour');
  if (await page.locator('#investigationTour').isVisible()) ok('completed tour remains available for replay');
  else fail('completed tour cannot be replayed');
  await page.click('#investigationTourSkip');

  await browser.close();
  if (errors.length) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
