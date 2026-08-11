import { getRxDBChangeKey, PropertyType, SwitchVersionActions } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { convertSwitchResultToSql } from '../../version/switch-result.utils.js';

const makeMeta = (idType: PropertyType | 'missing', name = 'Ent') => {
  const propertyMap =
    idType === 'missing' ?
      new Map([['title', { name: 'title', columnName: 'title', type: PropertyType.string }]])
    : new Map([
        ['id', { name: 'id', columnName: 'id', type: idType }],
        ['title', { name: 'title', columnName: 'title', type: PropertyType.string }]
      ]);
  return {
    name,
    namespace: 'public',
    tableName: name.toLowerCase(),
    propertyMap,
    encryptedPropertyMap: undefined
  };
};

const change = (id: string | number | bigint, title = 't') =>
  ({
    patch: null,
    inversePatch: { id, title }
  }) as never;

describe('switch-result.utils residual id normalization', () => {
  it('normalizes integer/number ids and rejects invalid id types', async () => {
    const intMeta = makeMeta(PropertyType.integer, 'IntEnt');
    const numMeta = makeMeta(PropertyType.number, 'NumEnt');
    const badMeta = makeMeta(PropertyType.boolean as never, 'BadEnt');
    const missingIdMeta = makeMeta('missing', 'NoIdEnt');
    const uuidMeta = makeMeta(PropertyType.uuid, 'UuidEnt');
    const bigintMeta = makeMeta(PropertyType.bigint, 'BigIntEnt');

    const adapter = {
      encryptionContext: {},
      rxdb: {
        schemaManager: {
          getEntityMetadata: vi.fn((entityName: string) => {
            if (entityName === 'IntEnt') return intMeta;
            if (entityName === 'NumEnt') return numMeta;
            if (entityName === 'BadEnt') return badMeta;
            if (entityName === 'NoIdEnt') return missingIdMeta;
            if (entityName === 'UuidEnt') return uuidMeta;
            if (entityName === 'BigIntEnt') return bigintMeta;
            return null;
          })
        },
        context: {}
      }
    } as unknown as RxDBAdapterPGlite;

    const deleteActions: SwitchVersionActions = {
      deletes: new Map([
        ['public:IntEnt:10', change(10)],
        ['public:NumEnt:3.14', change(3.14)],
        ['public:UuidEnt:abc', change('abc')]
      ]),
      inserts: new Map(),
      updates: new Map()
    };

    const result = await convertSwitchResultToSql(adapter, deleteActions);
    expect(result.deletes).toHaveLength(3);

    const bigintId = 9_007_199_254_740_993n;
    const bigintResult = await convertSwitchResultToSql(adapter, {
      deletes: new Map([
        [getRxDBChangeKey({ namespace: 'public', entity: 'BigIntEnt', entityId: bigintId } as never), change(bigintId)]
      ]),
      inserts: new Map(),
      updates: new Map()
    });
    expect(bigintResult.deletes[0].ids).toEqual(new Set([bigintId]));
    expect(bigintResult.deletes[0].sql).toContain('ANY($1::bigint[])');
    expect(bigintResult.deletes[0].params).toEqual([[bigintId]]);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['public:IntEnt:nope', change('nope')]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Invalid integer id/);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['public:NumEnt:NaN', change('NaN')]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Invalid numeric id/);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['public:BadEnt:x', change('x')]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Unsupported id type/);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['public:NoIdEnt:1', change(1)]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Missing id metadata/);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['public:IntEnt:', change(1)]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Invalid (RxDB change|switch entity) key/);

    await expect(
      convertSwitchResultToSql(adapter, {
        deletes: new Map([['ghost:Ghost:1', change(1)]]),
        inserts: new Map(),
        updates: new Map()
      })
    ).rejects.toThrow(/Missing entity metadata/);
  });
});
