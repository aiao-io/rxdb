/**
 * US-217 AC#5 / AC#6 / AC#7 / AC#8 / AC#10：不兼容、损坏、目标不空 / 忙、不支持的组合、取消与 I/O 失败。
 *
 * 每条持久化目标上的失败都同时断言两件事：错误码对，且目标回到「从未恢复过」（没有任何对象、没有标记）。
 */
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteRestoreStage } from '../backup/sqlite-backup.interface.js';
import type { SqliteBackupEngineObjects, SqliteBackupHarness, SqliteBackupStorageKind } from '../testing.js';
import {
  backupErrorCode,
  chunkedSource,
  CLEAN_TARGET,
  collectingSink,
  createBackupRxDB,
  interceptSql,
  persistentTargetState,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  rowsOf,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  withRawClient,
  type BackupRxDB
} from './backup/sqlite-backup-fixture.js';

@Entity({
  name: 'BackupFailureTag',
  properties: [{ name: 'label', type: PropertyType.string }]
})
class BackupFailureTag extends EntityBase {
  label!: string;
}

const encoder = new TextEncoder();

/** `text` 在字节里第一次出现的位置。 */
const indexOfBytes = (haystack: Uint8Array, text: string): number => {
  const needle = encoder.encode(text);
  for (let index = haystack.indexOf(needle[0]); index !== -1; index = haystack.indexOf(needle[0], index + 1)) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) return index;
  }
  return -1;
};

/** 只让第一条满足条件的语句失败一次；之后照常执行。 */
const failOnce = (matches: (sql: string) => boolean, error: Error) => {
  let armed = true;
  return (sql: string): Error | undefined => {
    if (!armed || !matches(sql)) return undefined;
    armed = false;
    return error;
  };
};

/**
 * 失败语义。
 *
 * @param harness - 后端
 */
