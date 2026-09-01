/**
 * @fileoverview provider 数据面的接缝：调用、字节下沉与快照物化。
 *
 * @remarks
 * 本模块**只定义接缝**，不含任何平台实现——真正的 OPFS / Node / Rust provider 由
 * US-904 阶段 C / D 与 US-905 落地。冻结在这里的是三件下游不得重新定义的事：
 *
 * 1. **provider 只用穷尽错误联合说话。** `invoke` 的失败分支返回
 *    {@link DevToolsErrorPayload}，而不是 throw 平台异常。抛异常的接口没法在类型上
 *    强制「DOMException 必须先映射」，最终三端错误码各说各话。
 * 2. **字节只走 sink，不走返回值。** {@link DevToolsChunkSink} 让实现有能力做到
 *    「整文件绝不驻留内存」；如果接缝长成 `write(): Promise<Uint8Array>`，
 *    这条约束在结构上就已经输了。
 * 3. **快照是一次性物化，不是流式游标。** {@link DevToolsSnapshotSource} 要么交出
 *    完整的一批记录，要么报告 epoch 失效——**没有第三种结果**。允许「部分交付」
 *    等于允许拼接两个时点的数据，而分页读到的不一致状态无法在下游被发现。
 *
 * @module @aiao/rxdb-devtools/provider/types
 */

import type { DevToolsErrorPayload } from '../v2/errors.js';
import type { DevToolsProviderDescriptor } from './descriptor.js';

/**
 * 一条快照记录来自元数据还是文件本体。
 *
 * @remarks
 * 「两类缺失」（有元数据无文件 / 有文件无元数据）的判定完全建立在这个字段上：
 * 同一 `logicalPath` 只出现 `meta` 或只出现 `file`，就是一类缺失。
 */
export type DevToolsSnapshotSide = 'meta' | 'file';

/**
 * 快照的规范记录：`[side, logicalPath, id, size, contentVersion]`。
 *
 * @remarks
 * 定成**元组**而不是对象，是为了让字节计量不受键序影响——对象在不同实现里
 * `JSON.stringify` 出的键序可能不同，那样「32 MiB」在各端就是不同的量。
 * 缺失的标量一律写 `null`，不得省略字段：省略会让元组变短，同样破坏计量的一致性。
 */
export type DevToolsSnapshotRecord = readonly [
  side: DevToolsSnapshotSide,
  logicalPath: string,
  id: string | null,
  size: number | null,
  contentVersion: string | null
];

/**
 * 一次快照物化的结果。
 *
 * @remarks
 * `invalidated` 表示物化期间丢失了锁归属或 capture epoch 变了。调用方**必须从头重来
 * 并换一个新的 `snapshotId`**，绝不能把两次的记录拼起来。
 */
export type DevToolsSnapshotCaptureResult =
  | { readonly outcome: 'captured'; readonly records: readonly DevToolsSnapshotRecord[] }
  | { readonly outcome: 'invalidated' };

/** 快照的物化来源，由持有 storage 全局独占锁的一方实现。 */
export interface DevToolsSnapshotSource {
  /**
   * 在 storage 全局独占锁内物化元数据与已提交的逻辑文件。
   *
   * @remarks
   * 实现必须在**释放锁之前**完成物化并按 `(logicalPath, id)` 排序；锁外排序会把
   * 一个已经一致的批次重新暴露给并发写者。等锁与物化都要响应 `signal`：
   * 15 秒端到端 deadline 与显式取消都通过它中断。
   *
   * @param signal - 中止信号；已中止或中止后应尽快停止等待并回收临时资源。
   * @returns 完整的一批记录，或 epoch 失效的报告。
   */
  capture(signal: AbortSignal): Promise<DevToolsSnapshotCaptureResult>;
}

/**
 * 分块传输的字节下沉口。
 *
 * @remarks
 * 只有 {@link commit} 能让临时文件转正；其余任何终态都必须走 {@link discard}。
 * 实现不得在 `write` 与 `commit` 之间累积整文件。
 *
 * 三个方法都返回 `Promise<void>`，而不是 `void`：OPFS、Node 与 Rust 的落盘全是**异步 I/O**，
 * 同步签名逼着实现要么把 promise 吞掉（写失败在协议上完全不可见，状态机照常推进 offset，
 * 最后 commit 出一个短了几块的文件），要么在内存里攒够再一次性写（正是第 2 条约束要禁的事）。
 * 返回 promise 之后，状态机能等这一块真的落盘再认账，磁盘慢就自然地把帧压在队列里——
 * **背压是这个签名给的，不是实现能自己补出来的**。
 *
 * 失败用 **reject** 表达，不是返回错误联合：这里没有可供调用方分支处理的语义差别，
 * 任何一块写不下去，这条传输就只有一条路——discard + 结构化错误。
 */
