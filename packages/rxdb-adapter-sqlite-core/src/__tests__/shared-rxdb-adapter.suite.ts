import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

export function rxdbAdapterSuite(factory: AdapterFactory) {
  describe(`RxDB SQLite 适配器 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('adapter.version() 能返回数据库版本', async () => {
      const version = await adapter.version();
      expect(version).toBeTypeOf('string');
      expect(version.split('.').length).toBe(3);
    });

    it('getRxDBChangeSequence() 应该返回当前最大的 sequence 值', async () => {
      const todo = new Todo();
      todo.title = 'test todo';
      await todo.save();
      const seq = await adapter.getRxDBChangeSequence();
      expect(seq).toBe(1);
      await adapter.setRxDBChangeSequence(1000);
      const seq2 = await adapter.getRxDBChangeSequence();
      expect(seq2).toBe(1000);
    });

    it('removeCacheEntity() 应该能安全处理不在缓存中的实体', () => {
      const todo = new Todo();
      todo.title = 'not cached entity';
      expect(() => {
        adapter.removeCacheEntity(todo);
      }).not.toThrow();
    });

    it('saveMany() 应该能处理空数组', async () => {
      const result = await adapter.saveMany([]);
      expect(result).toEqual([]);
    });

    it('saveMany() 应该能在事务中处理单个实体', async () => {
      const todo = new Todo();
      todo.title = 'single entity in transaction';

      // C2：事务体内的写必须经 executor —— 裸 adapter.saveMany() 是外部调用，
      // 会重新排队并排在本事务之后（在事务体内 await 它即挂起）
      await adapter.transaction(async executor => {
        const result = await executor.saveMany([todo]);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('single entity in transaction');
      });
    });

    it('removeMany() 应该能处理空数组', async () => {
      const result = await adapter.removeMany([]);
      expect(result).toEqual([]);
    });

    it('removeMany() 应该能在事务中处理单个实体', async () => {
      const todo = new Todo();
      todo.title = 'to be removed in transaction';
      await todo.save();

      await adapter.transaction(async executor => {
        const result = await executor.removeMany([todo]);
        expect(result).toHaveLength(1);
      });
    });

    it('transaction() 应该在发生错误时回滚并抛出 RxDBAdapterSqliteError', async () => {
      const initialCount = await adapter.getRepository(Todo).count({ where: { combinator: 'and', rules: [] } });

      try {
        await adapter.transaction(async executor => {
          const todo = new Todo();
          todo.title = 'should be rolled back';
          // C2：事务体内的读写一律经 executor。裸 `todo.save()` 与
          // `adapter.getRepository(...)` 都是外部调用，会排在本事务之后。
          await executor.saveMany([todo]);

          const countInTransaction = await executor
            .getRepository(Todo)
            .count({ where: { combinator: 'and', rules: [] } });
          expect(countInTransaction).toBe(initialCount + 1);

          throw new Error('Intentional error for rollback test');
        });

        expect.fail('Transaction should have thrown an error');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw error;
        expect(error.message).toContain('Intentional error');

        const finalCount = await adapter.getRepository(Todo).count({ where: { combinator: 'and', rules: [] } });
        expect(finalCount).toBe(initialCount);
      }
    });

    it('并发 transaction() 应串行执行而非抛“事务内开事务”', async () => {
      const where = { combinator: 'and' as const, rules: [] };
      const before = await adapter.getRepository(Todo).count({ where });

      const makeTx = (title: string) =>
        adapter.transaction(async executor => {
          const todo = new Todo();
          todo.title = title;
          // C2：`todo.save()` 走 entityManager → adapter.mutations()，那是外部调用；
          // 事务体内必须经 executor
          await executor.saveMany([todo]);
        });

      await expect(Promise.all([makeTx('concurrent-tx-A'), makeTx('concurrent-tx-B')])).resolves.toBeDefined();

      const after = await adapter.getRepository(Todo).count({ where });
      expect(after).toBe(before + 2);
    });

    it('并发 saveMany() 不应死锁且全部落库', async () => {
      const where = { combinator: 'and' as const, rules: [] };
      const before = await adapter.getRepository(Todo).count({ where });

      const makeTodo = (title: string) => {
        const todo = new Todo();
        todo.title = title;
        return todo;
      };

      await Promise.all([
        adapter.saveMany([makeTodo('concurrent-save-1')]),
        adapter.saveMany([makeTodo('concurrent-save-2')]),
        adapter.saveMany([makeTodo('concurrent-save-3')])
      ]);

      const after = await adapter.getRepository(Todo).count({ where });
      expect(after).toBe(before + 3);
    });
  });
}
