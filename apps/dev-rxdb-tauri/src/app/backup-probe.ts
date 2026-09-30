/**
 * @fileoverview US-217 AC#18 / AC#20：打包产物自检里的备份 / 恢复探针。
 *
 * @remarks
 * Tauri 的窗口里没有 CDP，e2e 摸不到 renderer 的任何全局——Electron 那边「探针把整份归档交回测试进程」
 * 的做法在这里无路可走。于是归档经 Rust 侧自检命令逐块写读一个由 e2e 指定、落在应用数据目录之外的文件
 * （`src-tauri/src/selfcheck.rs` 的 `rxdb_selfcheck_backup_archive_*`），结论随自检报告一起落盘。
 *
 * 两个方向都逐块走：备份时 sink 的每一次 `write` 就是一次追加，恢复时 source 的每一次 `pull` 就是一次
 * 按偏移读取。一次交出整份归档就把 AC#9 的「流」验成了一块 `ArrayBuffer`。
 *
 * 是否跑、跑哪一半由 Rust 侧的 `DEV_RXDB_TAURI_BACKUP_PROBE` 决定；本模块不判定模式，只执行。
 *
 * @module backup-probe
 */

import type { RxDB, RxDBBackupResult, RxDBBackupScope, RxDBRestoreResult } from '@aiao/rxdb';

/**
 * 探针模式；字面量与 `selfcheck.rs` 的 `BackupProbeMode`（serde `camelCase`）逐字对应。
 *
 * @remarks
 * - `backup`：照常连接并记一次启动，然后把库备份进归档。
 * - `restore`：连接之前先从归档恢复；恢复失败就不连接。
 */
export type BackupProbeMode = 'backup' | 'restore';

/**
 * 回报给 Rust 侧的事实；键名与 `selfcheck.rs` 的 `BackupProbe` 逐字对应，那边有一条单测把它们钉死。
 */
export interface BackupProbeResult {
  /** 跑的是哪一半。 */
  readonly mode: BackupProbeMode;
  /** 经流写出（或读入）的归档字节数。 */
  readonly byteLength: number;
  /** API 结果上的范围声明（AC#14）。 */
  readonly scope: RxDBBackupScope;
  /** 归档 manifest 里的范围声明（AC#14）。 */
  readonly manifestScope: RxDBBackupScope;
}

/** 归档所在的那条通道：真实实现是 Rust 侧的两条自检命令，单测里是一段内存。 */
export interface BackupArchiveChannel {
  /** 从 `offset` 处读至多 `length` 字节；读到末尾时给空块。 */
  read(offset: number, length: number): Promise<Uint8Array>;
  /** 把一块追加到归档末尾。 */
  append(chunk: Uint8Array): Promise<void>;
}

/** 探针用得到的那一小块 RxDB 表面：按名字取到本地适配器。 */
export type BackupProbeDatabase = Pick<RxDB, 'getAdapter'>;

/** 选中的后端怎样备份与恢复；桌面建库模块（`setup_rxdb_desktop.ts`）给出真实的一份。 */
export interface BackupProbeArchiveOps {
  /** 把已连接的库写成一份归档。 */
  backup(database: BackupProbeDatabase, sink: WritableStream<Uint8Array>): Promise<RxDBBackupResult>;
  /** 把归档恢复进尚未连接的库。 */
  restore(database: BackupProbeDatabase, source: ReadableStream<Uint8Array>): Promise<RxDBRestoreResult>;
}

/** 恢复时每次向通道要的块大小，与桌面 host 的流帧同一量级；Rust 侧单次读上限是 1 MiB。 */
export const ARCHIVE_CHUNK_BYTES = 64 * 1024;

const describe = (
  mode: BackupProbeMode,
  byteLength: number,
  result: RxDBBackupResult | RxDBRestoreResult
): BackupProbeResult => ({ mode, byteLength, scope: result.scope, manifestScope: result.manifest.scope });

/**
 * 备份当前库，逐块追加进归档。
 *
 * @param database - 已连接的库
 * @param ops - 选中后端的备份与恢复
 * @param channel - 归档通道
 * @returns 备份结果；任何一块追加失败都会让备份本身失败
 */
export const backupToArchive = async (
  database: BackupProbeDatabase,
  ops: BackupProbeArchiveOps,
  channel: BackupArchiveChannel
): Promise<BackupProbeResult> => {
  let byteLength = 0;
  const sink = new WritableStream<Uint8Array>({
    write: async chunk => {
      await channel.append(chunk);
      byteLength += chunk.byteLength;
    }
  });
  const result = await ops.backup(database, sink);
  return describe('backup', byteLength, result);
};

/**
 * 从归档恢复进尚未连接的库，按偏移逐块读取。
 *
 * @param database - 尚未连接的库
 * @param ops - 选中后端的备份与恢复
 * @param channel - 归档通道
 * @returns 恢复结果
 *
 * @remarks
 * 读取只发生在 `pull` 里：消费者不拉取，通道就不往下读（背压），流不预取整份归档。
 */
export const restoreFromArchive = async (
  database: BackupProbeDatabase,
  ops: BackupProbeArchiveOps,
  channel: BackupArchiveChannel
): Promise<BackupProbeResult> => {
  let byteLength = 0;
  const source = new ReadableStream<Uint8Array>({
    pull: async controller => {
      const chunk = await channel.read(byteLength, ARCHIVE_CHUNK_BYTES);
      if (chunk.byteLength === 0) {
        controller.close();
        return;
      }
      byteLength += chunk.byteLength;
      controller.enqueue(chunk);
    }
  });
  const result = await ops.restore(database, source);
  return describe('restore', byteLength, result);
};
