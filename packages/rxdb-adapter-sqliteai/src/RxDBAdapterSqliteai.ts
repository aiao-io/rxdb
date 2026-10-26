import type { RxDB } from '@aiao/rxdb';
import {
  get_persistent_db_file_name,
  removeOpfsFiles,
  RxDBAdapterSqliteBase,
  type SqliteBackupStorage,
  type SqliteClientLike
} from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
import { ADAPTER_NAME, type SqliteaiOptions } from './sqliteai.interface.js';

/**
 * 基于 `@sqliteai/sqlite-wasm` 的 RxDB 本地存储适配器。
 *
 * 与 `rxdb-adapter-sqlite`（官方 sqlite-wasm 绑定）API 对齐，差异：
 * - WASM 二进制来自 SqliteAI 的发行版（OPFS / Worker 配置一致）
 * - 客户端实现继承 `Oo1ClientBase`，复用 sqlite-core 的队列与事件批处理
 */
export class RxDBAdapterSqliteai extends RxDBAdapterSqliteBase {
  readonly #dbName: string;
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: SqliteaiOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
  }

  /**
   * `dropStorage()` 删不删得掉本库（只读检出位建快照库之前问一次，US-313）。
   *
   * @returns 恒为 `true`：不开 OPFS 是内存库，断开即无；开 OPFS 删根目录下的库文件
   */
  override canDropStorage(): boolean {
    return true;
  }

  /**
   * 删掉本库的持久存储（只读检出位回收快照库，US-313）。
   *
   * @throws {@link RxDBAdapterSqliteError} 还连着；OPFS 文件重试用尽仍被占用
   *
   * @remarks
   * 不开 OPFS 是内存库，断开即无。开 OPFS 删根目录下的库文件 `<库名>.sqlite3` 与 `-journal` / `-wal` / `-shm`
   * （文件名与连接时同一个推导）；`opfsFallback: 'memory'` 落到过内存时文件本就不存在，删不存在的文件什么都不做。
   * 断开时 `db.close()` 已让 OPFS 代理放开同步访问句柄，放开有延迟，删除带退避重试。
   */
  override async dropStorage(): Promise<void> {
    this.assertDisconnectedForDrop();
    if (!this.options.opfs) return;
    const file = get_persistent_db_file_name(this.#dbName).slice(1);
    await removeOpfsFiles([file, `${file}-journal`, `${file}-wal`, `${file}-shm`]);
  }

  /**
   * 不开 OPFS 时是内存库；开 OPFS 时是持久化库。
   * `opfsFallback: 'memory'` 会在 OPFS 打不开时静默落到内存，恢复目标不确定，报 `unsupported_combination`。
   */
  protected override backupStorage(): SqliteBackupStorage {
    if (!this.options.opfs) return { kind: 'memory', label: 'memory' };
    if (this.options.opfsFallback === 'memory') return { kind: 'unsupported', field: 'opfsFallback', actual: 'memory' };
    return this.persistentBackupStorage('opfs');
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterSqliteai;
  }
}
