import { RxDBBackupError } from '@aiao/rxdb';
import type { PGlite } from '@electric-sql/pglite';

/**
 * 恢复到内存目标后得到的一次性数据库句柄。
 *
 * @remarks
 * 内存库只活在创建它的 PGlite 实例里，没有「重新打开同一个位置」这回事，所以恢复结果不能像
 * IndexedDB 目标那样留在存储里等下一次连接——只能把实例本身交给 adapter。句柄只能被领取一次，
 * 且只能被恢复时指定的那个库领取；不用时调用方负责 {@link PGliteRestoredDatabase.close}。
 *
 * @example
 * ```typescript
 * const { database } = await restorePGliteDatabase(source, { rxdb, options: { store: 'memory' } });
 * rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory', restoredDatabase: database }));
 * await rxdb.connect('pglite');
 * ```
 */
export class PGliteRestoredDatabase {
  #pglite: PGlite | undefined;
  readonly #dbName: string;

  /** 句柄是否已被领取或关闭。 */
  get consumed(): boolean {
    return this.#pglite === undefined;
  }

  /** @internal */
  constructor(pglite: PGlite, dbName: string) {
    this.#pglite = pglite;
    this.#dbName = dbName;
  }

  /**
   * 领取恢复好的实例。
   *
   * @param dbName - 领取方的库名（`rxdb.config.dbName`）
   * @returns PGlite 实例，所有权随之转移
   * @throws RxDBBackupError `invalid_state` 已领取 / 已关闭，或库名与恢复目标不一致
   * @internal
   */
  take(dbName: string): PGlite {
    if (dbName !== this.#dbName) {
      throw new RxDBBackupError('invalid_state', 'Restored PGlite database belongs to a different RxDB instance', {
        details: { field: 'dbName', expected: this.#dbName, actual: dbName }
      });
    }
    const pglite = this.#pglite;
    if (!pglite) throw new RxDBBackupError('invalid_state', 'Restored PGlite database has already been consumed');
    this.#pglite = undefined;
    return pglite;
  }

  /** 丢弃未被领取的实例；已领取时什么都不做（实例归 adapter 管）。 */
  async close(): Promise<void> {
    const pglite = this.#pglite;
    this.#pglite = undefined;
    await pglite?.close();
  }
}
