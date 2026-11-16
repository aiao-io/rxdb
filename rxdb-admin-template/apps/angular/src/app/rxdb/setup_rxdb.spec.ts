import { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import setupRxdb, { ANONYMOUS_LOCAL_USER_ID, createWorkbenchDatabase } from './setup_rxdb';

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

  it('匿名本机身份保持历史取值，数据库上下文使用同一个常量', async () => {
    // 已有本机库的历史与活动记录都以 'userId' 归属；改值会让这些记录脱离当前身份
    expect(ANONYMOUS_LOCAL_USER_ID).toBe('userId');
    const database = createWorkbenchDatabase();
    try {
      expect(database.context.userId).toBe(ANONYMOUS_LOCAL_USER_ID);
    } finally {
      await database.destroy();
    }
  });

  it('默认适配器保留主线程 IndexedDB 组合，取得实例不会提前连接空库', async () => {
    const database = createWorkbenchDatabase();
    try {
      const adapter = await database.getAdapter('sqlite-wasm');
      const { RxDBAdapterSqlite } = await import('@aiao/rxdb-adapter-sqlite-wasm');
      expect(adapter).toBeInstanceOf(RxDBAdapterSqlite);
      expect(adapter.name).toBe(database.config.sync.local?.adapter);
      expect(adapter.options.vfs).toBe('idb');
      expect(adapter.options.wasmUrl).toBe(new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href);
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
