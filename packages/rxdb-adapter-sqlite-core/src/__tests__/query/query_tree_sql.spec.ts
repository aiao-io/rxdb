import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBError,
  SyncType,
  TreeAdjacencyListEntityBase,
  TreeEntity,
  type FindTreeOptions
} from '@aiao/rxdb';
import { MenuLarge, MenuSimple } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import {
  generate_entity_count_ancestors_sql,
  generate_entity_count_descendants_sql,
  generate_entity_find_ancestors_sql,
  generate_entity_find_descendants_sql,
  generate_tree_sql
} from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

/** 自带关系的树实体（覆盖 where 关系路径触发加密校验实体解析的分支） */
@TreeEntity({
  name: 'QtsMenu',
  tableName: 'qts_menu',
  properties: [
    { name: 'title', type: PropertyType.string, nullable: true },
    { name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }
  ],
  relations: [
    { name: 'group', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QtsGroup', mappedProperty: 'menus', nullable: true }
  ],
  features: { tree: { type: 'adjacency-list', hasChildren: false } }
})
class QtsMenu extends TreeAdjacencyListEntityBase {}

@Entity({
  name: 'QtsGroup',
  tableName: 'qts_group',
  properties: [{ name: 'name', type: PropertyType.string, nullable: true }],
  relations: [{ name: 'menus', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'QtsMenu', mappedProperty: 'group' }]
})
class QtsGroup extends EntityBase {}

class TreeSqlTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-tree-sql-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('TreeSqlTestAdapter.createClient must not be called');
  }
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-tree-sql',
  entities: [MenuSimple, MenuLarge, QtsMenu, QtsGroup],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
const adapter = new TreeSqlTestAdapter(rxdb);

