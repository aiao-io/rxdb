/**
 * @fileoverview US-210 AC#1：把「本次是第几次启动」记进本地库并读回来。
 *
 * @module services/desktop-launch.service
 */

import type { RxDB } from '@aiao/rxdb';
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DesktopLaunch } from '../desktop-launch.entity';

/**
 * {@link DesktopLaunchService.record} 用得到的那一小块 RxDB 表面。
 *
 * @remarks
 * 写成 `Pick` 而不是 `RxDB`，是为了让「谁给的库」这件事在类型上就说得清：
 * 本服务不去注入器里找库，只用调用方 `await` 出来的那一个。
 */
export type LaunchRecordDatabase = Pick<RxDB, 'entityManager'>;

/**
 * 累计启动次数的记录者。
 *
 * @remarks
 * 每次正常启动都写 —— 自检模式只是在这之上加了「观察 + 退出」。被观察的必须是产品路径
 * 本身，否则 e2e 证明的只是自检模式自己跑通了。
 *
 * 镜像 `apps/dev-rxdb-electron/src/app/services/local-database.service.ts` 里 `start()` 的写入段：
 * 两个桌面 demo 的可观察行为一致，US-207 与 US-210 的 e2e 才能用同一套判据。
 * （Electron 那边把连接与写入收在一个服务里；这边连接归 `startLocalDatabase`，
 * 本服务只管写入与读回 —— 分工不同，落在页面上的那个数字是同一个。）
 *
 * 构造函数里**什么都不做**：写入时机由 app initializer 决定，必须排在 `connect()` 之后。
 * 服务自己在构造时开跑的话，注入它的任何一个组件都会成为一次隐式的启动记录，
 * 而组件的构造时机与连接完成之间没有任何顺序保证。
 *
 * # 为什么库是**参数**而不是 `inject(RxDB)`（TAURI-07）
 *
 * `provideRxDB` 的 source 自 US-207 E11 起是异步的（后端走动态 `import()`），未就绪时
 * `inject(RxDB)` 会抛「RxDB is not ready yet」。而拉起本服务的那个 initializer 与
 * `provideRxDB` 自带的 initializer 是**并发**跑的 —— 字段上写 `inject(RxDB)` 的话，
 * 服务在构造那一刻就抛，整条「建库→连接→记一次启动→上报」连第一行都到不了：
 * 自检结论永远不上报，宿主侧只剩 60s 看门狗超时，报告里写着「renderer 从没上报」，
 * 真正的原因一个字都不会出现。
 *
 * 与 Electron 侧同构：`LocalDatabaseService.start()` 用的也是自己 `await localDatabase()`
 * 得到的那个实例，而不是注入器里的。
 */
@Injectable({ providedIn: 'root' })
export class DesktopLaunchService {
  readonly #launchCount = signal<number | null>(null);

  /** 累计启动次数；本次记录完成前为 `null`。 */
  readonly launchCount = this.#launchCount.asReadonly();

  /**
   * 追加一行启动记录并读回总行数。
   *
   * @param database - 已建好并连上的库，由调用方（app initializer）传入
   * @returns 含本次在内的累计启动次数
   * @throws 建表未完成、连接未建立或写入失败时抛出；由调用方决定怎么呈现
   */
  async record(database: LaunchRecordDatabase): Promise<number> {
    const repository = database.entityManager.getRepository(DesktopLaunch);
    // `instantiate` 而不是 `new DesktopLaunch()`：裸构造无从判断目标库，
    // 这条路径把实例上下文显式带进构造函数。
    await repository.create(database.entityManager.instantiate(DesktopLaunch, { startedAt: new Date().toISOString() }));
    // 空 rules = 不筛任何字段，只数总行数。
    const total = await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } }));
    this.#launchCount.set(total);
    return total;
  }
}
