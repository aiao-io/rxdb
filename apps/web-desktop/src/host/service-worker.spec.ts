import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { ResourceReferences } from '../core/resource-references.js';
import { ResourceScheduler } from '../core/resource-scheduler.js';

const source = readFileSync(new URL('../../tools/service-worker.js', import.meta.url), 'utf8');

const pin = { appId: 'editor', version: '1.0.0', key: 'a'.repeat(64) };
const turn = () => new Promise<void>(resolve => queueMicrotask(resolve));

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const match = vi.fn(async () => new Response('完整旧外壳'));
  const fetch = vi.fn(async () => new Response('尚未确认的新外壳'));
  const prepare = vi.fn(async (_pin: unknown, signal: AbortSignal) => signal.throwIfAborted());
  const prune = vi.fn(async (_retained: Set<string>): Promise<string[]> => []);
  const matchAll = vi.fn(async (): Promise<{ id: string; url: string }[]> => []);
  runInNewContext(source, {
    AbortController,
    Error,
    clients: { matchAll },
    ResourceScheduler,
    ResourceReferences,
    BUILD: { version: 'old', resources: [{ path: 'index.html', sha256: 'hash' }], releases: [pin] },
    URL,
    Response,
    fetch,
    caches: { open: async () => ({ match }) },
    ReleaseCache: class {
      prepare = prepare;
      preparePinned = prepare;
      prune = prune;
      async complete() {
        return true;
      }
      async response() {
        return undefined;
      }
    },
    location: { href: 'https://desktop.test/space/sw.js' },
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler)
  });
  const message = (data: Record<string, unknown>, id = 'desktop', url = 'https://desktop.test/space/') => {
    const reply = vi.fn();
    let pending = Promise.resolve();
    listeners.get('message')!({
      data,
      source: { id, url },
      ports: [{ postMessage: reply }],
      waitUntil: (value: Promise<void>) => (pending = value)
    });
    return { reply, pending };
  };
  return { listeners, match, fetch, prepare, prune, matchAll, message };
}

