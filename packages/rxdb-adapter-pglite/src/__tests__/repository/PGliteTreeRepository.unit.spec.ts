import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';
import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import { PGliteTreeRepository } from '../../repository/PGliteTreeRepository.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

const makeRepo = () => {
  const rxdb = new RxDB({
    dbName: `tree-repo-${Date.now()}-${Math.random()}`,
    entities: [MenuLarge],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  // 树实体的 `TreeRepository` 由 `@aiao/rxdb-plugin-tree` 注册，不装插件 `init()` 直接抛。
  rxdb.use(rxDBPluginTree);
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  const query = vi.fn();
  const adapter = { query, rxdb, encryptionContext: undefined } as unknown as RxDBAdapterPGlite;
  return new PGliteTreeRepository(adapter, MenuLarge);
};

describe('PGliteTreeRepository unit edges', () => {
  it('countAncestors 只接受显式 count 列中的安全整数', async () => {
    const repo = makeRepo();
    const query = (repo as unknown as { adapter: { query: ReturnType<typeof vi.fn> } }).adapter.query;
    query
      .mockResolvedValueOnce({ rows: [{ count: '3' }], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [{ '?column?': '2' }], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [{}], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 'nope' }], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '9007199254740992' }], fields: [], affectedRows: 1 });

    await expect(repo.countAncestors({ entityId: 'x', level: 2 } as never)).resolves.toBe(3);
    await expect(repo.countAncestors({ entityId: 'x', level: 2 } as never)).rejects.toBeInstanceOf(
      RxdbAdapterPGliteError
    );
    await expect(repo.countAncestors({ entityId: 'x', level: 2 } as never)).rejects.toMatchObject({
      code: 'invalid_count_result'
    });
    await expect(repo.countAncestors({ entityId: 'x', level: 2 } as never)).rejects.toMatchObject({
      code: 'invalid_count_result'
    });
    await expect(repo.countAncestors({ entityId: 'x', level: 2 } as never)).rejects.toMatchObject({
      code: 'invalid_count_result'
    });
  });

  it('countDescendants 拒绝负数结果与缺行（RV-079：树计数契约非负，-1 不再合法）', async () => {
    const repo = makeRepo();
    const query = (repo as unknown as { adapter: { query: ReturnType<typeof vi.fn> } }).adapter.query;
    query
      .mockResolvedValueOnce({ rows: [{ count: '9' }], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '-1' }], fields: [], affectedRows: 1 })
      .mockResolvedValueOnce({ rows: [], fields: [], affectedRows: 0 });

    await expect(repo.countDescendants({ entityId: 'y', level: 1 } as never)).resolves.toBe(9);
    // SQL 侧已用 GREATEST 钳在 0，这里的 -1 只会在契约被破坏时出现——必须拒绝，不能当合法值放行。
    await expect(repo.countDescendants({ entityId: 'y', level: 1 } as never)).rejects.toMatchObject({
      code: 'invalid_count_result'
    });
    await expect(repo.countDescendants({ entityId: 'y', level: 1 } as never)).rejects.toMatchObject({
      code: 'invalid_count_result'
    });
  });
});
