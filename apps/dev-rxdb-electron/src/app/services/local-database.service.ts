/**
 * @fileoverview US-207：本地数据库的连接、启动计数与状态发布。
 *
 * @module local-database.service
 */

import type { RxDB } from '@aiao/rxdb';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DesktopLaunch } from '../desktop-launch.entity';
import { connectLocalAdapter, type RxDBConnectionStatus } from '../rxdb-connection';
import { localDatabase, resolveLocalBackend } from '../setup_rxdb';

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
}
