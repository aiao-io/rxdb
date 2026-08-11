import {
  Entity,
  EntityBase,
  EntityMetadata,
  EntityPropertyMetadata,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { buildRuleGroupPG, generate_count_sql, generate_find_sql } from '../../query/query_sql.js';

@Entity({
  name: 'QueryResidualParent',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class QueryResidualParent extends EntityBase {}

@Entity({
  name: 'QueryResidualChild',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'uid', type: PropertyType.uuid, nullable: true },
    { name: 'payload', type: PropertyType.json, nullable: true },
    { name: 'meta', type: PropertyType.keyValue, nullable: true, properties: [] },
    { name: 'tags', type: PropertyType.stringArray, nullable: true },
    { name: 'scores', type: PropertyType.numberArray, nullable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'QueryResidualParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class QueryResidualChild extends EntityBase {}

const createAdapter = (): RxDBAdapterPGlite => {
  const rxdb = new RxDB({
    context: {},
    dbName: `query-sql-residual-${Date.now()}`,
    entities: [QueryResidualParent, QueryResidualChild],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new RxDBAdapterPGlite(rxdb, { store: 'memory' });
};

describe('query_sql residual branches', () => {
  it('resolves foreign-key property names and rejects unknown fields', () => {
    const meta = getEntityMetadata(QueryResidualChild);
    const params: unknown[] = [];
    const fkField = meta.foreignKeyNames?.[0];
    expect(fkField).toBeTruthy();

    const sql = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: fkField!, operator: '=', value: 'p1' }] } as never,
      params,
      new Map(),
      meta
    );
    expect(sql).toContain('= $1');
    expect(params).toEqual(['p1']);

    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'missing_field', operator: '=', value: 1 }] } as never,
        [],
        new Map(),
        meta
      )
    ).toThrow(/Unknown query field/);

    // foreignKeyNames / foreignKeyColumnNames 的 nullish coalesce 分支。
    const bareMeta = {
      propertyMap: new Map(),
      foreignKeyNames: undefined,
      foreignKeyColumnNames: undefined
    } as unknown as EntityMetadata;
    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'anyFk', operator: '=', value: 1 }] } as never,
        [],
        new Map(),
        bareMeta
      )
    ).toThrow(/Unknown query field/);

    const fkOnly = {
      propertyMap: new Map(),
      foreignKeyNames: ['parentId'],
      foreignKeyColumnNames: undefined
    } as unknown as EntityMetadata;
    const fkParams: unknown[] = [];
    const fkSql = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: 'x' }] } as never,
      fkParams,
      new Map(),
      fkOnly
    );
    expect(fkSql).toContain('= $1');
    expect(fkParams).toEqual(['x']);
  });

  it('builds json path operators and uuid cast comparisons', () => {
    const meta = getEntityMetadata(QueryResidualChild);
    const params: unknown[] = [];

    const single = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'payload.k', operator: '=', value: 'v' }] } as never,
      params,
      new Map(),
      meta
    );
    expect(single).toContain('->>');

    const nested = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'payload.a.b', operator: '=', value: 'v2' }] } as never,
      params,
      new Map(),
      meta
    );
    expect(nested).toContain('#>>');

    const uuidSql = buildRuleGroupPG(
      {
        combinator: 'and',
        rules: [{ field: 'uid', operator: '=', value: '00000000-0000-0000-0000-000000000001' }]
      } as never,
      params,
      new Map(),
      meta
    );
    expect(uuidSql).toContain('::uuid');

    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'parent.title', operator: '=', value: 'x' }] } as never,
        [],
        new Map(),
        meta
      )
    ).toThrow(/Unknown relation query field/);
  });

  it('covers dotted fields without metadata and array notIn branches', () => {
    const params: unknown[] = [];
    const dotted = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'schema.col', operator: '=', value: 1 }] } as never,
      params
    );
    expect(dotted).toContain('"schema"."col"');

    const meta = {
      propertyMap: new Map([
        ['tags', { type: PropertyType.stringArray, columnName: 'tags' } as EntityPropertyMetadata],
        ['scores', { type: PropertyType.numberArray, columnName: 'scores' } as EntityPropertyMetadata],
        ['meta', { type: PropertyType.keyValue, columnName: 'meta' } as EntityPropertyMetadata]
      ])
    } as EntityMetadata;

    const notInArr = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'tags', operator: 'notIn', value: ['a'] }] } as never,
      params,
      new Map(),
      meta
    );
    expect(notInArr).toContain('NOT');
    expect(notInArr).toContain('text[]');

    const numArr = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'scores', operator: 'in', value: [1, 2] }] } as never,
      params,
      new Map(),
      meta
    );
    expect(numArr).toContain('numeric[]');

    const notContains = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'meta', operator: 'notContains', value: { a: 1 } }] } as never,
      params,
      new Map(),
      meta
    );
    expect(notContains).toContain('NOT');
    expect(notContains).toContain('@>');

    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'tags', operator: 'in', value: 'not-an-array' }] } as never,
        [],
        new Map(),
        meta
      )
    ).toThrow(/requires an array value/);

    const notStarts = buildRuleGroupPG(
      { combinator: 'and', rules: [{ field: 'title', operator: 'notStartsWith', value: 'pre' }] } as never,
      params,
      new Map(),
      {
        propertyMap: new Map([['title', { type: PropertyType.string, columnName: 'title' } as EntityPropertyMetadata]])
      } as EntityMetadata
    );
    expect(notStarts).toContain('NOT LIKE');
    expect(params.at(-1)).toBe('pre%');
  });

  it('generate_find_sql/count cover orderBy and no-where paths', () => {
    const adapter = createAdapter();
    const meta = getEntityMetadata(QueryResidualChild);

    const findAll = generate_find_sql(adapter, meta, {
      orderBy: [{ field: 'title', sort: 'desc' }]
    } as never);
    expect(findAll.sql).toContain('ORDER BY');
    expect(findAll.sql).toContain('DESC');

    expect(() =>
      generate_find_sql(adapter, meta, {
        orderBy: [{ field: 'payload.k', sort: 'asc' }]
      } as never)
    ).toThrow(/Invalid direct query field/);

    const findWhere = generate_find_sql(adapter, meta, {
      where: { combinator: 'and', rules: [{ field: 'title', operator: 'endsWith', value: 'z' }] },
      limit: 5,
      offset: 1
    } as never);
    expect(findWhere.sql).toContain('LIKE');
    expect(findWhere.params[0]).toBe('%z');
    expect(findWhere.sql).toMatch(/LIMIT|OFFSET/i);

    const count = generate_count_sql(adapter, meta, {} as never);
    expect(count.sql.toLowerCase()).toContain('count');
  });
});
