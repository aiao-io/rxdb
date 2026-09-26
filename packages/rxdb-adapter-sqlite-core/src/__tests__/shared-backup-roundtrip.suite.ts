/**
 * US-217 AC#1 / AC#2 / AC#14 / AC#15 / AC#17：备份 → 恢复 → 目标 RxDB 正常连接、读写。
 *
 * @remarks
 * 同步类型为 None 的本地库没有远端可推拉；「适用的同步操作」在这里落到同步所依赖的本地状态：
 * `rxdb_change` 历史逐行一致、恢复本身不追加历史、恢复后的新写入接着原序列记账。
 */
import { RXDB_BACKUP_FORMAT } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteBackupEngineObjects, SqliteBackupHarness, SqliteBackupStorageKind } from '../testing.js';
import {
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  makeNote,
  PLAIN_ENTITIES,
  readChanges,
  readNotes,
  readObjects,
  restoreInto,
  rowsOf,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupAuthor,
  type BackupRxDB,
  type ChangeRow
} from './backup/sqlite-backup-fixture.js';

const KINDS: readonly SqliteBackupStorageKind[] = ['memory', 'persistent'];

/** FTS5 虚表里的全部行；虚表的影子表由引擎维护，恢复后能按词查回才算搜索对象可用。 */
const readSearchHits = async (adapter: RxDBAdapterSqliteBase): Promise<unknown[][]> =>
  rowsOf(await adapter.query(`SELECT body FROM backup_fts WHERE backup_fts MATCH 'restorable' ORDER BY rowid`));

/**
 * 备份矩阵：每个后端的内存 / 持久化源与目标四种组合，加上内存目标的实例隔离、源不受影响、
 * 分块无关。
 *
 * @param harness - 后端
 */
