import { getEntityStatus, RxDBChange } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

export function sqliteRepositorySuite(factory: AdapterFactory) {
  describe.sequential(`SqliteRepository [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('RxDBChange should be created', async () => {
      const todo = new Todo();
      todo.title = 'Fanny';
      await todo.save();

      todo.title = 'Fanny2';
      await todo.save();

      await todo.remove();

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
      await todo.save();

      await adapter.query('SELECT 1');

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      const repo = adapter.getRepository(Todo);
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
      await todo.save();

      await adapter.query('SELECT 1');

      const cachedRowId = adapter.getRowIdByEntity(todo);
      expect(cachedRowId).toBeDefined();

      // 构造一个不存在于缓存的 rowId，强制走部分命中分支
      const missingRowId = cachedRowId! + 1_000_000n;

      const repo = adapter.getRepository(Todo);
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
      await todo.save();

      await adapter.query('SELECT 1');

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      await todo.remove();

      // 删除后：DB 行已无，但实体被标记 removed 且仍留在 rowId 缓存中
      expect(getEntityStatus(todo).removed).toBe(true);
      expect(adapter.getEntityByRowId(rowId!, Todo)).toBe(todo);

      const repo = adapter.getRepository(Todo);
      const result = await repo.findByRowIds([rowId!]);

      // 回库查不到行，但必须从缓存返回该实体，供 handle_rxdb_change 构造 DELETE 事件。
      // 若改为过滤 removed / 不信缓存，DELETE 事件将丢失实体数据。
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(todo);
    });

    it('findByRowIds should re-query a removed cache entry instead of trusting it as a live hit', async () => {
      const todo = new Todo();
      todo.title = 'rowid-removed-requery';
      await todo.save();

      await adapter.query('SELECT 1');

      const rowId = adapter.getRowIdByEntity(todo);
      expect(rowId).toBeDefined();

      await todo.remove();

      const repo = adapter.getRepository(Todo);
      const querySpy = vi.spyOn(adapter, 'query');
      await repo.findByRowIds([rowId!]);

      // removed 实体不得当作 live 全命中走快路径；必须回库核对（rowid 复用时以 DB 数据为准）
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][1]).toEqual([rowId]);

      querySpy.mockRestore();
    });
  });
}
