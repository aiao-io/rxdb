/* global MANIFEST */
const prefix = 'aiao-media-shell-v1-';
const cacheName = prefix + MANIFEST.version;
const paths = new Set(MANIFEST.assets.map(asset => asset.path));
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(cacheName);
        // Version-specific cache: an incomplete install is never activated.
        for (const asset of MANIFEST.assets) {
          const response = await fetch(asset.path, {
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error'
          });
          if (!response.ok || response.type === 'opaque' || response.redirected)
            throw new Error('Invalid build resource.');
          const bytes = await response.clone().arrayBuffer();
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          if (bytes.byteLength !== asset.size || digest !== asset.sha256)
            throw new Error('Build resource integrity mismatch.');
          await cache.put(asset.path, response);
        }
      } catch (error) {
        await caches.delete(cacheName);
        throw error;
      }
      // No skipWaiting: existing pages keep their coherent installed version.
    })()
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.search)
    return;
  if (request.mode === 'navigate' && ['/', '/create', '/images', '/providers'].includes(url.pathname)) {
    // Network errors only. Preserve 401/403/5xx; NEVER cache live SSR responses.
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await (await caches.open(cacheName)).match('/offline-shell.html');
        return shell ?? new Response('Offline shell unavailable.', { status: 503 });
      })
    );
  } else if (paths.has(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(url.pathname)) ?? fetch(request))());
  }
});
