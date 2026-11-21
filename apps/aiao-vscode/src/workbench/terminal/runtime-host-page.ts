import { RUNTIME_HOST_CONNECT, RUNTIME_HOST_READY, isHostMessage } from './runtime-host-protocol.js';

/** 宿主里项目的挂载点：协议里的相对路径都相对它。 */
export const PROJECT_ROOT = '/project';

/** 相对项目根的路径换成宿主文件系统的绝对路径；宿主只接受项目内的相对路径。 */
export function projectPath(path: string): string {
  if (path === '' || path === '.') return PROJECT_ROOT;
  if (path.split('/').some(part => part === '' || part === '.' || part === '..'))
    throw new Error(`宿主只接受项目内的相对路径：${path}`);
  return `${PROJECT_ROOT}/${path}`;
}

/**
 * 宿主页一侧的握手：向父窗口宣告就绪，只接受父窗口从允许的工作台来源发来的第一次连接，把私有端口交给 onConnect。
 * 就绪通知不带数据，发往 `*`；逐个来源发送会在不匹配时留下控制台警告。
 */
export function acceptHostConnection(
  view: Window,
  parents: readonly string[],
  onConnect: (port: MessagePort) => void
): void {
  function onMessage(event: MessageEvent): void {
    const port = event.ports[0];
    if (!port || event.source !== view.parent || !parents.includes(event.origin)) return;
    if (!isHostMessage(event.data, RUNTIME_HOST_CONNECT)) return;
    view.removeEventListener('message', onMessage);
    onConnect(port);
  }
  view.addEventListener('message', onMessage);
  view.parent.postMessage({ type: RUNTIME_HOST_READY }, '*');
}
