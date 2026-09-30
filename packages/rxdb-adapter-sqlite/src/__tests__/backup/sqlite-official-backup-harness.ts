/**
 * 官方 sqlite 接入备份共享套件：内存库直接在当前线程打开，持久化走专用 Worker 里的 OPFS。
 */
import type { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { SqliteBackupHarness, SqliteBackupStorageKind } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { RxDBAdapterSqlite } from '../../RxDBAdapterSqliteOfficial.js';
import type { SqliteOptions } from '../../sqlite-official.interface.js';

const workers = new Map<RxDB, Worker>();

const create = (rxdb: RxDB, options: Omit<SqliteOptions, 'batchTimeout'>): RxDBAdapterSqliteBase =>
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  new RxDBAdapterSqlite(rxdb, { ...options, batchTimeout: 1 }) as unknown as RxDBAdapterSqliteBase;

/** OPFS 的同步访问句柄只在 Worker 里可用：每个实例一个客户端 Worker，实例释放时终止。 */
const createPersistent = (rxdb: RxDB): RxDBAdapterSqliteBase => {
  const worker = new Worker(new URL('../sqlite-official-test.worker', import.meta.url), { type: 'module' });
  workers.set(rxdb, worker);
  return create(rxdb, { opfs: true, opfsFallback: 'throw', worker: true, workerInstance: worker });
};

/** 官方 sqlite 的备份后端契约。 */
export const sqliteOfficialBackupHarness: SqliteBackupHarness = {
  adapterName: 'sqlite',
  persistentLabel: 'opfs',
  storageKinds: ['memory', 'persistent'],
  createAdapter: (rxdb: RxDB, kind: SqliteBackupStorageKind) =>
    kind === 'persistent' ? createPersistent(rxdb) : create(rxdb, {}),
  // OPFS 打不开时静默落到内存，恢复目标不确定。
  unsupportedConfiguration: {
    createAdapter: (rxdb: RxDB) => create(rxdb, { opfs: true, opfsFallback: 'memory' }),
    field: 'opfsFallback'
  },
  fts5: true,
  // 官方 opfs VFS 不提供 WAL 需要的共享内存，连接初始化请求的 WAL 被静默保留为默认的 delete。
  persistentJournalMode: 'delete',
  engineObjects: null,
  interruptWorker: () => new Worker(new URL('./backup-interrupt.worker.ts', import.meta.url), { type: 'module' }),
  foreignHost: { unsupported: '浏览器后端同属一个 origin、共享 Web Locks，同页第二个实例已覆盖并发' },
  channelHost: { unsupported: '浏览器后端没有桌面 renderer / host 协议通道，Worker 被强杀的断开由强杀用例覆盖' },
  release: (rxdb: RxDB) => {
    workers.get(rxdb)?.terminate();
    workers.delete(rxdb);
  }
};
