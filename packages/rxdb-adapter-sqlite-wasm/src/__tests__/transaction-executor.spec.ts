import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * `SqliteTransactionExecutor` 的真机行为（C2 第一步：executor 存在且可用，语义尚未翻转）。
 *
 * @remarks
 * 关键在于证明 **executor 派生的仓库确实落在事务里** —— 它是靠一个 `query` 被改写过的
 * 适配器门面实现的，而不是给每个 helper 逐个加形参。门面写错的话，写入会落到事务**外**，
 * 回滚也带不走它；下面第一条用例就是冲着这个来的。
 */
@Entity({
  name: 'ExecNote',
  tableName: 'exec_note',
  namespace: 'exec',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class ExecNote extends EntityBase {
  label!: string;
}

describe('SqliteTransactionExecutor', () => {
  const databases: RxDB[] = [];

  const connect = async () => {
    let adapter: RxDBAdapterSqlite | undefined;
    const rxdb = new RxDB({
      dbName: `executor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: { userId: 'userId' },
      entities: [ExecNote],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite-wasm', async database => {
      adapter = new RxDBAdapterSqlite(database, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl });
      return adapter;
    });
    databases.push(rxdb);
    await rxdb.connect('sqlite-wasm');
    return adapter!;
  };

  const countRows = async (adapter: RxDBAdapterSqlite): Promise<number> => {
    const result = await adapter.query('SELECT COUNT(*) FROM "exec$exec_note";');
    return Number(result.results[0]?.rows?.[0]?.[0] ?? 0);
  };

  afterEach(async () => {
    const pending = databases.splice(0, databases.length);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('executor.getRepository() 的写入属于本事务：回滚后必须消失', async () => {
    const adapter = await connect();

    await expect(
      adapter.transaction(async executor => {
        const note = new ExecNote();
        note.label = 'rolled-back';
        await executor.getRepository(ExecNote).create(note);
        // 事务内的读**必须**走 executor：`adapter.query()` 是外部调用，翻转后一律重新排队，
        // 而队列的唯一槽位正被本事务占着 —— 那样写会挂死（这正是 C2 的预期语义）。
        const inside = await executor.query('SELECT COUNT(*) FROM "exec$exec_note";');
        expect(Number(inside.rows[0]?.[0] ?? 0)).toBe(1);
        throw new Error('rollback on purpose');
      })
    ).rejects.toThrow(/rollback on purpose/);

    // 落在事务外的话，这里会是 1 —— 那说明门面没把仓库拉进事务
    expect(await countRows(adapter)).toBe(0);
  }, 20000);

  it('executor.getRepository() 的写入在提交后留存', async () => {
    const adapter = await connect();

    await adapter.transaction(async executor => {
      const note = new ExecNote();
      note.label = 'committed';
      await executor.getRepository(ExecNote).create(note);
    });

    expect(await countRows(adapter)).toBe(1);
  }, 20000);

  it('executor.run() 复用同一个事务，不新开', async () => {
    const adapter = await connect();

    const ids = await adapter.transaction(async executor => {
      const inner = await executor.run(async nested => nested.id);
      return [executor.id, inner];
    });

    expect(ids[0]).toBe(ids[1]);
    expect(typeof ids[0]).toBe('string');
  }, 20000);

  it('executor 逃逸出事务体后再使用必须抛错', async () => {
    const adapter = await connect();
    let escaped: { state: string; execute: (sql: string) => Promise<unknown> } | undefined;

    await adapter.transaction(async executor => {
      escaped = executor;
    });

    expect(escaped?.state).toBe('committed');
    await expect(escaped?.execute('SELECT 1;')).rejects.toThrow(/committed/);
  }, 20000);

  it('回滚后逃逸的 executor 同样抛错，且状态为 rolled-back', async () => {
    const adapter = await connect();
    let escaped: { state: string; execute: (sql: string) => Promise<unknown> } | undefined;

    await adapter
      .transaction(async executor => {
        escaped = executor;
        throw new Error('rollback on purpose');
      })
      .catch(() => undefined);

    expect(escaped?.state).toBe('rolled-back');
    await expect(escaped?.execute('SELECT 1;')).rejects.toThrow(/rolled-back/);
  }, 20000);
});
