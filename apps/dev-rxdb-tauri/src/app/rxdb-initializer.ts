import type { RxDB } from '@aiao/rxdb';
import type { RxDBConnectionStateWriter } from './rxdb-connection-state';
import type { SelfCheckOutcome } from './services/selfcheck-reporter';

/**
 * 建立本地适配器连接。**失败不向上抛。**
 *
 * @param database - RxDB 实例
 * @param state - 承接失败的应用内状态
 * @param adapterName - 要连的本地适配器名，必须与 `provideRxDB` 用的工厂来自同一次
 *   `selectLocalBackend` 判定（US-210）
 *
 * @remarks
 * TAURI-01：原实现是 `database.connect('wa-sqlite')` 直接返回给
 * `provideAppInitializer` —— initializer 一旦 reject，Angular 会**中止 bootstrap**：
 *
 * - 组件树不渲染 → 窗口全白；
 * - `main.ts` 只有 `.catch(err => console.error(err))`，桌面端连控制台都未必开着；
 * - `home.page.html` 里那块 `@case ('error')` 诊断面板**永远到不了** ——
 *   它恰恰是为这种失败准备的，却被失败本身挡在了门外。
 *
 * 所以连接失败必须降级成**应用内状态**：bootstrap 照常完成，页面渲染出来，
 * 诊断面板第一次真正可达。
 */
export const connectRxDB = async (
  database: Pick<RxDB, 'connect'>,
  state: RxDBConnectionStateWriter,
  adapterName: string
): Promise<void> => {
  try {
    await database.connect(adapterName);
  } catch (error) {
    state.markFailed(error);
  }
};

/** {@link startLocalDatabase} 的协作方，全部以最小接口给出以便单测。 */
export interface LocalDatabaseStartup {
  /** RxDB 实例。 */
  readonly database: Pick<RxDB, 'connect'>;
  /** 连接状态：既要写失败，也要读回来判断连接到底成没成。 */
  readonly state: RxDBConnectionStateWriter & { readonly $error: () => unknown };
  /** 启动次数记录者。 */
  readonly launches: { record(): Promise<number> };
  /** 要连的本地适配器名。 */
  readonly adapterName: string;
  /** 自检结论的出口；非自检模式下是一次空操作。 */
  readonly report: (outcome: SelfCheckOutcome) => Promise<void>;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 连接本地数据库、记一次启动、上报结论。**永不 reject。**
 *
 * @param startup - 协作方
 *
 * @remarks
 * # 为什么三件事必须串在**同一个** initializer 里
 *
 * Angular 的多个 `provideAppInitializer` 是**并发**执行的（内部走 `Promise.all`）。
 * 拆成两个的话，「写一行启动记录」会与「建立连接」同时开跑，而前者依赖后者已经完成 ——
 * 那是一条只在慢机器上偶发的竞态，本地几乎复现不出来。
 *
 * # 为什么失败方向也要上报
 *
 * {@link connectRxDB} 把失败吞进 `RxDBConnectionState`（否则 bootstrap 中止、诊断面板
 * 永远到不了，见上）。若这里只在成功时上报，一次连接失败在 CI 上的表现就是 60s 看门狗超时 ——
 * 报告里写着「renderer 从没上报」，而真正的原因（比如 OPFS 不可用）一个字都不会出现。
 * 读回 `$error` 再显式报一次 `failed`，拿到的才是根因。
 */
export const startLocalDatabase = async (startup: LocalDatabaseStartup): Promise<void> => {
  await connectRxDB(startup.database, startup.state, startup.adapterName);
  const connectionError = startup.state.$error();
  if (connectionError !== null) {
    await startup.report({ status: 'failed', message: describeError(connectionError) });
    return;
  }
  // `record()` 与 `report()` 分开 try：合在一起的话，上报本身出错会被当成写入失败，
  // 于是报告里写的是一个从没发生过的原因。
  let launchCount: number;
  try {
    launchCount = await startup.launches.record();
  } catch (error) {
    // 连上了却写不进去，对用户来说和没连上没有区别，因此照样落到失败态。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }
  await startup.report({ status: 'ok', launchCount });
};
