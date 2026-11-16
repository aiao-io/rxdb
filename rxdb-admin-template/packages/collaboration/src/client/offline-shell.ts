/** 只缓存协作页面与静态资源，业务请求始终经过真实服务端或明确离线分支。 */
export async function prepareOfflineShell(): Promise<void> {
  if (!navigator.onLine || !('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register('/collaboration-sw.js');
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error('离线页面缓存尚未激活');
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
