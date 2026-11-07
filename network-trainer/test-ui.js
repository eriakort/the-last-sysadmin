// Headless UI test: boot the page, solve a mission via the terminal AND via the
// config panel, and confirm Check reports resolved. Catches real page errors.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { console.error('BROWSER PAGEERROR:', e.stack || e.message); errors.push('pageerror: ' + e.message); });
  page.on('console', msg => { if (msg.type() === 'error') console.error('BROWSER CONSOLE:', msg.text()); });
  const ok = m => console.log('  ✓ ' + m);
  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };
  // Clear the diagnosis gate by clicking options until Check appears (the correct
  // pick re-renders the brief with the Objective + Check; wrong picks don't).
  const clearDiagnosis = async () => {
    for (let i = 0; i < 4; i++) {
      const btn = await page.$(`#brief .diag-opt[data-di="${i}"]`);
      if (!btn) break;
      await btn.click(); await page.waitForTimeout(80);
      if (await page.$('#check')) return true;
    }
    return !!(await page.$('#check'));
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  console.log('BOOT DIAGNOSTIC:', JSON.stringify({ url: page.url(), overviewHidden: await page.locator('#overview').evaluate(e => e.hidden).catch(() => null), incidentsPresent: await page.locator('#incidentsView').count(), infrastructurePresent: await page.locator('#infrastructureView').count(), colsHidden: await page.locator('#cols').evaluate(e => e.hidden).catch(() => null), briefText: (await page.locator('#brief').innerText().catch(() => '')).slice(0,120), topologyCount: await page.locator('#topo .node').count() }));

  // topology rendered for mission 1 (first-contact: h1, srv, sw1)
  const nodes = await page.$$eval('#topo .node', ns => ns.map(n => n.dataset.dev));
  if (nodes.includes('h1') && nodes.includes('srv') && nodes.includes('sw1')) ok('topology renders (' + nodes.join(', ') + ')');
  else fail('topology missing nodes: ' + JSON.stringify(nodes));

  // incident ticket is shown on the brief
  const tk = await page.textContent('#brief .ticket').catch(() => '');
  if (/INC-/.test(tk)) ok('incident ticket rendered (' + (tk.match(/INC-\d+/) || [''])[0] + ')');
  else fail('incident ticket missing from brief');

  // Check is GATED behind diagnosis — no Check button until the fault is located
  if (!(await page.$('#check'))) ok('Check gated until diagnosis (no Check button yet)');
  else fail('Check should be hidden before diagnosis');

  // a WRONG diagnosis (first-contact answer is index 0, so index 1 is wrong) does not unlock
  await page.click('#brief .diag-opt[data-di="1"]'); await page.waitForTimeout(80);
  if (!(await page.$('#check')) && (await page.getAttribute('#diagfb', 'class')) === 'diag-fb bad')
    ok('wrong diagnosis is rejected and does not unlock Check');
  else fail('wrong diagnosis should not unlock Check');

  // the CORRECT diagnosis unlocks the fix step
  if (await clearDiagnosis()) ok('correct diagnosis unlocks Check + objective');
  else fail('correct diagnosis did not reveal Check');

  // after diagnosis but before fixing, Check says not resolved
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'bad') ok('Check shows unresolved before the fix');
  else fail('expected unresolved status before the fix');

  // --- solve via the TERMINAL (console is h1 by default) ---
  await page.fill('#tin', 'ip addr add 10.0.1.10/24 dev eth0');
  await page.press('#tin', 'Enter'); await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'ok') ok('solved first-contact via the terminal');
  else fail('terminal solution did not resolve: ' + (await page.textContent('#status')));

  // the terminal echoed a command + the topology updated to show h1's new IP
  const h1sub = await page.$eval('#topo .node[data-dev="h1"] .n-sub', e => e.textContent);
  if (h1sub === '10.0.1.10') ok('topology reflects the configured address'); else fail('h1 sub = ' + h1sub);

  // --- switch to mission 3 and solve via the CONFIG PANEL ---
  await page.selectOption('#pick', { label: 'Routing — Off the local network' }); await page.waitForTimeout(200);
  await clearDiagnosis();   // this mission is gated too — locate the fault first
  // h1 is the console/selected device; open Routing in the inspector before adding a default route.
  await page.click('#config .inspector-tab[data-inspector-tab="routing"]');
  await page.fill('#config .rdest', 'default');
  await page.fill('#config .rvia', '10.0.1.1');
  await page.click('#addrt'); await page.waitForTimeout(150);
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'ok') ok('solved find-the-gateway via the config panel');
  else fail('panel solution did not resolve: ' + (await page.textContent('#status')));

  // --- selecting a device by clicking it updates the panel + terminal target ---
  await page.click('#topo .node[data-dev="r1"]'); await page.waitForTimeout(100);
  if ((await page.textContent('#config')).includes('r1 · router')) ok('clicking a node selects it for config');
  else fail('selecting r1 did not update the config panel');

  // --- game systems: XP + progress HUD updated after two solves ---
  const xp = await page.textContent('#xp'), prog = await page.textContent('#prog');
  if (+xp >= 200 && /^2\/\d+$/.test(prog)) ok(`XP + progress tracked (XP ${xp}, solved ${prog})`);
  else fail(`HUD not tracking: XP ${xp}, solved ${prog}`);

  // --- progress persists across reload (localStorage) ---
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  if (/^2\/\d+$/.test(await page.textContent('#prog'))) ok('progress persists across reload');
  else fail('progress did not persist: ' + (await page.textContent('#prog')));

  // --- settings opens and a theme applies ---
  await page.click('#btnSet'); await page.waitForTimeout(150);
  if (await page.$('#modal .themes')) ok('settings modal opens with themes');
  else fail('settings modal did not open');
  await page.click('#modal .tm[data-th="paper"]'); await page.waitForTimeout(150);
  if ((await page.getAttribute('html', 'data-theme')) === 'paper') ok('selecting a theme applies it');
  else fail('theme not applied: ' + (await page.getAttribute('html', 'data-theme')));
  await page.click('#modal #closeS'); await page.waitForTimeout(100);   // close settings (reopened after theme pick)

  // --- stats modal shows recorded times ---
  await page.click('#btnStats'); await page.waitForTimeout(150);
  const statsTxt = await page.textContent('#modal .stats').catch(() => '');
  if (/✓/.test(statsTxt)) ok('stats modal lists solved tickets with times');
  else fail('stats modal missing solved rows');
  await page.click('#modal #closeS'); await page.waitForTimeout(100);

  // --- terminal command history (ArrowUp recalls last command) ---
  await page.fill('#tin', 'ip addr'); await page.press('#tin', 'Enter'); await page.waitForTimeout(80);
  await page.press('#tin', 'ArrowUp'); await page.waitForTimeout(60);
  if ((await page.inputValue('#tin')) === 'ip addr') ok('ArrowUp recalls the previous command');
  else fail('history not working: ' + (await page.inputValue('#tin')));

  // --- Workbench command evidence can be attached to an incident timeline ---
  await page.click('#navWorkbench'); await page.waitForTimeout(120);
  await page.locator('#termEvidenceTicket').focus();
  const incidentId = await page.locator('#termEvidenceTicket option').nth(1).getAttribute('value');
  if (incidentId) {
    await page.selectOption('#termEvidenceTicket', incidentId);
    await page.fill('#tin', 'ip addr'); await page.press('#tin', 'Enter'); await page.waitForTimeout(80);
    await page.click('#termSaveEvidence'); await page.waitForTimeout(100);
    const linked = await page.evaluate(id => (PROG.journal || []).some(e => e.type === 'command evidence' && e.ticket === id && e.output), incidentId);
    if (linked) ok('Workbench evidence is saved against the selected incident');
    else fail('saved command evidence was not linked to the selected incident');
    await page.click('#navIncidents'); await page.waitForTimeout(120);
    await page.selectOption('#incidentStatus', 'all'); await page.waitForTimeout(80);
    await page.locator('#incidentList [data-incident-select="'+incidentId+'"]').click(); await page.waitForTimeout(80);
    const timeline = await page.locator('#incidentDetail').innerText();
    if (/command evidence/i.test(timeline) && timeline.includes('ip addr')) ok('linked command evidence appears in the incident timeline');
    else {
      const linkedEntries = await page.evaluate(id => (PROG.journal || []).filter(e => e.ticket === id).map(e => ({type:e.type,command:e.command,text:e.text,at:e.at})), incidentId);
      fail('incident timeline did not show linked command evidence for '+incidentId+'; timeline='+timeline+'; linkedEntries='+JSON.stringify(linkedEntries));
    }
  } else fail('incident selector did not populate ticket options');

  await browser.close();
  if (errors.length) { console.error('\nUI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nUI OK.');
})();
