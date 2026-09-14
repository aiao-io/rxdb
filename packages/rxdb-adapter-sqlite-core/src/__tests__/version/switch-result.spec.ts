import {
  getEntityMetadata,
  getRxDBChangeKey,
  PropertyType,
  type SwitchVersionActions,
  transitionMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../../sqlite-core.interface.js';
import { convertSwitchResultToSql } from '../../version/switch-result.utils.js';
import { Todo } from '../fixtures/Todo.js';

interface ExpectedStatement {
  sql: string;
  params: SQLiteCompatibleType[];
}

interface StructuredItem {
  statements?: ExpectedStatement[];
  selectStatements?: ExpectedStatement[];
}

const change = (patch: Record<string, unknown> | null) => ({ patch, inversePatch: null });

const createAdapter = (metadata = getEntityMetadata(Todo)): RxDBAdapterSqliteBase => {
  return {
    rxdb: {
      context: { userId: 'review-user' },
      schemaManager: {
        getEntityMetadata: (name: string, namespace: string) =>
          name === metadata.name && namespace === metadata.namespace ? metadata : undefined
      }
    },
    encryptionContext: { keyring: null, namespace: 'switch-review' }
  } as unknown as RxDBAdapterSqliteBase;
};

describe('convertSwitchResultToSql structured statements', () => {
  it('保留占位符和参数，且按 SQLite 999 bind limit 分块', async () => {
    const deletes = new Map<string, ReturnType<typeof change>>();
    const updates = new Map<string, ReturnType<typeof change>>();
    for (let index = 0; index < 1000; index++) {
      const id = `todo-${index}`;
      deletes.set(`public:Todo:${id}`, change(null));
      updates.set(`public:Todo:${id}`, change({ title: index === 0 ? 'next?' : `next-${index}` }));
    }

    const actions: SwitchVersionActions = {
      deletes,
      inserts: new Map([['public:Todo:insert-question', change({ title: 'what?' })]]),
      updates
    };

    const result = await convertSwitchResultToSql(createAdapter(), actions);
    const deleteItem = result.deletes[0] as (typeof result.deletes)[number] & StructuredItem;
    const insertItem = result.inserts[0] as (typeof result.inserts)[number] & StructuredItem;
    const updateItem = result.updates[0] as (typeof result.updates)[number] & StructuredItem;

    expect(deleteItem.statements).toHaveLength(2);
    expect(deleteItem.statements?.map(statement => statement.params.length)).toEqual([999, 1]);
    expect(deleteItem.statements?.every(statement => statement.sql.includes('?'))).toBe(true);

    expect(insertItem.statements).toHaveLength(1);
    expect(insertItem.statements?.[0]?.sql).toContain('?');
    expect(insertItem.statements?.[0]?.sql).not.toContain('what?');
    expect(insertItem.statements?.[0]?.params).toContain('what?');

    expect(updateItem.statements).toHaveLength(1000);
    expect(updateItem.statements?.[0]?.sql).toContain('?');
    expect(updateItem.statements?.[0]?.sql).not.toContain('next?');
    expect(updateItem.statements?.[0]?.params).toContain('next?');
    expect(updateItem.selectStatements).toHaveLength(2);
    expect(updateItem.selectStatements?.map(statement => statement.params.length)).toEqual([999, 1]);
  });

  it('typed change key 保持 bigint id 进入参数与 change map', async () => {
    const metadata = transitionMetadata({
      name: 'SwitchBigInt',
      properties: [
        { name: 'id', type: PropertyType.bigint, primary: true },
        { name: 'title', type: PropertyType.string }
      ]
    });
    const entityId = 9_007_199_254_740_993n;
    const key = getRxDBChangeKey({ namespace: 'public', entity: 'SwitchBigInt', entityId } as never);
    const result = await convertSwitchResultToSql(createAdapter(metadata), {
      deletes: new Map([[key, change(null)]]),
      inserts: new Map(),
      updates: new Map()
    });

    expect(result.deletes[0].ids).toEqual(new Set([entityId]));
    expect(result.deletes[0].statements[0].params).toEqual([entityId]);
    expect(result.deletes[0].changes.has(entityId)).toBe(true);
  });

  it('switch/merge 的 UPDATE 不把 context.userId 盖成 updatedBy', async () => {
    const result = await convertSwitchResultToSql(createAdapter(), {
      deletes: new Map(),
      inserts: new Map(),
      updates: new Map([['public:Todo:todo-1', change({ title: '撤销后' })]])
    });

    // 工作树在这条 SQL 生成之前就把调用方给的 patch 记下了。适配器此刻再从 rxdb.context
    // 盖一列 updatedBy 上去，业务行就多出一列捕获侧永远看不见的净变化 —— updatedBy 是
    // tracked 列（不在 UNTRACKED_BOOKKEEPING_FIELDS 里），冷重放必然当场对不上。
    // 同文件的 INSERT 分支也不展开 context，PGlite 的同名文件同样不展开。
    const statement = result.updates[0].statements[0];
    expect(statement.sql).not.toContain('updatedBy');
    expect(statement.params).not.toContain('review-user');
  });

  it('列集只剩 readonly 簿记列的那一行被跳过，同组里能写的那一行照常生成', async () => {
    const result = await convertSwitchResultToSql(createAdapter(), {
      deletes: new Map(),
      inserts: new Map(),
      updates: new Map([
        ['public:Todo:todo-1', change({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })],
        ['public:Todo:todo-2', change({ title: '还有一列能写' })]
      ])
    });

    // 跳过的那一行也不进 ids：它没被写过，就不该被 SELECT 回来当成「更新过」再发事件。
    expect(result.updates[0].statements).toHaveLength(1);
    expect(result.updates[0].statements[0].params).toContain('还有一列能写');
    expect(result.updates[0].ids).toEqual(new Set(['todo-2']));
  });

  it('一组更新的列集全落在簿记列上时，这一组整个不进结果', async () => {
    const result = await convertSwitchResultToSql(createAdapter(), {
      deletes: new Map(),
      inserts: new Map(),
      updates: new Map([['public:Todo:todo-1', change({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })]])
    });

    expect(result.updates).toHaveLength(0);
  });
});
