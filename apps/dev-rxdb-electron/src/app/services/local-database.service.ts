/**
 * @fileoverview US-207：本地数据库的连接、启动计数与状态发布。
 *
 * @module local-database.service
 */

import { RxDBBackupError, type RxDB } from '@aiao/rxdb';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { backupProbeMode, installBackupProbe, type BackupProbeArchiveOps } from '../backup-probe';
import { DesktopLaunch } from '../desktop-launch.entity';
import { connectLocalAdapter, type RxDBConnectionStatus } from '../rxdb-connection';
import { ELECTRON_ADAPTER_NAME, ELECTRON_PGLITE_ADAPTER_NAME, localDatabase, resolveLocalBackend } from '../setup_rxdb';

/**
 * 按适配器名取备份探针用的备份与恢复（US-217 AC#18）。
 *
 * @remarks
 * 实现住在两个桌面建库模块里，这里只经动态 `import()` 取——与建库本身同一条 US-207 E11 纪律，
 * 适配器包不进主 chunk。浏览器预览的 wa-sqlite 不在本 demo 的打包 smoke 里，明确拒绝而不是空转。
 */
const loadArchiveOps = async (adapter: string): Promise<BackupProbeArchiveOps> => {
  if (adapter === ELECTRON_ADAPTER_NAME) return (await import('../setup_rxdb_desktop')).archiveOps;
  if (adapter === ELECTRON_PGLITE_ADAPTER_NAME) return (await import('../setup_rxdb_desktop_pglite')).archiveOps;
  throw new RxDBBackupError('unsupported_combination', `the ${adapter} backend has no backup probe in this demo`, {
    details: { field: 'adapter', actual: adapter }
  });
};

/**
 * 把本次运行选中的本地后端连起来，并把「跑在哪个后端 / 连上了没有 / 累计启动几次」
 * 三件事发布成信号。
 *
 * @remarks
 * US-207 E8：这里原先是两个服务对着两个 RxDB 实例（wa-sqlite 一个、桌面一个），
 * 首页因此有两张状态卡。合并成一张之后，「本地数据库」只有一个，跑在哪个后端由
 * `selectLocalBackend` 判定 —— 页面读到的后端名与实际连接的适配器名同源，
 * 不会再出现「卡片写着 wa-sqlite、数据却落在别处」这种自相矛盾的显示。
 *
 * 服务由 `app.config.ts` 的 `provideAppInitializer` 拉起，而不是等首页注入。
 * 惰性单例没人注入就永远不构造 —— 与 ELEC-11 在 `provideRxDB` 上踩过的是同一个坑，
 * 表现同样是状态卡永久停在「连接中…」，且没有任何报错。
 */
@Injectable({ providedIn: 'root' })
export class LocalDatabaseService {
  readonly #backend = resolveLocalBackend(globalThis);
  readonly #error = signal<unknown>(undefined);
  readonly #launchCount = signal<number | null>(null);
  readonly #status = signal<RxDBConnectionStatus>('connecting');

  /**
   * 本次运行选中的适配器名（US-207 E9：后端身份可观测）。
   *
   * @remarks
   * 与 `connect()` 用的是**同一个值**，不是页面上另写一遍的字面量。
   */
  readonly backend = this.#backend.adapter;

  /** 选中后端的逻辑库名。两个后端不同名，因此它同时指明了数据落在哪一份存储里。 */
  readonly dbName = this.#backend.dbName;

  /** 累计启动次数；连接完成前为 `null`。 */
  readonly launchCount = this.#launchCount.asReadonly();

  /** 本地适配器的连接状态。 */
  readonly status = this.#status.asReadonly();

  /** 失败原因文案；其余状态下为 `null`。 */
  readonly errorMessage = computed(() => {
    const error = this.#error();
    if (error === undefined) return null;
    return error instanceof Error ? error.message : String(error);
  });

  /**
   * 建库 → 连接 → 记录本次启动；**永不 reject**，失败只体现在状态信号上。
   *
   * @remarks
   * 三步必须在**同一个** initializer 里：Angular 的 app initializer 是 `Promise.all`
   * 并发跑的，拆成两个不保证先后。建库那一步 await 的是 `localDatabase()` 记住的
   * 同一个 Promise —— 与 `provideRxDB` 等的是同一条链，因此不必猜谁先谁后。
   *
   * `connected` **压到启动次数读回之后**才对外发布。适配器一连上就置「已连接」的话，
   * 卡片会有一段自称已连接、次数却还是空白的窗口期 —— 观察者据此读到的是空字符串，
   * 而「重启后 +1」这条 e2e 唯一能依据的就是它。失败方向本来就是这个口径
   * （连上了却写不进去照样落 `failed`），成功方向跟着对齐而已。
   *
   * 拆卸不在这里：source 是工厂，实例归 `provideRxDB` 所有，注入器销毁时它会
   * `disconnectAll()`。服务再补一刀只会变成两次断开。
   */
  async start(): Promise<void> {
    let database: RxDB;
    try {
      database = await localDatabase();
    } catch (error) {
      // 建库就失败时 `inject(RxDB)` 之后也会抛同一个错，但那要等到有人去注入；
      // 卡片得在页面渲染出来的那一刻就说明白。
      this.#status.set('failed');
      this.#error.set(error);
      console.error('local database creation failed', error);
      return;
    }

    try {
      await this.#armBackupProbe(database);
    } catch (error) {
      // restore 模式下恢复失败，连接就不能再开：目标可能是半成品，照常连上等于在它上面继续写。
      this.#status.set('failed');
      this.#error.set(error);
      console.error('backup probe failed', error);
      return;
    }

    let adapterConnected = false;
    await connectLocalAdapter(database, this.#backend.adapter, (status, error) => {
      adapterConnected = status === 'connected';
      if (!adapterConnected) this.#status.set(status);
      this.#error.set(error);
      if (status === 'failed') console.error(`${this.#backend.adapter} startup connection failed`, error);
    });
    if (!adapterConnected) return;

    try {
      const repository = database.entityManager.getRepository(DesktopLaunch);
      // `instantiate` 而不是 `new DesktopLaunch()`：后者要靠实体类自己找到目标库，
      // 这条路径把实例上下文显式带进构造函数，与库的数量无关。
      await repository.create(
        database.entityManager.instantiate(DesktopLaunch, { startedAt: new Date().toISOString() })
      );
      // 空 rules = 不筛任何字段，只数总行数。
      this.#launchCount.set(await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } })));
      this.#status.set('connected');
    } catch (error) {
      // 连上了却写不进去，对用户来说和没连上没有区别，因此照样落到失败态。
      this.#status.set('failed');
      this.#error.set(error);
      console.error('launch record failed', error);
    }
  }

  /**
   * 入口 URL 带 `backup-probe` 时挂出打包 smoke 的备份探针（US-217 AC#18）。
   *
   * @remarks
   * 必须排在连接之前：`restore` 模式的恢复目标要求实例尚未连接，所以这里 await 的是探针的连接闸门——
   * e2e 调一次成功的 `restore()` 才放行。`backup` 模式立即放行，照常连接。
   */
  async #armBackupProbe(database: RxDB): Promise<void> {
    const mode = backupProbeMode(globalThis);
    if (mode === undefined) return;
    await installBackupProbe(globalThis, mode, database, await loadArchiveOps(this.#backend.adapter));
  }
}
