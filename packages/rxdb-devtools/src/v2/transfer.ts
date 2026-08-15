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

/** 一条传输的终态原因。 */
export type DevToolsTransferOutcome = 'completed' | 'cancelled' | 'idle-timeout' | 'total-timeout';

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
   */
  readonly onChunk: (transferId: string, data: Uint8Array) => void;
  /** 终态通知；四种终态都会触发，上层据此释放 session 的 transfer ID 名额。 */
  readonly onSettled: (transferId: string, outcome: DevToolsTransferOutcome) => void;
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
   * @param payload - CHUNK 载荷。
   * @returns 接受（字节已下沉、idle 已续期），或拒绝（两者都没发生）。
   */
  chunk(payload: DevToolsTransferChunkPayload): DevToolsTransferResult;

  /**
   * 处理一帧 `TRANSFER_COMPLETE`。
   *
   * @param payload - 只含 `transferId` 的载荷。
   * @returns 字节数与声明一致时进入终态；短少时拒绝且**不**结算。
   */
  complete(payload: DevToolsTransferIdPayload): DevToolsTransferResult;

  /**
   * 处理一帧 `TRANSFER_CANCEL`。
   *
   * @param payload - 只含 `transferId` 的载荷。
   * @returns 结算，或对未知/已终结的 ID 拒绝。
   */
  cancel(payload: DevToolsTransferIdPayload): DevToolsTransferResult;

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
      cancelIdle: this.#armIdle(transferId),
      cancelTotal: this.#ports.clock.setTimeout(
        () => this.#expire(transferId, 'total-timeout'),
        DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
      )
    });
    return ACCEPTED;
  }

  chunk(payload: DevToolsTransferChunkPayload): DevToolsTransferResult {
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

    entry.nextChunkIndex += 1;
    entry.receivedBytes += data.byteLength;
    entry.cancelIdle();
    entry.cancelIdle = this.#armIdle(payload.transferId);
    this.#ports.onChunk(payload.transferId, data);
    return ACCEPTED;
  }

  complete(payload: DevToolsTransferIdPayload): DevToolsTransferResult {
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return rejected('transfer_closed');
    // 短少不是终态：发送方补齐后仍可收尾，真正被遗弃的传输由 idle 闸回收。
    if (entry.receivedBytes !== entry.totalBytes) return rejected('transfer_incomplete');

    this.#settle(payload.transferId, entry, 'completed');
    return { outcome: 'settled', reason: 'completed' };
  }

  cancel(payload: DevToolsTransferIdPayload): DevToolsTransferResult {
    const entry = this.#entries.get(payload.transferId);
    if (entry === undefined) return rejected('transfer_closed');

    this.#settle(payload.transferId, entry, 'cancelled');
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

  #armIdle(transferId: string): DevToolsCancelTimer {
    return this.#ports.clock.setTimeout(() => this.#expire(transferId, 'idle-timeout'), DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS);
  }

  #expire(transferId: string, outcome: DevToolsTransferOutcome): void {
    const entry = this.#entries.get(transferId);
    if (entry === undefined) return;

    this.#settle(transferId, entry, outcome);
  }

  #settle(transferId: string, entry: TransferEntry, outcome: DevToolsTransferOutcome): void {
    entry.cancelIdle();
    entry.cancelTotal();
    this.#entries.delete(transferId);
    this.#ports.onSettled(transferId, outcome);
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
