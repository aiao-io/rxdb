/**
 * sqlite-wasm 接入备份共享套件：内存库走 `memory` VFS，持久化走 `idb` VFS（异步 wasm）。
 */
import type { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { SqliteBackupHarness, SqliteBackupStorageKind } from '@aiao/rxdb-adapter-sqlite-core/testing';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { RxDBAdapterSqlite } from '../../RxDBAdapterSqlite.js';
import type { SqliteOptions } from '../../sqlite.interface.js';

const create = (rxdb: RxDB, vfs: NonNullable<SqliteOptions['vfs']>, wasmUrl: string): RxDBAdapterSqliteBase =>
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  new RxDBAdapterSqlite(rxdb, { vfs, wasmUrl, batchTimeout: 1 }) as unknown as RxDBAdapterSqliteBase;

/** sqlite-wasm 的备份后端契约。 */
export const sqliteWasmBackupHarness: SqliteBackupHarness = {
  adapterName: 'sqlite-wasm',
  persistentLabel: 'idb',
  createAdapter: (rxdb: RxDB, kind: SqliteBackupStorageKind) =>
    kind === 'persistent' ? create(rxdb, 'idb', sqliteWasmAsyncUrl) : create(rxdb, 'memory', sqliteWasmUrl),
  createUnsupportedAdapter: (rxdb: RxDB) => create(rxdb, 'opfs', sqliteWasmUrl),
  unsupportedField: 'vfs',
  fts5: true,
  // idb VFS 不提供 WAL 需要的共享内存，连接初始化请求的 WAL 被静默保留为默认的 delete。
  persistentJournalMode: 'delete',
  engineObjects: null,
  interruptWorker: () => new Worker(new URL('./backup-interrupt.worker.ts', import.meta.url), { type: 'module' })
};
