import { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import setupRxdb, { createWorkbenchDatabase } from './setup_rxdb';

describe('工作台数据库启动', () => {
  it('重复进入应用仍复用同一数据库，只初始化一次', async () => {
    vi.stubEnv('DEV', false);
    const init = vi.spyOn(RxDB.prototype, 'init');
    const database = setupRxdb();
    try {
      expect(setupRxdb()).toBe(database);
      expect(init).toHaveBeenCalledTimes(1);
      expect(await firstValueFrom(database.adapterConnected$('sqlite-wasm'))).toBe(false);
    } finally {
      await database.destroy();
      init.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('默认适配器保留主线程 IndexedDB 组合，取得实例不会提前连接空库', async () => {
    const database = createWorkbenchDatabase();
    try {
      const adapter = await database.getAdapter('sqlite-wasm');
      expect(adapter).toBeInstanceOf(RxDBAdapterSqlite);
      expect(adapter.name).toBe(database.config.sync.local?.adapter);
      expect(adapter.options.vfs).toBe('idb');
      expect(adapter.options.worker).not.toBe(true);
      expect(adapter.options.sharedWorker).not.toBe(true);
      expect(adapter.options.workerInstance).toBeUndefined();
      expect(adapter.options.sharedWorkerInstance).toBeUndefined();
      expect(await firstValueFrom(database.adapterConnected$(adapter.name))).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
