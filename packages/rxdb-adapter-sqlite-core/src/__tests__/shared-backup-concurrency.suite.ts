/**
 * US-217 AC#3 / AC#12 / AC#16：快照落在一个已提交事务边界上；同一目标上的竞争访问明确拒绝。
 *
 * @remarks
 * 「其他标签页 / 窗口」的竞争在这里以同页面的第二个 RxDB 实例代表：独占靠的是 Web Locks 与库内标记，
 * 两者都按 origin / 存储生效，与请求来自哪个标签页无关。
 *
 * 桌面后端另有一组跨进程用例（AC#12 / AC#16 / AC#19）：「别的进程」与测试进程不共享 Web Locks，
 * 独占与快照一致性只能靠 SQLite 的文件锁与事务成立。
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteRestoreStage } from '../backup/sqlite-backup.interface.js';
import type { ForeignSqliteHost, SqliteBackupHarness } from '../testing.js';
import {
  backupErrorCode,
  chunkedSource,
  CLEAN_TARGET,
  collectingSink,
  createBackupRxDB,
  makeNote,
  persistentTargetState,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  rowsOf,
  scratchLocation,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  withRawClient,
  writeRestoreMarker,
  type BackupLocation,
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
  const scratch = scratchLocation(harness);
  describe(`${harness.adapterName} backup concurrency`, () => {
    const opened: BackupRxDB[] = [];

    afterEach(async () => {
      await Promise.all(opened.splice(0).map(db => db.close()));
    });

    const open = (location: BackupLocation, dbName = uniqueDbName('backup-cc')): BackupRxDB => {
      const db = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, location);
      opened.push(db);
      return db;
    };

    const seededArchive = async (): Promise<Uint8Array> => {
      const source = open(scratch);
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

      const target = open(scratch);
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
      const source = open(scratch);
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
      const target = open(scratch);
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

    crossProcessCases(harness, { open, seededArchive, titlesOf });
  });
};

/** 跨进程用例要用到的、外层套件里的工具。 */
interface ConcurrencyTools {
  open(location: BackupLocation, dbName?: string): BackupRxDB;
  seededArchive(): Promise<Uint8Array>;
  titlesOf(target: BackupRxDB): Promise<string[]>;
}

/** 文件锁拒绝恢复 / 清理时的错误形状：与 Web Lock 的拒绝同码，但带着桌面 host 的 `database_busy` 作为原因。 */
const FILE_LOCK_BUSY = { code: 'target_busy', details: { field: 'storage' }, cause: { code: 'database_busy' } };

/**
 * 取出失败原因本身；成功时返回 `undefined`。
 *
 * @param promise - 期望失败的操作
 * @returns 抛出的值
 */
const rejectionOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error
  );

/** 快照结束的三种方式。 */
type BackupOutcome = 'succeeded' | 'failed' | 'cancelled';

/**
 * 按指定方式结束一次备份，并核对它报告的结果。
 *
 * @param adapter - 源库
 * @param outcome - 结束方式：成功、输出流写第二块时出错、写第二块时取消
 */
const endBackup = async (adapter: RxDBAdapterSqliteBase, outcome: BackupOutcome): Promise<void> => {
  const controller = new AbortController();
  const out = collectingSink((_chunk, index) => {
    if (index !== 1 || outcome === 'succeeded') return;
    if (outcome === 'cancelled') controller.abort(new Error('user cancelled'));
    else throw new Error('sink failed');
  });
  const code = await backupErrorCode(adapter.backup(out.sink, { signal: controller.signal }));
  const expected = { succeeded: undefined, failed: 'io_error', cancelled: 'aborted' }[outcome];
  if (expected === undefined) expect(out.closed()).toBe(true);
  else expect(code).toBe(expected);
};

/**
 * 另一个进程在同一库文件上的竞争（桌面后端）。
 *
 * @param harness - 后端
 * @param tools - 外层套件的工具
 */
