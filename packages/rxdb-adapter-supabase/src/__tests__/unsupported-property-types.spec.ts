import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityType,
  type SyncOptions
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseUnsupportedPropertyTypeError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_REMOTE = {
  type: SyncType.None,
  remote: { adapter: 'supabase' }
} satisfies SyncOptions;

const LOCAL_ONLY = {
  type: SyncType.None,
  local: { adapter: 'local' }
} satisfies SyncOptions;

@Entity({
  name: 'SupabaseBigIntRecord',
  sync: SUPABASE_REMOTE,
  properties: [{ name: 'amount', type: PropertyType.bigint }]
})
class SupabaseBigIntRecord extends EntityBase {
  declare amount: bigint;
}

@Entity({
  name: 'InheritedSupabaseBinaryRecord',
  properties: [{ name: 'payload', type: PropertyType.binary }]
})
class InheritedSupabaseBinaryRecord extends EntityBase {
  declare payload: Uint8Array;
}

@Entity({
  name: 'LocalBinaryRecord',
  sync: LOCAL_ONLY,
  properties: [
    { name: 'amount', type: PropertyType.bigint },
    { name: 'payload', type: PropertyType.binary }
  ]
})
class LocalBinaryRecord extends EntityBase {
  declare amount: bigint;
  declare payload: Uint8Array;
}

@Entity({
  name: 'SupportedSupabaseRecord',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class SupportedSupabaseRecord extends EntityBase {
  declare title: string;
}

@Entity({
  name: 'OtherRemoteBigIntRecord',
  sync: {
    type: SyncType.None,
    remote: { adapter: 'other-remote' }
  },
  properties: [{ name: 'amount', type: PropertyType.bigint }]
})
class OtherRemoteBigIntRecord extends EntityBase {
  declare amount: bigint;
}

@Entity({
  name: 'LocalBigIntParent',
  sync: LOCAL_ONLY,
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SupabaseBigIntForeignKeyChild',
      mappedProperty: 'parent'
    }
  ]
})
class LocalBigIntParent extends EntityBase<bigint> {
  declare id: bigint;
  declare label: string;
}

@Entity({
  name: 'SupabaseBigIntForeignKeyChild',
  sync: SUPABASE_REMOTE,
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'LocalBigIntParent',
      mappedProperty: 'children'
    }
  ]
})
class SupabaseBigIntForeignKeyChild extends EntityBase {
  declare label: string;
  declare parentId: bigint;
}

function createAdapter(entities: EntityType[], sync: SyncOptions = LOCAL_ONLY) {
  const channelInstance = {
    on: vi.fn(),
    subscribe: vi.fn()
  };
  channelInstance.on.mockReturnValue(channelInstance);

  const client = {
    rpc: vi.fn(),
    channel: vi.fn(() => channelInstance)
  };
  const rxdb = new RxDB({
    dbName: 'supabase-unsupported-property-types',
    entities,
    sync
  });
  const adapter = new RxDBAdapterSupabase(rxdb, {
    client: client as never,
    rlsCheck: false
  });

  return { adapter, client, rxdb };
}