describe('DESKTOP-US-502 外壳资源版本隔离', () => {
  it.each(['/space/', '/space/?from=bookmark', '/space/index.html'])('导航 %s 始终使用当前完整外壳', async path => {
    const fixture = worker();
    let response: Promise<Response> | undefined;
    fixture.listeners.get('fetch')?.({
      request: { url: `https://desktop.test${path}`, method: 'GET', mode: 'navigate' },
      respondWith: (pending: Promise<Response>) => (response = pending)
    });
    expect(await (await response)?.text()).toBe('完整旧外壳');
    expect(fixture.match).toHaveBeenCalledWith('https://desktop.test/space/index.html');
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it('已有 status 协议声明受控应用资源协议版本', async () => {
    const fixture = worker();
    const reply = vi.fn();
    let pending: Promise<void> | undefined;
    fixture.listeners.get('message')?.({
      data: { type: 'status' },
      ports: [{ postMessage: reply }],
      waitUntil: (value: Promise<void>) => (pending = value)
    });
    await pending;
    expect(reply).toHaveBeenCalledWith({ version: 'old', protocol: 2, complete: true });
  });
});

describe('DESKTOP-US-307 Worker 资源任务与清理协议', () => {
  it('同版本共享下载；取消按客户端隔离，后台取消不终止前台请求', async () => {
    const fixture = worker();
    let finish: () => void = () => undefined;
    fixture.prepare.mockImplementation(
      (_pin, signal) =>
        new Promise<void>((resolve, reject) => {
          finish = resolve;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const background = fixture.message({ type: 'prepare-release', ...pin, id: 'shared', priority: 'background' });
    const foreground = fixture.message(
      { type: 'prepare-release', ...pin, id: 'shared', priority: 'foreground' },
      'other'
    );
    await vi.waitFor(() => expect(fixture.prepare).toHaveBeenCalledTimes(1));
    fixture.message({ type: 'cancel-release', id: 'shared' }, 'unrelated');
    await turn();
    expect(background.reply).not.toHaveBeenCalled();
    expect(foreground.reply).not.toHaveBeenCalled();
    fixture.message({ type: 'cancel-release', id: 'shared' });
    await background.pending;
    expect(background.reply).toHaveBeenCalledWith({ complete: false, error: expect.stringContaining('CANCELLED') });
    expect(fixture.prepare.mock.calls[0][1].aborted).toBe(false);
    finish();
    await foreground.pending;
    expect(foreground.reply).toHaveBeenCalledWith({ complete: true });
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
  });

  it('重复请求身份被拒绝，原请求仍可独立取消', async () => {
    const fixture = worker();
    fixture.prepare.mockImplementation(
      (_pin, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const data = { type: 'prepare-release', ...pin, id: 'one', priority: 'foreground' };
    const first = fixture.message(data);
    await vi.waitFor(() => expect(fixture.prepare).toHaveBeenCalledTimes(1));
    const duplicate = fixture.message(data);
    await duplicate.pending;
    expect(duplicate.reply).toHaveBeenCalledWith({ complete: false, error: expect.stringContaining('INVALID') });
    fixture.message({ type: 'cancel-release', id: 'one' });
    await first.pending;
    expect(first.reply).toHaveBeenCalledWith({ complete: false, error: expect.stringContaining('CANCELLED') });
    expect(fixture.prepare.mock.calls[0][1].aborted).toBe(true);
  });

  it('清理同时保留宿主、活 iframe、运行和排队任务引用', async () => {
    const fixture = worker();
    fixture.prepare.mockImplementation(
      (_pin, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const keys = ['a', 'b', 'c'].map(value => value.repeat(64));
    const requests = keys.map((key, index) =>
      fixture.message({
        type: 'prepare-release',
        ...pin,
        key,
        id: String(index),
        priority: 'foreground'
      })
    );
    await vi.waitFor(() => expect(fixture.prepare).toHaveBeenCalledTimes(2));
    const installed = 'd'.repeat(64);
    const live = 'e'.repeat(64);
    fixture.matchAll.mockResolvedValue([
      { id: 'frame', url: `https://desktop.test/space/releases/editor/1.0.0/${live}/editor.html` },
      { id: 'foreign', url: `https://other.test/space/releases/editor/1.0.0/${'f'.repeat(64)}/editor.html` }
    ]);
    const cleanup = fixture.message({ type: 'prune-releases', references: [{ id: 'installed', key: installed }] });
    await cleanup.pending;
    expect([...fixture.prune.mock.calls[0][0]].sort()).toEqual([...keys, installed, live].sort());
    expect(fixture.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
    expect(cleanup.reply).toHaveBeenCalledWith(expect.objectContaining({ complete: true, removed: [] }));
    keys.forEach((_key, index) => fixture.message({ type: 'cancel-release', id: String(index) }));
    await Promise.all(requests.map(request => request.pending));
  });

  it('清理完成前不开始新资源写入，应用 iframe 无权请求清理', async () => {
    const fixture = worker();
    const denied = fixture.message(
      { type: 'prune-releases', references: [] },
      'frame',
      'https://desktop.test/space/editor.html'
    );
    await denied.pending;
    expect(denied.reply).toHaveBeenCalledWith({ complete: false, error: expect.stringContaining('DENIED') });
    expect(fixture.prune).not.toHaveBeenCalled();
    let finish: () => void = () => undefined;
    fixture.prune.mockImplementation(
      () =>
        new Promise<string[]>(resolve => {
          finish = () => resolve([]);
        })
    );
    const cleanup = fixture.message({ type: 'prune-releases', references: [] });
    const request = fixture.message({ type: 'prepare-release', ...pin, id: 'one', priority: 'foreground' });
    await vi.waitFor(() => expect(fixture.prune).toHaveBeenCalledTimes(1));
    expect(fixture.prepare).not.toHaveBeenCalled();
    finish();
    await Promise.all([cleanup.pending, request.pending]);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(request.reply).toHaveBeenCalledWith({ complete: true });
  });
});
