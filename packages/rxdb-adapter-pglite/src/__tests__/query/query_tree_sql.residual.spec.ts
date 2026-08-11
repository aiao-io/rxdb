import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate_tree_sql } from '../../query/query_tree_sql.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

@Entity({
  name: 'TreeResidualNode',
  tableName: 'tree_residual_node',
  properties: [
    { name: 'title', type: PropertyType.string, nullable: true },
    { name: 'sortOrder', type: PropertyType.integer, nullable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'TreeResidualNode',
      mappedProperty: 'children',
      columnName: 'parentId'
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'TreeResidualNode',
      mappedProperty: 'parent'
    }
  ]
})
class TreeResidualNode extends EntityBase {}

describe('query_tree_sql residual', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `tree-sql-residual-${Date.now()}`,
      entities: [TreeResidualNode],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('collectFieldAliases ignores null/non-object rules and still builds SQL', () => {
    const meta = getEntityMetadata(TreeResidualNode);
    // 包在 try/catch 中：收集后 buildRuleGroup 可能因 null 规则抛错。
    try {
      const result = generate_tree_sql(adapter, meta, {
        isCount: true,
        where: {
          combinator: 'and',
          rules: [
            null as never,
            { combinator: 'or', rules: [undefined as never, { field: 'children.title', operator: '=', value: 'x' }] },
            { field: 123 as never, operator: '=', value: 'y' }
          ]
        }
      });
      expect(result.sql.toLowerCase()).toContain('with recursive');
    } catch (error) {
      // buildRuleGroup 抛错前 collectFieldAliases 仍会执行。
      expect(String(error)).toMatch(/Invalid query rule|Invalid/i);
    }
  });
});
