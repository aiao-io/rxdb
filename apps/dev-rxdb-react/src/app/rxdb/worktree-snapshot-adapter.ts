import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url';

/**
 * 只读检出位的快照库适配器（US-313）。
 *
 * @remarks
 * 主库跑在 Worker / SharedWorker 里，Worker 里的客户端初始化过一次就直接复用：照搬主库的工厂，
 * 快照实例会悄悄连到主库上。快照库因此走主线程的 IndexedDB VFS，库名取快照实例自己的
 * `config.dbName`（每个检出位一个）。这种存储 `dropStorage()` 删得掉，关闭检出位时快照库随之删除。
 *
 * @param db - 快照实例
 * @returns 快照库的适配器
 */
export const createWorktreeSnapshotAdapter = (db: RxDB): RxDBAdapterSqlite =>
  new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: sqliteWasmAsyncUrl });
