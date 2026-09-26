/**
 * US-217 AC#5 / AC#6 / AC#7 / AC#8 / AC#10：不兼容、损坏、目标不空 / 忙、不支持的后端、取消与 I/O 失败。
 *
 * 每条失败都要同时断言两件事：错误码对，且目标回到「从未恢复过」（IndexedDB 为空、无标记）。
 */
import { Entity, EntityBase, PropertyType, type RxDB } from '@aiao/rxdb';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cleanupIncompletePGliteRestore, restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  idbDatabaseNameOf,
  idbTargetState,
  PLAIN_ENTITIES,
  readNotes,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupRxDB
} from './backup-test-fixture.js';

@Entity({
  name: 'BackupFailureTag',
  properties: [{ name: 'label', type: PropertyType.string }]
})
class BackupFailureTag extends EntityBase {
  label!: string;
}

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

/** 已连接、已播种的源库；整个文件共用一份，失败用例不能改动它。 */
let seededSource: Promise<{ source: BackupRxDB; adapter: RxDBAdapterPGlite; archive: Uint8Array }> | undefined;

const sharedSource = () => {
  seededSource ??= (async () => {
    const source = createBackupRxDB(uniqueDbName('backup-fail-src'), PLAIN_ENTITIES, { store: 'memory' });
    const adapter = await source.connect();
    await seedNotes(source.entities);
    const out = collectingSink();
    await adapter.backup(out.sink);
    return { source, adapter, archive: out.bytes() };
  })();
  return seededSource;
};

afterAll(async () => {
  const shared = await seededSource;
  await shared?.source.rxdb.disconnectAll();
});

const idbTarget = (dbName = uniqueDbName('backup-fail-dst')): BackupRxDB =>
  createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });

const expectCleanIdbTarget = async (target: BackupRxDB): Promise<void> => {
  expect(await idbTargetState(target)).toEqual({ empty: true, marker: false });
};

/** 持有一条不响应 versionchange 的 IndexedDB 连接，挡住删库。 */
const holdIdbConnection = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

describe('PGlite restore rejects incompatible archives before writing (AC#5)', () => {
  it('rejects a different entity schema', async () => {
    const { archive } = await sharedSource();
    const target = createBackupRxDB(uniqueDbName('backup-fail-dst'), [...PLAIN_ENTITIES, BackupFailureTag], {
      store: 'idb'
    });
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe(
      'incompatible_archive'
    );
    await expectCleanIdbTarget(target);
  });

  it('rejects an archive that needs an extension the target does not load', async () => {
    const source = createBackupRxDB(uniqueDbName('backup-fail-src'), PLAIN_ENTITIES, {
      store: 'memory',
      extensions: { uuid_ossp }
    });
    opened.push(source.rxdb);
    const adapter = await source.connect();
    const out = collectingSink();
    const { manifest } = await adapter.backup(out.sink);
    expect(manifest.adapter.extensions).toEqual(['uuid_ossp']);

    const target = idbTarget();
    const { stream, probe } = chunkedSource(out.bytes());
    expect(await backupErrorCode(restorePGliteDatabase(stream, target))).toBe('incompatible_archive');
    // manifest 在第一个块里：只读到它就拒绝，远没读到数据。
    expect(probe.pulledBytes).toBeLessThan(out.bytes().byteLength);
    await expectCleanIdbTarget(target);
  });
});

describe('PGlite restore detects damaged archives and cleans up (AC#6)', () => {
  it('reports a truncated archive', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const truncated = archive.slice(0, Math.floor(archive.byteLength / 2));
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(truncated).stream, target))).toBe(
      'truncated_archive'
    );
    await expectCleanIdbTarget(target);
  });

  it('reports a flipped byte only after reading to the end, then discards the staged data', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const corrupt = archive.slice();
    const middle = Math.floor(corrupt.byteLength / 2);
    corrupt[middle] = corrupt[middle] ^ 0xff;
    const { stream, probe } = chunkedSource(corrupt);
    expect(await backupErrorCode(restorePGliteDatabase(stream, target))).toBe('corrupt_archive');
    expect(probe.pulledBytes).toBe(corrupt.byteLength);
    await expectCleanIdbTarget(target);
  });

  it('reports a flipped byte for a memory target without handing out a database', async () => {
    const { archive } = await sharedSource();
    const target = createBackupRxDB(uniqueDbName('backup-fail-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const corrupt = archive.slice();
    corrupt[corrupt.byteLength - 64] ^= 0xff;
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(corrupt).stream, target))).toBe('corrupt_archive');
  });
});

