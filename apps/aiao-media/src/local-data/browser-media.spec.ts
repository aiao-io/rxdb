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
  return { store, rows, find, update, create, adapter, liveRows, query, publish, database };
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

const imageId = '10000000-0000-4000-8000-000000000001';
function imageRig(patch: Record<string, unknown> = {}) {
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } });
  const r = rig();
  const work = {
    jobId: imageId,
    fileId: 'fixture-file',
    digest: 'a'.repeat(64),
    bytes: 33,
    stage: 'ready',
    prompt: '本机图片',
    modelId: 'fixture',
    createdAt: new Date(),
    ...patch
  };
  r.find.mockResolvedValue([work as unknown as LocalPreference]);
  const storage = {
    getMeta: vi.fn(async () => ({ opfsPath: `${imageId}.png`, mimeType: 'image/png', size: 33 })),
    read: vi.fn<() => Promise<Blob>>(async () => new Blob([new Uint8Array(33)], { type: 'image/png' }))
  };
  Object.assign(r.database, { storage });
  return { ...r, storage, work };
}
function pngHeader(width = 64, height = 64) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('original image integrity and failure classification', () => {
  it.each([
    { fileId: '' },
    { jobId: 'unsafe-path' },
    { digest: 'invalid' },
    { bytes: 0 },
    { bytes: 16 * 1024 * 1024 + 1 }
  ])('refuses incomplete image metadata before any file read', async patch => {
    const r = imageRig(patch);
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.storage.read).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { opfsPath: 'other.png', mimeType: 'image/png', size: 33 },
    { opfsPath: `${imageId}.png`, mimeType: 'image/jpeg', size: 33 },
    { opfsPath: `${imageId}.png`, mimeType: 'image/png', size: 32 }
  ])('rejects missing or mismatched file associations while preserving metadata', async metadata => {
    const r = imageRig();
    r.storage.getMeta.mockResolvedValue(metadata as Awaited<ReturnType<typeof r.storage.getMeta>>);
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.storage.read).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
  });

  it.each([
    [new DOMException('missing', 'NotFoundError'), 'corrupt'],
    [new Error('temporarily denied'), 'unavailable']
  ] as const)('distinguishes missing originals from temporary access failures', async (error, code) => {
    const r = imageRig();
    r.storage.read.mockRejectedValue(error);
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code });
    expect(r.update).not.toHaveBeenCalled();
  });

  it('rejects changed original bytes without marking the existing save as broken', async () => {
    const r = imageRig();
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.update).not.toHaveBeenCalled();
    r.storage.read.mockResolvedValue(new Blob(['truncated'], { type: 'image/png' }));
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.update).not.toHaveBeenCalled();
  });

  it('does not read originals that have not reached the confirmed ready state', async () => {
    const r = imageRig({ stage: 'saving' });
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.storage.read).not.toHaveBeenCalled();
    r.find.mockResolvedValue([]);
    await expect(r.store.preview(imageId)).rejects.toMatchObject({ code: 'corrupt' });
  });
});

describe('reference file validation before persistence', () => {
  it.each([
    new File(['payload'], 'fake.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
    new File(['not-png'], 'fake.png', { type: 'image/png' }),
    new File([pngHeader().slice(0, 24)], 'short.png', { type: 'image/png' }),
    new File([pngHeader(0, 64)], 'zero.png', { type: 'image/png' }),
    new File([pngHeader(5000, 64)], 'wide.png', { type: 'image/png' }),
    new File([pngHeader(64, 5000)], 'tall.png', { type: 'image/png' }),
    new File(['not-jpeg'], 'fake.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([255, 216, 255, 217])], 'empty.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([255, 216, 255, 224, 0, 100, 255, 217])], 'bad-length.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array([255, 216, 255, 218, 0, 2, 255, 217])], 'no-frame.jpg', { type: 'image/jpeg' })
  ])('rejects a mislabeled, truncated or excessive reference before changing the selected reference', async file => {
    const r = rig();
    await expect(r.store.saveReference(file, 0)).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.find).not.toHaveBeenCalled();
    expect(r.create).not.toHaveBeenCalled();
  });

  it('closes a decoded bitmap even if its dimensions cannot be accepted', async () => {
    const r = rig();
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 5000, height: 64, close }))
    );
    await expect(
      r.store.saveReference(new File([pngHeader()], 'invalid.png', { type: 'image/png' }), 0)
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(r.find).not.toHaveBeenCalled();
  });

  it('rejects decoding failure without changing the selected reference', async () => {
    const r = rig();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      })
    );
    await expect(
      r.store.saveReference(new File([pngHeader()], 'invalid.png', { type: 'image/png' }), 0)
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(r.create).not.toHaveBeenCalled();
  });
});

function settingsRig() {
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } });
  return rig();
}
describe('stored draft and preference input boundaries', () => {
  it('creates and revises a plain draft through compare-and-set without losing the previous revision', async () => {
    const r = settingsRig();
    expect(await r.store.draft()).toBeNull();
    expect(await r.store.saveDraft('第一版', null)).toEqual({ prompt: '第一版', revision: 1 });
    expect(await r.store.saveDraft('第二版', 1)).toEqual({ prompt: '第二版', revision: 2 });
    expect(await r.store.draft()).toEqual({ prompt: '第二版', revision: 2 });
    await expect(r.store.saveDraft('过期页面', 1)).rejects.toMatchObject({ code: 'conflict' });
    expect(await r.store.draft()).toEqual({ prompt: '第二版', revision: 2 });
  });

  it('rejects excessive draft text before touching stored data', async () => {
    const r = settingsRig();
    await expect(r.store.saveDraft('a'.repeat(4001), null)).rejects.toMatchObject({ code: 'write_failed' });
    expect(r.find).not.toHaveBeenCalled();
    expect(r.create).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid/key', 'A', 'a'.repeat(81)])(
    'rejects invalid preference key %s before starting a transaction',
    async key => {
      const r = settingsRig();
      await expect(r.store.ensurePreference(key, '{}')).rejects.toMatchObject({ code: 'write_failed' });
      await expect(r.store.savePreferences([{ key, payload: '{}', revision: null }])).rejects.toMatchObject({
        code: 'write_failed'
      });
      expect(r.adapter.transaction).not.toHaveBeenCalled();
      expect(r.find).not.toHaveBeenCalled();
    }
  );

  it('rejects duplicate preference keys and excessive payloads atomically', async () => {
    const r = settingsRig();
    const change = { key: 'settings-v1', payload: '{}', revision: null };
    await expect(r.store.savePreferences([change, change])).rejects.toMatchObject({ code: 'write_failed' });
    const large = 'a'.repeat(512 * 1024 + 1);
    await expect(r.store.ensurePreference(change.key, large)).rejects.toMatchObject({ code: 'write_failed' });
    await expect(r.store.savePreferences([{ ...change, payload: large }])).rejects.toMatchObject({
      code: 'write_failed'
    });
    expect(r.rows.size).toBe(0);
    expect(r.adapter.transaction).not.toHaveBeenCalled();
  });

  it('allows a boundary-sized preference and returns its committed revision', async () => {
    const r = settingsRig();
    const payload = 'a'.repeat(512 * 1024);
    expect(await r.store.savePreference('settings-v1', payload, null)).toBe(1);
    expect(await r.store.preference('settings-v1')).toEqual({ payload, revision: 1 });
    expect(await r.store.savePreference('settings-v1', '{}', 1)).toBe(2);
  });
});
