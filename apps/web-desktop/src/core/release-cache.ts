export interface ReleasePin {
  appId: string;
  version: string;
  key: string;
}
export interface ReleasePackage extends ReleasePin {
  entry: string;
  resources: { path: string; sha256: string }[];
}

function requireResource(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new Error(`${code}: ${message}`);
}

async function resourceDigest(bytes: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function releaseFingerprint(pkg: Omit<ReleasePackage, 'key'>): Promise<string> {
  return resourceDigest(
    new TextEncoder().encode(
      JSON.stringify({
        appId: pkg.appId,
        version: pkg.version,
        entry: pkg.entry,
        resources: pkg.resources
      })
    )
  );
}

export function releasePath(pin: ReleasePin): string {
  return `releases/${pin.appId}/${pin.version}/${pin.key}/`;
}

async function validatePackage(pkg: ReleasePackage): Promise<void> {
  requireResource(
    typeof pkg === 'object' &&
      pkg !== null &&
      /^[a-z][a-z0-9-]{0,63}$/.test(pkg.appId) &&
      /^\d+\.\d+\.\d+$/.test(pkg.version) &&
      /^[a-f0-9]{64}$/.test(pkg.key),
    'INVALID',
    '资源版本无效'
  );
  requireResource(
    Array.isArray(pkg.resources) && pkg.resources.length > 0 && pkg.resources.some(item => item.path === pkg.entry),
    'INVALID',
    '缺少应用入口资源'
  );
  requireResource(
    pkg.resources.every(
      item =>
        typeof item.path === 'string' &&
        /^(?:[a-zA-Z0-9_@.-]+\/)*[a-zA-Z0-9_.@-]+$/.test(item.path) &&
        item.path.split('/').every(part => part !== '.' && part !== '..') &&
        /^[a-f0-9]{64}$/.test(item.sha256)
    ) && new Set(pkg.resources.map(item => item.path)).size === pkg.resources.length,
    'INVALID',
    '资源路径或摘要无效'
  );
  requireResource((await releaseFingerprint(pkg)) === pkg.key, 'INTEGRITY', '资源清单指纹不匹配');
}

async function verifyResource(response: Response | undefined, sha256: string): Promise<boolean> {
  return Boolean(response?.ok && (await resourceDigest(await response.clone().arrayBuffer())) === sha256);
}

export class ReleaseCache {
  constructor(
    private readonly base: URL,
    private readonly fetcher: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
    private readonly prefix = 'orbit-desktop-release-'
  ) {}

  cacheName(key: string): string {
    return this.prefix + key;
  }

  async complete(pin: ReleasePin): Promise<boolean> {
    const pkg = await this.readPackage(pin);
    if (!pkg) return false;
    const cache = await caches.open(this.cacheName(pin.key));
    const results = await Promise.all(
      pkg.resources.map(async item => verifyResource(await cache.match(this.url(pkg, item.path)), item.sha256))
    );
    return results.every(Boolean);
  }

  async prepare(pkg: ReleasePackage, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await validatePackage(pkg);
    if (await this.complete(pkg)) return;
    const cache = await caches.open(this.cacheName(pkg.key));
    try {
      for (const resource of pkg.resources) await this.download(cache, pkg, resource, signal);
      signal?.throwIfAborted();
      await cache.put(
        this.url(pkg, '.complete.json'),
        new Response(JSON.stringify(pkg), { headers: { 'content-type': 'application/json' } })
      );
    } catch (error) {
      await caches.delete(this.cacheName(pkg.key));
      throw error;
    }
  }

  async preparePinned(pin: ReleasePin, signal?: AbortSignal): Promise<void> {
    requireResource(
      /^[a-z][a-z0-9-]{0,63}$/.test(pin.appId) && /^\d+\.\d+\.\d+$/.test(pin.version) && /^[a-f0-9]{64}$/.test(pin.key),
      'INVALID',
      '历史资源指纹无效'
    );
    const cached = await this.readPackage(pin);
    if (cached) return this.prepare(cached, signal);
    const response = await this.fetcher(this.url(pin, 'release.json'), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal
    });
    requireResource(response.ok, 'OFFLINE', '固定版本已不在本地，归档资源下载失败');
    const pkg = (await response.json()) as ReleasePackage;
    requireResource(
      pkg.appId === pin.appId && pkg.version === pin.version && pkg.key === pin.key,
      'INTEGRITY',
      '归档清单与固定版本不符'
    );
    await this.prepare(pkg, signal);
  }

  async prune(retained: ReadonlySet<string>): Promise<string[]> {
    const removed: string[] = [];
    for (const name of await caches.keys()) {
      const key = name.slice(this.prefix.length);
      if (!name.startsWith(this.prefix) || !/^[a-f0-9]{64}$/.test(key) || retained.has(key)) continue;
      const cache = await caches.open(name);
      const entries = await cache.keys();
      const belongs =
        entries.length > 0 &&
        entries.every(request => {
          const url = new URL(request.url);
          return url.origin === this.base.origin && url.pathname.startsWith(this.base.pathname + 'releases/');
        });
      if (belongs && (await caches.delete(name))) removed.push(key);
    }
    return removed;
  }

  async response(url: URL): Promise<Response | null> {
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname + 'releases/')) return null;
    const parts = url.pathname.slice((this.base.pathname + 'releases/').length).split('/');
    const pin = { appId: parts[0], version: parts[1], key: parts[2] };
    const pkg = await this.readPackage(pin);
    const resource = pkg?.resources.find(item => item.path === parts.slice(3).join('/'));
    if (!pkg || !resource) return this.unavailable();
    const cache = await caches.open(this.cacheName(pkg.key));
    const response = await cache.match(this.url(pkg, resource.path));
    return (await verifyResource(response, resource.sha256)) ? response! : this.unavailable();
  }

  private async readPackage(pin: ReleasePin): Promise<ReleasePackage | null> {
    if (!/^[a-f0-9]{64}$/.test(pin.key) || !(await caches.has(this.cacheName(pin.key)))) return null;
    const cache = await caches.open(this.cacheName(pin.key));
    const receipt = await cache.match(this.url(pin, '.complete.json'));
    if (!receipt) return null;
    try {
      const pkg = (await receipt.json()) as ReleasePackage;
      await validatePackage(pkg);
      return pkg.appId === pin.appId && pkg.version === pin.version && pkg.key === pin.key ? pkg : null;
    } catch {
      return null;
    }
  }

  private async download(
    cache: Cache,
    pkg: ReleasePackage,
    resource: ReleasePackage['resources'][number],
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted();
    const url = this.url(pkg, resource.path);
    const response = await this.fetcher(url, { cache: 'no-store', credentials: 'same-origin', signal });
    requireResource(await verifyResource(response, resource.sha256), 'INTEGRITY', '版本资源下载失败或完整性校验失败');
    signal?.throwIfAborted();
    await cache.put(url, response);
  }

  private url(pin: ReleasePin, path: string): string {
    return new URL(releasePath(pin) + path, this.base).href;
  }

  private unavailable(): Response {
    return new Response('完整应用版本资源缺失，请联网重新准备；旧版本不会被替换', { status: 503 });
  }
}
