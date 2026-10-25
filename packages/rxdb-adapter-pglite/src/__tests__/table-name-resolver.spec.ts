/**
 * @fileoverview PGlite 表名解析器（US-314 B1.1）：表集映射成 schema，表名不变。
 *
 * @remarks
 * PostgreSQL 的索引、函数按 schema 划分，触发器与约束按表划分：影子表集换个 schema，
 * 索引名、约束名、触发器名都不用动。唯一要跟着换 schema 的是变更触发器函数——它原先挂在逻辑命名空间下，
 * `CREATE OR REPLACE` 会把主表集那份（写死了 main 分支 id）静默盖掉。
 */

import { Entity, EntityBase, getEntityMetadata, PropertyType, RxDBBranch, WorktreeTableSet } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  getChangeTriggerFunctionName,
  getSchemaName,
  getTableName,
  getTableNameByMetadata
} from '../table-name-resolver.js';

@Entity({
  name: 'PgResolverTodo',
  namespace: 'public',
  tableName: 'pg_resolver_todo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Todo extends EntityBase {
  title!: string;
}

@Entity({
  name: 'PgResolverBoundary',
  namespace: 'resolver_namespace_abcdefghijklmnopqrstuvwxyzab',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Boundary extends EntityBase {
  declare title: string;
}

const todo = getEntityMetadata(Todo);
const branch = getEntityMetadata(RxDBBranch);
const shadow = WorktreeTableSet.of('wt_a1', [Todo]);

describe('PGlite 表名解析器：主表集与引入检出位之前逐字相同', () => {
  it('完全限定表名："命名空间"."表名"', () => {
    expect(getTableNameByMetadata(todo, WorktreeTableSet.MAIN)).toBe('"public"."pg_resolver_todo"');
    expect(getTableNameByMetadata(branch, WorktreeTableSet.MAIN)).toBe('"rxdb"."rxdb_branch"');
    expect(getTableName('pg_resolver_todo', 'public')).toBe('"public"."pg_resolver_todo"');
  });

  it('schema 就是命名空间', () => {
    expect(getSchemaName(todo, WorktreeTableSet.MAIN)).toBe('public');
  });

  it('变更触发器函数挂在命名空间下', () => {
    expect(getChangeTriggerFunctionName(todo, WorktreeTableSet.MAIN)).toBe(
      '"public"."pg_resolver_todo_change_trigger_fn"'
    );
  });
});

describe('PGlite 表名解析器：影子表集', () => {
  it('完整名字恰好 63 字节时保持原名，不压缩 namespace', () => {
    const metadata = getEntityMetadata(Boundary);
    const set = WorktreeTableSet.of('wt_abcdefghijk1', [Boundary]);
    const expected = `${metadata.namespace}$${set.suffix}`;
    expect(new TextEncoder().encode(expected).length).toBe(63);
    expect(getSchemaName(metadata, set)).toBe(expected);
  });

  it('有副本的实体换到自己那套 schema，表名不变', () => {
    expect(getSchemaName(todo, shadow)).toBe('public$wt_a1');
    expect(getTableNameByMetadata(todo, shadow)).toBe('"public$wt_a1"."pg_resolver_todo"');
  });

  it('没有副本的实体（系统表等）照旧落主表集', () => {
    expect(getSchemaName(branch, shadow)).toBe('rxdb');
    expect(getTableNameByMetadata(branch, shadow)).toBe('"rxdb"."rxdb_branch"');
  });

  it('变更触发器函数跟着换 schema，不与主表集那份撞名', () => {
    expect(getChangeTriggerFunctionName(todo, shadow)).toBe('"public$wt_a1"."pg_resolver_todo_change_trigger_fn"');
  });
});
