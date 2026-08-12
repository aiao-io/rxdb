import { getEntityStatus, type UUID } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase, SqliteSuccessResult } from '../index.js';
import { remove_entity_ids_from_cache, transaction_sqlite_result, update_entity_from_sqlite_result } from '../index.js';
import type { AdapterFactory } from './adapter-factory.js';

const TODO_ID_1: UUID = '00000000-0000-0000-0000-000000000001';
const TODO_ID_2: UUID = '00000000-0000-0000-0000-000000000002';
const MISSING_TODO_ID: UUID = '00000000-0000-0000-0000-000000000099';

/** transaction_sqlite_result 测试：事务结果的实体更新与缓存移除。 */
export function transactionSqliteResultSuite(factory: AdapterFactory) {
  describe(`transaction_sqlite_result [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('transaction_sqlite_result', () => {
      it('应该从 SQLite 结果创建新实体', async () => {
        const result: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[TODO_ID_1, 'Test Todo', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, result);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe(TODO_ID_1);
        expect(entities[0].title).toBe('Test Todo');
        const state = getEntityStatus(entities[0]);
        expect(state.local).toBe(true);
        expect(state.modified).toBe(false);
      });

      it('应该处理多行结果', async () => {
        const result: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [
                [TODO_ID_1, 'First Todo', 0],
                [TODO_ID_2, 'Second Todo', 1]
              ]
            }
          ],
          rowsAffected: 2,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, result);

        expect(entities).toHaveLength(2);
        expect(entities[0].id).toBe(TODO_ID_1);
        expect(entities[1].id).toBe(TODO_ID_2);
      });

      it('应该重用已存在的实体引用', async () => {
        const firstResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[TODO_ID_1, 'Test Todo', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const firstEntities = await transaction_sqlite_result(adapter, Todo, firstResult);
        const firstEntity = firstEntities[0];

        const secondResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[TODO_ID_1, 'Test Todo', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const secondEntities = await transaction_sqlite_result(adapter, Todo, secondResult);
        const secondEntity = secondEntities[0];

        expect(firstEntity).toBe(secondEntity);
      });

      it('当 forcedUpdate=true 时应该更新已存在的实体', async () => {
        const uniqueId = 'todo-forced-update-' + Date.now();
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };
        const createdEntities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = createdEntities[0];
        expect(entity.title).toBe('Original Title');

        const firstResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const firstEntities = await transaction_sqlite_result(adapter, Todo, firstResult);
        expect(firstEntities[0]).toBe(entity);

        const secondResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Updated Title', 1]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        await transaction_sqlite_result(adapter, Todo, secondResult, true);

        expect(entity.title).toBe('Updated Title');
        expect(entity.completed).toBe(true);
      });

      it('当 forcedUpdate=false 时不应该更新已存在的实体', async () => {
        const uniqueId = 'todo-no-forced-update-' + Date.now();
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };
        const createdEntities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = createdEntities[0];
        expect(entity.title).toBe('Original Title');

        const firstResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const firstEntities = await transaction_sqlite_result(adapter, Todo, firstResult);
        expect(firstEntities[0]).toBe(entity);

        const secondResult: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Updated Title', 1]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        await transaction_sqlite_result(adapter, Todo, secondResult, false);

        expect(entity.title).toBe('Original Title');
        expect(entity.completed).toBe(false);
      });

      it('应该缓存带有 rowId 的实体', async () => {
        const result: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos',
          results: [
            {
              columns: ['id', 'title', '__rowid'],
              rows: [[TODO_ID_1, 'Test Todo', 12345]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, result);
        expect(entities).toHaveLength(1);

        const cachedEntity = adapter.getEntityByRowId(BigInt(12345), Todo);
        expect(cachedEntity).toBeDefined();
        expect(cachedEntity?.id).toBe(TODO_ID_1);
      });

      it('应该处理空结果', async () => {
        const result: SqliteSuccessResult = {
          sql: 'SELECT * FROM todos WHERE id = ?',
          results: [
            {
              columns: ['id', 'title'],
              rows: []
            }
          ],
          rowsAffected: 0,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, result);
        expect(entities).toHaveLength(0);
      });
    });

    describe('update_entity_from_sqlite_result', () => {
      it('应该更新已存在的实体', async () => {
        const uniqueId = 'todo-update-test-' + Date.now();
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = entities[0];
        expect(entity.title).toBe('Original Title');

        const updateResult: SqliteSuccessResult = {
          sql: 'UPDATE todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Updated Title', 1]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        await update_entity_from_sqlite_result(adapter, Todo, updateResult);

        expect(entity.title).toBe('Updated Title');
        expect(entity.completed).toBe(true);
        const state = getEntityStatus(entity);
        expect(state.local).toBe(true);
        expect(state.modified).toBe(false);
      });

      it('不应该创建新实体', async () => {
        const updateResult: SqliteSuccessResult = {
          sql: 'UPDATE todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[MISSING_TODO_ID, 'New Title', 1]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        await update_entity_from_sqlite_result(adapter, Todo, updateResult);

        const hasEntity = adapter.rxdb.entityManager.hasEntityRef(Todo, MISSING_TODO_ID);
        expect(hasEntity).toBe(false);
      });

      it('应该更新实体的 origin 状态', async () => {
        const uniqueId = 'todo-origin-test-' + Date.now();
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'Original Title', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = entities[0];

        const updateResult: SqliteSuccessResult = {
          sql: 'UPDATE todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[uniqueId, 'New Title', 1]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        await update_entity_from_sqlite_result(adapter, Todo, updateResult);

        const state = getEntityStatus(entity);
        expect(state.origin?.title).toBe('New Title');
        expect(state.origin?.completed).toBe(true);
      });

      it('应该处理空结果', async () => {
        const result: SqliteSuccessResult = {
          sql: 'UPDATE todos WHERE id = ?',
          results: [
            {
              columns: ['id', 'title'],
              rows: []
            }
          ],
          rowsAffected: 0,
          elapsed: 10
        };

        await expect(update_entity_from_sqlite_result(adapter, Todo, result)).resolves.not.toThrow();
      });
    });

    describe('remove_entity_ids_from_cache', () => {
      it('应该将实体标记为已删除', async () => {
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[TODO_ID_1, 'Test Todo', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = entities[0];
        let state = getEntityStatus(entity);
        expect(state.local).toBe(true);
        expect(state.removed).toBe(false);

        remove_entity_ids_from_cache(adapter, Todo, [TODO_ID_1]);

        state = getEntityStatus(entity);
        expect(state.local).toBe(false);
        expect(state.removed).toBe(true);
        expect(state.modified).toBe(false);
      });

      it('应该处理多个实体 ID', async () => {
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [
                [TODO_ID_1, 'First Todo', 0],
                [TODO_ID_2, 'Second Todo', 0]
              ]
            }
          ],
          rowsAffected: 2,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, createResult);

        remove_entity_ids_from_cache(adapter, Todo, [TODO_ID_1, TODO_ID_2]);

        entities.forEach(entity => {
          const state = getEntityStatus(entity);
          expect(state.removed).toBe(true);
          expect(state.local).toBe(false);
        });
      });

      it('不应该抛出错误当实体不存在时', async () => {
        expect(() => remove_entity_ids_from_cache(adapter, Todo, [MISSING_TODO_ID])).not.toThrow();
      });

      it('应该处理空 ID 数组', async () => {
        expect(() => remove_entity_ids_from_cache(adapter, Todo, [])).not.toThrow();
      });

      it('只应该标记存在的实体', async () => {
        const createResult: SqliteSuccessResult = {
          sql: 'INSERT INTO todos',
          results: [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[TODO_ID_1, 'Test Todo', 0]]
            }
          ],
          rowsAffected: 1,
          elapsed: 10
        };

        const entities = await transaction_sqlite_result(adapter, Todo, createResult);
        const entity = entities[0];

        remove_entity_ids_from_cache(adapter, Todo, [TODO_ID_1, MISSING_TODO_ID]);

        const state = getEntityStatus(entity);
        expect(state.removed).toBe(true);

        const hasNonexistent = adapter.rxdb.entityManager.hasEntityRef(Todo, MISSING_TODO_ID);
        expect(hasNonexistent).toBe(false);
      });
    });
  });
}
