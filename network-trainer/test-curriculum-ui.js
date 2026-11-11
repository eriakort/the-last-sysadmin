// Phase 2 UI: the curriculum progression panel on the operations overview and
// the tier-grouped mission picker. Confirms the panel renders all tiers with a
// recommended-next action, that Resume navigates into a mission, and that the
// mission picker is grouped by tier via <optgroup>.
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const browserType = { firefox, webkit }[process.env.PLAYWRIGHT_BROWSER] || chromium;
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  if (!(await page.locator('#overview').isVisible())) throw new Error('operations overview is not the landing view');

  // The curriculum panel renders with one card per tier.
  const panel = page.locator('.curriculum-panel');
  if (!(await panel.isVisible())) throw new Error('curriculum progression panel did not render');
  const tierCards = await page.locator('.curriculum-tier').count();
  if (tierCards !== 5) throw new Error('expected 5 tier cards, found ' + tierCards);

  // Each tier card shows a capstone line and a progress track.
  if ((await page.locator('.curriculum-tier .ct-capstone').count()) !== 5) throw new Error('every tier should list a capstone');
  if ((await page.locator('.curriculum-tier .ct-track').count()) !== 5) throw new Error('every tier should show a progress track');

  // On a fresh profile, a recommended-next action is present and points at Tier 1.
  const resume = page.locator('#curriculumResume');
  if (!(await resume.count())) throw new Error('recommended-next Resume action is missing on a fresh profile');

  // The mission picker is grouped by tier with optgroups.
  // (The picker lives in the workbench brief; open a mission first.)
  await resume.click();
  await page.waitForTimeout(300);
  const optgroups = await page.locator('#pick optgroup').count();
  if (optgroups !== 5) throw new Error('mission picker should have 5 tier optgroups, found ' + optgroups);
  const firstLabel = await page.locator('#pick optgroup').first().getAttribute('label');
  if (!/Tier 1/.test(firstLabel || '')) throw new Error('first optgroup should be Tier 1, got: ' + firstLabel);
  // Resume landed us in the workbench, inside a mission.
  if (!(await page.locator('#brief').isVisible())) throw new Error('Resume did not open a mission brief in the workbench');

  await browser.close();
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log('Curriculum progression UI tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
