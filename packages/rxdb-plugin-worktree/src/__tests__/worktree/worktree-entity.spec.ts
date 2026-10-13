/**
 * @fileoverview US-310 AC#1：`Worktree`（`rxdb_worktree`）是本插件贡献的第 11 张系统表。
 *
 * @remarks
 * 四条断言各防一种不会编译报错的事故：
 *
 * 1. **漏进贡献清单**：表照样被 `@Entity` 声明出来，宿主却永远不建它，首次 `createWorktree()`
 *    抛一句读不出主语的「表不存在」。
 * 2. **唯一索引写在属性上**：`branchId` 是 MANY_TO_ONE 生成的外键列，再声明一个同名属性会与关系
 *    生成的列撞车；唯一性只能走 `indexes`（与 `WorkingTreeEntry` 的 `idx_working_tree_entry_identity`
 *    同款）。漏了唯一索引，1:1 钉住就只剩命令体里那一次读——多 Tab 并发时两个 worktree 钉同一分支。
 * 3. **`log` 缺省是「记」**：worktree 行的增删会被当成用户变更写进 `rxdb_change` 并推到远端。
 * 4. **级联方向**：分支删掉时这一行必须跟着走，否则同名重建的分支会被一行旧 worktree 自动钉住（ABA）。
 */

import {
  getEntityMetadata,
  isSystemEntity,
  OnDeleteAction,
  RelationKind,
  RxDB,
  SyncType,
  SYSTEM_ENTITY_PERMISSIONS
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBPluginWorktree, rxDBPluginWorktree } from '../../plugin.js';
import { Worktree } from '../../worktree/worktree.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 一个没 `init()` 过的宿主；读 `system` 不需要连接。 */
const createDatabase = (): RxDB => {
  const database = new RxDB({
    dbName: `rxdb-worktree-entity-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
};

describe('Worktree 系统表（US-310 AC#1）', () => {
  it('是系统贡献里的第 11 张、排在最后（顺序即建表顺序，它外键指向 rxdb_branch）', () => {
    const entities = new RxDBPluginWorktree(createDatabase()).system.entities;
    expect(entities).toHaveLength(11);
    expect(entities[10]).toBe(Worktree);
  });

  it('namespace=rxdb、表名 rxdb_worktree、log=false、三个写操作只许系统写', () => {
    const metadata = getEntityMetadata(Worktree);
    expect({
      namespace: metadata.namespace,
      name: metadata.name,
      tableName: metadata.tableName,
      log: metadata.log,
      permissions: metadata.permissions
    }).toEqual({
      namespace: 'rxdb',
      name: 'Worktree',
      tableName: 'rxdb_worktree',
      log: false,
      permissions: SYSTEM_ENTITY_PERMISSIONS
    });
  });

  it('use() 之后核心登记簿认得它', () => {
    const database = createDatabase();
    database.use(rxDBPluginWorktree);
    expect(isSystemEntity(Worktree)).toBe(true);
  });

  it('branchId 上有且只有一条唯一索引；branchId 不是同名属性', () => {
    const metadata = getEntityMetadata(Worktree);
    const unique = metadata.indexes.filter(index => index.unique);
    expect(unique.map(index => ({ name: index.name, properties: index.properties }))).toEqual([
      { name: 'idx_worktree_branch', properties: ['branchId'] }
    ]);
    // 外键列由关系生成；再声明一个同名属性会与它撞车。
    expect(metadata.propertyMap.has('branchId')).toBe(false);
  });

  it('MANY_TO_ONE → RxDBBranch，删分支级联带走本行', () => {
    const [relation, ...rest] = getEntityMetadata(Worktree).relations;
    expect(rest).toEqual([]);
    expect({
      name: relation?.name,
      kind: relation?.kind,
      mappedEntity: relation?.mappedEntity,
      onDelete: relation?.onDelete
    }).toEqual({
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      onDelete: OnDeleteAction.CASCADE
    });
  });

  it('label 可空、createdAt 由库时钟填；不带 updatedAt（行建出来就不再改）', () => {
    const { propertyMap } = getEntityMetadata(Worktree);
    expect(propertyMap.get('label')?.nullable).toBe(true);
    expect(propertyMap.get('createdAt')?.default).toBe('CURRENT_TIMESTAMP');
    expect(propertyMap.has('updatedAt')).toBe(false);
  });
});
