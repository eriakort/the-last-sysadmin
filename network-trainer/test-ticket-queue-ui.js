// Daily incident queue: acknowledge, investigate, verify and resolve a real ticket.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { URL: NodeURL } = require('url');
const { chromium, firefox, webkit } = require('playwright');
const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const browserType = ({ chromium, firefox, webkit })[browserName];
if (!browserType) throw new Error('Unsupported PLAYWRIGHT_BROWSER: ' + browserName);
const root = path.resolve(process.cwd());
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new NodeURL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
let URL;

(async () => {
  const port = await listen();
  URL = 'http://127.0.0.1:' + port + '/index.html?view=workbench';
  const browser = await browserType.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = message => console.log('  ✓ ' + message);
  const fail = message => { console.error('  ✗ ' + message); errors.push(message); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await page.locator('#btnQueue').click();

  if (await page.locator('.queue-ticket').count() > 0) ok('daily incident queue lists authored network incidents');
  else fail('ticket queue is empty');

  const first = page.locator('.queue-ticket[data-ticket="INC-1041"]');
  if (await first.count() && /P3/.test(await first.innerText()) && /SLA target/.test(await first.innerText()))
    ok('ticket cards show ID, priority, impact and an SLA target');
  else fail('ticket card lacks operational metadata');

  const metricLabels = await page.locator('.queue-metrics span').allTextContents();
  if (metricLabels.some(x => x.trim() === 'New') && metricLabels.some(x => /Acknowledged/.test(x)) && metricLabels.some(x => /Resolved/.test(x))) ok('queue summarizes ticket workflow states');
  else fail('queue status metrics missing: ' + JSON.stringify(metricLabels));

  await page.locator('[data-ack="INC-1041"]').click();
  await page.waitForTimeout(60);
  if (/acknowledged/i.test(await page.locator('.queue-ticket[data-ticket="INC-1041"]').innerText()))
    ok('engineer can acknowledge ownership of a new ticket');
  else fail('ticket did not move to acknowledged');

  await page.locator('[data-work="INC-1041"]').click();
  await page.waitForTimeout(150);
  if (/INC-1041/.test(await page.locator('#brief').innerText()) && /can't open the shared drive/i.test(await page.locator('#brief').innerText()))
    ok('investigating a ticket loads its linked network scenario');
  else fail('ticket did not launch its linked scenario');

  // This incident requires a diagnosis before the configuration check is unlocked.
  // Keep the floating terminal minimized while interacting with the diagnosis panel.
  await page.locator('.diag-opt').first().click();
  if (await page.locator('#check').count()) ok('correct ticket diagnosis unlocks verification');
  else fail('correct ticket diagnosis did not unlock verification');

  // Restore the terminal only after diagnosis, when command entry is required.
  await page.locator('#terminalRestore').click();
  await page.waitForSelector('#terminalWindow:not([hidden])');

  const input = page.locator('#tin');
  await input.fill('ip addr add 10.0.1.10/24 dev eth0');
  await input.press('Enter');
  await input.fill('ping srv');
  await input.press('Enter');
  // The terminal overlays the scenario controls; minimize it before verification.
  await page.locator('#terminalMinimize').click();
  await page.waitForSelector('#terminalWindow[hidden]', { state: 'attached' });
  await page.locator('#check').click();
  await page.waitForTimeout(120);
  if (/ticket resolved/i.test(await page.locator('#status').innerText()))
    ok('verified scenario completion resolves the operational ticket');
  else fail('ticket did not resolve after successful verification: ' + await page.locator('#status').innerText());

  await page.locator('#btnQueue').click();
  const resolved = await page.locator('.queue-ticket[data-ticket="INC-1041"]').innerText();
  if (/resolved/i.test(resolved)) ok('resolved state appears in the incident queue');
  else fail('resolved state is not reflected in the queue');

  await page.locator('#queueFilter').selectOption('open');
  if (await page.locator('.queue-ticket[data-ticket="INC-1041"]').isHidden())
    ok('queue filters exclude resolved incidents from the open view');
  else fail('open filter includes a resolved ticket');

  await page.locator('#queueFilter').selectOption('resolved');
  if (await page.locator('.queue-ticket[data-ticket="INC-1041"]').isVisible())
    ok('queue can filter directly to resolved incidents');
  else fail('resolved filter hides resolved ticket');

  await page.locator('#closeS').click();
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(200);
  await page.locator('#btnQueue').click();
  if (/resolved/i.test(await page.locator('.queue-ticket[data-ticket="INC-1041"]').innerText()))
    ok('ticket lifecycle persists across browser reloads');
  else fail('ticket lifecycle did not persist');

  // Dismiss the queue modal before opening the work journal in the page header.
  await page.locator('#closeS').click();
  await page.locator('#btnJournal').click();
  const journal = await page.locator('.journal-page-list').innerText();
  if (/ticket acknowledged/i.test(journal) && /investigation started/i.test(journal) && /ticket resolved/i.test(journal))
    ok('journal records acknowledgement, investigation and resolution');
  else fail('journal does not contain the complete ticket lifecycle');

  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (errors.length) { console.error('\\nTICKET QUEUE UI TEST FAILED (' + errors.length + ')'); process.exit(1); }
  console.log('\\nTICKET QUEUE UI OK.');
})();
