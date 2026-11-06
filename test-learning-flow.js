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

  // Complete Chapter 6 storage setup and enter Chapter 7 backup work.
  await run('sudo mkdir -p /mnt/backups');
  await run('sudo mount /dev/vdb1 /mnt/backups');
  await run("echo '/dev/vdb1  /mnt/backups  ext4  defaults  0  2' | sudo tee -a /etc/fstab");
  await run('sudo mount -a');
  if ((await page.textContent('#pTitle')) === 'Back up the config') ok('Chapter 7 starts after the backup disk is mounted persistently');
  else fail('did not reach the first Chapter 7 mission');

  const ch7Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch7Guide.includes(stage)) ok('Chapter 7 learning stage present: ' + stage);
    else fail('Chapter 7 learning stage missing: ' + stage);
  }
  if (ch7Guide.includes('tar') && ch7Guide.includes('gzip') && ch7Guide.includes('-czf')) ok('Chapter 7 explains tar archives and gzip compression');
  else fail('Chapter 7 backup explanation is incomplete');

  await page.click('[data-learning-choice="list"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 7 mastery answer is rejected');
  else fail('incorrect Chapter 7 mastery answer was not rejected');
  await run('sudo tar -czf /mnt/backups/halcyon-config.tar.gz /srv/halcyon/releases/v2.3.1/config');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Back up the config') ok('Chapter 7 backup command cannot bypass the mastery gate');
  else fail('Chapter 7 archive advanced before mastery was proven');
  await page.click('[data-learning-choice="create"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. -c means create')) ok('correct Chapter 7 mastery answer explains tar create flag');
  else fail('correct Chapter 7 answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Look inside the archive') ok('Chapter 7 archive + mastery check complete the mission');
  else fail('Chapter 7 mission did not advance after archive and mastery');

  // Complete Chapter 7's backup workflow and enter Chapter 8 package management.
  await run('tar -tzf /mnt/backups/halcyon-config.tar.gz');
  await run('mkdir ~/restore-test');
  await run('tar -xzf /mnt/backups/halcyon-config.tar.gz -C ~/restore-test');
  await run('find ~/restore-test');
  await run('gzip ~/incident/logs/app.log');
  await run("echo '0 2 * * * tar -czf /mnt/backups/halcyon-config.tar.gz /srv/halcyon/releases/v2.3.1/config' | sudo crontab -u root -");
  if ((await page.textContent('#pTitle')) === 'Refresh the package list') ok('Chapter 8 starts after the Chapter 7 backup and restore workflow');
  else fail('did not reach the first Chapter 8 mission');

  const ch8Guide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (ch8Guide.includes(stage)) ok('Chapter 8 learning stage present: ' + stage);
    else fail('Chapter 8 learning stage missing: ' + stage);
  }
  if (ch8Guide.includes('package index') && ch8Guide.includes('apt update') && ch8Guide.includes('apt upgrade')) ok('Chapter 8 distinguishes refreshing package lists from upgrading software');
  else fail('Chapter 8 package-management explanation is incomplete');

  await page.click('[data-learning-choice="upgrade"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect Chapter 8 mastery answer is rejected');
  else fail('incorrect Chapter 8 mastery answer was not rejected');
  await run('sudo apt update');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Refresh the package list') ok('Chapter 8 package-index update cannot bypass the mastery gate');
  else fail('Chapter 8 mission advanced before mastery was proven');
  await page.click('[data-learning-choice="refresh"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. apt update refreshes')) ok('correct Chapter 8 mastery answer explains package-index refresh');
  else fail('correct Chapter 8 answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Find the tool') ok('Chapter 8 package-index update + mastery check complete the mission');
  else fail('Chapter 8 mission did not advance after objective and mastery');

  const aptSearchGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (aptSearchGuide.includes(stage)) ok('Chapter 9 package-search learning stage present: ' + stage);
    else fail('Chapter 9 package-search learning stage missing: ' + stage);
  }
  if (aptSearchGuide.includes('apt search') && aptSearchGuide.includes('read-only') && aptSearchGuide.includes('apt show')) ok('Chapter 9 explains package search, package details and read-only behaviour');
  else fail('Chapter 9 package-search explanation is incomplete');

  await page.click('[data-learning-choice="install"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect package-search mastery answer is rejected');
  else fail('incorrect package-search mastery answer was not rejected');
  await run('apt search fail2ban');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Find the tool') ok('package search cannot bypass the mastery gate');
  else fail('package-search mission advanced before mastery was proven');
  await page.click('[data-learning-choice="search"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. apt search')) ok('correct package-search mastery answer explains read-only search');
  else fail('correct package-search answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Install fail2ban') ok('package search + mastery check complete the mission');
  else fail('package-search mission did not advance after objective and mastery');


  const aptInstallGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (aptInstallGuide.includes(stage)) ok('Chapter 10 package-install learning stage present: ' + stage);
    else fail('Chapter 10 package-install learning stage missing: ' + stage);
  }
  if (aptInstallGuide.includes('apt install') && aptInstallGuide.includes('sudo') && aptInstallGuide.toLowerCase().includes('not the same as starting it')) ok('Chapter 10 distinguishes package installation from service startup');
  else fail('Chapter 10 installation explanation is incomplete');

  await page.click('[data-learning-choice="start"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect package-install mastery answer is rejected');
  else fail('incorrect package-install mastery answer was not rejected');
  await run('sudo apt install -y fail2ban');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Install fail2ban') ok('package installation cannot bypass the mastery gate');
  else fail('package-install mission advanced before mastery was proven');
  await page.click('[data-learning-choice="install"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. apt install')) ok('correct package-install mastery answer distinguishes installation from service management');
  else fail('correct package-install answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Start it, and keep it started') ok('package installation + mastery check complete the mission');
  else fail('package-install mission did not advance after objective and mastery');

  const serviceGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (serviceGuide.includes(stage)) ok('Chapter 10 service-management learning stage present: ' + stage);
    else fail('Chapter 10 service-management learning stage missing: ' + stage);
  }
  if (serviceGuide.includes('systemctl enable --now') && serviceGuide.includes('start') && serviceGuide.includes('boot')) ok('service guide explains immediate startup and boot enablement');
  else fail('service-management explanation is incomplete');

  await page.click('[data-learning-choice="start"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect service-management mastery answer is rejected');
  else fail('incorrect service-management answer was not rejected');
  await run('sudo systemctl enable --now fail2ban');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Start it, and keep it started') ok('service startup cannot bypass the mastery gate');
  else fail('service mission advanced before mastery was proven');
  await page.click('[data-learning-choice="both"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct.')) ok('correct service-management mastery answer explains both actions');
  else fail('correct service-management answer did not show success feedback');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Confirm the version') ok('service objective + mastery check complete the mission');
  else fail('service mission did not advance after objective and mastery');

  const versionGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (versionGuide.includes(stage)) ok('Chapter 11 package-version learning stage present: ' + stage);
    else fail('Chapter 11 package-version learning stage missing: ' + stage);
  }
  if (versionGuide.includes('dpkg -l') && versionGuide.includes('Version column') && versionGuide.includes('apt search')) ok('Chapter 11 distinguishes installed package records from available package searches');
  else fail('Chapter 11 package-version explanation is incomplete');

  await page.click('[data-learning-choice="status"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect package-version mastery answer is rejected');
  else fail('incorrect package-version mastery answer was not rejected');
  await run('dpkg -l fail2ban');
  await run('submit 1.0.2-3');
  if ((await page.textContent('#pTitle')) === 'Confirm the version') ok('package-version answer cannot bypass the mastery gate');
  else fail('package-version ticket advanced before mastery was proven');
  await page.click('[data-learning-choice="version"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. Read the Version column')) ok('correct package-version mastery answer identifies the Version column');
  else fail('correct package-version answer did not show its explanation');
  await run('submit 1.0.2-3');
  if ((await page.textContent('#pTitle')) === 'Audit the open ports') ok('package-version answer + mastery check complete the mission');
  else fail('package-version mission did not advance after objective and mastery');


  const auditGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (auditGuide.includes(stage)) ok('Chapter 12 port-audit learning stage present: ' + stage);
    else fail('Chapter 12 port-audit learning stage missing: ' + stage);
  }
  if (auditGuide.includes('ss -tlnp') && auditGuide.includes('LISTEN') && auditGuide.includes('127.0.0.1')) ok('Chapter 12 explains listening sockets, process ownership and loopback exposure');
  else fail('Chapter 12 port-audit explanation is incomplete');

  await page.click('[data-learning-choice="all"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect port-audit mastery answer is rejected');
  else fail('incorrect port-audit mastery answer was not rejected');
  await run('sudo ss -tlnp');
  await run('submit 3');
  if ((await page.textContent('#pTitle')) === 'Audit the open ports') ok('port count cannot bypass the mastery gate');
  else fail('port-audit ticket advanced before mastery was proven');
  await page.click('[data-learning-choice="listening"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. -l selects listening sockets')) ok('correct port-audit mastery answer explains the listening flag');
  else fail('correct port-audit answer did not show its explanation');
  await run('submit 3');
  if ((await page.textContent('#pTitle')) === 'No root login over SSH') ok('port inventory + mastery check complete the mission');
  else fail('port-audit mission did not advance after objective and mastery');

  
  const sshRootGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (sshRootGuide.includes(stage)) ok('Chapter 13 SSH root-login learning stage present: ' + stage);
    else fail('Chapter 13 SSH root-login learning stage missing: ' + stage);
  }
  if (sshRootGuide.includes('PermitRootLogin no') && sshRootGuide.includes('sshd_config') && sshRootGuide.includes('sudo')) ok('Chapter 13 explains the SSH root-login setting and protected config file');
  else fail('Chapter 13 SSH root-login explanation is incomplete');

  await page.click('[data-learning-choice="yes"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect SSH root-login mastery answer is rejected');
  else fail('incorrect SSH root-login mastery answer was not rejected');
  await run("sudo sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config");
  await run('check');
  if ((await page.textContent('#pTitle')) === 'No root login over SSH') ok('SSH root-login config cannot bypass the mastery gate');
  else fail('SSH root-login mission advanced before mastery was proven');
  await page.click('[data-learning-choice="no"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. PermitRootLogin no')) ok('correct SSH root-login mastery answer explains the security outcome');
  else fail('correct SSH root-login answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Keys only, no passwords') ok('SSH root-login setting + mastery check complete the mission');
  else fail('SSH root-login mission did not advance after objective and mastery');

  const sshPasswordGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (sshPasswordGuide.includes(stage)) ok('Chapter 13 SSH password-authentication learning stage present: ' + stage);
    else fail('Chapter 13 SSH password-authentication learning stage missing: ' + stage);
  }
  if (sshPasswordGuide.includes('PasswordAuthentication no') && sshPasswordGuide.includes('public-key') && sshPasswordGuide.includes('sshd_config')) ok('SSH guide distinguishes password authentication from key-based access');
  else fail('SSH password-authentication explanation is incomplete');

  await page.click('[data-learning-choice="yes"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect SSH password-authentication mastery answer is rejected');
  else fail('incorrect SSH password-authentication answer was not rejected');
  await run("sudo sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config");
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Keys only, no passwords') ok('SSH password-authentication config cannot bypass the mastery gate');
  else fail('SSH password-authentication mission advanced before mastery was proven');
  await page.click('[data-learning-choice="no"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. PasswordAuthentication no')) ok('correct SSH password-authentication mastery answer explains key-based access');
  else fail('correct SSH password-authentication answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Apply the changes') ok('SSH password-authentication setting + mastery check complete the mission');
  else fail('SSH password-authentication mission did not advance after objective and mastery');

  const sshRestartGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (sshRestartGuide.includes(stage)) ok('Chapter 13 SSH restart learning stage present: ' + stage);
    else fail('Chapter 13 SSH restart learning stage missing: ' + stage);
  }
  if (sshRestartGuide.includes('systemctl restart ssh') && sshRestartGuide.includes('systemctl status ssh') && sshRestartGuide.includes('active')) ok('SSH guide explains restart and service verification');
  else fail('SSH restart learning explanation is incomplete');

  await page.click('[data-learning-choice="status"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect SSH restart mastery answer is rejected');
  else fail('incorrect SSH restart mastery answer was not rejected');
  await run('sudo systemctl restart ssh');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Apply the changes') ok('SSH restart objective cannot bypass the mastery gate');
  else fail('SSH restart mission advanced before mastery was proven');
  await page.click('[data-learning-choice="restart"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. Restarting ssh')) ok('correct SSH restart mastery answer explains configuration application');
  else fail('correct SSH restart mastery answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Leave a handover note') ok('SSH restart + mastery check complete the mission');
  else fail('SSH restart mission did not advance after objective and mastery');

  const handoverGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (handoverGuide.includes(stage)) ok('Chapter 13 handover learning stage present: ' + stage);
    else fail('Chapter 13 handover learning stage missing: ' + stage);
  }
  if (handoverGuide.includes('HANDOVER.md') && handoverGuide.includes('>>') && handoverGuide.includes('credentials')) ok('handover guide covers file redirection, useful records and secret handling');
  else fail('handover learning explanation is incomplete');

  await page.click('[data-learning-choice="replace"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect handover mastery answer is rejected');
  else fail('incorrect handover mastery answer was not rejected');
  await run('echo "# Handover - SSH hardened; service active after restart." > ~/incident/HANDOVER.md');
  await run('cat ~/incident/HANDOVER.md');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Leave a handover note') ok('handover note cannot bypass the mastery gate');
  else fail('handover mission advanced before mastery was proven');
  await page.click('[data-learning-choice="append"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. >> appends text')) ok('correct handover mastery answer explains append redirection');
  else fail('correct handover mastery answer did not show its explanation');
  await run('echo "PermitRootLogin no; PasswordAuthentication no; SSH verified active." >> ~/incident/HANDOVER.md');
  await run('cat ~/incident/HANDOVER.md');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Your first script') ok('handover note + mastery check complete Chapter 13');
  else fail('handover mission did not advance after objective and mastery');

  const firstScriptGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (firstScriptGuide.includes(stage)) ok('first-script learning stage present: ' + stage);
    else fail('first-script learning stage missing: ' + stage);
  }
  if (firstScriptGuide.includes('#!/bin/bash') && firstScriptGuide.includes('shebang') && firstScriptGuide.includes('printf')) ok('first-script guide explains shebang and creating a multi-line script');
  else fail('first-script learning explanation is incomplete');

  await page.click('[data-learning-choice="execute"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect first-script mastery answer is rejected');
  else fail('incorrect first-script mastery answer was not rejected');
  await run("printf '#!/bin/bash\\necho \"halcyon-web01 status check\"\\n' > ~/status.sh");
  await run('cat ~/status.sh');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Your first script') ok('script creation cannot bypass the mastery gate');
  else fail('first-script mission advanced before mastery was proven');
  await page.click('[data-learning-choice="interpreter"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. The shebang')) ok('correct first-script mastery answer explains interpreter selection');
  else fail('correct first-script mastery answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Make it executable') ok('first script + mastery check complete the mission');
  else fail('first-script mission did not advance after objective and mastery');

  const executeGuide = await page.textContent('#learningPath').catch(() => '');
  for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
    if (executeGuide.includes(stage)) ok('script-execution learning stage present: ' + stage);
    else fail('script-execution learning stage missing: ' + stage);
  }
  if (executeGuide.includes('chmod +x') && executeGuide.includes('./status.sh') && executeGuide.includes('execute permission')) ok('script-execution guide explains permission bits and direct execution');
  else fail('script-execution learning explanation is incomplete');

  await page.click('[data-learning-choice="chown"]');
  if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok('incorrect script-execution mastery answer is rejected');
  else fail('incorrect script-execution mastery answer was not rejected');
  await run('ls -l ~/status.sh');
  await run('chmod +x ~/status.sh');
  await run('cd ~');
  await run('./status.sh');
  if ((await page.textContent('#pTitle')) === 'Make it executable') ok('script execution cannot bypass the mastery gate');
  else fail('script-execution mission advanced before mastery was proven');
  await page.click('[data-learning-choice="chmod"]');
  if ((await page.textContent('#learningFeedback')).includes('Correct. chmod +x adds execute permission')) ok('correct script-execution mastery answer explains chmod');
  else fail('correct script-execution mastery answer did not show its explanation');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Script the backup') ok('execute permission + direct script run + mastery complete the mission');
  else fail('script-execution mission did not advance after objective and mastery');

    
  // Medium batch: scripting and systemd unit authoring (five missions).
  const checkLearningStages = async (title, wrong, markers) => {
    if ((await page.textContent('#pTitle')) !== title) fail('expected mission: ' + title);
    const text = await page.textContent('#learningPath').catch(() => '');
    for (const stage of ['Learn', 'See it in action', 'Investigate', 'Practise', 'Prove your understanding', 'Review']) {
      if (text.includes(stage)) ok(title + ' learning stage present: ' + stage);
      else fail(title + ' learning stage missing: ' + stage);
    }
    for (const marker of markers) {
      if (text.includes(marker)) ok(title + ' explains ' + marker);
      else fail(title + ' explanation missing ' + marker);
    }
    await page.click('[data-learning-choice="' + wrong + '"]');
    if ((await page.textContent('#learningFeedback')).includes('Not quite')) ok(title + ' rejects incorrect mastery answer');
    else fail(title + ' accepted an incorrect mastery answer');
  };
  const proveMission = async (title, nextTitle, correct, commands, feedback) => {
    for (const command of commands) await run(command);
    await run('check');
    if ((await page.textContent('#pTitle')) === title) ok(title + ' objective cannot bypass mastery');
    else fail(title + ' advanced before mastery was proven');
    await page.click('[data-learning-choice="' + correct + '"]');
    if ((await page.textContent('#learningFeedback')).includes(feedback)) ok(title + ' correct mastery answer explains the concept');
    else fail(title + ' correct mastery feedback missing');
    await run('check');
    if ((await page.textContent('#pTitle')) === nextTitle) ok(title + ' objective + mastery complete the mission');
    else fail(title + ' did not advance to ' + nextTitle);
  };

  await checkLearningStages('Script the backup', 'spaces', ['DEST', 'SRC', 'no spaces around']);
  await proveMission('Script the backup', 'Loop over the releases', 'equals', [
    "printf '#!/bin/bash\\nDEST=/mnt/backups/nightly.tar.gz\\nSRC=/srv/halcyon/releases/v2.3.1/config\\ntar -czf \"$DEST\" \"$SRC\"\\necho \"backed up to $DEST\"\\n' > ~/backup.sh",
    'cat ~/backup.sh',
    'sudo bash ~/backup.sh'
  ], 'Correct. Bash assignments use NAME=value');

  await checkLearningStages('Loop over the releases', 'end', ['for loop', 'wildcard', 'done']);
  await proveMission('Loop over the releases', 'Add a safety check', 'done', [
    "printf '#!/bin/bash\\nfor d in /srv/halcyon/releases/*; do\\n  echo \"release: $d\"\\ndone\\n' > ~/releases.sh",
    'cat ~/releases.sh',
    'bash ~/releases.sh'
  ], 'Correct. done marks the end');

  await checkLearningStages('Add a safety check', 'file', ['$1', '[ -d', 'if', 'else', 'fi']);
  await proveMission('Add a safety check', 'Write a service unit', 'directory', [
    "printf '#!/bin/bash\\nif [ -d \"$1\" ]; then\\n  echo \"target ok: $1\"\\nelse\\n  echo \"missing: $1\"\\nfi\\n' > ~/check.sh",
    'cat ~/check.sh',
    'bash ~/check.sh /srv/halcyon'
  ], 'Correct. -d tests whether the path');

  await checkLearningStages('Write a service unit', 'oncalendar', ['[Service]', 'Type=oneshot', 'ExecStart']);
  await proveMission('Write a service unit', 'Write a timer unit', 'execstart', [
    "printf '[Unit]\\nDescription=Halcyon nightly backup\\n[Service]\\nType=oneshot\\nExecStart=/home/rookie/backup.sh\\n' | sudo tee /etc/systemd/system/halcyon-backup.service"
  ], 'Correct. ExecStart identifies the executable command');

  await checkLearningStages('Write a timer unit', 'execstart', ['[Timer]', 'OnCalendar=daily', 'Persistent=true', 'WantedBy=timers.target']);
  await proveMission('Write a timer unit', 'Tell systemd to look', 'oncalendar', [
    "printf '[Unit]\\nDescription=Run Halcyon backup daily\\n[Timer]\\nOnCalendar=daily\\nPersistent=true\\n[Install]\\nWantedBy=timers.target\\n' | sudo tee /etc/systemd/system/halcyon-backup.timer"
  ], 'Correct. OnCalendar defines when the timer');


  // Medium batch 2: finish systemd timer migration and introduce access-log analysis.
  await checkLearningStages('Tell systemd to look', 'restart', ['daemon-reload', 'manager state', 'does not start']);
  await proveMission('Tell systemd to look', 'Start the timer', 'reload', [
    'sudo systemctl daemon-reload',
    'systemctl list-timers'
  ], 'Correct. daemon-reload makes systemd reread unit files');

  await checkLearningStages('Start the timer', 'enable', ['active', 'enabled', 'list-timers']);
  await proveMission('Start the timer', 'Retire the old cron job', 'enable-now', [
    'sudo systemctl enable --now halcyon-backup.timer',
    'systemctl list-timers'
  ], 'Correct. enable --now configures startup at boot');

  await checkLearningStages('Retire the old cron job', 'list', ['crontab -l', 'crontab -r', 'twice']);
  await proveMission('Retire the old cron job', 'What are the servers saying?', 'remove', [
    'sudo crontab -l -u root',
    'sudo crontab -r -u root',
    'sudo crontab -l -u root'
  ], 'Correct. -r removes the selected user');

  const proveAnswerMission = async (title, nextTitle, correct, commands, answer, feedback) => {
    for (const command of commands) await run(command);
    await run('submit ' + answer);
    if ((await page.textContent('#pTitle')) === title) ok(title + ' answer cannot bypass mastery');
    else fail(title + ' advanced before mastery was proven');
    await page.click('[data-learning-choice="' + correct + '"]');
    if ((await page.textContent('#learningFeedback')).includes(feedback)) ok(title + ' correct mastery answer explains the log format');
    else fail(title + ' correct mastery feedback missing');
    await run('submit ' + answer);
    if ((await page.textContent('#pTitle')) === nextTitle) ok(title + ' answer + mastery complete the mission');
    else fail(title + ' did not advance to ' + nextTitle);
  };

  await checkLearningStages('What are the servers saying?', 'field7', ['field 9', 'uniq -c', 'sort -rn', 'HTTP status']);
  await proveAnswerMission('What are the servers saying?', 'The busiest endpoint', 'field9', [
    "awk '{print $9}' /var/log/halcyon/access.log | sort | uniq -c | sort -rn"
  ], '200', 'Correct. The HTTP status code is the ninth field');

  await checkLearningStages('The busiest endpoint', 'field9', ['field 7', '/export/customers.csv', 'head', 'sort -rn']);
  await proveAnswerMission('The busiest endpoint', 'How many visitors?', 'field7', [
    "awk '{print $7}' /var/log/halcyon/access.log | grep -v '/export/customers.csv' | sort | uniq -c | sort -rn | head"
  ], '/api/shipments', 'Correct. Field 7 contains the requested path');

  // Finish Chapter 12 log analysis and rotation before entering the container chapter.
  await run("awk '{print $1}' /var/log/halcyon/access.log | sort -u | wc -l");
  await run('submit 7');
  if ((await page.textContent('#pTitle')) !== 'Stop the logs eating the disk') fail('did not reach logrotate configuration mission');
  await run("printf '/var/log/halcyon/*.log {\\n    daily\\n    rotate 7\\n    missingok\\n    notifempty\\n}\\n' | sudo tee /etc/logrotate.d/halcyon");
  await run('check');
  if ((await page.textContent('#pTitle')) !== 'Rotate them now') fail('logrotate configuration mission did not complete');
  await run('sudo logrotate -f /etc/logrotate.d/halcyon');
  await run('check');
  if ((await page.textContent('#pTitle')) !== 'The new release is an image') fail('did not reach Chapter 13 container missions');

  await checkLearningStages('The new release is an image', 'id', ['docker images', 'TAG', 'image', 'container']);
  await run('docker images');
  await run('submit 2.4.0');
  if ((await page.textContent('#pTitle')) !== 'The new release is an image') fail('image tag answer bypassed mastery');
  await page.click('[data-learning-choice="tag"]');
  if (!(await page.textContent('#learningFeedback')).includes('Correct. The TAG column')) fail('image tag mastery feedback missing');
  await run('submit 2.4.0');
  if ((await page.textContent('#pTitle')) !== 'Start the container') fail('image inventory + mastery did not complete mission');

  await checkLearningStages('Start the container', 'publish', ['-d', '--name', '-p', '8080:8080']);
  await proveMission('Start the container', 'Check what is running', 'detached', [
    'docker run -d --name halcyon-web -p 8080:8080 halcyon/web:2.4.0'
  ], 'Correct. -d runs the container detached');

  await checkLearningStages('Check what is running', 'container', ['docker ps', 'PORTS', 'before the arrow']);
  await proveAnswerMission('Check what is running', 'Read its logs', 'host', [
    'docker ps'
  ], '8080', 'Correct. The host-side port is the number before the arrow');

  await checkLearningStages('Read its logs', 'images', ['docker logs', 'standard output', 'docker logs -f']);
  await proveMission('Read its logs', 'Retire the old container', 'logs', [
    'docker logs halcyon-web'
  ], 'Correct. docker logs displays the container');

  await checkLearningStages('Retire the old container', 'image', ['docker stop', 'docker rm', 'docker ps -a']);
  await proveMission('Retire the old container', 'What changed?', 'stop', [
    'docker stop halcyon-web-old',
    'docker rm halcyon-web-old'
  ], 'Correct. Stop the container first');

  // Chapter 14: review, record and deploy the release change.
  await checkLearningStages('What changed?', 'commit', ['git status', 'staged', 'unstaged', 'untracked']);
  await proveAnswerMission('What changed?', 'The history', 'branch', [
    'cd ~/halcyon-app',
    'git status'
  ], 'main', 'Correct. The first line says On branch');

  await checkLearningStages('The history', 'status', ['git log', '--oneline', 'newest first']);
  await proveAnswerMission('The history', 'Review the change', 'oneline', [
    'git log --oneline'
  ], '3', 'Correct. --oneline condenses each commit');

  await checkLearningStages('Review the change', 'status', ['git diff', 'unstaged', 'removed', 'added']);
  await proveMission('Review the change', 'Commit the change', 'diff', [
    'git diff'
  ], 'Correct. git diff shows the line-by-line changes');

  await checkLearningStages('Commit the change', 'diff', ['git add -A', 'git commit -m', 'staged', 'snapshot']);
  await proveMission('Commit the change', 'Cut over to 2.4.0', 'commit', [
    'git add -A',
    'git commit -m "Raise worker count for 2.4.0"',
    'git log --oneline'
  ], 'Correct. git commit -m records the staged snapshot');

  await checkLearningStages('Cut over to 2.4.0', 'log', ['CURRENT', 'restart', 'release pointer', 'v2.4.0']);
  await proveMission('Cut over to 2.4.0', 'The pager goes off', 'restart', [
    'echo v2.4.0 > /srv/halcyon/CURRENT',
    'sudo systemctl restart halcyon',
    'cat /srv/halcyon/CURRENT',
    'systemctl status halcyon'
  ], 'Correct. Restarting Halcyon makes the service load the release');


  // Chapter 16: a complete service-outage investigation and recovery.
  await checkLearningStages('The pager goes off', 'enabled', ['systemctl status halcyon', 'Active:', 'enabled']);
  await proveAnswerMission('The pager goes off', 'Why did it die?', 'inactive', [
    'systemctl status halcyon'
  ], 'inactive', 'Correct. inactive means the service is not currently running');

  await checkLearningStages('Why did it die?', 'workers', ['journalctl -u halcyon', 'FATAL', 'count']);
  await proveAnswerMission('Why did it die?', 'Confirm it in the config', 'count', [
    'journalctl -u halcyon'
  ], 'count', 'Correct. The worker count is zero');

  await checkLearningStages('Confirm it in the config', '4', ['grep count', 'count = 0', 'verify']);
  await proveAnswerMission('Confirm it in the config', 'Fix the config', '0', [
    'grep count /srv/halcyon/releases/v2.4.0/config/app.conf'
  ], '0', 'Correct. count = 0 matches the fatal error');

  await checkLearningStages('Fix the config', 'extended', ['sed -i', 'in place', 'grep count']);
  await proveMission('Fix the config', 'Bring it back', 'inplace', [
    "sed -i 's/count = 0/count = 4/' /srv/halcyon/releases/v2.4.0/config/app.conf",
    'grep count /srv/halcyon/releases/v2.4.0/config/app.conf'
  ], 'Correct. -i writes the substitution back');

  await checkLearningStages('Bring it back', 'journal', ['systemctl restart halcyon', 'systemctl is-active', 'active']);
  await proveMission('Bring it back', 'Confirm it is serving', 'restart', [
    'sudo systemctl restart halcyon',
    'systemctl is-active halcyon'
  ], 'Correct. Restarting Halcyon makes the process load');

  await checkLearningStages('Confirm it is serving', '22', ['ss -tlnp', 'LISTEN', '8080']);
  await proveAnswerMission('Confirm it is serving', 'Everything is slow', '8080', [
    'sudo ss -tlnp'
  ], '8080', 'Correct. Halcyon is listening on TCP port 8080');


  // Chapter 17: diagnose load, identify the CPU hog, then manage resource pressure.
  await checkLearningStages('Everything is slow', 'five', ['load average', '1, 5 and 15 minutes', 'four CPU cores']);
  await proveMission('Everything is slow', 'Find the hog', 'three', [
    'uptime'
  ], 'Correct. uptime reports 1-, 5- and 15-minute load averages');

  await checkLearningStages('Find the hog', 'user', ['top', '%CPU', 'PID']);
  await proveAnswerMission('Find the hog', 'Stop the batch job', 'pid', [
    'top'
  ], '3301', 'Correct. PID is the process identifier');

  await checkLearningStages('Stop the batch job', 'kill9', ['SIGTERM', 'sudo', 'cleanly']);
  await proveMission('Stop the batch job', 'Check the memory', 'term', [
    'sudo kill 3301'
  ], 'Correct. The default is SIGTERM');

  await checkLearningStages('Check the memory', 'free', ['free -h', 'available', 'cache']);
  await proveMission('Check the memory', 'Tame the workers', 'available', [
    'free -h'
  ], 'Correct. available estimates memory');

  await checkLearningStages('Tame the workers', 'lower', ['renice', 'higher niceness', 'yield']);
  await proveMission('Tame the workers', 'Onboard a new admin', 'higher', [
    'sudo renice -n 10 -p 812'
  ], 'Correct. A higher niceness makes the process less favored');


  // Chapter 17: onboard an administrator and audit account access.
  await checkLearningStages('Onboard a new admin', 'mail', ['useradd -m', 'login shell', 'getent passwd']);
  await proveMission('Onboard a new admin', 'Give Sam admin rights', 'home', [
    'sudo useradd -m -s /bin/bash sam',
    'getent passwd sam'
  ], 'Correct. -m creates the home directory');

  await checkLearningStages('Give Sam admin rights', 'replace', ['usermod -aG', 'sudo group', 'preserves']);
  await proveMission('Give Sam admin rights', 'Check the account', 'append', [
    'sudo usermod -aG sudo sam',
    'groups sam'
  ], 'Correct. -a appends the group');

  await checkLearningStages('Check the account', 'gid', ['id sam', 'uid=', 'groups=']);
  await proveAnswerMission('Check the account', 'Set up key-based login', 'uid', [
    'id sam'
  ], '1003', 'Correct. uid= is followed by the numeric user ID');

  await checkLearningStages('Set up key-based login', 'private', ['ssh-keygen -t ed25519', '.pub', 'private key']);
  await proveMission('Set up key-based login', 'Audit who can log in', 'public', [
    'ssh-keygen -t ed25519 -C "halcyon admin"'
  ], 'Correct. Install the public .pub key and keep the private key secret');

  await checkLearningStages('Audit who can log in', 'start', ['grep -c', '/bin/bash$', 'nologin']);
  await proveAnswerMission('Audit who can log in', 'Close a departed account', 'end', [
    "grep -c '/bin/bash$' /etc/passwd"
  ], '4', 'Correct. $ anchors the match to the end of the line');


  // Chapter 19: prove the backup can be restored and the schedule remains armed.
  await run('sudo usermod -s /usr/sbin/nologin dana');
  await run('check');
  if ((await page.textContent('#pTitle')) !== 'Disaster-recovery drill') fail('account lock did not advance into the backup recovery chapter');

  await checkLearningStages('Disaster-recovery drill', 'timer', ['known-good backup', 'archive', 'verify']);
  await proveMission('Disaster-recovery drill', 'Fingerprint the original', 'archive', [
    'sudo bash ~/backup.sh',
    'ls -lh /mnt/backups/nightly.tar.gz'
  ], 'Correct. Verify the archive exists');

  await checkLearningStages('Fingerprint the original', 'owner', ['SHA-256', 'digest', 'checksum']);
  await proveMission('Fingerprint the original', 'Restore to a safe place', 'digest', [
    'sha256sum /srv/halcyon/releases/v2.3.1/config/app.conf'
  ], 'Correct. A checksum fingerprints');

  await checkLearningStages('Restore to a safe place', 'fast', ['tar -xzf', '-C', 'scratch directory']);
  await proveMission('Restore to a safe place', 'Prove it matches', 'safe', [
    'mkdir ~/dr-test',
    'tar -xzf /mnt/backups/nightly.tar.gz -C ~/dr-test',
    'find ~/dr-test'
  ], 'Correct. A scratch restore lets you verify');

  await checkLearningStages('Prove it matches', 'missing', ['diff', 'no output', 'identical']);
  await proveMission('Prove it matches', 'Confirm it keeps happening', 'same', [
    'diff /srv/halcyon/releases/v2.3.1/config/app.conf ~/dr-test/srv/halcyon/releases/v2.3.1/config/app.conf'
  ], 'Correct. No diff output means');

  await checkLearningStages('Confirm it keeps happening', 'status', ['systemctl list-timers', 'next trigger', 'UNIT']);
  await proveAnswerMission('Confirm it keeps happening', 'Final review: the filesystem', 'timers', [
    'systemctl list-timers'
  ], 'halcyon-backup.timer', 'Correct. list-timers shows scheduled units');


  // Medium batch: six graduation and handover missions.
  await checkLearningStages('Final review: the filesystem', 'recursive', ['-maxdepth 1', '-type f', 'wc -l']);
  await proveAnswerMission('Final review: the filesystem', 'Final review: the evidence', 'depth', [
    'find /etc -maxdepth 1 -type f | wc -l'
  ], '9', 'Correct. -maxdepth 1');

  await checkLearningStages('Final review: the evidence', 'bytes', ['wc -l', 'line count', 'evidence.txt']);
  await proveAnswerMission('Final review: the evidence', 'Final review: access', 'lines', [
    'wc -l ~/incident/notes/evidence.txt'
  ], '64', 'Correct. The -l option');

  await checkLearningStages('Final review: access', 'uid', ['getent passwd', 'seventh field', 'nologin']);
  await proveAnswerMission('Final review: access', 'Final review: the firewall', 'shell', [
    'getent passwd jmorrow'
  ], '/usr/sbin/nologin', 'Correct. The seventh field');

  await checkLearningStages('Final review: the firewall', 'allow', ['sudo ufw status', 'DENY', 'source address']);
  await proveAnswerMission('Final review: the firewall', 'Final review: automation', 'deny', [
    'sudo ufw status'
  ], '203.0.113.77', 'Correct. DENY');

  await checkLearningStages('Final review: automation', 'readme', ['CURRENT', 'systemctl list-timers', 'live release']);
  await proveAnswerMission('Final review: automation', 'Sign the handover', 'current', [
    'cat /srv/halcyon/CURRENT',
    'systemctl list-timers'
  ], 'v2.4.0', 'Correct. CURRENT');

  await checkLearningStages('Sign the handover', 'secrets', ['ALL_CLEAR.md', 'verified status', 'credentials']);
  await proveMission('Sign the handover', 'Beyond simple grep', 'verified', [
    'echo "# All clear - halcyon-web01 stable on v2.4.0, backups scheduled, firewall reviewed." > ~/incident/ALL_CLEAR.md'
  ], 'Correct. Share verified operational facts');


  // Chapter 21: turn text-processing tools into precise, readable answers.
  await checkLearningStages('Beyond simple grep', 'end', ['grep -cE', 'escaped dots', 'beginning of the line']);
  await proveAnswerMission('Beyond simple grep', 'Make it readable', 'start', [
    "grep -cE '^203\\.0\\.113\\.' /var/log/halcyon/access.log.1"
  ], '93', 'Correct. ^ anchors the match');

  await checkLearningStages('Make it readable', 'f', ['cut -d:', 'field selection', 'column -t']);
  await proveMission('Make it readable', 'Fields and conditions', 'd', [
    'cut -d: -f1,7 /etc/passwd | column -t -s:'
  ], 'Correct. -d: sets the colon delimiter');

  await checkLearningStages('Fields and conditions', 'one', ['awk -F:', '$3', 'UID']);
  await proveAnswerMission('Fields and conditions', 'Capture and rearrange', 'three', [
    "awk -F: '$3 >= 1000 {print $1}' /etc/passwd | sort"
  ], 'dana', 'Correct. The third colon-separated field');

  await checkLearningStages('Capture and rearrange', 'line', ['sed -E', 'capture groups', '\\1', '\\3']);
  await proveAnswerMission('Capture and rearrange', 'Number the script', 'third', [
    "echo 2026-10-28 | sed -E 's|(....)-(..)-(..)|\\3/\\2/\\1|'"
  ], '28/10/2026', 'Correct. \\3 inserts the text captured');

  await checkLearningStages('Number the script', 'yes', ['nl', 'line numbers', 'does not modify']);
  await proveMission('Number the script', 'Names to addresses', 'no', [
    'nl ~/backup.sh'
  ], 'Correct. nl prints numbered output');



  // Complete the existing DNS/network diagnostics chapter before entering kernel work.
  await run('dig +short halcyon-db01');
  await run('submit 10.0.4.20');
  if ((await page.textContent('#pTitle')) === 'Addresses to names') ok('DNS lookup advances to reverse lookup');
  else fail('DNS lookup did not advance');
  await run('host 10.0.4.20');
  await run('submit halcyon-db01');
  if ((await page.textContent('#pTitle')) === 'Is the port open?') ok('reverse lookup advances to port check');
  else fail('reverse lookup did not advance');
  await run('nc -zv 10.0.4.20 5432');
  await run('submit succeeded');
  if ((await page.textContent('#pTitle')) === 'Add a name by hand') ok('port check advances to local name mapping');
  else fail('port check did not advance');
  await run('echo "10.0.4.30  halcyon-cache01" | sudo tee -a /etc/hosts');
  await run('check');
  if ((await page.textContent('#pTitle')) === 'Resolve the way the system does') ok('local hosts entry advances to resolver check');
  else fail('local hosts entry did not advance');
  await run('getent hosts halcyon-cache01');
  await run('submit 10.0.4.30');
  if ((await page.textContent('#pTitle')) === 'Which kernel?') ok('DNS and network diagnostics complete before kernel chapter');
  else fail('did not reach the first kernel fundamentals mission');

  // Chapter 22: understand, inspect, change, persist, and diagnose kernel settings.
  await checkLearningStages('Which kernel?', 'a', ['uname -r', 'kernel release', 'compatibility']);
  await proveAnswerMission('Which kernel?', 'Read a kernel setting', 'r', [
    'uname -r'
  ], '6.8.0-45-generic', 'Correct. -r reports the running kernel release');

  await checkLearningStages('Read a kernel setting', 'write', ['sysctl', 'net.ipv4.ip_forward', 'current value']);
  await proveAnswerMission('Read a kernel setting', 'Change it live', 'read', [
    'sysctl net.ipv4.ip_forward'
  ], '0', 'Correct. sysctl displays the current value');

  await checkLearningStages('Change it live', 'yes', ['sysctl -w', 'runtime', 'temporary']);
  await proveMission('Change it live', 'Make it stick', 'no', [
    'sudo sysctl -w net.ipv4.ip_forward=1'
  ], 'Correct. -w changes the live value');

  await checkLearningStages('Make it stick', 'hosts', ['/etc/sysctl.conf', 'KEY = VALUE', 'persistent']);
  await proveMission('Make it stick', 'What the kernel saw', 'sysctl', [
    'echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.conf'
  ], 'Correct. /etc/sysctl.conf stores persistent kernel parameters');

  await checkLearningStages('What the kernel saw', 'journal', ['dmesg', 'kernel ring buffer', 'hardware']);
  await proveMission('What the kernel saw', 'Make a shortcut', 'dmesg', [
    'dmesg | tail'
  ], 'Correct. dmesg reads messages from the kernel ring buffer');

  await browser.close();
  if (errors.length) { console.error('\nLEARNING FLOW TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nLEARNING FLOW OK.');
})();
