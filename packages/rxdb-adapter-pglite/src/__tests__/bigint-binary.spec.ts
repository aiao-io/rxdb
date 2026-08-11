import {
  Entity,
  EntityBase,
  getEntityMetadata,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  transitionMetadata,
  type FindOptions
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  getEntityObjectFromResult,
  getTableNameByMetadata,
  rxDBColumnTypeToPGliteType,
  rxDBColumnTypeToPGliteTypeIndexName,
  transformEntityValueToSql,
  transformValueJsToPGlite,
  transformValuePGliteToJs
} from '../pglite.utils.js';
import { buildRuleGroupPG, generate_find_sql } from '../query/query_sql.js';
import create_table_sql from '../table/create_table_sql.js';

const adapterStub = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterPGlite;
let binaryFactoryCalls = 0;

const createBinaryDefault = (): Uint8Array => {
  binaryFactoryCalls += 1;
  return new Uint8Array([3, 4]);
};

const metadata = transitionMetadata({
  name: 'BinaryRecord',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint, sortable: true, unique: true },
    { name: 'payload', type: PropertyType.binary, nullable: true, unique: true }
  ],
  indexes: [{ name: 'typed', properties: ['amount', 'payload'] }]
});

describe('PGlite bigint/binary contract', () => {
  it('maps schema and index operator classes exhaustively', () => {
    const bigintProperty = metadata.propertyMap.get('amount')!;
    const binaryProperty = metadata.propertyMap.get('payload')!;
    expect(rxDBColumnTypeToPGliteType(bigintProperty)).toBe('bigint');
    expect(rxDBColumnTypeToPGliteType(binaryProperty)).toBe('bytea');
    expect(rxDBColumnTypeToPGliteTypeIndexName(bigintProperty)).toBe('int8_ops');
    expect(rxDBColumnTypeToPGliteTypeIndexName(binaryProperty)).toBe('bytea_ops');

    const sql = create_table_sql(adapterStub, metadata);
    expect(sql).toContain('"id" bigint PRIMARY KEY');
    expect(sql).toContain('"payload" bytea');
    expect(sql).toContain('"amount" int8_ops');
    expect(sql).toContain('"payload" bytea_ops');
    expect(sql).toContain('("amount" int8_ops, "payload" bytea_ops)');

    expect(() => rxDBColumnTypeToPGliteType({ ...bigintProperty, type: 'unsupported' } as never)).toThrow(
      /not support/
    );
    expect(() =>
      rxDBColumnTypeToPGliteType({ ...bigintProperty, type: 'unsupported', encrypted: true } as never)
    ).toThrow(/not support/);
  });

  it('never executes factory or binary defaults while generating DDL', () => {
    const factory = vi.fn(() => 7n);
    const withDefaults = transitionMetadata({
      name: 'RuntimeDefaults',
      properties: [
        { name: 'fixed', type: PropertyType.bigint, default: 8n },
        { name: 'generated', type: PropertyType.bigint, default: factory },
        { name: 'payload', type: PropertyType.binary, default: new Uint8Array([1, 2]) }
      ]
    });
    const sql = create_table_sql(adapterStub, withDefaults);

    expect(factory).not.toHaveBeenCalled();
    expect(sql).toContain('"fixed" bigint DEFAULT 8');
    expect(sql).not.toContain('DEFAULT 7');
    expect(sql).not.toContain('DEFAULT [object Uint8Array]');
  });

  it('validates signed 64-bit bigint and copies the current binary view', () => {
    const bigintProperty = metadata.propertyMap.get('amount')!;
    const binaryProperty = metadata.propertyMap.get('payload')!;
    const min = -(1n << 63n);
    const max = (1n << 63n) - 1n;

    expect(transformValueJsToPGlite(min, bigintProperty)).toBe(min);
    expect(transformValueJsToPGlite(max, bigintProperty)).toBe(max);
    expect(() => transformValueJsToPGlite(min - 1n, bigintProperty)).toThrow(TypeError);
    expect(() => transformValueJsToPGlite(max + 1n, bigintProperty)).toThrow(TypeError);
    expect(() => transformValueJsToPGlite(1, bigintProperty)).toThrow(TypeError);

    const source = new Uint8Array([9, 0, 255, 8]);
    const view = source.subarray(1, 3);
    const bound = transformValueJsToPGlite(view, binaryProperty);
    expect(bound).toEqual(new Uint8Array([0, 255]));
    expect(bound).not.toBe(view);
    expect(() => transformValueJsToPGlite([0, 255], binaryProperty)).toThrow(TypeError);
    const restored = transformValuePGliteToJs(bound, binaryProperty);
    expect(restored).toEqual(new Uint8Array([0, 255]));
    expect(restored).not.toBe(bound);
    expect(transformValuePGliteToJs(1, bigintProperty)).toBe(1n);
    expect(() => transformValuePGliteToJs('1', bigintProperty)).toThrow(TypeError);
    expect(() => transformValuePGliteToJs([0, 255], binaryProperty)).toThrow(TypeError);
  });

  it('parameterizes bigint/binary rules and rejects binary range/sort operators', () => {
    const params: unknown[] = [];
    const payload = new Uint8Array([0, 255]);
    const sql = buildRuleGroupPG(
      {
        combinator: 'and',
        rules: [
          { field: 'amount', operator: 'between', value: [1n, 3n] },
          { field: 'payload', operator: '=', value: payload }
        ]
      },
      params,
      new Map(),
      metadata
    );
    expect(sql).toContain('"amount" BETWEEN $1 AND $2');
    expect(sql).toContain('"payload" = $3');
    expect(params).toEqual([1n, 3n, new Uint8Array([0, 255])]);
    expect(params[2]).not.toBe(payload);

    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'amount', operator: '=', value: 1 }] },
        [],
        new Map(),
        metadata
      )
    ).toThrow(TypeError);

    expect(() =>
      buildRuleGroupPG(
        { combinator: 'and', rules: [{ field: 'payload', operator: '>', value: new Uint8Array([1]) }] },
        [],
        new Map(),
        metadata
      )
    ).toThrow(/binary.*operator/i);
    for (const operator of ['like', 'between'] as const) {
      expect(() =>
        buildRuleGroupPG(
          {
            combinator: 'and',
            rules: [
              {
                field: 'payload',
                operator,
                value: operator === 'between' ? [new Uint8Array([1]), new Uint8Array([2])] : '%01%'
              }
            ]
          } as never,
          [],
          new Map(),
          metadata
        )
      ).toThrow();
    }
    expect(() =>
      generate_find_sql(adapterStub, metadata, {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'payload', sort: 'asc' }]
      } as FindOptions)
    ).toThrow(/binary.*sort/i);
  });

  it('uses and hydrates bigint foreign keys that reference bigint primary keys', async () => {
    const parent = transitionMetadata({
      name: 'BigIntParent',
      properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
    });
    const child = transitionMetadata({
      name: 'BigIntChild',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'BigIntParent',
          mappedProperty: 'children',
          nullable: false
        }
      ]
    });
    const relationAdapter = {
      rxdb: {
        schemaManager: {
          getEntityMetadata: (name: string) => (name === parent.name ? parent : undefined)
        }
      }
    } as unknown as RxDBAdapterPGlite;

    expect(create_table_sql(relationAdapter, child)).toContain('"parentId" bigint NOT NULL');
    const resolveEntityMetadata = (name: string) => (name === parent.name ? parent : undefined);
    const safe = await getEntityObjectFromResult(
      child,
      { id: 'dff9dcb5-e56b-4050-b4ae-6ab486d34bee', parentId: 1 },
      { keyring: null, namespace: 'test', resolveEntityMetadata }
    );
    const unsafe = await getEntityObjectFromResult(
      child,
      { id: '51d65ebf-1a86-4705-8a88-9fe81ffbb6bd', parentId: 9_007_199_254_740_993n },
      { keyring: null, namespace: 'test', resolveEntityMetadata }
    );
    expect(safe['parentId']).toBe(1n);
    expect(unsafe['parentId']).toBe(9_007_199_254_740_993n);

    await expect(
      transformEntityValueToSql(child, { parentId: 1n }, { keyring: null, namespace: 'test', resolveEntityMetadata })
    ).resolves.toMatchObject({ parentId: 1n });
    await expect(
      transformEntityValueToSql(child, { parentId: 1 }, { keyring: null, namespace: 'test', resolveEntityMetadata })
    ).rejects.toThrow(TypeError);
    await expect(
      transformEntityValueToSql(
        child,
        { parentId: 1n << 63n },
        { keyring: null, namespace: 'test', resolveEntityMetadata }
      )
    ).rejects.toThrow(TypeError);
  });
});

