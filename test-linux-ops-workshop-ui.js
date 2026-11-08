const path=require('path');
const {chromium}=require('playwright');
const URL='file://'+path.join(process.cwd(),'index.html');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 const fail=m=>{throw new Error(m);};
 await page.goto(URL,{waitUntil:'load'});await page.waitForTimeout(250);
 if(!(await page.$('#btnOpsRecoveryLab')))fail('Security & recovery button is missing');
 await page.click('#btnOpsRecoveryLab');
 if(!(await page.$('#opsRecoveryDialog[role="dialog"]')))fail('Security & recovery dialog did not open');
 if((await page.locator('.ops-lab-card').count())!==6)fail('Expected six progressive lab exercises');
 await page.click('[data-ops-start]');await page.waitForTimeout(100);
 if(!(await page.locator('#practiceBar').isVisible()))fail('Lab did not start in isolated practice mode');
 const run=async command=>{await page.locator('#tin').fill(command);await page.press('#tin','Enter');await page.waitForTimeout(70);};
 const solve=async command=>{await run(command);await run('check');await page.waitForTimeout(80);};
 await solve("sudo gpasswd -d jmorrow sudo");
 await solve("sudo chmod 600 /srv/halcyon/export/customers.csv");
 await solve("sudo chmod 640 /srv/halcyon/export/sync_out.sh");
 await solve("sudo mkdir -p /mnt/backups && sudo mount /dev/vdb1 /mnt/backups");
 await solve("echo '/dev/vdb1 /mnt/backups ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab");
 await solve("sudo mkdir -p /mnt/restore && sudo tar -czf /mnt/backups/etc-backup.tar.gz /etc && sudo tar -xzf /mnt/backups/etc-backup.tar.gz -C /mnt/restore");
 await page.waitForTimeout(120);
 if(await page.locator('#practiceBar').isVisible())fail('Lab did not complete all six objectives; terminal: '+await page.locator('#tout').innerText());
 await page.click('#btnOpsRecoveryLab');await page.waitForTimeout(50);
 const complete=await page.locator('.ops-lab-card.complete').count();
 if(complete!==6)fail('Expected six persisted demonstrations, got '+complete);
 await page.reload({waitUntil:'load'});await page.waitForTimeout(150);await page.click('#btnOpsRecoveryLab');
 if((await page.locator('.ops-lab-card.complete').count())!==6)fail('Demonstrated progress did not persist after reload');
 await page.click('[data-ops-reset]');if((await page.locator('.ops-lab-card.complete').count())!==0)fail('Reset did not clear lab progress');
 if(errors.length)fail('Browser errors: '+errors.join('; '));
 console.log('Linux security operations and storage recovery workshop tests passed.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

(async()=>{const {chromium}=require('playwright');const path=require('path');const pageBrowser=await chromium.launch();const page=await pageBrowser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.join(process.cwd(),'index.html'),{waitUntil:'load'});await page.waitForTimeout(120);await page.click('#btnCrossTrackCase');if(!(await page.$('#crossTrackCaseDialog')))throw Error('cross-track case dialog missing');await page.click('[data-cross-linux]');await page.waitForTimeout(100);if(!(await page.locator('#practiceBar').isVisible()))throw Error('Linux task did not start');await page.locator('#tin').fill('systemctl status halcyon');await page.press('#tin','Enter');await page.waitForTimeout(40);await page.locator('#tin').fill('sudo systemctl restart halcyon');await page.press('#tin','Enter');await page.waitForTimeout(100);const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lsa-cross-track-web-availability-v1')||'{}'));if(!state.linux)throw Error('Linux task completion not persisted');await page.click('#btnCrossTrackCase');if(!(await page.locator('#crossTrackCaseDialog .ops-lab-card.complete').count()))throw Error('Linux task completion not reflected in hub');if(errors.length)throw Error(errors.join('; '));await pageBrowser.close();console.log('Cross-discipline Linux case test passed.');})().catch(e=>{console.error(e);process.exit(1);});

(async()=>{const {chromium}=require('playwright');const path=require('path');const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.join(process.cwd(),'index.html'),{waitUntil:'load'});await page.waitForTimeout(120);await page.click('#btnCrossTrackCase');await page.click('[data-remote-linux]');await page.waitForTimeout(100);if(!(await page.locator('#practiceBar').isVisible()))throw Error('remote admin Linux task did not start');const run=async cmd=>{await page.locator('#tin').fill(cmd);await page.press('#tin','Enter');await page.waitForTimeout(45);};await run('systemctl status ssh');await run('sudo systemctl restart ssh');await run('systemctl is-active ssh');await run('check');const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lsa-cross-track-web-availability-v1')||'{}'));if(!state.remoteLinux)throw Error('remote admin Linux completion was not persisted');if(errors.length)throw Error(errors.join('; '));await browser.close();console.log('Cross-discipline remote administration Linux test passed.');})().catch(e=>{console.error(e);process.exit(1);});


(async()=>{const {chromium}=require('playwright');const path=require('path');const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.join(process.cwd(),'index.html'),{waitUntil:'load'});await page.waitForTimeout(120);await page.click('#btnCrossTrackCase');await page.click('[data-hardening-linux]');await page.waitForTimeout(100);if(!(await page.locator('#practiceBar').isVisible()))throw Error('SSH hardening Linux task did not start');const run=async cmd=>{await page.locator('#tin').fill(cmd);await page.press('#tin','Enter');await page.waitForTimeout(45);};await run('systemctl status fail2ban');await run('sudo systemctl restart fail2ban');await run('systemctl is-active fail2ban');await run('check');const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lsa-cross-track-web-availability-v1')||'{}'));if(!state.hardeningLinux)throw Error('SSH hardening Linux completion was not persisted');if(errors.length)throw Error(errors.join('; '));await browser.close();console.log('Cross-discipline SSH hardening Linux test passed.');})().catch(e=>{console.error(e);process.exit(1);});


(async()=>{const {chromium}=require('playwright');const path=require('path');const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.join(process.cwd(),'index.html'),{waitUntil:'load'});await page.waitForTimeout(150);await page.click('#btnCrossTrackCase');await page.click('[data-contractor-linux]');await page.waitForTimeout(100);if(!(await page.locator('#practiceBar').isVisible()))throw Error('Contractor containment Linux task did not start');const run=async cmd=>{await page.locator('#tin').fill(cmd);await page.press('#tin','Enter');await page.waitForTimeout(45);};await run('sudo grep -n jmorrow /var/log/auth.log');await run('getent group sudo');await run('sudo gpasswd -d jmorrow sudo');await run('getent group sudo');await run('check');const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lsa-cross-track-web-availability-v1')||'{}'));if(!state.contractorLinux)throw Error('Contractor containment Linux completion was not persisted');if(errors.length)throw Error(errors.join('; '));await browser.close();console.log('Cross-discipline contractor containment Linux test passed.');})().catch(e=>{console.error(e);process.exit(1);});