const crossProcessCases = (harness: SqliteBackupHarness, tools: ConcurrencyTools): void => {
  const spawnForeign = typeof harness.foreignHost === 'function' ? harness.foreignHost : undefined;
  const reason =
    typeof harness.foreignHost === 'function' ? '' : ` — not applicable: ${harness.foreignHost.unsupported}`;
  const { open, seededArchive, titlesOf } = tools;

  describe.skipIf(!spawnForeign)(`against another process${reason}`, () => {
    let host: ForeignSqliteHost | undefined;
    /** 按需起、整组共用的别的进程。 */
    const foreign = (): SqliteBackupHarness => {
      host ??= (spawnForeign as () => ForeignSqliteHost)();
      return host.harness;
    };

    afterAll(async () => {
      await host?.stop();
    });

    it('refuses a restore while another process has the target open, leaving it untouched (AC#12)', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-xp-dst');
      const refused = await withRawClient(foreign(), dbName, () =>
        rejectionOf(restoreInto(open('persistent', dbName), chunkedSource(archive).stream))
      );
      expect(refused).toMatchObject(FILE_LOCK_BUSY);
      expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);

      await restoreInto(open('persistent', dbName), chunkedSource(archive).stream);
      expect(await titlesOf(open('persistent', dbName))).toEqual(SEEDED_NOTES.map(note => note.title));
    });

    it('keeps another process out of the target for the whole restore, then lets it in (AC#12)', async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-xp-dst');
      const intrusions: unknown[] = [];
      const onStage = async (stage: SqliteRestoreStage) => {
        if (stage !== 'marker-written' && stage !== 'persisted') return;
        intrusions.push(await rejectionOf(withRawClient(foreign(), dbName, async () => 'opened')));
      };
      await restoreInto(open('persistent', dbName), chunkedSource(archive).stream, { onStage });

      expect(intrusions).toMatchObject([{ code: 'database_busy' }, { code: 'database_busy' }]);
      expect(await withRawClient(foreign(), dbName, async () => 'opened')).toBe('opened');
      expect(await titlesOf(open('persistent', dbName))).toEqual(SEEDED_NOTES.map(note => note.title));
    });

    it('refuses cleanup while another process has the target open, keeping the marker (AC#12)', async () => {
      const dbName = uniqueDbName('backup-xp-dst');
      await writeRestoreMarker(harness, dbName);
      const target = await open('persistent', dbName).adapter();

      const refused = await withRawClient(foreign(), dbName, () => rejectionOf(target.cleanupIncompleteRestore()));
      expect(refused).toMatchObject(FILE_LOCK_BUSY);
      expect(await persistentTargetState(harness, dbName)).toEqual({
        objects: ['table:rxdb$restore_in_progress'],
        marker: true
      });

      expect(await target.cleanupIncompleteRestore()).toBe(true);
      expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);
    });

    it("snapshots another process's committed WAL writes but not its open transaction (AC#16 / AC#19)", async () => {
      const dbName = uniqueDbName('backup-xp-src');
      const source = open('persistent', dbName);
      const adapter = await source.connect();
      await seedNotes(source.entities);

      const other = createBackupRxDB(foreign(), dbName, PLAIN_ENTITIES, 'persistent');
      const otherAdapter = await other.connect();
      try {
        // 关掉对方的自动 checkpoint：它提交的数据只在 WAL 里，主文件里没有。
        await otherAdapter.internalQuery('PRAGMA wal_autocheckpoint = 0');
        await makeNote(other.entities, 'foreign-committed').save();
        const written = Promise.withResolvers<void>();
        const held = Promise.withResolvers<void>();
        const Note = other.entities[1] as typeof BackupNote;
        const pending = otherAdapter.transaction(async executor => {
          await executor.getRepository(Note).create(makeNote(other.entities, 'foreign-uncommitted'));
          written.resolve();
          await held.promise;
        });
        await written.promise;

        const out = collectingSink();
        await adapter.backup(out.sink).finally(() => held.resolve());
        await pending;

        const target = open(scratchLocation(harness));
        await restoreInto(target, chunkedSource(out.bytes()).stream);
        const titles = await titlesOf(target);
        expect(titles).toContain('foreign-committed');
        expect(titles).not.toContain('foreign-uncommitted');
        expect(titles.filter(title => !title.startsWith('foreign-'))).toEqual(SEEDED_NOTES.map(note => note.title));
        const [, logFrames] = rowsOf(await adapter.internalQuery('PRAGMA wal_checkpoint(PASSIVE)'))[0];
        expect(Number(logFrames)).toBeGreaterThan(0);
      } finally {
        await other.close();
      }
    });

    for (const outcome of ['succeeded', 'failed', 'cancelled'] as const) {
      it(`leaves no read transaction behind once a backup has ${outcome} (AC#19)`, async () => {
        const dbName = uniqueDbName('backup-xp-src');
        const seeder = open('persistent', dbName);
        await (await seeder.connect()).internalQuery('PRAGMA wal_autocheckpoint = 0');
        await seedNotes(seeder.entities);
        // 备份放在另一条只读过的连接上：写过的实例随后还有后台变更查询在排队，它们的 `BEGIN IMMEDIATE`
        // 失败后回滚，会顺手收掉漏下的读事务，把泄漏掩盖过去。
        const source = open('persistent', dbName);
        const adapter = await source.connect();

        await endBackup(adapter, outcome);

        // 快照开始时 WAL 里有帧：漏掉的读事务会一直钉住这些帧，别的进程的 TRUNCATE checkpoint 等不到它们
        // 被放开，busy 为 1。漏下的事务还会让源库的下一次写入以「事务里不能再开事务」失败。
        const [busy] = await withRawClient(foreign(), dbName, async client => {
          await client.execute('PRAGMA busy_timeout = 1000');
          return rowsOf(await client.execute('PRAGMA wal_checkpoint(TRUNCATE)'))[0];
        });
        expect(busy).toBe(0);

        await makeNote(source.entities, 'after-backup').save();
        expect(await titlesOf(source)).toContain('after-backup');
      });
    }
  });
};
