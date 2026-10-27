import { Entity, EntityBase, MAIN_BRANCH_ID, PropertyType, RxDB, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { describe, expect, it } from 'vitest';
import { create_tables_sql } from '../../index.js';
import { assertOo1Static } from '../../oo1-types.js';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';

@Entity({
  name: 'CtsAlpha',
  tableName: 'cts_alpha',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class CtsAlpha extends EntityBase {
  title?: string | null;
}

@Entity({
  name: 'CtsQuiet',
  tableName: 'cts_quiet',
  log: false,
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class CtsQuiet extends EntityBase {}

/** 种子行带 binary 列：建表 SQL 把种子 INSERT 的参数内联成字面量，Uint8Array 要写成 BLOB 字面量 */
@Entity({
  name: 'CtsBinary',
  tableName: 'cts_binary',
  log: false,
  properties: [{ name: 'payload', type: PropertyType.binary, nullable: true }]
})
class CtsBinary extends EntityBase {
  payload?: Uint8Array | null;
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-create-tables',
  entities: [CtsAlpha, CtsQuiet, CtsBinary],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
rxdb.entityManager.init();

// context getter 依赖 rxdb 完整初始化，纯 SQL 生成场景用轻量 mock 即可
const adapter = {
  rxdb: { schemaManager: rxdb.schemaManager, context: {} },
  encryptionContext: { keyring: null, namespace: 'create-tables-test' }
} as unknown as RxDBAdapterSqliteBase;

describe('create_tables_sql', () => {
  it('应为每个实体生成建表 SQL，并只为开启日志的实体生成触发器', async () => {
    const sql = await create_tables_sql(adapter, WorktreeTableSet.MAIN, [CtsAlpha, CtsQuiet], MAIN_BRANCH_ID);

    expect(sql).toContain('CREATE TABLE "public$cts_alpha"');
    expect(sql).toContain('CREATE TABLE "public$cts_quiet"');
    expect(sql).toContain('"public$cts_alpha_insert"');
    expect(sql).not.toContain('"public$cts_quiet_insert"');
  });

  it('提供初始数据时应按实体类型分组生成 INSERT 语句', async () => {
    const alpha1 = Object.assign(new CtsAlpha(), { id: 'a-1', title: 'first' });
    const alpha2 = Object.assign(new CtsAlpha(), { id: 'a-2', title: 'second' });

    const sql = await create_tables_sql(adapter, WorktreeTableSet.MAIN, [CtsAlpha], MAIN_BRANCH_ID, [alpha1, alpha2]);

    expect(sql).toContain('INSERT INTO "public$cts_alpha"');
    expect(sql).toContain(`'a-1'`);
    expect(sql).toContain(`'a-2'`);
    expect(sql).toContain(`'first'`);
    expect(sql).toContain(`'second'`);
  });

  it('未提供初始数据时不应生成实体表的 INSERT 语句', async () => {
    const sql = await create_tables_sql(adapter, WorktreeTableSet.MAIN, [CtsAlpha], MAIN_BRANCH_ID);

    // 触发器体内会向变更日志表 INSERT，这里只断言不为实体表生成初始数据
    expect(sql).not.toContain('INSERT INTO "public$cts_alpha"');
  });

  it('触发器应写入调用方传入的 branchId，不固定写死 main', async () => {
    const sql = await create_tables_sql(adapter, WorktreeTableSet.MAIN, [CtsAlpha], 'cts-branch');

    // 触发器体内 `INSERT INTO rxdb$rxdb_change (...) VALUES (...)` 把 branchId 烙成 SQL 字面量，
    // 这里直接断言字面量本身，而不是断言某个更高层行为——建表这一刻既没有事务执行器可用于
    // 查询当前分支，也不该在这里替调用方兜底，branchId 必须原样透传进触发器体。
    expect(sql).toContain(`'cts-branch'`);
    expect(sql).not.toContain(`'${MAIN_BRANCH_ID}'`);
  });

  it('种子行的 binary 值内联成 BLOB 字面量：建表 SQL 在真实引擎上跑得通，字节原样落库', async () => {
    const seed = Object.assign(new CtsBinary(), { id: 'b-1', payload: new Uint8Array([1, 2, 255]) });

    const sql = await create_tables_sql(adapter, WorktreeTableSet.MAIN, [CtsBinary], MAIN_BRANCH_ID, [seed]);

    const initFn = sqlite3InitModule as (options: Record<string, unknown>) => Promise<unknown>;
    const module = await initFn({ print: () => undefined, printErr: () => undefined });
    assertOo1Static(module);
    const db = new module.oo1.DB(':memory:');
    try {
      db.exec({ sql });
      const resultRows: unknown[][] = [];
      db.exec({ sql: 'SELECT "id", hex("payload") FROM "public$cts_binary"', rowMode: 'array', resultRows });
      expect(resultRows).toEqual([['b-1', '0102FF']]);
    } finally {
      db.close();
    }
  });
});
