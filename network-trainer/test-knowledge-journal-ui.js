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

  await page.evaluate(() => { const progress = JSON.parse(localStorage.getItem('nettrainer') || '{}'); progress.journal = [{ at: new Date().toISOString(), type: 'command', command: 'show ip route', result: 'error', output: '% Invalid input detected' }]; localStorage.setItem('nettrainer', JSON.stringify(progress)); });
  await page.reload({ waitUntil: 'load' });
  await page.locator('#navKnowledge').click();
  if (await page.locator('#knowledgeView').isVisible()) ok('Knowledge is a first-class workspace destination');
  else fail('Knowledge workspace did not open');
  if (await page.locator('#knowledgeView').innerText().then(text => text.includes('Your learning plan') && text.includes('Routing and path verification') && text.includes('1 recent command error'))) ok('learning plan adapts its recommended focus to recent Workbench errors');
  else fail('learning plan did not derive a useful focus from the saved journal');
  await page.locator('#coachPracticeFocus').click();
  if (await page.locator('#tin').inputValue() === 'show ip route') ok('adaptive practice prepares the relevant Workbench command without changing simulator state');
  else fail('adaptive practice did not prepare the recommended command');
  await page.locator('#navKnowledge').click();
  if (await page.locator('.knowledge-playbook').count() >= 4) ok('troubleshooting playbooks are available');
  else fail('troubleshooting playbooks are missing');

  const commandCount = await page.locator('.knowledge-command').count();
  await page.locator('#knowledgeSearch').fill('spanning-tree');
  if (await page.locator('.knowledge-command').count() > 0 && await page.locator('.knowledge-command').count() < commandCount)
    ok('command search narrows the reference library');
  else fail('command search did not filter the library');

  if (await page.locator('#terminalWindow').isVisible()) await page.locator('#terminalMinimize').evaluate(el => el.click());
  await page.locator('[data-knowledge-coach="show spanning-tree"]').click();
  await page.locator('#networkCoachRecallAdd').click();
  if ((await page.locator('#networkCoachRecallAdd').innerText()).includes('In recall deck')) ok('coach can save a command concept into the spaced-recall deck');
  else fail('coach did not confirm the concept was saved');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('nettrainer-recall-v1') || '{}');
    state['show spanning-tree'].dueAt = Date.now() - 1000;
    localStorage.setItem('nettrainer-recall-v1', JSON.stringify(state));
  });
  await page.reload({ waitUntil: 'load' });
  await page.locator('#navKnowledge').click();
  if (await page.locator('#networkRecallStart').isEnabled() && (await page.locator('#networkRecallDue').innerText()).includes('1 due')) ok('saved recall cards become available when their due date arrives');
  else fail('due recall card was not surfaced after reload');
  await page.locator('#networkRecallStart').click();
  if ((await page.locator('#networkRecallCard').innerText()).includes('redundant path') && await page.locator('#networkRecallAnswer').isHidden()) ok('recall review presents the challenge before revealing its explanation');
  else fail('recall card did not withhold its explanation');
  await page.locator('#networkRecallReveal').click();
  if (await page.locator('#networkRecallAnswer').isVisible()) ok('learner can reveal the command-specific explanation');
  else fail('recall explanation did not reveal');
  await page.locator('#networkRecallRemembered').click();
  const recallAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('nettrainer-recall-v1') || '{}')['show spanning-tree']);
  if (recallAfter.stage === 1 && recallAfter.reviews === 1 && recallAfter.dueAt > Date.now() + 2 * 86400000) ok('successful self-rated recall advances to a longer three-day interval and persists');
  else fail('successful recall did not advance the interval');
  if ((await page.locator('#networkRecallDue').innerText()).includes('0 due')) ok('review count refreshes when the due card is completed');
  else fail('due count did not refresh after review');

  await page.locator('[data-knowledge-coach="show spanning-tree"]').click();
  if (await page.locator('#networkCommandCoach').isVisible() && (await page.locator('#networkCommandCoach').innerText()).includes('How to interpret the output') && (await page.locator('#networkCommandCoach').innerText()).includes('Common pitfall'))
    ok('Network Learning Coach shows command-specific output interpretation and pitfalls');
  else fail('Network Learning Coach did not show its command-specific guidance');
  await page.locator('#networkCoachMode').selectOption('assisted');
  if ((await page.locator('#networkCommandCoach').innerText()).includes('Where to run it') && (await page.locator('#networkCommandCoach').innerText()).includes('What to look for'))
    ok('assisted mode gives targeted device and output cues');
  else fail('assisted coach mode did not update');
  await page.locator('#networkCoachMode').selectOption('challenge');
  if ((await page.locator('#networkCommandCoach').innerText()).includes('Challenge') && await page.locator('#networkCoachAnswer').isHidden())
    ok('challenge mode withholds the explanation until requested');
  else fail('challenge mode did not present an unrevealed challenge');
  await page.locator('#networkCoachReveal').click();
  if (await page.locator('#networkCoachAnswer').isVisible() && (await page.locator('#networkCoachAnswer').innerText()).includes('redundant path'))
    ok('challenge explanation can be revealed on demand');
  else fail('challenge explanation did not reveal');
  await page.locator('#networkCoachMode').selectOption('guided');
  await page.locator('#networkCoachPractice').click();
  if (await page.locator('#tin').inputValue() === 'show spanning-tree')
    ok('coach practice sends the selected command to the Workbench');
  else fail('coach practice did not prepare the Workbench command');

  await page.locator('#navKnowledge').click();
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
  await page.locator('#tin').press('Enter');
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
