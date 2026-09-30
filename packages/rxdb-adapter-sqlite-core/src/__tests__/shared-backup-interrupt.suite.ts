/**
 * US-217 AC#11：恢复进行中 Worker 或 host 进程被强杀，新实例只能看到完整库或可判别的未完成状态。
 *
 * @remarks
 * 恢复交给后端起的执行者（{@link SqliteBackupHarness.interruptWorker}），走到指定位置后被强杀：浏览器后端是
 * module Worker 被主线程 `terminate()`，桌面后端是持有库文件的 host 进程被 SIGKILL——与标签页被关、进程被杀一样，
 * 持有库文件的一方来不及执行任何回滚或清理。
 * 标记表先于数据单独提交，数据在一个事务里写完才提交：提交点之前被杀，未提交的事务随下次打开回滚，只剩标记。
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type {
  RestoreInterruptPoint,
  RestoreInterruptReply,
  RestoreInterruptWorker,
  SqliteBackupHarness
} from '../testing.js';
import {
  backupErrorCode,
  chunkedSource,
  CLEAN_TARGET,
  collectingSink,
  createBackupRxDB,
  persistentTargetState,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  scratchLocation,
  SEEDED_NOTES,
  seedNotes,
  storageLockNameOf,
  uniqueDbName,
  type BackupRxDB
} from './backup/sqlite-backup-fixture.js';

const MARKER_ONLY = { objects: ['table:rxdb$restore_in_progress'], marker: true };

/**
 * 强杀恢复。
 *
 * @param harness - 后端
 */
export const backupInterruptSuite = (harness: SqliteBackupHarness): void => {
  const { interruptWorker } = harness;
  const spawnWorker = typeof interruptWorker === 'function' ? interruptWorker : undefined;
  const title =
    typeof interruptWorker === 'function' ?
      `${harness.adapterName} restore survives being killed mid-way (AC#11)`
    : `${harness.adapterName} restore survives being killed mid-way (AC#11) — not applicable: ${interruptWorker.unsupported}`;

  describe.skipIf(!spawnWorker)(title, () => {
    const opened: BackupRxDB[] = [];
    const workers: RestoreInterruptWorker[] = [];

    afterEach(async () => {
      for (const worker of workers.splice(0)) worker.terminate();
      await Promise.all(opened.splice(0).map(db => db.close()));
    });

    const open = (dbName: string): BackupRxDB => {
      const db = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, 'persistent');
      opened.push(db);
      return db;
    };

    let seeded: Promise<{ source: BackupRxDB; archive: Uint8Array }> | undefined;

    const seededArchive = async (): Promise<Uint8Array> => {
      seeded ??= (async () => {
        const source = createBackupRxDB(
          harness,
          uniqueDbName('backup-int-src'),
          PLAIN_ENTITIES,
          scratchLocation(harness)
        );
        const adapter = await source.connect();
        await seedNotes(source.entities);
        const out = collectingSink();
        await adapter.backup(out.sink);
        return { source, archive: out.bytes() };
      })();
      return (await seeded).archive;
    };

    afterAll(async () => {
      await (await seeded)?.source.close();
    });

    /** 交给执行者恢复，到达 `stopAt` 后强杀，并等它持有的存储锁被回收。 */
    const killRestoreAt = async (archive: Uint8Array, dbName: string, stopAt: RestoreInterruptPoint) => {
      const worker = (spawnWorker as () => RestoreInterruptWorker)();
      workers.push(worker);
      const reply = new Promise<RestoreInterruptReply>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<RestoreInterruptReply>) => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
      });
      worker.postMessage({ archive, dbName, stopAt });
      const outcome = await reply;
      worker.terminate();
      if ('failed' in outcome) throw new Error(`Restore failed before reaching ${stopAt}: ${outcome.failed}`);
      expect(outcome.reached).toBe(stopAt);
      // 锁随执行者一起释放，但释放是异步的；等到能排上独占锁，之后看到的才是强杀后的稳定状态。
      await navigator.locks.request(await storageLockNameOf(harness, dbName), async () => undefined);
    };

    const unfinished: Array<[RestoreInterruptPoint, 'marker-only' | 'committed']> = [
      ['streaming', 'marker-only'],
      ['marker-written', 'marker-only'],
      ['rows-written', 'marker-only'],
      ['verified', 'marker-only'],
      ['persisted', 'committed']
    ];

    for (const [stopAt, left] of unfinished) {
      it(`reports restore_incomplete after a kill at "${stopAt}", then cleans up and restores again`, async () => {
        const archive = await seededArchive();
        const dbName = uniqueDbName('backup-int-dst');
        await killRestoreAt(archive, dbName, stopAt);

        const state = await persistentTargetState(harness, dbName);
        if (left === 'marker-only') expect(state).toEqual(MARKER_ONLY);
        else expect(state.objects.length).toBeGreaterThan(MARKER_ONLY.objects.length);
        expect(state.marker).toBe(true);

        expect(await backupErrorCode(open(dbName).connect())).toBe('restore_incomplete');
        expect(await backupErrorCode(restoreInto(open(dbName), chunkedSource(archive).stream))).toBe(
          'restore_incomplete'
        );

        expect(await (await open(dbName).adapter()).cleanupIncompleteRestore()).toBe(true);
        expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);
        await restoreInto(open(dbName), chunkedSource(archive).stream);
        const target = open(dbName);
        expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
      });
    }

    it('keeps a finished restore when the worker is killed right after it returns', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-int-dst');
      await killRestoreAt(archive, dbName, 'returned');
      expect((await persistentTargetState(harness, dbName)).marker).toBe(false);
      const target = open(dbName);
      expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
    });
  });
};
