import type { EntityMetadata, EntityRelationMetadata, RuleGroup, SchemaManager } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { apply_rule_group } from '../rule_group_builder.js';

interface QueryCall {
  method: string;
  args: unknown[];
}

interface TestRule {
  field: string;
  operator: string;
  value?: unknown;
  where?: TestRuleGroup;
}

interface TestRuleGroup {
  combinator: 'and' | 'or';
  rules: Array<TestRule | TestRuleGroup>;
}

function recordingQuery() {
  const calls: QueryCall[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return proxy;
        };
      }
    }
  );
  return { proxy, calls };
}

function applyGroup(
  query: unknown,
  group: TestRuleGroup,
  metadata?: EntityMetadata,
  schemaManager?: SchemaManager
): unknown {
  return apply_rule_group(query, group as unknown as RuleGroup<Record<string, unknown>>, metadata, schemaManager);
}

function metadata(name: string, relations: Array<[string, EntityRelationMetadata]> = []): EntityMetadata {
  return {
    name,
    tableName: name.toLowerCase(),
    relationMap: new Map(relations)
  } as unknown as EntityMetadata;
}

function relation(mappedEntity: string, mappedNamespace?: string): EntityRelationMetadata {
  return { mappedEntity, mappedNamespace } as unknown as EntityRelationMetadata;
}

