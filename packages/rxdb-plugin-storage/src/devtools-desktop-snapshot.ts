/**
 * @fileoverview DevTools 诊断快照的存储侧端口（US-904 阶段 D AC#48）。
 *
 * @remarks
 * 把 {@link @aiao/rxdb-devtools!DevToolsNativeSnapshotPorts} 接上真实的 storage 服务与
 * 原生文件系统，交出的四件东西对应快照来源的四次调用：
 *
 * - `lock`——storage 的全局独占锁，与全部路径级写操作互斥。快照要同时读 metadata 与文件，
 *   没有这把锁，两半就分属不同时点，panel 会报出「有元数据无文件」这类假缺失。
 * - `epoch`——storage 的捕获纪元，每次写操作结束递增。来源在锁内前后各读一次，不一致即作废。
 * - `readMetadata`——全部 `StorageFileMeta` 行，映射成 `meta` 侧条目（带 `id` / `size` / `contentVersion`）。
 * - `readCommittedFiles`——递归枚举原生文件系统里的全部已提交文件，映射成 `file` 侧条目
 *   （`id` / `contentVersion` 恒为 `null`）。目录不产出条目：metadata 只跟踪文件；
 *   宿主未提交写入的临时产物同样不产出条目，理由见 {@link collectFiles}。
 *
 * 两条路径的 `logicalPath` 约定一致（`/`-分隔、无前导 `/` 的相对路径）：`opfsPath` 与
 * 文件侧 `child.join('/')` 产出的是同一个形状，否则「两类缺失」的比较会在第一条路径上就错位。
 *
 * @module rxdb-plugin-storage/devtools-desktop-snapshot
 */

import { isDesktopHostTemporaryName } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import {
  type DevToolsNativeFilesystem,
  type DevToolsNativeSnapshotPorts,
  type DevToolsSnapshotEntry,
  type DevToolsSnapshotLock
} from '@aiao/rxdb-devtools';
import type { StorageFileMeta } from './file-meta.entity.js';

/**
 * 快照端口需要 storage 服务提供的最小面。
 *
 * @remarks
 * 收窄成三个成员而不是整个 {@link @aiao/rxdb-plugin-storage!RxdbFileStorage}：快照只读
 * epoch、全部 metadata 与独占锁，其它能力都与它无关，收窄也让装配层不用背整份服务的类型。
 */
export interface DevToolsStorageSnapshotHost {
  /** 当前捕获纪元；快照只做等值比较。 */
  readonly changeEpoch: number;
  /** 读取全部 metadata 行。 */
  listAllMetas(): Promise<readonly StorageFileMeta[]>;
  /**
   * 在 storage 全局独占锁内执行 `fn`，与全部写操作互斥。
   *
   * @param fn - 临界区
   * @param signal - 等锁期间中止则放弃获取并拒绝；`fn` 不得执行
   */
  runExclusive<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** {@link createDevToolsStorageSnapshotPorts} 的入参。 */
export interface DevToolsStorageSnapshotPorts {
  /** 文件存储服务；提供 epoch、独占锁与 metadata。 */
  readonly storage: DevToolsStorageSnapshotHost;
  /** 原生文件系统；提供已提交文件的递归枚举。 */
  readonly filesystem: DevToolsNativeFilesystem;
}

/** 一条 metadata 行 → `meta` 侧条目。 */
const toMetaEntry = (meta: StorageFileMeta): DevToolsSnapshotEntry => ({
  logicalPath: meta.opfsPath,
  id: meta.id,
  size: meta.size,
  contentVersion: String(meta.contentVersion)
});

/**
 * 递归枚举全部已提交文件；目录不产出条目，只被展开。
 *
 * @remarks
 * **在途上传的临时产物在这里被滤掉**，而浏览路径（`files.list`）照旧把它们列出来。
 * 两处口径不同是各自的用途决定的：浏览要如实反映盘上有什么（US-905 AC#10 的取消用例
 * 就靠数 `.rxdb-tmp` 来判断「临时文件出现过、取消之后又没了」），而快照要回答「有文件
 * 没有元数据吗」——一个正在写的临时产物既没有元数据、又会在下一秒自己消失，进了快照
 * 就是一条会自愈的假缺失，而这类只在特定时刻复现的误报最难被承认是误报（AC#11）。
 */
async function collectFiles(
  filesystem: DevToolsNativeFilesystem,
  segments: readonly string[],
  signal: AbortSignal,
  out: DevToolsSnapshotEntry[]
): Promise<void> {
  signal.throwIfAborted();
  const entries = await filesystem.list(segments);
  for (const entry of entries) {
    if (isDesktopHostTemporaryName(entry.name)) continue;
    const child = [...segments, entry.name];
    if (entry.kind === 'directory') {
      await collectFiles(filesystem, child, signal, out);
      continue;
    }
    // 与 metadata 的 `opfsPath` 同一约定：`/`-分隔、无前导 `/` 的相对路径。
    out.push({ logicalPath: child.join('/'), id: null, size: entry.size, contentVersion: null });
  }
}

/**
 * 建诊断快照的存储侧端口。
 *
 * @param ports - storage 服务与原生文件系统
 * @returns 可直接交给 {@link @aiao/rxdb-devtools!createDevToolsNativeSnapshotSource} 的端口。
 */
export function createDevToolsStorageSnapshotPorts(ports: DevToolsStorageSnapshotPorts): DevToolsNativeSnapshotPorts {
  const { storage, filesystem } = ports;

  const lock: DevToolsSnapshotLock = {
    async run(signal, task) {
      if (signal.aborted) return { outcome: 'aborted' };
      try {
        // signal 一并交给锁：等锁阶段就要能被打断，而不是拿到锁之后才发现已经取消。
        const value = await storage.runExclusive(() => {
          signal.throwIfAborted();
          return task();
        }, signal);
        return { outcome: 'held', value };
      } catch (error) {
        // 锁等待或任务中途被 abort，一律报 aborted；其余错误照抛（来源据此作废重试）。
        if (signal.aborted) return { outcome: 'aborted' };
        throw error;
      }
    }
  };

  return {
    lock,
    epoch: async () => String(storage.changeEpoch),
    readMetadata: async signal => {
      signal.throwIfAborted();
      return (await storage.listAllMetas()).map(toMetaEntry);
    },
    readCommittedFiles: async signal => {
      const out: DevToolsSnapshotEntry[] = [];
      await collectFiles(filesystem, [], signal, out);
      return out;
    }
  };
}
