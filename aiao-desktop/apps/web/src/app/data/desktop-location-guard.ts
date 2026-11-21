import { BehaviorSubject } from 'rxjs';

import { DataSelectionStorage, DesktopDataLocation, dataLocation, readDataSelection } from './desktop-data-location';
import { pendingEraseGeneration } from './desktop-erase';

/** 普通事务共享这把锁；切换活动存储时独占，等待已开始的事务提交。 */
export const DATA_WRITE_LOCK = 'aiao-desktop-data-write';

export class DesktopDataReplacedError extends Error {
  constructor() {
    super('Desktop data was restored or erased in another tab. Keep a copy of unsaved text, then reload the desktop.');
    this.name = 'DesktopDataReplacedError';
  }
}

/** 每个页面固定一代；坏指针在启动检查时报告，绝不连接并写入默认位置。 */
export class DesktopLocationGuard {
  readonly #replaced = new BehaviorSubject(false);
  #selectionError: unknown;
  readonly replaced$ = this.#replaced.asObservable();
  readonly location: DesktopDataLocation;

  constructor(
    private readonly storage?: Pick<DataSelectionStorage, 'getItem'>,
    location = dataLocation(null)
  ) {
    this.location = location;
    if (!storage) return;
    try {
      this.location = dataLocation(pendingEraseGeneration(storage) ?? readDataSelection(storage).active);
    } catch (error) {
      this.#selectionError = error;
    }
  }

  assertCurrent(): void {
    if (this.#selectionError) throw this.#selectionError;
    if (!this.storage) return;
    const pending = pendingEraseGeneration(this.storage);
    if (pending !== null && pending === this.location.generation)
      throw new Error('Desktop data erase is still in progress. Reload to finish.');
    if (
      this.#replaced.value ||
      pending !== null ||
      readDataSelection(this.storage).active !== this.location.generation
    ) {
      this.#replaced.next(true);
      throw new DesktopDataReplacedError();
    }
  }

  async write<T>(task: () => Promise<T>): Promise<T> {
    if (!this.storage) return task();
    if (!navigator.locks) throw new Error('Desktop writes require Web Locks.');
    return navigator.locks.request(DATA_WRITE_LOCK, { mode: 'shared' }, () => {
      this.assertCurrent();
      return task();
    });
  }
}
