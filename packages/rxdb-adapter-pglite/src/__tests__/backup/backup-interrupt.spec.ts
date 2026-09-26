/**
 * US-217 AC#11：恢复进行中 Worker 被强杀，新实例只能看到完整库或可判别的未完成状态。
 *
 * @remarks
 * 恢复跑在真实的 module Worker 里，走到指定位置后由主线程 `terminate()`——与标签页被关、进程被杀
 * 一样，恢复自己的 catch / finally 一行都不会执行。
 */
import type { RxDB } from '@aiao/rxdb';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { pgliteStorageLockName } from '../../backup/pglite-restore-lock.js';
import { cleanupIncompletePGliteRestore, restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import type { RestoreInterruptPoint, RestoreInterruptReply } from './backup-interrupt.worker.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  idbStorageOf,
  idbTargetState,
  PLAIN_ENTITIES,
  readNotes,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupRxDB
} from './backup-test-fixture.js';

const opened: RxDB[] = [];
const workers: Worker[] = [];

afterEach(async () => {
  for (const worker of workers.splice(0)) worker.terminate();
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

let seeded: Promise<{ source: BackupRxDB; archive: Uint8Array }> | undefined;

const seededArchive = async (): Promise<Uint8Array> => {
  seeded ??= (async () => {
    const source = createBackupRxDB(uniqueDbName('backup-int-src'), PLAIN_ENTITIES, { store: 'memory' });
    const adapter = await source.connect();
    await seedNotes(source.entities);
    const out = collectingSink();
    await adapter.backup(out.sink);
    return { source, archive: out.bytes() };
  })();
  return (await seeded).archive;
};

afterAll(async () => {
  await (await seeded)?.source.rxdb.disconnectAll();
});

const idbTarget = (dbName: string): BackupRxDB => createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });

/** 在 Worker 里恢复，到达 `stopAt` 后强杀，并等浏览器回收它持有的存储锁。 */
const killRestoreAt = async (archive: Uint8Array, dbName: string, stopAt: RestoreInterruptPoint): Promise<void> => {
  const worker = new Worker(new URL('./backup-interrupt.worker.ts', import.meta.url), { type: 'module' });
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
  // 锁随 Worker 一起释放，但释放是异步的；等到能排上独占锁，之后看到的才是强杀后的稳定状态。
  await navigator.locks.request(
    pgliteStorageLockName(idbStorageOf(idbTarget(dbName)).storageKey),
    async () => undefined
  );
};

const connectAndRead = async (dbName: string) => {
  const target = idbTarget(dbName);
  opened.push(target.rxdb);
  const adapter = await target.connect();
  return readNotes(adapter, target.entities);
};

describe('PGlite restore survives being killed mid-way (AC#11)', () => {
  const unfinished: Array<[RestoreInterruptPoint, boolean]> = [
    // [强杀位置, 强杀后 IndexedDB 是否仍为空]：提交点之前不写 IndexedDB。
    ['streaming', true],
    ['marker-written', true],
    ['files-written', true],
    ['verified', true],
    ['persisted', false]
  ];

  for (const [stopAt, stillEmpty] of unfinished) {
    it(`reports restore_incomplete after a kill at "${stopAt}", then cleans up and restores again`, async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-int-dst');
      await killRestoreAt(archive, dbName, stopAt);

      const target = idbTarget(dbName);
      expect(await idbTargetState(target)).toEqual({ empty: stillEmpty, marker: true });
      const blocked = idbTarget(dbName);
      opened.push(blocked.rxdb);
      expect(await backupErrorCode(blocked.connect())).toBe('restore_incomplete');
      expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe(
        'restore_incomplete'
      );

      expect(await cleanupIncompletePGliteRestore(idbTarget(dbName))).toBe(true);
      expect(await idbTargetState(target)).toEqual({ empty: true, marker: false });
      await restorePGliteDatabase(chunkedSource(archive).stream, idbTarget(dbName));
      expect(await connectAndRead(dbName)).toEqual(SEEDED_NOTES);
    });
  }

  it('keeps a finished restore when the worker is killed right after it returns', async () => {
    const archive = await seededArchive();
    const dbName = uniqueDbName('backup-int-dst');
    await killRestoreAt(archive, dbName, 'returned');
    expect(await idbTargetState(idbTarget(dbName))).toEqual({ empty: false, marker: false });
    expect(await connectAndRead(dbName)).toEqual(SEEDED_NOTES);
  });
});
