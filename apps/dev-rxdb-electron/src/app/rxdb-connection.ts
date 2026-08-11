/**
 * ELEC-11：本地适配器连接与拆卸的纯逻辑。
 *
 * 抽出来是为了能测——渲染进程的 vitest 跑在 `environment: 'node'` 下，
 * 这两个函数不碰 Angular、不碰 DOM、不碰 RxDB 实例的具体类型，
 * 因此可以在 `src-electron/rxdb-connection.spec.ts` 里用假对象直接驱动。
 */

/** 本地适配器的连接状态。`connecting` 是初始态，另外两个都是终态。 */
export type RxDBConnectionStatus = 'connecting' | 'connected' | 'failed';

/**
 * `connectLocalAdapter` / `shutdownDatabase` 需要的最小结构。
 *
 * 刻意不写成 `RxDB`：这两个函数只用到这两个方法，收窄到结构类型后
 * 单测不必构造一整个 RxDB 实例。
 */
export interface ConnectableDatabase {
  connect(adapterName: string): Promise<unknown>;
  disconnectAll(): Promise<void>;
}

/**
 * 连接状态变更的回调。`error` 仅在 `status === 'failed'` 时有值。
 */
export type RxDBConnectionStatusListener = (status: RxDBConnectionStatus, error: unknown) => void;

/**
 * 连接本地适配器，并把结果通过 `onStatus` 上报。
 *
 * 返回的 Promise **永不 reject**：调用方位于组件构造/工厂里，没有能接住
 * rejection 的地方。原实现是 `void rxdb.connect(...).catch(console.error)` ——
 * 失败只落在控制台，应用层拿不到任何信号，UI 会停在一个「看起来正常」的空列表上。
 *
 * @param db 目标数据库
 * @param adapterName 适配器名（本项目是 `wa-sqlite`）
 * @param onStatus 状态回调，成功一次 `'connected'`，失败一次 `'failed'` 并带上错误
 */
export async function connectLocalAdapter(
  db: ConnectableDatabase,
  adapterName: string,
  onStatus: RxDBConnectionStatusListener
): Promise<void> {
  try {
    await db.connect(adapterName);
    onStatus('connected', undefined);
  } catch (error) {
    onStatus('failed', error);
  }
}

/**
 * 断开数据库的全部适配器。
 *
 * 同样**永不 reject**：这跑在拆卸路径（窗口关闭 / injector 销毁）上，
 * 此时抛出去没有任何人能接，只会变成一条 unhandled rejection。
 *
 * @param db 目标数据库
 * @param onError 断开失败时的上报回调
 */
export async function shutdownDatabase(db: ConnectableDatabase, onError: (error: unknown) => void): Promise<void> {
  try {
    await db.disconnectAll();
  } catch (error) {
    onError(error);
  }
}