describe('PGlite restore only writes into empty, idle targets (AC#7)', () => {
  it('refuses a target that already holds a database and leaves it intact', async () => {
    const { archive } = await sharedSource();
    const dbName = uniqueDbName('backup-fail-dst');
    const existing = idbTarget(dbName);
    await existing.connect();
    await seedNotes(existing.entities);
    await existing.rxdb.disconnectAll();

    const target = idbTarget(dbName);
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe(
      'target_not_empty'
    );
    opened.push(target.rxdb);
    const adapter = await target.connect();
    expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
  });

  it('refuses the RxDB instance itself once it is connected', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    opened.push(target.rxdb);
    await target.connect();
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe('target_busy');
  });

  it('refuses storage that another instance has open', async () => {
    const { archive } = await sharedSource();
    const dbName = uniqueDbName('backup-fail-dst');
    const other = idbTarget(dbName);
    opened.push(other.rxdb);
    await other.connect();
    const { stream, probe } = chunkedSource(archive);
    expect(await backupErrorCode(restorePGliteDatabase(stream, idbTarget(dbName)))).toBe('target_busy');
    expect(probe.pulledBytes).toBe(0);
  });
});

describe('PGlite backup / restore reject unsupported storage (AC#8)', () => {
  for (const dataDir of ['opfs-ahp://backup-unsupported', 'file://backup-unsupported']) {
    it(`does not touch the sink when backing up ${dataDir}`, async () => {
      const source = createBackupRxDB(uniqueDbName('backup-fail-src'), PLAIN_ENTITIES, { dataDir });
      const out = collectingSink();
      const adapter = new RxDBAdapterPGlite(source.rxdb, { dataDir });
      expect(await backupErrorCode(adapter.backup(out.sink))).toBe('unsupported_combination');
      expect(out.sink.locked).toBe(false);
      expect(out.aborted()).toBe(false);
    });

    it(`does not read the source when restoring into ${dataDir}`, async () => {
      const { archive } = await sharedSource();
      const target = createBackupRxDB(uniqueDbName('backup-fail-dst'), PLAIN_ENTITIES, { dataDir });
      const { stream, probe } = chunkedSource(archive);
      expect(await backupErrorCode(restorePGliteDatabase(stream, target))).toBe('unsupported_combination');
      expect(probe.pulledBytes).toBe(0);
    });
  }
});

describe('PGlite backup cancellation and output failures (AC#10)', () => {
  it('rejects an already aborted signal without touching the sink', async () => {
    const { adapter } = await sharedSource();
    const out = collectingSink();
    const signal = AbortSignal.abort(new Error('user cancelled'));
    expect(await backupErrorCode(adapter.backup(out.sink, { signal }))).toBe('aborted');
    expect(out.sink.locked).toBe(false);
    expect(out.chunkSizes).toEqual([]);
  });

  it('aborts mid-write, aborts the sink and keeps the source usable', async () => {
    const { source, adapter } = await sharedSource();
    const controller = new AbortController();
    const out = collectingSink((_chunk, index) => {
      if (index === 3) controller.abort(new Error('user cancelled'));
    });
    expect(await backupErrorCode(adapter.backup(out.sink, { signal: controller.signal }))).toBe('aborted');
    expect(out.aborted()).toBe(true);
    expect(out.closed()).toBe(false);
    expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
  });

  it('reports a full destination as storage_full', async () => {
    const { source, adapter } = await sharedSource();
    const out = collectingSink((_chunk, index) => {
      if (index === 2) throw new DOMException('disk is full', 'QuotaExceededError');
    });
    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('storage_full');
    expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
  });

  it('reports other destination failures as io_error', async () => {
    const { adapter } = await sharedSource();
    const out = collectingSink((_chunk, index) => {
      if (index === 1) throw new Error('network share went away');
    });
    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('io_error');
  });

  it('gives up with lock_timeout while a transaction holds the database, and never runs later', async () => {
    const { source, adapter } = await sharedSource();
    const out = collectingSink();
    const code = await adapter.transaction(() => backupErrorCode(adapter.backup(out.sink, { lockTimeoutMs: 50 })));
    expect(code).toBe('lock_timeout');
    // 超时后排队中的任务被跳过：事务结束后再做一次读，确认输出流始终没被写。
    expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
    expect(out.chunkSizes).toEqual([]);
  });
});

