/**
 * @fileoverview 按表集生成 / 删除变更触发器（US-314 B1.3）
 *
 * @remarks
 * 一套表里挂触发器的实体 = 记变更日志、且这套表里有它自己那张表的实体：主表集是全部记日志的实体，影子表集只有成员。
 * 不收窄的话，非成员实体经解析器落回主表名，「删 / 重建影子表集的触发器」就会删掉、或按持有分支重烙主表集的触发器——
 * QueryCache 实体记日志又从不进影子表集，正中这一条。
 */

import { Entity, EntityBase, PropertyType, RxDB, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import { remove_all_triggers_sql } from '../../table/remove_trigger_sql.js';
import { generate_table_set_trigger_sql } from '../../table/trigger_sql.js';

@Entity({
  name: 'TableSetTodo',
  tableName: 'table_set_todo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class TableSetTodo extends EntityBase {
  title!: string;
}

/** 记日志、但不进影子表集的实体（QueryCache 实体就是这样） */
@Entity({
  name: 'TableSetCache',
  tableName: 'table_set_cache',
  properties: [{ name: 'key', type: PropertyType.string }]
})
class TableSetCache extends EntityBase {
  key!: string;
}

@Entity({
  name: 'TableSetUnlogged',
  tableName: 'table_set_unlogged',
  log: false,
  properties: [{ name: 'body', type: PropertyType.string }]
})
class TableSetUnlogged extends EntityBase {
  body!: string;
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-table-set-trigger',
  entities: [TableSetTodo, TableSetCache, TableSetUnlogged],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();

// 纯 SQL 生成场景，轻量桩即可（同 with_triggers_disabled.spec.ts / create_tables_sql.spec.ts 的取舍）
const createAdapter = (): RxDBAdapterSqliteBase =>
  ({
    rxdb: { config: rxdb.config },
    encryptionContext: { keyring: null, namespace: 'table-set-trigger-test' }
  }) as unknown as RxDBAdapterSqliteBase;

const shadow = WorktreeTableSet.of('wt_a1', [TableSetTodo]);

const triggersOf = (table: string): string[] => [`${table}_insert`, `${table}_update`, `${table}_delete`];

/** SQL 里建出来的触发器名，按出现顺序 */
const createdTriggers = (sql: string): string[] =>
  [...sql.matchAll(/CREATE TRIGGER "([^"]+)"/g)].map(match => match[1]);

/** SQL 里删掉的触发器名，按出现顺序 */
const droppedTriggers = (sql: string): string[] =>
  [...sql.matchAll(/DROP TRIGGER IF EXISTS "([^"]+)"/g)].map(match => match[1]);

describe('generate_table_set_trigger_sql', () => {
  it('主表集：全部记日志的实体，不记日志的没有', () => {
    const triggers = createdTriggers(generate_table_set_trigger_sql(createAdapter(), WorktreeTableSet.MAIN, 'main'));

    expect(triggers).toEqual(
      expect.arrayContaining([...triggersOf('public$table_set_todo'), ...triggersOf('public$table_set_cache')])
    );
    expect(triggers.some(name => name.startsWith('public$table_set_unlogged'))).toBe(false);
  });

  it('影子表集：只有成员自己的那张表；非成员不会落回主表名被按持有分支重烙', () => {
    const sql = generate_table_set_trigger_sql(createAdapter(), shadow, 'held');

    expect(createdTriggers(sql)).toEqual(triggersOf('public$table_set_todo$wt_a1'));
    expect(sql).toContain(`'held'`);
    expect(sql).not.toContain(`'main'`);
  });

  it('给了事务 id 就烙进去，没给就不烙', () => {
    const adapter = createAdapter();

    const transactionId = '00000000-0000-7000-8000-000000000001';

    expect(generate_table_set_trigger_sql(adapter, shadow, 'held', transactionId)).toContain(`'${transactionId}'`);
    expect(generate_table_set_trigger_sql(adapter, shadow, 'held')).not.toContain(`'${transactionId}'`);
  });
});

describe('remove_all_triggers_sql', () => {
  it('影子表集只删成员自己的触发器，主表集的一个都不碰', () => {
    expect(droppedTriggers(remove_all_triggers_sql(createAdapter(), shadow))).toEqual(
      triggersOf('public$table_set_todo$wt_a1')
    );
  });

  it('主表集照旧删全部记日志实体的触发器', () => {
    const dropped = droppedTriggers(remove_all_triggers_sql(createAdapter(), WorktreeTableSet.MAIN));

    expect(dropped).toEqual(
      expect.arrayContaining([...triggersOf('public$table_set_todo'), ...triggersOf('public$table_set_cache')])
    );
    expect(dropped.some(name => name.startsWith('public$table_set_unlogged'))).toBe(false);
  });
});
