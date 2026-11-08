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

  // Test the feedback renderer independently of workspace visibility or
  // navigation state; those routes have their own dedicated browser suite.
  await page.evaluate(() => {
    if (typeof explainNetworkMistake !== 'function' || typeof clearNetworkMistake !== 'function')
      throw new Error('network mistake coaching did not initialise');
    explainNetworkMistake('show not-a-real-command', '% Invalid input detected');
  });
  await page.waitForFunction(() => {
    const panel = document.getElementById('networkMistakeCoach');
    return panel && !panel.hidden;
  }, null, { timeout: 3000 });

  const feedback = await page.locator('#networkMistakeCoach').innerText();
  if (feedback.includes('Understand → Inspect → Correct → Verify') && feedback.includes('Try next'))
    console.log('  ✓ network mistakes include the shared learning cycle and next step');
  else errors.push('network mistake explanation is incomplete');
  if (feedback.includes('Learn from this result') && feedback.includes('Invalid input'))
    console.log('  ✓ network console labels contextual feedback clearly');
  else errors.push('network mistake coach label or category missing');

  await page.evaluate(() => clearNetworkMistake());
  if (await page.locator('#networkMistakeCoach').isHidden())
    console.log('  ✓ successful follow-up can clear stale mistake feedback');
  else errors.push('network mistake feedback did not clear');

  await browser.close();
  if (errors.length) { console.error(errors.join('\\n')); process.exit(1); }
  console.log('NETWORK MISTAKE COACH OK.');
})();
