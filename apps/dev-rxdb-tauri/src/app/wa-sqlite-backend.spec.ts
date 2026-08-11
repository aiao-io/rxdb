import { selectWaSqliteBackend } from './wa-sqlite-backend';

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
