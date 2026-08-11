/**
 * 通过模拟 getEntityObjectFromResult 覆盖 updateCachedEntity 的边界。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getEntityObjectFromResultMock } = vi.hoisted(() => ({
  getEntityObjectFromResultMock: vi.fn()
}));

vi.mock('../pglite.utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../pglite.utils.js')>();
  return {
    ...actual,
    getEntityObjectFromResult: (...args: unknown[]) => getEntityObjectFromResultMock(...args)
  };
});

import { EntityType, RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import mutations from '../rxdb_adapter_mutations.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('rxdb_adapter_mutations unit edges', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;

  afterEach(async () => {
    getEntityObjectFromResultMock.mockReset();
    if (rxdb) await rxdb.disconnectAll();
  });

  const setup = async () => {
    const actual = await vi.importActual<typeof import('../pglite.utils.js')>('../pglite.utils.js');
    getEntityObjectFromResultMock.mockImplementation((...args: Parameters<typeof actual.getEntityObjectFromResult>) =>
      actual.getEntityObjectFromResult(...args)
    );

    rxdb = new RxDB({
      dbName: `mutations-unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
  };

  it('throws invalid_entity_id when select row has no usable id', async () => {
    await setup();
    const user = new User();
    user.name = 'bad-id';
    user.age = 1;

    getEntityObjectFromResultMock.mockResolvedValue({ name: 'bad-id' });

    await expect(
      mutations(adapter, {
        create: new Map([[User, new Set([user])]]),
        update: new Map(),
        remove: new Map()
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(RxdbAdapterPGliteError);
      expect((error as RxdbAdapterPGliteError).code).toBe('invalid_entity_id');
      expect(String(error)).toMatch(/invalid entity id/i);
      return true;
    });
  });

  it('skips cache update when entity ref is missing after select', async () => {
    await setup();
    const user = new User();
    user.name = 'ghost';
    user.age = 2;

    getEntityObjectFromResultMock.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      name: 'ghost',
      age: 2
    });

    const result = await mutations(adapter, {
      create: new Map([[User, new Set([user])]]),
      update: new Map(),
      remove: new Map()
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(user);
  });

  it('skips empty remove sets without failing', async () => {
    await setup();
    const result = await mutations(adapter, {
      create: new Map(),
      update: new Map(),
      remove: new Map([[User as EntityType, new Set()]])
    });
    expect(result).toHaveLength(0);
  });

  it('accepts finite numeric ids when updating cache', async () => {
    await setup();
    const user = new User();
    user.name = 'num-id';
    user.age = 3;

    // 第一次调用返回数字 id 以覆盖 validNumber 分支；缺少实体引用，因此跳过更新。
    getEntityObjectFromResultMock.mockResolvedValueOnce({
      id: 42,
      name: 'num-id',
      age: 3
    });

    const result = await mutations(adapter, {
      create: new Map([[User, new Set([user])]]),
      update: new Map(),
      remove: new Map()
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(user);
  });
});
