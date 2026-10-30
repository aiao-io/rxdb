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

  it('uses physical column names for mapped properties', () => {
    const { proxy, calls } = recordingQuery();
    const mappedMetadata = {
      propertyMap: new Map([['id', { columnName: 'todo_key' }]]),
      foreignKeyRelationMap: new Map()
    } as unknown as EntityMetadata;

    applyGroup(proxy, { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'a' }] }, mappedMetadata);

    expect(calls).toEqual([{ method: 'eq', args: ['todo_key', 'a'] }]);
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
      { method: 'not', args: ['children__1', 'is', null] },
      { method: 'is', args: ['children__2', null] }
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

  /**
   * exists 子查询里的 OR 必须作用在同一条关联行上：PostgREST 用 `<关系路径>.or=(...)`
   * 表达（postgrest-js 的 `or(filters, { referencedTable })`），子句里写的是该关系自己的列。
   * 逐条挂成 `<关系>.<列>=...` 就是 AND：「标题为 A 或 B」变成「标题同时是 A 和 B」，静默返回空集。
   */
  describe('OR inside an exists subquery', () => {
    const titleIs = (value: string): TestRule => ({ field: 'title', operator: '=', value });

    it('compiles a direct OR into one or-filter scoped to the relation', () => {
      const { proxy, calls } = recordingQuery();
      const post = {
        ...metadata('Post'),
        propertyMap: new Map([['id', { columnName: 'post_key' }]])
      } as unknown as EntityMetadata;
      const root = metadata('Root', [['posts', relation('Post')]]);

      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'posts',
              operator: 'exists',
              where: {
                combinator: 'or',
                rules: [titleIs('A'), titleIs('B'), { field: 'id', operator: '=', value: 'p1' }]
              }
            }
          ]
        },
        root,
        { getEntityMetadata: vi.fn(() => post) } as unknown as SchemaManager
      );

      expect(calls).toEqual([
        { method: 'not', args: ['posts', 'is', null] },
        { method: 'or', args: ['title.eq.A,title.eq.B,post_key.eq.p1', { referencedTable: 'posts' }] }
      ]);
    });

    it('keeps AND siblings as embedded filters and scopes the nested OR group', () => {
      const { proxy, calls } = recordingQuery();
      const root = metadata('Root', [['posts', relation('Post')]]);

      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'posts',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  { field: 'views', operator: '>=', value: 10 },
                  {
                    combinator: 'or',
                    rules: [
                      titleIs('A'),
                      { combinator: 'and', rules: [titleIs('B'), { field: 'draft', operator: '=', value: false }] }
                    ]
                  }
                ]
              }
            }
          ]
        },
        root,
        { getEntityMetadata: vi.fn(() => metadata('Post')) } as unknown as SchemaManager
      );

      expect(calls).toEqual([
        { method: 'not', args: ['posts', 'is', null] },
        { method: 'gte', args: ['posts.views', 10] },
        { method: 'or', args: ['title.eq.A,and(title.eq.B,draft.eq.false)', { referencedTable: 'posts' }] }
      ]);
    });

    it('scopes an OR two relations deep to the full embed path', () => {
      const { proxy, calls } = recordingQuery();
      const grandchild = metadata('Grandchild');
      const child = metadata('Child', [['grandchildren', relation('Grandchild')]]);
      const root = metadata('Root', [['children', relation('Child')]]);
      const getEntityMetadata = vi.fn((name: string) => (name === 'Child' ? child : grandchild));

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
                    operator: 'exists',
                    where: {
                      combinator: 'or',
                      rules: [
                        { field: 'name', operator: '=', value: 'G' },
                        { field: 'name', operator: '=', value: 'H' }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        },
        root,
        { getEntityMetadata } as unknown as SchemaManager
      );

      expect(calls).toEqual([
        { method: 'not', args: ['children', 'is', null] },
        { method: 'not', args: ['children.grandchildren', 'is', null] },
        { method: 'or', args: ['name.eq.G,name.eq.H', { referencedTable: 'children.grandchildren' }] }
      ]);
    });

    it('scopes notBetween (an OR in disguise) to the relation instead of a cross-table top-level or', () => {
      const { proxy, calls } = recordingQuery();
      const root = metadata('Root', [['children', relation('Child')]]);

      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [
            {
              field: 'children',
              operator: 'exists',
              where: { combinator: 'and', rules: [{ field: 'age', operator: 'notBetween', value: [1, 5] }] }
            }
          ]
        },
        root,
        { getEntityMetadata: vi.fn(() => metadata('Child')) } as unknown as SchemaManager
      );

      expect(calls).toEqual([
        { method: 'not', args: ['children', 'is', null] },
        { method: 'or', args: ['age.lt.1,age.gt.5', { referencedTable: 'children' }] }
      ]);
    });

    it('treats a single-rule OR group like AND', () => {
      const { proxy, calls } = recordingQuery();
      const root = metadata('Root', [['posts', relation('Post')]]);

      applyGroup(
        proxy,
        {
          combinator: 'and',
          rules: [{ field: 'posts', operator: 'exists', where: { combinator: 'or', rules: [titleIs('A')] } }]
        },
        root,
        { getEntityMetadata: vi.fn(() => metadata('Post')) } as unknown as SchemaManager
      );

      expect(calls).toEqual([
        { method: 'not', args: ['posts', 'is', null] },
        { method: 'eq', args: ['posts.title', 'A'] }
      ]);
    });

    it.each<[string, TestRule]>([
      ['a nested exists', { field: 'comments', operator: 'exists' }],
      ['a dotted relation field', { field: 'comments.body', operator: '=', value: 'x' }]
    ])('rejects %s inside the OR before any or-filter is built, like a top-level OR does', (_label, relationRule) => {
      const { proxy, calls } = recordingQuery();
      const post = metadata('Post', [['comments', relation('Comment')]]);
      const root = metadata('Root', [['posts', relation('Post')]]);

      expect(() =>
        applyGroup(
          proxy,
          {
            combinator: 'and',
            rules: [
              {
                field: 'posts',
                operator: 'exists',
                where: { combinator: 'or', rules: [titleIs('A'), relationRule] }
              }
            ]
          },
          root,
          { getEntityMetadata: vi.fn(() => post) } as unknown as SchemaManager
        )
      ).toThrow('Relation filters inside OR groups are not supported by PostgREST');
      expect(calls.some(call => call.method === 'or' || call.method === 'eq')).toBe(false);
    });
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

