import {
  getEntityMetadata,
  PropertyType,
  RxDB,
  RxDBError,
  SyncType,
  TreeAdjacencyListEntityBase,
  TreeEntity
} from '@aiao/rxdb';
import { MenuLarge, MenuSimple } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import {
  generate_entity_count_ancestors_sql,
  generate_entity_count_descendants_sql,
  generate_entity_find_ancestors_sql,
  generate_entity_find_descendants_sql,
  generate_tree_sql
} from '../../query/query_tree_sql.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

@TreeEntity({
  name: 'PglEncryptedTree',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true }],
  features: { tree: { type: 'adjacency-list' } }
})
class PglEncryptedTree extends TreeAdjacencyListEntityBase {}

const rxdb = new RxDB({
  dbName: `tree-sql-${Date.now()}`,
  entities: [MenuSimple, MenuLarge, PglEncryptedTree],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});
rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });

describe('query_tree_sql unit edges', () => {
  const metadata = getEntityMetadata(MenuSimple);
  const largeMeta = getEntityMetadata(MenuLarge);

  it('covers root/count/hasChildren and children.* where alias mapping', () => {
    const root = generate_tree_sql(adapter, metadata, { isCount: true });
    expect(root.sql).toContain('count(*) AS count');
    expect(root.sql).toContain('IS NULL');
    expect(root.params).toEqual([]);

    const withEntity = generate_tree_sql(adapter, metadata, {
      entityId: 'e1',
      isCount: true,
      level: 3,
      where: {
        combinator: 'and',
        rules: [
          { field: 'children.title', operator: '=', value: 'x' },
          { field: 'title', operator: '=', value: 'y' },
          {
            combinator: 'or',
            rules: [{ field: 'children.sortOrder', operator: '>', value: 1 }]
          }
        ]
      }
    });
    expect(withEntity.sql).toContain('(count(*) - 1) AS count');
    expect(withEntity.sql).toContain('children.');
    expect(withEntity.params).toContain('e1');

    const hasChildren = generate_tree_sql(adapter, largeMeta, {
      entityId: 'e2',
      hasChildren: true
    });
    expect(hasChildren.sql).toContain('hasChildren');

    const descendants = generate_entity_find_descendants_sql(adapter, largeMeta, {
      entityId: 'd0',
      level: 2
    } as never);
    expect(descendants.sql.toLowerCase()).toContain('with recursive');

    const ancestors = generate_entity_find_ancestors_sql(adapter, metadata, {
      entityId: 'a1',
      level: 2
    } as never);
    expect(ancestors.sql.toLowerCase()).toContain('with recursive');

    const countDesc = generate_entity_count_descendants_sql(adapter, metadata, {
      entityId: 'd1'
    } as never);
    expect(countDesc.sql).toContain('count');

    const countAnc = generate_entity_count_ancestors_sql(adapter, metadata, {
      entityId: 'a2'
    } as never);
    expect(countAnc.sql).toContain('count');
  });

  it('level 未设置时按 FindTreeOptions 契约仅返回当前节点', () => {
    const sql = generate_tree_sql(adapter, metadata, { entityId: 'n1' }).sql;

    expect(sql).toContain('c.level < 0');
  });

  it('拒绝通过 children 别名过滤当前树实体的加密列', () => {
    expect(() =>
      generate_tree_sql(adapter, getEntityMetadata(PglEncryptedTree), {
        entityId: 'n1',
        where: { combinator: 'and', rules: [{ field: 'children.secret', operator: '=', value: 'plaintext' }] }
      })
    ).toThrow(expect.objectContaining({ name: 'EncryptedQueryError', code: 'where_on_encrypted', property: 'secret' }));
  });

  it('level 非法时抛错，绝不把原值拼进 SQL', () => {
    const injection = '1; DROP TABLE menu_simple --' as unknown as number;

    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: injection })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: 101 })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: -1 })).toThrow(RxDBError);
    expect(() => generate_tree_sql(adapter, metadata, { entityId: 'n1', level: 1.5 })).toThrow(RxDBError);
  });

  it('defaults parent column when parent relation missing', () => {
    const clone = Object.create(metadata) as typeof metadata;
    Object.defineProperty(clone, 'relationMap', {
      value: new Map(),
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(clone, 'propertyMap', {
      value: metadata.propertyMap,
      enumerable: true,
      configurable: true
    });
    const sql = generate_tree_sql(adapter, clone, { isCount: true }).sql;
    expect(sql).toContain('"parentId" IS NULL');
  });

  // PGL-005：`const isFindRoot = !entityId` 是 truthy 判断 ——
  // 整数主键 `0` 会被当成「没传 entityId」，整条查询退化成根节点查询。
  // sqlite-core 同位置用的是 `entityId == null`（nullish），两边语义不一致。
  it('整数主键 0 必须按具体节点查询，而不是退化成根查询', () => {
    const zero = generate_tree_sql(adapter, metadata, { entityId: 0 as never });

    expect(zero.sql).toContain('id = $1');
    expect(zero.sql).not.toContain('IS NULL');
    expect(zero.params).toEqual([0]);
  });

  it('未传 entityId 时仍走根查询', () => {
    const root = generate_tree_sql(adapter, metadata, {});

    expect(root.sql).toContain('IS NULL');
    expect(root.params).toEqual([]);
  });
});
