'use strict';
const path=require('path');
const {chromium}=require('playwright');
const axe=require('axe-core');
const rootUrl='file://'+path.join(process.cwd(),'index.html');
const networkUrl='file://'+path.join(process.cwd(),'network-trainer','index.html?view=workbench');
(async()=>{
 const browser=await chromium.launch(),failures=[];
 async function scan(page,label){
  await page.addScriptTag({content:axe.source});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}));
  const serious=result.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
  console.log(label+': '+result.passes.length+' rules passed, '+result.violations.length+' violations ('+serious.length+' serious/critical)');
  for(const v of serious){
   console.error('  '+v.impact+' '+v.id+': '+v.help+' ('+v.nodes.length+' nodes)');
   for(const n of v.nodes.slice(0,5))console.error('    '+n.target.join(', ')+' — '+n.failureSummary?.replace(/\s+/g,' ').slice(0,220));
   failures.push(label+': '+v.id);
  }
 }
 try{
  const root=await browser.newPage();await root.goto(rootUrl,{waitUntil:'load'});await root.waitForTimeout(250);
  await scan(root,'Linux Sysadmin initial workspace');await root.close();
  const net=await browser.newPage(),runtimeErrors=[];net.on('pageerror',error=>runtimeErrors.push(error.stack||error.message));net.on('console',message=>{if(message.type()==='error')runtimeErrors.push('console: '+message.text());});await net.goto(networkUrl,{waitUntil:'load'});await net.waitForTimeout(250);
  if(!(await net.locator('#btnSet').count()))throw new Error('Network Trainer did not finish booting; runtime errors: '+(runtimeErrors.join(' | ')||'none captured'));
  await scan(net,'Network Trainer workbench');
  await net.locator('#btnSet').click();await net.waitForTimeout(80);await scan(net,'Network Trainer settings dialog');
  await net.keyboard.press('Escape');await net.locator('#btnSearch').click();await net.waitForTimeout(80);await scan(net,'Network Trainer search palette');
  await net.close();
 }finally{await browser.close();}
 if(failures.length){console.error('Accessibility scan failed: '+failures.join(', '));process.exit(1);}
 console.log('Accessibility axe scans passed: no serious or critical violations.');
})();