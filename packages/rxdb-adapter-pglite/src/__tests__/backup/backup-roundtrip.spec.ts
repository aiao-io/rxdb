/**
 * US-217 AC#1 / AC#2 / AC#14 / AC#15：备份 → 恢复 → 目标 RxDB 正常连接、读写。
 *
 * @remarks
 * 同步类型为 None 的本地库没有远端可推拉；「适用的同步操作」在这里落到同步所依赖的本地状态：
 * `rxdb_change` 历史逐行一致、恢复本身不追加历史、恢复后的新写入接着原序列记账。
 */
import { isRxDBBackupError, RXDB_BACKUP_FORMAT, type RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import type { PGliteClientOptions } from '../../pglite.interface.js';
import type { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import {
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  makeNote,
  PLAIN_ENTITIES,
  readNotes,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupAuthor,
  type BackupRxDB
} from './backup-test-fixture.js';

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

interface ChangeRow {
  id: number;
  type: string;
  entity: string;
  entityId: string;
  patch: unknown;
}

const readChanges = async (adapter: RxDBAdapterPGlite): Promise<ChangeRow[]> =>
  (await adapter.query<ChangeRow>('SELECT id, type, entity, "entityId", patch FROM "rxdb"."rxdb_change" ORDER BY id'))
    .rows;

/** 用户可见 schema 里的索引、触发器与序列：恢复必须原样带回这些数据库对象。 */
const readObjects = async (adapter: RxDBAdapterPGlite): Promise<string[]> =>
  (
    await adapter.query<{ name: string }>(
      `SELECT 'index:' || schemaname || '.' || indexname AS name FROM pg_indexes
         WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'trigger:' || c.relname || '.' || t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal
       UNION ALL
       SELECT 'sequence:' || sequence_schema || '.' || sequence_name FROM information_schema.sequences
       ORDER BY name`
    )
  ).rows.map(row => row.name);

/** 从一个已播种的源库拿到归档字节。 */
const backupSeeded = async (options: PGliteClientOptions) => {
  const source = createBackupRxDB(uniqueDbName('backup-src'), PLAIN_ENTITIES, options);
  opened.push(source.rxdb);
  const adapter = await source.connect();
  await seedNotes(source.entities);
  const out = collectingSink();
  const result = await adapter.backup(out.sink);
  return { source, adapter, out, result };
};

const STORES: Array<PGliteClientOptions['store']> = ['memory', 'idb'];

/**
 * 恢复出来的库可以继续写：唯一约束、外键动作都还在，新变更接着原有历史记账。
 */
const expectWritable = async (target: BackupRxDB, adapter: RxDBAdapterPGlite, before: ChangeRow[]): Promise<void> => {
  const [Author] = target.entities as [typeof BackupAuthor];
  const duplicate = new Author();
  duplicate.name = 'alice';
  await expect(duplicate.save()).rejects.toThrow();

  await makeNote(target.entities, 'd-after-restore').save();
  const after = await readChanges(adapter);
  expect(after.slice(0, before.length)).toEqual(before);
  const appended = after.slice(before.length);
  expect(appended.map(row => [row.type, row.entity])).toEqual([['INSERT', 'BackupNote']]);
  expect(appended[0].id).toBeGreaterThan(before[before.length - 1].id);

  // ON DELETE SET NULL 仍由数据库执行。
  const [alice] = await adapter.getRepository(Author).find({
    where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'alice' }] }
  });
  await alice.remove();
  const notes = await readNotes(adapter, target.entities);
  expect(notes.every(note => note.authorName === null)).toBe(true);
  expect(notes.map(note => note.title)).toContain('d-after-restore');
};

