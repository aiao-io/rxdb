/**
 * US-217 阶段 C AC#9：Electron PGlite host 的备份 / 恢复新增峰值内存。
 *
 * @remarks
 * 方法与 SQLite 桌面 host 的 `backupMemorySuite` 相同，用同一份工具与判据：固定 256 KiB 不可压缩负载，库总量分两档；
 * 每档在新起的子进程 host 上先空闲打开库读基线峰值，再跑一次备份或恢复读第二次峰值，两者之差计入 PGlite 的 WASM
 * 堆、数据文件块与 IPC 缓冲。renderer（测试进程）按块采样 GC 之后存活的内存，归档经临时文件进出。
 * 播种用进程内 host 并优雅关闭，不计入任何一次测量。
 *
 * host 首次回答 `pg.engine` 时起的探针运行时是一笔与库无关的固定开销，单独在新 host 上量；量备份 / 恢复的 host
 * 不起它。冻结预算见 {@link PGLITE_HOST_BUDGET} 与 {@link PGLITE_PROBE_BUDGET}。
 */
import {
  backupMemoryTools,
  type BackupMemoryBudget,
  type BackupMemoryDelta,
  type BackupMemoryMeasurement
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { restoreElectronPGliteDatabase } from '../../pglite/restore-electron-pglite-database.js';
import {
  createElectronBackupRxDB,
  dataDirectoryNameOf,
  forkBackupHost,
  makeNote,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readNotes,
  removePgliteTemplate,
  startBackupHost,
  uniqueDbName,
  type ForkedBackupHost
} from './electron-pglite-backup-fixture.js';
import { removeHostProcessBundles } from './forked-host-process.js';

const MIB = 1024 * 1024;
const OWNER = 7;

/**
 * Electron PGlite host 上备份 / 恢复本身冻结的新增峰值预算。
 *
 * @remarks
 * macOS arm64 实测（数据目录 203 / 673 MB）：备份 host 增量 70 / 51 MiB，恢复 237 / 261 MiB（大头是恢复在 open 时起的
 * 私有实例），renderer ≤ 6 MiB。量这两项的 host 用 {@link forkBackupHost} 的版本号直接回答 `pg.engine`，
 * 不起探针实例；探针的开销另由 {@link PGLITE_PROBE_BUDGET} 约束。上限在实测之上留约 2 倍余量。
 */
const PGLITE_HOST_BUDGET: BackupMemoryBudget = {
  hostBackup: 256 * MIB,
  hostRestore: 512 * MIB,
  renderer: 32 * MIB
};

/**
 * `pg.engine` 起的探针实例冻结的一次性新增峰值预算。
 *
 * @remarks
 * 探针是 `createProbeRuntime` 给出的 `new PGlite()`（一次内存 initdb），不碰任何数据目录，host 生命周期内只起一次、
 * 结果缓存，与库大小无关。在一个什么库都没开的新 host 上量（连 PGlite 模块的首次装载一起算，即应用刚启动就恢复的
 * 最坏情况），macOS arm64 实测 887～1027 MiB。探针关掉之后 WASM 堆何时归还操作系统取决于 GC 与内核，
 * 所以 host 峰值的冻结上界按两者相加：备份 256 + 1280、恢复 512 + 1280 MiB。
 */
const PGLITE_PROBE_BUDGET = 1280 * MIB;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(() => {
  removeHostProcessBundles();
  removePgliteTemplate();
});

/** 目录树在盘上的字节数。 */
const directoryBytes = (directory: string): number =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0);

/** 在进程内 host 上写入 `mib` MiB 负载后优雅关闭，返回数据目录的字节数。 */
const seed = async (root: string, dbName: string, mib: number): Promise<number> => {
  const host = startBackupHost({ root });
  const db = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport: host.transportFor(OWNER) });
  try {
    await db.connect();
    for (let index = 0; index < (mib * MIB) / backupMemoryTools.payloadBytes; index += 1) {
      const note = makeNote(db.entities, `note-${String(index)}`);
      note.payload = backupMemoryTools.noise(backupMemoryTools.payloadBytes, index + 1);
      await note.save();
    }
  } finally {
    await db.rxdb.disconnectAll();
    await host.close();
  }
  return directoryBytes(host.directoryOf(dataDirectoryNameOf(db.rxdb)));
};

