// Workbench topology inspection controls: focus, interface labels and pointer-anchored zoom.
const path=require('path');
const {chromium}=require('playwright');
const URL='file://'+path.join(process.cwd(),'index.html')+'?view=workbench';
(async()=>{
 const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1440,height:960}}); const errors=[];
 page.on('pageerror',e=>errors.push(e.message)); await page.goto(URL,{waitUntil:'load'}); await page.waitForTimeout(150);
 const svg=page.locator('#topo');
 if(await page.locator('#topoFocus').count() && await page.locator('#topoPorts').count()) console.log('  ✓ topology inspection controls are available'); else errors.push('topology inspection controls missing');
 const before=await svg.getAttribute('viewBox'); await page.locator('#topoFocus').click(); const focused=await svg.getAttribute('viewBox');
 if(focused!==before) console.log('  ✓ Focus centers the selected device'); else errors.push('Focus did not change the topology viewport');
 await page.locator('#topoPorts').click();
 if(await page.locator('#topo .edge-label').count()) console.log('  ✓ interface endpoint labels appear on links'); else errors.push('link interface labels were not rendered');
 await page.locator('#topoPorts').click();
 if(!(await page.locator('#topo .edge-label').count())) console.log('  ✓ interface endpoint labels can be hidden'); else errors.push('link interface labels did not hide');
 const box=await svg.boundingBox(); if(box){await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.mouse.wheel(0,-120);await page.waitForTimeout(50);const zoomed=await svg.getAttribute('viewBox');if(zoomed!==focused)console.log('  ✓ wheel zoom updates the topology viewport');else errors.push('wheel zoom did not update the viewport');}
 if(errors.length){console.error('WORKBENCH TOPOLOGY TEST FAILED:',errors.join('; '));process.exit(1);} console.log('WORKBENCH TOPOLOGY TEST OK.'); await browser.close();
})();
