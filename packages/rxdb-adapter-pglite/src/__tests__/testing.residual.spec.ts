import type { EntityType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db, cloneEntityClasses } from '../testing.js';

describe('testing residual branches', () => {
  it('cleanup_db skips empty trigger sql and empty table truncate', async () => {
    const cleanAllCache = vi.fn();
    // 声明形参是为了让 mock.calls 带上 sql 元素类型，供下方断言解构
    const query = vi.fn(async (...args: unknown[]) => {
      void args;
      return { rows: [], fields: [], affectedRows: 0 };
    });
    const internalQuery = vi.fn(async () => ({ rows: [], fields: [], affectedRows: 0 }));
    const saveMany = vi.fn(async (rows: { id: string }[]) => rows);
    const transaction = vi.fn(async (fun: (executor: unknown) => Promise<unknown>, transactionLog?: boolean) => {
      void transactionLog;
      return fun({ saveMany });
    });

    const adapter = {
      rxdb: {
        // `instantiate` 返回裸对象：真实实体类的构造器带 `need init rxdb` 门禁，
        // 而初始行工厂只往返回值上赋字段，不依赖实体行为。
        entityManager: { cleanAllCache, instantiate: () => ({}) },
        config: { entities: [] }
      },
      query,
      internalQuery,
      transaction
    } as unknown as RxDBAdapterPGlite;

    await expect(cleanup_db(adapter)).resolves.toBeUndefined();
    expect(cleanAllCache).toHaveBeenCalled();
    expect(internalQuery).toHaveBeenCalled();
    // 空表：不执行 TRUNCATE。
    expect(query.mock.calls.some(([sql]) => String(sql).includes('TRUNCATE'))).toBe(false);
    // 仍会重新写入 main 分支。
    expect(query.mock.calls.some(([sql]) => String(sql).includes('rxdb_branch'))).toBe(true);
    // 建库初始行同样要补回来：只补 `rxdb_branch` 的库是新库不可能出现的形态，
    // 下一次 `createBranch()` 会在分支代际发放那一步读不到激活态行。
    expect(saveMany).toHaveBeenCalledTimes(1);
    expect(saveMany.mock.calls[0][0].map(row => row.id)).toContain('default');
    // 清理不进变更日志。
    expect(transaction.mock.calls[0][1]).toBe(false);
  });

  it('cloneEntityClasses handles classes without ɵMetadata', () => {
    class Plain {}
    const [Clone] = cloneEntityClasses([Plain as unknown as EntityType]);
    expect(Clone).not.toBe(Plain);
    expect(new Clone()).toBeInstanceOf(Object);
  });
});
