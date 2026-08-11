import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';

describe('scratch review', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `scratch-${Date.now()}`,
      context: { userId: 'u' },
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb
      .adapter('pglite', async db => {
        adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
        return adapter;
      })
      .init();
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb?.disconnectAll();
  });

  it('REPRO-1: 外部并发写入不会被卷入他人事务', async () => {
    const outsideTodo = new Todo({ title: 'outside-writer' });

    let started!: () => void;
    const startedP = new Promise<void>(r => (started = r));

    const txP = adapter
      .transaction(async () => {
        started();
        // 事务内部等一会儿，模拟长事务
        await new Promise(r => setTimeout(r, 300));
        throw new Error('boom - tx rollback');
      })
      .catch(e => e);

    await startedP;
    // 外部写入没有 executor，必须等待当前事务回滚后独立提交。
    await rxdb.entityManager.saveMany([outsideTodo]);
    await txP;

    const res = await adapter.internalQuery<{ c: string }>(
      `SELECT count(*)::text as c FROM "public"."todos" WHERE title = $1`,
      ['outside-writer']
    );
    expect(res.rows[0].c).toBe('1');
  });

  it('REPRO-2: LIKE 通配符未转义', async () => {
    await rxdb.entityManager.saveMany([
      new Todo({ title: '100%off' }),
      new Todo({ title: '100XXoff' }),
      new Todo({ title: 'a_b' }),
      new Todo({ title: 'axb' })
    ]);

    const repo = adapter.getRepository(Todo);
    const found = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'title', operator: 'startsWith', value: 'a_b' }] }
    } as never);
    expect((found as Todo[]).map(t => t.title).sort()).toEqual(['a_b']);
  });

  // PGL-006：原用例只 console.log 结果，门禁不会红。改成确定断言：
  // 一条锁住「text 操作数确实按字典序」这个 PostgreSQL 事实（这是缺陷的成因），
  // 一条锁住「jsonb 操作数按数值」这个修复后的形态。
  it('REPRO-3: JSON 路径 text 比较按字典序，jsonb 比较按数值', async () => {
    await adapter.internalQuery(`CREATE TABLE IF NOT EXISTS scratch_json (id int, meta jsonb)`);
    await adapter.internalQuery(`DELETE FROM scratch_json`);
    await adapter.internalQuery(`INSERT INTO scratch_json VALUES (1, '{"count": 10}'), (2, '{"count": 9}')`);

    const asText = await adapter.internalQuery<{ id: number }>(
      `SELECT id FROM scratch_json WHERE meta ->> 'count' > $1 ORDER BY id`,
      ['9']
    );
    // '10' < '9' 字典序 —— count=10 的那行被漏掉，这正是 PGL-006 的成因
    expect(asText.rows.map(row => row.id)).toEqual([]);

    const asJsonb = await adapter.internalQuery<{ id: number }>(
      `SELECT id FROM scratch_json WHERE meta -> 'count' > $1::jsonb ORDER BY id`,
      ['9']
    );
    expect(asJsonb.rows.map(row => row.id)).toEqual([1]);
  });
});
