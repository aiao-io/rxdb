import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { SqliteBackupHarness } from '@aiao/rxdb-adapter-sqlite-core/testing';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';

import { RxDBAdapterSqlite } from '../../RxDBAdapterSqlite.js';
import { sqliteWasmBackupHarness } from './sqlite-wasm-backup-harness.js';

const workers = new Set<Worker>();

function sqliteWorker(): Worker {
  const worker = new Worker(new URL('../sqlite-wasm-lifecycle.worker.ts', import.meta.url), { type: 'module' });
  workers.add(worker);
  return worker;
}

/** 所有数据库关闭后释放调用方持有的 Worker。 */
export function releaseOpfsBackupWorkers(): void {
  for (const worker of workers) worker.terminate();
  workers.clear();
}

/** OPFS 的真实专用 Worker 路径，共享套件覆盖快照、恢复、失败与强杀。 */
export const sqliteWasmOpfsBackupHarness: SqliteBackupHarness = {
  ...sqliteWasmBackupHarness,
  persistentLabel: 'opfs',
  createAdapter: (rxdb, kind) =>
    kind === 'memory' ?
      sqliteWasmBackupHarness.createAdapter(rxdb, kind)
    : (new RxDBAdapterSqlite(rxdb, {
        vfs: 'opfs',
        wasmUrl: sqliteWasmUrl,
        batchTimeout: 1,
        worker: true,
        workerInstance: sqliteWorker(),
        workerOwnership: 'caller'
      }) as unknown as RxDBAdapterSqliteBase),
  interruptWorker: () => new Worker(new URL('./opfs-backup-interrupt.worker.ts', import.meta.url), { type: 'module' })
};
