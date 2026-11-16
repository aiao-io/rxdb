import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** Service Worker 是 public/ 下的纯脚本：在带假全局对象的沙箱里加载，直接驱动它注册的事件处理器。 */
const script = readFileSync(new URL('../../public/collaboration-sw.js', import.meta.url), 'utf8');
const origin = 'https://app.example';
type Handler = (event: unknown) => void;

function loadWorker() {
  const handlers = new Map<string, Handler>();
  const fetcher = vi.fn();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn(), match: vi.fn() };
  const caches = { open: vi.fn().mockResolvedValue(cache) };
  const scope = {
    location: { origin },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() }
  };
  runInNewContext(script, { self: scope, caches, URL, fetch: fetcher });
  return { handlers, cache, caches, fetcher };
}

/** 构造 fetch 事件；respondWith 收到的 Promise 通过 answer() 取得，没有调用则说明请求不由 Service Worker 处理。 */
function request(url: string, { method = 'GET', mode = 'no-cors' } = {}) {
  let answer: Promise<Response> | undefined;
  const event = {
    request: { url, method, mode },
    respondWith: (response: Promise<Response>) => {
      answer = response;
    }
  };
  return { event, answer: () => answer };
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
    expect(cache.addAll).toHaveBeenCalledWith([
      `${origin}/collaboration`,
      `${origin}/assets/app.js`,
      `${origin}/assets/app.css`
    ]);
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

describe('协作页面的离线 Service Worker：请求拦截', () => {
  const shell = `${origin}/collaboration`;

  it('对 /collaboration 的导航网络优先，成功就刷新缓存的页面外壳', async () => {
    const { handlers, cache, fetcher } = loadWorker();
    fetcher.mockResolvedValue(new Response('<html>online</html>'));
    const { event, answer } = request(shell, { mode: 'navigate' });
    handlers.get('fetch')!(event);
    expect(await (await answer())!.text()).toBe('<html>online</html>');
    expect(cache.put).toHaveBeenCalledWith(shell, expect.any(Response));
  });

  it('离线时用缓存的页面外壳回应导航；没有缓存就原样抛出网络错误', async () => {
    const { handlers, cache, fetcher } = loadWorker();
    fetcher.mockRejectedValue(new TypeError('offline'));
    cache.match.mockResolvedValueOnce(new Response('<html>cached</html>'));
    const cached = request(shell, { mode: 'navigate' });
    handlers.get('fetch')!(cached.event);
    expect(await (await cached.answer())!.text()).toBe('<html>cached</html>');
    expect(cache.match).toHaveBeenCalledWith(shell);
    cache.match.mockResolvedValueOnce(undefined);
    const empty = request(shell, { mode: 'navigate' });
    handlers.get('fetch')!(empty.event);
    await expect(empty.answer()).rejects.toThrow('offline');
  });

  it('同源静态资源以请求本身为键缓存，离线时回放', async () => {
    const { handlers, cache, fetcher } = loadWorker();
    fetcher.mockResolvedValueOnce(new Response('script'));
    const online = request(`${origin}/assets/app.js`);
    handlers.get('fetch')!(online.event);
    await online.answer();
    expect(cache.put).toHaveBeenCalledWith(online.event.request, expect.any(Response));
    fetcher.mockRejectedValueOnce(new TypeError('offline'));
    cache.match.mockResolvedValueOnce(new Response('cached script'));
    const offline = request(`${origin}/assets/app.js`);
    handlers.get('fetch')!(offline.event);
    expect(await (await offline.answer())!.text()).toBe('cached script');
  });

  it.each([
    ['应用其余页面的导航', `${origin}/entities`, { mode: 'navigate' }],
    ['/collaboration 的子路径导航', `${origin}/collaboration/extra`, { mode: 'navigate' }],
    ['非 GET 请求', shell, { method: 'POST', mode: 'navigate' }],
    ['协作接口', `${origin}/collaboration-api/assets.js`, {}],
    ['带查询串的资源', `${origin}/assets/app.js?v=1`, {}],
    ['跨源资源', 'https://cdn.example/lib.js', {}],
    ['非静态资源类型', `${origin}/data.json`, {}]
  ])('不拦截：%s', (_name, url, init) => {
    const { handlers } = loadWorker();
    const { event, answer } = request(url, init);
    handlers.get('fetch')!(event);
    expect(answer()).toBeUndefined();
  });
});
