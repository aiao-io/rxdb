import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';
import { WaSqliteClient } from '../SqliteClient.js';

const workerInstance = {} as Worker;
const sharedWorkerInstance = { port: {} } as SharedWorker;

describe('createSqliteClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [{ worker: true }, '`worker` and `workerInstance` must be provided together'],
    [{ workerInstance }, '`worker` and `workerInstance` must be provided together'],
    [{ sharedWorker: true }, '`sharedWorker` and `sharedWorkerInstance` must be provided together'],
    [{ sharedWorkerInstance }, '`sharedWorker` and `sharedWorkerInstance` must be provided together'],
    [
      { worker: true, workerInstance, sharedWorker: true, sharedWorkerInstance },
      'Worker and SharedWorker transports are mutually exclusive'
    ]
  ])('拒绝不完整或冲突的 transport 配置 %#', async (transport, message) => {
    const init = vi.spyOn(WaSqliteClient.prototype, 'init').mockResolvedValue(undefined);

    await expect(
      createSqliteClient('transport-validation', {
        vfs: 'MemoryAsyncVFS',
        ...transport
      })
    ).rejects.toThrow(message);
    expect(init).not.toHaveBeenCalled();
  });

  it('把 cacheSizeKb 与 batchTimeout 传给 client.init', async () => {
    const init = vi.spyOn(WaSqliteClient.prototype, 'init').mockResolvedValue(undefined);

    const client = await createSqliteClient('forward-options', {
      vfs: 'MemoryAsyncVFS',
      async: true,
      cacheSizeKb: 2048,
      batchTimeout: 7
    });

    expect(client).toBeInstanceOf(WaSqliteClient);
    expect(init).toHaveBeenCalledWith('forward-options', {
      vfs: 'MemoryAsyncVFS',
      async: true,
      worker: undefined,
      sharedWorker: undefined,
      wasmPath: undefined,
      locateFile: undefined,
      cacheSizeKb: 2048,
      batchTimeout: 7
    });
  });

  it.each([
    [{ cacheSizeKb: -1 }, 'cacheSizeKb'],
    [{ cacheSizeKb: 0 }, 'cacheSizeKb'],
    [{ cacheSizeKb: Number.NaN }, 'cacheSizeKb'],
    [{ cacheSizeKb: 1.5 }, 'cacheSizeKb'],
    [{ cacheSizeKb: '1; DROP TABLE todos' as unknown as number }, 'cacheSizeKb'],
    [{ batchTimeout: -1 }, 'batchTimeout'],
    [{ batchTimeout: Number.NaN }, 'batchTimeout'],
    [{ batchTimeout: 1.5 }, 'batchTimeout'],
    [{ batchTimeout: '0; SELECT 1' as unknown as number }, 'batchTimeout']
  ])('拒绝非法数值选项 %#', async (numericOptions, optionName) => {
    const init = vi.spyOn(WaSqliteClient.prototype, 'init').mockResolvedValue(undefined);

    await expect(
      createSqliteClient('numeric-validation', {
        vfs: 'MemoryAsyncVFS',
        ...numericOptions
      })
    ).rejects.toThrow(RxDBAdapterSqliteError);
    await expect(
      createSqliteClient('numeric-validation', {
        vfs: 'MemoryAsyncVFS',
        ...numericOptions
      })
    ).rejects.toThrow(optionName);
    expect(init).not.toHaveBeenCalled();
  });

  it('worker 模式下 locateFile 应该显式抛错，而不是留到 Comlink 抛 DataCloneError', async () => {
    const init = vi.spyOn(WaSqliteClient.prototype, 'init').mockResolvedValue(undefined);

    await expect(
      createSqliteClient('worker-locate-file', {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: true,
        workerInstance,
        locateFile: (name: string) => `/assets/${name}`
      })
    ).rejects.toThrow('locateFile');
    expect(init).not.toHaveBeenCalled();
  });

  it('允许 batchTimeout 为 0', async () => {
    const init = vi.spyOn(WaSqliteClient.prototype, 'init').mockResolvedValue(undefined);

    await createSqliteClient('immediate-batch', {
      vfs: 'MemoryAsyncVFS',
      batchTimeout: 0
    });

    expect(init).toHaveBeenCalledWith('immediate-batch', expect.objectContaining({ batchTimeout: 0 }));
  });
});
