/**
 * @fileoverview PGL-014：公开 SQL helper 的返回值必须真的能执行
 *
 * `create_tables_sql` 的 TSDoc 示例写着 `await adapter.query(sql)`，
 * 但返回串里保留着 `---STATEMENT_SEPARATOR---` 哨兵，送进 PG 必 42601。
 * 既有 20 条用例全是 `toContain` 字符串快照，一条都没执行过。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGliteClient } from '../../PGliteClient.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { create_tables_sql } from '../../table/create_tables_sql.js';

const STATEMENT_SEPARATOR = '---STATEMENT_SEPARATOR---';

describe('PGL-014 create_tables_sql 可执行性', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `create-tables-executable-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [...ENTITIES, Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('返回值不得残留语句分隔哨兵', async () => {
    const sql = await create_tables_sql(adapter, [Todo]);
    expect(sql).not.toContain(STATEMENT_SEPARATOR);
  });

  it('所有 CREATE TABLE 必须排在所有 trigger 之前', async () => {
    const sql = await create_tables_sql(adapter, [User, Todo]);

    const lastCreateTable = sql.lastIndexOf('CREATE TABLE');
    const firstTriggerFunction = sql.indexOf('CREATE OR REPLACE FUNCTION');

    expect(lastCreateTable).toBeGreaterThan(-1);
    expect(firstTriggerFunction).toBeGreaterThan(-1);
    // 交错生成时最后一张表会排在第一个 trigger 之后
    expect(lastCreateTable).toBeLessThan(firstTriggerFunction);
  });

  it('返回值可以在一个干净的库上直接执行', async () => {
    const sql = await create_tables_sql(adapter, adapter.rxdb.config.entities);

    const fresh = new PGliteClient();
    await fresh.init(`create-tables-executable-target-${Date.now()}`, { store: 'memory' });
    try {
      await expect(fresh.exec(sql)).resolves.toBeDefined();
    } finally {
      await fresh.disconnect();
    }
  });
});
