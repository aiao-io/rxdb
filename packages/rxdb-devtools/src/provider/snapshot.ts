/**
 * @fileoverview 不可变快照：锁内物化、规范字节计量、cursor 分页与 epoch 重试。
 *
 * @remarks
 * 快照存在的唯一理由是让 panel 能得出「两类缺失」的结论。这个结论只有在**同一个时点**的
 * 全量数据上才成立，因此本模块的每条规则都是围绕「不许拼接两个时点」展开的：
 *
 * - epoch 失效 ⇒ **换新 `snapshotId` 从头重来**，绝不接着上一次的记录往下拼；
 * - 越限 ⇒ 直接 `snapshot_too_large`，**不截断**。截断后的快照看上去是完整的一页页数据，
 *   panel 会照样得出「缺失」结论——而那些「缺失」只是被砍掉的尾巴；
 * - 只有最后一页的 `complete: true` 才授权 panel 下结论，中途任何一页都不行。
 *
 * 三个容易做错的点：
 *
 * 1. **15 秒 deadline 是端到端的，不是每次尝试各一份。** 实现方式是先判「是否已到期」
 *    再解释 race 的结果——否则一次恰好在到期瞬间返回的 `invalidated` 会开启第二次等锁，
 *    实际耗时变成 15 秒的倍数。
 * 2. **被拒的分页请求不刷新 cursor 的 idle。** 与 transfer 的 idle 闸同一条理由：
 *    否则持续发非法 offset 就能把一份快照无限期钉在内存里。
 * 3. **字节计量走同一个导出的 helper。** panel、connector 与三端 provider 必须用同一份
 *    实现，否则「32 MiB」在各端是不同的量，而这种分叉只在接近上限时才暴露。
 *
 * @module @aiao/rxdb-devtools/provider/snapshot
 */

import type { DevToolsCancelTimer, DevToolsClock } from '../v2/clock.js';
import {
  DEVTOOLS_DEFAULT_PAGE_SIZE,
  DEVTOOLS_MAX_SNAPSHOT_BYTES,
  DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES,
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  DEVTOOLS_SNAPSHOT_TIMEOUT_MS
} from '../v2/constants.js';
import { createProviderError } from '../v2/error-mapping.js';
import type { DevToolsErrorPayload } from '../v2/errors.js';
import { createDevToolsError } from '../v2/errors.js';
import { isNonNegativeSafeInteger, isPageSize } from '../v2/guards.js';
import { createSessionId } from '../v2/ids.js';
import type { DevToolsSnapshotCaptureResult, DevToolsSnapshotRecord, DevToolsSnapshotSource } from './types.js';

/** 分页游标；三个绑定条件（session、snapshot、页边界）里的后两个由它承载。 */
export interface DevToolsSnapshotCursor {
  /** 目标快照的身份。 */
  readonly snapshotId: string;
  /** 页起始下标；必须落在已物化的页边界上。 */
  readonly offset: number;
}

/** 一页快照记录。 */
export interface DevToolsSnapshotPage {
  /** 本页所属快照的身份；后续分页必须原样回传。 */
  readonly snapshotId: string;
  /** 本页记录，保持物化时的 `(logicalPath, id)` 次序。 */
  readonly records: readonly DevToolsSnapshotRecord[];
  /** 本页在全量记录中的起始下标。 */
  readonly offset: number;
  /** 仅当本页是最后一页时为 `true`；**只有它为真时 panel 才可以下「两类缺失」的结论**。 */
  readonly complete: boolean;
}

/**
 * 一次快照请求的结果。
 *
 * @remarks
 * `cancelled` 单独成一支而不是伪装成 `snapshot_busy`：取消是本端主动行为，
 * 把它报成「忙」会诱导对端重试一件自己刚刚放弃的事。
 */
export type DevToolsSnapshotResult =
  | { readonly outcome: 'page'; readonly page: DevToolsSnapshotPage }
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'rejected'; readonly error: DevToolsErrorPayload };

/** 构造快照仓库所需的外部依赖。 */
export interface DevToolsSnapshotPorts {
  /** 时间端口；15 秒端到端 deadline 与 60 秒 cursor 过期都走它。 */
  readonly clock: DevToolsClock;
  /** 物化来源，由持有 storage 全局独占锁的一方提供。 */
  readonly source: DevToolsSnapshotSource;
}

/** 一个 session 的快照仓库；**同时最多持有一份**活跃快照。 */
export interface DevToolsSnapshotStore {
  /** 当前是否持有一份可分页的快照。 */
  readonly active: boolean;

  /**
   * 物化一份新快照并返回它的第一页。
   *
   * @remarks
   * 已有的活跃快照会先被释放——它的 cursor 之后只会得到 `snapshot_expired`，
   * 而不会读到新快照的数据。
   *
   * @param pageSize - 每页记录数，1–500，默认 100。
   * @returns 第一页、取消，或 `invalid_message` / `snapshot_busy` / `snapshot_too_large`。
   */
  open(pageSize?: number): Promise<DevToolsSnapshotResult>;