describe('PGlite restore cancellation and input failures (AC#10)', () => {
  it('aborts mid-stream and cleans up an IndexedDB target', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const controller = new AbortController();
    const { stream, probe } = chunkedSource(archive, 16 * 1024, pulled => {
      if (pulled > 1024 * 1024) controller.abort(new Error('user cancelled'));
    });
    expect(await backupErrorCode(restorePGliteDatabase(stream, target, { signal: controller.signal }))).toBe('aborted');
    expect(probe.cancelled).toBe(true);
    await expectCleanIdbTarget(target);
  });

  it('aborts after verification but before the commit point', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const controller = new AbortController();
    const onStage = (stage: string) => {
      if (stage === 'verified') controller.abort(new Error('user cancelled'));
    };
    const restore = restorePGliteDatabase(chunkedSource(archive).stream, target, {
      signal: controller.signal,
      onStage
    });
    expect(await backupErrorCode(restore)).toBe('aborted');
    await expectCleanIdbTarget(target);
  });

  it('aborts a memory target mid-stream', async () => {
    const { archive } = await sharedSource();
    const target = createBackupRxDB(uniqueDbName('backup-fail-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const controller = new AbortController();
    const { stream } = chunkedSource(archive, 16 * 1024, pulled => {
      if (pulled > 1024 * 1024) controller.abort(new Error('user cancelled'));
    });
    expect(await backupErrorCode(restorePGliteDatabase(stream, target, { signal: controller.signal }))).toBe('aborted');
  });

  it('reports a failing source as io_error', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const { stream } = chunkedSource(archive, 16 * 1024, pulled => {
      if (pulled > 512 * 1024) throw new Error('file was removed');
    });
    expect(await backupErrorCode(restorePGliteDatabase(stream, target))).toBe('io_error');
    await expectCleanIdbTarget(target);
  });

  it('reports a full IndexedDB quota during the commit as storage_full and cleans up', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    const put = IDBObjectStore.prototype.put;
    // 验证通过之后才开始写 IndexedDB：此时让配额耗尽，覆盖的正是唯一的落盘段。
    const onStage = (stage: string) => {
      if (stage !== 'verified') return;
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      };
    };
    try {
      expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target, { onStage }))).toBe(
        'storage_full'
      );
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    await expectCleanIdbTarget(target);
  });

  it('reports cleanup_pending when the partial data cannot be removed, and recovers after cleanup', async () => {
    const { archive } = await sharedSource();
    const target = idbTarget();
    let blocker: IDBDatabase | undefined;
    const onStage = async (stage: string) => {
      if (stage !== 'files-written') return;
      blocker = await holdIdbConnection(idbDatabaseNameOf(target));
      throw new Error('simulated failure after writing files');
    };
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target, { onStage }))).toBe(
      'cleanup_pending'
    );
    // 被挡住的 deleteDatabase 仍在排队，它之后的 open 都会等它——只能问标记库，不能碰数据目录。
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe(
      'restore_incomplete'
    );

    blocker?.close();
    expect((await idbTargetState(target)).marker).toBe(true);
    expect(await cleanupIncompletePGliteRestore(target)).toBe(true);
    await expectCleanIdbTarget(target);
    expect(await cleanupIncompletePGliteRestore(target)).toBe(false);

    await restorePGliteDatabase(chunkedSource(archive).stream, target);
    opened.push(target.rxdb);
    const adapter = await target.connect();
    expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
  });
});
