import type { RxDB } from '@aiao/rxdb';
import type { DevToolsProbeResult } from './devtools-probe';
import type { RxDBConnectionStateWriter } from './rxdb-connection-state';
import type { LaunchRecordDatabase } from './services/desktop-launch.service';
import type { SelfCheckOutcome } from './services/selfcheck-reporter';
import type { StorageProbeResult, StorageProbeSurface } from './storage-probe';
import type { WebviewFetchSurface, WebviewProbeResult } from './webview-probe';

/**
 * {@link startLocalDatabase} 用得到的那一小块 RxDB 表面：连接、写启动记录，以及文件存储。
 *
 * @remarks
 * TAURI-07：`record()` 收的就是这里 `openDatabase()` 交出来的**同一个**实例。
 * 让记录者自己去 `inject(RxDB)` 的话，它会在 `provideRxDB` 的异步 source 就绪之前
 * 就被构造 —— 抛在 initializer 的第一行之前，整条启动链一句都不会跑。
 *
 * US-505：`storage` 写成窄接口而不是 `Pick<RxDB, 'storage'>`。后者要靠 storage 插件的
 * 模块增强被编进同一个 program 才成立 —— 那是一条随文件增删而变的隐式依赖，
 * 断了的表现是这里突然报「RxDB 上没有 storage」，而与本模块毫无关系。
 */
export type LocalDatabase = Pick<RxDB, 'connect'> &
  LaunchRecordDatabase & {
    /** 连接期间的文件存储服务，两条探针合起来只用得到它的四个方法。 */
    readonly storage: StorageProbeSurface & WebviewFetchSurface;
  };

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
  /**
   * 取到 RxDB 实例。
   *
   * @remarks
   * US-207 E11 起建库本身是**异步**的（选中的后端经由动态 `import()` 加载），所以这里收的
   * 是一只手而不是一个现成实例。`app.config.ts` 传的是 `localDatabase` —— 那个函数把建库
   * Promise 记住了，与 `provideRxDB` 等的是同一条链，因此两个并发的 initializer 不会
   * 各建一个实例。
   *
   * 允许 reject：建库失败与连接失败在这里是同一类事（用户看到的都是「用不了」），
   * 都会落成应用内状态而不是向上抛，见 {@link startLocalDatabase}。
   */
  readonly openDatabase: () => Promise<LocalDatabase>;
  /** 连接状态：既要写失败，也要读回来判断连接到底成没成。 */
  readonly state: RxDBConnectionStateWriter & { readonly $error: () => unknown };
  /**
   * 启动次数记录者。
   *
   * @remarks
   * 库由**这里**传给它（TAURI-07），传的正是 `openDatabase()` 交出来的那一个。
   */
  readonly launches: { record(database: LocalDatabase): Promise<number> };
  /**
   * 文件存储探针（US-505 AC#1 / AC#3）。
   *
   * @remarks
   * 与 `launches` 一样收窄成一只手：真实实现是 `storage-probe.ts` 的 `probeStorage`，
   * 单测里换成一个内存替身，不必为跑一条探针把整个存储插件连同后端立起来。
   */
  readonly probe: (storage: StorageProbeSurface) => Promise<StorageProbeResult>;
  /**
   * webview 能力探针（US-505 AC#6）。
   *
   * @remarks
   * 返回 `null` 表示这次不跑 —— 探针地址由 Rust 侧给，只有自检模式下的 e2e 才会设它，
   * 因此**正常启动走的就是这条路**，它不是失败方向。
   *
   * 探针地址的读取也在这只手里面（`app.config.ts` 组合的）：把它拆成第二只手的话，
   * 「读地址失败」与「探针失败」会变成两条要分别处理的路径，而对调用方来说两者是同一件事。
   */
  readonly probeWebview: (storage: WebviewFetchSurface) => Promise<WebviewProbeResult | null>;
  /**
   * DevTools 双 WebView 握手探针（US-905 阶段 1 AC#2）。
   *
   * @remarks
   * 返回 `null` 表示这次不跑——与 {@link probeWebview} 同一形态：开关在 Rust 侧
   * （`DEV_RXDB_TAURI_DEVTOOLS_PROBE`），**正常启动与 release 产物走的就是这条路**。
   * release 里根本没有调试窗口，跑它只会白等一个预算。
   */
  readonly probeDevTools: () => Promise<DevToolsProbeResult | null>;
  /** 要连的本地适配器名。 */
  readonly adapterName: string;
  /** 自检结论的出口；非自检模式下是一次空操作。 */
  readonly report: (outcome: SelfCheckOutcome) => Promise<void>;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 建库、连接本地适配器、记一次启动、上报结论。**永不 reject。**
 *
 * @param startup - 协作方
 *
 * @remarks
 * # 为什么这几件事必须串在**同一个** initializer 里
 *
 * Angular 的多个 `provideAppInitializer` 是**并发**执行的（内部走 `Promise.all`）。
 * 拆成两个的话，「写一行启动记录」会与「建立连接」同时开跑，而前者依赖后者已经完成 ——
 * 那是一条只在慢机器上偶发的竞态，本地几乎复现不出来。
 *
 * # 为什么建库失败也要在这里接住
 *
 * US-207 E11 起建库是异步的（后端实现走动态 `import()`），于是它多了一种**新的**失败方式：
 * chunk 取不回来。让它顺着 initializer 抛上去就退回了 TAURI-01 的白屏 —— 而这一次连
 * `RxDBConnectionState` 都还没被写过，诊断面板里连个原因都没有。
 *
 * # 为什么失败方向也要上报
 *
 * {@link connectRxDB} 把失败吞进 `RxDBConnectionState`（否则 bootstrap 中止、诊断面板
 * 永远到不了，见上）。若这里只在成功时上报，一次连接失败在 CI 上的表现就是 60s 看门狗超时 ——
 * 报告里写着「renderer 从没上报」，而真正的原因（比如 OPFS 不可用）一个字都不会出现。
 * 读回 `$error` 再显式报一次 `failed`，拿到的才是根因。
 */
