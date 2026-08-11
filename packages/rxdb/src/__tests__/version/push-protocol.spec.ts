import { describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RemoteMergeResult } from '../../rxdb-adapter.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { IRxDBChange } from '../../system/system.interface.js';
import type { TransactionExecutor, TransactionExecutorFun } from '../../transaction/transaction-executor.interface.js';
import { pushRepository } from '../../version/push-repository.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { User } from '../fixtures/test-entities.js';

type QueryRule = { field: string; operator: string; value: unknown };
type QueryOptions = {
  where?: { rules: QueryRule[] };
  orderBy?: Array<{ field: string; sort: 'asc' | 'desc' }>;
};
type LegacyMergeChanges = (
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
) => Promise<RemoteMergeResult | number | void>;
interface RemoteAdapterStub {
  mergeChanges: LegacyMergeChanges;
}

function createChange(
  id: number,
  type: RxDBChange['type'],
  patch: RxDBChange['patch'],
  inversePatch: RxDBChange['inversePatch'],
  entityId: string = '11111111-1111-1111-1111-111111111111'
): RxDBChange {
  const change = Object.create(RxDBChange.prototype) as RxDBChange;
  change.id = id;
  change.namespace = 'public';
  change.entity = 'User';
  change.entityId = entityId as RxDBChange['entityId'];
  change.branchId = 'main';
  change.type = type;
  change.patch = patch;
  change.inversePatch = inversePatch;
  change.remoteId = null;
  change.revertChangeId = null;
  change.createdAt = new Date(`2026-01-01T00:00:0${id}.000Z`);
  change.updatedAt = new Date(`2026-01-01T00:00:0${id}.000Z`);
  return change;
}

function createSyncRecord(): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = 'public:User:main';
  record.namespace = 'public';
  record.entity = 'User';
  record.branchId = 'main';
  record.syncType = 'full';
  record.lastPushedChangeId = null;
  record.lastPushedAt = null;
  record.lastPulledAt = null;
  record.lastPullRemoteChangeId = null;
  record.enabled = true;
  record.createdAt = new Date('2026-01-01T00:00:00.000Z');
  record.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return record;
}

function matchesRules(change: RxDBChange, rules: QueryRule[]): boolean {
  return rules.every(rule => {
    const value = change[rule.field as keyof RxDBChange];
    if (rule.operator === '=') return value === rule.value;
    if (rule.operator === '>') return typeof value === 'number' && typeof rule.value === 'number' && value > rule.value;
    if (rule.operator === 'in') return Array.isArray(rule.value) && rule.value.includes(value);
    throw new Error(`Unsupported operator: ${rule.operator}`);
  });
}

function createVersionManager(localChanges: RxDBChange[], remoteAdapter: RemoteAdapterStub) {
  const syncRecord = createSyncRecord();
  const syncRepo = {
    find: vi.fn(async () => [syncRecord]),
    create: vi.fn(async (record: RxDBSync) => record),
    update: vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => {
      Object.assign(record, patch);
      return record;
    })
  } as unknown as IRepository<typeof RxDBSync>;

  const changeRepo = {
    find: vi.fn(async (options?: QueryOptions) => {
      const rules = options?.where?.rules ?? [];
      const result = localChanges.filter(change => matchesRules(change, rules));
      return options?.orderBy?.[0]?.sort === 'desc' ? [...result].reverse() : result;
    })
  } as unknown as IRepository<typeof RxDBChange>;

  const saveMany = vi.fn(async (changes: RxDBChange[]) => changes);
  const localAdapter = {
    getRepository: vi.fn((entityType: unknown) => {
      if (entityType === RxDBSync) return syncRepo;
      if (entityType === RxDBChange) return changeRepo;
      throw new Error('Unexpected repository request');
    }),
    saveMany
  };
  const transaction = vi.fn(async <T>(fun: TransactionExecutorFun<T>): Promise<T> => {
    const executor = { getRepository: localAdapter.getRepository, saveMany } as unknown as TransactionExecutor;
    return await fun(executor);
  });
  Object.assign(localAdapter, { transaction });

  const vm = {
    rxdb: {
      config: {
        entities: [User],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'local' },
          remote: { adapter: 'remote' }
        }
      },
      context: { clientId: 'local-client' },
      dispatchEvent: vi.fn()
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: 'main' }))
  } as unknown as VersionManager;

  return { vm, saveMany, syncRecord };
}

