/**
 * NOTIFY 行事件的去重与批量窗口。
 *
 * @remarks
 * 从 `PGliteClient` 里抽出来，是因为 US-208 的桌面客户端要用**同一套**批量语义：
 * 主进程 host 转发的是裸 NOTIFY（`channel` + `payload`），批量与去重仍然发生在渲染进程。
 * 两边各写一份的话，「同一行在一个窗口内只派发一次」这条会在两条路径上悄悄分叉——
 * 而分叉的表征是「桌面下变更事件比浏览器多」，排查时根本不会怀疑到批量窗口上。
 *
 * @module notify/notification-batcher
 */

import { PGliteChangeEvent, PGliteChangeType, PGliteNotifyPayload } from '../pglite.interface.js';

/** 窗口内累积的单行事件。 */
interface PendingPGliteEvent {
  readonly type: PGliteChangeType;
  readonly tableName: string;
  readonly id: string | number;
}

/** 默认的 trailing 防抖间隔（毫秒）。 */
export const DEFAULT_NOTIFY_BATCH_TIMEOUT_MS = 16;

/**
 * 一个批量窗口从开启到**必须**冲刷的上限（毫秒）。
 *
 * @remarks
 * 纯 trailing debounce 下，写入间隔只要小于防抖间隔，定时器就被无限重置，事件一条也派发不出去
 * （PGL-008）。该上限**同步**在每条 NOTIFY 到达时检查——不能靠再加一个 `setTimeout`：
 * 紧凑的 `await` 循环会把宏任务队列饿死，定时器根本不到期（sqlite 侧 SWM-005 实测过同一现象）。
 */
export const DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS = 100;

/** 单个窗口内累积事件的上限，超过即立即冲刷，形成背压。 */
export const DEFAULT_NOTIFY_MAX_PENDING_EVENTS = 5000;

/** {@link PGliteNotificationBatcher} 的入参。 */
export interface PGliteNotificationBatcherOptions {
  /** 取当前数据库名；用 getter 而不是值，是因为 `init()` 之后它才确定。 */
  readonly resolveDbName: () => string;
  /** 冲刷时派发一条聚合后的变更事件。 */
  readonly emit: (event: PGliteChangeEvent) => void;
  /** trailing 防抖间隔（毫秒），默认 {@link DEFAULT_NOTIFY_BATCH_TIMEOUT_MS}。 */
  readonly batchTimeout?: number;
  /** 窗口硬上限（毫秒），默认 {@link DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS}。 */
  readonly maxBatchWait?: number;
  /** 窗口容量上限，默认 {@link DEFAULT_NOTIFY_MAX_PENDING_EVENTS}。 */
  readonly maxPendingEvents?: number;
  /** 解析 payload 失败时的上报口；不传则丢弃。 */
  readonly onParseError?: (error: unknown) => void;
}

/**
 * 把裸 NOTIFY 聚合成 {@link PGliteChangeEvent}。
 *
 * @remarks
 * 按 `type + table + id` 去重，按 `type + table` 分组，窗口到期或超限时一次性派发。
 */
export class PGliteNotificationBatcher {
  readonly #options: PGliteNotificationBatcherOptions;
  readonly #batchTimeout: number;
  readonly #maxBatchWait: number;
  readonly #maxPendingEvents: number;

  #pendingEvents: PendingPGliteEvent[] = [];
  /** `type\0table\0id` 去重集合，与 {@link #pendingEvents} 同生命周期。 */
  #pendingEventKeys = new Set<string>();
  #windowStartedAt?: number;
  #sendTimer?: ReturnType<typeof setTimeout>;

  /** trailing 防抖间隔（毫秒）。 */
  get batchTimeout(): number {
    return this.#batchTimeout;
  }

  /** 尚未分发的行事件数量。 */
  get pendingCount(): number {
    return this.#pendingEvents.length;
  }

  /** 当前是否有一个还没到期的防抖定时器。 */
  get hasScheduledFlush(): boolean {
    return this.#sendTimer !== undefined;
  }

  constructor(options: PGliteNotificationBatcherOptions) {
    this.#options = options;
    this.#batchTimeout = options.batchTimeout ?? DEFAULT_NOTIFY_BATCH_TIMEOUT_MS;
    this.#maxBatchWait = options.maxBatchWait ?? DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS;
    this.#maxPendingEvents = options.maxPendingEvents ?? DEFAULT_NOTIFY_MAX_PENDING_EVENTS;
  }

  /**
   * 收下一条 NOTIFY。
   *
   * @param channel - 频道名，形如 `<table>_notify`
   * @param payload - 触发器写入的 JSON 文本
   */
  accept(channel: string, payload: string): void {
    if (!payload || payload.trim().length === 0) return;

    let data: PGliteNotifyPayload;
    try {
      data = JSON.parse(payload) as PGliteNotifyPayload;
    } catch (error) {
      this.#options.onParseError?.(error);
      return;
    }

    const tableName = channel.replace('_notify', '');
    for (const id of data.ids) {
      // 分隔符用 NUL：表名与 id 都可能含下划线或空格，用可见字符拼 key 会让不同的三元组
      // 撞成同一个字符串，表现为某一行的变更事件被当成重复丢掉。
      const key = `${data.operation}\u0000${tableName}\u0000${id}`;
      if (this.#pendingEventKeys.has(key)) continue;
      this.#pendingEventKeys.add(key);
      this.#pendingEvents.push({ type: data.operation, tableName, id });
    }

    this.#windowStartedAt ??= Date.now();

    // max-wait / 容量兜底：两者都在这里**同步**判定，不依赖定时器到期。
    const windowExpired = Date.now() - this.#windowStartedAt >= this.#maxBatchWait;
    const overCapacity = this.#pendingEvents.length >= this.#maxPendingEvents;
    if (windowExpired || overCapacity) {
      this.#cancelTimer();
      this.flush();
      return;
    }

    this.#cancelTimer();
    this.#sendTimer = setTimeout(() => {
      this.#sendTimer = undefined;
      this.flush();
    }, this.#batchTimeout);
  }

  /** 立即派发窗口内的全部事件并清空窗口；已排的防抖定时器一并取消。 */
  flush(): void {
    this.#cancelTimer();
    const grouped = new Map<string, PendingPGliteEvent[]>();
    for (const event of this.#pendingEvents) {
      const key = `${event.type}_${event.tableName}`;
      const events = grouped.get(key) ?? [];
      events.push(event);
      grouped.set(key, events);
    }

    for (const events of grouped.values()) {
      if (events.length === 0) continue;
      const first = events[0];
      this.#options.emit({
        type: first.type,
        dbName: this.#options.resolveDbName(),
        tableName: first.tableName,
        rowIds: events.map(event => event.id),
        recordAt: new Date()
      });
    }

    this.#reset();
  }

  /** 丢弃窗口内的全部事件，不派发。用于断开连接。 */
  clear(): void {
    this.#cancelTimer();
    this.#reset();
  }

  #cancelTimer(): void {
    if (this.#sendTimer === undefined) return;
    clearTimeout(this.#sendTimer);
    this.#sendTimer = undefined;
  }

  #reset(): void {
    this.#pendingEvents.length = 0;
    this.#pendingEventKeys.clear();
    this.#windowStartedAt = undefined;
  }
}
