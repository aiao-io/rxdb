/**
 * @fileoverview 表名解析器（US-314 B1.1）：业务实体的物理名、索引名与库级约束对象名只从这里出。
 *
 * @remarks
 * 两条要守住的事：
 * - 主表集给出的名字与引入检出位之前逐字相同（存量库零迁移）——按旧格式逐个写死对照；
 * - 影子表集里的表、索引、库级约束对象（`uq_` 索引、`ex_` 触发器）与主表集都不撞名：
 *   SQLite 里这些都是库级对象，同库两套表撞名会直接建表失败。
 */

import {
  CONSTRAINT_NAME_MAX_BYTES,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDBBranch,
  WorktreeTableSet
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  get_companion_table_name,
  get_storage_object_name,
  get_table_name,
  get_table_name_by_entity_type,
  get_table_name_by_metadata,
  get_table_name_info,
  getTableColumnIndexName
} from '../table-name-resolver.js';

@Entity({
  name: 'ResolverTodo',
  namespace: 'public',
  tableName: 'resolver_todo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Todo extends EntityBase {
  title!: string;
}

const todo = getEntityMetadata(Todo);
const title = todo.propertyMap.get('title')!;
const shadow = WorktreeTableSet.of('wt_a1', [Todo]);
const otherShadow = WorktreeTableSet.of('wt_b2', [Todo]);
const constraintName = 'uq_resolver_todo_title_once_0a1b2c3d';

describe('表名解析器：主表集与引入检出位之前逐字相同', () => {
  it('业务表与系统表的物理名：<命名空间>$<表名>', () => {
    expect(get_table_name_by_metadata(todo, WorktreeTableSet.MAIN)).toBe('public$resolver_todo');
    expect(get_table_name_by_entity_type(RxDBBranch, WorktreeTableSet.MAIN)).toBe('rxdb$rxdb_branch');
    expect(get_table_name('resolver_todo', 'public')).toBe('public$resolver_todo');
  });

  it('物理名拆回命名空间与其余部分', () => {
    expect(get_table_name_info('rxdb$rxdb_branch')).toEqual(['rxdb', 'rxdb_branch']);
    expect(get_table_name_info('public$resolver_todo$wt_a1')).toEqual(['public', 'resolver_todo$wt_a1']);
    expect(get_table_name_info('plain')).toEqual(['', 'plain']);
  });

  it('列索引名：idx_<物理表名>_<属性名>', () => {
    expect(getTableColumnIndexName(todo, title, WorktreeTableSet.MAIN)).toBe('idx_public$resolver_todo_title');
  });

  it('库级约束对象名原样', () => {
    expect(get_storage_object_name(constraintName, todo, WorktreeTableSet.MAIN)).toBe(constraintName);
  });

  it('附属表名：<命名空间>$<附属名>', () => {
    expect(get_companion_table_name(todo, 'ResolverTodo_edges', WorktreeTableSet.MAIN)).toBe(
      'public$ResolverTodo_edges'
    );
  });
});

describe('表名解析器：影子表集', () => {
  it('有副本的实体落自己那一套：物理名加后缀，两套之间、与主表集都不撞', () => {
    expect(get_table_name_by_metadata(todo, shadow)).toBe('public$resolver_todo$wt_a1');
    expect(get_table_name_by_metadata(todo, otherShadow)).toBe('public$resolver_todo$wt_b2');
  });

  it('没有副本的实体（系统表等）照旧落主表集', () => {
    expect(get_table_name_by_entity_type(RxDBBranch, shadow)).toBe('rxdb$rxdb_branch');
  });

  it('列索引名跟着物理名走', () => {
    expect(getTableColumnIndexName(todo, title, shadow)).toBe('idx_public$resolver_todo$wt_a1_title');
  });

  it('库级约束对象名：换掉末尾的定义哈希，前缀与表名段不变，长度不变、不超上限，每套各不相同', () => {
    const name = get_storage_object_name(constraintName, todo, shadow);
    const other = get_storage_object_name(constraintName, todo, otherShadow);

    expect(name).not.toBe(constraintName);
    expect(other).not.toBe(name);
    expect(name.slice(0, -8)).toBe(constraintName.slice(0, -8));
    expect(name).toMatch(/_[0-9a-f]{8}$/);
    expect(name.length).toBe(constraintName.length);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(CONSTRAINT_NAME_MAX_BYTES);
  });

  it('没有副本的实体，约束对象名原样', () => {
    const unlisted = WorktreeTableSet.of('wt_a1', []);
    expect(get_storage_object_name(constraintName, todo, unlisted)).toBe(constraintName);
  });

  it('附属表跟着所属实体：所属实体有副本，附属表也加后缀', () => {
    expect(get_companion_table_name(todo, 'ResolverTodo_edges', shadow)).toBe('public$ResolverTodo_edges$wt_a1');
  });
});