@Entity({
  name: 'PGliteBigIntBinaryRoundTrip',
  log: true,
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint, sortable: true },
    { name: 'payload', type: PropertyType.binary },
    { name: 'fixed', type: PropertyType.bigint, default: 7n },
    { name: 'constantPayload', type: PropertyType.binary, default: new Uint8Array([1, 2]) },
    { name: 'generatedPayload', type: PropertyType.binary, default: createBinaryDefault }
  ]
})
class PGliteBigIntBinaryRoundTrip extends EntityBase<bigint> {
  declare id: bigint;
  amount!: bigint;
  payload!: Uint8Array;
  fixed!: bigint;
  constantPayload!: Uint8Array;
  generatedPayload!: Uint8Array;
}

@Entity({
  name: 'PGliteBigIntRelationParent',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'PGliteBigIntRelationChild',
      mappedProperty: 'parent'
    },
    {
      name: 'profile',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'PGliteBigIntRelationProfile',
      mappedProperty: 'owner',
      nullable: true
    }
  ]
})
class PGliteBigIntRelationParent extends EntityBase<bigint> {
  declare id: bigint;
  label!: string;
}

@Entity({
  name: 'PGliteBigIntRelationChild',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PGliteBigIntRelationParent',
      mappedProperty: 'children',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class PGliteBigIntRelationChild extends EntityBase {
  label!: string;
  parentId!: bigint;
}

@Entity({
  name: 'PGliteBigIntRelationProfile',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'PGliteBigIntRelationParent',
      mappedProperty: 'profile',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class PGliteBigIntRelationProfile extends EntityBase {
  label!: string;
  ownerId!: bigint;
}

@Entity({
  name: 'PGliteBigIntM2MLeft',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'rights',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'PGliteBigIntM2MRight',
      mappedProperty: 'lefts'
    }
  ]
})
class PGliteBigIntM2MLeft extends EntityBase<bigint> {
  declare id: bigint;
  label!: string;
}

@Entity({
  name: 'PGliteBigIntM2MRight',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'lefts',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'PGliteBigIntM2MLeft',
      mappedProperty: 'rights'
    }
  ]
})
class PGliteBigIntM2MRight extends EntityBase<bigint> {
  declare id: bigint;
  label!: string;
}

