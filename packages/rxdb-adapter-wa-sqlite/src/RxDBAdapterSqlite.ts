import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteBackupStorage, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
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
    return createSqliteClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterWaSqlite;
  }
}
