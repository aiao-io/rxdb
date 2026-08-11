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

    const adapter = {
      rxdb: {
        entityManager: { cleanAllCache },
        config: { entities: [] }
      },
      query,
      internalQuery
    } as unknown as RxDBAdapterPGlite;

    await expect(cleanup_db(adapter)).resolves.toBeUndefined();
    expect(cleanAllCache).toHaveBeenCalled();
    expect(internalQuery).toHaveBeenCalled();
    // 空表：不执行 TRUNCATE。
    expect(query.mock.calls.some(([sql]) => String(sql).includes('TRUNCATE'))).toBe(false);
    // 仍会重新写入 main 分支。
    expect(query.mock.calls.some(([sql]) => String(sql).includes('rxdb_branch'))).toBe(true);
  });

  it('cloneEntityClasses handles classes without ɵMetadata', () => {
    class Plain {}
    const [Clone] = cloneEntityClasses([Plain as unknown as EntityType]);
    expect(Clone).not.toBe(Plain);
    expect(new Clone()).toBeInstanceOf(Object);
  });
});
