import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  WorktreeTableSet,
  type EntityMetadata,
  type EntityRelationManyToManyMetadata,
  type EntityType,
  type FindOptions,
  type RuleGroup
} from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { find_sql, generate_entity_find_descendants_sql, get_table_name_by_metadata } from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import { createRealSqliteDatabase, type RealSqliteDatabase } from '../fixtures/real-sqlite.js';

@Entity({
  name: 'NeAuthor',
  namespace: 'nexists',
  tableName: 'author',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'posts', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'NePost', mappedProperty: 'author' },
    {
      name: 'profile',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'NeProfile',
      mappedProperty: 'author',
      nullable: true
    }
  ]
})
class NeAuthor extends EntityBase {}

@Entity({
  name: 'NeProfile',
  namespace: 'nexists',
  tableName: 'profile',
  properties: [{ name: 'bio', type: PropertyType.string }],
  relations: [{ name: 'author', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'NeAuthor', mappedProperty: 'profile' }]
})
class NeProfile extends EntityBase {}

@Entity({
  name: 'NePost',
  namespace: 'nexists',
  tableName: 'post',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    { name: 'author', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'NeAuthor', mappedProperty: 'posts' },
    { name: 'comments', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'NeComment', mappedProperty: 'post' },
    { name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'NeTag', mappedProperty: 'posts' }
  ]
})
class NePost extends EntityBase {}

@Entity({
  name: 'NeComment',
  namespace: 'nexists',
  tableName: 'comment',
  properties: [
    { name: 'body', type: PropertyType.string },
    { name: 'labels', type: PropertyType.stringArray, nullable: true },
    {
      name: 'meta',
      type: PropertyType.keyValue,
      properties: [{ name: 'k', type: PropertyType.string }],
      nullable: true
    }
  ],
  relations: [{ name: 'post', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'NePost', mappedProperty: 'comments' }]
})
class NeComment extends EntityBase {}

@Entity({
  name: 'NeTag',
  namespace: 'nexists',
  tableName: 'tag',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [{ name: 'posts', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'NePost', mappedProperty: 'tags' }]
})
class NeTag extends EntityBase {}

@Entity({
  name: 'NeGroup',
  namespace: 'nexists',
  tableName: 'menu_group',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'menus', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'NeMenu', mappedProperty: 'group' }]
})
class NeGroup extends EntityBase {}

@TreeEntity({
  name: 'NeMenu',
  namespace: 'nexists',
  tableName: 'menu',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    { name: 'group', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'NeGroup', mappedProperty: 'menus', nullable: true }
  ],
  features: { tree: { type: 'adjacency-list', hasChildren: false } }
})
class NeMenu extends TreeAdjacencyListEntityBase {}

class NestedExistsTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-nested-exists-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('NestedExistsTestAdapter.createClient must not be called');
  }
}

