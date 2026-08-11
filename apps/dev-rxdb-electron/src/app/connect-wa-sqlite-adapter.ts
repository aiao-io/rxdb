/**
 * @fileoverview OPFS → IDB 的适配器连接降级。
 *
 * @module connect-wa-sqlite-adapter
 */

/** `connectWithOpfsFallback` 对适配器的最小要求，收窄到这两个方法以便单测替身实现。 */
export interface ConnectableAdapter {
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
}

/**
 * 优先用 OPFS VFS 连接；失败则清理干净再降级到 IDB VFS。
 *
 * @param opfsAvailable 环境是否支持 OPFS（为 `false` 时直接走降级）
 * @param createOpfsAdapter 构造 OPFS 适配器
 * @param createFallbackAdapter 构造 IDB 降级适配器
 * @param reportOpfsFailure OPFS 连接失败时的回调，用于记录原因并释放 worker 等资源
 * @returns 已连接的适配器
 * @throws 当降级适配器也连接失败时，抛出降级路径的错误
 */
export async function connectWithOpfsFallback<T extends ConnectableAdapter>(
  opfsAvailable: boolean,
  createOpfsAdapter: () => T,
  createFallbackAdapter: () => T,
  reportOpfsFailure: (error: unknown) => void
): Promise<T> {
  if (opfsAvailable) {
    const adapter = createOpfsAdapter();
    try {
      await adapter.connect();
      return adapter;
    } catch (error) {
      // ELEC-02：清理失败不得影响降级。早先是裸 `await adapter.disconnect()` ——
      // 它一旦 reject，整个函数就从这里抛出：`reportOpfsFailure(error)` 不会执行
      // （worker 的 terminate 正挂在那个回调里 → worker 泄漏），
      // 后面的 IDB 降级也整段跳过，而调用方看到的是 disconnect 的错误、
      // **原始连接失败原因被顶掉**。
      try {
        await adapter.disconnect();
      } catch (cleanupError) {
        console.warn('[dev-rxdb-electron] OPFS 适配器清理失败，继续降级到 IDB', cleanupError);
      }
      reportOpfsFailure(error);
    }
  }

  const adapter = createFallbackAdapter();
  await adapter.connect();
  return adapter;
}
