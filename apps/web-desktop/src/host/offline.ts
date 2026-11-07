import { DesktopError } from '../core/errors.js';

export function waitForActivation(
  worker: EventTarget & { readonly state: ServiceWorkerState },
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      signal?.removeEventListener('abort', cancelled);
    };
    const fail = (code: string, message: string) => {
      cleanup();
      reject(new DesktopError(code, message));
    };
    const cancelled = () => fail('CANCELLED', '桌面已关闭，离线准备停止等待');
    const changed = () => {
      if (worker.state === 'redundant') fail('OFFLINE', '离线资源安装失败，请联网重新准备');
      if (worker.state === 'activated') {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => fail('TIMEOUT', '离线安装等待超时，请联网重新准备'), 120000);
    worker.addEventListener('statechange', changed);
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
    else changed();
  });
}

export function activateWorker(worker: ServiceWorker, workers: EventTarget, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      workers.removeEventListener('controllerchange', changed);
      signal?.removeEventListener('abort', cancelled);
    };
    const changed = () => {
      cleanup();
      resolve();
    };
    const cancelled = () => {
      cleanup();
      reject(new DesktopError('CANCELLED', '桌面已关闭，更新停止等待'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new DesktopError('TIMEOUT', '新版本激活超时，请重试更新；已保存的数据仍保留'));
    }, 15000);
    workers.addEventListener('controllerchange', changed);
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) {
      cancelled();
      return;
    }
    try {
      worker.postMessage({ type: 'activate-confirmed' });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
