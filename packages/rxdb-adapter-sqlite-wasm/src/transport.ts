/**
 * @fileoverview sqlite-wasm 连接走哪条 transport：只在这里判一次。
 */

import type { SqliteOptions } from './sqlite.interface.js';

/**
 * 归一化后的 transport：这次连接是否经 Comlink 走到 dedicated Worker / SharedWorker 上。
 */
export interface SqliteWasmTransport {
  /** 走 dedicated Worker */
  readonly worker: boolean;
  /** 走 SharedWorker：别的标签页可能连着 worker 里同一个客户端 */
  readonly sharedWorker: boolean;
}

/**
 * 归一化 transport 配置：flag 为 `true`，或给了对应实例，都算走那条 transport。
 *
 * @param options - 适配器配置里的 transport 选项
 * @returns 归一化后的 transport
 *
 * @remarks
 * 只给实例时，`wrapWithComlinkEndpoint` 照样把连接接到那个实例上（README：实例本身即可选择 transport）。
 * 所以跨标签页的锁名、断开时交还持有者、传给远端 `init` 的加载选项、备份对 transport 的拒绝，
 * 都必须按这里的结果判；只看 flag 的话，只给 `sharedWorkerInstance` 的标签页不进锁排队，
 * 断开时还会把别的标签页正在用的那条连接整个关掉。
 *
 * 组合是否合法（flag 缺实例、flag 为 `false` 却给了实例、两种 transport 并存）不在这里判，
 * 连接时由 `validateComlinkTransportOptions` 拒绝；这里对不合法的组合也照常给出结果，
 * 好让备份入口先按 transport 报 `unsupported_combination`。
 */
export const resolveSqliteWasmTransport = (
  options: Pick<SqliteOptions, 'worker' | 'workerInstance' | 'sharedWorker' | 'sharedWorkerInstance'>
): SqliteWasmTransport => ({
  worker: options.worker === true || options.workerInstance !== undefined,
  sharedWorker: options.sharedWorker === true || options.sharedWorkerInstance !== undefined
});
