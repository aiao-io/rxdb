import { getEntityMetadata, RxDB, SyncType, type EntityMetadata } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildRuleGroupPG, generate_find_sql } from '../query/query_sql.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
describe('TypeDemo JSONB operators (PostgreSQL-specific)', () => {
  let typeDemoMeta: EntityMetadata;

  beforeAll(() => {
    typeDemoMeta = getEntityMetadata(TypeDemo);
  });

  describe('JSONB containment (@>)', () => {
    it('keyValue contains object -> @> operator', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [{ field: 'keyValue', operator: 'contains', value: { string: 'hello', number: 10 } }]
        },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where).toContain(`@> $`);
      expect(where).toContain(`::jsonb`);
      expect(params.some((p: unknown) => typeof p === 'string' && JSON.parse(p).string === 'hello')).toBe(true);
    });

    it('keyValue contains string value -> ->> text operator', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [{ field: 'keyValue.string', operator: '=', value: 'hello' }]
        },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where).toContain(`->> 'string'`);
      expect(params).toContain('hello');
    });

    it('keyValue notContains object -> NOT (@>)', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [{ field: 'keyValue', operator: 'notContains', value: { string: 'hello', number: 10 } }]
        },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where).toContain(`NOT`);
      expect(where).toContain(`@>`);
    });
  });

  describe('native array operations', () => {
    it('stringArray in -> native array containment', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'stringArray', operator: 'in', value: ['a', 'b'] }] },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where.length).toBeGreaterThan(0);
      expect(params.length).toBeGreaterThan(0);
    });

    it('stringArray = specific value -> array element check', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'stringArray', operator: '=', value: 'specific' }] },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where.length).toBeGreaterThan(0);
      expect(params).toContain('specific');
    });
  });

  describe('JSONB path operators', () => {
    it('nested JSONB field access with #>> operator', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'keyValue.nested.value', operator: '=', value: 'test' }] },
        params,
        new Map(),
        typeDemoMeta
      );

      expect(where).toContain(`#>> '{nested,value}'`);
    });
  });
});

