/**
 * US-217 AC#3 / AC#12：快照落在一个已提交事务边界上；同一目标上的竞争访问明确拒绝。
 *
 * @remarks
 * 「其他标签页 / 窗口」的竞争在这里以同页面的第二个 RxDB 实例代表：独占靠的是 Web Locks 与持久标记，
 * 两者都按 origin 生效，与请求来自哪个标签页无关。
 */
import type { RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { pgliteStorageLockName, writeRestoreMarker } from '../../backup/pglite-restore-lock.js';
import { cleanupIncompletePGliteRestore, restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  idbStorageOf,
  idbTargetState,
  makeNote,
  PLAIN_ENTITIES,
  readNotes,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupNote,
  type BackupRxDB
} from './backup-test-fixture.js';

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

const track = (target: BackupRxDB): BackupRxDB => {
  opened.push(target.rxdb);
  return target;
};

const seededArchive = async (): Promise<Uint8Array> => {
  const source = track(createBackupRxDB(uniqueDbName('backup-cc-src'), PLAIN_ENTITIES, { store: 'memory' }));
  const adapter = await source.connect();
  await seedNotes(source.entities);
  const out = collectingSink();
  await adapter.backup(out.sink);
  return out.bytes();
};

const titlesOf = async (target: BackupRxDB, database?: Parameters<BackupRxDB['connect']>[0]): Promise<string[]> => {
  const adapter = await track(target).connect(database);
  return (await readNotes(adapter, target.entities)).map(note => note.title);
};

describe('PGlite backup captures a committed transaction boundary (AC#3)', () => {
  it('contains every earlier commit, a commit-order prefix of concurrent ones, and no rolled-back work', async () => {
    const source = track(createBackupRxDB(uniqueDbName('backup-cc-src'), PLAIN_ENTITIES, { store: 'memory' }));
    const adapter = await source.connect();
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

    const target = createBackupRxDB(uniqueDbName('backup-cc-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const { database } = await restorePGliteDatabase(chunkedSource(out.bytes()).stream, target);
    const restored = new Set(await titlesOf(target, database));

    expect([...restored].filter(title => title.startsWith('before-')).sort()).toEqual([
      'before-0',
      'before-1',
      'before-2'
    ]);
    expect(restored.has('rolled-back')).toBe(false);
    expect(restored.has('pair-a')).toBe(restored.has('pair-b'));
    const concurrent = [...restored].filter(title => !title.startsWith('before-'));
    expect(new Set(concurrent)).toEqual(new Set(committed.slice(0, concurrent.length)));
  });
});

describe('PGlite backup refuses an IndexedDB source that other connections share (AC#3)', () => {
  /** 备份应被拒绝，且输出流一个字节都没收到。 */
  const expectRefused = async (adapter: Awaited<ReturnType<BackupRxDB['connect']>>) => {
    const out = collectingSink();
    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('target_busy');
    expect(out.bytes().byteLength).toBe(0);
  };

  it('rejects while another instance holds the storage, whose commits this runtime cannot see', async () => {
    const dbName = uniqueDbName('backup-cc-shared');
    const source = track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
    const adapter = await source.connect();
    await makeNote(source.entities, 'from-source').save();
    // 每个实例有自己的内存文件系统：对端的提交同步进了 IndexedDB，却不在本运行时的视图里。
    const peer = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    await peer.connect();
    await makeNote(peer.entities, 'from-peer').save();
    await expectRefused(adapter);
    await peer.rxdb.disconnectAll();
  });

  it('rejects while another tab or worker holds the storage lock', async () => {
    const dbName = uniqueDbName('backup-cc-shared');
    const source = track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
    const adapter = await source.connect();
    // 别的标签页 / Worker 里的连接在本 realm 里只以一把共享锁的形式可见。
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      void navigator.locks.request(pgliteStorageLockName(idbStorageOf(source).storageKey), { mode: 'shared' }, () => {
        resolve();
        return new Promise<void>(done => (release = done));
      });
    });
    await held;
    try {
      await expectRefused(adapter);
    } finally {
      release();
    }
  });

  it("includes every connection's commits once a single holder backs the storage up", async () => {
    const dbName = uniqueDbName('backup-cc-shared');
    const writers = [createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' })];
    await writers[0].connect();
    await makeNote(writers[0].entities, 'from-first').save();
    await writers[0].rxdb.disconnectAll();
    writers.push(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
    await writers[1].connect();
    await makeNote(writers[1].entities, 'from-second').save();
    await writers[1].rxdb.disconnectAll();

    const source = track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
    const out = collectingSink();
    await (await source.connect()).backup(out.sink);
    const target = createBackupRxDB(uniqueDbName('backup-cc-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const { database } = await restorePGliteDatabase(chunkedSource(out.bytes()).stream, target);
    expect(await titlesOf(target, database)).toEqual(['from-first', 'from-second']);
  });
});

describe('PGlite restore owns its target exclusively (AC#12)', () => {
  it('lets exactly one of two concurrent restores into the same target win', async () => {
    const archive = await seededArchive();
    const dbName = uniqueDbName('backup-cc-dst');
    const first = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    const second = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    const outcomes = await Promise.all([
      backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, first)),
      backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, second))
    ]);
    const losers = outcomes.filter(outcome => typeof outcome === 'string');
    expect(losers).toEqual(['target_busy']);

    const reader = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    expect(await titlesOf(reader)).toEqual(SEEDED_NOTES.map(note => note.title));
  });

  for (const stage of ['marker-written', 'files-written', 'verified', 'persisted'] as const) {
    it(`rejects a connection attempted at "${stage}" with restore_in_progress`, async () => {
      const archive = await seededArchive();
      const dbName = uniqueDbName('backup-cc-dst');
      const target = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
      const intruder = track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
      let intrusion: unknown;
      const onStage = async (current: string) => {
        if (current === stage) intrusion = await backupErrorCode(intruder.connect());
      };
      await restorePGliteDatabase(chunkedSource(archive).stream, target, { onStage });
      expect(intrusion).toBe('restore_in_progress');

      const reader = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
      expect(await titlesOf(reader)).toEqual(SEEDED_NOTES.map(note => note.title));
    });
  }

  it('refuses to open a target whose restore never finished, until it is cleaned up', async () => {
    const dbName = uniqueDbName('backup-cc-dst');
    const target = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    await writeRestoreMarker(idbStorageOf(target).storageKey);

    const blocked = track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }));
    expect(await backupErrorCode(blocked.connect())).toBe('restore_incomplete');
    // 被拒的连接不能顺手初始化出一个空库来掩盖半恢复状态。
    expect(await idbTargetState(target)).toEqual({ empty: true, marker: true });

    expect(await cleanupIncompletePGliteRestore(target)).toBe(true);
    expect(await titlesOf(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }))).toEqual([]);
  });

  it('refuses cleanup while the target is connected', async () => {
    const dbName = uniqueDbName('backup-cc-dst');
    await track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' })).connect();
    const target = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
    expect(await backupErrorCode(cleanupIncompletePGliteRestore(target))).toBe('target_busy');
  });
});