describe('generate_tree_sql', () => {
  const metadata = getEntityMetadata(MenuSimple);

  it('无 entityId 时应查询根节点且不带参数', () => {
    const result = generate_tree_sql(adapter, metadata, {});

    expect(result.sql).toContain('WHERE "parentId" is null');
    expect(result.sql).toContain('SELECT __children.* FROM __children ORDER BY __level, "id";');
    expect(result.params).toEqual([]);
  });

  it('有 entityId 时应按 id 参数化查询', () => {
    const result = generate_tree_sql(adapter, metadata, { entityId: 'node-1' });

    expect(result.sql).toContain('WHERE "id" = ?');
    expect(result.params).toEqual(['node-1']);
  });

  it('isCount 且查询根节点时应使用 count(*)', () => {
    const result = generate_tree_sql(adapter, metadata, { isCount: true });

    expect(result.sql).toContain('SELECT count(*) FROM __children');
  });

  it('isCount 且指定 entityId 时应排除自身，且计数下界钳在 0（SQLC-026）', () => {
    const result = generate_tree_sql(adapter, metadata, { entityId: 'node-1', isCount: true });

    // 起点节点不存在时 CTE 返回 0 行，裸 `count(*)-1` 会把 -1 交给调用方。
    expect(result.sql).toContain('SELECT max(count(*)-1, 0) FROM __children');
    expect(result.sql).not.toContain('SELECT count(*)-1 FROM __children');
  });

  it('hasChildren 选项应附加 hasChildren 子查询', () => {
    const result = generate_tree_sql(adapter, metadata, { hasChildren: true });

    expect(result.sql).toContain(
      'EXISTS(SELECT 1 FROM "public$menu_simple" __sub WHERE __sub."parentId" = __children."id") AS hasChildren'
    );
  });

  it('level 未设置时按 FindTreeOptions 契约仅返回当前节点，不退化为不限深度', () => {
    const withLevel = generate_tree_sql(adapter, metadata, { entityId: 'n1', level: 3 });
    const withoutLevel = generate_tree_sql(adapter, metadata, { entityId: 'n1' });

    expect(withLevel.sql).toContain('WHERE c.__level < 3');
    // `@default 0` = 仅当前节点。此前 level == null 被当作「不限深度」，
    // 与 pglite（`c.level < 0`）行为分叉，也与 TSDoc 矛盾。
    expect(withoutLevel.sql).toContain('WHERE c.__level < 0');
  });

  it('level 非法时抛错，绝不把原值拼进 SQL', () => {
    const injection = '1; DROP TABLE menu_simple --' as unknown as number;

    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: injection })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: 101 })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: -1 })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: 1.5 })).toThrow(RxDBError);
  });

  it('where 条件应与层级约束用 AND 连接，裸字段绑定递归成员别名', () => {
    const result = generate_tree_sql(adapter, metadata, {
      entityId: 'n1',
      level: 2,
      where: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'menu' }] }
    });

    // 递归成员无主表别名 `_`，裸字段必须绑定到递归成员表别名 `children`
    expect(result.sql).toContain(`WHERE c.__level < 2 AND "children"."title" = 'menu'`);
    expect(result.sql).not.toContain(`_."title"`);
  });

  it('where 含关系路径字段时应触发加密校验的实体解析', () => {
    const result = generate_tree_sql(adapter, getEntityMetadata(QtsMenu), {
      entityId: 'n1',
      where: { combinator: 'and', rules: [{ field: 'group.name', operator: '=', value: 'root' }] }
    });

    expect(result.sql).toContain(`"group"."name" = 'root'`);
  });

  it('拒绝通过 children 别名过滤当前树实体的加密列', () => {
    expect(() =>
      generate_tree_sql(adapter, getEntityMetadata(QtsMenu), {
        entityId: 'n1',
        where: { combinator: 'and', rules: [{ field: 'children.secret', operator: '=', value: 'plaintext' }] }
      })
    ).toThrow(expect.objectContaining({ name: 'EncryptedQueryError', code: 'where_on_encrypted', property: 'secret' }));
  });

  it('isFindDescendants 应决定递归 JOIN 的方向', () => {
    const descendants = generate_tree_sql(adapter, metadata, { entityId: 'n1', isFindDescendants: true });
    const ancestors = generate_tree_sql(adapter, metadata, { entityId: 'n1', isFindDescendants: false });

    expect(descendants.sql).toContain('JOIN __children c ON children."parentId" = c."id"');
    expect(ancestors.sql).toContain('JOIN __children c ON children."id" = c."parentId"');
  });
});

describe('tree sql 包装函数', () => {
  const simpleMetadata = getEntityMetadata(MenuSimple);
  const largeMetadata = getEntityMetadata(MenuLarge);
  const options: FindTreeOptions = { entityId: 'n1' };

  it('generate_entity_find_descendants_sql 应按 metadata 特性决定 hasChildren', () => {
    const large = generate_entity_find_descendants_sql(adapter, largeMetadata, options);
    const simple = generate_entity_find_descendants_sql(adapter, simpleMetadata, options);

    expect(large.sql).toContain('AS hasChildren');
    expect(large.sql).toContain('children."parentId" = c."id"');
    expect(simple.sql).not.toContain('hasChildren');
  });

  it('generate_entity_count_descendants_sql 应生成子孙数量查询', () => {
    const result = generate_entity_count_descendants_sql(adapter, simpleMetadata, options);

    expect(result.sql).toContain('SELECT max(count(*)-1, 0) FROM __children');
    expect(result.sql).toContain('children."parentId" = c."id"');
  });

  it('generate_entity_find_ancestors_sql 应生成祖先查询', () => {
    const result = generate_entity_find_ancestors_sql(adapter, largeMetadata, options);

    expect(result.sql).toContain('children."id" = c."parentId"');
    expect(result.sql).toContain('AS hasChildren');
  });

  it('generate_entity_count_ancestors_sql 应生成祖先数量查询', () => {
    const result = generate_entity_count_ancestors_sql(adapter, simpleMetadata, options);

    expect(result.sql).toContain('SELECT max(count(*)-1, 0) FROM __children');
    expect(result.sql).toContain('children."id" = c."parentId"');
  });
});
