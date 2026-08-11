import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { create_tables_sql } from '../../index.js';
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

const rxdb = new RxDB({
  dbName: 'sqlite-core-create-tables',
  entities: [CtsAlpha, CtsQuiet],
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
    const sql = await create_tables_sql(adapter, [CtsAlpha, CtsQuiet]);

    expect(sql).toContain('CREATE TABLE "public$cts_alpha"');
    expect(sql).toContain('CREATE TABLE "public$cts_quiet"');
    expect(sql).toContain('"public$cts_alpha_insert"');
    expect(sql).not.toContain('"public$cts_quiet_insert"');
  });

  it('提供初始数据时应按实体类型分组生成 INSERT 语句', async () => {
    const alpha1 = Object.assign(new CtsAlpha(), { id: 'a-1', title: 'first' });
    const alpha2 = Object.assign(new CtsAlpha(), { id: 'a-2', title: 'second' });

    const sql = await create_tables_sql(adapter, [CtsAlpha], [alpha1, alpha2]);

    expect(sql).toContain('INSERT INTO "public$cts_alpha"');
    expect(sql).toContain(`'a-1'`);
    expect(sql).toContain(`'a-2'`);
    expect(sql).toContain(`'first'`);
    expect(sql).toContain(`'second'`);
  });

  it('未提供初始数据时不应生成实体表的 INSERT 语句', async () => {
    const sql = await create_tables_sql(adapter, [CtsAlpha]);

    // 触发器体内会向变更日志表 INSERT，这里只断言不为实体表生成初始数据
    expect(sql).not.toContain('INSERT INTO "public$cts_alpha"');
  });
});
