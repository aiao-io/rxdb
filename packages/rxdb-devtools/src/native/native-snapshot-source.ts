/**
 * @fileoverview 原生宿主的诊断快照物化来源（US-904 阶段 D，AC#48）。
 *
 * @remarks
 * 分页、字节计量、15 秒端到端 deadline、epoch 重试与 `snapshot_busy` / `snapshot_too_large` /
 * `snapshot_expired` 全部由 `provider/snapshot.ts` 的仓库负责，本模块**只**做仓库要求的那一件事：
 * 在 storage 全局独占锁内交出**同一时点**的全量记录，或者报告这个时点已经不成立。
 *
 * 三条结构性约束：
 *
 * 1. **要么全量，要么失效，没有第三种结果。** 交出一批「大部分」记录看上去和一批完整记录
 *    毫无区别，而面板会照样据此得出「两类缺失」的结论——那些缺失只是没读到的部分。因此
 *    本模块不接受分页读，也不在锁外补读。
 * 2. **epoch 在锁内读两次，前后必须相同。** 只在开头读一次等于假设「拿到锁 = 没人改过」，
 *    而锁归属可能在物化中途丢失（宿主重启、租约过期）；那时读到的两半分属两个时点。
 * 3. **在途上传不算文件。** 端口刻意叫 `readCommittedFiles`：一个正在写的临时产物出现在
 *    快照里，会让面板报出一条「有文件无元数据」的假缺失，而它下一秒就会自己消失——
 *    这类只在特定时刻复现的误报最难被承认是误报。
 *
 * @module @aiao/rxdb-devtools/native/native-snapshot-source
 */

import type {
  DevToolsSnapshotCaptureResult,
  DevToolsSnapshotRecord,
  DevToolsSnapshotSide,
  DevToolsSnapshotSource
} from '../provider/types.js';

/** 快照的一条原始条目；`side` 由读取它的端口决定，不由条目自己声明。 */
export interface DevToolsSnapshotEntry {
  /** 逻辑路径；排序的第一键。 */
  readonly logicalPath: string;
  /** 记录 ID；排序的第二键，缺失写 `null`。 */
  readonly id: string | null;
  /** 字节数；缺失写 `null`。 */
  readonly size: number | null;
  /** 内容版本；缺失写 `null`。 */
  readonly contentVersion: string | null;
}

/** 一次锁内任务的结果。 */
export type DevToolsSnapshotLockResult<TValue> =
  { readonly outcome: 'held'; readonly value: TValue } | { readonly outcome: 'lost' } | { readonly outcome: 'aborted' };

/** storage 全局独占锁。 */
export interface DevToolsSnapshotLock {
  /**
   * 取得独占锁并在锁内运行 `task`。
   *
   * @remarks
   * `lost` 与 `aborted` 分开报，是因为它们对宿主的含义不同（前者要放弃租约，后者要停止等待），
   * 尽管两者对本模块都归结为「这个时点不成立」。等锁必须响应 `signal`：15 秒 deadline
   * 与显式取消都只能通过它中断。
   *
   * @param signal - 中止信号。
   * @param task - 锁内执行的物化。
   * @returns 锁内结果、锁归属丢失，或等锁/锁内被中止。
   */
  run<TValue>(signal: AbortSignal, task: () => Promise<TValue>): Promise<DevToolsSnapshotLockResult<TValue>>;
}

/** 原生快照来源的构造端口。 */
export interface DevToolsNativeSnapshotPorts {
  /** storage 全局独占锁。 */
  readonly lock: DevToolsSnapshotLock;
  /**
   * 当前 capture epoch。
   *
   * @remarks
   * 只要求「同一时点内两次调用相等」，不要求单调或可解析——本模块只做等值比较。
   */
  epoch(): Promise<string>;
  /** 锁内读出全部元数据行。 */
  readMetadata(signal: AbortSignal): Promise<readonly DevToolsSnapshotEntry[]>;
  /** 锁内读出全部**已提交**的逻辑文件；在途上传的临时产物不得出现。 */
  readCommittedFiles(signal: AbortSignal): Promise<readonly DevToolsSnapshotEntry[]>;
}

const INVALIDATED: DevToolsSnapshotCaptureResult = { outcome: 'invalidated' };

/** `null` 排在任何字符串之前，好让缺失的 ID 有一个确定的位置而不是随实现浮动。 */
function compareKeys(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? -1 : 1;
}

function toRecord(side: DevToolsSnapshotSide, entry: DevToolsSnapshotEntry): DevToolsSnapshotRecord {
  return [side, entry.logicalPath, entry.id, entry.size, entry.contentVersion];
}

/**
 * 按 `(logicalPath, id, side)` 排序。
 *
 * @remarks
 * 加上 `side` 作为第三键不是为了好看：同一条逻辑路径的 meta 与 file 在前两键上完全相等，
 * 只靠两键排序时它们的先后取决于 `Array.prototype.sort` 的实现细节，而快照要在三端逐字节
 * 对齐。`'file' < 'meta'` 恰好是字典序，于是第三键不需要额外的表。
 */
function sortRecords(records: DevToolsSnapshotRecord[]): readonly DevToolsSnapshotRecord[] {
  return records.sort((left, right) => {
    const byPath = compareKeys(left[1], right[1]);
    if (byPath !== 0) return byPath;
    const byId = compareKeys(left[2], right[2]);
    return byId !== 0 ? byId : compareKeys(left[0], right[0]);
  });
}

/**
 * 建一个原生宿主的快照物化来源。
 *
 * @param ports - 独占锁、epoch 与两侧读取。
 * @returns 可交给 {@link @aiao/rxdb-devtools!createDevToolsSnapshotStore} 的来源。
 */
export function createDevToolsNativeSnapshotSource(ports: DevToolsNativeSnapshotPorts): DevToolsSnapshotSource {
  /** 锁内的物化；`undefined` 表示这个时点在物化过程中就已经不成立了。 */
  async function materialize(signal: AbortSignal): Promise<readonly DevToolsSnapshotRecord[] | undefined> {
    const before = await ports.epoch();
    const metadata = await ports.readMetadata(signal);
    const files = await ports.readCommittedFiles(signal);
    // epoch 在两侧都读完之后再读一次：中途变过就意味着这两半分属两个时点。
    if ((await ports.epoch()) !== before) return undefined;

    return sortRecords([
      ...metadata.map(entry => toRecord('meta', entry)),
      ...files.map(entry => toRecord('file', entry))
    ]);
  }

  return {
    async capture(signal) {
      if (signal.aborted) return INVALIDATED;

      const held = await ports.lock.run(signal, () => materialize(signal));
      if (held.outcome !== 'held' || held.value === undefined) return INVALIDATED;
      // 排序在锁内已经做完；锁外再排会把一批已经一致的记录重新暴露给并发写者。
      return { outcome: 'captured', records: held.value };
    }
  };
}