describe('Supabase unsupported property types', () => {
  it.each([
    {
      EntityType: SupabaseBigIntRecord,
      globalSync: LOCAL_ONLY,
      property: 'amount',
      propertyType: PropertyType.bigint
    },
    {
      EntityType: InheritedSupabaseBinaryRecord,
      globalSync: SUPABASE_REMOTE,
      property: 'payload',
      propertyType: PropertyType.binary
    }
  ])(
    'connect rejects $propertyType before any network request',
    async ({ EntityType, globalSync, property, propertyType }) => {
      const { adapter, client } = createAdapter([EntityType], globalSync);

      await expect(adapter.connect()).rejects.toMatchObject({
        name: 'SupabaseUnsupportedPropertyTypeError',
        code: 'UNSUPPORTED_PROPERTY_TYPE',
        entity: getEntityMetadata(EntityType).name,
        property,
        propertyType
      });
      expect(client.rpc).not.toHaveBeenCalled();
      expect(client.channel).not.toHaveBeenCalled();
    }
  );

  it('allows local-only new types to coexist with supported Supabase entities', async () => {
    const { adapter, client } = createAdapter(
      [LocalBinaryRecord, SupportedSupabaseRecord, OtherRemoteBigIntRecord],
      SUPABASE_REMOTE
    );

    await expect(adapter.connect()).resolves.toBe(adapter);

    expect(client.channel).toHaveBeenCalledTimes(1);
  });

  it('persists local-only new types while a supported Supabase entity is connected', async () => {
    const channelInstance = {
      on: vi.fn(),
      subscribe: vi.fn()
    };
    channelInstance.on.mockReturnValue(channelInstance);
    const client = {
      rpc: vi.fn(),
      channel: vi.fn(() => channelInstance),
      removeChannel: vi.fn(async () => undefined)
    };
    const rxdb = new RxDB({
      dbName: `supabase-local-bigint-binary-${Date.now()}`,
      entities: [LocalBinaryRecord, SupportedSupabaseRecord],
      sync: {
        type: SyncType.None,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' }
      }
    });
    rxdb.adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: 'MemoryAsyncVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath
        })
    );
    rxdb.adapter(
      'supabase',
      db =>
        new RxDBAdapterSupabase(db, {
          client: client as never,
          rlsCheck: false
        })
    );

    try {
      await rxdb.connect('wa-sqlite');
      await rxdb.connect('supabase');
      const source = new Uint8Array([9, 0, 255, 8]);
      const record = new LocalBinaryRecord();
      record.amount = 9_007_199_254_740_993n;
      record.payload = source.subarray(1, 3);
      await record.save();
      source.fill(7);
      rxdb.entityManager.cleanAllCache();

      const restored = await firstValueFrom(LocalBinaryRecord.get(record.id));
      expect(restored.amount).toBe(9_007_199_254_740_993n);
      expect(restored.payload).toEqual(new Uint8Array([0, 255]));
      expect(client.channel).toHaveBeenCalledTimes(1);
    } finally {
      await rxdb.disconnectAll();
    }
  });

  it('rejects an unsupported remote repository even when connect was bypassed', () => {
    const { adapter, client } = createAdapter([SupabaseBigIntRecord]);

    expect(() => adapter.getRepository(SupabaseBigIntRecord)).toThrow(SupabaseUnsupportedPropertyTypeError);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.channel).not.toHaveBeenCalled();
  });

  it('rejects a remote bigint foreign key through connect and repository bypass', async () => {
    const entities = [LocalBigIntParent, SupabaseBigIntForeignKeyChild];
    const connected = createAdapter(entities);
    connected.rxdb.schemaManager.init();

    await expect(connected.adapter.connect()).rejects.toMatchObject({
      name: 'SupabaseUnsupportedPropertyTypeError',
      code: 'UNSUPPORTED_PROPERTY_TYPE',
      entity: 'SupabaseBigIntForeignKeyChild',
      property: 'parentId',
      propertyType: PropertyType.bigint
    });
    expect(connected.client.rpc).not.toHaveBeenCalled();
    expect(connected.client.channel).not.toHaveBeenCalled();

    const bypassed = createAdapter(entities);
    bypassed.rxdb.schemaManager.init();
    expect(() => bypassed.adapter.getRepository(SupabaseBigIntForeignKeyChild)).toThrow(
      SupabaseUnsupportedPropertyTypeError
    );
    expect(bypassed.client.rpc).not.toHaveBeenCalled();
    expect(bypassed.client.channel).not.toHaveBeenCalled();
  });

  it('does not reject a local-only repository solely because it contains binary', () => {
    const { adapter } = createAdapter([LocalBinaryRecord], SUPABASE_REMOTE);

    expect(() => adapter.getRepository(LocalBinaryRecord)).not.toThrow();
  });
});
