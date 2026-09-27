/**
 * US-217 阶段 B：备份矩阵只交付了主线程连接，Worker / SharedWorker 传输在备份、恢复、清理入口都直接拒绝，
 * 且不碰输出流与归档源。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterWaSqlite } from '../../RxDBAdapterSqlite.js';
import type { WaSqliteOptions } from '../../sqlite.interface.js';

const createAdapter = (options: Partial<WaSqliteOptions>): RxDBAdapterWaSqlite => {
  const rxdb = new RxDB({
    dbName: `backup-transport-${crypto.randomUUID()}`,
    context: { userId: 'backup-user' },
    entities: [],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  return new RxDBAdapterWaSqlite(rxdb, { vfs: 'IDBBatchAtomicVFS', ...options });
};

const TRANSPORTS = [
  { actual: 'worker', options: { worker: true } },
  { actual: 'sharedWorker', options: { sharedWorker: true } }
] as const;

describe('wa-sqlite backup over worker transports', () => {
  for (const { actual, options } of TRANSPORTS) {
    it(`rejects backup, restore and cleanup with the ${actual} transport`, async () => {
      const adapter = createAdapter(options);
      const expected = { code: 'unsupported_combination', details: { field: 'transport', actual } };
      let pulled = false;
      // highWaterMark 0：流不会在构造时预拉，只有消费方读取才会触发 pull
      const source = new ReadableStream<Uint8Array>(
        {
          pull: () => {
            pulled = true;
          }
        },
        { highWaterMark: 0 }
      );
      const sink = new WritableStream<Uint8Array>();
      await expect(adapter.backup(sink)).rejects.toMatchObject(expected);
      expect(sink.locked).toBe(false);
      await expect(adapter.restore(source)).rejects.toMatchObject(expected);
      expect(pulled).toBe(false);
      await expect(adapter.cleanupIncompleteRestore()).rejects.toMatchObject(expected);
      await adapter.disconnect();
    });
  }
});
