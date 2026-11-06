// Workbench regression: global Help and Journal actions must route to the
// first-class Knowledge and Engineering Journal workspaces.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html?view=workbench');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(200);

  if (await page.locator('#btnHelp').isVisible() && await page.locator('#btnJournal').isVisible())
    ok('Help and Journal remain one click away from the Workbench header');
  else fail('Help or Journal action missing');

  await page.locator('#btnHelp').click();
  if (await page.locator('#knowledgeView').isVisible()) ok('global Help opens the first-class Knowledge workspace');
  else fail('global Help did not open Knowledge');
  if (await page.locator('#knowledgeSearch').isVisible() && await page.locator('.knowledge-playbook').count() >= 4)
    ok('Help provides searchable command guidance and troubleshooting playbooks');
  else fail('Knowledge guidance is not available from global Help');

  await page.locator('#btnJournal').click();
  if (await page.locator('#journalView').isVisible()) ok('global Journal opens the first-class Engineering Journal');
  else fail('global Journal did not open the journal workspace');
  if (await page.locator('#journalSearch').isVisible() && await page.locator('#journalExportPage').isVisible())
    ok('global Journal exposes search and Markdown export');
  else fail('journal search or export is unavailable from the global action');

  await browser.close();
  if (errors.length) { console.error('\\nWORKBENCH UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nWORKBENCH UI OK.');
})();
