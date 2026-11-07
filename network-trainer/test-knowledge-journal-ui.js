// Knowledge centre and engineering journal: searchable command references,
// troubleshooting playbooks, record filtering, note capture and export.
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

  await page.locator('#navKnowledge').click();
  if (await page.locator('#knowledgeView').isVisible()) ok('Knowledge is a first-class workspace destination');
  else fail('Knowledge workspace did not open');
  if (await page.locator('.knowledge-playbook').count() >= 4) ok('troubleshooting playbooks are available');
  else fail('troubleshooting playbooks are missing');

  const commandCount = await page.locator('.knowledge-command').count();
  await page.locator('#knowledgeSearch').fill('spanning-tree');
  if (await page.locator('.knowledge-command').count() > 0 && await page.locator('.knowledge-command').count() < commandCount)
    ok('command search narrows the reference library');
  else fail('command search did not filter the library');

  await page.locator('#knowledgeSearch').fill('');
  await page.locator('#knowledgeCategory').selectOption({ label: 'Cisco IOS · switching' });
  if (await page.locator('.knowledge-command').count() > 0 && (await page.locator('.knowledge-command').first().innerText()).toLowerCase().includes('switch'))
    ok('category filter isolates switching references');
  else fail('category filter did not isolate switching references');

  await page.locator('[data-knowledge-cmd="show vlan brief"]').first().click();
  if (await page.locator('#cols').isVisible() && await page.locator('#tin').inputValue() === 'show vlan brief')
    ok('reference command is handed to the Workbench console');
  else fail('command handoff to Workbench failed');

  // The floating terminal is mounted outside the Workbench layout. Focus the
  // actual command field and wait for its persisted journal record before
  // navigating away, rather than racing the view transition against the submit.
  await page.locator('#tin').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const progress = JSON.parse(localStorage.getItem('nettrainer') || '{}');
    return Array.isArray(progress.journal) && progress.journal.some(entry => entry.command === 'show vlan brief');
  }, null, { timeout: 3000 });
  await page.locator('#navJournal').click();
  if (await page.locator('#journalView').isVisible()) ok('Journal is a first-class workspace destination');
  else fail('Journal workspace did not open');
  if (await page.locator('.journal-entry').count() > 0) ok('console activity is recorded in the journal');
  else fail('console activity was not recorded');

  await page.locator('#journalNotePage').fill('Checked VLAN membership during the access-port investigation.');
  await page.locator('#saveJournalNotePage').click();
  if ((await page.locator('.journal-entry').first().innerText()).includes('Checked VLAN membership'))
    ok('engineer notes can be saved into the journal');
  else fail('journal note was not saved');

  await page.locator('#journalSearch').fill('VLAN membership');
  if (await page.locator('.journal-entry').count() === 1) ok('journal search filters notes and evidence');
  else fail('journal search did not filter records');
  await page.locator('#journalSearch').fill('');
  await page.locator('#journalType').selectOption('engineer note');
  if (await page.locator('.journal-entry').count() === 1) ok('journal activity-type filter works');
  else fail('journal activity-type filter failed');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#journalExportPage').click();
  const download = await downloadPromise;
  if (download.suggestedFilename() === 'network-work-journal.md') ok('journal exports as Markdown');
  else fail('journal export filename is unexpected');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#navKnowledge').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (!overflow) ok('Knowledge and Journal layouts remain usable on mobile widths');
  else fail('knowledge workspace causes horizontal page overflow on mobile');

  await browser.close();
  if (errors.length) { console.error('\\nKNOWLEDGE / JOURNAL TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nKNOWLEDGE / JOURNAL OK.');
})();