  /**
   * 读取活跃快照的后续页。
   *
   * @param cursor - 必须绑定当前快照且落在页边界上。
   * @returns 该页，或 `snapshot_expired` / `invalid_message`。被拒时**不**刷新 idle。
   */
  page(cursor: DevToolsSnapshotCursor): DevToolsSnapshotResult;

  /** 释放活跃快照与它的 idle 计时器。幂等。 */
  release(): void;

  /** 中止在途物化并释放活跃快照。幂等。 */
  cancel(): void;

  /** 拆除仓库：中止在途物化、释放快照，此后 {@link open} 恒返回 `snapshot_expired`。 */
  dispose(): void;
}

/** 中断在途物化的原因。 */
type Interruption = 'busy' | 'cancelled';

/** 一次在途物化的账本。 */
interface PendingCapture {
  readonly controller: AbortController;
  readonly cancelDeadline: DevToolsCancelTimer;
  interruption: Interruption | undefined;
}

/** 一份已物化的快照。 */
interface ActiveSnapshot {
  readonly snapshotId: string;
  readonly records: readonly DevToolsSnapshotRecord[];
  readonly pageSize: number;
  cancelIdle: DevToolsCancelTimer;
}

const CANCELLED: DevToolsSnapshotResult = { outcome: 'cancelled' };

/**
 * 构造一条拒绝。
 *
 * @remarks
 * provider 侧的三个码走共享的可重试性表，避免「`snapshot_busy` 在这里可重试、在那里不可」
 * 这类只在某条路径上暴露的分叉；`invalid_message` 属控制面，恒为不可重试。
 */
function rejected(
  code: 'invalid_message' | 'snapshot_busy' | 'snapshot_expired' | 'snapshot_too_large'
): DevToolsSnapshotResult {
  const error = code === 'invalid_message' ? createDevToolsError(code) : createProviderError(code);
  return { outcome: 'rejected', error };
}

/**
 * 一条规范记录的字节数。
 *
 * @remarks
 * 固定为 `TextEncoder().encode(JSON.stringify(tuple)).byteLength`，**不含** transport
 * envelope。用字节而不是 `String.length`：后者数的是 UTF-16 码元，含非 ASCII 路径的
 * 同一份数据在两端会算出不同的值。
 *
 * @param record - 规范记录元组。
 * @returns 该记录的规范 JSON 字节数。
 */
