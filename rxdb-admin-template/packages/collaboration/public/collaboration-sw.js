const CACHE = 'admin-collaboration-shell-v1';
const shell = new URL('/collaboration', self.location.origin).href;
const asset = url =>
  url.origin === self.location.origin &&
  !url.pathname.startsWith('/collaboration-api') &&
  /\.(js|css|woff2?|wasm|ico)$/.test(url.pathname) &&
  !url.search;
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
/** 只信任带字符串 url 的同源客户端；MessagePort、ServiceWorker 等来源没有 url，一律忽略。 */
const fromOwnOrigin = source => {
  if (!source || typeof source.url !== 'string') return false;
  try {
    return new URL(source.url).origin === self.location.origin;
  } catch {
    return false;
  }
};
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-shell' || !fromOwnOrigin(event.source)) return;
  const urls =
    Array.isArray(event.data.urls) ?
      event.data.urls
        .filter(value => typeof value === 'string')
        .map(value => new URL(value, self.location.origin))
        .filter(asset)
        .map(url => url.href)
    : [];
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll([...new Set([shell, ...urls])]);
        event.ports[0]?.postMessage({ ok: true });
      } catch {
        event.ports[0]?.postMessage({ ok: false });
      }
    })()
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const navigation =
    event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === '/collaboration';
  if (!navigation && !asset(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = navigation ? shell : event.request;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(key, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(key);
        if (cached) return cached;
        throw error;
      }
    })()
  );
});
