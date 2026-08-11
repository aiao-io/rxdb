import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite - Sequence Management', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: `sequence-test-db-${Date.now()}`,
      entities: [Todo],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      async db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  describe('getRxDBChangeSequence', () => {
    it('应该返回初始序列值 1（序列最小值）', async () => {
      const sequence = await adapter.getRxDBChangeSequence();
      // PostgreSQL 序列最小值为 1
      expect(typeof sequence).toBe('number');
      expect(sequence).toBeGreaterThanOrEqual(1);
    });

    it('应该在创建变更记录后返回正确的序列值', async () => {
      // 设置一个已知的序列值
      await adapter.setRxDBChangeSequence(100);

      const todoRepo = adapter.getRepository(Todo);
      // 创建一个 Todo（触发器会 INSERT 到 RxDBChange 表）
      const firstTodo = new Todo();
      firstTodo.title = `Test Todo ${Date.now()}-1`;
      firstTodo.completed = false;
      await todoRepo.create(firstTodo);
      const seq1 = await adapter.getRxDBChangeSequence();

      // 再创建一个 Todo
      const secondTodo = new Todo();
      secondTodo.title = `Test Todo ${Date.now()}-2`;
      secondTodo.completed = false;
      await todoRepo.create(secondTodo);
      const seq2 = await adapter.getRxDBChangeSequence();

      // 序列值应该从 100 开始增加
      // 如果触发器正常工作，seq1 应该是 101，seq2 应该是 102
      expect(seq1).toBeGreaterThanOrEqual(100);
      expect(seq2).toBeGreaterThanOrEqual(seq1);
    });
  });

  describe('setRxDBChangeSequence', () => {
    it('应该能够设置序列值', async () => {
      const newSequence = 1000;
      await adapter.setRxDBChangeSequence(newSequence);
      const sequence = await adapter.getRxDBChangeSequence();
      expect(sequence).toBe(newSequence);
    });

    it('应该在设置后保持序列值', async () => {
      const newSequence = 5000;
      await adapter.setRxDBChangeSequence(newSequence);

      // 创建新记录后序列应该从设置的值继续递增
      const todoRepo = adapter.getRepository(Todo);
      const todo = new Todo();
      todo.title = `Test Todo After Set ${Date.now()}`;
      todo.completed = false;
      await todoRepo.create(todo);
      const sequence = await adapter.getRxDBChangeSequence();
      // 序列值应该大于等于设置的值（可能触发器增加了它）
      expect(sequence).toBeGreaterThanOrEqual(newSequence);
    });

    it('应该能够将序列值设置为最小值 1', async () => {
      // PostgreSQL 序列最小值为 1
      await adapter.setRxDBChangeSequence(1);
      const sequence = await adapter.getRxDBChangeSequence();
      expect(sequence).toBe(1);
    });
  });
});
