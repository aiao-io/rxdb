/**
 * wa-sqlite worker 入口的上下文角色判定。
 *
 * @remarks
 * 两个 VFS 档（OPFSCoopSyncVFS / IDBBatchAtomicVFS）各自需要一个 worker 上下文：前者是
 * dedicated worker，后者是 SharedWorker。Angular 的 esbuild worker 管线把两个入口合在一个
 * 构建里时，会给它们共享的模块拆一个 chunk，而那份 chunk 不会落进产物——共享入口因此
 * 只能留一个（见 `wa-sqlite.worker.ts` 的头注）。同一个脚本要服务两种上下文，入口就得先
 * 判定自己跑在哪种作用域里：
 *
 * - dedicated worker 上下文没有 `SharedWorkerGlobalScope` 构造器；
 * - 构造器在别的上下文（如窗口）里也可能可见，所以还要 `self instanceof` 才算数。
 *
 * 本模块零副作用：入口文件 import 它不会触发任何接线，判定本身因此可以被单测直接调用。
 * 运行时只会以「worker 永不响应」的形态暴露的故障，不值得留给 e2e 去猜。
 */

/** 判定结果：dedicated worker 直接 expose 到 self；shared worker 每个连接端口各 expose 一次。 */
export type WaSqliteWorkerRole = 'dedicated' | 'shared';

/**
 * 判定当前作用域是 dedicated worker 还是 shared worker。
 *
 * @param globals - 要检查的全局对象，实际调用传 `globalThis`；参数化是为了让两种上下文都能被测到
 * @returns shared 当且仅当 `SharedWorkerGlobalScope` 存在且 `self` 是它的实例
 */
export const resolveWaSqliteWorkerRole = (globals: unknown): WaSqliteWorkerRole => {
  const scope = globals as {
    readonly SharedWorkerGlobalScope?: unknown;
    readonly self?: unknown;
  };
  const ctor = scope.SharedWorkerGlobalScope;
  return typeof ctor !== 'undefined' && scope.self instanceof (ctor as new () => unknown) ? 'shared' : 'dedicated';
};
