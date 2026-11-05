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
    const lines = el.innerText.trim().split(/\r?\n/);
    return lines.reverse().find(line => /^\d+$/.test(line.trim()))?.trim() || '';
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

  // Finish Chapter 3's investigation tickets and enter Chapter 4.
  await run("awk '{print $1}' /var/log/halcyon/access.log | sort | uniq -c | sort -rn | head -3");
  await run('submit 203.0.113.77');
  if ((await page.textContent('#pTitle')) === 'What did they take?') ok('Chapter 3 identifies the busiest visitor');
  else fail('Chapter 3 visitor investigation did not complete');
  await run("grep 203.0.113.77 /var/log/halcyon/access.log | awk '{print $7}' | sort | uniq -c");
  await run('submit /customers.csv');
  if ((await page.textContent('#pTitle')) === 'Save the evidence') ok('Chapter 3 identifies the repeatedly requested file');
  else fail('Chapter 3 requested-file investigation did not complete');
  await run('grep 203.0.113.77 /var/log/halcyon/access.log > ~/incident/notes/evidence.txt');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'ROOTCAUSE') ok('Chapter 3 preserves the access-log evidence');
  else fail('Chapter 3 evidence preservation did not complete');
  await run('grep -rl ROOTCAUSE /srv/halcyon');
  await run('cat /srv/halcyon/releases/v2.3.1/.dana/draft-report.md');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Who can log in?') ok('Chapter 4 starts with Who can log in?');
  else fail('did not reach the first Chapter 4 mission');

  const ch4Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch4Guide.includes(stage)) ok('Chapter 4 learning stage present: ' + stage);
    else fail('Chapter 4 learning stage missing: ' + stage);
  }
  if (ch4Guide.includes('seven colon-separated fields') && ch4Guide.includes('/usr/sbin/nologin')) ok('Chapter 4 explains passwd fields and non-login shells');
  else fail('Chapter 4 account explanation is incomplete');

  await page.click('[data-learning-choice="password"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 4 mastery answer is rejected');
  else fail('incorrect Chapter 4 mastery answer was not rejected');
  await run('grep -c \'/bin/bash$\' /etc/passwd');
  const bashCount = await page.$eval('#tout', el => {
    const lines = el.innerText.trim().split(/\r?\n/);
    return lines.reverse().find(line => /^\d+$/.test(line.trim()))?.trim() || '';
  });
  if (bashCount !== '4') fail('Chapter 4 grep count should identify four interactive-shell accounts, got ' + bashCount);
  await run('submit ' + bashCount);
  if ((await page.textContent('#pTitle')) === 'Who can log in?') ok('correct Chapter 4 answer cannot bypass the mastery gate');
  else fail('Chapter 4 answer ticket advanced before mastery was proven');
  await page.click('[data-learning-choice="shell"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. The seventh field')) ok('correct Chapter 4 mastery answer explains the login-shell field');
  else fail('correct Chapter 4 answer did not show its explanation');
  await run('submit ' + bashCount);
  if ((await page.textContent('#pTitle')) === 'Lock your evidence') ok('Chapter 4 answer + mastery check complete the mission');
  else fail('Chapter 4 mission did not advance after answer and mastery');


  // Finish Chapter 4 access-control tickets and enter Chapter 5.
  await run('chmod 700 ~/incident');
  await run('sudo grep \'Accepted.*jmorrow\' /var/log/auth.log');
  await run('submit 198.51.100.200');
  await run('sudo grep dana /var/log/auth.log');
  await run('submit 22:16:40');
  await run('sudo chmod a-x ~/incident/quarantine/sync_out.sh');
  await run('sudo chown root:root ~/incident/quarantine/sync_out.sh');
  await run('sudo gpasswd -d jmorrow sudo');
  await run('sudo usermod -s /usr/sbin/nologin jmorrow');
  if ((await page.textContent('#pTitle')) === 'Survey the machine') ok('Chapter 5 starts after the Chapter 4 access lockdown');
  else fail('did not reach the first Chapter 5 mission');

  await run('ps aux');
  await run('submit 2447');
  await run('sudo kill 2447');
  await run('sudo systemctl enable halcyon');
  await run('sudo crontab -l -u halcyon');
  await run('submit /srv/halcyon/export/sync_out.sh');
  await run('sudo crontab -r -u halcyon');
  if ((await page.textContent('#pTitle')) === 'What ports are open?') ok('Chapter 5 reaches the listening-ports mission');
  else fail('Chapter 5 did not reach the listening-ports mission');

  const ch5Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch5Guide.includes(stage)) ok('Chapter 5 learning stage present: ' + stage);
    else fail('Chapter 5 learning stage missing: ' + stage);
  }
  if (ch5Guide.includes('listening TCP sockets') && ch5Guide.includes('0.0.0.0:8080')) ok('Chapter 5 explains socket states, ss flags and the exposed app port');
  else fail('Chapter 5 socket explanation is incomplete');

  await page.click('[data-learning-choice="numeric"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 5 mastery answer is rejected');
  else fail('incorrect Chapter 5 mastery answer was not rejected');

  await run('ss -tln');
  await run('submit 8080');
  if ((await page.textContent('#pTitle')) === 'What ports are open?') ok('correct Chapter 5 terminal answer cannot bypass the mastery gate');
  else fail('Chapter 5 answer ticket advanced before mastery was proven');
  await page.click('[data-learning-choice="listening"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. -l means listening')) ok('correct Chapter 5 mastery answer explains the listening flag');
  else fail('correct Chapter 5 answer did not show its explanation');
  await run('submit 8080');
  if ((await page.textContent('#pTitle')) === 'Who is connected now?') ok('Chapter 5 answer + mastery check complete the mission');
  else fail('Chapter 5 mission did not advance after answer and mastery');

  // Complete the remaining Chapter 5 incident-response tickets and enter Chapter 6.
  await run('ss -tn');
  await run('submit 203.0.113.77');
  if ((await page.textContent('#pTitle')) === 'Is the app healthy?') ok('Chapter 5 identifies the active outside connection');
  else fail('Chapter 5 connection investigation did not complete');
  await run('curl -I http://localhost:8080');
  await run('check');
  if ((await page.textContent('#pTitle')) === "The server's own address") ok('Chapter 5 confirms the app is healthy');
  else fail('Chapter 5 health check did not complete');
  await run('ip addr');
  await run('submit 10.0.4.12');
  if ((await page.textContent('#pTitle')) === 'Block the intruder') ok('Chapter 5 identifies the server network address');
  else fail('Chapter 5 address investigation did not complete');
  await run('sudo ufw deny from 203.0.113.77');
  if ((await page.textContent('#pTitle')) === 'Turn the firewall on') ok('Chapter 5 adds the deny rule');
  else fail('Chapter 5 firewall rule was not accepted');
  await run('sudo ufw enable');
  await run('sudo ufw status');
  if ((await page.textContent('#pTitle')) === 'The new disk') ok('Chapter 6 starts after the firewall is enabled');

  const ch6Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch6Guide.includes(stage)) ok('Chapter 6 learning stage present: ' + stage);
    else fail('Chapter 6 learning stage missing: ' + stage);
  }
  if (ch6Guide.includes('TYPE=part') && ch6Guide.includes('MOUNTPOINTS') && ch6Guide.includes('vdb1')) ok('Chapter 6 explains disks, partitions and mountpoints');
  else fail('Chapter 6 storage explanation is incomplete');

  await page.click('[data-learning-choice="disk"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 6 mastery answer is rejected');
  else fail('incorrect Chapter 6 mastery answer was not rejected');
  await run('lsblk');
  await run('submit vdb1');
  if ((await page.textContent('#pTitle')) === 'The new disk') ok('Chapter 6 terminal answer cannot bypass the mastery gate');
  else fail('Chapter 6 answer ticket advanced before mastery was proven');
  await page.click('[data-learning-choice="partition"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. TYPE=part')) ok('correct Chapter 6 mastery answer explains partition types');
  else fail('correct Chapter 6 answer did not show its explanation');
  await run('submit vdb1');
  if ((await page.textContent('#pTitle')) === 'Make a mountpoint') ok('Chapter 6 answer + mastery check complete the mission');
  else fail('Chapter 6 mission did not advance after answer and mastery');

    await browser.close();
  if (errors.length) { console.error('\nLEARNING FLOW TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nLEARNING FLOW OK.');
})();
