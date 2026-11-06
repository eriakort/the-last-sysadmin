// Workbench console evidence capture and export controls.
const path=require('path');const {chromium}=require('playwright');const URL='file://'+path.join(process.cwd(),'index.html')+'?view=workbench';
(async()=>{const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(URL,{waitUntil:'load'});await page.waitForTimeout(120);
const tabs=page.locator('#sessionTabs [data-session-device]');if(!(await tabs.count()))errors.push('no device session available');
await page.locator('#tin').fill('show version');await page.keyboard.press('Enter');await page.waitForTimeout(40);
if(!(await page.locator('#tout').textContent()).includes('show version'))errors.push('console output was not produced');
await page.locator('#termSaveEvidence').click();if(!(await page.locator('#termEvidenceStatus').textContent()).includes('saved'))errors.push('evidence was not acknowledged');
await page.locator('#navJournal').click();await page.waitForTimeout(40);
const journal=await page.locator('#journalView').textContent();if(journal.includes('Captured console transcript')&&journal.includes('command evidence'))console.log('  ✓ console transcript is saved with device context in Engineering Journal');else errors.push('captured evidence missing from journal');
await page.locator('#navWorkbench').click();if(await page.locator('#termDownload').count())console.log('  ✓ copy, save-evidence and download actions are available');else errors.push('evidence controls missing');
if(errors.length){console.error('WORKBENCH EVIDENCE TEST FAILED:',errors.join('; '));process.exit(1);}console.log('WORKBENCH EVIDENCE TEST OK.');await browser.close();})();