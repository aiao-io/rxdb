import { getEntityMetadata, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { PGliteExecuteResult, transaction_pglite_result } from '../transaction_pglite_result.js';

describe('transaction_pglite_result residual computed/forcedUpdate', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: `transaction-pglite-residual-${Date.now()}`,
      entities: [MenuLarge],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter('pglite', async d => new RxDBAdapterPGlite(d, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  it('updates computed properties even when forcedUpdate is false', async () => {
    const meta = getEntityMetadata(MenuLarge);
    expect(meta.computedPropertyMap?.size ?? 0).toBeGreaterThan(0);

    const id = `menu-residual-${Date.now()}`;
    const createResult: PGliteExecuteResult = {
      rows: [{ id, title: 'root', hasChildren: false }],
      rowsAffected: 1,
      elapsed: 1
    };
    const [entity] = await transaction_pglite_result(adapter, MenuLarge, createResult);
    expect((entity as { hasChildren?: boolean }).hasChildren).toBe(false);

    const second: PGliteExecuteResult = {
      rows: [{ id, title: 'root-changed', hasChildren: true }],
      rowsAffected: 1,
      elapsed: 1
    };
    await transaction_pglite_result(adapter, MenuLarge, second, false);

    // computed 属性会刷新；非强制字段继续使用缓存。
    expect((entity as { hasChildren?: boolean }).hasChildren).toBe(true);
    expect((entity as { title?: string }).title).toBe('root');
    expect(getEntityStatus(entity).local).toBe(true);
  });
});
