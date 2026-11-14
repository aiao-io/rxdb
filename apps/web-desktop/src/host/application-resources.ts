import { isRecord } from '../core/catalog.js';
import { requireCondition } from '../core/errors.js';
import { releasePath, type ReleasePackage, type ReleasePin } from '../core/release-cache.js';
import type { ResourceReference } from '../core/resource-references.js';
import type { ResourcePriority } from '../core/resource-scheduler.js';

export class ApplicationResources {
  private packages: ReleasePackage[] = [];
  private readonly held = new Map<string, string>();
  constructor(
    private readonly worker: () => ServiceWorker | null,
    private readonly base: URL,
    private readonly signal: AbortSignal
  ) {}

  async load(): Promise<void> {
    if (import.meta.env.DEV) return;
    const status = await this.request({ type: 'status' }, 5000);
    requireCondition(
      isRecord(status) && status['protocol'] === 2,
      'UPDATE_REQUIRED',
      '离线服务仍使用旧资源协议。请准备并确认更新，已保存的数据会保留。'
    );
    const result = await this.request({ type: 'releases' }, 5000);
    requireCondition(isRecord(result) && Array.isArray(result['releases']), 'INVALID', '缺少受控资源目录');
    this.packages = result['releases'] as ReleasePackage[];
  }

  find(appId: string, version: string): ReleasePackage {
    const pkg = this.packages.find(item => item.appId === appId && item.version === version);
    requireCondition(pkg, 'NOT_FOUND', '此版本没有受控资源包；开发模式请使用正式构建验证版本切换');
    return pkg;
  }

  hold(pin: ReleasePin): () => void {
    const id = crypto.randomUUID();
    this.held.set(id, pin.key);
    return () => {
      this.held.delete(id);
    };
  }

  references(): ResourceReference[] {
    return [...this.held].map(([id, key]) => ({ id: `prepare:${id}`, key }));
  }

  async prepare(pin: ReleasePin, options: { priority?: ResourcePriority; signal?: AbortSignal } = {}): Promise<void> {
    const id = crypto.randomUUID();
    const release = this.hold(pin);
    const signal = options.signal ? AbortSignal.any([this.signal, options.signal]) : this.signal;
    const worker = this.worker();
    try {
      const result = await this.request(
        { type: 'prepare-release', ...pin, id, priority: options.priority ?? 'foreground' },
        120000,
        signal,
        () => worker?.postMessage({ type: 'cancel-release', id })
      );
      requireCondition(
        isRecord(result) && result['complete'] === true,
        'OFFLINE',
        isRecord(result) && typeof result['error'] === 'string' ? result['error'] : '应用版本资源未完整准备'
      );
    } finally {
      release();
    }
  }

  async prune(references: ResourceReference[]): Promise<string[]> {
    const result = await this.request({ type: 'prune-releases', references });
    requireCondition(
      isRecord(result) && result['complete'] === true && Array.isArray(result['removed']),
      'OFFLINE',
      isRecord(result) && typeof result['error'] === 'string' ? result['error'] : '资源清理未完成'
    );
    return result['removed'] as string[];
  }

  entry(pin: ReleasePin, entry: string): string {
    return new URL(releasePath(pin) + entry, this.base).href;
  }

  private request(
    data: Record<string, unknown>,
    timeout = 120000,
    signal = this.signal,
    cancelWork: () => void = () => undefined
  ): Promise<unknown> {
    const worker = this.worker();
    requireCondition(worker, 'OFFLINE', '离线服务尚未就绪');
    requireCondition(!signal.aborted, 'CANCELLED', '桌面已关闭');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const cleanup = () => {
        clearTimeout(timer);
        channel.port1.close();
        signal.removeEventListener('abort', cancel);
      };
      const fail = (reason: Error) => {
        cleanup();
        try {
          cancelWork();
        } catch (error) {
          reject(error);
          return;
        }
        reject(reason);
      };
      const cancel = () => fail(new Error('CANCELLED: 资源准备已取消'));
      const timer = setTimeout(() => fail(new Error('TIMEOUT: 应用资源准备超时')), timeout);
      signal.addEventListener('abort', cancel, { once: true });
      channel.port1.onmessage = event => {
        cleanup();
        resolve(event.data);
      };
      try {
        worker.postMessage(data, [channel.port2]);
      } catch (error) {
        cleanup();
        channel.port2.close();
        reject(error);
      }
    });
  }
}
