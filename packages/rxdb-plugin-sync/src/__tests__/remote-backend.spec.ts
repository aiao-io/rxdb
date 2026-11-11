import { type RxDBAdapterRemoteBase, RxDBError, RxDBSync } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import {
  assertRemoteBackendIs,
  bindRemoteBackend,
  instantiateSyncRecord,
  rebindRemoteBackend,
  RemoteBackendMismatchError
} from '../remote-backend.js';
import type { SyncManager } from '../SyncManager.js';

const syncRecord = (entity: string, remoteBackendId: string | null, lastPullRemoteChangeId: number | null) =>
  Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    lastPushedChangeId: 7,
    lastPullRemoteChangeId,
    remoteBackendId
  });

interface HarnessOptions {
  backendId: string;
  records: RxDBSync[];
  lastError?: Error | null;
  remoteBackendId?: string | null;
}

const createHarness = (options: HarnessOptions) => {
  const update = vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(record, patch));
  const repository = { find: vi.fn(async () => options.records), update };
  const txUpdate = vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(record, patch));
  const txRepository = { find: vi.fn(async () => options.records), update: txUpdate };
  const transaction = vi.fn(async (fun: (executor: unknown) => Promise<unknown>) =>
    fun({ getRepository: () => txRepository })
  );
  const reportError = vi.fn();
  const reportSuccess = vi.fn();
  const instantiate = vi.fn(() => Object.create(RxDBSync.prototype) as RxDBSync);
  const sm = {
    remoteBackendId: options.remoteBackendId ?? null,
    rxdb: {
      entityManager: { instantiate },
      syncState: { reportError, reportSuccess, snapshot: { lastError: options.lastError ?? null } }
    },
    getRemoteRepositories: async () => ({ adapter: { backendId: async () => options.backendId } }),
    getLocalRepositories: async () => ({ adapter: { getRepository: () => repository, transaction } })
  } as unknown as SyncManager;
  return { sm, update, txUpdate, transaction, reportError, reportSuccess, instantiate };
};

describe('远端身份', () => {
  describe('bindRemoteBackend', () => {
    it('把还没绑定的记录绑到远端当前身份，已绑定的不动', async () => {
      const legacy = syncRecord('Todo', null, 42);
      const current = syncRecord('Tag', 'backend-a', 9);
      const harness = createHarness({ backendId: 'backend-a', records: [legacy, current] });

      await expect(bindRemoteBackend(harness.sm)).resolves.toBe('backend-a');

      expect(harness.update).toHaveBeenCalledTimes(1);
      expect(harness.update).toHaveBeenCalledWith(legacy, { remoteBackendId: 'backend-a' });
      expect(legacy).toMatchObject({ remoteBackendId: 'backend-a', lastPullRemoteChangeId: 42 });
      expect(harness.reportError).not.toHaveBeenCalled();
    });

    it('有记录绑在别的身份上：抛错、写进 lastError，一行都不写', async () => {
      const records = [
        syncRecord('Todo', 'backend-old', 500),
        syncRecord('Tag', 'backend-old', 300),
        syncRecord('User', 'backend-older', 100),
        syncRecord('Note', null, null)
      ];
      const harness = createHarness({ backendId: 'backend-new', records });

      const error = await bindRemoteBackend(harness.sm).catch((rejection: unknown) => rejection);

      expect(error).toBeInstanceOf(RemoteBackendMismatchError);
      expect(error).toBeInstanceOf(RxDBError);
      expect(error).toMatchObject({
        name: 'RemoteBackendMismatchError',
        backendId: 'backend-new',
        boundBackendIds: ['backend-old', 'backend-older']
      });
      expect((error as Error).message).toContain('rebindRemoteBackend()');
      expect(harness.reportError).toHaveBeenCalledWith(error);
      expect(harness.update).not.toHaveBeenCalled();
    });
  });

  describe('rebindRemoteBackend', () => {
    it('在一个事务里清空不属于新远端的拉取游标并改绑，推送水位不动', async () => {
      const stale = syncRecord('Todo', 'backend-old', 500);
      const legacy = syncRecord('Tag', null, 300);
      const current = syncRecord('User', 'backend-new', 12);
      const harness = createHarness({ backendId: 'backend-new', records: [stale, legacy, current] });

      await expect(rebindRemoteBackend(harness.sm)).resolves.toEqual({
        backendId: 'backend-new',
        previousBackendIds: ['backend-old'],
        rebound: 2
      });

      expect(harness.transaction).toHaveBeenCalledTimes(1);
      expect(harness.update).not.toHaveBeenCalled();
      expect(harness.txUpdate).toHaveBeenCalledTimes(2);
      expect(stale).toMatchObject({
        remoteBackendId: 'backend-new',
        lastPullRemoteChangeId: null,
        lastPushedChangeId: 7
      });
      expect(legacy).toMatchObject({
        remoteBackendId: 'backend-new',
        lastPullRemoteChangeId: null,
        lastPushedChangeId: 7
      });
      expect(current).toMatchObject({ remoteBackendId: 'backend-new', lastPullRemoteChangeId: 12 });
    });

    it('改绑之后清掉那条远端身份错误', async () => {
      const harness = createHarness({
        backendId: 'backend-new',
        records: [],
        lastError: new RemoteBackendMismatchError('backend-new', ['backend-old'])
      });

      await rebindRemoteBackend(harness.sm);

      expect(harness.reportSuccess).toHaveBeenCalledTimes(1);
    });

    it('别的错误留在面板上：改绑与它无关', async () => {
      const harness = createHarness({ backendId: 'backend-new', records: [], lastError: new Error('offline') });

      await rebindRemoteBackend(harness.sm);

      expect(harness.reportSuccess).not.toHaveBeenCalled();
    });
  });

  describe('assertRemoteBackendIs', () => {
    const remoteOf = (backendId: string) => ({ backendId: async () => backendId }) as unknown as RxDBAdapterRemoteBase;

    it('远端此刻就是给定的身份：放行，不碰面板', async () => {
      const harness = createHarness({ backendId: 'backend-a', records: [] });

      await expect(assertRemoteBackendIs(harness.sm, remoteOf('backend-a'), 'backend-a')).resolves.toBeUndefined();

      expect(harness.reportError).not.toHaveBeenCalled();
    });

    // 不读同步记录：分支物化把身份冻在意图里，首次物化时本地一条记录都没有
    it('对不上：抛错并写进 lastError，旧身份就是给定的那一个', async () => {
      const harness = createHarness({ backendId: 'backend-b', records: [] });

      const error = await assertRemoteBackendIs(harness.sm, remoteOf('backend-b'), 'backend-a').catch(
        (rejection: unknown) => rejection
      );

      expect(error).toBeInstanceOf(RemoteBackendMismatchError);
      expect(error).toMatchObject({ backendId: 'backend-b', boundBackendIds: ['backend-a'] });
      expect(harness.reportError).toHaveBeenCalledWith(error);
    });
  });

  it('新建的同步记录盖上最近一次核实的远端身份', () => {
    const harness = createHarness({ backendId: 'backend-a', records: [], remoteBackendId: 'backend-a' });

    const record = instantiateSyncRecord(harness.sm);

    expect(record).toBeInstanceOf(RxDBSync);
    expect(record.remoteBackendId).toBe('backend-a');
    expect(harness.instantiate).toHaveBeenCalledWith(RxDBSync);
  });
});
