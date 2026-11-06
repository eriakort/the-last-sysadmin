// Workbench regression: help must be one click away, command examples must be
// usable, and the work journal must retain commands and learner-authored notes.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  if (await page.locator('#btnHelp').isVisible() && await page.locator('#btnJournal').isVisible())
    ok('Help and Journal are always available in the workbench header');
  else fail('Help or Journal action missing');

  await page.locator('#topo .node[data-dev="sw1"]').click();
  await page.locator('#btnHelp').click();
  if (await page.locator('#modal .help-sheet').isVisible()) ok('help desk opens from the global Help action');
  else fail('help desk did not open');

  const context = await page.locator('#modal .eyebrow').innerText();
  if (/sw1/.test(context) && /switch/.test(context)) ok('help desk identifies the selected switch');
  else fail('help desk lacks selected-device context: ' + context);

  await page.locator('#helpSearch').fill('vlan 20');
  const command = page.locator('#helpResults [data-help-cmd="vlan 20"]');
  if (await command.count()) ok('command reference can be searched');
  else fail('VLAN command not found in help search');

  await command.click();
  if (!(await page.locator('#modal').count()) && (await page.locator('#tin').inputValue()) === 'vlan 20')
    ok('selecting a help example inserts it into the device console');
  else fail('help command was not inserted into the terminal');

  await page.locator('#tin').press('Enter');
  await page.waitForTimeout(100);
  const terminal = await page.locator('#tout').innerText();
  if (/VLAN 20 created/.test(terminal)) ok('selected command runs on the selected switch');
  else fail('command example did not execute: ' + terminal);

  await page.locator('#btnJournal').click();
  if (await page.locator('#modal .journal-entry').count() > 0) ok('journal records command activity and output');
  else fail('journal did not record the command');

  await page.locator('#journalNote').fill('Checked the switch VLAN database before changing the access port.');
  await page.locator('#saveJournalNote').click();
  await page.waitForTimeout(80);
  await page.locator('#btnJournal').click();
  const journal = await page.locator('#modal .journal-list').innerText();
  if (/Checked the switch VLAN database/.test(journal) && /VLAN 20 created/.test(journal))
    ok('learner notes and command evidence persist in the work journal');
  else fail('journal is missing note or command output: ' + journal);

  if (await page.locator('#exportJournal').isVisible()) ok('journal offers a Markdown export');
  else fail('journal export action missing');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(250);
  await page.locator('#btnJournal').click();
  const afterReload = await page.locator('#modal .journal-list').innerText();
  if (/Checked the switch VLAN database/.test(afterReload)) ok('work journal survives a browser reload');
  else fail('journal note did not persist across reload');

  await browser.close();
  if (errors.length) { console.error('\\nWORKBENCH UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKBENCH UI OK.');
})();
