import { RxDBBackupError, type RxDB } from '@aiao/rxdb';
import type { PGlite } from '@electric-sql/pglite';

/**
 * 恢复到内存目标后得到的一次性数据库句柄。
 *
 * @remarks
 * 内存库只活在创建它的 PGlite 实例里，没有「重新打开同一个位置」这回事，所以恢复结果不能像
 * IndexedDB 目标那样留在存储里等下一次连接——只能把实例本身交给 adapter。句柄只能被领取一次，
 * 且只能被恢复时校验过的那个 RxDB 实例、以同一组扩展领取：兼容性（schema 指纹、认证域、扩展）
 * 是对那个实例判定的，同名但 schema 不同的另一个实例领走它就等于绕过了校验。
 * 不用时调用方负责 {@link PGliteRestoredDatabase.close}。
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
  readonly #rxdb: RxDB;
  readonly #extensions: readonly string[];

  /** 句柄是否已被领取或关闭。 */
  get consumed(): boolean {
    return this.#pglite === undefined;
  }

  /** @internal */
  constructor(pglite: PGlite, rxdb: RxDB, extensions: readonly string[]) {
    this.#pglite = pglite;
    this.#rxdb = rxdb;
    this.#extensions = extensions;
  }

  /**
   * adapter 连接前的准入检查：领取方必须是恢复时校验过的那个 RxDB 实例。
   *
   * @remarks
   * 客户端只知道库名，实例身份只有 adapter 能判断，所以这一步放在 adapter 里、先于
   * {@link PGliteRestoredDatabase.take}。检查失败不消费句柄，正确的实例仍可领取。
   *
   * @param rxdb - 领取方
   * @param extensions - 领取方 adapter 的扩展（`pgliteBackupExtensions` 的结果）
   * @throws RxDBBackupError `invalid_state` 不是校验过的实例、扩展不一致或已领取
   * @internal
   */
  assertAdoptableBy(rxdb: RxDB, extensions: readonly string[]): void {
    if (rxdb !== this.#rxdb) {
      throw new RxDBBackupError('invalid_state', 'Restored PGlite database belongs to a different RxDB instance', {
        details: { field: 'rxdb', expected: this.#rxdb.config.dbName, actual: rxdb.config.dbName }
      });
    }
    this.#assertClaim(rxdb.config.dbName, extensions);
  }

  /**
   * 领取恢复好的实例。
   *
   * @param dbName - 领取方的库名（`rxdb.config.dbName`）
   * @param extensions - 领取方加载的扩展（`pgliteBackupExtensions` 的结果）
   * @returns PGlite 实例，所有权随之转移
   * @throws RxDBBackupError `invalid_state` 已领取 / 已关闭，或库名、扩展与恢复目标不一致
   * @internal
   */
  take(dbName: string, extensions: readonly string[]): PGlite {
    const pglite = this.#assertClaim(dbName, extensions);
    this.#pglite = undefined;
    return pglite;
  }

  /** 丢弃未被领取的实例；已领取时什么都不做（实例归 adapter 管）。 */
  async close(): Promise<void> {
    const pglite = this.#pglite;
    this.#pglite = undefined;
    await pglite?.close();
  }

  #assertClaim(dbName: string, extensions: readonly string[]): PGlite {
    const expectedDbName = this.#rxdb.config.dbName;
    if (dbName !== expectedDbName) {
      throw new RxDBBackupError('invalid_state', 'Restored PGlite database belongs to a different RxDB instance', {
        details: { field: 'dbName', expected: expectedDbName, actual: dbName }
      });
    }
    // 扩展参与了兼容性判定：换一组扩展领取，库里依赖缺失扩展的对象会在运行时才坏掉。
    if (extensions.join(',') !== this.#extensions.join(',')) {
      throw new RxDBBackupError('invalid_state', 'Restored PGlite database was verified with different extensions', {
        details: { field: 'extensions', expected: this.#extensions.join(','), actual: extensions.join(',') }
      });
    }
    const pglite = this.#pglite;
    if (!pglite) throw new RxDBBackupError('invalid_state', 'Restored PGlite database has already been consumed');
    return pglite;
  }
}