export const startLocalDatabase = async (startup: LocalDatabaseStartup): Promise<void> => {
  let database: LocalDatabase;
  try {
    database = await startup.openDatabase();
  } catch (error) {
    // 建库失败时 `inject(RxDB)` 之后也会抛同一个错，但那要等到有人去注入；
    // 状态与报告都得在**这一刻**就说明白，否则自检那条路径只剩看门狗超时。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }

  await connectRxDB(database, startup.state, startup.adapterName);
  const connectionError = startup.state.$error();
  if (connectionError !== null) {
    await startup.report({ status: 'failed', message: describeError(connectionError) });
    return;
  }
  // `record()` 与 `report()` 分开 try：合在一起的话，上报本身出错会被当成写入失败，
  // 于是报告里写的是一个从没发生过的原因。
  let launchCount: number;
  try {
    launchCount = await startup.launches.record(database);
  } catch (error) {
    // 连上了却写不进去，对用户来说和没连上没有区别，因此照样落到失败态。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }
  // US-505：探针排在 `record()` 之后而不是与它并发 —— 两者都要写库，并发起来
  // 第一次启动的 `launchCount` 与探针的 `existedBefore` 会互相干扰，
  // 而那正是 AC#1 用来排掉「内存实现」的两条判据。
  let storage: StorageProbeResult;
  try {
    storage = await startup.probe(database.storage);
  } catch (error) {
    // 文件存储用不了和库用不了是同一类事，落到同一个失败态；抛出去就是白屏（TAURI-01）。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }
  // US-505 AC#6：同样排在存储探针**之后**而不是与它并发 —— webview 探针自己要往存储里写
  // 三份缓存，与 `existedBefore` 并发起来会互相干扰。
  let webview: WebviewProbeResult | null;
  try {
    webview = await startup.probeWebview(database.storage);
  } catch (error) {
    // 不吞成 `ok` + `webview: null`：那与「本来就没开探针」长得一模一样，
    // e2e 侧只会看到一条「报告里没有 webview 探针结果」，查不到是哪一步坏了。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }
  // 排在最后：它要等调试窗口把握手发过来，而调试窗口是在 `setup` 里与主窗口一起建的，
  // 握手时机与建库快慢无关。放前面只会把这段等待叠进建库路径。
  let devtools: DevToolsProbeResult | null;
  try {
    devtools = await startup.probeDevTools();
  } catch (error) {
    // 与 webview 探针同一个理由：不吞成 `ok` + `devtools: null`，那与「没开探针」同形。
    startup.state.markFailed(error);
    await startup.report({ status: 'failed', message: describeError(error) });
    return;
  }
  await startup.report({ status: 'ok', launchCount, storage, webview, devtools });
};
