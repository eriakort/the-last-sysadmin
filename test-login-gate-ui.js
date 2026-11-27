// Mandatory sign-in gate: when a Supabase project is configured, a real visitor
// must sign in before reaching the app. The gate is bypassed under browser
// automation (navigator.webdriver) and with the lsa-e2e flag, which is how the
// rest of the suite reaches the game. This test forces a non-automation context
// to assert the gate activates, and confirms the bypass path.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(process.cwd(), 'index.html');

(async () => {
  const browser = await chromium.launch();

  // 1) Simulate a real visitor: force navigator.webdriver=false so the gate activates.
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const gateVisible = await page.evaluate(() => {
    const g = document.getElementById('authGate');
    return !!(g && !g.hidden);
  });
  if (!gateVisible) throw new Error('mandatory gate did not appear for a non-automation visitor (is Supabase configured in the build?)');

  // All five methods present: email + password, and the four OAuth providers.
  if (!(await page.$('#authGate #auEmail'))) throw new Error('gate is missing the email field');
  if (!(await page.$('#authGate #auPass'))) throw new Error('gate is missing the password field');
  for (const prov of ['google', 'azure', 'github', 'linkedin_oidc']) {
    if (!(await page.$(`#authGate [data-oauth="${prov}"]`))) throw new Error('gate is missing provider button: ' + prov);
  }
  // Sign in / Create account / magic-link actions are present.
  for (const id of ['auSignin', 'auSignup', 'auLink']) {
    if (!(await page.$('#authGate #' + id))) throw new Error('gate is missing action: ' + id);
  }

  // The app behind the gate is inert (cannot be interacted with).
  const appBlocked = await page.evaluate(() => {
    const a = document.querySelector('.app');
    return !!(a && a.hasAttribute('inert') && a.getAttribute('aria-hidden') === 'true');
  });
  if (!appBlocked) throw new Error('the app is not inert/hidden behind the gate');

  // The terminal input (main game interaction) is not reachable while gated.
  const termReachable = await page.evaluate(() => {
    const t = document.getElementById('tin');
    if (!t) return false;
    t.focus();
    return document.activeElement === t;
  });
  if (termReachable) throw new Error('the game terminal is focusable while the gate is up');

  // Guest / practice-locally bypass is available on the gate and unlocks the app.
  const guestBtn = await page.$('#authGate #auGuest');
  if (!guestBtn) throw new Error('gate is missing the Continue as Guest button');
  await guestBtn.click();
  await page.waitForTimeout(150);

  const gateStillVisible = await page.evaluate(() => {
    const g = document.getElementById('authGate');
    return !!(g && !g.hidden);
  });
  if (gateStillVisible) throw new Error('gate did not close after clicking Continue as Guest');
  const appUnlocked = await page.evaluate(() => {
    const a = document.querySelector('.app');
    const t = document.getElementById('tin');
    return !!(a && !a.hasAttribute('inert') && t && document.activeElement === t);
  });
  if (!appUnlocked) throw new Error('app/terminal did not unlock after clicking Continue as Guest');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(200);
  const gateAfterReload = await page.evaluate(() => {
    const g = document.getElementById('authGate');
    return !!(g && !g.hidden);
  });
  if (gateAfterReload) throw new Error('guest bypass did not persist across reload');

  if (errors.length) throw new Error('page errors on the gated page: ' + errors.join('; '));
  await page.close();

  // 2) Automation / e2e bypass: default webdriver=true -> no gate, the game runs.
  const page2 = await browser.newPage();
  await page2.goto(URL, { waitUntil: 'load' });
  await page2.waitForTimeout(200);
  const gate2 = await page2.evaluate(() => {
    const g = document.getElementById('authGate');
    return !!(g && !g.hidden);
  });
  if (gate2) throw new Error('gate should be bypassed under browser automation');
  const appUsable = await page2.evaluate(() => {
    const a = document.querySelector('.app');
    return !!(a && !a.hasAttribute('inert'));
  });
  if (!appUsable) throw new Error('app should be interactive when the gate is bypassed');
  await page2.close();

  await browser.close();
  console.log('Login gate UI test passed.');
})().catch(e => { console.error(e); process.exit(1); });