/** 在子进程 host 上空闲打开 `dbName`，返回实例与基线峰值。 */
const openIdle = async (host: ForkedBackupHost, dbName: string) => {
  const db = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport: host.transportFor(OWNER) });
  // 只连接：读出负载会让 PGlite 的 WASM 堆先长到装下整个结果集，基线就被抬高了。
  const adapter = await db.connect();
  return { db, adapter, baseline: await host.peakRss() };
};

/** 子进程 host 用完即杀，并交出它的输出。 */
const finish = async (host: ForkedBackupHost): Promise<void> => {
  await host.kill();
  expect(host.output()).toBe('');
  expect(host.deliveryErrors).toEqual([]);
};

/** 量一档：一个子进程 host 上备份，另一个上恢复。 */
const measure = (mib: number, serverVersion: string): Promise<BackupMemoryMeasurement> =>
  backupMemoryTools.withArchiveFile(async archive => {
    const root = mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-memory-'));
    try {
      const dbName = uniqueDbName('electron-pg-memory');
      const databaseBytes = await seed(root, dbName, mib);

      const backupHost = forkBackupHost(root, serverVersion);
      let backup: BackupMemoryDelta;
      try {
        const { db, adapter, baseline } = await openIdle(backupHost, dbName);
        const meter = backupMemoryTools.rendererMeter();
        await backupMemoryTools.backupToFile(sink => adapter.backup(sink), archive, meter);
        backup = { host: (await backupHost.peakRss()) - baseline, renderer: meter.delta() };
        await db.rxdb.disconnectAll();
      } finally {
        await finish(backupHost);
      }

      const restoreHost = forkBackupHost(root, serverVersion);
      let restore: BackupMemoryDelta;
      try {
        const { db, baseline } = await openIdle(restoreHost, dbName);
        const target = createElectronBackupRxDB(uniqueDbName('electron-pg-memory-target'), PLAIN_ENTITIES, {
          transport: restoreHost.transportFor(OWNER + 1)
        });
        const meter = backupMemoryTools.rendererMeter();
        await restoreElectronPGliteDatabase(backupMemoryTools.fileSource(archive, meter), target);
        restore = { host: (await restoreHost.peakRss()) - baseline, renderer: meter.delta() };
        const restored = await readNotes(await target.connect(), target.entities);
        expect(restored).toHaveLength((mib * MIB) / backupMemoryTools.payloadBytes);
        await target.rxdb.disconnectAll();
        await db.rxdb.disconnectAll();
      } finally {
        await finish(restoreHost);
      }

      return { databaseBytes, backup, restore };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

/**
 * 在一个什么库都没开的新 host 上问一次 `pg.engine`，量出真实探针的一次性开销。
 *
 * @returns 探针报的版本号，供量备份 / 恢复的 host 原样回答；以及探针的新增峰值
 */
const measureProbe = async (): Promise<{ serverVersion: string; cost: number }> => {
  const root = mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-probe-'));
  const host = forkBackupHost(root);
  try {
    const baseline = await host.peakRss();
    const response = (await host.transportFor(OWNER).request({ kind: 'pg.engine' })) as {
      result: { serverVersion: string };
    };
    return { serverVersion: response.result.serverVersion, cost: (await host.peakRss()) - baseline };
  } finally {
    await finish(host);
    rmSync(root, { recursive: true, force: true });
  }
};

describe('Electron PGlite host backup memory (AC#9)', () => {
  it('keeps the extra peak memory of backup and restore flat as the database grows', async () => {
    const probe = await measureProbe();
    expect(probe.cost).toBeLessThan(PGLITE_PROBE_BUDGET);
    const [smallMib, largeMib] = backupMemoryTools.sizesMib;
    const small = await measure(smallMib, probe.serverVersion);
    const large = await measure(largeMib, probe.serverVersion);
    backupMemoryTools.expectBounded(small, large, PGLITE_HOST_BUDGET);
  }, 600_000);
});
