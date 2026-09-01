import { describe, expect, it, vi } from 'vitest';
import { connectRxDB, startLocalDatabase, type LocalDatabaseStartup } from './rxdb-initializer';
import type { SelfCheckOutcome } from './services/selfcheck-reporter';
import type { StorageProbeResult } from './storage-probe';
import type { WebviewProbeResult } from './webview-probe';

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
  /** 探针的固定结果；上报路径只需要它被原样带出去。 */
  const probeResult = { digest: 'a'.repeat(64), byteLength: 65536, existedBefore: true };

  /** webview 探针的固定结果；同样只验它被原样带出去。 */
  const webviewResult: WebviewProbeResult = {
    engine: 'webkit',
    origin: 'tauri://localhost',
    online: true,
    saveFilePicker: false,
    anchorDownload: true,
    objectUrl: true,
    sameOriginDigest: 'b'.repeat(64),
    sameOriginByteLength: 512,
    crossOriginAllowed: 'StorageOfflineError',
    crossOriginDenied: 'StorageOfflineError'
  };

  /** 造一套协作方，并把连接失败真的反映到 `$error` 上（真实的 state 就是这么联动的）。 */
  const startup = (
    overrides: {
      open?: () => Promise<unknown>;
      connect?: () => Promise<unknown>;
      record?: () => Promise<number>;
      probe?: () => Promise<StorageProbeResult>;
      webview?: () => Promise<WebviewProbeResult | null>;
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
        openDatabase: async () => {
          order.push('open');
          await (overrides.open ?? (() => Promise.resolve({})))();
          return {
            connect: async () => {
              order.push('connect');
              await (overrides.connect ?? (() => Promise.resolve({})))();
            },
            storage: {}
          } as never;
        },
        state: { markFailed, $error: () => error },
        launches: {
          record: async () => {
            order.push('record');
            return (overrides.record ?? (() => Promise.resolve(1)))();
          }
        },
        probe: async () => {
          order.push('probe');
          return (overrides.probe ?? (() => Promise.resolve(probeResult)))();
        },
        probeWebview: async () => {
          order.push('webview');
          return (overrides.webview ?? (() => Promise.resolve(webviewResult)))();
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
   * US-210 AC#9 + US-505 AC#1 / AC#6：六步必须**按序**发生。
   *
   * Angular 的多个 initializer 是并发跑的，所以把它们串起来是本函数存在的全部理由；
   * 顺序一旦松掉，故障形态是「写入偶发地先于连接完成」——只在慢机器上出现。
   *
   * 存储探针排在 `record` 之后而不是与它并发：两者都要写库，并发起来第一次启动的
   * `launchCount` 与探针的 `existedBefore` 会互相干扰，而那正是 AC#1 的两条判据。
   *
   * webview 探针又排在存储探针之后：它自己也要往存储里写三份缓存，与
   * `existedBefore` 并发同样会互相干扰。
   */
  it('先建库、再连接、再记一次启动、再过一遍存储与 webview，最后带着全部结果上报', async () => {
    const context = startup({ record: () => Promise.resolve(7) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['open', 'connect', 'record', 'probe', 'webview', 'report']);
    expect(context.reports).toEqual([{ status: 'ok', launchCount: 7, storage: probeResult, webview: webviewResult }]);
    expect(context.markFailed).not.toHaveBeenCalled();
  });

  /** 正常启动（没开 webview 探针）时照样是一份 `ok`，`webview` 为 null。 */
  it('没开 webview 探针时仍然正常上报', async () => {
    const context = startup({ webview: () => Promise.resolve(null) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.reports).toEqual([{ status: 'ok', launchCount: 1, storage: probeResult, webview: null }]);
  });

  /**
   * webview 探针失败与存储探针失败同一口径：落成应用内状态 + 一份带原因的报告。
   *
   * 尤其不能吞成 `ok` + `webview: null` —— 那与「本来就没开探针」长得一模一样，
   * e2e 侧只会看到一条「报告里没有 webview 探针结果」，查不到是哪一步坏了。
   */
  it('webview 探针失败时既落到应用内状态，也上报根因', async () => {
    const failure = new Error('asset protocol is unreachable');
    const context = startup({ webview: () => Promise.reject(failure) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['open', 'connect', 'record', 'probe', 'webview', 'report']);
    expect(context.markFailed).toHaveBeenCalledWith(failure);
    expect(context.reports).toEqual([{ status: 'failed', message: 'asset protocol is unreachable' }]);
  });

  /**
   * US-505：存储探针失败与写库失败是同一类事（用户看到的都是「用不了」），
   * 都要落成应用内状态 + 一份写着原因的报告，而不是让 initializer 抛出去变成白屏。
   */
  it('存储探针失败时既落到应用内状态，也上报根因', async () => {
    const failure = new Error('the storage probe read back a different digest');
    const context = startup({ probe: () => Promise.reject(failure) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['open', 'connect', 'record', 'probe', 'report']);
    expect(context.markFailed).toHaveBeenCalledWith(failure);
    expect(context.reports).toEqual([{ status: 'failed', message: 'the storage probe read back a different digest' }]);
  });

  /**
   * US-207 E11：建库本身现在是异步的（后端实现走动态 `import()`），于是多了一种新的失败
   * 方式 —— chunk 取不回来。让它顺着 initializer 抛上去就退回了 TAURI-01 的白屏，而且这一次
   * 连 `RxDBConnectionState` 都还没被写过，诊断面板里连个原因都没有；自检那条路径上则只剩
   * 一次 60s 看门狗超时。
   */
  it('建库失败时不得让 bootstrap 中止，且要把根因同时写进状态与报告', async () => {
    const failure = new Error('Failed to fetch dynamically imported module');
    const context = startup({ open: () => Promise.reject(failure) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['open', 'report']);
    expect(context.markFailed).toHaveBeenCalledWith(failure);
    expect(context.reports).toEqual([{ status: 'failed', message: 'Failed to fetch dynamically imported module' }]);
  });

  /**
   * 连接失败也要上报，否则 CI 上看到的是一次 60s 看门狗超时，报告里写着「renderer 从没上报」，
   * 而真正的原因一个字都不会出现。
   */
  it('连接失败时上报根因，且不再去写启动记录', async () => {
    const context = startup({ connect: () => Promise.reject(new Error('OPFS 不可用')) });
    await expect(startLocalDatabase(context.startup)).resolves.toBeUndefined();
    expect(context.order).toEqual(['open', 'connect', 'report']);
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
