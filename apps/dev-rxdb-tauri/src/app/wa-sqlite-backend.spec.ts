import { resolveForcedBackend, resolveWaSqliteBackend, selectWaSqliteBackend } from './wa-sqlite-backend';

describe('selectWaSqliteBackend', () => {
  it.each([
    [true, true, 'OPFSCoopSyncVFS'],
    [true, false, 'OPFSCoopSyncVFS'],
    [false, true, 'IDBBatchAtomicVFS'],
    [false, false, 'unavailable']
  ] as const)('maps OPFS=%s SharedWorker=%s to %s', (opfsAvailable, sharedWorkerAvailable, expected) => {
    expect(selectWaSqliteBackend(opfsAvailable, sharedWorkerAvailable)).toBe(expected);
  });
});

describe('resolveForcedBackend', () => {
  it.each([
    ['opfs', 'OPFSCoopSyncVFS'],
    ['idb', 'IDBBatchAtomicVFS'],
    ['unavailable', 'unavailable']
  ] as const)('maps forced %s to %s', (forced, expected) => {
    expect(resolveForcedBackend(forced)).toBe(expected);
  });
});

/**
 * 强制档的意义是**不看**运行时能力：强制 opfs 要在没有真 OPFS 的 WebView 上照样把
 * OPFSCoopSyncVFS 宣告出去（或诚实失败），探测会把它悄悄改成另一个后端，实测就成了
 * 「测了等于没测」。`unavailable` 那一态也必须透传——建库要诚实失败，而不是改道。
 */
describe('resolveWaSqliteBackend', () => {
  it('forced 档直接映射，探测函数根本不被调用', async () => {
    const probe = vi.fn(async () => {
      throw new Error('probe must not run under a forced tier');
    });
    await expect(resolveWaSqliteBackend('opfs', probe, false)).resolves.toBe('OPFSCoopSyncVFS');
    await expect(resolveWaSqliteBackend('idb', probe, true)).resolves.toBe('IDBBatchAtomicVFS');
    await expect(resolveWaSqliteBackend('unavailable', probe, false)).resolves.toBe('unavailable');
    expect(probe).not.toHaveBeenCalled();
  });

  it('未强制时探测结果与 SharedWorker 能力仍喂给 selectWaSqliteBackend', async () => {
    await expect(resolveWaSqliteBackend(undefined, async () => true, false)).resolves.toBe('OPFSCoopSyncVFS');
    await expect(resolveWaSqliteBackend(undefined, async () => false, true)).resolves.toBe('IDBBatchAtomicVFS');
    await expect(resolveWaSqliteBackend(undefined, async () => false, false)).resolves.toBe('unavailable');
  });
});
