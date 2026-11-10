'use strict';
const path=require('path');
const fs=require('fs');
const http=require('http');
const {chromium,firefox,webkit}=require('playwright');
const browserName=process.env.PLAYWRIGHT_BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[browserName];
if(!browserType)throw new Error('Unsupported PLAYWRIGHT_BROWSER: '+browserName);
const {spawnSync}=require('child_process');
const axe=require('axe-core');
const build=spawnSync(process.execPath,[path.join(process.cwd(),'network-trainer','build-ui.js')],{encoding:'utf8'});
if(build.status!==0)throw new Error('Network Trainer build failed before accessibility scan: '+(build.stderr||build.stdout));
const projectRoot=path.resolve(process.cwd());
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
 const target=path.resolve(projectRoot,'.'+pathname);
 if(target!==projectRoot&&!target.startsWith(projectRoot+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
 fs.readFile(target,(error,data)=>{
  if(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Not found');return;}
  res.writeHead(200,{'content-type':contentTypes[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});
  res.end(data);
 });
});
(async()=>{
 const browser=await browserType.launch(),failures=[];
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const baseUrl='http://127.0.0.1:'+server.address().port;
 const rootUrl=baseUrl+'/index.html';
 const networkUrl=baseUrl+'/network-trainer/index.html?view=workbench';
 async function install(page){await page.addScriptTag({content:axe.source});}
 async function scan(page,label){
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}));
  const serious=result.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
  console.log(label+': '+result.passes.length+' rules passed, '+result.violations.length+' violations ('+serious.length+' serious/critical)');
  for(const v of serious){
   console.error('  '+v.impact+' '+v.id+': '+v.help+' ('+v.nodes.length+' nodes)');
   for(const n of v.nodes.slice(0,5))console.error('    '+n.target.join(', ')+' — '+n.failureSummary?.replace(/\s+/g,' ').slice(0,220));
   failures.push(label+': '+v.id);
  }
 }
 async function closeNetworkModal(page){
  const close=page.locator('#modal #closeS');
  if(await close.count())await close.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
 }
 try{
  const root=await browser.newPage();await root.goto(rootUrl,{waitUntil:'load'});await root.waitForTimeout(250);await install(root);
  await scan(root,'Linux Sysadmin initial workspace');
  // The server-health overlay is a distinct, frequently used dialog state.
  if(await root.locator('#btnHealthDashboard').count()){
   await root.locator('#menuProgress summary').click();
   await root.locator('#btnHealthDashboard').click();await root.waitForTimeout(80);
   await scan(root,'Linux Sysadmin server-health dialog');
  }else throw new Error('Linux server-health launcher missing; cannot scan dialog state');
  await root.close();

  const net=await browser.newPage(),runtimeErrors=[];
  net.on('pageerror',error=>runtimeErrors.push(error.stack||error.message));
  net.on('console',message=>{if(message.type()==='error')runtimeErrors.push('console: '+message.text());});
  await net.goto(networkUrl,{waitUntil:'load'});await net.waitForTimeout(250);
  if(!(await net.locator('#btnSet').count()))throw new Error('Network Trainer did not finish booting; runtime errors: '+(runtimeErrors.join(' | ')||'none captured'));
  await install(net);
  await scan(net,'Network Trainer workbench');

  await net.locator('#btnSet').click();await net.waitForTimeout(80);
  await scan(net,'Network Trainer settings dialog');await closeNetworkModal(net);

  await net.locator('#btnSearch').click();await net.waitForTimeout(80);
  await scan(net,'Network Trainer search palette');await net.keyboard.press('Escape');await net.waitForTimeout(60);

  await net.locator('#btnBuild').click();await net.waitForTimeout(80);
  await net.locator('#buildMenuOpen').click();await net.waitForTimeout(150);
  if(!(await net.locator('#aTitle').count()))throw new Error('Network Trainer Build workspace did not open');
  await scan(net,'Network Trainer topology Build workspace');

  // Reload to reset the authoring workspace before scanning independent dialogs.
  await net.goto(networkUrl,{waitUntil:'load'});await net.waitForTimeout(180);await install(net);
  await net.locator('#btnQueue').click();await net.waitForTimeout(100);
  if(!(await net.locator('#modal [role=dialog]').count()))throw new Error('Network Trainer incident queue dialog did not open');
  await scan(net,'Network Trainer incident queue dialog');await closeNetworkModal(net);

  await net.locator('#btnStats').click();await net.waitForTimeout(80);
  if(await net.locator('#modal [role=dialog]').count())await scan(net,'Network Trainer statistics dialog');
  else throw new Error('Network Trainer statistics dialog did not open');
  await closeNetworkModal(net);
  if(runtimeErrors.length)throw new Error('Network Trainer runtime errors: '+runtimeErrors.join(' | '));
  await net.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 if(failures.length){console.error('Accessibility scan failed: '+failures.join(', '));process.exit(1);}
 console.log('Accessibility axe scans passed ('+browserName+'): no serious or critical violations across all scanned states.');
})();