describe.sequential('PGlite bigint/binary integration', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `pglite-bigint-binary-${Date.now()}`,
      entities: [
        PGliteBigIntBinaryRoundTrip,
        PGliteBigIntRelationParent,
        PGliteBigIntRelationChild,
        PGliteBigIntRelationProfile,
        PGliteBigIntM2MLeft,
        PGliteBigIntM2MRight
      ],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    adapter = await rxdb.getAdapter('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('round-trips bigint boundaries and the current binary view', async () => {
    const min = -(1n << 63n);
    const max = (1n << 63n) - 1n;
    const source = new Uint8Array([9, 0, 255, 8]);
    const record = new PGliteBigIntBinaryRoundTrip();
    record.id = max;
    record.amount = min;
    record.payload = source.subarray(1, 3);
    await record.save();
    source[1] = 7;

    const restored = await firstValueFrom(PGliteBigIntBinaryRoundTrip.get(max));
    expect(restored.id).toBe(max);
    expect(restored.amount).toBe(min);
    expect(restored.payload).toEqual(new Uint8Array([0, 255]));

    const matches = await firstValueFrom(
      PGliteBigIntBinaryRoundTrip.findAll({
        where: {
          combinator: 'and',
          rules: [
            { field: 'amount', operator: 'between', value: [min, max] },
            { field: 'payload', operator: '=', value: new Uint8Array([0, 255]) }
          ]
        },
        orderBy: [{ field: 'amount', sort: 'asc' }]
      })
    );
    expect(matches.map(item => item.id)).toEqual([max]);

    const inMatches = await firstValueFrom(
      PGliteBigIntBinaryRoundTrip.findAll({
        where: {
          combinator: 'and',
          rules: [
            { field: 'amount', operator: 'in', value: [min] },
            { field: 'payload', operator: 'in', value: [new Uint8Array([0, 255])] }
          ]
        }
      })
    );
    expect(inMatches.map(item => item.id)).toEqual([max]);

    const notInMatches = await firstValueFrom(
      PGliteBigIntBinaryRoundTrip.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'payload', operator: 'notIn', value: [new Uint8Array([0, 255])] }]
        }
      })
    );
    expect(notInMatches).toEqual([]);
  });

  it('isolates binary defaults and applies bigint defaults to entity and direct INSERT paths', async () => {
    const callsBefore = binaryFactoryCalls;
    const first = new PGliteBigIntBinaryRoundTrip();
    const second = new PGliteBigIntBinaryRoundTrip();

    expect(binaryFactoryCalls).toBe(callsBefore + 2);
    expect(first.fixed).toBe(7n);
    expect(first.constantPayload).toEqual(new Uint8Array([1, 2]));
    expect(first.constantPayload).not.toBe(second.constantPayload);
    expect(first.generatedPayload).toEqual(new Uint8Array([3, 4]));
    expect(first.generatedPayload).not.toBe(second.generatedPayload);
    first.constantPayload[0] = 9;
    first.generatedPayload[0] = 9;
    expect(second.constantPayload).toEqual(new Uint8Array([1, 2]));
    expect(second.generatedPayload).toEqual(new Uint8Array([3, 4]));

    const metadata = getEntityMetadata(PGliteBigIntBinaryRoundTrip);
    const directId = 9_007_199_254_741_001n;
    const now = new Date();
    await adapter.query(
      `INSERT INTO ${getTableNameByMetadata(metadata)} ("id", "amount", "payload", "constantPayload", "generatedPayload", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [directId, directId, new Uint8Array([5]), new Uint8Array([1, 2]), new Uint8Array([3, 4]), now, now]
    );
    rxdb.entityManager.cleanAllCache();
    const direct = await firstValueFrom(PGliteBigIntBinaryRoundTrip.get(directId));
    expect(direct.fixed).toBe(7n);
    expect(typeof direct.fixed).toBe('bigint');
  });

  it('pages bigint cursors forward and backward without precision loss or gaps', async () => {
    const ids = [9_007_199_254_740_993n, 9_007_199_254_740_994n, 9_007_199_254_740_995n, 9_007_199_254_740_996n];
    const amounts = [41n, 41n, 42n, 43n];
    const records = ids.map((id, index) => {
      const record = new PGliteBigIntBinaryRoundTrip();
      record.id = id;
      record.amount = amounts[index];
      record.payload = new Uint8Array([index]);
      return record;
    });
    await rxdb.entityManager.saveMany(records);

    const options = {
      where: {
        combinator: 'and' as const,
        rules: [
          {
            field: 'amount' as const,
            operator: 'between' as const,
            value: [41n, 43n] as [bigint, bigint]
          }
        ]
      },
      orderBy: [
        { field: 'amount' as const, sort: 'asc' as const },
        { field: 'id' as const, sort: 'asc' as const }
      ],
      limit: 2
    };
    const firstPage = await firstValueFrom(PGliteBigIntBinaryRoundTrip.findByCursor(options));
    const secondPage = await firstValueFrom(
      PGliteBigIntBinaryRoundTrip.findByCursor({ ...options, after: firstPage[1] })
    );
    const previousPage = await firstValueFrom(
      PGliteBigIntBinaryRoundTrip.findByCursor({ ...options, before: secondPage[0] })
    );

    expect(firstPage.map(record => record.id)).toEqual(ids.slice(0, 2));
    expect(secondPage.map(record => record.id)).toEqual(ids.slice(2));
    expect(previousPage.map(record => record.id)).toEqual(ids.slice(0, 2));
    expect([...firstPage, ...secondPage].map(record => record.id)).toEqual(ids);
    expect([...firstPage, ...secondPage].every(record => typeof record.id === 'bigint')).toBe(true);
  });

  it('hydrates safe and unsafe bigint foreign keys and preserves cascade behavior', async () => {
    const parentIds = [1n, 9_007_199_254_740_997n];
    const children: PGliteBigIntRelationChild[] = [];
    for (const parentId of parentIds) {
      const parent = new PGliteBigIntRelationParent();
      parent.id = parentId;
      parent.label = `parent-${parentId}`;
      await parent.save();

      const child = new PGliteBigIntRelationChild();
      child.label = `child-${parentId}`;
      child.parentId = parentId;
      await child.save();
      children.push(child);
    }

    const restored = await adapter.getRepository(PGliteBigIntRelationChild).find({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'parentId', sort: 'asc' }]
    });
    expect(restored.map(child => child.parentId)).toEqual(parentIds);
    expect(restored.every(child => typeof child.parentId === 'bigint')).toBe(true);

    const joined = await adapter.getRepository(PGliteBigIntRelationChild).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'parent.id', operator: '=', value: parentIds[1] }]
      }
    });
    expect(joined.map(child => child.id)).toEqual([children[1].id]);

    const profile = new PGliteBigIntRelationProfile();
    profile.label = 'typed-profile';
    const unsafeParent = await firstValueFrom(PGliteBigIntRelationParent.get(parentIds[1]));
    const owner$ = Reflect.get(profile, 'owner$') as import('rxjs').Observable<
      PGliteBigIntRelationParent | undefined
    > & { set: (owner: PGliteBigIntRelationParent) => void };
    const parentProfile$ = Reflect.get(unsafeParent, 'profile$') as import('rxjs').Observable<
      PGliteBigIntRelationProfile | undefined
    > & { set: (value: PGliteBigIntRelationProfile) => void };
    owner$.set(unsafeParent);
    parentProfile$.set(profile);
    await unsafeParent.save();
    const owners = await adapter.getRepository(PGliteBigIntRelationParent).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'profile.label', operator: '=', value: profile.label }]
      }
    });
    expect(owners.map(owner => owner.id)).toEqual([parentIds[1]]);
    const profile$ = Reflect.get(owners[0], 'profile$') as import('rxjs').Observable<
      PGliteBigIntRelationProfile | undefined
    >;
    expect((await firstValueFrom(profile$))?.ownerId).toBe(parentIds[1]);

    const parent$ = Reflect.get(restored[1], 'parent$') as import('rxjs').Observable<
      PGliteBigIntRelationParent | undefined
    >;
    expect((await firstValueFrom(parent$))?.id).toBe(parentIds[1]);

    await unsafeParent.remove();
    const remainingChildren = await adapter.getRepository(PGliteBigIntRelationChild).find({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'parentId', sort: 'asc' }]
    });
    expect(remainingChildren.map(child => child.parentId)).toEqual([parentIds[0]]);
    expect(
      await adapter.getRepository(PGliteBigIntRelationProfile).find({
        where: { combinator: 'and', rules: [] }
      })
    ).toHaveLength(0);
  });

  it('reads and replays unsafe bigint foreign-key change patches', async () => {
    const safeParentId = 3n;
    const unsafeParentId = 9_007_199_254_741_021n;
    for (const parentId of [safeParentId, unsafeParentId]) {
      const parent = new PGliteBigIntRelationParent();
      parent.id = parentId;
      parent.label = `change-parent-${parentId}`;
      await parent.save();
    }

    const child = new PGliteBigIntRelationChild();
    child.label = 'change-codec-child';
    child.parentId = unsafeParentId;
    await child.save();
    child.parentId = safeParentId;
    await child.save();

    const changes = await adapter.localRxDBChange().findAll({
      where: {
        combinator: 'and',
        rules: [{ field: 'entity', operator: '=', value: 'PGliteBigIntRelationChild' }]
      },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
    const childChanges = changes.filter(change => change.entityId === child.id);
    const inserted = childChanges.find(change => change.type === 'INSERT');
    const updated = childChanges.find(change => change.type === 'UPDATE');
    expect(inserted?.patch?.['parentId']).toBe(unsafeParentId);
    expect(updated?.inversePatch?.['parentId']).toBe(unsafeParentId);
    expect(updated?.patch?.['parentId']).toBe(safeParentId);

    const history = rxdb.versionManager.history(child);
    await firstValueFrom(history.undoHistories$);
    await history.undo();
    expect((await firstValueFrom(PGliteBigIntRelationChild.get(child.id))).parentId).toBe(unsafeParentId);
    await history.redo();
    expect((await firstValueFrom(PGliteBigIntRelationChild.get(child.id))).parentId).toBe(safeParentId);
  });

  it('stores bigint many-to-many keys and cascades junction rows', async () => {
    const left = new PGliteBigIntM2MLeft();
    left.id = 2n;
    left.label = 'left';
    await left.save();

    const right = new PGliteBigIntM2MRight();
    right.id = 9_007_199_254_741_002n;
    right.label = 'right';
    await right.save();

    const rights$ = Reflect.get(left, 'rights$') as import('rxjs').Observable<PGliteBigIntM2MRight[]> & {
      add: (...entities: PGliteBigIntM2MRight[]) => void;
    };
    rights$.add(right);
    await left.save();

    const relation = getEntityMetadata(PGliteBigIntM2MLeft).relationMap.get('rights');
    if (!relation || relation.kind !== RelationKind.MANY_TO_MANY) {
      throw new TypeError('PGlite bigint MANY_TO_MANY relation metadata is missing');
    }
    const junctions = await adapter.getRepository(relation.junctionEntityType).find({
      where: { combinator: 'and', rules: [] }
    });
    expect(junctions).toHaveLength(1);
    expect(Reflect.get(junctions[0], 'leftsId')).toBe(left.id);
    expect(Reflect.get(junctions[0], 'rightsId')).toBe(right.id);
    expect((await firstValueFrom(rights$)).map(entity => entity.id)).toEqual([right.id]);

    await left.remove();
    expect(
      await adapter.getRepository(relation.junctionEntityType).find({
        where: { combinator: 'and', rules: [] }
      })
    ).toHaveLength(0);
  });

  it('records INSERT/UPDATE/DELETE changes without losing typed values', async () => {
    const id = (1n << 63n) - 1n;
    const repository = adapter.localRxDBChange();
    const findChanges = () =>
      repository.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'entity', operator: '=', value: 'PGliteBigIntBinaryRoundTrip' }]
        },
        orderBy: [{ field: 'id', sort: 'asc' }]
      });

    let changes = await findChanges();
    const inserted = changes.find(change => change.type === 'INSERT');
    expect(inserted?.entityId).toBe(id);
    expect(inserted?.patch?.['amount']).toBe(-(1n << 63n));
    expect(inserted?.patch?.['payload']).toEqual(new Uint8Array([0, 255]));

    const record = await firstValueFrom(PGliteBigIntBinaryRoundTrip.get(id));
    record.amount = 9_007_199_254_740_993n;
    record.payload = new Uint8Array([3, 4]);
    await record.save();
    changes = await findChanges();
    const updated = changes.find(change => change.type === 'UPDATE');
    expect(updated?.entityId).toBe(id);
    expect(updated?.patch?.['amount']).toBe(9_007_199_254_740_993n);
    expect(updated?.patch?.['payload']).toEqual(new Uint8Array([3, 4]));

    await record.remove();
    changes = await findChanges();
    const removed = changes.find(change => change.type === 'DELETE');
    expect(removed?.entityId).toBe(id);
    expect(removed?.inversePatch?.['amount']).toBe(9_007_199_254_740_993n);
    expect(removed?.inversePatch?.['payload']).toEqual(new Uint8Array([3, 4]));
  });
});
