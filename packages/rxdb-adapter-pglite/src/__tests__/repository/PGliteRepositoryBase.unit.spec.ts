import {
  encodeRxDBChangeEntityId,
  encodeRxDBChangePatch,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';
import { PGliteRepositoryBase } from '../../repository/PGliteRepositoryBase.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

const makeRepo = () => {
  const rxdb = new RxDB({
    dbName: `repo-base-unit-${Date.now()}`,
    entities: [Todo],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  const query = vi.fn();
  const adapter = {
    query,
    encryptionContext: undefined,
    rxdb
  };
  const repo = new PGliteRepositoryBase(adapter as never, Todo);
  return { repo, query, rxdb, adapter };
};

@Entity({
  name: 'PGliteRepositoryTypedRecord',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint },
    { name: 'payload', type: PropertyType.binary },
    { name: 'secretAmount', type: PropertyType.bigint, encrypted: true },
    { name: 'secretPayload', type: PropertyType.binary, encrypted: true }
  ]
})
class PGliteRepositoryTypedRecord extends EntityBase<bigint> {
  declare id: bigint;
  amount!: bigint;
  payload!: Uint8Array;
  secretAmount!: bigint;
  secretPayload!: Uint8Array;
}

describe('PGliteRepositoryBase unit edges', () => {
  it('findByRowIds returns empty array without querying when rowIds is empty', async () => {
    const { repo, query } = makeRepo();
    const result = await repo.findByRowIds([]);
    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('addQueryCache updates existing entity refs and creates when missing', async () => {
    const { repo, rxdb } = makeRepo();

    const existing = rxdb.entityManager.createEntityRef(Todo, {
      id: '1',
      title: 'old',
      completed: false
    } as never);

    const result = await (
      repo as unknown as {
        addQueryCache: (result: {
          rows: Array<Record<string, unknown>>;
          fields: unknown[];
          affectedRows: number;
        }) => Promise<InstanceType<typeof Todo>[]>;
      }
    ).addQueryCache({
      rows: [
        { id: '1', title: 'new-1', completed: true },
        { id: '2', title: 'new-2', completed: false }
      ],
      fields: [],
      affectedRows: 2
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(existing);
    expect((result[0] as { title: string }).title).toBe('new-1');
    expect((result[1] as { id: string }).id).toBe('2');
    expect(rxdb.entityManager.hasEntityRef(Todo, '2' as never)).toBe(true);
  });

  it('addQueryCache with forcedUpdate=false keeps existing entity fields', async () => {
    const { repo, rxdb } = makeRepo();
    const existing = rxdb.entityManager.createEntityRef(Todo, {
      id: 'keep-1',
      title: 'old-title',
      completed: false
    } as never);

    const result = await (
      repo as unknown as {
        addQueryCache: (
          result: {
            rows: Array<Record<string, unknown>>;
            fields: unknown[];
            affectedRows: number;
          },
          forcedUpdate?: boolean
        ) => Promise<InstanceType<typeof Todo>[]>;
      }
    ).addQueryCache(
      {
        rows: [{ id: 'keep-1', title: 'new-title', completed: true }],
        fields: [],
        affectedRows: 1
      },
      false
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(existing);
    expect((result[0] as { title: string }).title).toBe('old-title');
    expect((result[0] as { completed: boolean }).completed).toBe(false);
  });

  it('hydrates RxDBChange typed values before creating the entity ref', async () => {
    const entityId = 9_007_199_254_740_993n;
    const rxdb = new RxDB({
      dbName: `repo-base-change-codec-${Date.now()}`,
      entities: [PGliteRepositoryTypedRecord],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();
    const adapter = { query: vi.fn(), encryptionContext: undefined, rxdb };
    const repo = new PGliteRepositoryBase(adapter as never, RxDBChange);
    const secretAmount = '{"v":1,"ciphertext":"amount"}';
    const secretPayload = '{"v":1,"ciphertext":"payload"}';
    const encodedPatch = encodeRxDBChangePatch(getEntityMetadata(PGliteRepositoryTypedRecord), {
      amount: entityId,
      payload: new Uint8Array([0, 255]),
      secretAmount,
      secretPayload
    });

    const [change] = await (
      repo as unknown as {
        addQueryCache: (result: {
          rows: Array<Record<string, unknown>>;
          fields: unknown[];
          affectedRows: number;
        }) => Promise<RxDBChange[]>;
      }
    ).addQueryCache({
      rows: [
        {
          id: 1,
          type: 'INSERT',
          namespace: 'public',
          entity: 'PGliteRepositoryTypedRecord',
          entityId: encodeRxDBChangeEntityId(entityId),
          inversePatch: null,
          patch: encodedPatch,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ],
      fields: [],
      affectedRows: 1
    });

    expect(change.entityId).toBe(entityId);
    expect(change.patch?.['amount']).toBe(entityId);
    expect(change.patch?.['payload']).toEqual(new Uint8Array([0, 255]));
    expect(change.patch?.['secretAmount']).toBe(secretAmount);
    expect(change.patch?.['secretPayload']).toBe(secretPayload);
  });
});