export const backupRoundtripSuite = (harness: SqliteBackupHarness): void => {
  const engine = harness.engineObjects;
  describe(`${harness.adapterName} backup → restore round-trip`, () => {
    const opened: BackupRxDB[] = [];

    afterEach(async () => {
      await Promise.all(opened.splice(0).map(db => db.close()));
    });

    const open = (prefix: string, kind: SqliteBackupStorageKind, dbName = uniqueDbName(prefix)): BackupRxDB => {
      const db = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, kind);
      opened.push(db);
      return db;
    };

    /** 从一个已播种的源库拿到归档字节；引擎有 FTS5 时顺带建一张搜索虚表。 */
    const backupSeeded = async (kind: SqliteBackupStorageKind) => {
      const source = open('backup-src', kind);
      const adapter = await source.connect();
      await seedNotes(source.entities);
      if (harness.fts5) {
        await adapter.rawQuery('CREATE VIRTUAL TABLE backup_fts USING fts5(body)');
        await adapter.rawQuery(`INSERT INTO backup_fts (body) VALUES ('restorable search row'), ('other')`);
      }
      const out = collectingSink();
      const result = await adapter.backup(out.sink);
      return { source, adapter, out, result };
    };

    /** 恢复出来的库可以继续写：唯一约束、外键动作都还在，新变更接着原有历史记账。 */
    const expectWritable = async (
      target: BackupRxDB,
      adapter: RxDBAdapterSqliteBase,
      before: ChangeRow[]
    ): Promise<void> => {
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

      // ON DELETE SET NULL 仍然生效。
      const [alice] = await adapter.getRepository(Author).find({
        where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'alice' }] }
      });
      await alice.remove();
      const notes = await readNotes(adapter, target.entities);
      expect(notes.every(note => note.authorName === null)).toBe(true);
      expect(notes.map(note => note.title)).toContain('d-after-restore');
    };

    for (const sourceKind of KINDS) {
      for (const targetKind of KINDS) {
        it(`restores a ${sourceKind} backup into an empty ${targetKind} target`, async () => {
          const { source, out, result, adapter: sourceAdapter } = await backupSeeded(sourceKind);
          expect(out.closed()).toBe(true);
          expect(result.manifest.format).toBe(RXDB_BACKUP_FORMAT);
          expect(result.manifest.adapter.name).toBe(harness.adapterName);
          expect(result.manifest.adapter.storage).toBe(sourceKind === 'memory' ? 'memory' : harness.persistentLabel);
          expect(result.manifest.adapter.extensions).toEqual(harness.fts5 ? ['fts5'] : []);
          // bytes 只数载荷，归档还多出帧头、manifest 与结束标记。
          expect(result.bytes).toBeGreaterThan(0);
          expect(result.bytes).toBeLessThan(out.bytes().byteLength);

          const sourceChanges = await readChanges(sourceAdapter);
          const sourceObjects = await readObjects(sourceAdapter);
          expect(sourceChanges.length).toBeGreaterThan(0);
          expect(sourceObjects.length).toBeGreaterThan(0);
          expect(result.scope).toEqual({ database: 'included', externalFiles: 'excluded' });
          expect(result.manifest.scope).toEqual(result.scope);
          // AC#15：恢复只依赖归档字节，源实例先关掉。
          await source.close();

          const dbName = uniqueDbName('backup-dst');
          const target = open('backup-dst', targetKind, dbName);
          const restored = await restoreInto(target, chunkedSource(out.bytes()).stream);
          expect(restored.sha256).toBe(result.sha256);
          expect(restored.bytes).toBe(result.bytes);
          expect(restored.manifest.scope).toEqual(result.scope);

          const adapter = await target.connect();
          expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
          // 历史逐行一致：恢复与连接都没有追加业务变更。
          expect(await readChanges(adapter)).toEqual(sourceChanges);
          expect(await readObjects(adapter)).toEqual(sourceObjects);
          if (harness.fts5) expect(await readSearchHits(adapter)).toEqual([['restorable search row']]);

          await expectWritable(target, adapter, sourceChanges);
          if (targetKind !== 'persistent') return;
          // 持久化目标「重启」：断开后用新实例重新打开同一位置。
          const changesBeforeRestart = await readChanges(adapter);
          await target.close();
          const reopened = open('backup-dst', 'persistent', dbName);
          const reopenedAdapter = await reopened.connect();
          expect(await readChanges(reopenedAdapter)).toEqual(changesBeforeRestart);
          expect((await readNotes(reopenedAdapter, reopened.entities)).map(item => item.title)).toContain(
            'd-after-restore'
          );
        });
      }
    }

    for (const targetKind of KINDS) {
      // 目标一打开就带着引擎自建的表与初始行；它们要被归档里的那份整体取代，用户写进去的行随之回来
      it.skipIf(!engine)(`carries user data in engine-created tables into a ${targetKind} target`, async () => {
        const { write, read } = engine as SqliteBackupEngineObjects;
        const source = open('backup-src', 'memory');
        const sourceAdapter = await source.connect();
        await seedNotes(source.entities);
        await sourceAdapter.rawQuery(write);
        const expected = rowsOf(await sourceAdapter.query(read));
        const out = collectingSink();
        await sourceAdapter.backup(out.sink);
        await source.close();

        const target = open('backup-dst', targetKind);
        await restoreInto(target, chunkedSource(out.bytes()).stream);
        const adapter = await target.connect();
        expect(rowsOf(await adapter.query(read))).toEqual(expected);
        expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
      });
    }

    it('restores the same archive into independent memory instances', async () => {
      const { out } = await backupSeeded('memory');
      const first = open('backup-dst', 'memory');
      await restoreInto(first, chunkedSource(out.bytes()).stream);
      const firstAdapter = await first.connect();
      await makeNote(first.entities, 'only-in-first').save();
      await first.close();

      const second = open('backup-dst', 'memory');
      await restoreInto(second, chunkedSource(out.bytes()).stream);
      const secondAdapter = await second.connect();
      expect(await readNotes(secondAdapter, second.entities)).toEqual(SEEDED_NOTES);
      expect(firstAdapter).not.toBe(secondAdapter);
    });

    it('keeps the source usable and unchanged after backing it up', async () => {
      const { source, adapter } = await backupSeeded('persistent');
      expect(await readNotes(adapter, source.entities)).toEqual(SEEDED_NOTES);
      await makeNote(source.entities, 'd-after-backup').save();
      expect((await readNotes(adapter, source.entities)).map(note => note.title)).toContain('d-after-backup');
    });

    it('does not depend on how the source stream is chunked', async () => {
      const { out, result } = await backupSeeded('memory');
      const target = open('backup-dst', 'memory');
      // 奇数块大小让帧头、数据与结束标记都被切在块中间。
      const restored = await restoreInto(target, chunkedSource(out.bytes(), 4093).stream);
      expect(restored.sha256).toBe(result.sha256);
      expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
    });
  });
};
