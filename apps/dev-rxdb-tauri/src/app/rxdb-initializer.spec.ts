import { describe, expect, it, vi } from 'vitest';
import { connectRxDB, startLocalDatabase, type LocalDatabaseStartup } from './rxdb-initializer';
import type { SelfCheckOutcome } from './services/selfcheck-reporter';

describe('connectRxDB', () => {
  /** US-210：适配器名由调用方给出，两个后端（wa-sqlite / desktop）走同一条连接路径。 */
  it.each(['wa-sqlite', 'desktop'])('waits for the %s connection', async adapterName => {
    const adapter = {};
    const connect = vi.fn().mockResolvedValue(adapter);
    const markFailed = vi.fn();

    await expect(connectRxDB({ connect } as never, { markFailed }, adapterName)).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledWith(adapterName);
    expect(markFailed).not.toHaveBeenCalled();
  });

  /**
   * TAURI-01：这是白屏的根因。
   * `provideAppInitializer(() => connectRxDB(inject(RxDB)))` 里 initializer 一旦 reject，
   * Angular 会**中止 bootstrap** —— 组件树根本不渲染，`main.ts` 只有一句 console.error，
   * 用户看到的是一个空窗口。而 `home.page.html` 里那块 `@case ('error')` 的诊断面板
   * 恰恰**永远到不了**：它需要组件渲染出来才有机会显示。
   *
   * 所以连接失败不能再向上抛 —— 它必须变成应用内的一个状态。
   */
  it('连接失败时不得让 bootstrap 中止，而要把错误交给应用内状态', async () => {
    const failure = new Error('OPFS 不可用');
    const connect = vi.fn().mockRejectedValue(failure);
    const markFailed = vi.fn();

    await expect(connectRxDB({ connect } as never, { markFailed }, 'wa-sqlite')).resolves.toBeUndefined();
    expect(markFailed).toHaveBeenCalledWith(failure);
  });
});

describe('startLocalDatabase', () => {
  /** 造一套协作方，并把连接失败真的反映到 `$error` 上（真实的 state 就是这么联动的）。 */
  const startup = (
    overrides: {
      connect?: () => Promise<unknown>;
      record?: () => Promise<number>;
    } = {}
  ): {
    startup: LocalDatabaseStartup;
    reports: SelfCheckOutcome[];
    order: string[];
    markFailed: ReturnType<typeof vi.fn>;
  } => {
    const reports: SelfCheckOutcome[] = [];
    const order: string[] = [];
    let error: unknown = null;
    const markFailed = vi.fn((reason: unknown) => {
      error = reason;
    });
    return {
      reports,
      order,
      markFailed,
      startup: {
        database: {
          connect: async () => {
            order.push('connect');
            await (overrides.connect ?? (() => Promise.resolve({})))();
          }
        } as never,
        state: { markFailed, $error: () => error },
        launches: {
          record: async () => {
            order.push('record');
            return (overrides.record ?? (() => Promise.resolve(1)))();
          }
        },
        adapterName: 'desktop',
        report: async outcome => {
          order.push('report');
          reports.push(outcome);
        }
      }
    };
  };

  /**
   * US-210 AC#9：三步必须**按序**发生。
   *
   * Angular 的多个 initializer 是并发跑的，所以把它们串起来是本函数存在的全部理由；
   * 顺序一旦松掉，故障形态是「写入偶发地先于连接完成」——只在慢机器上出现。
   */
  it('先连接、再记一次启动、最后带着次数上报', async () => {
    const context = startup({ record: () => Promise.resolve(7) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['connect', 'record', 'report']);
    expect(context.reports).toEqual([{ status: 'ok', launchCount: 7 }]);
    expect(context.markFailed).not.toHaveBeenCalled();
  });

  /**
   * 连接失败也要上报，否则 CI 上看到的是一次 60s 看门狗超时，报告里写着「renderer 从没上报」，
   * 而真正的原因一个字都不会出现。
   */
  it('连接失败时上报根因，且不再去写启动记录', async () => {
    const context = startup({ connect: () => Promise.reject(new Error('OPFS 不可用')) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['connect', 'report']);
    expect(context.reports).toEqual([{ status: 'failed', message: 'OPFS 不可用' }]);
  });

  /** 连上了却写不进去，对用户来说和没连上没有区别 —— 状态与报告都要落到失败态。 */
  it('写入失败时既落到应用内状态，也上报出去', async () => {
    const failure = new Error('no such table: desktop_launch');
    const context = startup({ record: () => Promise.reject(failure) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.markFailed).toHaveBeenCalledWith(failure);
    expect(context.reports).toEqual([{ status: 'failed', message: 'no such table: desktop_launch' }]);
  });
});
