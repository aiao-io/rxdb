import {
  RUNTIME_HOST_CONNECT,
  RUNTIME_HOST_READY,
  connectRuntimeHost,
  isHostMessage,
  type RuntimeHostConnection
} from './runtime-host-protocol.js';

/**
 * 宿主页在宿主源上的路径。不放源根：Nodepod 的 reservedHostPaths 里以 `/` 结尾的条目按前缀匹配，
 * 保留 `/` 等于保留全部路径，宿主页要有自己能精确保留的路径。
 */
export const RUNTIME_HOST_PAGE = '/runtime-host.html';

/** 宿主页只做加载与握手，正常一两秒内就绪；超过这个时间多半是宿主服务没启动。 */
const HOST_READY_TIMEOUT_MS = 20_000;

/** 独立源宿主页的位置。 */
export interface RuntimeHostFrameOptions {
  /** 宿主页独占的源，只来自应用配置。 */
  readonly origin: string;
  /** 运行时标识，用于区分宿主 iframe 与命名。 */
  readonly runtime: string;
}

/**
 * 隐藏加载独立源宿主页，等它就绪后经私有端口连接。
 * 宿主页需要跨源隔离（SharedArrayBuffer），由 `allow` 委托工作台自己的隔离能力；
 * 拆除连接时移除 iframe，宿主里的 Worker 随文档一起结束。
 */
export function openRuntimeHost(document: Document, options: RuntimeHostFrameOptions): Promise<RuntimeHostConnection> {
  const view = document.defaultView;
  if (!view) return Promise.reject(new Error('工作台文档没有窗口，无法加载运行时宿主'));
  const { origin, runtime } = options;
  const frame = document.createElement('iframe');
  frame.name = `aiao-runtime-host-${runtime}-${crypto.randomUUID()}`;
  frame.title = `${runtime} 运行时宿主`;
  frame.dataset['runtimeHost'] = runtime;
  frame.setAttribute('allow', 'cross-origin-isolated');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  frame.src = `${origin}${RUNTIME_HOST_PAGE}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      view.removeEventListener('message', onMessage);
      frame.remove();
      reject(new Error(`运行时宿主 ${origin} 没有响应，请确认宿主服务已启动`));
    }, HOST_READY_TIMEOUT_MS);
    function onMessage(event: MessageEvent): void {
      const target = frame.contentWindow;
      if (!target || event.source !== target || event.origin !== origin) return;
      if (!isHostMessage(event.data, RUNTIME_HOST_READY)) return;
      clearTimeout(timer);
      view?.removeEventListener('message', onMessage);
      const channel = new MessageChannel();
      target.postMessage({ type: RUNTIME_HOST_CONNECT }, origin, [channel.port2]);
      resolve(
        connectRuntimeHost(channel.port1, () => {
          channel.port1.close();
          frame.remove();
        })
      );
    }
    view.addEventListener('message', onMessage);
    document.body.append(frame);
  });
}
