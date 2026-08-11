import type { SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const releaseComlinkProxyMock = vi.hoisted(() => vi.fn());
const wrapWithComlinkEndpointMock = vi.hoisted(() => vi.fn());

vi.mock('@aiao/rxdb-adapter-sqlite-core', async importOriginal => {
  const original = await importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-core')>();
  return {
    ...original,
    releaseComlinkProxy: releaseComlinkProxyMock,
    wrapWithComlinkEndpoint: wrapWithComlinkEndpointMock
  };
});

import { createSqliteClient } from '../create_sqlite_client.js';

describe('createSqliteClient 远端契约', () => {
  afterEach(() => {
    releaseComlinkProxyMock.mockReset();
    wrapWithComlinkEndpointMock.mockReset();
  });

  it('公开返回类型只承诺远端安全的 SqliteClientLike', () => {
    type CreatedClient = Awaited<ReturnType<typeof createSqliteClient>>;

    expectTypeOf<CreatedClient>().toEqualTypeOf<SqliteClientLike>();
  });

  it('向共享 transport 转发客户端所有权并等待远端 init', async () => {
    const sharedWorkerInstance = { port: {} } as SharedWorker;
    const remoteClient = {
      addEventListener: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      version: vi.fn()
    };
    wrapWithComlinkEndpointMock.mockResolvedValue(remoteClient);

    await expect(
      createSqliteClient('owned-worker', {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance,
        workerOwnership: 'client'
      })
    ).resolves.toBe(remoteClient);

    expect(wrapWithComlinkEndpointMock).toHaveBeenCalledWith(expect.anything(), {
      worker: undefined,
      workerInstance: undefined,
      sharedWorker: true,
      sharedWorkerInstance,
      workerOwnership: 'client'
    });
    expect(remoteClient.init).toHaveBeenCalledOnce();
  });

  it('远端 init 失败时释放客户端与 transport', async () => {
    const initError = new Error('remote init failed');
    const remoteClient = {
      addEventListener: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      init: vi.fn().mockRejectedValue(initError),
      version: vi.fn()
    };
    wrapWithComlinkEndpointMock.mockResolvedValue(remoteClient);

    await expect(
      createSqliteClient('failed-worker', {
        vfs: 'MemoryAsyncVFS',
        worker: true,
        workerInstance: {} as Worker,
        workerOwnership: 'client'
      })
    ).rejects.toBe(initError);

    expect(releaseComlinkProxyMock).toHaveBeenCalledWith(remoteClient);
  });
});
