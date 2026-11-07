// Service-worker lifecycle and request-strategy regression tests (no browser required).
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require('path').join(__dirname, 'src/service-worker.js'), 'utf8')
  .replace('__VERSION__', 'test');
const handlers = {};
const store = new Map();
const calls = { skipWaiting: 0, claim: 0, fetch: 0 };
const makeResponse = (body, ok = true) => ({
  body, ok,
  clone() { return makeResponse(body, ok); }
});
const cacheFor = name => {
  if (!store.has(name)) {
    const entries = new Map();
    store.set(name, {
      entries,
      async addAll(items) {
              for (const item of items) entries.set(String(item), makeResponse('cached:' + item));
      },
      async put(request, response) { entries.set(request.url || String(request), response); },
      async match(request) { return entries.get(request.url || String(request)) || entries.get(String(request)); }
    });
  }
  return store.get(name);
};
const caches = {
  async open(name) { return cacheFor(name); },
  async keys() { return [...store.keys()]; },
  async delete(name) { return store.delete(name); },
  async match(request) {
    const key = request.url || String(request);
    for (const cache of store.values()) {
      if (cache.entries.has(key)) return cache.entries.get(key);
      if (cache.entries.has(String(request))) return cache.entries.get(String(request));
    }
    return undefined;
  }
};
const self = {
  location: { origin: 'https://sysadmin.example' },
  clients: { async claim() { calls.claim++; } },
  async skipWaiting() { calls.skipWaiting++; },
  addEventListener(name, fn) { handlers[name] = fn; }
};
let network = async request => { calls.fetch++; return makeResponse('network:' + (request.url || request)); };
const context = vm.createContext({
  self, caches, URL, Promise,
  fetch: request => network(request),
});
vm.runInContext(source, context);

async function dispatch(name, properties) {
  let task;
  let response;
  const event = {
    ...properties,
    waitUntil(promise) { task = Promise.resolve(promise); },
    respondWith(promise) { response = Promise.resolve(promise); }
  };
  handlers[name](event);
  const result = response ? await response : undefined;
  if (task) await task;
  return result;
}

(async () => {
  await dispatch('install', {});
  assert.strictEqual(calls.skipWaiting, 1, 'successful precache activates the new worker');
  assert(store.has('last-sysadmin-vtest'), 'install creates the versioned cache');

  store.set('last-sysadmin-vold', { entries: new Map() });
  store.set('unrelated-app-cache', { entries: new Map() });
  await dispatch('activate', {});
  assert(!store.has('last-sysadmin-vold'), 'activation removes prior app caches');
  assert(store.has('unrelated-app-cache'), 'activation preserves caches owned by other apps');
  assert.strictEqual(calls.claim, 1, 'activation claims existing clients');

  const nav = { method: 'GET', mode: 'navigate', url: 'https://sysadmin.example/build' };
  network = async () => makeResponse('fresh-shell');
  let result = await dispatch('fetch', { request: nav });
  assert.strictEqual(result.body, 'fresh-shell', 'navigation prefers the network');
  assert(cacheFor('last-sysadmin-vtest').entries.has(nav.url), 'successful navigation is cached');

  network = async () => { throw new Error('offline'); };
  result = await dispatch('fetch', { request: { ...nav, url: 'https://sysadmin.example/deep-link' } });
  assert.strictEqual(result.body, 'cached:index.html', 'offline navigation falls back to the app shell');

  const asset = { method: 'GET', mode: 'cors', url: 'https://sysadmin.example/app.js' };
  cacheFor('last-sysadmin-vtest').entries.set(asset.url, makeResponse('cached-script'));
  const fetchesBefore = calls.fetch;
  result = await dispatch('fetch', { request: asset });
  assert.strictEqual(result.body, 'cached-script', 'static assets are cache-first');
  assert.strictEqual(calls.fetch, fetchesBefore, 'cache hit avoids a network request');

  const missing = { method: 'GET', mode: 'cors', url: 'https://sysadmin.example/missing.js' };
  await assert.rejects(dispatch('fetch', { request: missing }), undefined, 'missing non-navigation assets must not receive HTML fallback');

  const post = { method: 'POST', mode: 'cors', url: 'https://sysadmin.example/api' };
  assert.strictEqual(await dispatch('fetch', { request: post }), undefined, 'non-GET requests bypass the worker');
  const external = { method: 'GET', mode: 'cors', url: 'https://cdn.example/library.js' };
  assert.strictEqual(await dispatch('fetch', { request: external }), undefined, 'cross-origin requests bypass the worker');

  // A failed precache must reject installation before skipWaiting is called.
  const failedHandlers = {};
  const failedSelf = { ...self, addEventListener(name, fn) { failedHandlers[name] = fn; }, async skipWaiting() { calls.skipWaiting++; } };
  const failedContext = vm.createContext({
    self: failedSelf, caches: { async open() { return { async addAll() { throw new Error('precache failed'); } }; } },
    URL, Promise, fetch
  });
  vm.runInContext(source, failedContext);
  let installPromise;
  failedHandlers.install({ waitUntil(p) { installPromise = Promise.resolve(p); } });
  await assert.rejects(installPromise, /precache failed/);
  assert.strictEqual(calls.skipWaiting, 1, 'failed precache does not skip waiting');

  console.log('Service worker OK: install atomicity, cache ownership/upgrade, online refresh, offline navigation, static cache strategy, and request bypass.');
})().catch(error => { console.error(error); process.exit(1); });
