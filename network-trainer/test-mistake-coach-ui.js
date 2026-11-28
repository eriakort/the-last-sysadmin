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

  // Accepted configuration commands that miss the task should be distinguished
  // from read-only probes that simply leave an objective unfinished.
  const outcomes = await page.evaluate(() => {
    LAST_COMMAND = { line: 'ip addr add 10.0.9.10/24 dev eth0', accepted: true };
    const configured = missionOutcomeFeedback(false);
    LAST_COMMAND = { line: 'show ip route', accepted: true };
    const inspected = missionOutcomeFeedback(false);
    return { configured, inspected };
  });
  if (outcomes.configured.includes('data-feedback-category="valid-but-incorrect"'))
    console.log('  ✓ accepted address changes that miss the objective are identified as valid-but-incorrect');
  else errors.push('accepted network configuration did not receive valid-but-incorrect feedback');
  if (outcomes.inspected.includes('data-feedback-category="objective-unmet"'))
    console.log('  ✓ read-only inspection does not get mislabelled as a configuration change');
  else errors.push('read-only network command was mislabelled as a configuration change');

  await browser.close();
  if (errors.length) { console.error(errors.join('\\n')); process.exit(1); }
  console.log('NETWORK MISTAKE COACH OK.');
})();
