/**
 * @fileoverview US-207：渲染进程接主进程 SQLite 文件的示例数据库。
 *
 * @module desktop-database.service
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';
import { rxDBPluginStorage, type RxdbFileStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
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
 * 文件内容在存储根下的子目录名（US-504）。
 *
 * @remarks
 * 物理位置是 `userData/rxdb-files/<此值>/`：外层由主进程的 `DESKTOP_STORAGE_DIRECTORY`
 * 决定，内层由 storage 插件的 `rootDir` 决定。显式写出而不吃插件默认值 ——
 * e2e 要按这个路径去磁盘上核对字节，默认值一旦变动，那边只会看到「文件不见了」。
 */
export const DESKTOP_STORAGE_ROOT_DIR = 'files';

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

  /**
   * 本实例上的文件存储服务（US-504）。
   *
   * @remarks
   * 内容后端是主进程的原生文件，不是 WebView 的 OPFS —— metadata 落在上面那个
   * SQLite 文件里，两者因此同属一个备份域。
   */
  get storage(): RxdbFileStorage {
    return this.#db.storage;
  }

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
    // US-504：文件内容也交给主进程写成原生文件。`use()` 必须排在 `init()` 之前 ——
    // 插件的 install() 是往 `config.entities` 里追加 StorageFileMeta，init() 之后再追加，
    // 建表那一步早已跑完，metadata 表不会存在。
    // 同样不传 transport：桌面后端和适配器共用 preload 暴露的那一条通道，不新增 preload 方法。
    this.#db.use(rxDBPluginStorage, {
      rootDir: DESKTOP_STORAGE_ROOT_DIR,
      filesystem: createDesktopStorageFilesystem()
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
