import { RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFailureArchiveApi } from './failure-archive-api';

const { createSecondary } = vi.hoisted(() => ({ createSecondary: vi.fn() }));

vi.mock('./demo-rxdb-config', async importOriginal => ({
  ...(await importOriginal<typeof import('./demo-rxdb-config')>()),
  createMainThreadIdbRxDB: createSecondary
}));

const REQUEST = { deadlineMs: 5_000, lockTimeoutMs: 1_000, maxBytes: 1024 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

// 第二实例连接即失败：本组只关心它何时被建出来，不走到备份
function failingSecondary(): RxDB {
  return {
    connect: () => Promise.reject(new Error('secondary connect stub')),
    destroy: () => Promise.resolve()
  } as unknown as RxDB;
}

function installWithPrimary(connecting: Promise<unknown>) {
  const primary = { connect: vi.fn(() => connecting) } as unknown as RxDB;
  installFailureArchiveApi(primary, { dbName: 'db', baseHref: '/' });
  const api = window.__rxdbFailureArchive;
  if (!api) throw new Error('failure archive api not installed');
  return api;
}

describe('installFailureArchiveApi archive()', () => {
  afterEach(() => {
    createSecondary.mockReset();
    delete window.__rxdbFailureArchive;
  });

  it('主实例的 connect() 还在进行时不建第二实例（两边同时建触发器会撞 database is locked）', async () => {
    createSecondary.mockImplementation(failingSecondary);
    const primaryConnect = deferred<unknown>();
    const api = installWithPrimary(primaryConnect.promise);

    const archiving = api.archive(REQUEST);
    await Promise.resolve();
    await Promise.resolve();
    expect(createSecondary).not.toHaveBeenCalled();

    primaryConnect.resolve({});
    const result = await archiving;
    expect(createSecondary).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, reason: { stage: 'connect', message: 'Error: secondary connect stub' } });
  });

  it('主实例连接失败也照常归档：只等它停手，不以它的成败为准', async () => {
    createSecondary.mockImplementation(failingSecondary);
    const api = installWithPrimary(Promise.reject(new Error('primary connect failed')));

    const result = await api.archive(REQUEST);
    expect(createSecondary).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, reason: { stage: 'connect', message: 'Error: secondary connect stub' } });
  });

  it('等主实例也受截止约束：截止先到报 connect 阶段的 timeout，不建第二实例', async () => {
    createSecondary.mockImplementation(failingSecondary);
    const api = installWithPrimary(new Promise(() => undefined));

    const result = await api.archive({ ...REQUEST, deadlineMs: 20 });
    expect(createSecondary).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, reason: { stage: 'connect', code: 'timeout' } });
  });
});