describe('pushRepository sync protocol', () => {
  it('uses mergeChanges with complete source history as the only push protocol', async () => {
    const insert = createChange(1, 'INSERT', { id: 'entity-1', name: 'before' }, null);
    const update = createChange(2, 'UPDATE', { name: 'after' }, { name: 'before' });
    const mergeChanges = vi.fn<LegacyMergeChanges>(async () => ({
      maxChangeId: 102,
      changeIdMapping: [
        { localId: 1, remoteId: 101 },
        { localId: 2, remoteId: 102 }
      ]
    }));
    const { vm, saveMany, syncRecord } = createVersionManager([insert, update], { mergeChanges });

    const result = await pushRepository(vm, 'public', 'User', { includeRelated: false });

    expect(result).toMatchObject({ pushed: 1, compacted: 1, originalCount: 2, failed: 0 });
    expect(mergeChanges).toHaveBeenCalledTimes(1);
    const [actions, branchId, sourceChanges] = mergeChanges.mock.calls[0];
    expect(branchId).toBe('main');
    expect(actions.inserts).toHaveLength(1);
    expect(actions.updates).toHaveLength(0);
    expect(sourceChanges).toEqual([insert, update]);
    expect(insert.remoteId).toBe(101);
    expect(update.remoteId).toBe(102);
    expect(saveMany).toHaveBeenCalledWith([insert, update]);
    expect(syncRecord.lastPushedChangeId).toBe(2);
  });

  it('batches compacted actions while preserving each batch source history', async () => {
    const firstEntityId = '11111111-1111-1111-1111-111111111111';
    const secondEntityId = '22222222-2222-2222-2222-222222222222';
    const thirdEntityId = '33333333-3333-3333-3333-333333333333';
    const changes = [
      createChange(1, 'INSERT', { id: firstEntityId, name: 'before' }, null, firstEntityId),
      createChange(2, 'UPDATE', { name: 'after' }, { name: 'before' }, firstEntityId),
      createChange(3, 'INSERT', { id: secondEntityId, name: 'second' }, null, secondEntityId),
      createChange(4, 'INSERT', { id: thirdEntityId, name: 'third' }, null, thirdEntityId)
    ];
    const mergeChanges = vi.fn<LegacyMergeChanges>(async (_actions, _branchId, sourceChanges) => {
      if (sourceChanges === undefined) throw new Error('Expected source changes');
      return {
        changeIdMapping: sourceChanges.map(change => ({ localId: change.id, remoteId: 100 + change.id }))
      };
    });
    const { vm, syncRecord } = createVersionManager(changes, { mergeChanges });

    const result = await pushRepository(vm, 'public', 'User', { batchSize: 2, includeRelated: false });

    expect(result).toMatchObject({ pushed: 3, compacted: 1, originalCount: 4, failed: 0 });
    expect(mergeChanges).toHaveBeenCalledTimes(2);
    expect(mergeChanges.mock.calls.map(([actions]) => actions.inserts.size)).toEqual([2, 1]);
    expect(mergeChanges.mock.calls.map(([, , sourceChanges]) => sourceChanges?.map(change => change.id))).toEqual([
      [1, 2, 3],
      [4]
    ]);
    expect(changes.map(change => change.remoteId)).toEqual([101, 102, 103, 104]);
    expect(syncRecord.lastPushedChangeId).toBe(4);
  });
});
