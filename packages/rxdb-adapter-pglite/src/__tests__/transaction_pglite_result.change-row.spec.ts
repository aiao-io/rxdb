/**
 * `transaction_pglite_result` 对 `rxdb_change` 行的解码回归。
 *
 * @remarks
 * PGlite 侧有两条把变更行 hydrate 成 `RxDBChange` 实体的路径：仓储查询与事务结果映射。
 * 后者曾经漏掉解码，症状极不直观——它走的是 `UPDATE ... RETURNING *` 的写回，
 * 会把缓存里**已经解码好**的实体重新覆盖回原始列值，直到下一次 undo/redo 读它才炸成
 * `Cannot convert __rxdb_change_id__:{...} to a BigInt`。
 *
 * 浏览器档位曾把这个缺陷盖住：NOTIFY 驱动的变更回读恰好会在 undo 与 redo 之间再跑一次
 * 仓储查询，把被覆盖的字段修回去。桌面档位（`@aiao/rxdb-adapter-electron`）没有那次
 * 额外回读，同一批共享套件立刻转红。所以断言写在这里——**缺陷在本包**，
 * 不能只靠桌面那侧的端到端套件间接守着。
 */
import { RxDB, SyncType, encodeRxDBChangeEntityId, getEntityMetadata, RxDBChange } from '@aiao/rxdb';
import { ENTITIES } from '@aiao/rxdb-test/shop';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { transaction_pglite_result } from '../transaction_pglite_result.js';

describe('transaction_pglite_result 的 RxDBChange 解码', () => {
  let rxdb: RxDB | undefined;

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
    rxdb = undefined;
  });

  const setup = async (): Promise<RxDBAdapterPGlite> => {
    rxdb = new RxDB({
      dbName: `change-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    let adapter: RxDBAdapterPGlite | undefined;
    rxdb
      .adapter('pglite', async db => {
        adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
        return adapter;
      })
      .init();
    await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
    if (!adapter) throw new Error('pglite adapter was not created');
    return adapter;
  };

  it('把 entityId 的信封还原成原始 bigint，而不是留下编码字符串', async () => {
    const adapter = await setup();
    const rows = [
      {
        id: 1,
        namespace: 'public',
        entity: 'User',
        entityId: encodeRxDBChangeEntityId(42n),
        operation: 'update',
        patch: null,
        inversePatch: null,
        branchId: 'main',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const [change] = await transaction_pglite_result(adapter, RxDBChange, {
      rows,
      rowsAffected: rows.length,
      elapsed: 0
    });

    expect(change.entityId).toBe(42n);
  });

  it('强制更新已缓存的变更实体时不会把解码后的 entityId 覆盖回信封', async () => {
    const adapter = await setup();
    const encoded = encodeRxDBChangeEntityId(7n);
    const row = {
      id: 2,
      namespace: 'public',
      entity: 'User',
      entityId: encoded,
      operation: 'update',
      patch: null,
      inversePatch: null,
      branchId: 'main',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = { rows: [row], rowsAffected: 1, elapsed: 0 };

    // 第一次 hydrate 建缓存；第二次模拟 `UPDATE ... RETURNING *` 的写回路径。
    await transaction_pglite_result(adapter, RxDBChange, result);
    const [change] = await transaction_pglite_result(adapter, RxDBChange, result, true);

    expect(change.entityId).toBe(7n);
    expect(adapter.rxdb.entityManager.getEntityRef(RxDBChange, 2)?.entityId).toBe(7n);
  });

  it('非 RxDBChange 的实体不进解码路径', async () => {
    const adapter = await setup();
    const metadata = getEntityMetadata(RxDBChange);
    expect(metadata.name).toBe('RxDBChange');

    // `entityId` 在业务实体上只是一个普通字符串列名，不该被当成变更信封解析。
    const rows = [{ id: 'user-1', name: 'Ada', entityId: '__rxdb_change_id__:not-json' }];
    const [user] = await transaction_pglite_result(adapter, ENTITIES[0], {
      rows,
      rowsAffected: 1,
      elapsed: 0
    });

    expect(user).toBeDefined();
  });
});
