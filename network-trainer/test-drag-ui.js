// Headless test for drag-to-reposition: build a small topology, drag a device,
// and confirm the node moved and its connected links followed it.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

const xformOf = t => { const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(t || ''); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const ok = m => console.log('  ✓ ' + m);
  const fail = m => { console.error('  ✗ ' + m); errors.push(m); };
  const node = d => `#topo .node[data-dev="${d}"]`;
  const clickNode = async d => { await page.click(node(d)); await page.waitForTimeout(60); };
  const addDev = async k => { await page.click(`#config .pal[data-add="${k}"]`); await page.waitForTimeout(70); };
  const wire = async (a, b) => { await clickNode(a); await page.click('#wireBtn'); await page.waitForTimeout(40); await clickNode(b); await page.waitForTimeout(60); };
  const centerOf = async d => page.$eval(node(d), el => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  // build a tiny topology in build mode
  await page.click('#btnBuild'); await page.waitForTimeout(120);
  await addDev('host'); await addDev('host'); await addDev('switch');   // h1 h2 sw1
  await wire('h1', 'sw1'); await wire('h2', 'sw1');
  if ((await page.$$eval('#topo .edge', e => e.length)) === 2) ok('built 2 hosts wired to a switch'); else fail('setup wiring failed');

  if (await page.$('#arrangeBtn')) ok('Auto-arrange control present'); else fail('arrange button missing');

  // positions BEFORE the drag
  const before = xformOf(await page.getAttribute(node('sw1'), 'transform'));

  // drag sw1 by a screen delta
  const c = await centerOf('sw1');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 140, c.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const after = xformOf(await page.getAttribute(node('sw1'), 'transform'));
  if (before && after && (Math.abs(after[0] - before[0]) > 10 || Math.abs(after[1] - before[1]) > 10)) ok(`node moved (${before} -> ${after})`);
  else fail(`node did not move: ${before} -> ${after}`);

  // every link touching sw1 must now end exactly at sw1's new center (links followed)
  const cx = after[0] + 24, cy = after[1] + 18;
  const linksOk = await page.$$eval('#topo line', (lines, [id, X, Y]) => lines
    .filter(l => l.getAttribute('data-a') === id || l.getAttribute('data-b') === id)
    .every(l => {
      const end = l.getAttribute('data-a') === id ? [+l.getAttribute('x1'), +l.getAttribute('y1')] : [+l.getAttribute('x2'), +l.getAttribute('y2')];
      return Math.abs(end[0] - X) < 1 && Math.abs(end[1] - Y) < 1;
    }), ['sw1', cx, cy]);
  if (linksOk) ok('both links followed the device to its new position'); else fail('links did not follow the node');

  // a plain click still selects (not treated as a drag)
  await clickNode('h1');
  if ((await page.textContent('#config')).includes('h1 · host')) ok('a click (no movement) still selects for config'); else fail('click-select broke');

  // Auto-arrange resets the hand-placed layout
  const posBeforeArrange = xformOf(await page.getAttribute(node('sw1'), 'transform'));
  await page.click('#arrangeBtn'); await page.waitForTimeout(100);
  const posAfterArrange = xformOf(await page.getAttribute(node('sw1'), 'transform'));
  if (JSON.stringify(posBeforeArrange) !== JSON.stringify(posAfterArrange)) ok('Auto-arrange restores an automatic layout'); else fail('auto-arrange had no effect');

  await browser.close();
  if (errors.length) { console.error('\nDRAG UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\nDRAG UI OK.');
})();
