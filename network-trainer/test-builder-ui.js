// Headless UI test for the scenario builder: enter build mode, author a
// build-from-scratch scenario (place endpoints + set an objective), play it,
// then build the network up through the UI until the grader accepts it.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const ok = m => console.log('  ✓ ' + m);
  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };
  const node = d => `#topo .node[data-dev="${d}"]`;
  const clickNode = async d => { await page.click(node(d)); await page.waitForTimeout(60); };
  const addDev = async kind => { await page.click(`#config .pal[data-add="${kind}"]`); await page.waitForTimeout(70); };
  const wire = async (a, b) => { await clickNode(a); await page.click('#wireBtn'); await page.waitForTimeout(40); await clickNode(b); };
  const setAddr = async (d, ip, pfx) => {
    await clickNode(d);
    await page.fill(`#config .ifrow[data-if="eth0"] .ip`, ip);     // address first (kept),
    await page.fill(`#config .ifrow[data-if="eth0"] .pfx`, pfx);   // then prefix commits it
    await page.$eval(`#config .ifrow[data-if="eth0"] .pfx`, el => el.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForTimeout(70);
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // --- workspace routes survive refresh and support browser history ---
  await page.click('#navIncidents');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'incidents');
  if (await page.locator('#incidentsView').isVisible()) ok('incident workspace updates the shareable URL');
  else fail('incident workspace did not become visible after navigation');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'incidents');
  await page.waitForTimeout(120);
  if (await page.locator('#incidentsView').isVisible()) ok('refresh restores the active incident workspace and URL');
  else fail('refresh returned to a different workspace');
  await page.click('#navKnowledge');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'knowledge');
  await page.goBack();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'incidents');
  if (await page.locator('#incidentsView').isVisible()) ok('browser Back restores the previous workspace');
  else fail('browser Back did not restore the previous workspace');
  await page.goForward();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'knowledge');
  if (await page.locator('#knowledgeView').isVisible()) ok('browser Forward restores the next workspace');
  else fail('browser Forward did not restore the next workspace');
  await page.click('#navWorkbench');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'workbench');

  // --- enter build mode ---
  await page.click('#btnBuild'); await page.waitForTimeout(150);
  if (await page.$('#aTitle')) ok('build mode: authoring panel shown'); else fail('authoring panel missing; brief=' + (await page.locator('#brief').innerText().catch(() => '<unavailable>')));
  if (await page.$('#config .pal[data-add="host"]')) ok('device palette present'); else fail('palette missing; config=' + (await page.locator('#config').innerText().catch(() => '<unavailable>')));
  if (await page.$('.canvas-empty')) ok('canvas starts empty'); else fail('expected empty canvas; topology=' + (await page.locator('#topoWrap').innerText().catch(() => '<unavailable>')));
  if (errors.length) console.error('  Browser errors after entering build mode: ' + errors.join(' | '));

  // --- author: place the two endpoints the student will start with ---
  await addDev('host'); await addDev('host');
  await page.fill('#aTitle', 'Refresh-safe lab');
  await page.fill('#aObj', 'Keep the current Build workspace after refresh.');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'build');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#aTitle');
  if (new URLSearchParams(page.url().split('?')[1] || '').get('view') === 'build' && await page.locator('#cols').isVisible()) ok('refresh restores the Build page route'); else fail('refresh did not restore Build page');
  if (await page.inputValue('#aTitle') === 'Refresh-safe lab' && await page.locator('#topo .node').count() === 2) ok('refresh restores the in-progress topology and authoring details'); else fail('Build draft was not restored after refresh');
  const built = await page.$eval('#topo .node', ns => ns.map(n => n.dataset.dev));
  if (built.includes('h1') && built.includes('h2')) ok('placed h1 and h2 (' + built.join(', ') + ')'); else fail('endpoints not placed: ' + JSON.stringify(built));

  // --- modern topology designer controls ---
  await page.click('#topo .node[data-dev="h1"]'); await page.waitForTimeout(50);
  if (await page.$('#duplicateDev')) {
    await page.click('#duplicateDev'); await page.waitForTimeout(70);
    if (await page.$('#topo .node[data-dev="h3"]')) ok('selected device can be duplicated without copying links'); else fail('duplicate device was not created');
    await page.click('#delDev'); await page.waitForTimeout(60);
  } else fail('duplicate control missing for selected device');
  // Multi-select, clipboard and history controls.
  await page.click('#topo .node[data-dev="h1"]');
  await page.click('#topo .node[data-dev="h2"]', { modifiers: ['Shift'] });
  await page.waitForTimeout(50);
  if ((await page.textContent('.builder')).includes('2 selected')) ok('shift-click selects multiple devices');
  else fail('multi-select did not retain both devices');
  await page.click('#topoCopy');
  if (!(await page.locator('#topoPaste').isDisabled())) ok('copy enables paste for the captured selection');
  else fail('copy did not enable paste');
  await page.click('#topoPaste'); await page.waitForTimeout(80);
  if ((await page.locator('#topo .node').count()) === 4) ok('copy/paste duplicates the selected device group');
  else fail('copy/paste did not duplicate both selected devices');
  await page.click('#topoUndo'); await page.waitForTimeout(60);
  if ((await page.locator('#topo .node').count()) === 2) ok('undo restores the topology before paste');
  else fail('undo did not restore the pre-paste topology');
  await page.click('#topoRedo'); await page.waitForTimeout(60);
  if ((await page.locator('#topo .node').count()) === 4) ok('redo reapplies the topology paste');
  else fail('redo did not reapply the topology paste');
  await page.click('#topoUndo'); await page.waitForTimeout(60);
  await page.click('#topo .node[data-dev="h2"]');
    await page.click('#gridBtn'); await page.waitForTimeout(50);
  if ((await page.textContent('#gridBtn')).includes('Grid off')) ok('canvas grid can be toggled'); else fail('grid toggle did not update');
  await page.click('#snapBtn'); await page.waitForTimeout(50);
  if ((await page.textContent('#snapBtn')).includes('Snap off')) ok('snap-to-grid can be disabled'); else fail('snap toggle did not update');
  await clickNode('h2'); // place the note beside h2, away from the initial h1/h2 nodes
  page.once('dialog', dialog => dialog.accept('Core uplink — ISP handoff'));
  await page.click('#noteBtn'); await page.waitForTimeout(70);
  if ((await page.locator('#topo .topo-note').textContent()).includes('Core uplink')) ok('topology annotation is visible on canvas'); else fail('topology annotation missing');
  // --- device labels and logical network zones ---
  page.once('dialog', dialog => dialog.accept('Core Router'));
  await page.click('#labelDev');
  await page.waitForTimeout(60);
  if ((await page.locator('#topo .node[data-dev="h2"] .n-id').textContent()) === 'Core Router') ok('selected device supports a custom display label');
  else fail('custom device label was not rendered');
  page.once('dialog', dialog => dialog.accept('Core LAN'));
  await page.click('#zoneBtn'); await page.waitForTimeout(70);
  if ((await page.locator('#topo .topo-zone text').textContent()) === 'Core LAN') ok('selected devices can be grouped in a named topology zone');
  else fail('topology zone was not rendered');
  await page.uncheck('#config [data-topo-layer="zones"]'); await page.waitForTimeout(50);
  if (await page.locator('#topo .topo-zone').count() === 0) ok('zone layer can be hidden without deleting zone data'); else fail('zone layer visibility toggle failed');
  await page.check('#config [data-topo-layer="zones"]'); await page.waitForTimeout(50);
  if (await page.locator('#topo .topo-zone').count() === 1) ok('zone layer can be restored'); else fail('zone layer did not restore');
  await page.uncheck('#config [data-topo-layer="devices"]'); await page.waitForTimeout(50);
  if (await page.locator('#topo .node').count() === 0) ok('device layer can be hidden independently'); else fail('device layer visibility toggle failed');
  await page.check('#config [data-topo-layer="devices"]'); await page.waitForTimeout(50);


  // --- author: set the objective (reachable h1 <-> h2) ---
  await page.selectOption('#chkType', 'reachable'); await page.waitForTimeout(60);
  await page.fill('#chkArgs .chkarg[data-arg="a"]', 'h1');
  await page.fill('#chkArgs .chkarg[data-arg="b"]', 'h2');
  await page.click('#addChk'); await page.waitForTimeout(80);
  if ((await page.textContent('#brief .rev-list')).includes('h1 can reach h2')) ok('objective added'); else fail('objective not listed');

  // --- play the scenario ---
  await page.click('#playScn'); await page.waitForTimeout(150);
  if (await page.$('#check')) ok('play mode: Check available'); else fail('Check button missing in play');
  // it must NOT already be solved (student has to build it)
  await page.click('#check'); await page.waitForTimeout(100);
  if ((await page.getAttribute('#status', 'class')) === 'bad') ok('starts unsolved — student must build'); else fail('scenario should start unsolved');

  // --- student builds from scratch: switch, links, addresses ---
  await addDev('switch');                 // sw1
  await wire('h1', 'sw1');
  await wire('h2', 'sw1');
  const links = await page.$$eval('#topo .edge', es => es.length);
  if (links === 2) ok('student wired both hosts to the switch'); else fail('expected 2 links, got ' + links);
  await setAddr('h1', '10.0.1.10', '24');
  await setAddr('h2', '10.0.1.20', '24');

  // --- grade ---
  await page.click('#check'); await page.waitForTimeout(120);
  const cls = await page.getAttribute('#status', 'class');
  const txt = await page.textContent('#status');
  if (cls === 'ok' && /complete/.test(txt)) ok('grader accepts the built network'); else fail('scenario not accepted: [' + cls + '] ' + txt);

  // --- link selection and removal in the authored build scenario ---
  const edge = page.locator('#topo .edge').first();
  await edge.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(60);
  if (await page.$('#delLink')) {
    await page.click('#delLink'); await page.waitForTimeout(60);
    const remaining = await page.locator('#topo .edge').count();
    if (remaining === 1) ok('selected link can be removed independently');
    else fail('selected link removal did not update topology (remaining links: ' + remaining + ')');
  } else fail('selecting a topology link did not expose remove action');

  // --- exit build returns to the campaign ---
  await browser.close();
  if (errors.length) { console.error('\nBUILDER UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nBUILDER UI OK.');
})();
