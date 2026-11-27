import {
  Entity,
  ENTITY_LOCAL_REMOVE_EVENT,
  EntityBase,
  getEntityStatus,
  PropertyType,
  RxDBChange,
  type EntityLocalRemovedEvent
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db, settle_change_notifications } from './test-utils.js';

/**
 * 「无日志实体的删除通知随事务提交（INC-002）」的夹具：不写变更日志，删除通知由删行路径直接派。
 */
@Entity({
  name: 'RepoUnloggedNote',
  tableName: 'repo_unlogged_note',
  log: false,
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class RepoUnloggedNote extends EntityBase {
  title?: string | null;
}

/**
 * 引用 {@link RepoUnloggedNote} 的行。外键不带 `onDelete`，事务里开着 `defer_foreign_keys`：
 * 引用还在时删被引用的行，DELETE 本身成功，违约到 COMMIT 才报。
 */
@Entity({
  name: 'RepoUnloggedNoteRef',
  tableName: 'repo_unlogged_note_ref',
  log: false,
  properties: [{ name: 'noteId', type: PropertyType.uuid, required: true }],
  foreignKeys: [{ name: 'note', properties: ['noteId'], mappedEntity: 'RepoUnloggedNote', mappedProperties: ['id'] }]
})
class RepoUnloggedNoteRef extends EntityBase {
  noteId!: string;
}

/** SqliteRepository 测试：仓库层 CRUD、查询与变更事件。 */
export function sqliteRepositorySuite(factory: AdapterFactory) {
  describe.sequential(`SqliteRepository [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    afterEach(() => vi.restoreAllMocks());

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('RxDBChange should be created', async () => {
      // 每次写入都等变更通知落地：本套件后面几条用例给 `adapter.query` 装了 spy，
      // 迟到的后台补数据查询会被算进它们头上（见 settle_change_notifications）。
      const todo = new Todo();
      todo.title = 'Fanny';
      await settle_change_notifications(adapter, () => todo.save());

      todo.title = 'Fanny2';
      await settle_change_notifications(adapter, () => todo.save());

      await settle_change_notifications(adapter, () => todo.remove());

      const result = await firstValueFrom(
        adapter.rxdb.entityManager.getRepository(RxDBChange).findAll({
          where: {
            combinator: 'and',
            rules: []
          }
        })
      );
      expect(result.length).equal(3);
    });

    it('findByRowIds should use rowId cache for live entities', async () => {
      const todo = new Todo();
      todo.title = 'rowid-cache-hit';
      await settle_change_notifications(adapter, () => todo.save());

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      const repo = adapter.createUncachedRepository(Todo, adapter);
      const querySpy = vi.spyOn(adapter, 'query');
      const result = await repo.findByRowIds([rowId!]);

      expect(querySpy).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(todo);

      querySpy.mockRestore();
    });

    it('findByRowIds should only query rowIds missing from cache', async () => {
      const todo = new Todo();
      todo.title = 'rowid-partial-hit';
      await settle_change_notifications(adapter, () => todo.save());

      const cachedRowId = adapter.getRowIdByEntity(todo);
      expect(cachedRowId).toBeDefined();

      // 构造一个不存在于缓存的 rowId，强制走部分命中分支
      const missingRowId = cachedRowId! + 1_000_000n;

      const repo = adapter.createUncachedRepository(Todo, adapter);
      const querySpy = vi.spyOn(adapter, 'query');
      const result = await repo.findByRowIds([cachedRowId!, missingRowId]);

      // 仅缺失的 rowId 回库，已命中缓存的不应进入查询参数
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][1]).toEqual([missingRowId]);

      // 命中行仍按入参顺序返回，缺失行省略
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(todo);

      querySpy.mockRestore();
    });

    it('findByRowIds should still return a removed entity kept in the rowId cache (DELETE event relies on this)', async () => {
      const todo = new Todo();
      todo.title = 'rowid-removed-still-cached';
      await settle_change_notifications(adapter, () => todo.save());

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      await settle_change_notifications(adapter, () => todo.remove());

      // 删除后：DB 行已无，但实体被标记 removed 且仍留在 rowId 缓存中
      expect(getEntityStatus(todo).removed).toBe(true);
      expect(adapter.getEntityByRowId(rowId!, Todo)).toBe(todo);

      const repo = adapter.createUncachedRepository(Todo, adapter);
      const result = await repo.findByRowIds([rowId!]);

      // 回库查不到行，但必须从缓存返回该实体，供 handle_rxdb_change 构造 DELETE 事件。
      // 若改为过滤 removed / 不信缓存，DELETE 事件将丢失实体数据。
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(todo);
    });

    it('findByRowIds should re-query a removed cache entry instead of trusting it as a live hit', async () => {
      const todo = new Todo();
      todo.title = 'rowid-removed-requery';
      await settle_change_notifications(adapter, () => todo.save());

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      await settle_change_notifications(adapter, () => todo.remove());

      const repo = adapter.createUncachedRepository(Todo, adapter);
      const querySpy = vi.spyOn(adapter, 'query');
      await repo.findByRowIds([rowId!]);

      // removed 实体不得当作 live 全命中走快路径；必须回库核对（rowid 复用时以 DB 数据为准）
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][1]).toEqual([rowId]);

      querySpy.mockRestore();
    });
  });

  // 核心在事务栈非空时把非事务事件排进本事务的队列，提交才派、回滚丢弃；本适配器在 BEGIN 之前、COMMIT 成功或失败之后
  // 各派一次事务事件，删行路径在事务里派的删除通知因此随事务走。这组用例钉住这条行为（INC-002：PGlite 曾在提交前就派了）。
  describe.sequential(`无日志实体的删除通知随事务提交（INC-002） [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;
    let removedIds: string[] = [];
    const onRemoved = (event: EntityLocalRemovedEvent): void => {
      removedIds.push(...event.entities.map(entity => String(entity.id)));
    };

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
        entities: [RepoUnloggedNote, RepoUnloggedNoteRef]
      });
      adapter.rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, onRemoved);
    });

    beforeEach(async () => {
      await cleanup_db(adapter);
      removedIds = [];
    });

    afterAll(async () => {
      if (adapter) {
        adapter.rxdb.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, onRemoved);
        await adapter.rxdb.disconnectAll();
      }
    });

    const saveNote = async (): Promise<RepoUnloggedNote> => {
      const note = new RepoUnloggedNote();
      note.title = 'note';
      await note.save();
      return note;
    };

    const countNotes = async (): Promise<number> => {
      const { rows } = await adapter.rawQuery('SELECT COUNT(*) FROM "public$repo_unlogged_note"');
      return Number(rows[0][0]);
    };

    it('显式事务里经仓库删除后回滚：行还在，一条删除通知都不发', async () => {
      const note = await saveNote();

      await expect(
        adapter.transaction(async executor => {
          await executor.getRepository(RepoUnloggedNote).remove(note);
          throw new Error('业务失败');
        })
      ).rejects.toThrow('业务失败');

      expect(await countNotes()).toBe(1);
      expect(removedIds).toEqual([]);
    });

    it('显式事务里经批量删除后回滚：同样零通知', async () => {
      const note = await saveNote();

      await expect(
        adapter.transaction(async executor => {
          await executor.removeMany([note]);
          throw new Error('业务失败');
        })
      ).rejects.toThrow('业务失败');

      expect(await countNotes()).toBe(1);
      expect(removedIds).toEqual([]);
    });

    it('COMMIT 时延迟外键违约：删除失败，零通知', async () => {
      const note = await saveNote();
      const ref = new RepoUnloggedNoteRef();
      ref.noteId = note.id;
      await ref.save();

      await expect(note.remove()).rejects.toThrow();

      expect(await countNotes()).toBe(1);
      expect(removedIds).toEqual([]);
    });

    it('正常删除：恰好一条通知', async () => {
      const note = await saveNote();

      await note.remove();

      expect(removedIds).toEqual([note.id]);
      expect(await countNotes()).toBe(0);
    });
  });
}
