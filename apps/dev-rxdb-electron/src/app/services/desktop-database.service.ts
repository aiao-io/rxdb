/**
 * @fileoverview US-207：渲染进程接主进程 SQLite 文件的示例数据库。
 *
 * @module desktop-database.service
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DesktopLaunch } from '../desktop-launch.entity';
import { connectLocalAdapter, RxDBConnectionStatus, shutdownDatabase } from '../rxdb-connection';

/**
 * 桌面演示库的逻辑名。
 *
 * @remarks
 * 与 wa-sqlite 那个实例（`test_6`）刻意不同名：两者是两份独立的数据，
 * 同名会让 host 与 OPFS 各存一份、页面上却看不出区别。
 */
export const DESKTOP_DEMO_DB_NAME = 'desktop_demo';

/**
 * 演示「数据落在主进程持有的真实 SQLite 文件里」的第二个 RxDB 实例。
 *
 * @remarks
 * 与 `setup_rxdb_wa-sqlite.ts` 并存而不是取代它：那一份仍是渲染进程内的
 * OPFS / IndexedDB 存储，两张卡片摆在一起才看得出 US-207 换掉的到底是什么。
 *
 * 服务被首页注入即开始连接；连接成功后追加一行启动记录并读回总数，
 * 于是「重启后数字 +1」就是 AC#1 的可见证据。
 */
@Injectable({ providedIn: 'root' })
export class DesktopDatabaseService {
  readonly #db: RxDB;
  readonly #error = signal<unknown>(undefined);
  readonly #launchCount = signal<number | null>(null);
  readonly #status = signal<RxDBConnectionStatus>('connecting');

  /** 累计启动次数；连接完成前为 `null`。 */
  readonly launchCount = this.#launchCount.asReadonly();

  /** 桌面适配器的连接状态。 */
  readonly status = this.#status.asReadonly();

  /** 失败原因文案；其余状态下为 `null`。 */
  readonly errorMessage = computed(() => {
    const error = this.#error();
    if (error === undefined) return null;
    return error instanceof Error ? error.message : String(error);
  });

  constructor() {
    this.#db = new RxDB({
      dbName: DESKTOP_DEMO_DB_NAME,
      context: { userId: 'userId' },
      entities: [DesktopLaunch],
      sync: {
        local: { adapter: DESKTOP_ADAPTER_NAME },
        type: SyncType.None
      }
    });
    // 不传 transport：适配器自己去全局键上找 preload 暴露的桥接，
    // 渲染进程因此拿不到、也不需要知道库文件的物理路径（AC#3）。
    this.#db.adapter(DESKTOP_ADAPTER_NAME, async db => new RxDBAdapterDesktop(db));
    this.#db.init();

    // AC#7：injector 销毁时把连接交还给 host。少了这一步，主进程侧的会话要等到
    // 窗口 'destroyed' 才被回收，热重载场景下会攒出一堆没人用的连接。
    inject(DestroyRef).onDestroy(() => {
      void shutdownDatabase(this.#db, error => {
        console.error('desktop database shutdown failed', error);
      });
    });

    void this.#start();
  }

  /** 连接适配器并记录本次启动；**永不 reject**，失败只体现在状态信号上。 */
  async #start(): Promise<void> {
    await connectLocalAdapter(this.#db, DESKTOP_ADAPTER_NAME, (status, error) => {
      this.#status.set(status);
      this.#error.set(error);
      if (status === 'failed') console.error('desktop adapter startup connection failed', error);
    });
    if (this.#status() !== 'connected') return;

    try {
      const repository = this.#db.entityManager.getRepository(DesktopLaunch);
      // `instantiate` 而不是 `new DesktopLaunch()`：本应用有两个 RxDB 实例，
      // 裸构造无从判断目标库；这条路径把实例上下文显式带进构造函数。
      await repository.create(
        this.#db.entityManager.instantiate(DesktopLaunch, { startedAt: new Date().toISOString() })
      );
      // 空 rules = 不筛任何字段，只数总行数。
      this.#launchCount.set(await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } })));
    } catch (error) {
      // 连上了却写不进去，对用户来说和没连上没有区别，因此照样落到失败态。
      this.#status.set('failed');
      this.#error.set(error);
      console.error('desktop launch record failed', error);
    }
  }
}
