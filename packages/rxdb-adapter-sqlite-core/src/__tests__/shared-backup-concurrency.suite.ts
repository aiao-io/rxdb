/**
 * US-217 AC#3 / AC#12 / AC#16：快照落在一个已提交事务边界上；同一目标上的竞争访问明确拒绝。
 *
 * @remarks
 * 「其他标签页 / 窗口」的竞争在这里以同页面的第二个 RxDB 实例代表：独占靠的是 Web Locks 与库内标记，
 * 两者都按 origin / 存储生效，与请求来自哪个标签页无关。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteRestoreStage } from '../backup/sqlite-backup.interface.js';
import type { SqliteBackupHarness, SqliteBackupStorageKind } from '../testing.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  makeNote,
  persistentTargetState,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  rowsOf,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  writeRestoreMarker,
  type BackupNote,
  type BackupRxDB
} from './backup/sqlite-backup-fixture.js';

const STAGES: readonly SqliteRestoreStage[] = ['marker-written', 'rows-written', 'verified', 'persisted'];

/** 第一列第一行。 */
const scalar = async (adapter: RxDBAdapterSqliteBase, sql: string): Promise<unknown> =>
  rowsOf(await adapter.internalQuery(sql))[0]?.[0];

/**
 * 并发与独占。
 *
 * @param harness - 后端
 */
