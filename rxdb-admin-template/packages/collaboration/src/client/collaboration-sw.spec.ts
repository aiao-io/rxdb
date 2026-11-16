import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** Service Worker 是 public/ 下的纯脚本：在带假全局对象的沙箱里加载，直接驱动它注册的事件处理器。 */
const script = readFileSync(new URL('../../public/collaboration-sw.js', import.meta.url), 'utf8');
const origin = 'https://app.example';
type Handler = (event: unknown) => void;

function loadWorker() {
  const handlers = new Map<string, Handler>();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn(), match: vi.fn() };
  const caches = { open: vi.fn().mockResolvedValue(cache) };
  const scope = {
    location: { origin },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() }
  };
  runInNewContext(script, { self: scope, caches, URL, fetch: vi.fn() });
  return { handlers, cache, caches };
}

/** 构造发给 Service Worker 的 cache-shell 消息；返回需要等待的 waitUntil 任务与应答端口。 */
function cacheShell(source: unknown, urls: unknown = [`${origin}/assets/app.js`]) {
  const port = { postMessage: vi.fn() };
  const tasks: Promise<unknown>[] = [];
  const event = {
    data: { type: 'cache-shell', urls },
    source,
    ports: [port],
    waitUntil: (task: Promise<unknown>) => tasks.push(task)
  };
  return { event, port, settled: () => Promise.all(tasks) };
}

describe('协作页面的离线 Service Worker', () => {
  it('同源窗口发来 cache-shell 时缓存页面外壳与静态资源，并应答成功', async () => {
    const { handlers, cache } = loadWorker();
    const urls = [
      `${origin}/assets/app.js`,
      `${origin}/assets/app.css`,
      `${origin}/assets/app.js?v=1`,
      `${origin}/collaboration-api/config`,
      'https://cdn.example/lib.js',
      42
    ];
    const { event, port, settled } = cacheShell({ url: `${origin}/collaboration` }, urls);
    handlers.get('message')!(event);
    await settled();
    expect(cache.addAll).toHaveBeenCalledWith([`${origin}/collaboration`, `${origin}/assets/app.js`, `${origin}/assets/app.css`]);
    expect(port.postMessage).toHaveBeenCalledWith({ ok: true });
  });

  it.each([
    ['没有 source', null],
    ['没有 url 的 MessagePort', { postMessage: () => undefined }],
    ['没有 url 的 ServiceWorker', { scriptURL: `${origin}/collaboration-sw.js`, state: 'activated' }],
    ['url 不是字符串', { url: 42 }],
    ['url 无法解析', { url: '' }],
    ['跨源窗口', { url: 'https://evil.example/collaboration' }]
  ])('忽略来源不可信的消息而不是抛出未捕获异常：%s', async (_name, source) => {
    const { handlers, caches } = loadWorker();
    const { event, port, settled } = cacheShell(source);
    expect(() => handlers.get('message')!(event)).not.toThrow();
    await settled();
    expect(caches.open).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('忽略类型不是 cache-shell 的消息', async () => {
    const { handlers, caches } = loadWorker();
    const { event, settled } = cacheShell({ url: `${origin}/collaboration` });
    event.data.type = 'something-else';
    handlers.get('message')!(event);
    await settled();
    expect(caches.open).not.toHaveBeenCalled();
  });

  it('缓存失败时向页面应答失败而不是静默超时', async () => {
    const { handlers, cache } = loadWorker();
    cache.addAll.mockRejectedValue(new Error('quota'));
    const { event, port, settled } = cacheShell({ url: `${origin}/collaboration` });
    handlers.get('message')!(event);
    await settled();
    expect(port.postMessage).toHaveBeenCalledWith({ ok: false });
  });
});
