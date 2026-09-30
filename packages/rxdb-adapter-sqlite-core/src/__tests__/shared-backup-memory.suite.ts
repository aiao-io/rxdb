/**
 * US-217 AC#9：桌面后端备份 / 恢复的新增峰值内存不随库大小线性增长。
 *
 * @remarks
 * 固定行大小（每条笔记 256 KiB 不可压缩负载）与流块大小，库总量分两档。每档在一个新起的 host 进程里测：
 * 先让它空闲地打开这个库，读一次 host 的峰值常驻内存作基线；然后跑一次备份或恢复，再读一次峰值。
 * 两次之差就是这次操作让 host 多占的内存，引擎页缓存、原生与 JS 分配、待回收的垃圾以及 IPC 缓冲全在里面。
 * renderer 一侧（测试进程本身：SQLite 的 dump / 重放逻辑跑在这里）按块采样 GC 之后仍然存活的内存。
 * 归档经测试进程的临时文件进出：备份写盘、恢复从盘上逐块读，不在内存里攒齐。
 *
 * 只有提供 `foreignHost` 的桌面后端跑这组用例：浏览器后端的库与测试同在一个页面，量不出单独的进程峰值，
 * 它们的在途上界由阶段 B 的分页预算约束。
 */
import { describe, expect, it } from 'vitest';
import type {
  BackupMemoryBudget,
  BackupMemoryDelta,
  BackupMemoryMeasurement,
  ForeignSqliteHost,
  SqliteBackupHarness
} from '../testing.js';
import { backupMemoryTools } from './backup/backup-memory-tools.js';
import {
  createBackupRxDB,
  makeNote,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  rowsOf,
  uniqueDbName
} from './backup/sqlite-backup-fixture.js';

const MIB = 1024 * 1024;

/**
 * SQLite 桌面 host 冻结的新增峰值预算。
 *
 * @remarks
 * 恢复在一个写事务里重放整库：引擎页缓存（初始化 SQL 定的 50 MiB）会被脏页填满，另有 IPC 帧、
 * 十六进制字面量的解析缓冲与分配器高水位；备份只经页缓存逐页读。macOS arm64 实测（库 76 / 303 / 606 MB）：
 * Electron `node:sqlite` host 备份增量 90 / 127 / 141 MiB、恢复 199 / 220 / 230 MiB；Tauri Rust host（库 76 / 303 MB）
 * 备份 17 / 21 MiB、恢复 73 / 73 MiB；renderer 约 11 MiB。上限在两者中较大者之上留约 1.7 倍余量。
 */
const SQLITE_HOST_BUDGET: BackupMemoryBudget = {
  hostBackup: 256 * MIB,
  hostRestore: 384 * MIB,
  renderer: 32 * MIB
};

/** 写入 `mib` MiB 负载，返回库的逻辑字节数（`page_count` 已计入 WAL 里提交的页）。 */
const seed = async (harness: SqliteBackupHarness, dbName: string, mib: number): Promise<number> => {
  const db = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, 'persistent');
  const adapter = await db.connect();
  try {
    for (let index = 0; index < (mib * MIB) / backupMemoryTools.payloadBytes; index += 1) {
      const note = makeNote(db.entities, `note-${String(index)}`);
      note.payload = backupMemoryTools.noise(backupMemoryTools.payloadBytes, index + 1);
      await note.save();
    }
    const [[pages]] = rowsOf(await adapter.internalQuery('PRAGMA page_count'));
    const [[pageSize]] = rowsOf(await adapter.internalQuery('PRAGMA page_size'));
    return Number(pages) * Number(pageSize);
  } finally {
    await db.close();
  }
};

/** 在新起的 host 上空闲打开 `dbName`，返回实例与基线峰值。 */
const openIdle = async (host: ForeignSqliteHost, dbName: string) => {
  const db = createBackupRxDB(host.harness, dbName, PLAIN_ENTITIES, 'persistent');
  const adapter = await db.connect();
  await adapter.internalQuery('SELECT count(*) FROM sqlite_schema');
  return { db, adapter, baseline: await host.peakRss() };
};

/** 量一档：一个 host 上备份，另一个 host 上恢复。 */
const measure = (
  harness: SqliteBackupHarness,
  spawn: () => ForeignSqliteHost,
  mib: number
): Promise<BackupMemoryMeasurement> =>
  backupMemoryTools.withArchiveFile(async archive => {
    const dbName = uniqueDbName('backup-memory');
    const databaseBytes = await seed(harness, dbName, mib);

    const backupHost = spawn();
    let backup: BackupMemoryDelta;
    try {
      const { db, adapter, baseline } = await openIdle(backupHost, dbName);
      const meter = backupMemoryTools.rendererMeter();
      await backupMemoryTools.backupToFile(sink => adapter.backup(sink), archive, meter);
      backup = { host: (await backupHost.peakRss()) - baseline, renderer: meter.delta() };
      await db.close();
    } finally {
      await backupHost.stop();
    }

    // 恢复的基线同样是「空闲打开了同规模库的 host」：先打开源库，再往另一个库名里恢复。
    const restoreHost = spawn();
    let restore: BackupMemoryDelta;
    try {
      const { db, baseline } = await openIdle(restoreHost, dbName);
      const targetName = uniqueDbName('backup-memory-target');
      const target = createBackupRxDB(restoreHost.harness, targetName, PLAIN_ENTITIES, 'persistent');
      const meter = backupMemoryTools.rendererMeter();
      await restoreInto(target, backupMemoryTools.fileSource(archive, meter));
      restore = { host: (await restoreHost.peakRss()) - baseline, renderer: meter.delta() };
      const restored = await readNotes(await target.connect(), target.entities);
      expect(restored).toHaveLength((mib * MIB) / backupMemoryTools.payloadBytes);
      await target.close();
      await db.close();
    } finally {
      await restoreHost.stop();
    }

    return { databaseBytes, backup, restore };
  });

/** 注册桌面后端的内存预算用例。 */
export const backupMemorySuite = (harness: SqliteBackupHarness): void => {
  const spawn = typeof harness.foreignHost === 'function' ? harness.foreignHost : undefined;
  const reason = spawn ? '' : ` (skipped: ${(harness.foreignHost as { unsupported: string }).unsupported})`;

  describe.skipIf(!spawn)(`backup memory${reason}`, () => {
    it('keeps the extra peak memory of backup and restore flat as the database grows (AC#9)', async () => {
      const start = spawn as () => ForeignSqliteHost;
      const [smallMib, largeMib] = backupMemoryTools.sizesMib;
      const small = await measure(harness, start, smallMib);
      const large = await measure(harness, start, largeMib);
      backupMemoryTools.expectBounded(small, large, SQLITE_HOST_BUDGET);
    }, 300_000);
  });
};