describe('PGlite backup → restore round-trip', () => {
  for (const sourceStore of STORES) {
    for (const targetStore of STORES) {
      it(`restores a ${sourceStore} backup into an empty ${targetStore} target`, async () => {
        const { source, out, result, adapter: sourceAdapter } = await backupSeeded({ store: sourceStore });
        expect(out.closed()).toBe(true);
        expect(result.manifest.format).toBe(RXDB_BACKUP_FORMAT);
        expect(result.manifest.adapter.storage).toBe(sourceStore);
        // bytes 只数文件数据，归档还多出帧头、manifest 与结束标记。
        expect(result.bytes).toBeGreaterThan(0);
        expect(result.bytes).toBeLessThan(out.bytes().byteLength);

        const sourceChanges = await readChanges(sourceAdapter);
        const sourceObjects = await readObjects(sourceAdapter);
        expect(sourceChanges.length).toBeGreaterThan(0);
        expect(result.scope).toEqual({ database: 'included', externalFiles: 'excluded' });
        expect(result.manifest.scope).toEqual(result.scope);
        // AC#15：恢复只依赖归档字节，源实例先关掉。
        await source.rxdb.disconnectAll();

        const dbName = uniqueDbName('backup-dst');
        const target = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: targetStore });
        const restored = await restorePGliteDatabase(chunkedSource(out.bytes()).stream, target);
        expect(restored.sha256).toBe(result.sha256);
        expect(restored.bytes).toBe(result.bytes);
        expect(restored.manifest.scope).toEqual(result.scope);
        expect(restored.database === undefined).toBe(targetStore === 'idb');

        opened.push(target.rxdb);
        const adapter = await target.connect(restored.database);
        expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
        // 历史逐行一致：恢复与连接都没有追加业务变更。
        expect(await readChanges(adapter)).toEqual(sourceChanges);
        expect(await readObjects(adapter)).toEqual(sourceObjects);

        await expectWritable(target, adapter, sourceChanges);
        if (targetStore !== 'idb') return;
        // 持久化目标「重启」：断开后用新实例重新打开同一位置。
        const changesBeforeRestart = await readChanges(adapter);
        await target.rxdb.disconnectAll();
        const reopened = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
        opened.push(reopened.rxdb);
        const reopenedAdapter = await reopened.connect();
        expect(await readChanges(reopenedAdapter)).toEqual(changesBeforeRestart);
        expect((await readNotes(reopenedAdapter, reopened.entities)).map(item => item.title)).toContain(
          'd-after-restore'
        );
      });
    }
  }

  it('restores the same archive into independent memory instances', async () => {
    const { out } = await backupSeeded({ store: 'memory' });
    const first = createBackupRxDB(uniqueDbName('backup-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const firstRestored = await restorePGliteDatabase(chunkedSource(out.bytes()).stream, first);
    opened.push(first.rxdb);
    const firstAdapter = await first.connect(firstRestored.database);
    await makeNote(first.entities, 'only-in-first').save();
    await first.rxdb.disconnectAll();

    const second = createBackupRxDB(uniqueDbName('backup-dst'), PLAIN_ENTITIES, { store: 'memory' });
    const secondRestored = await restorePGliteDatabase(chunkedSource(out.bytes()).stream, second);
    opened.push(second.rxdb);
    const secondAdapter = await second.connect(secondRestored.database);
    expect(await readNotes(secondAdapter, second.entities)).toEqual(SEEDED_NOTES);
    expect(firstAdapter).not.toBe(secondAdapter);
  });

  it('keeps the source usable and unchanged after backing it up', async () => {
    const { source, adapter } = await backupSeeded({ store: 'memory' });
    expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
  });

  it('does not depend on how the source stream is chunked', async () => {
    const { out, result } = await backupSeeded({ store: 'memory' });
    const target = createBackupRxDB(uniqueDbName('backup-dst'), PLAIN_ENTITIES, { store: 'memory' });
    // 奇数块大小让帧头、数据与结束标记都被切在块中间。
    const restored = await restorePGliteDatabase(chunkedSource(out.bytes(), 4093).stream, target);
    expect(restored.sha256).toBe(result.sha256);
    expect(restored.database).toBeDefined();
    await restored.database?.close();
    expect(restored.database?.consumed).toBe(true);
  });

  it('rejects OPFS-AHP sources and targets as unsupported', async () => {
    const target = createBackupRxDB(uniqueDbName('backup-dst'), PLAIN_ENTITIES, {
      dataDir: 'opfs-ahp://backup-unsupported'
    });
    const error = await restorePGliteDatabase(chunkedSource(new Uint8Array(0)).stream, target).catch(
      (caught: unknown) => caught
    );
    expect(isRxDBBackupError(error) && error.code).toBe('unsupported_combination');
  });
});
