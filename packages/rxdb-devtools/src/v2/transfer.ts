/**
 * @fileoverview 分块传输状态机：START / CHUNK* / COMPLETE / CANCEL 与 idle、总时长两道闸。
 *
 * @remarks
 * 本模块属于**控制面**：时限由状态机而不是 provider 掌握，因此 `transfer_timeout` 是控制面
 * 错误码。它只做记账与放行，字节一到就交给 sink——状态机自己**永远不拼接**任何缓冲，这是
 * 「不得整文件驻留内存」在本层唯一能落到结构上的保证。
 *
 * 三条容易做错、且做错以后测试仍然会绿的规则：
 *
 * 1. **被拒帧绝不刷新 idle deadline。** 所有拒绝分支都在刷新计时器**之前**返回，否则伪造者
 *    只要持续发非法帧就能让一条传输无限续命，两道闸同时形同虚设。
 * 2. **被拒帧也绝不结算。** 只有 COMPLETE 成功、CANCEL 和两个计时器能让传输进入终态。所以
 *    `transfer_incomplete` 是非终态的：发送方补齐剩余字节后仍可正常收尾，真正被遗弃的传输
 *    由 idle 闸回收。
 * 3. **超长串在解码之前就要挡掉。** 先按编码长度上界拒绝，避免用对端可控的字符串去分配缓冲。
 *
 * @module @aiao/rxdb-devtools/v2/transfer
 */

import { decodeCanonicalBase64 } from './base64.js';
import type { DevToolsCancelTimer, DevToolsClock } from './clock.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_MIN_CHUNK_BYTES,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from './constants.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsErrorPayload, DevToolsProviderErrorCode } from './errors.js';
import type {
  DevToolsTransferChunkPayload,
  DevToolsTransferIdPayload,
  DevToolsTransferStartPayload
} from './wire.js';

/**
 * 一块 chunk 的编码长度上界。
 *
 * @remarks
 * 规范 base64 把 3 字节编成 4 字符，因此 256 KiB 对应 349,528 个字符。超过这个长度的串
 * 无论内容是什么都不可能解码到限内，可以在分配任何缓冲之前直接拒绝。
 */
const MAX_ENCODED_CHUNK_LENGTH = Math.ceil(DEVTOOLS_MAX_CHUNK_BYTES / 3) * 4;

/**
 * 一条传输的终态原因。
 *
 * @remarks
 * `failed` 是字节**没能落盘**：sink 的 `write` reject 了。它与 `cancelled` 在清理上同路
 * （都要 discard），但归因完全不同——一个是对端不要了，一个是本端写不下去，
 * 混成一个值就再也分不出「用户取消」和「磁盘满」。
 */
export type DevToolsTransferOutcome = 'completed' | 'cancelled' | 'failed' | 'idle-timeout' | 'total-timeout';

/** 单帧处理结果。 */
export type DevToolsTransferResult =
  | { readonly outcome: 'accepted' }
  | { readonly outcome: 'settled'; readonly reason: DevToolsTransferOutcome }
  | { readonly outcome: 'rejected'; readonly error: DevToolsErrorPayload };

/** 传输表所需的外部依赖。 */
export interface DevToolsTransferPorts {
  /** 时间端口；idle 与总时长两道闸都走它。 */
  readonly clock: DevToolsClock;
  /** panel / connector / provider 三方取最小后的单次传输上限，单位字节。 */
  readonly negotiatedLimit: number;
  /**
   * 字节下沉口。
   *
   * @remarks
   * 每块在**它自己那一帧内**就被交出去；状态机不持有任何已解码字节。
   * 返回 promise：状态机等它 resolve 才认这一块，reject 即这条传输以 `failed` 终结。
   * 同一条传输上的调用被状态机串行化，实现不必自己排队。
   */
  readonly onChunk: (transferId: string, data: Uint8Array) => Promise<void>;
  /** 终态通知；五种终态都会触发，上层据此释放 session 的 transfer ID 名额。 */
  readonly onSettled: (transferId: string, outcome: DevToolsTransferOutcome) => Promise<void>;
}

/** 一端持有的全部在途传输。 */
export interface DevToolsTransferTable {
  /** 当前在途传输数。 */
  readonly size: number;

  /**
   * 处理一帧 `TRANSFER_START`。
   *
   * @param payload - START 载荷。
   * @returns 接受，或带 provider 错误码的拒绝。
   */
  start(payload: DevToolsTransferStartPayload): DevToolsTransferResult;