export const backupConcurrencySuite = (harness: SqliteBackupHarness): void => {
  describe(`${harness.adapterName} backup concurrency`, () => {
    const opened: BackupRxDB[] = [];

    afterEach(async () => {
      await Promise.all(opened.splice(0).map(db => db.close()));
    });

    const open = (kind: SqliteBackupStorageKind, dbName = uniqueDbName('backup-cc')): BackupRxDB => {
      const db = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, kind);
      opened.push(db);
      return db;
    };

    const seededArchive = async (): Promise<Uint8Array> => {
      const source = open('memory');
      const adapter = await source.connect();
      await seedNotes(source.entities);
      const out = collectingSink();
      await adapter.backup(out.sink);
      return out.bytes();
    };

    const titlesOf = async (target: BackupRxDB): Promise<string[]> =>
      (await readNotes(await target.connect(), target.entities)).map(note => note.title);

    /**
     * 备份期间并发提交、回滚与多语句事务，恢复后按已知提交顺序核对边界。
     *
     * @returns 恢复出的标题
     */
    const backupDuringWrites = async (source: BackupRxDB, adapter: RxDBAdapterSqliteBase): Promise<void> => {
      const Note = source.entities[1] as typeof BackupNote;
      for (const title of ['before-0', 'before-1', 'before-2']) await makeNote(source.entities, title).save();

      // 回调按队列完成顺序触发：这就是已知的提交顺序。
      const committed: string[] = [];
      const commit = (titles: string[], write: Promise<unknown>) => write.then(() => committed.push(...titles));
      const writes: Promise<unknown>[] = [
        commit(
          ['pair-a', 'pair-b'],
          adapter.transaction(async executor => {
            const repository = executor.getRepository(Note);
            await repository.create(makeNote(source.entities, 'pair-a'));
            await repository.create(makeNote(source.entities, 'pair-b'));
          })
        ),
        adapter
          .transaction(async executor => {
            await executor.getRepository(Note).create(makeNote(source.entities, 'rolled-back'));
            throw new Error('roll this back');
          })
          .catch(() => undefined)
      ];
      for (let index = 0; index < 6; index++) {
        writes.push(commit([`during-${index}`], makeNote(source.entities, `during-${index}`).save()));
      }
      const out = collectingSink();
      const backup = adapter.backup(out.sink);
      for (let index = 0; index < 6; index++) {
        writes.push(commit([`after-${index}`], makeNote(source.entities, `after-${index}`).save()));
      }
      await Promise.all([backup, ...writes]);

      const target = open('memory');
      await restoreInto(target, chunkedSource(out.bytes()).stream);
      const restored = new Set(await titlesOf(target));
      expect([...restored].filter(title => title.startsWith('before-')).sort()).toEqual([
        'before-0',
        'before-1',
        'before-2'
      ]);
      expect(restored.has('rolled-back')).toBe(false);
      expect(restored.has('pair-a')).toBe(restored.has('pair-b'));
      const concurrent = [...restored].filter(title => !title.startsWith('before-'));
      expect(new Set(concurrent)).toEqual(new Set(committed.slice(0, concurrent.length)));
    };

    it('contains every earlier commit, a commit-order prefix of concurrent ones, and no rolled-back work', async () => {
      const source = open('memory');
      await backupDuringWrites(source, await source.connect());
    });

    it(`runs persistent storage in "${harness.persistentJournalMode}" journal mode`, async () => {
      const adapter = await open('persistent').connect();
      expect(await scalar(adapter, 'PRAGMA journal_mode')).toBe(harness.persistentJournalMode);
    });

    it.skipIf(harness.persistentJournalMode !== 'wal')(
      'keeps WAL frames that were committed but never checkpointed (AC#16)',
      async () => {
        const source = open('persistent');
        const adapter = await source.connect();
        // 关掉自动 checkpoint：之后提交的数据只在 WAL 里，主文件里没有。
        await adapter.internalQuery('PRAGMA wal_autocheckpoint = 0');
        await backupDuringWrites(source, adapter);
        // 备份之后才 checkpoint：日志里还有帧，说明快照读到的数据当时确实只在 WAL 里。
        const [busy, logFrames] = rowsOf(await adapter.internalQuery('PRAGMA wal_checkpoint(PASSIVE)'))[0];
        expect(busy).toBe(0);
        expect(Number(logFrames)).toBeGreaterThan(0);
      }
    );

    it('lets exactly one of two concurrent restores into the same target win', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-cc-dst');
      const outcomes = await Promise.all([
        backupErrorCode(restoreInto(open('persistent', dbName), chunkedSource(archive).stream)),
        backupErrorCode(restoreInto(open('persistent', dbName), chunkedSource(archive).stream))
      ]);
      expect(outcomes.filter(outcome => typeof outcome === 'string')).toEqual(['target_busy']);
      expect(await titlesOf(open('persistent', dbName))).toEqual(SEEDED_NOTES.map(note => note.title));
    });

    it('refuses a second restore on the same adapter while the first is running', async () => {
      const archive = await seededArchive();
      const target = open('memory');
      const outcomes = await Promise.all([
        backupErrorCode(restoreInto(target, chunkedSource(archive).stream)),
        backupErrorCode(restoreInto(target, chunkedSource(archive).stream))
      ]);
      expect(outcomes.filter(outcome => typeof outcome === 'string')).toEqual(['target_busy']);
      expect(await titlesOf(target)).toEqual(SEEDED_NOTES.map(note => note.title));
    });

    for (const stage of STAGES) {
      it(`rejects a connection attempted at "${stage}" with restore_in_progress`, async () => {
        const archive = await seededArchive();
        const dbName = uniqueDbName('backup-cc-dst');
        const intruder = open('persistent', dbName);
        let intrusion: unknown;
        const onStage = async (current: SqliteRestoreStage) => {
          if (current === stage) intrusion = await backupErrorCode(intruder.connect());
        };
        await restoreInto(open('persistent', dbName), chunkedSource(archive).stream, { onStage });
        expect(intrusion).toBe('restore_in_progress');
        expect(await titlesOf(open('persistent', dbName))).toEqual(SEEDED_NOTES.map(note => note.title));
      });
    }

    it('refuses to open a target whose restore never finished, until it is cleaned up', async () => {
      const dbName = uniqueDbName('backup-cc-dst');
      await writeRestoreMarker(harness, dbName);
      const markerOnly = { objects: ['table:rxdb$restore_in_progress'], marker: true };

      expect(await backupErrorCode(open('persistent', dbName).connect())).toBe('restore_incomplete');
      // 被拒的连接不能顺手在上面建表，掩盖半恢复状态。
      expect(await persistentTargetState(harness, dbName)).toEqual(markerOnly);

      const archive = await seededArchive();
      expect(await backupErrorCode(restoreInto(open('persistent', dbName), chunkedSource(archive).stream))).toBe(
        'restore_incomplete'
      );
      expect(await persistentTargetState(harness, dbName)).toEqual(markerOnly);

      expect(await (await open('persistent', dbName).adapter()).cleanupIncompleteRestore()).toBe(true);
      expect(await titlesOf(open('persistent', dbName))).toEqual([]);
    });

    it('refuses cleanup while the target is connected', async () => {
      const dbName = uniqueDbName('backup-cc-dst');
      await open('persistent', dbName).connect();
      const target = await open('persistent', dbName).adapter();
      expect(await backupErrorCode(target.cleanupIncompleteRestore())).toBe('target_busy');
    });
  });
};