export const backupFailureSuite = (harness: SqliteBackupHarness): void => {
  const engine = harness.engineObjects;
  describe(`${harness.adapterName} backup / restore failures`, () => {
    const opened: BackupRxDB[] = [];

    afterEach(async () => {
      await Promise.all(opened.splice(0).map(db => db.close()));
    });

    const open = (
      kind: SqliteBackupStorageKind,
      dbName = uniqueDbName('backup-fail-dst'),
      entities = PLAIN_ENTITIES
    ): BackupRxDB => {
      const db = createBackupRxDB(harness, dbName, entities, kind);
      opened.push(db);
      return db;
    };

    /** 已连接、已播种的源库；整组共用一份，失败用例不能改动它。 */
    let seededSource: Promise<{ source: BackupRxDB; adapter: RxDBAdapterSqliteBase; archive: Uint8Array }> | undefined;

    const sharedSource = () => {
      seededSource ??= (async () => {
        const source = createBackupRxDB(harness, uniqueDbName('backup-fail-src'), PLAIN_ENTITIES, 'memory');
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
      await shared?.source.close();
    });

    const expectClean = async (dbName: string): Promise<void> => {
      expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);
    };

    /** 在持久化目标上恢复，`prepare` 可在恢复前给目标 adapter 注入故障。 */
    const restorePersistent = async (
      stream: ReadableStream<Uint8Array>,
      options: Parameters<RxDBAdapterSqliteBase['restore']>[1] = {},
      prepare?: (adapter: RxDBAdapterSqliteBase) => void
    ) => {
      const dbName = uniqueDbName('backup-fail-dst');
      const target = open('persistent', dbName);
      const adapter = await target.adapter();
      prepare?.(adapter);
      const code = await backupErrorCode(adapter.restore(stream, options));
      return { dbName, target, adapter, code };
    };

    describe('rejects incompatible archives before writing (AC#5)', () => {
      it('rejects a different entity schema', async () => {
        const { archive } = await sharedSource();
        const dbName = uniqueDbName('backup-fail-dst');
        const target = open('persistent', dbName, [...PLAIN_ENTITIES, BackupFailureTag]);
        expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('incompatible_archive');
        await expectClean(dbName);
      });

      it('rejects an archive from another adapter', async () => {
        const { archive } = await sharedSource();
        const forged = archive.slice();
        const at = indexOfBytes(forged, `"name":"${harness.adapterName}"`);
        expect(at).toBeGreaterThan(-1);
        // 改 adapter 名的最后一个字符：manifest 仍能解析，只是指向另一个 adapter。
        const last = at + `"name":"${harness.adapterName}`.length - 1;
        forged[last] ^= 0x01;
        const { code, dbName } = await restorePersistent(chunkedSource(forged, 512).stream);
        expect(code).toBe('incompatible_archive');
        await expectClean(dbName);
      });

      it.skipIf(!harness.fts5)('rejects an archive that needs a virtual-table module the target lacks', async () => {
        const source = open('memory', uniqueDbName('backup-fail-src'));
        const sourceAdapter = await source.connect();
        await sourceAdapter.rawQuery('CREATE VIRTUAL TABLE backup_fts USING fts5(body)');
        const out = collectingSink();
        const { manifest } = await sourceAdapter.backup(out.sink);
        expect(manifest.adapter.extensions).toEqual(['fts5']);

        const { stream, probe } = chunkedSource(out.bytes(), 512);
        const { code, dbName } = await restorePersistent(stream, {}, adapter =>
          interceptSql(adapter, sql => (sql.includes('pragma_module_list') ? `${sql} WHERE name <> 'fts5'` : undefined))
        );
        expect(code).toBe('incompatible_archive');
        // manifest 在最前面：只读到它就拒绝，远没读到数据。
        expect(probe.pulledBytes).toBeLessThan(out.bytes().byteLength);
        await expectClean(dbName);
      });
    });

    describe('detects damaged archives and cleans up (AC#6)', () => {
      it('reports a truncated archive', async () => {
        const { archive } = await sharedSource();
        const truncated = archive.slice(0, Math.floor(archive.byteLength / 2));
        const { code, dbName } = await restorePersistent(chunkedSource(truncated).stream);
        expect(code).toBe('truncated_archive');
        await expectClean(dbName);
      });

      it('reports a changed value only after reading to the end, then discards the written rows', async () => {
        const { archive } = await sharedSource();
        const corrupt = archive.slice();
        // 改一行数据里的一个字符：帧与值都还能解析，只有结尾的摘要能发现。
        const at = indexOfBytes(corrupt, SEEDED_NOTES[1].title);
        expect(at).toBeGreaterThan(-1);
        corrupt[at + 2] ^= 0x01;
        const { stream, probe } = chunkedSource(corrupt);
        const { code, dbName } = await restorePersistent(stream);
        expect(code).toBe('corrupt_archive');
        expect(probe.pulledBytes).toBe(corrupt.byteLength);
        await expectClean(dbName);
      });

      it('reports a damaged frame for a memory target without handing out a database', async () => {
        const { archive } = await sharedSource();
        const target = open('memory');
        const corrupt = archive.slice();
        corrupt[corrupt.byteLength - 64] ^= 0xff;
        expect(await backupErrorCode(restoreInto(target, chunkedSource(corrupt).stream))).toBe('corrupt_archive');
        // 失败的恢复不留下可被接管的连接：之后连接得到的是一个新的空库。
        expect(await readNotes(await target.connect(), target.entities)).toEqual([]);
      });
    });

    describe('only writes into empty, idle targets (AC#7)', () => {
      it('refuses a target that already holds a database and leaves it intact', async () => {
        const { archive } = await sharedSource();
        const dbName = uniqueDbName('backup-fail-dst');
        const existing = open('persistent', dbName);
        await existing.connect();
        await seedNotes(existing.entities);
        await existing.close();

        const target = open('persistent', dbName);
        expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('target_not_empty');
        expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
      });

      it('refuses a target that only holds RxDB system tables', async () => {
        const { archive } = await sharedSource();
        const dbName = uniqueDbName('backup-fail-dst');
        await open('persistent', dbName, []).connect();
        await opened.pop()?.close();
        const before = await persistentTargetState(harness, dbName);
        expect(before.objects.length).toBeGreaterThan(0);

        const target = open('persistent', dbName);
        expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('target_not_empty');
        expect(await persistentTargetState(harness, dbName)).toEqual(before);
      });

      // 引擎自建的表里有了用户数据就不再是空库：恢复会把它们换成归档里的那份
      it.skipIf(!engine)('refuses a target whose engine-created tables hold user data', async () => {
        const { write, read } = engine as SqliteBackupEngineObjects;
        const { archive } = await sharedSource();
        const dbName = uniqueDbName('backup-fail-dst');
        const written = await withRawClient(harness, dbName, async client => {
          await client.execute(write);
          return rowsOf(await client.execute(read));
        });
        expect(written.length).toBeGreaterThan(0);

        const target = open('persistent', dbName);
        expect(await backupErrorCode(restoreInto(target, chunkedSource(archive).stream))).toBe('target_not_empty');
        expect(await withRawClient(harness, dbName, async client => rowsOf(await client.execute(read)))).toEqual(
          written
        );
      });

      for (const kind of ['memory', 'persistent'] as const) {
        it(`refuses a connected ${kind} adapter`, async () => {
          const { archive } = await sharedSource();
          const target = open(kind);
          await target.connect();
          const { stream, probe } = chunkedSource(archive);
          expect(await backupErrorCode(restoreInto(target, stream))).toBe('target_busy');
          expect(probe.pulledBytes).toBe(0);
          expect(probe.cancelled).toBe(true);
        });
      }

      it('refuses storage that another instance has open', async () => {
        const { archive } = await sharedSource();
        const dbName = uniqueDbName('backup-fail-dst');
        await open('persistent', dbName).connect();
        const { stream, probe } = chunkedSource(archive);
        expect(await backupErrorCode(restoreInto(open('persistent', dbName), stream))).toBe('target_busy');
        expect(probe.pulledBytes).toBe(0);
      });
    });

    describe(`rejects ${harness.unsupportedField} configurations outside the matrix (AC#8)`, () => {
      const unsupported = () => {
        const rxdb = new RxDB({
          dbName: uniqueDbName('backup-unsupported'),
          context: { userId: 'backup-user' },
          entities: [],
          sync: { local: { adapter: harness.adapterName }, type: SyncType.None }
        });
        return { rxdb, adapter: harness.createUnsupportedAdapter(rxdb) };
      };

      it('does not touch the sink when backing up', async () => {
        const { rxdb, adapter } = unsupported();
        const out = collectingSink();
        const error = await adapter.backup(out.sink).catch((caught: unknown) => caught);
        expect(error).toMatchObject({
          code: 'unsupported_combination',
          details: { field: harness.unsupportedField }
        });
        expect(out.sink.locked).toBe(false);
        expect(out.aborted()).toBe(false);
        await adapter.disconnect();
        await harness.release?.(rxdb);
      });

      it('does not read the source when restoring or cleaning up', async () => {
        const { archive } = await sharedSource();
        const { rxdb, adapter } = unsupported();
        const { stream, probe } = chunkedSource(archive);
        expect(await backupErrorCode(adapter.restore(stream))).toBe('unsupported_combination');
        expect(probe.pulledBytes).toBe(0);
        expect(probe.cancelled).toBe(true);
        expect(await backupErrorCode(adapter.cleanupIncompleteRestore())).toBe('unsupported_combination');
        await adapter.disconnect();
        await harness.release?.(rxdb);
      });
    });

    describe('backup cancellation and output failures (AC#10)', () => {
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
          if (index === 1) controller.abort(new Error('user cancelled'));
        });
        expect(await backupErrorCode(adapter.backup(out.sink, { signal: controller.signal }))).toBe('aborted');
        expect(out.aborted()).toBe(true);
        expect(out.closed()).toBe(false);
        expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
      });

      it('reports a full destination as storage_full', async () => {
        const { source, adapter } = await sharedSource();
        const out = collectingSink((_chunk, index) => {
          if (index === 1) throw new DOMException('disk is full', 'QuotaExceededError');
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

    describe('restore cancellation and input failures (AC#10)', () => {
      it('aborts mid-stream and cleans up a persistent target', async () => {
        const { archive } = await sharedSource();
        const controller = new AbortController();
        const { stream, probe } = chunkedSource(archive, 1024, pulled => {
          if (pulled > archive.byteLength / 2) controller.abort(new Error('user cancelled'));
        });
        const { code, dbName } = await restorePersistent(stream, { signal: controller.signal });
        expect(code).toBe('aborted');
        expect(probe.cancelled).toBe(true);
        await expectClean(dbName);
      });

      const stages: readonly SqliteRestoreStage[] = ['marker-written', 'rows-written', 'verified'];
      for (const stage of stages) {
        it(`aborts at "${stage}", before the commit point`, async () => {
          const { archive } = await sharedSource();
          const controller = new AbortController();
          const onStage = (current: SqliteRestoreStage) => {
            if (current === stage) controller.abort(new Error('user cancelled'));
          };
          const { code, dbName } = await restorePersistent(chunkedSource(archive).stream, {
            signal: controller.signal,
            onStage
          });
          expect(code).toBe('aborted');
          await expectClean(dbName);
        });
      }

      it('aborts a memory target mid-stream', async () => {
        const { archive } = await sharedSource();
        const target = open('memory');
        const controller = new AbortController();
        const { stream } = chunkedSource(archive, 1024, pulled => {
          if (pulled > archive.byteLength / 2) controller.abort(new Error('user cancelled'));
        });
        expect(await backupErrorCode(restoreInto(target, stream, { signal: controller.signal }))).toBe('aborted');
      });

      it('reports a failing source as io_error', async () => {
        const { archive } = await sharedSource();
        const { stream } = chunkedSource(archive, 1024, pulled => {
          if (pulled > archive.byteLength / 2) throw new Error('file was removed');
        });
        const { code, dbName } = await restorePersistent(stream);
        expect(code).toBe('io_error');
        await expectClean(dbName);
      });

      it('reports a full disk during the commit as storage_full and cleans up', async () => {
        const { archive } = await sharedSource();
        // 验证通过之后才提交：此时让磁盘写满，覆盖的正是唯一的落盘段。
        let verified = false;
        const fault = failOnce(
          sql => verified && sql === 'COMMIT;',
          new Error('SQLITE_FULL: database or disk is full')
        );
        const { code, dbName } = await restorePersistent(
          chunkedSource(archive).stream,
          {
            onStage: stage => {
              verified ||= stage === 'verified';
            }
          },
          adapter => interceptSql(adapter, fault)
        );
        expect(code).toBe('storage_full');
        await expectClean(dbName);
      });

      it('reports cleanup_pending when the partial data cannot be removed, and recovers after cleanup', async () => {
        const { archive } = await sharedSource();
        const fault = failOnce(sql => sql === 'PRAGMA foreign_keys = OFF;', new Error('SQLITE_IOERR: disk I/O error'));
        const onStage = (stage: SqliteRestoreStage) => {
          if (stage === 'rows-written') throw new Error('simulated failure after writing rows');
        };
        const { code, dbName, adapter } = await restorePersistent(chunkedSource(archive).stream, { onStage }, target =>
          interceptSql(target, fault)
        );
        expect(code).toBe('cleanup_pending');
        expect((await persistentTargetState(harness, dbName)).marker).toBe(true);
        expect(await backupErrorCode(adapter.restore(chunkedSource(archive).stream))).toBe('restore_incomplete');

        expect(await adapter.cleanupIncompleteRestore()).toBe(true);
        await expectClean(dbName);
        expect(await adapter.cleanupIncompleteRestore()).toBe(false);

        await adapter.restore(chunkedSource(archive).stream);
        const target = open('persistent', dbName);
        expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
      });
    });
  });
};
