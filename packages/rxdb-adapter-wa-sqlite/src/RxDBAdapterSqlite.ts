import type { RxDB } from '@aiao/rxdb';
import {
  removeOpfsFiles,
  RxDBAdapterSqliteBase,
  RxDBAdapterSqliteError,
  type SqliteBackupStorage,
  type SqliteClientLike
} from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
import { deleteIdbVfsFiles } from './drop-storage.utils.js';
import { DEFAULT_VFS } from './sqlite-load.utils.js';
import { ADAPTER_NAME, type WaSqliteOptions } from './sqlite.interface.js';

/**
 * 浏览器 wa-sqlite 适配器。
 *
 * 复用 {@link RxDBAdapterSqliteBase} 提供的能力（DDL / 仓库代理 / 改动分发），
 * 仅在 {@link RxDBAdapterWaSqlite.createClient} 处注入 wa-sqlite 的
 * {@link createSqliteClient} 与 VFS 加载逻辑。
 */
export class RxDBAdapterWaSqlite extends RxDBAdapterSqliteBase {
  /** 数据库名直接从 RxDB 配置读取，避免与多个 RxDB 实例串号。 */
  readonly #dbName: string;
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: WaSqliteOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
  }

  /**
   * 按当前 VFS，`dropStorage()` 删不删得掉本库（只读检出位建快照库之前问一次，US-313）。
   *
   * @returns `AccessHandlePoolVFS` 为 `false`，其余 VFS 为 `true`
   */
  override canDropStorage(): boolean {
    return this.#storageDrop() !== undefined;
  }

  /**
   * 删掉本库的持久存储（只读检出位回收快照库，US-313）。
   *
   * @throws {@link RxDBAdapterSqliteError} 还连着；OPFS 文件仍被占用；VFS 不支持删除
   *
   * @remarks
   * 位置与连接时同一套推导（库文件 `<库名>.sqlite`）：IndexedDB 系 VFS 在以 VFS 命名的共用库里按路径删记录，
   * OPFS 系删根目录下的库文件与日志旁文件（`-journal` / `-wal` / `OPFSWriteAheadVFS` 的 `-wa0` / `-wa1`），
   * 内存 VFS 断开即无。`AccessHandlePoolVFS` 的文件藏在池里，要把池打开才认得出哪几个属于这个库，不支持。
   */
  override async dropStorage(): Promise<void> {
    this.assertDisconnectedForDrop();
    const drop = this.#storageDrop();
    if (!drop) throw new RxDBAdapterSqliteError(`dropStorage: vfs ${this.options.vfs} 不支持删除存储`);
    await drop();
  }

  /**
   * 备份 / 恢复支持的 VFS：`MemoryVFS` / `MemoryAsyncVFS`（内存）与 `IDBBatchAtomicVFS`（IndexedDB）。
   * 其余 VFS 报 `unsupported_combination`。
   *
   * @remarks
   * 只交付了主线程连接：dedicated Worker / SharedWorker 传输下的备份与恢复还没有实测，
   * 设置了其中任一选项都报 `unsupported_combination`（`field` 为 `transport`）。
   */
  protected override backupStorage(): SqliteBackupStorage {
    const { worker, workerInstance, sharedWorker, sharedWorkerInstance } = this.options;
    if (worker === true || workerInstance !== undefined)
      return { kind: 'unsupported', field: 'transport', actual: 'worker' };
    if (sharedWorker === true || sharedWorkerInstance !== undefined) {
      return { kind: 'unsupported', field: 'transport', actual: 'sharedWorker' };
    }
    const vfs = this.options.vfs ?? DEFAULT_VFS;
    if (vfs === 'MemoryVFS' || vfs === 'MemoryAsyncVFS') return { kind: 'memory', label: 'memory' };
    if (vfs === 'IDBBatchAtomicVFS') return this.persistentBackupStorage('idb');
    return { kind: 'unsupported', field: 'vfs', actual: vfs };
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options, this.clientOwner);
  }

  /**
   * SharedWorker 传输下多个标签页共用 worker 里那一个客户端：给出跨标签页串行事务的锁名（US-314 B2.3b）。
   *
   * @returns 按库名区分的锁名；不走 SharedWorker 时为 `undefined`
   */
  protected override sharedClientLockName(): string | undefined {
    return this.options.sharedWorker === true ? `rxdb-sqlite-shared-client:${ADAPTER_NAME}:${this.#dbName}` : undefined;
  }

  /** 本库存储的删法；`canDropStorage()` 与 `dropStorage()` 共用这一份，删不掉的 VFS 交回 `undefined`。 */
  #storageDrop(): (() => Promise<void>) | undefined {
    const vfs = this.options.vfs ?? DEFAULT_VFS;
    const path = new URL(`${this.#dbName}.sqlite`, 'file://').pathname;
    switch (vfs) {
      case 'MemoryVFS':
      case 'MemoryAsyncVFS':
        return async () => undefined;
      case 'IDBBatchAtomicVFS':
      case 'IDBMirrorVFS':
        return () => deleteIdbVfsFiles(vfs, [path, `${path}-journal`]);
      case 'AccessHandlePoolVFS':
        return undefined;
      case 'OPFSAdaptiveVFS':
      case 'OPFSAnyContextVFS':
      case 'OPFSCoopSyncVFS':
      case 'OPFSWriteAheadVFS': {
        const file = path.slice(1);
        return () => removeOpfsFiles([file, `${file}-journal`, `${file}-wal`, `${file}-wa0`, `${file}-wa1`]);
      }
    }
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterWaSqlite;
  }
}