describe('apply_rule_group', () => {
  it('returns the original query for an empty group', () => {
    const { proxy, calls } = recordingQuery();

    expect(applyGroup(proxy, { combinator: 'and', rules: [] })).toBe(proxy);
    expect(calls).toEqual([]);
  });

  it.each<{
    name: string;
    rule: TestRule;
    call: QueryCall;
  }>([
    { name: 'equals', rule: { field: 'age', operator: '=', value: 18 }, call: { method: 'eq', args: ['age', 18] } },
    {
      name: 'equals null',
      rule: { field: 'age', operator: '=', value: null },
      call: { method: 'is', args: ['age', null] }
    },
    {
      name: 'not equals',
      rule: { field: 'age', operator: '!=', value: 18 },
      call: { method: 'neq', args: ['age', 18] }
    },
    {
      name: 'not equals null',
      rule: { field: 'age', operator: '!=', value: null },
      call: { method: 'not', args: ['age', 'is', null] }
    },
    { name: 'less than', rule: { field: 'age', operator: '<', value: 18 }, call: { method: 'lt', args: ['age', 18] } },
    {
      name: 'greater than',
      rule: { field: 'age', operator: '>', value: 18 },
      call: { method: 'gt', args: ['age', 18] }
    },
    {
      name: 'less than or equal',
      rule: { field: 'age', operator: '<=', value: 18 },
      call: { method: 'lte', args: ['age', 18] }
    },
    {
      name: 'greater than or equal',
      rule: { field: 'age', operator: '>=', value: 18 },
      call: { method: 'gte', args: ['age', 18] }
    },
    {
      name: 'in',
      rule: { field: 'age', operator: 'in', value: [18, 21] },
      call: { method: 'in', args: ['age', [18, 21]] }
    },
    {
      name: 'not in',
      rule: { field: 'tag', operator: 'notIn', value: ['a,b', 'c'] },
      call: { method: 'not', args: ['tag', 'in', '("a,b",c)'] }
    },
    {
      name: 'contains',
      rule: { field: 'name', operator: 'contains', value: 'iao' },
      call: { method: 'ilike', args: ['name', '%iao%'] }
    },
    {
      name: 'includes',
      rule: { field: 'name', operator: 'includes', value: 'iao' },
      call: { method: 'ilike', args: ['name', '%iao%'] }
    },
    {
      name: 'not contains',
      rule: { field: 'name', operator: 'notContains', value: 'iao' },
      call: { method: 'not', args: ['name', 'ilike', '%iao%'] }
    },
    {
      name: 'starts with',
      rule: { field: 'name', operator: 'startsWith', value: 'ai' },
      call: { method: 'ilike', args: ['name', 'ai%'] }
    },
    {
      name: 'not starts with',
      rule: { field: 'name', operator: 'notStartsWith', value: 'ai' },
      call: { method: 'not', args: ['name', 'ilike', 'ai%'] }
    },
    {
      name: 'ends with',
      rule: { field: 'name', operator: 'endsWith', value: 'ao' },
      call: { method: 'ilike', args: ['name', '%ao'] }
    },
    {
      name: 'not ends with',
      rule: { field: 'name', operator: 'notEndsWith', value: 'ao' },
      call: { method: 'not', args: ['name', 'ilike', '%ao'] }
    },
    { name: 'null', rule: { field: 'name', operator: 'null' }, call: { method: 'is', args: ['name', null] } },
    { name: 'is null', rule: { field: 'name', operator: 'isNull' }, call: { method: 'is', args: ['name', null] } },
    {
      name: 'not null',
      rule: { field: 'name', operator: 'notNull' },
      call: { method: 'not', args: ['name', 'is', null] }
    },
    {
      name: 'is not null',
      rule: { field: 'name', operator: 'isNotNull' },
      call: { method: 'not', args: ['name', 'is', null] }
    }
  ])('applies $name through the query builder', ({ rule, call }) => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, { combinator: 'and', rules: [rule] });

    expect(calls).toEqual([call]);
  });

  it('normalizes dates and date arrays', () => {
    const { proxy, calls } = recordingQuery();
    const first = new Date('2026-07-10T00:00:00.000Z');
    const second = new Date('2026-07-11T00:00:00.000Z');

    applyGroup(proxy, {
      combinator: 'and',
      rules: [
        { field: 'createdAt', operator: '>=', value: first },
        { field: 'updatedAt', operator: 'in', value: [first, second] }
      ]
    });

    expect(calls).toEqual([
      { method: 'gte', args: ['createdAt', first.toISOString()] },
      { method: 'in', args: ['updatedAt', [first.toISOString(), second.toISOString()]] }
    ]);
  });

  it('applies between and notBetween bounds', () => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, {
      combinator: 'and',
      rules: [
        { field: 'age', operator: 'between', value: [18, 30] },
        { field: 'name', operator: 'notBetween', value: ['a,1', 'z,9'] }
      ]
    });

    expect(calls).toEqual([
      { method: 'gte', args: ['age', 18] },
      { method: 'lte', args: ['age', 30] },
      { method: 'or', args: ['name.lt."a,1",name.gt."z,9"'] }
    ]);
  });

  it.each(['between', 'notBetween'])('rejects invalid %s bounds', operator => {
    const { proxy } = recordingQuery();

    expect(() =>
      applyGroup(proxy, {
        combinator: 'and',
        rules: [{ field: 'age', operator, value: [18] }]
      })
    ).toThrow(`${operator} operator requires a two-item array`);
  });

  it('rejects unsupported field operators', () => {
    const { proxy } = recordingQuery();

    expect(() =>
      applyGroup(proxy, {
        combinator: 'and',
        rules: [{ field: 'name', operator: 'unknown', value: 'x' }]
      })
    ).toThrow('Unsupported operator: unknown');
  });

  it('applies nested single and multi-rule groups', () => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, {
      combinator: 'and',
      rules: [
        {
          combinator: 'and',
          rules: [{ field: 'enabled', operator: '=', value: true }]
        },
        {
          combinator: 'and',
          rules: [
            { field: 'age', operator: '>=', value: 18 },
            { field: 'age', operator: '<=', value: 30 }
          ]
        }
      ]
    });

    expect(calls).toEqual([
      { method: 'eq', args: ['enabled', true] },
      { method: 'gte', args: ['age', 18] },
      { method: 'lte', args: ['age', 30] }
    ]);
  });

  it('builds escaped OR filters for comparisons, lists, and patterns', () => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, {
      combinator: 'or',
      rules: [
        { field: 'name', operator: '=', value: 'A,"B"\\C' },
        { field: 'tag', operator: 'in', value: ['a,b', 'c'] },
        { field: 'description', operator: 'contains', value: 'x,y' },
        { field: 'prefix', operator: 'startsWith', value: 'pre' },
        { field: 'suffix', operator: 'endsWith', value: 'fix' }
      ]
    });

    expect(calls).toEqual([
      {
        method: 'or',
        args: [
          'name.eq."A,\\"B\\"\\\\C",tag.in.("a,b",c),description.ilike."*x,y*",prefix.ilike.pre*,suffix.ilike.*fix'
        ]
      }
    ]);
  });

  it('rejects non-array OR in values and unsupported OR operators', () => {
    const first = recordingQuery();
    const second = recordingQuery();

    expect(() =>
      applyGroup(first.proxy, {
        combinator: 'or',
        rules: [
          { field: 'tag', operator: 'in', value: 'x' },
          { field: 'age', operator: '>', value: 1 }
        ]
      })
    ).toThrow('IN operator requires array');
    expect(() =>
      applyGroup(second.proxy, {
        combinator: 'or',
        rules: [
          { field: 'tag', operator: 'unknown', value: 'x' },
          { field: 'age', operator: '>', value: 1 }
        ]
      })
    ).toThrow('Unsupported operator: unknown');
  });

  it('preserves nested AND and OR groups in an OR filter', () => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, {
      combinator: 'or',
      rules: [
        {
          combinator: 'and',
          rules: [
            { field: 'age', operator: '>=', value: 18 },
            { field: 'age', operator: '<=', value: 30 }
          ]
        },
        {
          combinator: 'or',
          rules: [
            { field: 'status', operator: '=', value: 'active' },
            { field: 'status', operator: 'isNull' }
          ]
        }
      ]
    });

    expect(calls).toEqual([
      {
        method: 'or',
        args: ['and(age.gte.18,age.lte.30),or(status.eq.active,status.is.null)']
      }
    ]);
  });

  it.each<{
    name: string;
    rule: TestRule;
    filter: string;
  }>([
    { name: 'equals null', rule: { field: 'value', operator: '=', value: null }, filter: 'value.is.null' },
    { name: 'not equals null', rule: { field: 'value', operator: '!=', value: null }, filter: 'value.not.is.null' },
    {
      name: 'not in',
      rule: { field: 'value', operator: 'notIn', value: ['a,b', 'c'] },
      filter: 'value.not.in.("a,b",c)'
    },
    {
      name: 'between',
      rule: { field: 'value', operator: 'between', value: [1, 5] },
      filter: 'and(value.gte.1,value.lte.5)'
    },
    {
      name: 'not between',
      rule: { field: 'value', operator: 'notBetween', value: [1, 5] },
      filter: 'or(value.lt.1,value.gt.5)'
    },
    {
      name: 'not contains',
      rule: { field: 'value', operator: 'notContains', value: 'x,y' },
      filter: 'value.not.ilike."*x,y*"'
    },
    {
      name: 'not starts with',
      rule: { field: 'value', operator: 'notStartsWith', value: 'x' },
      filter: 'value.not.ilike.x*'
    },
    {
      name: 'not ends with',
      rule: { field: 'value', operator: 'notEndsWith', value: 'x' },
      filter: 'value.not.ilike.*x'
    },
    { name: 'null', rule: { field: 'value', operator: 'null' }, filter: 'value.is.null' },
    { name: 'not null', rule: { field: 'value', operator: 'notNull' }, filter: 'value.not.is.null' }
  ])('emits OR $name with the same semantics as AND', ({ rule, filter }) => {
    const { proxy, calls } = recordingQuery();

    applyGroup(proxy, {
      combinator: 'or',
      rules: [rule, { field: 'anchor', operator: '=', value: true }]
    });

    expect(calls).toEqual([{ method: 'or', args: [`${filter},anchor.eq.true`] }]);
  });

  it('expands dotted relation fields with resolved relation metadata', () => {
    const { proxy, calls } = recordingQuery();
    const child = metadata('Child');
    const root = metadata('Root', [['children', relation('Child', 'tenant')]]);
    const getEntityMetadata = vi.fn(() => child);
    const schemaManager = { getEntityMetadata } as unknown as SchemaManager;

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [{ field: 'children.name', operator: '=', value: 'A' }]
      },
      root,
      schemaManager
    );

    expect(getEntityMetadata).toHaveBeenCalledWith('Child', 'tenant');
    expect(calls).toEqual([
      { method: 'not', args: ['children', 'is', null] },
      { method: 'eq', args: ['children.name', 'A'] }
    ]);
  });

  it('supports exists and notExists without nested conditions', () => {
    const { proxy, calls } = recordingQuery();
    const root = metadata('Root', [['children', relation('Child')]]);

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [
          { field: 'children', operator: 'exists' },
          { field: 'children', operator: 'notExists' }
        ]
      },
      root
    );

    expect(calls).toEqual([
      { method: 'not', args: ['children', 'is', null] },
      { method: 'is', args: ['children', null] }
    ]);
  });

  /**
   * SUPA-007：带子条件的 `notExists` 在 PostgREST 上无法表达（没有 anti-join），
   * 从前的实现把子条件当**正向**过滤挂上去，父行全返回 —— 与请求语义相反且不报错。
   * 这两条锁的是「拒绝发生在构造查询时」：`calls` 必须为空，一次请求都不该发出去。
   */
  it('rejects notExists carrying a where clause', () => {
    const { proxy, calls } = recordingQuery();
    const child = metadata('Child');
    const root = metadata('Root', [['children', relation('Child')]]);

    expect(() =>
      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'notExists',
              where: { combinator: 'and', rules: [{ field: 'age', operator: '>=', value: 18 }] }
            }
          ]
        },
        root,
        { getEntityMetadata: vi.fn(() => child) } as unknown as SchemaManager
      )
    ).toThrow(/notExists with a where clause is not supported/);
    expect(calls).toEqual([]);
  });

  it('rejects a nested notExists carrying a where clause', () => {
    const { proxy, calls } = recordingQuery();
    const grandchild = metadata('Grandchild');
    const child = metadata('Child', [['grandchildren', relation('Grandchild')]]);
    const root = metadata('Root', [['children', relation('Child')]]);
    const getEntityMetadata = vi.fn((name: string) => (name === 'Child' ? child : grandchild));

    expect(() =>
      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'grandchildren',
                    operator: 'notExists',
                    where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'G' }] }
                  }
                ]
              }
            }
          ]
        },
        root,
        { getEntityMetadata } as unknown as SchemaManager
      )
    ).toThrow(/notExists with a where clause is not supported/);

    // 外层 exists 的否定已经挂上，但内层一发现 notExists+where 就中止，不再往下拼
    expect(calls).toEqual([{ method: 'not', args: ['children', 'is', null] }]);
  });

  it('applies nested relation groups and resolves missing mapped namespace to empty', () => {
    const { proxy, calls } = recordingQuery();
    const grandchild = metadata('Grandchild');
    const child = metadata('Child', [['grandchildren', relation('Grandchild')]]);
    const root = metadata('Root', [['children', relation('Child')]]);
    const getEntityMetadata = vi.fn((name: string) => (name === 'Child' ? child : grandchild));
    const schemaManager = { getEntityMetadata } as unknown as SchemaManager;

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [
          {
            field: 'children',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [
                {
                  combinator: 'and',
                  rules: [{ field: 'age', operator: '>=', value: 18 }]
                },
                {
                  field: 'grandchildren',
                  operator: 'exists',
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'name', operator: '=', value: 'G' }]
                  }
                }
              ]
            }
          }
        ]
      },
      root,
      schemaManager
    );

    expect(getEntityMetadata).toHaveBeenCalledWith('Child', '');
    expect(getEntityMetadata).toHaveBeenCalledWith('Grandchild', '');
    expect(calls).toEqual([
      { method: 'not', args: ['children', 'is', null] },
      { method: 'gte', args: ['children.age', 18] },
      { method: 'not', args: ['children.grandchildren', 'is', null] },
      { method: 'eq', args: ['children.grandchildren.name', 'G'] }
    ]);
  });

  it('rejects unresolved root and nested relations', () => {
    const first = recordingQuery();
    const second = recordingQuery();
    const child = metadata('Child');
    const root = metadata('Root', [['children', relation('Child')]]);

    expect(() =>
      applyGroup(first.proxy, {
        combinator: 'and',
        rules: [{ field: 'missing', operator: 'exists' }]
      })
    ).toThrow("Relation 'missing' not found in 'unknown'");
    expect(() =>
      applyGroup(
        second.proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [{ field: 'missing', operator: 'exists' }]
              }
            }
          ]
        },
        root,
        { getEntityMetadata: vi.fn(() => child) } as unknown as SchemaManager
      )
    ).toThrow("Relation 'missing' not found in Child");
  });
});
