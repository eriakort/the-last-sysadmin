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
  const wire = async (a, b) => { await clickNode(a); await page.click('#wireBtn'); await page.waitForTimeout(40); await clickNode(b); await page.waitForTimeout(450); };
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

  // Theme-aware controls must retain readable contrast in Paper (light) mode.
  // Disable the normal 150ms button transition so this assertion measures the
  // final theme colors rather than an intermediate animation frame.
  const paperButton = page.locator('#btnSearch');
  await paperButton.evaluate(el => { el.style.transition = 'none'; });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'paper'));
  await page.waitForTimeout(30);
  const paperColors = await paperButton.evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  if (paperColors.color === 'rgb(26, 34, 48)' && paperColors.background === 'rgb(243, 246, 250)') ok('shared action buttons use readable light-theme foreground and background colors');
  else fail('Paper theme button contrast is incorrect: ' + JSON.stringify(paperColors));
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  // --- enter build mode ---
  await page.click('#btnBuild'); await page.click('#buildMenuOpen'); await page.waitForTimeout(150);
  if (await page.$('#aTitle')) ok('build mode: authoring panel shown'); else fail('authoring panel missing; brief=' + (await page.locator('#brief').innerText().catch(() => '<unavailable>')));
  if (await page.$('#config .pal[data-add="host"]')) ok('device palette present'); else fail('palette missing; config=' + (await page.locator('#config').innerText().catch(() => '<unavailable>')));
  if (await page.locator('#config .device-palette .pal').count() === 5 && await page.locator('#config .palette-device-icon').count() === 5) ok('five-device palette has compact isometric previews');
  else fail('device palette is missing one or more illustrated device types');
  if (await page.$('.canvas-empty')) ok('canvas starts empty'); else fail('expected empty canvas; topology=' + (await page.locator('#topoWrap').innerText().catch(() => '<unavailable>')));
  const emptyCanvas = await page.locator('#topo').boundingBox();
  await page.click('[data-draw-tool="rect"]');
  await page.mouse.move(emptyCanvas.x + 110, emptyCanvas.y + 100);
  await page.mouse.down();
  await page.mouse.move(emptyCanvas.x + 220, emptyCanvas.y + 190, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  if (await page.locator('#topo .topo-drawing').count() === 1) ok('drawing can start on an empty topology');
  else fail('cannot create the first drawing on an empty canvas');
  await page.click('[data-draw-tool="select"]');
  await page.click('#topo .topo-drawing');
  await page.click('#delDrawing');
  if (await page.locator('#topo .topo-drawing').count() === 0) ok('empty-canvas drawing can be removed cleanly');
  else fail('empty-canvas drawing cleanup failed');
  if (errors.length) console.error('  Browser errors after entering build mode: ' + errors.join(' | '));

  // --- author: place the two endpoints the student will start with ---
  await addDev('host'); await addDev('host');
  await page.fill('#aTitle', 'Refresh-safe lab');
  await page.fill('#aObj', 'Keep the current Build workspace after refresh.');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'build');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#aTitle');
  if (new URLSearchParams(page.url().split('?')[1] || '').get('view') === 'build' && await page.locator('#cols').isVisible()) ok('refresh restores the Build page route'); else fail('refresh did not restore Build page');
  // After reload the docked console stays collapsed; collapse it if something opened it.
  if (await page.locator('#terminalWindow:not([hidden])').count()) {
    await page.locator('#terminalMinimize').click();
    await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  }
  if (await page.locator('#terminalRestore').evaluate(el=>!!el.closest("#top .build-menu"))) ok('device terminal control lives in the top-bar Build menu, off the canvas');
  else fail('device terminal control is not in the top-bar Build menu');
  await page.click('#navOverview');
  if (await page.locator('#btnBuild').isVisible()) ok('Build menu stays available in the header from any workspace');
  else fail('Build menu disappeared off the workbench');
  await page.click('#btnBuild');
  await page.waitForSelector('#buildMenu:not([hidden])');
  await page.click('#buildMenuOpen');
  await page.waitForSelector('#cols:not([hidden])');
  if (await page.locator('#cols').isVisible()) ok('Build ▾ → Open build workspace reopens the canvas'); else fail('Build menu did not reopen the canvas');
  if (await page.inputValue('#aTitle') === 'Refresh-safe lab' && await page.locator('#topo .node').count() === 2) ok('refresh restores the in-progress topology and authoring details'); else fail('Build draft was not restored after refresh');
  const built = await page.$$eval('#topo .node', ns => ns.map(n => n.dataset.dev));
  if (built.includes('h1') && built.includes('h2')) ok('placed h1 and h2 (' + built.join(', ') + ')'); else fail('endpoints not placed: ' + JSON.stringify(built));
  if (await page.locator('#topo .node .device-art .iso-top').count() === 2 && await page.locator('#topo .node .device-art .iso-front').count() === 2 && await page.locator('#topo .node .device-art .iso-side').count() === 2) ok('host nodes render as layered isometric SVG devices');
  else fail('host device artwork is missing isometric faces');

  // --- modern topology designer controls ---
  await page.click('#topo .node[data-dev="h1"]'); await page.waitForTimeout(50);
  if (await page.$('#duplicateDev')) {
    await page.click('#duplicateDev'); await page.waitForTimeout(70);
    if (await page.$('#topo .node[data-dev="h3"]')) ok('selected device can be duplicated without copying links'); else fail('duplicate device was not created');
    await page.click('#delDev'); await page.waitForTimeout(60);
  } else fail('duplicate control missing for selected device');
  // Multi-select, clipboard and history controls.
  // Avoid completing the browser's double-click gesture from the preceding device selection;
  // double-click intentionally opens that device's floating terminal.
  await page.waitForTimeout(450);
  if (await page.locator('#terminalWindow:not([hidden])').count()) {
    await page.locator('#terminalMinimize').click();
    await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  }
  await page.locator('#topo').click({ button: 'right', position: { x: 18, y: 18 } });
  await page.locator('.topo-context-menu [data-action="select-all"]').click();
  if (await page.locator('#topo .node.multi-selected').count() === 2) ok('Select all selects every device');
  else fail('Select all did not select every device');
  await page.click('#topo .node[data-dev="h1"]');
  if (await page.locator('#topo .node.multi-selected').count() === 1 && await page.locator('#topo .node[data-dev="h1"]').evaluate(el=>el.classList.contains('multi-selected'))) ok('plain click replaces Select all with one device');
  else fail('plain click did not collapse the previous multi-selection');
  await page.click('#topo .node[data-dev="h2"]', { modifiers: ['Control'] });
  await page.waitForTimeout(50);
  if ((await page.locator('#topo .node.multi-selected').count()) === 2) ok('Ctrl-click adds a device to the selection');
  else fail('Ctrl-click did not retain both devices');
  const boxes = await page.locator('#topo .node').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  const canvasBox = await page.locator('#topo').boundingBox();
  await page.mouse.move(Math.max(canvasBox.x+2,Math.min(...boxes.map(x=>x.x))-8),Math.max(canvasBox.y+2,Math.min(...boxes.map(x=>x.y))-8));
  await page.mouse.down();
  await page.mouse.move(Math.min(canvasBox.x+canvasBox.width-2,Math.max(...boxes.map(x=>x.right))+8),Math.min(canvasBox.y+canvasBox.height-2,Math.max(...boxes.map(x=>x.bottom))+8),{steps:4});
  await page.mouse.up(); await page.waitForTimeout(50);
  if (await page.locator('#topo .node.multi-selected').count() === 2) ok('click-and-drag capture selects canvas devices');
  else fail('click-and-drag capture did not select both devices');
  await page.click('#captureSelectBtn');
  if (await page.locator('#captureSelectBtn').getAttribute('aria-pressed') === 'false') ok('canvas capture selection can be disabled');
  else fail('canvas capture selection did not disable');
  await page.click('#captureSelectBtn');
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
  // The second h2 selection is a separate click, not the double-click gesture that opens its terminal.
  await page.waitForTimeout(450);
  if (await page.locator('#terminalWindow:not([hidden])').count()) {
    await page.locator('#terminalMinimize').click();
    await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  }
  await clickNode('h2'); // place the note beside h2, away from the initial h1/h2 nodes
  page.once('dialog', dialog => dialog.accept('Core uplink — ISP handoff'));
  await page.click('#noteBtn'); await page.waitForTimeout(70);
  if ((await page.locator('#topo .topo-note').textContent()).includes('Core uplink')) ok('topology annotation is visible on canvas'); else fail('topology annotation missing');
  // --- device labels and logical network zones ---
  page.once('dialog', dialog => dialog.accept('Core Router'));
  await page.click('#labelDev');
  await page.waitForTimeout(60);
  if ((await page.locator('#topo .device-label[data-device-label="h2"][data-label-kind="name"]').textContent()) === 'Core Router') ok('selected device supports a custom display label');
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


  // --- topology drawing primitives ---
  const drawAt = async (tool, x1, y1, x2, y2) => {
    await page.click('[data-draw-tool="' + tool + '"]');
    // Tool selection refreshes the topology and may change its page position.
    // Resolve the current SVG bounds for every gesture rather than reusing a stale box.
    const svgBox = await page.locator('#topo').boundingBox();
    // Use coordinates relative to the visible SVG viewport, not SVG viewBox units.
    // This keeps every gesture inside the canvas even when its rendered size changes.
    const px1 = svgBox.x + svgBox.width * x1, py1 = svgBox.y + svgBox.height * y1;
    const px2 = svgBox.x + svgBox.width * x2, py2 = svgBox.y + svgBox.height * y2;
    await page.mouse.move(px1, py1);
    await page.mouse.down();
    await page.mouse.move(px2, py2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  // Keep gestures in the lower half of the rendered canvas, away from devices.
  // Coordinates are normalized fractions of the current SVG bounding box.
  await drawAt('line', .34, .62, .43, .68);
  if (await page.locator('#topo .topo-drawing').count() === 1) ok('line drawing is stored on the topology');
  else fail('line drawing was not created');
  await drawAt('arrow', .49, .62, .58, .68);
  await drawAt('rect', .64, .62, .73, .72);
  await drawAt('ellipse', .78, .62, .87, .72);
  // Keep the freehand path to the right of the h2 node; Playwright clicks its
  // center later to verify selection and removal, so it must not sit beneath a node.
  await drawAt('freehand', .84, .78, .94, .88);
  if (await page.locator('#topo .topo-drawing').count() === 5) ok('arrow, rectangle, ellipse and freehand drawings are supported');
  else fail('not all drawing primitives were created');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#topo');
  // A restored floating terminal can overlap the canvas after reload; tuck it away for builder interactions.
  if (await page.locator('#terminalWindow:not([hidden])').count()) {
    await page.locator('#terminalMinimize').click();
    await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  }
  if (await page.locator('#topo .topo-drawing').count() === 5) ok('topology drawings survive a Build refresh');
  else fail('topology drawings were not restored after refresh');
  await page.uncheck('#config [data-topo-layer="drawings"]');
  if (await page.locator('#topo .topo-drawing').count() === 0) ok('drawing layer can be hidden without deleting annotations');
  else fail('drawing layer visibility did not hide drawings');
  await page.check('#config [data-topo-layer="drawings"]');
  if (await page.locator('#topo .topo-drawing').count() === 5) ok('drawing layer can be restored');
  else fail('drawing layer did not restore');
  await page.click('[data-draw-tool="select"]');
  await page.click('#topo .topo-drawing[data-drawing-index="4"]');
  await page.click('#delDrawing');
  if (await page.locator('#topo .topo-drawing').count() === 4) ok('selected drawing can be removed');
  else fail('selected drawing removal failed');
  await page.click('#topoUndo');
  if (await page.locator('#topo .topo-drawing').count() === 5) ok('drawing removal participates in undo history');
  else fail('drawing removal was not undoable');
  await page.click('#topoRedo');
  if (await page.locator('#topo .topo-drawing').count() === 4) ok('drawing removal participates in redo history');
  else fail('drawing removal was not redoable');

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
  // Device selection can intentionally open the floating terminal on a double-click;
  // tuck it away before using the scenario controls underneath it.
  if (await page.locator('#terminalWindow:not([hidden])').count()) {
    await page.locator('#terminalMinimize').click();
    await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  }
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

  // Verify every supported device kind uses the same isometric SVG visual language.
  for (const kind of ['server', 'switch', 'router', 'firewall']) {
    await addDev(kind);
    const device = page.locator('#topo .node').last();
    if (await device.locator('.device-art .iso-top').count() === 1 &&
        await device.locator('.device-art .iso-front').count() === 1 &&
        await device.locator('.device-art .iso-side').count() === 1) ok(kind + ' renders with top, front and side SVG faces');
    else fail(kind + ' is missing an isometric device face');
    await page.click('#delDev');
    await page.waitForTimeout(40);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('#config .device-palette').isVisible() &&
      await page.locator('#config .device-palette .pal').count() === 5 &&
      await page.locator('#topo').isVisible()) ok('device palette and topology remain available on a narrow viewport');
  else fail('narrow viewport hides the palette or topology canvas');

  // --- exit build returns to the campaign ---
  await browser.close();
  if (errors.length) { console.error('\nBUILDER UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nBUILDER UI OK.');
})();
