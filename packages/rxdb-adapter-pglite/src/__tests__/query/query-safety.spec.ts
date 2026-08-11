import {
  Entity,
  EntityBase,
  getEntityMetadata,
  type OrderBy,
  PropertyType,
  RelationKind,
  type RuleGroup,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { build_rule_group_join_pg } from '../../query/join_sql.js';
import { buildRuleGroupPG, generate_count_sql, generate_find_sql } from '../../query/query_sql.js';

@Entity({
  name: 'PGliteQuerySafetyParent',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class PGliteQuerySafetyParent extends EntityBase {}

@Entity({
  name: 'PGliteQuerySafetyChild',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'reserved', columnName: 'select', type: PropertyType.string, nullable: true },
    { name: 'payload', type: PropertyType.json, nullable: true },
    { name: 'tags', type: PropertyType.stringArray, nullable: true },
    { name: 'scores', type: PropertyType.numberArray, nullable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PGliteQuerySafetyParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class PGliteQuerySafetyChild extends EntityBase {}

const createAdapter = (): RxDBAdapterPGlite => {
  const rxdb = new RxDB({
    context: {},
    dbName: 'pglite-query-safety',
    entities: [PGliteQuerySafetyParent, PGliteQuerySafetyChild],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new RxDBAdapterPGlite(rxdb, { store: 'memory' });
};

const asRuleGroup = (value: unknown): RuleGroup => value as RuleGroup;

const buildRuntimeWhere = (value: unknown): string =>
  buildRuleGroupPG(asRuleGroup(value), [], new Map(), getEntityMetadata(PGliteQuerySafetyChild));

describe('query SQL runtime validation', () => {
  it.each([null, { combinator: 1, rules: [] }, { combinator: 'and', rules: 'invalid' }])(
    'rejects invalid rule groups: %j',
    value => {
      expect(() => buildRuntimeWhere(value)).toThrow(/rule group/i);
    }
  );

  it.each([null, { field: 1, operator: '=', value: 'x' }, { field: 'name', operator: 1, value: 'x' }])(
    'rejects invalid rules: %j',
    value => {
      expect(() => buildRuntimeWhere({ combinator: 'and', rules: [value] })).toThrow(/rule/i);
    }
  );

  it('rejects unknown operators instead of interpolating them into SQL', () => {
    expect(() =>
      buildRuntimeWhere({
        combinator: 'and',
        rules: [{ field: 'name', operator: '= TRUE; DROP TABLE users; --', value: 'x' }]
      })
    ).toThrow(/operator/i);
  });

  it('rejects invalid sort directions', () => {
    const adapter = createAdapter();
    const orderBy = [{ field: 'name', sort: 'ASC; DROP TABLE users; --' }] as unknown as OrderBy[];

    expect(() =>
      generate_find_sql(adapter, getEntityMetadata(PGliteQuerySafetyChild), {
        where: { combinator: 'and', rules: [] },
        orderBy
      })
    ).toThrow(/sort/i);
  });

  it('quotes lowercase reserved column names', () => {
    const adapter = createAdapter();
    const result = generate_find_sql(adapter, getEntityMetadata(PGliteQuerySafetyChild), {
      where: { combinator: 'and', rules: [{ field: 'reserved', operator: '=', value: 'x' }] }
    });

    expect(result.sql).toContain('"select" = $1');
  });

  it('rejects unknown metadata fields', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'missing', operator: '=', value: 'x' }] })
    ).toThrow(/field/i);
  });

  it('rejects unsafe JSON path segments', () => {
    expect(() =>
      buildRuntimeWhere({
        combinator: 'and',
        rules: [{ field: "payload.name' OR TRUE --", operator: '=', value: 'x' }]
      })
    ).toThrow(/field|path/i);
  });

  it('rejects non-array values for in', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'in', value: 'x' }] })
    ).toThrow(/array/i);
  });

  it('rejects non-pair values for between', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'between', value: ['x'] }] })
    ).toThrow(/between/i);
  });

  it('rejects operators that require a missing value', () => {
    expect(() => buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'name', operator: '=' }] })).toThrow(
      /requires a value/i
    );
  });

  it('rejects null for operators without null semantics', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'name', operator: '>', value: null }] })
    ).toThrow(/does not accept null/i);
  });

  it('rejects non-string pattern values', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'contains', value: ['x'] }] })
    ).toThrow(/string value/i);
  });

  it.each([
    ['contains', '"payload" @> $1::jsonb'],
    ['notContains', 'NOT ("payload" @> $1::jsonb)']
  ])('parameterizes JSON %s values', (operator, expectedSql) => {
    const params: unknown[] = [];
    const sql = buildRuleGroupPG(
      asRuleGroup({ combinator: 'and', rules: [{ field: 'payload', operator, value: { active: true } }] }),
      params,
      new Map(),
      getEntityMetadata(PGliteQuerySafetyChild)
    );

    expect(sql).toBe(expectedSql);
    expect(params).toEqual(['{"active":true}']);
  });

  it('rejects non-object JSON containment values', () => {
    expect(() =>
      buildRuntimeWhere({
        combinator: 'and',
        rules: [{ field: 'payload', operator: 'contains', value: ['not-an-object'] }]
      })
    ).toThrow(/object value/i);
  });

  it.each([
    ['tags', 'in', ['a', 'b'], '"tags" @> $1::text[]'],
    ['tags', 'notIn', ['a'], 'NOT "tags" @> $1::text[]'],
    ['scores', 'in', [1, 2], '"scores" @> $1::numeric[]'],
    ['scores', 'notIn', [3], 'NOT "scores" @> $1::numeric[]']
  ])('uses PostgreSQL array containment for %s %s', (field, operator, value, expectedSql) => {
    const params: unknown[] = [];
    const sql = buildRuleGroupPG(
      asRuleGroup({ combinator: 'and', rules: [{ field, operator, value }] }),
      params,
      new Map(),
      getEntityMetadata(PGliteQuerySafetyChild)
    );

    expect(sql).toBe(expectedSql);
    expect(params).toEqual([value]);
  });

  it('quotes safe fields and rejects unsafe fields without metadata', () => {
    const params: unknown[] = [];
    expect(
      buildRuleGroupPG(
        asRuleGroup({ combinator: 'and', rules: [{ field: 'safe_name', operator: '=', value: 'x' }] }),
        params
      )
    ).toBe('"safe_name" = $1');
    expect(params).toEqual(['x']);

    expect(() =>
      buildRuleGroupPG(
        asRuleGroup({ combinator: 'and', rules: [{ field: 'name" OR TRUE --', operator: '=', value: 'x' }] }),
        []
      )
    ).toThrow(/query field/i);
  });

  it('rejects invalid combinators', () => {
    expect(() =>
      buildRuntimeWhere({ combinator: 'and) OR TRUE --', rules: [{ field: 'name', operator: '=', value: 'x' }] })
    ).toThrow(/combinator/i);
  });

  it('uses a PostgreSQL path array for nested JSON fields', () => {
    const adapter = createAdapter();
    const { fieldAliasMap } = build_rule_group_join_pg(adapter, getEntityMetadata(PGliteQuerySafetyChild), {
      combinator: 'and',
      rules: [{ field: 'payload.nested.value', operator: '=', value: 'x' }]
    });

    expect(fieldAliasMap.get('payload.nested.value')?.text).toContain(`#>> '{nested,value}'`);
  });

  it('does not mutate a where tree while resolving direct foreign keys', () => {
    const adapter = createAdapter();
    const where = asRuleGroup({
      combinator: 'and',
      rules: [{ field: 'parent.id', operator: '=', value: 'parent-1' }]
    });
    const snapshot = structuredClone(where);

    build_rule_group_join_pg(adapter, getEntityMetadata(PGliteQuerySafetyChild), where);

    expect(where).toEqual(snapshot);
  });

  it('rejects groupBy in count queries', () => {
    const adapter = createAdapter();

    expect(() =>
      generate_count_sql(adapter, getEntityMetadata(PGliteQuerySafetyChild), {
        where: { combinator: 'and', rules: [] },
        groupBy: ['name']
      })
    ).toThrow(/groupBy not supported/i);
  });
});
