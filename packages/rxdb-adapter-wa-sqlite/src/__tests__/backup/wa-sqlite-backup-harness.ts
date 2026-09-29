/**
 * wa-sqlite 接入备份共享套件：内存库走 `MemoryAsyncVFS`，持久化走 `IDBBatchAtomicVFS`。
 */
import type { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { SqliteBackupHarness, SqliteBackupStorageKind } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { RxDBAdapterWaSqlite } from '../../RxDBAdapterSqlite.js';
import type { WaSqliteOptions } from '../../sqlite.interface.js';
import { asyncWasmPath } from '../wa-sqlite-wasm.js';

const create = (rxdb: RxDB, vfs: WaSqliteOptions['vfs']): RxDBAdapterSqliteBase =>
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  new RxDBAdapterWaSqlite(rxdb, {
    vfs,
    async: true,
    worker: false,
    wasmPath: asyncWasmPath,
    batchTimeout: 1
  }) as unknown as RxDBAdapterSqliteBase;

/** wa-sqlite 的备份后端契约。 */
export const waSqliteBackupHarness: SqliteBackupHarness = {
  adapterName: 'wa-sqlite',
  persistentLabel: 'idb',
  storageKinds: ['memory', 'persistent'],
  createAdapter: (rxdb: RxDB, kind: SqliteBackupStorageKind) =>
    create(rxdb, kind === 'persistent' ? 'IDBBatchAtomicVFS' : 'MemoryAsyncVFS'),
  unsupportedConfiguration: { createAdapter: (rxdb: RxDB) => create(rxdb, 'AccessHandlePoolVFS'), field: 'vfs' },
  // npm `wa-sqlite` 的预编译 wasm 没编进 FTS5。
  fts5: false,
  // IDBBatchAtomicVFS 不提供 WAL 需要的共享内存，连接初始化请求的 WAL 被静默保留为默认的 delete。
  persistentJournalMode: 'delete',
  engineObjects: null,
  interruptWorker: () => new Worker(new URL('./backup-interrupt.worker.ts', import.meta.url), { type: 'module' }),
  foreignHost: { unsupported: '浏览器后端同属一个 origin、共享 Web Locks，同页第二个实例已覆盖并发' },
  channelHost: { unsupported: '浏览器后端没有桌面 renderer / host 协议通道，Worker 被强杀的断开由强杀用例覆盖' }
};
