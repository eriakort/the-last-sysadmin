// Browser regression for the first guided-learning pilot (Linux Chapter 1).
const path = require('path');
const { chromium } = require('playwright');
const INDEX = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const ok = m => console.log('  ✓ ' + m);
  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };

  await page.goto(INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const guide = await page.$('#learningPath');
  if (guide && await guide.isVisible()) ok('Chapter 1 learning guide is visible');
  else fail('Chapter 1 learning guide is missing or hidden');

  const guideText = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (guideText.includes(stage)) ok('learning stage present: ' + stage);
    else fail('learning stage missing: ' + stage);
  }

  await page.click('[data-learning-choice="whoami"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect mastery answer is rejected');
  else fail('incorrect answer was not rejected');

  await page.fill('#tin', 'whoami');
  await page.press('#tin', 'Enter');
  await page.fill('#tin', 'pwd');
  await page.press('#tin', 'Enter');
  await page.fill('#tin', 'check');
  await page.press('#tin', 'Enter');
  await page.waitForTimeout(120);
  if ((await page.textContent('#pTitle')) === 'Get your bearings') ok('mission remains locked before mastery is proven');
  else fail('mission advanced without a correct mastery answer');

  await page.click('[data-learning-choice="pwd"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct')) ok('correct mastery answer is accepted with explanation');
  else fail('correct answer did not show success feedback');

  await page.fill('#tin', 'check');
  await page.press('#tin', 'Enter');
  await page.waitForTimeout(180);
  if ((await page.textContent('#pTitle')) === 'The handover note') ok('terminal objective + mastery check complete Chapter 1 mission');
  else fail('mission did not advance after terminal objective and mastery check');


  if (!(await page.$eval('#learningPath', el => !el.hidden))) ok('pilot guide is scoped to Chapter 1');
  else fail('learning guide should hide after leaving the pilot mission');

  // Complete the remaining Chapter 1 tickets to reach Chapter 2.
  const run = async command => { await page.fill('#tin', command); await page.press('#tin', 'Enter'); };
  await run('ls -a');
  await run('cat .handover.txt');
  await run('check');
  await run('cat /srv/halcyon/README');
  await run('check');
  await run('cat /srv/halcyon/CURRENT');
  await run('cat /srv/halcyon/releases/v2.3.1/config/app.conf');
  await run('check');

  if ((await page.textContent('#pTitle')) === 'Make a workspace') ok('Chapter 2 starts with Make a workspace');
  else fail('did not reach the first Chapter 2 mission');
  const ch2Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch2Guide.includes(stage)) ok('Chapter 2 learning stage present: ' + stage);
    else fail('Chapter 2 learning stage missing: ' + stage);
  }

  await page.click('[data-learning-choice="private"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 2 mastery answer is rejected');
  else fail('incorrect Chapter 2 mastery answer was not rejected');
  await run('mkdir -p ~/incident/logs ~/incident/notes');
  await run('check');
  await page.waitForTimeout(120);
  if ((await page.textContent('#pTitle')) === 'Make a workspace') ok('Chapter 2 mission remains locked until mastery is proven');
  else fail('Chapter 2 mission advanced without mastery');
  await page.click('[data-learning-choice="parents"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. mkdir -p')) ok('correct Chapter 2 mastery answer explains parent directories');
  else fail('correct Chapter 2 answer did not show its explanation');
  await run('check');
  await page.waitForTimeout(180);
  if ((await page.textContent('#pTitle')) === 'Preserve the log') ok('Chapter 2 objective + mastery check complete the mission');
  else fail('Chapter 2 mission did not advance after objective and mastery');

  // Finish the remaining Chapter 2 tickets and enter Chapter 3.
  await run('cp /var/log/halcyon/app.log ~/incident/logs/');
  await run("find /tmp -name '*.core' -delete");
  await run('mkdir ~/incident/quarantine');
  await run('mv /srv/halcyon/export/sync_out.sh ~/incident/quarantine/');
  await run('tail -n 1 /var/log/halcyon/app.log');
  await run('submit 03:47:12');
  if ((await page.textContent('#pTitle')) === 'Count the errors') ok('Chapter 3 starts with Count the errors');
  else fail('did not reach the first Chapter 3 mission');

  const ch3Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch3Guide.includes(stage)) ok('Chapter 3 learning stage present: ' + stage);
    else fail('Chapter 3 learning stage missing: ' + stage);
  }

  await page.click('[data-learning-choice="context"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 3 mastery answer is rejected');
  else fail('incorrect Chapter 3 mastery answer was not rejected');
  await run('grep -c ERROR /var/log/halcyon/app.log');
  const errorCount = await page.$eval('#tout', el => {
    const lines = el.innerText.trim().split(/\\r?\\n/);
    return lines.reverse().find(line => /^\\d+$/.test(line.trim()))?.trim() || '';
  });
  if (!errorCount) fail('grep -c output did not expose the error count');
  await run('submit ' + errorCount);
  if ((await page.textContent('#pTitle')) === 'Count the errors') ok('correct terminal answer cannot bypass the Chapter 3 mastery gate');
  else fail('Chapter 3 answer ticket advanced before mastery was proven');

  await page.click('[data-learning-choice="count"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. grep -c')) ok('correct Chapter 3 mastery answer explains line counting');
  else fail('correct Chapter 3 answer did not show its explanation');
  await run('submit ' + errorCount);
  if ((await page.textContent('#pTitle')) === 'Who is hitting us?') ok('Chapter 3 answer + mastery check complete the mission');
  else fail('Chapter 3 mission did not advance after answer and mastery');

  await browser.close();
  if (errors.length) { console.error('\nLEARNING FLOW TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nLEARNING FLOW OK.');
})();
