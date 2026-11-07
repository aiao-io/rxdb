import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseCache, releaseFingerprint, releasePath, type ReleasePackage } from './release-cache.js';

const base = new URL(`./release-test-${crypto.randomUUID()}/`, window.location.href);
const names = new Set<string>();
async function fixture() {
  const source = new Map([
    ['editor.html', '<script src="./assets/app.js"></script>'],
    ['assets/app.js', 'globalThis.releaseStarted = true;']
  ]);
  const resources = await Promise.all(
    [...source].map(async ([path, body]) => ({
      path,
      sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte =>
        byte.toString(16).padStart(2, '0')
      ).join('')
    }))
  );
  const definition = { appId: 'editor', version: '1.0.0', entry: 'editor.html', resources };
  const pkg: ReleasePackage = { ...definition, key: await releaseFingerprint(definition) };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('取消', 'AbortError');
    const path = new URL(url).pathname.slice(new URL(releasePath(pkg), base).pathname.length);
    return new Response(source.get(path) ?? '不存在', { status: source.has(path) ? 200 : 404 });
  });
  const cache = new ReleaseCache(base, fetcher, `desktop-release-test-${crypto.randomUUID()}-`);
  names.add(cache.cacheName(pkg.key));
  return { pkg, source, fetcher, cache };
}
afterEach(async () => {
  await Promise.all([...names].map(name => caches.delete(name)));
  names.clear();
});

describe('DESKTOP-US-204/502 完整且不可混用的版本资源', () => {
  it('校验每个资源后才完成准备，只下载静态字节，不执行脚本', async () => {
    const { pkg, cache, fetcher } = await fixture();
    expect(await cache.complete(pkg)).toBe(false);
    await cache.prepare(pkg);
    expect(await cache.complete(pkg)).toBe(true);
    const entry = new URL(releasePath(pkg) + pkg.entry, base);
    expect(await (await cache.response(entry))!.text()).toContain('./assets/app.js');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await cache.prepare(pkg);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect('releaseStarted' in globalThis).toBe(false);
    expect(await cache.response(new URL('other.html', base))).toBeNull();
  });
  it('缺失或校验失败删除半成品，完整旧版本仍可使用', async () => {
    const { pkg, cache, fetcher } = await fixture();
    await cache.prepare(pkg);
    const nextDefinition = { ...pkg, version: '1.1.0' };
    const next = { ...nextDefinition, key: await releaseFingerprint(nextDefinition) };
    names.add(cache.cacheName(next.key));
    fetcher.mockImplementation(async () => new Response('损坏的新脚本'));
    await expect(cache.prepare(next)).rejects.toThrow('INTEGRITY');
    expect(await caches.has(cache.cacheName(next.key))).toBe(false);
    expect(await cache.complete(pkg)).toBe(true);
    expect((await cache.response(new URL(releasePath(next) + next.entry, base)))?.status).toBe(503);
    expect((await cache.response(new URL(releasePath(pkg) + pkg.entry, base)))?.status).toBe(200);
  });
  it('取消准备、无效路径和伪造指纹不能成为可用版本', async () => {
    const { pkg, cache, fetcher } = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(cache.prepare(pkg, controller.signal)).rejects.toThrow();
    expect(await cache.complete(pkg)).toBe(false);
    fetcher.mockClear();
    await expect(
      cache.prepare({ ...pkg, resources: [{ path: '../other.js', sha256: 'a'.repeat(64) }] })
    ).rejects.toThrow('INVALID');
    await expect(cache.prepare({ ...pkg, key: 'f'.repeat(64) })).rejects.toThrow('INTEGRITY');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('资源目录切换后仍按历史指纹修复；找不到完整包时不借用其他版本', async () => {
    const { pkg, cache, fetcher } = await fixture();
    await cache.prepare(pkg);
    const storage = await caches.open(cache.cacheName(pkg.key));
    await storage.delete(new URL(releasePath(pkg) + 'assets/app.js', base).href);
    await cache.preparePinned(pkg);
    expect(await cache.complete(pkg)).toBe(true);
    await caches.delete(cache.cacheName(pkg.key));
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) =>
      url.endsWith('/release.json') ? new Response(JSON.stringify(pkg)) : original(url, init)
    );
    await cache.preparePinned(pkg);
    expect(await cache.complete(pkg)).toBe(true);
    await caches.delete(cache.cacheName(pkg.key));
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ ...pkg, version: '1.1.0' })));
    await expect(cache.preparePinned(pkg)).rejects.toThrow('INTEGRITY');
    expect(await cache.complete(pkg)).toBe(false);
  });
  it('完整标记不能掩盖缺失或损坏资源，重新准备可修复', async () => {
    const { pkg, cache } = await fixture();
    await cache.prepare(pkg);
    const storage = await caches.open(cache.cacheName(pkg.key));
    const script = new URL(releasePath(pkg) + 'assets/app.js', base).href;
    await storage.delete(script);
    expect(await cache.complete(pkg)).toBe(false);
    await cache.prepare(pkg);
    await storage.put(script, new Response('被破坏'));
    expect(await cache.complete(pkg)).toBe(false);
    expect((await cache.response(new URL(script)))?.status).toBe(503);
    await cache.prepare(pkg);
    expect(await cache.complete(pkg)).toBe(true);
  });
  it('仅回收当前部署的无引用版本，保留被引用和其他部署的缓存', async () => {
    const { pkg, cache } = await fixture();
    await cache.prepare(pkg);
    const unused = 'f'.repeat(64);
    const foreign = 'e'.repeat(64);
    names.add(cache.cacheName(unused));
    names.add(cache.cacheName(foreign));
    const unusedCache = await caches.open(cache.cacheName(unused));
    await unusedCache.put(new URL(`releases/editor/0.9.0/${unused}/editor.html`, base), new Response('过期'));
    const foreignCache = await caches.open(cache.cacheName(foreign));
    await foreignCache.put(
      new URL('/other-deployment/releases/editor/1.0.0/editor.html', base),
      new Response('其他部署')
    );
    expect(await cache.prune(new Set([pkg.key]))).toEqual([unused]);
    expect(await cache.complete(pkg)).toBe(true);
    expect(await caches.has(cache.cacheName(foreign))).toBe(true);
    expect(await caches.has(cache.cacheName(unused))).toBe(false);
    expect(await cache.prune(new Set())).toEqual([pkg.key]);
  });
});
