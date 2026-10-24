import { type EntityType, type RxDB } from '@aiao/rxdb';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalMediaStore, LocalPreference } from './browser-media';
import { studioPayload } from './studio-draft';

function rig() {
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null;
      postMessage = vi.fn();
      close = vi.fn();
    }
  );
  const rows = new Map<string, LocalPreference>();
  const find = vi.fn(async (options: { where: { rules: { value: unknown }[] } }) => {
    const key = options.where.rules[0]?.value;
    return [...rows.values()].filter(row => key === undefined || row.key === key);
  });
  const update = vi.fn(async (row: LocalPreference, patch: Partial<LocalPreference>) => Object.assign(row, patch));
  const create = vi.fn(async (row: LocalPreference) => {
    rows.set(row.key, row);
    return row;
  });
  const repository = { find, update, create };
  const adapter = {
    getRepository: () => repository,
    transaction: vi.fn(
      async (operation: (executor: { getRepository: () => typeof repository }) => Promise<unknown>) => {
        const before = structuredClone([...rows]);
        try {
          return await operation({ getRepository: () => repository });
        } catch (error) {
          rows.clear();
          for (const [key, row] of before) rows.set(key, row);
          throw error;
        }
      }
    )
  };
  const liveRows = new BehaviorSubject<object[]>([]);
  const publish = vi.fn();
  const query = {
    find: vi.fn(() => of([])),
    findAll: vi.fn(() => liveRows)
  };
  const database = {
    dispatchEvent: publish,
    localAdapter$: of(adapter),
    getAdapter: async () => adapter,
    entityManager: {
      instantiate: (entity: EntityType, values: object) => Object.assign(Object.create(entity.prototype), values),
      getRepository: () => query
    }
  } as unknown as RxDB;
  const store = Reflect.construct(LocalMediaStore, [
    '00000000-0000-4000-8000-000000000001',
    database,
    {},
    'browser',
    async () => undefined
  ]) as LocalMediaStore;
  return { store, rows, find, update, create, adapter, liveRows, query, publish };
}
afterEach(() => vi.unstubAllGlobals());
describe('local media queries and preference transactions', () => {
  it('initializes a setting once without replacing another window’s value', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    expect(await r.store.ensurePreference('providers-v1', 'first')).toEqual({ payload: 'first', revision: 1 });
    expect(await r.store.ensurePreference('providers-v1', 'second')).toEqual({ payload: 'first', revision: 1 });
    expect(r.create).toHaveBeenCalledOnce();
  });
  it('rolls back a remote projection when the local draft changed during synchronization', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    const state = { document: { type: 'doc' as const, content: [] }, fields: [], values: {} };
    r.rows.set('image-studio', { key: 'image-studio', payload: studioPayload(state), revision: 2 } as LocalPreference);
    await expect(
      r.store.applyProjection({
        preferences: [{ key: 'providers-v1', payload: '[]', revision: null }],
        draft: { state, revision: 1 }
      })
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(r.rows.has('providers-v1')).toBe(false);
    expect(r.rows.get('image-studio')?.revision).toBe(2);
    expect(r.publish).not.toHaveBeenCalled();
  });
  it('rolls back the entire preference batch when its second write fails', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    r.create.mockImplementationOnce(async row => {
      r.rows.set(row.key, row);
      return row;
    });
    r.create.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      r.store.savePreferences([
        { key: 'provider-keys-v1', payload: '{"key":"replacement"}', revision: null },
        { key: 'providers-v1', payload: '{"providers":[]}', revision: null }
      ])
    ).rejects.toThrow('disk full');
    expect(r.rows.size).toBe(0);
    expect(r.adapter.transaction).toHaveBeenCalledOnce();
    expect(r.publish).not.toHaveBeenCalled();
  });
  it('rejects stale revisions without committing another preference', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    r.rows.set('providers-v1', { key: 'providers-v1', payload: 'current', revision: 2 } as LocalPreference);
    await expect(
      r.store.savePreferences([
        { key: 'provider-keys-v1', payload: 'changed', revision: null },
        { key: 'providers-v1', payload: 'stale', revision: 1 }
      ])
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(r.rows.has('provider-keys-v1')).toBe(false);
    expect(r.rows.get('providers-v1')?.payload).toBe('current');
    expect(r.publish).not.toHaveBeenCalled();
  });
  it('publishes native entity events only after the full batch commits', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    const create = r.create.getMockImplementation()!;
    r.create.mockImplementation(async row => {
      expect(r.publish).not.toHaveBeenCalled();
      return create(row);
    });
    await expect(
      r.store.savePreferences([
        { key: 'providers-v1', payload: '[]', revision: null },
        { key: 'provider-keys-v1', payload: '{}', revision: null }
      ])
    ).resolves.toEqual([1, 1]);
    expect(r.publish).toHaveBeenCalledTimes(2);
  });
  it('reads preferences once using the adapter authoritative query', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    r.rows.set('tasks-v1', { key: 'tasks-v1', payload: '[]', revision: 1 } as LocalPreference);
    await expect(r.store.preference('tasks-v1')).resolves.toEqual({ payload: '[]', revision: 1 });
    expect(r.find).toHaveBeenCalledOnce();
  });
  it('uses an unbounded reactive query for assets beyond the default 100 rows', async () => {
    const r = rig();
    r.liveRows.next(
      Array.from({ length: 101 }, (_, i) => ({
        jobId: `job-${i}`,
        kind: 'audio',
        prompt: 'fixture',
        modelId: 'fixture',
        bytes: 1,
        stage: 'broken',
        result: '',
        request: ''
      }))
    );
    const assets = await firstValueFrom(r.store.assets$('audio'));
    expect(assets).toHaveLength(101);
    expect(r.query.findAll).toHaveBeenCalledOnce();
  });
  it('lists metadata without reading or repairing file bodies', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, operation: () => Promise<unknown>) => operation() }
    });
    const r = rig();
    await expect(r.store.list()).resolves.toEqual([]);
    expect(r.find).toHaveBeenCalledOnce();
  });
  it('streams image works through the native repository', async () => {
    const r = rig();
    r.liveRows.next([
      { jobId: 'image', prompt: 'test', modelId: 'fixture', bytes: 1, stage: 'ready', createdAt: new Date() }
    ]);
    expect(await firstValueFrom(r.store.works$())).toMatchObject([{ jobId: 'image', status: 'saved' }]);
    expect(r.query.findAll).toHaveBeenCalledOnce();
  });
});
