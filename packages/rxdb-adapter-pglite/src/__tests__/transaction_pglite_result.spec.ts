/**
 * T070: transaction_pglite_result 单元测试
 *
 * 测试 PGlite 查询结果处理工具函数：
 * 1. await transaction_pglite_result() - 创建或重用实体
 * 2. remove_entity_ids_from_cache() - 标记实体已删除
 *
 * 参考：packages/rxdb-adapter-wa-sqlite/src/__tests__/transaction_sqlite_result.spec.ts
 */

import { RxDB, SyncType, getEntityStatus } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  PGliteExecuteResult,
  remove_entity_ids_from_cache,
  transaction_pglite_result
} from '../transaction_pglite_result.js';
describe('transaction_pglite_result', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: 'transaction-pglite-test-db',
      entities: [Todo],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });
    db.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  describe('transaction_pglite_result', () => {
    it('应该从 PGlite 结果创建新实体', async () => {
      const result: PGliteExecuteResult = {
        rows: [{ id: 'todo-1', title: 'Test Todo', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, result);

      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('todo-1');
      expect(entities[0].title).toBe('Test Todo');
      const state = getEntityStatus(entities[0]);
      expect(state.local).toBe(true);
      expect(state.modified).toBe(false);
    });

    it('应该处理多行结果', async () => {
      const result: PGliteExecuteResult = {
        rows: [
          { id: 'todo-multi-1', title: 'First Todo', completed: false },
          { id: 'todo-multi-2', title: 'Second Todo', completed: true }
        ],
        rowsAffected: 2,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, result);

      expect(entities).toHaveLength(2);
      expect(entities[0].id).toBe('todo-multi-1');
      expect(entities[1].id).toBe('todo-multi-2');
    });

    it('应该重用已存在的实体引用', async () => {
      // 首次创建实体
      const firstResult: PGliteExecuteResult = {
        rows: [{ id: 'todo-reuse-1', title: 'Test Todo', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };

      const firstEntities = await transaction_pglite_result(adapter, Todo, firstResult);
      const firstEntity = firstEntities[0];

      // 再次查询相同 ID
      const secondResult: PGliteExecuteResult = {
        rows: [{ id: 'todo-reuse-1', title: 'Test Todo', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };

      const secondEntities = await transaction_pglite_result(adapter, Todo, secondResult);
      const secondEntity = secondEntities[0];

      // 应该返回同一个实例
      expect(firstEntity).toBe(secondEntity);
    });

    it('当 forcedUpdate=true 时应该更新已存在的实体', async () => {
      // 先创建实体，使用唯一 ID 避免缓存冲突
      const uniqueId = 'todo-forced-update-' + Date.now();
      const createResult: PGliteExecuteResult = {
        rows: [{ id: uniqueId, title: 'Original Title', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };
      const createdEntities = await transaction_pglite_result(adapter, Todo, createResult);
      const entity = createdEntities[0];
      expect(entity.title).toBe('Original Title');

      // 再次查询，使用 forcedUpdate 更新
      const secondResult: PGliteExecuteResult = {
        rows: [{ id: uniqueId, title: 'Updated Title', completed: true, payload: new Uint8Array([1, 2]) }],
        rowsAffected: 1,
        elapsed: 10
      };

      await transaction_pglite_result(adapter, Todo, secondResult, true);

      // 实体应该已更新
      expect(entity.title).toBe('Updated Title');
      expect(entity.completed).toBe(true);
      const entityPayload = (entity as unknown as { payload: Uint8Array }).payload;
      const originPayload = (getEntityStatus(entity).origin as unknown as { payload: Uint8Array }).payload;
      expect(originPayload).not.toBe(entityPayload);
      entityPayload[0] = 9;
      expect(originPayload).toEqual(new Uint8Array([1, 2]));
    });

    it('当 forcedUpdate=false 时不应该更新已存在的实体', async () => {
      // 先创建实体，使用唯一 ID 避免缓存冲突
      const uniqueId = 'todo-no-forced-update-' + Date.now();
      const createResult: PGliteExecuteResult = {
        rows: [{ id: uniqueId, title: 'Original Title', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };
      const createdEntities = await transaction_pglite_result(adapter, Todo, createResult);
      const entity = createdEntities[0];
      expect(entity.title).toBe('Original Title');

      // 再次查询，不使用 forcedUpdate
      const secondResult: PGliteExecuteResult = {
        rows: [{ id: uniqueId, title: 'Updated Title', completed: true }],
        rowsAffected: 1,
        elapsed: 10
      };

      await transaction_pglite_result(adapter, Todo, secondResult, false);

      // 实体应该保持原值
      expect(entity.title).toBe('Original Title');
      expect(entity.completed).toBe(false);
    });

    it('应该处理空结果', async () => {
      const result: PGliteExecuteResult = {
        rows: [],
        rowsAffected: 0,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, result);
      expect(entities).toHaveLength(0);
    });
  });

  describe('remove_entity_ids_from_cache', () => {
    it('应该将实体标记为已删除', async () => {
      const id = crypto.randomUUID();
      // 创建实体
      const createResult: PGliteExecuteResult = {
        rows: [{ id, title: 'Test Todo', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, createResult);
      const entity = entities[0];
      let state = getEntityStatus(entity);
      expect(state.local).toBe(true);
      expect(state.removed).toBe(false);

      // 删除实体
      remove_entity_ids_from_cache(adapter, Todo, [id]);

      state = getEntityStatus(entity);
      expect(state.local).toBe(false);
      expect(state.removed).toBe(true);
      expect(state.modified).toBe(false);
    });

    it('应该处理多个实体 ID', async () => {
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      // 创建多个实体
      const createResult: PGliteExecuteResult = {
        rows: [
          { id: firstId, title: 'First Todo', completed: false },
          { id: secondId, title: 'Second Todo', completed: false }
        ],
        rowsAffected: 2,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, createResult);

      // 删除两个实体
      remove_entity_ids_from_cache(adapter, Todo, [firstId, secondId]);

      entities.forEach(entity => {
        const state = getEntityStatus(entity);
        expect(state.removed).toBe(true);
        expect(state.local).toBe(false);
      });
    });

    it('不应该抛出错误当实体不存在时', async () => {
      // 删除不存在的实体
      expect(() => remove_entity_ids_from_cache(adapter, Todo, [crypto.randomUUID()])).not.toThrow();
    });

    it('应该处理空 ID 数组', async () => {
      expect(() => remove_entity_ids_from_cache(adapter, Todo, [])).not.toThrow();
    });

    it('只应该标记存在的实体', async () => {
      const id = crypto.randomUUID();
      const missingId = crypto.randomUUID();
      // 创建一个实体
      const createResult: PGliteExecuteResult = {
        rows: [{ id, title: 'Test Todo', completed: false }],
        rowsAffected: 1,
        elapsed: 10
      };

      const entities = await transaction_pglite_result(adapter, Todo, createResult);
      const entity = entities[0];

      // 尝试删除存在和不存在的实体
      remove_entity_ids_from_cache(adapter, Todo, [id, missingId]);

      const state = getEntityStatus(entity);
      expect(state.removed).toBe(true);

      // 不存在的实体不应该被创建
      const hasNonexistent = adapter.rxdb.entityManager.hasEntityRef(Todo, missingId);
      expect(hasNonexistent).toBe(false);
    });
  });
});