  /**
   * 处理一帧 `TRANSFER_CHUNK`。
   *
   * @remarks
   * 同一条传输上的 CHUNK 按到达顺序**串行**处理：本块 resolve 之前，后到的帧排队等待，
   * 而不是拿着尚未推进的 `nextChunkIndex` 去撞 `transfer_sequence_invalid`。
   * 这就是背压——磁盘慢时帧压在队列里，对端不会收到一串假的时序错误。
   *
   * @param payload - CHUNK 载荷。
   * @returns 接受（字节**已落盘**、idle 已续期），或拒绝（校验没过，或写失败——
   *   后者已经把这条传输结算成 `failed`）。
   */
  chunk(payload: DevToolsTransferChunkPayload): Promise<DevToolsTransferResult>;

  /**
   * 处理一帧 `TRANSFER_COMPLETE`。
   *
   * @remarks
   * 先等这条传输的写队列排空，再判字节数：还有块在飞的时候去 commit，提交的就是个短文件。
   *
   * @param payload - 只含 `transferId` 的载荷。
   * @returns 字节数与声明一致时进入终态；短少时拒绝且**不**结算。
   */
  complete(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult>;

  /**
   * 处理一帧 `TRANSFER_CANCEL`。
   *
   * @param payload - 只含 `transferId` 的载荷。
   * @returns 结算（临时产物已清理完），或对未知/已终结的 ID 拒绝。
   */
  cancel(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult>;

  /**
   * 拆除整张表：取消全部计时器、丢弃全部在途传输。
   *
   * @remarks
   * **不**触发 `onSettled`——dispose 是本端主动拆链路，对端不需要一条迟到的终态通知。
   */
  dispose(): void;
}

/** 一条在途传输的账本。 */
interface TransferEntry {
  readonly totalBytes: number;
  nextChunkIndex: number;
  receivedBytes: number;
  /**
   * 本条传输的落盘队列尾。
   *
   * @remarks
   * 每帧 CHUNK 把自己挂在它后面再更新它，于是 sink 的 `write` 天然串行且保序。
   * 挂的是**已吞掉失败**的分支：一次写失败不能把后面所有等待者一起变成未处理的 rejection，
   * 失败的归因走 `failed` 终态，不走这条链。
   */
  writes: Promise<void>;
  cancelIdle: DevToolsCancelTimer;
  readonly cancelTotal: DevToolsCancelTimer;
}

function rejected(code: DevToolsProviderErrorCode): DevToolsTransferResult {
  return { outcome: 'rejected', error: createDevToolsError(code) };
}

const ACCEPTED: DevToolsTransferResult = { outcome: 'accepted' };

class DevToolsTransferTableImpl implements DevToolsTransferTable {
  readonly #ports: DevToolsTransferPorts;
  readonly #entries = new Map<string, TransferEntry>();
  #disposed = false;

  get size(): number {
    return this.#entries.size;
  }

  constructor(ports: DevToolsTransferPorts) {
    this.#ports = ports;
  }

  start(payload: DevToolsTransferStartPayload): DevToolsTransferResult {
    if (this.#disposed) return rejected('transfer_closed');
    // 重复 START 属于时序错误，而不是「这个 ID 太大」：先判它才不会给出误导性的错误码。
    if (this.#entries.has(payload.transferId)) return rejected('transfer_sequence_invalid');
    if (payload.totalBytes > this.#ports.negotiatedLimit) return rejected('transfer_size_exceeded');

    const { transferId } = payload;
    this.#entries.set(transferId, {
      totalBytes: payload.totalBytes,
      nextChunkIndex: 0,
      receivedBytes: 0,
      writes: Promise.resolve(),
      cancelIdle: this.#armIdle(transferId),
      cancelTotal: this.#ports.clock.setTimeout(
        () => this.#expire(transferId, 'total-timeout'),
        DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
      )
    });
    return ACCEPTED;
  }

  chunk(payload: DevToolsTransferChunkPayload): Promise<DevToolsTransferResult> {
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return Promise.resolve(rejected('transfer_closed'));

    const result = entry.writes.then(() => this.#acceptChunk(payload));
    entry.writes = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async complete(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult> {
    await this.#entries.get(payload.transferId)?.writes;

    // 排队期间这条传输可能已经因为写失败或超时终结，重新取一次才作数。
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return rejected('transfer_closed');
    // 短少不是终态：发送方补齐后仍可收尾，真正被遗弃的传输由 idle 闸回收。
    if (entry.receivedBytes !== entry.totalBytes) return rejected('transfer_incomplete');

    await this.#settle(payload.transferId, entry, 'completed');
    return { outcome: 'settled', reason: 'completed' };
  }

  async cancel(payload: DevToolsTransferIdPayload): Promise<DevToolsTransferResult> {
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return rejected('transfer_closed');

    await this.#settle(payload.transferId, entry, 'cancelled');
    return { outcome: 'settled', reason: 'cancelled' };
  }

  dispose(): void {
    this.#disposed = true;
    for (const entry of this.#entries.values()) {
      entry.cancelIdle();
      entry.cancelTotal();
    }
    this.#entries.clear();
  }

  /**
   * 队列里轮到这一帧时才跑的校验与落盘。
   *
   * @remarks
   * `entry` 在这里重新取：排队期间这条传输可能已经被取消或超时掉了，用入队时抓的那份
   * 会往一个已经结算的账本上继续记数。
   */
  async #acceptChunk(payload: DevToolsTransferChunkPayload): Promise<DevToolsTransferResult> {
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return rejected('transfer_closed');
    if (payload.chunkIndex !== entry.nextChunkIndex || payload.offset !== entry.receivedBytes) {
      return rejected('transfer_sequence_invalid');
    }
    // 长度上界先行：不拿对端可控的串去分配缓冲。
    if (payload.dataBase64.length > MAX_ENCODED_CHUNK_LENGTH) return rejected('payload_too_large');

    const data = decodeCanonicalBase64(payload.dataBase64);
    if (data === undefined) return rejected('payload_encoding_invalid');
    // 空 chunk 会消耗一个下标却不推进 offset，破坏 index ↔ offset 的一一对应。
    if (data.byteLength < DEVTOOLS_MIN_CHUNK_BYTES) return rejected('transfer_sequence_invalid');
    if (data.byteLength > DEVTOOLS_MAX_CHUNK_BYTES) return rejected('payload_too_large');
    if (entry.receivedBytes + data.byteLength > entry.totalBytes) return rejected('transfer_size_exceeded');

    // idle 闸量的是**对端沉默**，不是本端磁盘：帧已经到了，先续期再去写。
    entry.cancelIdle();
    entry.cancelIdle = this.#armIdle(payload.transferId);
    return this.#sink(payload.transferId, entry, data);
  }

  /**
   * 把一块字节交出去，落盘成功才记账。
   *
   * @remarks
   * 写失败当场把传输结算成 `failed`：让它留在表里等 COMPLETE，只会拿一个缺了几块的临时文件
   * 去 commit。错误码用 `operation_failed`——sink 的 reject 里没有可安全归类的语义
   * （见 `errors.ts` 对这个码的说明）。
   */
  async #sink(transferId: string, entry: TransferEntry, data: Uint8Array): Promise<DevToolsTransferResult> {
    try {
      await this.#ports.onChunk(transferId, data);
    } catch {
      if (this.#entries.get(transferId) === entry) await this.#settle(transferId, entry, 'failed');
      return rejected('operation_failed');
    }

    entry.nextChunkIndex += 1;
    entry.receivedBytes += data.byteLength;
    return ACCEPTED;
  }

  #armIdle(transferId: string): DevToolsCancelTimer {
    return this.#ports.clock.setTimeout(() => this.#expire(transferId, 'idle-timeout'), DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS);
  }

  /**
   * 时限到点。
   *
   * @remarks
   * 计时器回调没有可以 await 的调用方，清理只能后台跑；它自己不会抛（`onSettled` 由端点
   * 兜底），所以这里 `void` 掉是穷尽的，而不是把一条失败路径丢掉。
   */
  #expire(transferId: string, outcome: DevToolsTransferOutcome): void {
    const entry = this.#entries.get(transferId);
    if (entry === undefined) return;

    void this.#settle(transferId, entry, outcome);
  }

  async #settle(transferId: string, entry: TransferEntry, outcome: DevToolsTransferOutcome): Promise<void> {
    entry.cancelIdle();
    entry.cancelTotal();
    this.#entries.delete(transferId);
    await this.#ports.onSettled(transferId, outcome);
  }
}

/**
 * 创建一张传输表。
 *
 * @param ports - 时钟、协商上限与两个回调。
 * @returns 一个 {@link DevToolsTransferTable}。
 */
export function createDevToolsTransferTable(ports: DevToolsTransferPorts): DevToolsTransferTable {
  return new DevToolsTransferTableImpl(ports);
}
