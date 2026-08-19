import { provideRxDB } from '@aiao/rxdb-angular';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DesktopLaunchService } from './desktop-launch.service';

describe('DesktopLaunchService', () => {
  /**
   * TAURI-07：这条盯的是 US-210 的 e2e 超时（`renderer never reported within 60s`）的根因。
   *
   * `provideRxDB` 的 source 自 US-207 E11 起是**异步**的（后端走动态 `import()`），
   * 而它注册的 `provideAppInitializer` 与 `app.config.ts` 里那个「建库→连接→记一次启动→上报」
   * 的 initializer 是**并发**跑的。后者在工厂体里同步 `inject(DesktopLaunchService)` ——
   * 服务只要在字段上写 `inject(RxDB)`，构造那一刻 holder 还没就绪，
   * `provideRxDB` 就会抛「RxDB is not ready yet」。
   *
   * 于是整条 initializer 连第一行都没跑到：库不建、启动记录不写、**自检结论也不上报**，
   * 宿主侧只剩 60s 看门狗超时，报告里写着「renderer 从没上报」，
   * 而真正的原因（一次注入时序错误）一个字都不会出现。
   *
   * 所以本服务**不得在构造时取 RxDB**：数据库由调用方在 `await` 之后显式传进 `record()`。
   */
  it('数据库尚未就绪时也必须能被注入（构造期不得读 RxDB）', () => {
    TestBed.configureTestingModule({
      // 永不 resolve 的 source = bootstrap 期间「还在建库」那一瞬间的忠实复刻。
      providers: [provideRxDB(() => new Promise(() => undefined))]
    });

    expect(() => TestBed.inject(DesktopLaunchService)).not.toThrow();
  });

  /** 写一行启动记录并读回总行数；用的是**传进来的**那个库，不是注入器里的。 */
  it('写入一行启动记录后返回累计行数', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const instance = { startedAt: 'now' };
    const instantiate = vi.fn().mockReturnValue(instance);
    const repository = { create, count: () => of(3) };
    const database = {
      entityManager: { getRepository: vi.fn().mockReturnValue(repository), instantiate }
    };

    TestBed.configureTestingModule({});
    const service = TestBed.inject(DesktopLaunchService);

    await expect(service.record(database as never)).resolves.toBe(3);
    expect(create).toHaveBeenCalledWith(instance);
    expect(service.launchCount()).toBe(3);
  });
});
