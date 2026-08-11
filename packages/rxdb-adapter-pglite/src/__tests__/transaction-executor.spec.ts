import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * `PGliteTransactionExecutor` 的真机行为，与 sqlite-wasm 的同名用例逐条对应。
 *
 * @remarks
 * 两包是仅有的两处 `transaction()` 实现，语义分叉会让共享契约套件在其中一边悄悄失效，
 * 因此这里刻意保持同一组断言。
 *
 * 「回滚后逃逸的 executor」那条在 PGlite 上尤其重要：驱动的 `tx.closed` 在**失败路径上不翻转**，
 * 若 executor 状态从它派生，逃逸出去的 tx 会以 autocommit 继续写。
 */
@Entity({
  name: 'PgExecNote',
  tableName: 'pg_exec_note',
  namespace: 'pgexec',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class PgExecNote extends EntityBase {
  label!: string;
}

describe('PGliteTransactionExecutor', () => {
  const databases: RxDB[] = [];

  const connect = async () => {
    let adapter: RxDBAdapterPGlite | undefined;
    const rxdb = new RxDB({
      dbName: `pg-executor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: { userId: 'userId' },
      entities: [PgExecNote],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async database => {
      adapter = new RxDBAdapterPGlite(database, { store: 'memory' });
      return adapter;
    });
    databases.push(rxdb);
    await rxdb.connect('pglite');
    return adapter!;
  };

  const countRows = async (adapter: RxDBAdapterPGlite): Promise<number> => {
    const result = await adapter.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "pgexec"."pg_exec_note";'
    );
    return Number(result.rows[0]?.count ?? 0);
  };

  afterEach(async () => {
    const pending = databases.splice(0, databases.length);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('executor.getRepository() 的写入属于本事务：回滚后必须消失', async () => {
    const adapter = await connect();

    await expect(
      adapter.transaction(async executor => {
        const note = new PgExecNote();
        note.label = 'rolled-back';
        await executor.getRepository(PgExecNote).create(note);
        // 事务内的读必须走 executor（同 sqlite 侧口径）：adapter.query() 是外部调用，
        // 翻转后一律重新排队，会排在本事务后面
        const inside = await executor.query('SELECT COUNT(*)::text AS count FROM "pgexec"."pg_exec_note";');
        expect(Number(inside.rows[0]?.[0] ?? 0)).toBe(1);
        throw new Error('rollback on purpose');
      })
    ).rejects.toThrow(/rollback on purpose/);

    // 落在事务外的话这里会是 1 —— 说明门面没把仓库拉进事务
    expect(await countRows(adapter)).toBe(0);
  }, 30000);

  it('executor.getRepository() 的写入在提交后留存', async () => {
    const adapter = await connect();

    await adapter.transaction(async executor => {
      const note = new PgExecNote();
      note.label = 'committed';
      await executor.getRepository(PgExecNote).create(note);
    });

    expect(await countRows(adapter)).toBe(1);
  }, 30000);

  it('executor.run() 复用同一个事务，不新开', async () => {
    const adapter = await connect();

    const ids = await adapter.transaction(async executor => {
      const inner = await executor.run(async nested => nested.id);
      return [executor.id, inner];
    });

    expect(ids[0]).toBe(ids[1]);
  }, 30000);

  it('executor 逃逸出事务体后再使用必须抛错（提交路径）', async () => {
    const adapter = await connect();
    let escaped: { state: string; query: (sql: string) => Promise<unknown> } | undefined;

    await adapter.transaction(async executor => {
      escaped = executor;
    });

    expect(escaped?.state).toBe('committed');
    await expect(escaped?.query('SELECT 1;')).rejects.toThrow(/committed/);
  }, 30000);

  it('executor 逃逸出事务体后再使用必须抛错（回滚路径）', async () => {
    const adapter = await connect();
    let escaped: { state: string; query: (sql: string) => Promise<unknown> } | undefined;

    await adapter
      .transaction(async executor => {
        escaped = executor;
        throw new Error('rollback on purpose');
      })
      .catch(() => undefined);

    // 驱动的 tx.closed 在这条路径上不翻转；executor 必须自持状态才能挡住后续写入
    expect(escaped?.state).toBe('rolled-back');
    await expect(escaped?.query('SELECT 1;')).rejects.toThrow(/rolled-back/);
  }, 30000);
});
