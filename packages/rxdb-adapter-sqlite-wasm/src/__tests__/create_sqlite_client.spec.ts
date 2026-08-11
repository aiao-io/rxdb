import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { describe, expect, it } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';

describe('createSqliteClient Worker 配置校验', () => {
  it('worker: true 但缺少 workerInstance 时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', worker: true })).rejects.toThrow(RxDBAdapterSqliteError);
  });

  it('sharedWorker: true 但缺少 sharedWorkerInstance 时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', sharedWorker: true })).rejects.toThrow(
      RxDBAdapterSqliteError
    );
  });

  it('同时配置 Worker 和 SharedWorker 时必须抛错', async () => {
    await expect(
      createSqliteClient('db', {
        vfs: 'memory',
        worker: true,
        workerInstance: {} as Worker,
        sharedWorker: true,
        sharedWorkerInstance: {} as SharedWorker
      })
    ).rejects.toThrow(RxDBAdapterSqliteError);
  });

  it('opfs 缺 Worker 实例时必须在创建阶段失败，而不是回退主线程', async () => {
    await expect(createSqliteClient('db', { vfs: 'opfs', worker: true })).rejects.toThrow(RxDBAdapterSqliteError);
  });
});

describe('createSqliteClient 数值选项校验', () => {
  it('cacheSizeKb 为负数时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', cacheSizeKb: -100 })).rejects.toThrow(
      RxDBAdapterSqliteError
    );
  });

  it('cacheSizeKb 为 0 时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', cacheSizeKb: 0 })).rejects.toThrow(RxDBAdapterSqliteError);
  });

  it('cacheSizeKb 为非整数时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', cacheSizeKb: 1.5 })).rejects.toThrow(RxDBAdapterSqliteError);
  });

  it('batchTimeout 为负数时必须抛错', async () => {
    await expect(createSqliteClient('db', { vfs: 'memory', batchTimeout: -1 })).rejects.toThrow(RxDBAdapterSqliteError);
  });

  it('batchTimeout 为 0（IMMEDIATE 档位）时允许', async () => {
    const client = await createSqliteClient(`opt-imm-${Date.now()}`, {
      vfs: 'memory',
      batchTimeout: 0,
      wasmUrl: sqliteWasmUrl
    });
    expect(await client.version()).toBeTruthy();
    await client.disconnect();
  });
});