describe('TypeDemo PostgreSQL-specific optimizations', () => {
  it('uses JSONB for JSON type fields', () => {
    const params: unknown[] = [];
    const typeDemoMeta = getEntityMetadata(TypeDemo);
    const where = buildRuleGroupPG(
      {
        combinator: 'and',
        rules: [{ field: 'keyValue', operator: 'contains', value: { key: 'value' } }]
      },
      params,
      new Map(),
      typeDemoMeta
    );

    expect(where).toContain('::jsonb');
  });

  it('generates LIMIT/OFFSET queries', () => {
    const rxdb = new RxDB({
      context: {},
      dbName: 'type-demo-query-sql',
      entities: [TypeDemo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
    const result = generate_find_sql(adapter, getEntityMetadata(TypeDemo), {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'id', sort: 'asc' }],
      limit: 10,
      offset: 20
    });

    expect(result.sql).toContain('LIMIT');
    expect(result.sql).toContain('OFFSET');
  });
});

describe('TypeDemo Field Operators - Full Coverage', () => {
  let meta: EntityMetadata;
  beforeAll(() => {
    meta = getEntityMetadata(TypeDemo);
  });

  describe('uuid field (id)', () => {
    it('id equality casts to uuid', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: '019a0000-0000-7000-8000-000000000001' }]
        },
        params,
        new Map(),
        meta
      );
      expect(where).toBe('"id"::uuid = $1::uuid');
      expect(params[0]).toBe('019a0000-0000-7000-8000-000000000001');
    });

    it('id in [] -> 1=0', () => {
      const params: unknown[] = [];
      const where = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: [] }] },
        params,
        new Map(),
        meta
      );
      expect(where).toBe('1=0');
      expect(params.length).toBe(0);
    });
  });

  describe('string field', () => {
    it('=, !=', () => {
      const p1: unknown[] = [];
      const w1 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: '=', value: 'foo' }] },
        p1,
        new Map(),
        meta
      );
      expect(w1).toBe('"string" = $1');
      expect(p1).toEqual(['foo']);

      const p2: unknown[] = [];
      const w2 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: '!=', value: 'bar' }] },
        p2,
        new Map(),
        meta
      );
      expect(w2).toBe('"string" != $1');
      expect(p2).toEqual(['bar']);
    });

    it('LIKE family', () => {
      const pc: unknown[] = [];
      const wc = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'contains', value: 'x' }] },
        pc,
        new Map(),
        meta
      );
      expect(wc).toBe('"string" LIKE $1');
      expect(pc).toEqual(['%x%']);

      const pb: unknown[] = [];
      const wb = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'startsWith', value: 'pre' }] },
        pb,
        new Map(),
        meta
      );
      expect(wb).toBe('"string" LIKE $1');
      expect(pb).toEqual(['pre%']);

      const pe: unknown[] = [];
      const we = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'endsWith', value: 'suf' }] },
        pe,
        new Map(),
        meta
      );
      expect(we).toBe('"string" LIKE $1');
      expect(pe).toEqual(['%suf']);
    });

    it('in, notIn, between, notBetween', () => {
      const pin: unknown[] = [];
      const win = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'in', value: ['a', 'b'] }] },
        pin,
        new Map(),
        meta
      );
      expect(win).toBe('"string" = ANY($1)');
      expect(pin).toEqual([['a', 'b']]);

      const pnin: unknown[] = [];
      const wnin = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'notIn', value: ['a', 'b'] }] },
        pnin,
        new Map(),
        meta
      );
      expect(wnin).toBe('"string" != ALL($1)');
      expect(pnin).toEqual([['a', 'b']]);

      const pbt: unknown[] = [];
      const wbt = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'between', value: ['a', 'z'] }] },
        pbt,
        new Map(),
        meta
      );
      expect(wbt).toBe('"string" BETWEEN $1 AND $2');
      expect(pbt).toEqual(['a', 'z']);

      const pnbt: unknown[] = [];
      const wnbt = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: 'notBetween', value: ['a', 'z'] }] },
        pnbt,
        new Map(),
        meta
      );
      expect(wnbt).toBe('"string" NOT BETWEEN $1 AND $2');
      expect(pnbt).toEqual(['a', 'z']);
    });

    it('null checks', () => {
      const pn: unknown[] = [];
      const wn = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: '=', value: null }] },
        pn,
        new Map(),
        meta
      );
      expect(wn).toBe('"string" IS NULL');
      expect(pn.length).toBe(0);

      const pnn: unknown[] = [];
      const wnn = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'string', operator: '!=', value: null }] },
        pnn,
        new Map(),
        meta
      );
      expect(wnn).toBe('"string" IS NOT NULL');
      expect(pnn.length).toBe(0);
    });
  });

  describe('number & integer fields', () => {
    const numericOps = ['=', '!=', '>', '<', '>=', '<='] as const;
    for (const op of numericOps) {
      it(`number ${op}`, () => {
        const p: unknown[] = [];
        const w = buildRuleGroupPG(
          { combinator: 'and', rules: [{ field: 'number', operator: op, value: 10 }] },
          p,
          new Map(),
          meta
        );
        expect(w).toBe(`"number" ${op} $1`);
        expect(p).toEqual([10]);
      });
    }

    it('between / notBetween', () => {
      const p1: unknown[] = [];
      const w1 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'integer', operator: 'between', value: [1, 9] }] },
        p1,
        new Map(),
        meta
      );
      expect(w1).toBe('"integer" BETWEEN $1 AND $2');
      expect(p1).toEqual([1, 9]);

      const p2: unknown[] = [];
      const w2 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'integer', operator: 'notBetween', value: [1, 9] }] },
        p2,
        new Map(),
        meta
      );
      expect(w2).toBe('"integer" NOT BETWEEN $1 AND $2');
      expect(p2).toEqual([1, 9]);
    });

    it('in / notIn', () => {
      const p1: unknown[] = [];
      const w1 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'number', operator: 'in', value: [1, 2, 3] }] },
        p1,
        new Map(),
        meta
      );
      expect(w1).toBe('"number" = ANY($1)');
      expect(p1).toEqual([[1, 2, 3]]);

      const p2: unknown[] = [];
      const w2 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'number', operator: 'notIn', value: [1, 2, 3] }] },
        p2,
        new Map(),
        meta
      );
      expect(w2).toBe('"number" != ALL($1)');
      expect(p2).toEqual([[1, 2, 3]]);
    });
  });

  describe('boolean field', () => {
    it('equals true/false', () => {
      const p1: unknown[] = [];
      const w1 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'boolean', operator: '=', value: true }] },
        p1,
        new Map(),
        meta
      );
      expect(w1).toBe('"boolean" = $1');
      expect(p1).toEqual([true]);

      const p2: unknown[] = [];
      const w2 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'boolean', operator: '=', value: false }] },
        p2,
        new Map(),
        meta
      );
      expect(w2).toBe('"boolean" = $1');
      expect(p2).toEqual([false]);
    });
  });

  describe('date field', () => {
    it('>, <, between', () => {
      const d1 = new Date('2024-01-01T00:00:00.000Z');
      const d2 = new Date('2024-12-31T23:59:59.999Z');
      const p1: unknown[] = [];
      const w1 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'date', operator: '>', value: d1 }] },
        p1,
        new Map(),
        meta
      );
      expect(w1).toBe('"date" > $1');
      expect(p1).toEqual([d1]);

      const p2: unknown[] = [];
      const w2 = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'date', operator: 'between', value: [d1, d2] }] },
        p2,
        new Map(),
        meta
      );
      expect(w2).toBe('"date" BETWEEN $1 AND $2');
      expect(p2).toEqual([d1, d2]);
    });
  });

  describe('array fields (stringArray, numberArray)', () => {
    it('stringArray in -> field @> $::text[]', () => {
      const p: unknown[] = [];
      const w = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'stringArray', operator: 'in', value: ['a', 'b'] }] },
        p,
        new Map(),
        meta
      );
      expect(w).toContain('@>');
      expect(w).toContain('text[]');
      expect(p.length).toBe(1);
      expect(Array.isArray(p[0])).toBe(true);
    });
    it('numberArray notIn -> NOT field @> $::numeric[]', () => {
      const p: unknown[] = [];
      const w = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'numberArray', operator: 'notIn', value: [1, 2] }] },
        p,
        new Map(),
        meta
      );
      expect(w.startsWith('NOT ')).toBe(true);
      expect(w).toContain('@>');
      expect(w).toContain('numeric[]');
      expect(p.length).toBe(1);
      expect(Array.isArray(p[0])).toBe(true);
    });
  });

  describe('json field', () => {
    it('json contains object', () => {
      const p: unknown[] = [];
      const w = buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'json', operator: 'contains', value: { a: 1 } }] },
        p,
        new Map(),
        meta
      );
      expect(w).toContain('@>');
      expect(w).toContain('::jsonb');
      expect(p.length).toBe(1);
      const jsonParam = p[0];
      expect(typeof jsonParam).toBe('string');
      if (typeof jsonParam !== 'string') throw new TypeError('Expected a JSON string parameter');
      expect(JSON.parse(jsonParam).a).toBe(1);
    });
  });

  describe('combinator (and/or) & grouping', () => {
    it('nested groups', () => {
      const p: unknown[] = [];
      const w = buildRuleGroupPG(
        {
          combinator: 'and',
          rules: [
            { field: 'string', operator: 'contains', value: 'x' },
            {
              combinator: 'or',
              rules: [
                { field: 'number', operator: '>', value: 5 },
                { field: 'boolean', operator: '=', value: true }
              ]
            }
          ]
        },
        p,
        new Map(),
        meta
      );
      expect(w).toMatch(/\(.* OR .*\)/);
      expect(p).toEqual(['%x%', 5, true]);
    });
  });
});
