/**
 * @fileoverview 可写检出位的影子表带上实例级存储声明（`entityStorage`，US-314 B1.5）
 *
 * @remarks
 * 影子表与主表按同一份生效的存储元数据建：实例级声明的生成列、引用它的高级索引，影子表上也各有一份，
 * 不然挂上检出位按生成列查就是 `no such column`。用真实引擎（官方 sqlite-wasm 的内存库）跑完整的建表集路径，
 * 断言落在目录与裸读出来的行上。
 */

import {
  advancedIndexesOf,
  compileAdvancedIndex,
  compileGeneratedColumn,
  Entity,
  EntityBase,
  generatedColumnsOf,
  getEntityMetadata,
  getEntityStorageMetadata,
  PropertyType,
  RxDB,
  RxDBBranch,
  SyncType,
  WorktreeTableSet
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, describe, expect, it } from 'vitest';
import { memdbBackupHarness } from '../__tests__/backup/memdb-harness.js';
import { create_worktree_table_set } from '../__tests__/test-utils.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_storage_object_name, get_table_name_by_metadata } from '../table-name-resolver.js';

/** 记变更日志的实体，进可写检出位的表集；生成列与高级索引都只在实例级存储声明里 */
@Entity({
  name: 'WorktreeHotItem',
  namespace: 'wthot',
  tableName: 'hot_item',
  properties: [{ name: 'ext', type: PropertyType.json, nullable: true }]
})
class HotItem extends EntityBase {}

describe('可写检出位的影子表带上实例级存储声明（entityStorage）', () => {
  let rxdb: RxDB | undefined;

  afterEach(async () => {
    await rxdb?.disconnectAll();
    rxdb = undefined;
  });

  it('影子表有声明的生成列与引用它的高级索引（名字按表集区分），主表的行原样复制，挂上检出位能按生成列查', async () => {
    rxdb = new RxDB({
      dbName: `worktree-entity-storage-${crypto.randomUUID()}`,
      context: { userId: 'worktree-user' },
      entities: [HotItem],
      entityStorage: [
        {
          entity: HotItem,
          generatedColumns: [
            {
              name: 'status_hot',
              expression: { kind: 'jsonScalar', property: 'ext', key: 'status', dataType: 'string' }
            }
          ],
          indexes: [{ name: 'status_lookup', properties: ['status_hot'] }]
        }
      ],
      sync: { local: { adapter: memdbBackupHarness.adapterName }, type: SyncType.None }
    });
    rxdb.adapter(memdbBackupHarness.adapterName, db => memdbBackupHarness.createAdapter(db, 'memory'));
    rxdb.use(rxDBPluginHistory);
    const adapter = (await rxdb.connect(memdbBackupHarness.adapterName)) as RxDBAdapterSqliteBase;
    const rows = async (sql: string, bindings?: SQLiteCompatibleType[]): Promise<unknown[][]> =>
      (await adapter.internalQuery(sql, bindings)).results.flatMap(result => result.rows);

    const tableSet = WorktreeTableSet.of('wt_hot', [HotItem]);
    const metadata = getEntityStorageMetadata(rxdb, HotItem);
    const [column] = generatedColumnsOf(metadata).map(declared => compileGeneratedColumn(metadata, declared, 'sqlite'));
    const [index] = advancedIndexesOf(metadata).flatMap(declared => {
      const compiled = compileAdvancedIndex(metadata, declared, 'sqlite');
      return compiled === null ? [] : [compiled];
    });
    const mainTable = get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN);
    const shadowTable = get_table_name_by_metadata(metadata, tableSet);
    const managedIndexesOf = (table: string) =>
      rows(`SELECT "name" FROM sqlite_master WHERE "type" = 'index' AND "tbl_name" = ? AND "name" GLOB 'sx_*'`, [
        table
      ]);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await adapter.internalQuery(
      `INSERT INTO ${quote_sql_identifier(mainTable)} ("id", "ext", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
      [id, JSON.stringify({ status: 'ok' }), now, now]
    );
    await rxdb.versionManager.createBranch('held');
    await adapter.internalQuery(
      `UPDATE ${quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN))}
       SET "activeKey" = ? WHERE "id" = ?`,
      [tableSet.holderKey, 'held']
    );
    await create_worktree_table_set(adapter, tableSet, 'held');

    expect(
      await rows(`SELECT "name", "hidden" FROM pragma_table_xinfo(?) WHERE "name" = ?`, [
        shadowTable,
        column.columnName
      ])
    ).toEqual([[column.columnName, 2]]);
    expect(await managedIndexesOf(mainTable)).toEqual([[index.name]]);
    expect(await managedIndexesOf(shadowTable)).toEqual([[get_storage_object_name(index.name, metadata, tableSet)]]);
    expect(await rows(`SELECT "id" FROM ${quote_sql_identifier(shadowTable)}`)).toEqual([[id]]);

    await rxdb.mountWorktreeTableSet(tableSet);
    const found = await adapter.transaction(
      executor =>
        executor.query(
          `SELECT "id" FROM ${executor.tableRef(HotItem)} WHERE ${quote_sql_identifier(column.columnName)} = ?`,
          ['ok']
        ),
      false
    );
    expect(found.rows).toEqual([[id]]);
  });
});