/**
 * 同一层里两条显式 exists 指向同一关系时，SQLite / PGlite 各编一个独立的 EXISTS 子查询：
 * 「存在一笔满足 A 的、也存在一笔满足 B 的」。PostgREST 把挂在同一条嵌入上的过滤当作对同一行的条件，
 * 落到同一个嵌入就成了「存在一笔同时满足 A 与 B 的」，静默漏行。每条 exists 要有自己的嵌入别名。
 */
describe('independent exists rules on the same relation', () => {
  const amountIs = (value: number): TestRule => ({ field: 'amount', operator: '=', value });

  it('gives each exists on the same relation its own embed alias', () => {
    const { proxy, calls } = recordingQuery();
    const root = metadata('Root', [['orders', relation('Order')]]);

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [
          { field: 'orders', operator: 'exists', where: { combinator: 'and', rules: [amountIs(100)] } },
          { field: 'orders', operator: 'exists', where: { combinator: 'and', rules: [amountIs(200)] } }
        ]
      },
      root,
      { getEntityMetadata: vi.fn(() => metadata('Order')) } as unknown as SchemaManager
    );

    expect(calls).toEqual([
      { method: 'not', args: ['orders__1', 'is', null] },
      { method: 'eq', args: ['orders__1.amount', 100] },
      { method: 'not', args: ['orders__2', 'is', null] },
      { method: 'eq', args: ['orders__2.amount', 200] }
    ]);
  });

  it('keeps the relation name for a sole exists and for dotted paths, aliasing explicit exists beside them', () => {
    const { proxy, calls } = recordingQuery();
    const root = metadata('Root', [
      ['orders', relation('Order')],
      ['tags', relation('Tag')]
    ]);

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [
          { field: 'orders.amount', operator: '=', value: 100 },
          { field: 'orders', operator: 'exists', where: { combinator: 'and', rules: [amountIs(200)] } },
          { field: 'tags', operator: 'exists' }
        ]
      },
      root,
      { getEntityMetadata: vi.fn(() => metadata('Order')) } as unknown as SchemaManager
    );

    expect(calls).toEqual([
      { method: 'not', args: ['orders', 'is', null] },
      { method: 'eq', args: ['orders.amount', 100] },
      { method: 'not', args: ['orders__1', 'is', null] },
      { method: 'eq', args: ['orders__1.amount', 200] },
      { method: 'not', args: ['tags', 'is', null] }
    ]);
  });

  it('aliases nested exists rules within their parent embed', () => {
    const { proxy, calls } = recordingQuery();
    const order = metadata('Order', [['items', relation('Item')]]);
    const root = metadata('Root', [['orders', relation('Order')]]);
    const getEntityMetadata = vi.fn((name: string) => (name === 'Order' ? order : metadata('Item')));
    const skuIs = (value: string): TestRule => ({ field: 'sku', operator: '=', value });

    applyGroup(
      proxy,
      {
        combinator: 'and',
        rules: [
          {
            field: 'orders',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [
                { field: 'items', operator: 'exists', where: { combinator: 'and', rules: [skuIs('A')] } },
                { field: 'items', operator: 'exists', where: { combinator: 'and', rules: [skuIs('B')] } }
              ]
            }
          }
        ]
      },
      root,
      { getEntityMetadata } as unknown as SchemaManager
    );

    expect(calls).toEqual([
      { method: 'not', args: ['orders', 'is', null] },
      { method: 'not', args: ['orders.items__1', 'is', null] },
      { method: 'eq', args: ['orders.items__1.sku', 'A'] },
      { method: 'not', args: ['orders.items__2', 'is', null] },
      { method: 'eq', args: ['orders.items__2.sku', 'B'] }
    ]);
  });
});