export interface DevToolsChunkSink {
  /**
   * 写入一块已解码的字节。
   *
   * @remarks
   * 状态机保证**串行**调用：上一块 resolve 之前不会有下一块进来，实现无需自己排队。
   *
   * @param data - 本块字节；调用方不再持有它。
   * @returns 本块确实落盘后 resolve；reject 即这条传输作废。
   */
  write(data: Uint8Array): Promise<void>;

  /**
   * 把临时文件提交为正式文件。仅在完整校验通过的 COMPLETE 之后调用。
   *
   * @returns 目标文件确实转正后 resolve；reject 时调用方会转去 {@link discard}。
   */
  commit(): Promise<void>;

  /**
   * 丢弃临时文件与全部中间状态。
   *
   * @remarks
   * 必须幂等：取消、两道超时、写失败与 dispose 都可能触发它。
   *
   * @returns 清理完成后 resolve。
   */
  discard(): Promise<void>;
}

/**
 * 分块传输的字节来源；{@link DevToolsChunkSink} 的反向。
 *
 * @remarks
 * 形状是 `read(offset, length)` 而不是 `Promise<Uint8Array>` 或异步迭代器，理由与 sink 那条
 * 对称且同样是结构性的：交出整个数组等于要求实现先把整个文件读进内存，而「不在 renderer 或
 * main 整体缓存文件」这条约束一旦只靠纪律维持，就会在某次重构里安静地消失。按需读则让
 * 发送端在任意时刻只持有一块。
 *
 * `length` 由状态机给，恒 ≤ 256 KiB，且 `offset` 恒等于此前已读出的字节数——实现不需要
 * 自己记进度，也不该假设调用方会重读某一段。
 */
export interface DevToolsChunkSource {
  /** 总字节数；用于 `TRANSFER_START` 的 `totalBytes` 与限额预检。 */
  readonly totalBytes: number;

  /**
   * 读取 `[offset, offset + length)`。
   *
   * @param offset - 起始偏移，等于此前已读出的字节数。
   * @param length - 需要的字节数，恒 ≤ 256 KiB 且 > 0。
   * @returns 恰好 `length` 个字节。长度不符视为实现错误，本次传输以 `operation_failed`
   *   终结——短读被当成正常结果的话，对端收到的是一个静默截断的文件。
   */
  read(offset: number, length: number): Promise<Uint8Array>;

  /**
   * 释放这次读取占用的句柄。
   *
   * @remarks
   * 必须幂等：正常读完、取消、超时与 dispose 都会触发它。sink 那侧用 `commit` / `discard`
   * 区分终态，是因为它有「临时产物要不要转正」这个决定；读侧没有任何东西需要转正，
   * 因此只有一个出口，也就不存在漏掉某一条终态路径的可能。
   *
   * @returns 释放完成后 resolve；reject 会被调用方吞掉（没有第二条补救路径）。
   */
  close(): Promise<void>;
}

/**
 * 一次 provider 调用的结果。
 *
 * @remarks
 * 失败分支携带的是**已映射、已脱敏**的错误；平台原生异常不得穿透到这里。
 */
export type DevToolsProviderResult =
  | { readonly outcome: 'ok'; readonly result: unknown }
  | { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload };

/** 一个领域的 provider 实现。 */
export interface DevToolsProvider {
  /** 本 provider 的声明；授权矩阵的第二层直接读它。 */
  readonly descriptor: DevToolsProviderDescriptor;

  /**
   * 执行一个操作。
   *
   * @remarks
   * 调用方保证 `operation` 已经通过三层授权，因此实现**不再**做权限判断——
   * 两处判断迟早会漂移，而漂移的表现是某一处悄悄放宽。
   *
   * @param operation - 已授权的操作名。
   * @param params - 已通过 wire 层通用校验、但未按操作解释的参数；实现负责领域级校验
   *   （例如路径合法性 → `invalid_path`）。
   * @returns 成功结果或已映射的错误。
   */
  invoke(operation: string, params: unknown): Promise<DevToolsProviderResult>;
}
