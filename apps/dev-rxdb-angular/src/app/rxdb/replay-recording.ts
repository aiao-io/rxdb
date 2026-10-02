import { EntityType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay, type ReplayManager } from '@aiao/rxdb-plugin-replay';
import { DEMO_ADAPTER_NAME, mainThreadIdbOptions } from './demo-rxdb-config';

// 录制回放 demo（US-909 阶段 C，research D11）：只在录制开关打开时经 `import()` 加载，见 ./replay-toggle。
// 事件流写进独立的录制库，不进被录的应用库——工作树、同步、失败现场归档都看不见它。

/**
 * 挂在 `window.__rxdbReplay` 上的页内测试 API：e2e 用它直接驱动录制。
 */
export interface ReplayDemoApi {
  readonly replay: ReplayManager;
  /** 被录应用库的原始库名 */
  readonly dbName: string;
  /** 录制库的原始库名 */
  readonly recordingDbName: string;
}

declare global {
  interface Window {
    __rxdbReplay?: ReplayDemoApi;
  }
}

const ready = Promise.withResolvers<ReplayDemoApi>();

/**
 * 第一次 `installReplay` 之后兑现为页内测试 API。
 *
 * @remarks
 * setup 在 `db.init()` 之后才异步加载本模块、安装插件并等它装进连接纪元；`/replay` 页面同样经 `import()` 拿到本模块，
 * 等这个 Promise 就能拿到同一个门面，而不必关心安装与页面渲染谁先发生。
 */
export const replayDemoReady: Promise<ReplayDemoApi> = ready.promise;

/**
 * 录制库名：应用库名加 `-replay`。
 *
 * @param dbName - 应用库的原始库名
 * @returns 录制库的原始库名
 */
export function replayRecordingDbName(dbName: string): string {
  return `${dbName}-replay`;
}

/**
 * 录制库工厂：主线程 IDB 的 sqlite-wasm，单实例，不装任何插件。
 *
 * @remarks
 * 返回的实例尚未 `init()`，由录制插件在第一次用到存储时 `init()` + `connect()`，作用域释放时 `destroy()`。
 * 走主线程而不是 Worker：录制库只有本页写，不需要跨标签页协调（`multiInstance: false`）。
 *
 * @param dbName - 录制库的原始库名
 * @param baseHref - 应用的 `APP_BASE_HREF`
 * @param entities - 录制插件交来的实体类
 * @returns 未初始化的录制库
 */
export function createReplayRecordingDb(dbName: string, baseHref: string, entities: readonly EntityType[]): RxDB {
  return new RxDB({
    dbName,
    entities: [...entities],
    multiInstance: false,
    sync: { local: { adapter: DEMO_ADAPTER_NAME }, type: SyncType.None }
  }).adapter(DEMO_ADAPTER_NAME, async db => new RxDBAdapterSqlite(db, mainThreadIdbOptions(baseHref)));
}

/**
 * 给应用库装上录制插件（录制库 = `<dbName>-replay`），等插件装进连接纪元后挂 `window.__rxdbReplay` 并兑现
 * {@link replayDemoReady}。
 *
 * @remarks
 * 可重复调用：已装过时不再 `use()`。应用库连上之后再装也成立——宿主会把插件**异步**装进当前连接纪元，
 * 装好之前门面成员一律拒绝 `not_installed`；所以这里先 `await connect()`（连接去重，重复 `connect()`
 * 会等插件安装完成）再交出门面。连接或安装失败时本函数与 {@link replayDemoReady} 一起拒绝。
 *
 * @param db - 被录的应用库
 * @param options - `dbName`：应用库的原始库名（`db.config.dbName` 已带版本后缀，不能用）；`baseHref`：应用的 `APP_BASE_HREF`
 * @returns `db.replay`
 */
export async function installReplay(
  db: RxDB,
  options: { readonly dbName: string; readonly baseHref: string }
): Promise<ReplayManager> {
  const adapterName = db.config.sync.local?.adapter;
  if (adapterName === undefined) throw new Error('[demo] sync.local.adapter is not configured');
  const recordingDbName = replayRecordingDbName(options.dbName);
  if (db.getPlugins('replay').length === 0) {
    db.use(rxDBPluginReplay, {
      createRecordingDb: entities => createReplayRecordingDb(recordingDbName, options.baseHref, entities)
    });
  }
  try {
    await db.connect(adapterName);
  } catch (error) {
    ready.reject(error);
    throw error;
  }
  const api: ReplayDemoApi = { replay: db.replay, dbName: options.dbName, recordingDbName };
  window.__rxdbReplay = api;
  ready.resolve(api);
  return db.replay;
}
