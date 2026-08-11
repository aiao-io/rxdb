import { PropertyType, RelationKind, transitionMetadata, type FindOptions } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { count_sql } from '../query/count_sql.js';
import { find_sql } from '../query/find_sql.js';
import { generate_tree_sql } from '../query/query_tree_sql.js';
import {
  rxDBColumnTypeToSqliteType,
  transformEntityValueToSql,
  transformValueJsToSqlite,
  transformValueSqliteToJs
} from '../sqlite-core.utils.js';
import { create_table_sql } from '../table/create_table_sql.js';

const adapter = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterSqliteBase;

const metadata = transitionMetadata({
  name: 'BinaryRecord',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint, sortable: true },
    { name: 'payload', type: PropertyType.binary, nullable: true }
  ]
});

const treeMetadata = transitionMetadata({
  name: 'BigIntTreeRecord',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint, sortable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BigIntTreeRecord',
      mappedProperty: 'children',
      nullable: true
    }
  ]
});

describe('SQLite bigint/binary contract', () => {
  it('maps schema types exhaustively and keeps bigint primary/default semantics', () => {
    expect(rxDBColumnTypeToSqliteType({ type: PropertyType.bigint })).toBe('INTEGER');
    expect(rxDBColumnTypeToSqliteType({ type: PropertyType.binary })).toBe('BLOB');
    expect(() => rxDBColumnTypeToSqliteType({ type: 'unknown' })).toThrow(/unknown/i);
    expect(() => rxDBColumnTypeToSqliteType({ type: 'unknown', encrypted: true })).toThrow(/unknown/i);

    const sql = create_table_sql(adapter, metadata);
    expect(sql).toContain('"id" INTEGER PRIMARY KEY');
    expect(sql).toContain('"payload" BLOB');

    const constantDefault = transitionMetadata({
      name: 'BigIntDefault',
      properties: [{ name: 'value', type: PropertyType.bigint, default: 7n }]
    });
    expect(create_table_sql(adapter, constantDefault)).toContain('"value" INTEGER DEFAULT 7');
  });

  it('never executes factory or binary defaults while generating DDL', () => {
    const factory = vi.fn(() => 7n);
    const withDefaults = transitionMetadata({
      name: 'RuntimeDefaults',
      properties: [
        { name: 'generated', type: PropertyType.bigint, default: factory },
        { name: 'payload', type: PropertyType.binary, default: new Uint8Array([1, 2]) }
      ]
    });
    const sql = create_table_sql(adapter, withDefaults);

    expect(factory).not.toHaveBeenCalled();
    expect(sql).not.toContain('DEFAULT 7');
    expect(sql).not.toContain('DEFAULT [object Uint8Array]');
  });

  it('validates signed 64-bit bigint and copies the current binary view', () => {
    const bigintProperty = metadata.propertyMap.get('amount')!;
    const binaryProperty = metadata.propertyMap.get('payload')!;
    const min = -(1n << 63n);
    const max = (1n << 63n) - 1n;

    expect(transformValueJsToSqlite(min, bigintProperty)).toBe(min);
    expect(transformValueJsToSqlite(max, bigintProperty)).toBe(max);
    expect(() => transformValueJsToSqlite(min - 1n, bigintProperty)).toThrow(TypeError);
    expect(() => transformValueJsToSqlite(max + 1n, bigintProperty)).toThrow(TypeError);
    expect(() => transformValueJsToSqlite(1, bigintProperty)).toThrow(TypeError);
    expect(() => transformValueJsToSqlite('1', bigintProperty)).toThrow(TypeError);

    const source = new Uint8Array([9, 0, 255, 8]);
    const view = source.subarray(1, 3);
    const bound = transformValueJsToSqlite(view, binaryProperty);
    expect(bound).toEqual(new Uint8Array([0, 255]));
    expect(bound).not.toBe(view);
    expect(() => transformValueJsToSqlite([0, 255], binaryProperty)).toThrow(TypeError);
    expect(transformValueSqliteToJs(bound, binaryProperty)).toEqual(new Uint8Array([0, 255]));
  });

  it('validates bigint foreign keys against the mapped primary key', async () => {
    const parent = transitionMetadata({
      name: 'SqliteBigIntParent',
      properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
    });
    const child = transitionMetadata({
      name: 'SqliteBigIntChild',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: parent.name,
          mappedProperty: 'children'
        }
      ]
    });
    const context = {
      keyring: null,
      namespace: 'test',
      resolveEntityMetadata: (name: string) => (name === parent.name ? parent : undefined)
    };

    await expect(transformEntityValueToSql(child, { parentId: 1n }, context)).resolves.toMatchObject({
      parentId: 1n
    });
    await expect(transformEntityValueToSql(child, { parentId: 1 }, context)).rejects.toThrow(TypeError);
    await expect(transformEntityValueToSql(child, { parentId: '1' }, context)).rejects.toThrow(TypeError);
    await expect(transformEntityValueToSql(child, { parentId: 1n << 63n }, context)).rejects.toThrow(TypeError);
  });

  it('parameterizes bigint/binary queries and rejects binary range/sort operators', () => {
    const lowerBound = 9_007_199_254_740_993n;
    const upperBound = 9_007_199_254_740_995n;
    const bigintQuery = find_sql(adapter, metadata, {
      where: { combinator: 'and', rules: [{ field: 'amount', operator: 'between', value: [lowerBound, upperBound] }] }
    } as FindOptions);
    expect(bigintQuery.sql).toContain('_.' + '"amount" BETWEEN ? AND ?');
    expect(bigintQuery.params).toEqual([lowerBound, upperBound]);
    expect(bigintQuery.sql).not.toContain(lowerBound.toString());
    expect(bigintQuery.sql).not.toContain(upperBound.toString());

    const bigintSetQuery = find_sql(adapter, metadata, {
      where: {
        combinator: 'and',
        rules: [
          { field: 'amount', operator: 'in', value: [1n, 2n] },
          { field: 'amount', operator: 'notIn', value: [3n, 4n] }
        ]
      }
    } as FindOptions);
    expect(bigintSetQuery.sql).toContain('_."amount" IN (?, ?)');
    expect(bigintSetQuery.sql).toContain('_."amount" NOT IN (?, ?)');
    expect(bigintSetQuery.params).toEqual([1n, 2n, 3n, 4n]);

    const bigintCountQuery = count_sql(adapter, metadata, {
      where: { combinator: 'and', rules: [{ field: 'amount', operator: '>=', value: 5n }] }
    });
    expect(bigintCountQuery.sql).toContain('_."amount" >= ?');
    expect(bigintCountQuery.params).toEqual([5n]);

    const zeroIdTreeQuery = generate_tree_sql(adapter, treeMetadata, {
      entityId: 0n,
      where: { combinator: 'and', rules: [{ field: 'amount', operator: '>=', value: 5n }] }
    });
    expect(zeroIdTreeQuery.sql).toContain('WHERE "id" = ?');
    expect(zeroIdTreeQuery.sql).toContain('"children"."amount" >= ?');
    expect(zeroIdTreeQuery.params).toEqual([0n, 5n]);

    const first = new Uint8Array([0, 255]);
    const second = new Uint8Array([1, 2]);
    const binaryQuery = find_sql(adapter, metadata, {
      where: { combinator: 'and', rules: [{ field: 'payload', operator: 'in', value: [first, second] }] }
    } as FindOptions);
    expect(binaryQuery.sql).toContain('_.' + '"payload" IN (?, ?)');
    expect(binaryQuery.params).toEqual([first, second]);
    expect(binaryQuery.params?.[0]).not.toBe(first);

    const binaryAllowedQuery = find_sql(adapter, metadata, {
      where: {
        combinator: 'and',
        rules: [
          { field: 'payload', operator: '=', value: first },
          { field: 'payload', operator: '!=', value: second },
          { field: 'payload', operator: 'notIn', value: [first, second] },
          { field: 'payload', operator: '=', value: null },
          { field: 'payload', operator: '!=', value: null },
          { field: 'payload', operator: 'notNull' }
        ]
      }
    } as FindOptions);
    expect(binaryAllowedQuery.sql).toContain('_."payload" = ?');
    expect(binaryAllowedQuery.sql).toContain('_."payload" != ?');
    expect(binaryAllowedQuery.sql).toContain('_."payload" NOT IN (?, ?)');
    expect(binaryAllowedQuery.sql).toContain('_."payload" IS NULL');
    expect(binaryAllowedQuery.sql).toContain('_."payload" IS NOT NULL');
    expect(binaryAllowedQuery.sql).toContain('_."payload" IS NOT NULL');
    expect(binaryAllowedQuery.params).toEqual([first, second, first, second]);
    expect(binaryAllowedQuery.params?.every(value => value !== first && value !== second)).toBe(true);

    expect(() =>
      find_sql(adapter, metadata, {
        where: { combinator: 'and', rules: [{ field: 'amount', operator: '=', value: 1 }] }
      } as FindOptions)
    ).toThrow(TypeError);
    expect(() =>
      find_sql(adapter, metadata, {
        where: { combinator: 'and', rules: [{ field: 'payload', operator: '=', value: [0, 255] }] }
      } as FindOptions)
    ).toThrow(TypeError);

    for (const operator of [
      '>',
      '>=',
      '<',
      '<=',
      'between',
      'notBetween',
      'contains',
      'notContains',
      'startsWith',
      'notStartsWith',
      'endsWith',
      'notEndsWith'
    ] as const) {
      expect(() =>
        find_sql(adapter, metadata, {
          where: { combinator: 'and', rules: [{ field: 'payload', operator, value: first }] }
        } as FindOptions)
      ).toThrow(/binary.*operator/i);
    }

    expect(() =>
      find_sql(adapter, metadata, {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'payload', sort: 'asc' }]
      } as FindOptions)
    ).toThrow(/binary.*sort/i);
  });
});
