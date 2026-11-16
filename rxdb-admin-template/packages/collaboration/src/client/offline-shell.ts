/** 只接管协作页面本身，不拦截应用其余页面，也不与宿主应用自己的 Service Worker 争抢控制权。 */
const scope = '/collaboration';

/** 等 Service Worker 进入终态：激活则完成，安装失败（redundant）则报错。 */
function activation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return;
      worker.removeEventListener('statechange', settle);
      if (worker.state === 'activated') resolve();
      else reject(new Error('离线页面缓存尚未激活'));
    };
    worker.addEventListener('statechange', settle);
    settle();
  });
}

/**
 * 等注册对象里的 Service Worker 激活并返回它。
 * 不用 navigator.serviceWorker.ready：它按页面创建时的 URL 匹配 scope，
 * 从其他路由经 SPA 导航进入协作页时永远不会 resolve。
 */
async function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  const pending = registration.installing ?? registration.waiting;
  if (!registration.active && pending) await activation(pending);
  const worker = registration.active ?? pending;
  if (!worker) throw new Error('离线页面缓存尚未激活');
  return worker;
}

/** 只缓存协作页面与静态资源，业务请求始终经过真实服务端或明确离线分支。 */
export async function prepareOfflineShell(): Promise<void> {
  if (!navigator.onLine || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register('/collaboration-sw.js', { scope });
  const worker = await activeWorker(registration);
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('离线页面缓存超时'));
    }, 30000);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.ok) resolve();
      else reject(new Error('离线页面缓存失败'));
    };
    worker.postMessage(
      { type: 'cache-shell', urls: performance.getEntriesByType('resource').map(entry => entry.name) },
      [channel.port2]
    );
  });
}
