// Regression: rejected network commands should explain the mistake and next investigation step.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.locator('#navWorkbench').click();
  await page.locator('#tin').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#tin').fill('show not-a-real-command');
  await page.locator('#tin').press('Enter');
  await page.waitForFunction(() => {
    const panel = document.getElementById('networkMistakeCoach');
    return panel && !panel.hidden;
  }, null, { timeout: 3000 });
  const feedback = await page.locator('#networkMistakeCoach').innerText();
  if (feedback.includes('Understand → Inspect → Correct → Verify') && feedback.includes('Try next'))
    console.log('  ✓ network mistakes include the shared learning cycle and next step');
  else errors.push('network mistake explanation is incomplete');
  if (feedback.includes('Learn from this result'))
    console.log('  ✓ network console labels contextual feedback clearly');
  else errors.push('network mistake coach label missing');
  await browser.close();
  if (errors.length) { console.error(errors.join('\\n')); process.exit(1); }
  console.log('NETWORK MISTAKE COACH OK.');
})();
