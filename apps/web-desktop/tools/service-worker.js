const CACHE = `orbit-desktop-${BUILD.version}`;
const SHELL_BATCH_SIZE = 4;
const base = new URL('./', globalThis.location.href);
const applicationCache = new ReleaseCache(base);
const releaseScheduler = new ResourceScheduler();
const releaseRequests = new Map();
let collection = Promise.resolve();
const paths = new Set(BUILD.resources.map(resource => new URL(resource.path, base).pathname));

async function verify(response, expected) {
  if (!response.ok) throw new Error('离线资源下载失败');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()));
  const actual = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('离线资源完整性校验失败');
}

let preparation = null;

async function cacheResource(cache, resource) {
  const url = new URL(resource.path, base).href;
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  await verify(response, resource.sha256);
  await cache.put(url, response);
}

async function cacheBatch(cache, resources) {
  const results = await Promise.allSettled(resources.map(resource => cacheResource(cache, resource)));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function cacheResources() {
  const cache = await caches.open(CACHE);
  try {
    for (let offset = 0; offset < BUILD.resources.length; offset += SHELL_BATCH_SIZE)
      await cacheBatch(cache, BUILD.resources.slice(offset, offset + SHELL_BATCH_SIZE));
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}

function prepareResources() {
  preparation ??= cacheResources().finally(() => {
    preparation = null;
  });
  return preparation;
}

globalThis.addEventListener('install', event => event.waitUntil(prepareResources()));

globalThis.addEventListener('activate', event => event.waitUntil(globalThis.clients.claim()));

globalThis.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === base.pathname) url.pathname = new URL('index.html', base).pathname;
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  event.respondWith(
    (async () => {
      const application = await applicationCache.response(url);
      if (application) return application;
      if (url.pathname === new URL('resources.json', base).pathname)
        return new Response(JSON.stringify(BUILD), { headers: { 'content-type': 'application/json' } });
      const cache = await caches.open(CACHE);
      if (paths.has(url.pathname)) {
        const response = await cache.match(new URL(url.pathname, base.origin).href);
        if (response) return response;
        return new Response('完整离线版本资源缺失，请联网重新准备', { status: 503 });
      }
      try {
        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const shell = await cache.match(new URL('index.html', base).href);
          if (shell) return shell;
        }
        throw error;
      }
    })()
  );
});

globalThis.addEventListener('message', event => {
  if (event.origin !== base.origin) return;
  if (event.data?.type === 'releases') event.ports[0]?.postMessage({ releases: BUILD.releases });
  if (event.data?.type === 'prepare-release') event.waitUntil(prepareRelease(event));
  if (event.data?.type === 'cancel-release') releaseRequests.get(`${event.source?.id}:${event.data.id}`)?.abort();
  if (event.data?.type === 'prune-releases') {
    const pending = collection.then(() => pruneReleases(event));
    collection = pending.then(
      () => undefined,
      () => undefined
    );
    event.waitUntil(pending);
  }
  if (event.data?.type === 'activate-confirmed') event.waitUntil(globalThis.skipWaiting());
  if (event.data?.type === 'prepare')
    event.waitUntil(
      (async () => {
        try {
          await prepareResources();
          event.ports[0]?.postMessage({ version: BUILD.version, complete: true });
        } catch (error) {
          event.ports[0]?.postMessage({
            complete: false,
            error: error instanceof Error ? error.message : '离线准备失败'
          });
        }
      })()
    );
  if (event.data?.type === 'status')
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const results = await Promise.all(
          BUILD.resources.map(async resource => Boolean(await cache.match(new URL(resource.path, base).href)))
        );
        const releases = Array.isArray(event.data.releases) ? event.data.releases : [];
        const completeReleases = await Promise.all(releases.map(pin => applicationCache.complete(pin)));
        event.ports[0]?.postMessage({
          version: BUILD.version,
          protocol: 2,
          complete: results.every(Boolean) && completeReleases.every(Boolean)
        });
      })()
    );
});

async function prepareRelease(event) {
  const { appId, version, key, id, priority } = event.data;
  const requestKey = `${event.source?.id}:${id}`;
  const controller = new AbortController();
  const pkg = BUILD.releases.find(item => item.appId === appId && item.version === version && item.key === key);
  try {
    if (!event.source?.id || typeof id !== 'string' || releaseRequests.has(requestKey))
      throw new Error('INVALID: 资源请求身份无效');
    if (priority !== 'foreground' && priority !== 'background') throw new Error('INVALID: 资源请求优先级无效');
    if (!pkg && !BUILD.releases.some(item => item.appId === appId && item.version === version))
      throw new Error('NOT_FOUND: 应用版本不在受控目录');
    releaseRequests.set(requestKey, controller);
    await releaseScheduler.enqueue(
      key,
      priority,
      async signal => {
        await collection;
        signal.throwIfAborted();
        if (pkg) await applicationCache.prepare(pkg, signal);
        else await applicationCache.preparePinned({ appId, version, key }, signal);
      },
      controller.signal
    );
    event.ports[0]?.postMessage({ complete: true });
  } catch (error) {
    event.ports[0]?.postMessage({ complete: false, error: error instanceof Error ? error.message : '版本准备失败' });
  } finally {
    if (releaseRequests.get(requestKey) === controller) releaseRequests.delete(requestKey);
  }
}

async function pruneReleases(event) {
  try {
    const source = new URL(event.source?.url ?? 'about:blank');
    if (
      source.origin !== base.origin ||
      ![base.pathname, new URL('index.html', base).pathname].includes(source.pathname)
    )
      throw new Error('DENIED: 仅桌面入口可清理资源');
    const references = event.data.references;
    if (
      !Array.isArray(references) ||
      !references.every(ref => typeof ref?.key === 'string' && /^[a-f0-9]{64}$/.test(ref.key))
    )
      throw new Error('INVALID: 资源引用无效');
    const refs = new ResourceReferences();
    refs.replace('desktop', references);
    const clients = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const frames = clients
      .map(client => {
        const url = new URL(client.url);
        const prefix = base.pathname + 'releases/';
        if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null;
        const key = url.pathname.slice(prefix.length).split('/')[2];
        return /^[a-f0-9]{64}$/.test(key) ? { id: client.id, key } : null;
      })
      .filter(Boolean);
    refs.replace('frames', frames);
    refs.replace(
      'pending',
      releaseScheduler.keys().map(key => ({ id: key, key }))
    );
    const removed = await applicationCache.prune(new Set(refs.keys()));
    event.ports[0]?.postMessage({
      complete: true,
      removed,
      references: refs.keys().map(key => ({ key, count: refs.count(key) }))
    });
  } catch (error) {
    event.ports[0]?.postMessage({ complete: false, error: error instanceof Error ? error.message : '资源清理失败' });
  }
}