const ENTITIES = [NeAuthor, NeProfile, NePost, NeComment, NeTag, NeGroup, NeMenu];
const rxdb = new RxDB({
  dbName: 'sqlite-core-nested-exists',
  entities: ENTITIES,
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
const adapter = new NestedExistsTestAdapter(rxdb);

const tableOf = (metadata: EntityMetadata): string => get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN);

/** 物理列名：属性按 columnName，外键按 foreignKeyColumnNames。 */
const columnOf = (metadata: EntityMetadata, name: string): string => {
  const property = metadata.propertyMap.get(name);
  if (property) return property.columnName;
  const index = (metadata.foreignKeyNames ?? []).indexOf(name);
  if (index === -1) throw new Error(`${metadata.name} 没有字段 ${name}`);
  return (metadata.foreignKeyColumnNames ?? metadata.foreignKeyNames)[index];
};

const columnsOf = (metadata: EntityMetadata): string[] => [
  ...new Set([...[...metadata.propertyMap.values()].map(p => p.columnName), ...(metadata.foreignKeyColumnNames ?? [])])
];

const junctionOf = (type: EntityType, relationName: string): EntityMetadata => {
  const relation = getEntityMetadata(type).relationMap.get(relationName) as EntityRelationManyToManyMetadata;
  return getEntityMetadata(relation.junctionEntityType!);
};

const junctionColumn = (junction: EntityMetadata, mappedEntity: string): string =>
  junction.relations.find(relation => relation.mappedEntity === mappedEntity)!.columnName!;

let db: RealSqliteDatabase;

const insert = (metadata: EntityMetadata, row: Record<string, unknown>): void => {
  const fields = Object.keys(row);
  const columns = fields.map(field => `"${columnOf(metadata, field)}"`).join(', ');
  db.all(
    `INSERT INTO "${tableOf(metadata)}" (${columns}) VALUES (${fields.map(() => '?').join(', ')})`,
    Object.values(row)
  );
};

const idsOf = (sql: string, params: readonly unknown[] = []): unknown[] =>
  db.all(`SELECT "id" FROM (${sql.replace(/;\s*$/, '')}) ORDER BY 1`, params).map(row => row[0]);

const find = (type: EntityType, where: RuleGroup): unknown[] => {
  const { sql, params } = find_sql(adapter, getEntityMetadata(type), { where } as FindOptions<EntityType, object>);
  return idsOf(sql, params);
};

const rules = (...items: unknown[]): RuleGroup => ({ combinator: 'and', rules: items }) as RuleGroup;

beforeAll(async () => {
  db = await createRealSqliteDatabase();
  const metadataList = [...ENTITIES, ...rxdb.schemaManager.generatedEntities].map(type => getEntityMetadata(type));
  for (const metadata of metadataList) {
    db.exec(`CREATE TABLE "${tableOf(metadata)}" (${columnsOf(metadata).map(column => `"${column}"`).join(', ')})`);
  }
  const [author, profile, post, comment, tag, group, menu] = ENTITIES.map(type => getEntityMetadata(type));
  insert(author, { id: 'a1', name: 'A1' });
  insert(author, { id: 'a2', name: 'A2' });
  insert(author, { id: 'a3', name: 'A3' });
  insert(profile, { id: 'pr1', bio: 'b1', authorId: 'a1' });
  insert(post, { id: 'p1', title: 'P1', authorId: 'a1' });
  insert(post, { id: 'p2', title: 'P2', authorId: 'a2' });
  insert(post, { id: 'p3', title: 'P3', authorId: 'a3' });
  insert(comment, { id: 'c1', body: 'hit', postId: 'p1', labels: '["x"]', meta: '{"k":"v"}' });
  insert(comment, { id: 'c2', body: 'miss', postId: 'p2', labels: '["y"]', meta: '{"k":"w"}' });
  // 诱饵：外键恰好等于某个作者 id。内层关联若错挂到顶层作者，a2 会被它误判命中
  insert(comment, { id: 'c9', body: 'hit', postId: 'a2' });
  insert(tag, { id: 't1', label: 'hot' });
  insert(tag, { id: 't2', label: 'cold' });
  const postTags = junctionOf(NePost, 'tags');
  db.all(
    `INSERT INTO "${tableOf(postTags)}" ("id", "${junctionColumn(postTags, 'NePost')}", "${junctionColumn(postTags, 'NeTag')}") VALUES ('j1', 'p1', 't1'), ('j2', 'p2', 't2')`
  );
  insert(group, { id: 'g1', name: 'hit' });
  insert(group, { id: 'g2', name: 'miss' });
  insert(menu, { id: 'r1', title: 'root' });
  insert(menu, { id: 'm1', title: 'm1', parentId: 'r1', groupId: 'g1' });
  insert(menu, { id: 'm2', title: 'm2', parentId: 'r1', groupId: 'g2' });
});

afterAll(() => {
  db?.close();
});

describe('嵌套 EXISTS：每层关联到上一层的实体，而不是顶层主表', () => {
  it('一对多 → 一对多：存在文章、且该文章存在 body=hit 的评论', () => {
    const where = rules({
      field: 'posts',
      operator: 'exists',
      where: rules({ field: 'comments', operator: 'exists', where: rules({ field: 'body', operator: '=', value: 'hit' }) })
    });
    expect(find(NeAuthor, where)).toEqual(['a1']);
  });

  it('内层 notExists：存在没有 hit 评论的文章', () => {
    const where = rules({
      field: 'posts',
      operator: 'exists',
      where: rules({
        field: 'comments',
        operator: 'notExists',
        where: rules({ field: 'body', operator: '=', value: 'hit' })
      })
    });
    expect(find(NeAuthor, where)).toEqual(['a2', 'a3']);
  });

  it('一对多 → 多对多：存在打了 hot 标签的文章', () => {
    const where = rules({
      field: 'posts',
      operator: 'exists',
      where: rules({ field: 'tags', operator: 'exists', where: rules({ field: 'label', operator: '=', value: 'hot' }) })
    });
    expect(find(NeAuthor, where)).toEqual(['a1']);
  });

  it('多对一 → 一对多：所属文章另有 body=miss 的评论', () => {
    const where = rules({
      field: 'post',
      operator: 'exists',
      where: rules({ field: 'comments', operator: 'exists', where: rules({ field: 'body', operator: '=', value: 'miss' }) })
    });
    expect(find(NeComment, where)).toEqual(['c2']);
  });

  it('三层：作者 → 文章 → 评论 → 评论所属文章标题', () => {
    const where = rules({
      field: 'posts',
      operator: 'exists',
      where: rules({
        field: 'comments',
        operator: 'exists',
        where: rules({ field: 'post', operator: 'exists', where: rules({ field: 'title', operator: '=', value: 'P1' }) })
      })
    });
    expect(find(NeAuthor, where)).toEqual(['a1']);
  });

  it('多对一 → 多对一 → 一对一：评论的文章的作者有 bio=b1 的资料', () => {
    const where = rules({
      field: 'post',
      operator: 'exists',
      where: rules({
        field: 'author',
        operator: 'exists',
        where: rules({ field: 'profile', operator: 'exists', where: rules({ field: 'bio', operator: '=', value: 'b1' }) })
      })
    });
    expect(find(NeComment, where)).toEqual(['c1']);
  });
});

describe('EXISTS 子查询里的数组 / keyValue 列落在子查询的实体上', () => {
  it('子查询里 stringArray 的 in 读评论自己的 labels', () => {
    const where = rules({
      field: 'comments',
      operator: 'exists',
      where: rules({ field: 'labels', operator: 'in', value: ['x'] })
    });
    expect(find(NePost, where)).toEqual(['p1']);
  });

  it('子查询里 keyValue 的 contains 读评论自己的 meta', () => {
    const where = rules({
      field: 'comments',
      operator: 'exists',
      where: rules({ field: 'meta', operator: 'contains', value: { k: 'v' } })
    });
    expect(find(NePost, where)).toEqual(['p1']);
  });
});

describe('树查询的递归成员里用 EXISTS', () => {
  it('关联条件挂在递归成员别名上，只收所属分组名为 hit 的子孙', () => {
    const where = rules({
      field: 'group',
      operator: 'exists',
      where: rules({ field: 'name', operator: '=', value: 'hit' })
    });
    const { sql, params } = generate_entity_find_descendants_sql(adapter, getEntityMetadata(NeMenu), {
      entityId: 'r1',
      where
    });
    expect(idsOf(sql, params)).toEqual(['m1', 'r1']);
  });
});
