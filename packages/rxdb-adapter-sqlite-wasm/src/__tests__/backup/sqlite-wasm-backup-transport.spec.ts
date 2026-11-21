/**
 * US-217：未交付的 idb Worker / SharedWorker 传输在备份、恢复、清理入口都直接拒绝，
 * 且不碰输出流与归档源。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../../RxDBAdapterSqlite.js';
import type { SqliteOptions } from '../../sqlite.interface.js';

const createAdapter = (options: Partial<SqliteOptions>): RxDBAdapterSqlite => {
  const rxdb = new RxDB({
    dbName: `backup-transport-${crypto.randomUUID()}`,
    context: { userId: 'backup-user' },
    entities: [],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  return new RxDBAdapterSqlite(rxdb, { vfs: 'idb', ...options });
};

const TRANSPORTS = [
  { actual: 'worker', options: { worker: true } },
  { actual: 'sharedWorker', options: { sharedWorker: true } }
] as const;

describe('sqlite-wasm backup over worker transports', () => {
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

  // 只传实例时连接会推断出 Worker 传输，备份一样得拒绝
  it('rejects backup when only a worker instance is given', async () => {
    const worker = new Worker(new URL('../sqlite-wasm-lifecycle.worker.ts', import.meta.url), { type: 'module' });
    try {
      const adapter = createAdapter({ workerInstance: worker });
      await expect(adapter.backup(new WritableStream<Uint8Array>())).rejects.toMatchObject({
        code: 'unsupported_combination',
        details: { field: 'transport', actual: 'worker' }
      });
      await adapter.disconnect();
    } finally {
      worker.terminate();
    }
  });
});

it('OPFS 恢复拒绝连接释放时就终止的 Worker，避免成功后无法重连', async () => {
  const adapter = createAdapter({ vfs: 'opfs', worker: true, workerOwnership: 'client' });
  const expected = { code: 'unsupported_combination', details: { field: 'workerOwnership', actual: 'client' } };
  await expect(adapter.restore(new ReadableStream({ start: controller => controller.close() }))).rejects.toMatchObject(
    expected
  );
  await expect(adapter.cleanupIncompleteRestore()).rejects.toMatchObject(expected);
  await adapter.disconnect();
});