export function snapshotRecordBytes(record: DevToolsSnapshotRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

/**
 * 一批规范记录的字节总量。
 *
 * @param records - 规范记录。
 * @returns 逐条 {@link snapshotRecordBytes} 之和。
 */
export function totalSnapshotBytes(records: readonly DevToolsSnapshotRecord[]): number {
  let total = 0;
  for (const record of records) total += snapshotRecordBytes(record);
  return total;
}

class DevToolsSnapshotStoreImpl implements DevToolsSnapshotStore {
  readonly #ports: DevToolsSnapshotPorts;
  #pending: PendingCapture | undefined;
  /** race 的解除句柄；`#capture` 建立 promise 后写入，`#interrupt` 调用。 */
  #resolveInterrupt: (() => void) | undefined;
  #snapshot: ActiveSnapshot | undefined;
  #disposed = false;

  get active(): boolean {
    return this.#snapshot !== undefined;
  }

  constructor(ports: DevToolsSnapshotPorts) {
    this.#ports = ports;
  }

  async open(pageSize: number = DEVTOOLS_DEFAULT_PAGE_SIZE): Promise<DevToolsSnapshotResult> {
    // 校验排在一切之前：非法页大小不得触发等锁，更不得分配任何资源。
    if (!isPageSize(pageSize)) return rejected('invalid_message');
    if (this.#disposed) return rejected('snapshot_expired');
    if (this.#pending !== undefined) return rejected('snapshot_busy');

    this.release();
    return this.#capture(pageSize);
  }

  page(cursor: DevToolsSnapshotCursor): DevToolsSnapshotResult {
    const snapshot = this.#snapshot;
    if (snapshot === undefined || cursor.snapshotId !== snapshot.snapshotId) return rejected('snapshot_expired');
    if (!isNonNegativeSafeInteger(cursor.offset) || cursor.offset % snapshot.pageSize !== 0) {
      return rejected('invalid_message');
    }
    if (cursor.offset > 0 && cursor.offset >= snapshot.records.length) return rejected('invalid_message');

    // 刷新只在这一行发生：上面每条拒绝分支都已经返回，被拒帧因此不能续命。
    snapshot.cancelIdle();
    snapshot.cancelIdle = this.#armIdle();
    return this.#pageAt(snapshot, cursor.offset);
  }

  release(): void {
    this.#snapshot?.cancelIdle();
    this.#snapshot = undefined;
  }

  cancel(): void {
    this.#interrupt('cancelled');
    this.release();
  }

  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }

  /**
   * 等锁、物化并重试。
   *
   * @remarks
   * deadline 与取消都不是 race 的「结果」而是**状态**：先看状态再解释结果，一次恰好压线
   * 返回的 `invalidated` 才不会开启第二轮等待，把端到端 15 秒变成它的倍数。
   *
   * 收尾**只在 `finally` 里做一次**，因此正常返回、拒绝与异常走同一条路径。把清理写在
   * 各个成功/失败分支上曾经留下一个洞：`source.capture` 一旦抛出（平台实现等锁时抛一个
   * DOMException 就够了），在途账本永远留着，此后每一次 {@link open} 都答 `snapshot_busy`——
   * 而那份「忙」背后没有任何在途工作，也没有任何东西会来解除它。
   */
  async #capture(pageSize: number): Promise<DevToolsSnapshotResult> {
    const pending = this.#armPending();
    // 中断用 `invalidated` 解除 race，而不是另立一个哨兵值：中断路径一定先写好
    // `interruption`，下面第一行就把它接走，这个值永远不会被当成物化结果解释。
    // 多一个哨兵只会换来一条永远走不到、却要靠注释解释的分支。
    const interrupted = new Promise<DevToolsSnapshotCaptureResult>(resolve => {
      this.#resolveInterrupt = () => resolve({ outcome: 'invalidated' });
    });

    try {
      for (let attempt = 0; attempt <= DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES; attempt += 1) {
        const raced = await Promise.race([this.#ports.source.capture(pending.controller.signal), interrupted]);

        if (pending.interruption !== undefined) return this.#settle(pending.interruption);
        if (raced.outcome === 'captured') return this.#materialize(raced.records, pageSize);
        // epoch 变了：换新身份从头再来，绝不拼接两个时点的数据。
      }
      return this.#settle('busy');
    } finally {
      this.#clearPending(pending);
    }
  }

  /**
   * 收回一次物化占用的在途资源：15 秒 deadline、账本与 race 解除句柄。
   *
   * @remarks
   * 身份判等而不是无条件清空：这样它对「已被别的路径收走」是安全的，调用点不必先问状态。
   * `cancelDeadline` 则无条件调用——计时器只属于这一次物化，没有第二个主人。
   *
   * @param pending - 本次物化的账本。
   */
  #clearPending(pending: PendingCapture): void {
    pending.cancelDeadline();
    if (this.#pending !== pending) return;
    this.#pending = undefined;
    this.#resolveInterrupt = undefined;
  }

  #armPending(): PendingCapture {
    const pending: PendingCapture = {
      controller: new AbortController(),
      cancelDeadline: this.#ports.clock.setTimeout(() => this.#interrupt('busy'), DEVTOOLS_SNAPSHOT_TIMEOUT_MS),
      interruption: undefined
    };
    this.#pending = pending;
    return pending;
  }

  #interrupt(reason: Interruption): void {
    const pending = this.#pending;
    if (pending === undefined || pending.interruption !== undefined) return;

    pending.interruption = reason;
    pending.controller.abort();
    this.#resolveInterrupt?.();
  }

  /** 把一次未能物化的收场翻译成对外结果；资源回收由 `#capture` 的 `finally` 负责。 */
  #settle(reason: Interruption): DevToolsSnapshotResult {
    return reason === 'cancelled' ? CANCELLED : rejected('snapshot_busy');
  }

  #materialize(records: readonly DevToolsSnapshotRecord[], pageSize: number): DevToolsSnapshotResult {
    // 条数先判：越限时不必为一批注定要丢弃的记录做字节计量。
    if (records.length > DEVTOOLS_MAX_SNAPSHOT_RECORDS) return rejected('snapshot_too_large');
    if (totalSnapshotBytes(records) > DEVTOOLS_MAX_SNAPSHOT_BYTES) return rejected('snapshot_too_large');

    const snapshot: ActiveSnapshot = {
      snapshotId: createSessionId(),
      records,
      pageSize,
      cancelIdle: this.#armIdle()
    };
    this.#snapshot = snapshot;
    return this.#pageAt(snapshot, 0);
  }

  #pageAt(snapshot: ActiveSnapshot, offset: number): DevToolsSnapshotResult {
    const end = offset + snapshot.pageSize;
    return {
      outcome: 'page',
      page: {
        snapshotId: snapshot.snapshotId,
        records: snapshot.records.slice(offset, end),
        offset,
        complete: end >= snapshot.records.length
      }
    };
  }

  #armIdle(): DevToolsCancelTimer {
    return this.#ports.clock.setTimeout(() => this.release(), DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS);
  }
}

/**
 * 创建一个 session 级快照仓库。
 *
 * @param ports - 时钟与物化来源。
 * @returns 一个 {@link DevToolsSnapshotStore}。
 */
export function createDevToolsSnapshotStore(ports: DevToolsSnapshotPorts): DevToolsSnapshotStore {
  return new DevToolsSnapshotStoreImpl(ports);
}
