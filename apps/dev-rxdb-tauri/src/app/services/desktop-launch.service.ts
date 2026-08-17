/**
 * @fileoverview US-210 AC#1：把「本次是第几次启动」记进本地库并读回来。
 *
 * @module services/desktop-launch.service
 */

import { RxDB } from '@aiao/rxdb';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DesktopLaunch } from '../desktop-launch.entity';

/**
 * 累计启动次数的记录者。
 *
 * @remarks
 * 每次正常启动都写 —— 自检模式只是在这之上加了「观察 + 退出」。被观察的必须是产品路径
 * 本身，否则 e2e 证明的只是自检模式自己跑通了。
 *
 * 镜像 `apps/dev-rxdb-electron/src/app/services/desktop-database.service.ts` 的 `#start()`：
 * 两个桌面 demo 的可观察行为一致，US-207 与 US-210 的 e2e 才能用同一套判据。
 *
 * 构造函数里**什么都不做**（除了取 `RxDB`）：写入时机由 app initializer 决定，
 * 必须排在 `connect()` 之后。服务自己在构造时开跑的话，注入它的任何一个组件都会成为
 * 一次隐式的启动记录，而组件的构造时机与连接完成之间没有任何顺序保证。
 */
@Injectable({ providedIn: 'root' })
export class DesktopLaunchService {
  readonly #database = inject(RxDB);
  readonly #launchCount = signal<number | null>(null);

  /** 累计启动次数；本次记录完成前为 `null`。 */
  readonly launchCount = this.#launchCount.asReadonly();

  /**
   * 追加一行启动记录并读回总行数。
   *
   * @returns 含本次在内的累计启动次数
   * @throws 建表未完成、连接未建立或写入失败时抛出；由调用方决定怎么呈现
   */
  async record(): Promise<number> {
    const repository = this.#database.entityManager.getRepository(DesktopLaunch);
    // `instantiate` 而不是 `new DesktopLaunch()`：裸构造无从判断目标库，
    // 这条路径把实例上下文显式带进构造函数。
    await repository.create(
      this.#database.entityManager.instantiate(DesktopLaunch, { startedAt: new Date().toISOString() })
    );
    // 空 rules = 不筛任何字段，只数总行数。
    const total = await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } }));
    this.#launchCount.set(total);
    return total;
  }
}
