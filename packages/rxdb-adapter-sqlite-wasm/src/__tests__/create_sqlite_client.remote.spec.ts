import type { SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const wrapWithComlinkEndpointMock = vi.hoisted(() => vi.fn());

vi.mock('@aiao/rxdb-adapter-sqlite-core', async importOriginal => {
  const original = await importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-core')>();
  return { ...original, wrapWithComlinkEndpoint: wrapWithComlinkEndpointMock };
});

import { createSqliteClient } from '../create_sqlite_client.js';

describe('createSqliteClient 远端契约', () => {
  afterEach(() => {
    wrapWithComlinkEndpointMock.mockReset();
  });

  it('公开返回类型只承诺远端安全的 SqliteClientLike', () => {
    type CreatedClient = Awaited<ReturnType<typeof createSqliteClient>>;

    expectTypeOf<CreatedClient>().toEqualTypeOf<SqliteClientLike>();
  });

  it('等待 Comlink remote init 完成后才返回客户端', async () => {
    let resolveInit: (() => void) | undefined;
    const initPromise = new Promise<void>(resolve => {
      resolveInit = resolve;
    });
    const remoteClient = {
      addEventListener: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
      init: vi.fn(() => initPromise),
      version: vi.fn().mockResolvedValue('3.0.0')
    };
    wrapWithComlinkEndpointMock.mockResolvedValue(remoteClient);

    let settled = false;
    const pendingClient = createSqliteClient('remote-db', {
      vfs: 'memory',
      worker: true,
      workerInstance: {} as Worker
    }).then(client => {
      settled = true;
      return client;
    });

    await vi.waitFor(() => {
      expect(remoteClient.init).toHaveBeenCalledWith('remote-db', expect.objectContaining({ vfs: 'memory' }));
    });
    expect(settled).toBe(false);

    resolveInit?.();
    await expect(pendingClient).resolves.toBe(remoteClient);
  });

  it('workerInstance 本身即可选择 Worker transport', async () => {
    const workerInstance = {} as Worker;
    const remoteClient = {
      addEventListener: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      version: vi.fn()
    };
    wrapWithComlinkEndpointMock.mockResolvedValue(remoteClient);

    await expect(createSqliteClient('inferred-worker', { vfs: 'memory', workerInstance })).resolves.toBe(remoteClient);
    expect(wrapWithComlinkEndpointMock).toHaveBeenCalledWith(expect.anything(), {
      worker: undefined,
      workerInstance,
      sharedWorker: undefined,
      sharedWorkerInstance: undefined,
      workerOwnership: undefined
    });
  });
});
