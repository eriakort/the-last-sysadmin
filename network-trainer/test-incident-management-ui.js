// Dedicated incident management: queue filtering, ownership, acknowledgement,
// ticket-linked timeline and verified handoff into the Workbench.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(200);
  await page.locator('#navIncidents').click();

  if (await page.locator('#incidentsView').isVisible()) ok('Incidents is a first-class workspace destination');
  else fail('incident workspace did not open');
  if (await page.locator('#incidentsView .incident-summary article').count() === 5)
    ok('incident summary separates workflow states and open workload');
  else fail('incident summary metrics are missing');

  const rows = page.locator('#incidentList .incident-row');
  if (await rows.count() > 0) ok('open incident queue is populated');
  else fail('open incident queue is empty');

  const priority = page.locator('#incidentPriority');
  await priority.selectOption('P1');
  const p1Rows = await page.locator('#incidentList .incident-row').count();
  const p1Labels = await page.locator('#incidentList .incident-row .tk-pri').allTextContents();
  if (p1Rows > 0 && p1Labels.every(x => x.trim() === 'P1')) ok('priority filter narrows the queue to critical incidents');
  else fail('priority filter did not isolate P1 incidents');
  await priority.selectOption('all');

  const first = page.locator('#incidentList .incident-row').first();
  const ticketId = await first.locator('.incident-row-top b').innerText();
  await first.click();
  if ((await page.locator('#incidentDetail').innerText()).includes(ticketId))
    ok('selecting a queue row loads the incident detail record');
  else fail('incident detail did not load the selected ticket');

  const acknowledge = page.locator('#incidentAcknowledge');
  if (await acknowledge.count()) {
    await acknowledge.click();
    if ((await page.locator('#incidentDetail').innerText()).toLowerCase().includes('acknowledged'))
      ok('new incident can be acknowledged from its detail record');
    else fail('acknowledgement did not update the incident state');
  } else ok('selected incident was already acknowledged or in progress');

  await page.locator('#incidentAssignee').selectOption({ label: 'L2 Network Engineering' });
  await page.locator('#incidentAssignSave').click();
  if ((await page.locator('#incidentDetail').innerText()).includes('L2 Network Engineering'))
    ok('incident ownership can be reassigned');
  else fail('incident ownership was not updated');

  const investigate = page.locator('#incidentInvestigate');
  if (await investigate.count()) {
    await investigate.click();
    if (await page.locator('#cols').isVisible() && await page.locator('#brief .ticket').innerText().then(t => t.includes(ticketId)))
      ok('investigation opens the matching ticket scenario in the Workbench');
    else fail('incident did not hand off to its matching Workbench scenario');

    await page.locator('#navIncidents').click();
    const timeline = await page.locator('#incidentDetail .incident-timeline').innerText();
    if (timeline.toLowerCase().includes('investigation started'))
      ok('incident timeline retains the investigation handoff record');
    else fail('incident timeline is missing the investigation handoff');
  } else fail('active incident does not offer a Workbench investigation action');

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('incident workspace reflows without horizontal page overflow on mobile');
  else fail('incident workspace causes horizontal overflow on mobile');

  await browser.close();
  if (errors.length) { console.error('\\nINCIDENT MANAGEMENT TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nINCIDENT MANAGEMENT OK.');
})();
