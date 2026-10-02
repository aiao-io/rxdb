import { RxDBBackupArchiveReader } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { createMainThreadIdbRxDB, DEMO_ADAPTER_NAME } from './demo-rxdb-config';
import { dbNameFromManifest } from './failure-archive';

// e2e 失败现场归档的导入（US-909 阶段 B，AC#7），只给导入页 `/failure-archive` 用（随页面懒加载）；打开 / 离开导入库在
// `imported-db.ts`。契约见 specs/004-us-909-failure-data-archive/data-model.md §6。

/** 归档 manifest 里导入页要显示的部分。 */
export interface FailureArchiveInfo {
  /** 原始库名，导入后打开的就是它 */
  readonly dbName: string;
  /** 快照捕获时间（ISO 8601） */
  readonly createdAt: string;
  readonly formatVersion: number;
}

/**
 * 只读归档开头的 manifest，取出原库名等信息；不校验整份归档（完整校验在 {@link importFailureArchive} 的 `restore()` 里）。
 *
 * @param file - 归档文件
 * @returns manifest 摘要
 * @throws RxDBBackupError 不是归档或 manifest 损坏
 * @throws UnsupportedArchiveError 认不出原库名
 */
export async function readFailureArchiveInfo(file: Blob): Promise<FailureArchiveInfo> {
  const reader = file.stream().getReader();
  try {
    const manifest = await new RxDBBackupArchiveReader(reader).readManifest();
    return {
      dbName: dbNameFromManifest(manifest),
      createdAt: manifest.createdAt,
      formatVersion: manifest.formatVersion
    };
  } finally {
    // 读取器不取消底层流，剩下的字节不读了
    await reader.cancel();
  }
}

/**
 * 把归档恢复成同名的本地库（主线程 IDB）。
 *
 * @remarks
 * 目标实例按 `dbName` 另建（{@link createMainThreadIdbRxDB}），在 `connect()` 之前 `restore()`；目标必须为空，
 * 已有同名库报 `target_not_empty`，正被别处打开报 `target_busy`。先清掉上一次中途被打断的恢复留下的标记（没有时
 * 什么都不做），否则那份残留会让这次恢复报 `restore_incomplete`。无论成败，返回前销毁目标实例。
 *
 * @param file - 归档文件
 * @param dbName - {@link readFailureArchiveInfo} 读出的原库名
 * @param baseHref - 应用的 `APP_BASE_HREF`
 * @throws RxDBBackupError 见 `RxDBBackupErrorCode`
 */
export async function importFailureArchive(file: Blob, dbName: string, baseHref: string): Promise<void> {
  const target = createMainThreadIdbRxDB(dbName, baseHref);
  try {
    const adapter = await target.getAdapter(DEMO_ADAPTER_NAME);
    if (!(adapter instanceof RxDBAdapterSqlite)) {
      throw new TypeError(`Adapter ${DEMO_ADAPTER_NAME} is not RxDBAdapterSqlite; cannot restore`);
    }
    await adapter.cleanupIncompleteRestore();
    await adapter.restore(file.stream());
  } finally {
    await target.destroy();
  }
}
