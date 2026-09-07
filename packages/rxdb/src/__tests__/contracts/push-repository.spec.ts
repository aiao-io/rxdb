import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import { RepositorySyncBeginEvent, RepositorySyncCompleteEvent, RepositorySyncErrorEvent } from '../../rxdb-events.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import {
  pushRepository,
  type PushRepositoryOptions,
  type PushRepositoryResult
} from '../../version/push-repository.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { emptyPushInFlight } from '../fixtures/push-inflight.js';
import { User } from '../fixtures/test-entities.js';

type DispatchEvent = (event: RxDBEvent) => void;

type ValidationHarnessOptions = {
  sync?: SyncOptions;
  entities?: EntityType[];
};

const fullSync = (): SyncOptions => ({
  type: SyncType.Full,
  local: { adapter: 'local' },
  remote: { adapter: 'remote' }
});

/** 自带 full sync 的实体：不受全局 sync 配置影响，恒有推送资格 */
@Entity({
  name: 'PushContractMetadataFull',
  sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PushContractMetadataFull extends EntityBase {
  value!: string;
}

function createValidationHarness(options: ValidationHarnessOptions = {}) {
  const dispatchEvent = vi.fn<DispatchEvent>();
  // RXD-029：有推送资格的仓库还要过 `RxDBSync.enabled` 这一关，而读开关要用本地库。
  // 这里给一个空表（查不到记录 ⇒ 视为启用），让用例仍旧停在它想验的那个错误上。
  // syncType 就不合格的仓库根本走不到这一步，因此那几条用例照样不需要本地库。
  const syncRepo = { find: vi.fn(async () => [] as RxDBSync[]) } as unknown as IRepository<typeof RxDBSync>;
  const vm = {
    rxdb: {
      config: {
        entities: options.entities ?? [User],
        sync: options.sync
      },
      context: { clientId: 'contract-client' },
      dispatchEvent
    },
    getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
    pushInFlight: emptyPushInFlight(),
    getLocalRepositories: vi.fn(async () => ({
      adapter: {
        getRepository: (EntityClass: EntityType): unknown => {
          if (EntityClass === RxDBSync) return syncRepo;
          throw new Error('Unexpected repository request');
        }
      }
    }))
  } as unknown as VersionManager;

  return { dispatchEvent, vm };
}

function createEmptyPushHarness() {
  const dispatchEvent = vi.fn<DispatchEvent>();
  const syncRecord = Object.create(RxDBSync.prototype) as RxDBSync;
  syncRecord.id = 'public:User:main';
  syncRecord.namespace = 'public';
  syncRecord.entity = 'User';
  syncRecord.branchId = 'main';
  syncRecord.syncType = 'full';
  syncRecord.lastPushedChangeId = null;
  syncRecord.lastPushedAt = null;
  syncRecord.lastPulledAt = null;
  syncRecord.lastPullRemoteChangeId = null;
  syncRecord.enabled = true;
  syncRecord.createdAt = new Date('2026-01-01T00:00:00.000Z');
  syncRecord.updatedAt = new Date('2026-01-01T00:00:00.000Z');

  const syncRepo = {
    find: vi.fn(async () => [syncRecord]),
    create: vi.fn(async (record: RxDBSync) => record),
    update: vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => {
      Object.assign(record, patch);
      return record;
    })
  } as unknown as IRepository<typeof RxDBSync>;
  const changeRepo = {
    find: vi.fn(async () => [])
  } as unknown as IRepository<typeof RxDBChange>;
  const getRepository = vi.fn((EntityClass: EntityType): unknown => {
    if (EntityClass === RxDBSync) return syncRepo;
    if (EntityClass === RxDBChange) return changeRepo;
    throw new Error(`Unexpected repository: ${EntityClass.name}`);
  });
  const localAdapter = { getRepository };
  const remoteAdapter = { mergeChanges: vi.fn() };

  const vm = {
    rxdb: {
      config: { entities: [User], sync: fullSync() },
      context: { clientId: 'contract-client' },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
    pushInFlight: emptyPushInFlight()
  } as unknown as VersionManager;

  return { dispatchEvent, remoteAdapter, vm };
}

describe('pushRepository contract', () => {
  it('导出的真实函数符合公开签名', () => {
    const callable: (
      vm: VersionManager,
      namespace: string,
      entity: string,
      options?: PushRepositoryOptions
    ) => Promise<PushRepositoryResult> = pushRepository;

    expect(callable).toBe(pushRepository);
  });

  it('空仓库返回公开结果结构并发送 begin/complete 事件', async () => {
    const harness = createEmptyPushHarness();

    const result = await pushRepository(harness.vm, 'public', 'User', {
      batchSize: 7,
      includeRelated: false
    });

    expect(result).toEqual({
      repository: { namespace: 'public', entity: 'User' },
      pushed: 0,
      failed: 0,
      compacted: 0,
      originalCount: 0,
      // RXD-030：`failures` 是必填字段，没有失败时是空数组而不是缺字段
      failures: []
    } satisfies PushRepositoryResult);
    expect(harness.remoteAdapter.mergeChanges).not.toHaveBeenCalled();
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.constructor)).toEqual([
      RepositorySyncBeginEvent,
      RepositorySyncCompleteEvent
    ]);
    expect(harness.dispatchEvent.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        direction: 'push',
        namespace: 'public',
        entity: 'User',
        includeRelated: false
      })
    );
    expect(harness.dispatchEvent.mock.calls[1][0]).toEqual(
      expect.objectContaining({ result: { pushed: 0, compacted: 0, failed: 0 } })
    );
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1]
  ])('拒绝 %s batchSize', async (_label, batchSize) => {
    const harness = createValidationHarness({ sync: fullSync() });

    await expect(pushRepository(harness.vm, 'public', 'User', { batchSize, includeRelated: false })).rejects.toThrow(
      'batchSize must be a positive safe integer'
    );

    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.constructor)).toEqual([
      RepositorySyncBeginEvent,
      RepositorySyncErrorEvent
    ]);
    expect(harness.dispatchEvent.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'RangeError',
          message: 'batchSize must be a positive safe integer'
        })
      })
    );
  });

  it('不存在的仓库拒绝调用，并发送默认 includeRelated=true 的 error 事件', async () => {
    const harness = createValidationHarness({ sync: fullSync() });

    await expect(pushRepository(harness.vm, 'public', 'Missing')).rejects.toThrow('Entity not found: public:Missing');

    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.constructor)).toEqual([
      RepositorySyncBeginEvent,
      RepositorySyncErrorEvent
    ]);
    expect(harness.dispatchEvent.mock.calls[0][0]).toEqual(expect.objectContaining({ includeRelated: true }));
    expect(harness.dispatchEvent.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        direction: 'push',
        namespace: 'public',
        entity: 'Missing',
        error: expect.objectContaining({ message: 'Entity not found: public:Missing' })
      })
    );
  });

  it('syncType=none 拒绝推送真实仓库', async () => {
    const harness = createValidationHarness();

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toThrow(
      "Cannot push repository public:User: syncType is 'none'."
    );
  });

  it('syncType=remote 拒绝只读仓库', async () => {
    const harness = createValidationHarness({
      sync: { type: SyncType.None, remote: { adapter: 'remote' } }
    });

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toThrow(
      "Cannot push repository public:User: syncType is 'remote' (read-only)."
    );
  });

  it('可推送仓库缺少远端适配器时传播配置错误', async () => {
    // RXD-030：本用例要测的是「有推送资格、但全局没配远端适配器」。原先用 `User` +
    // 全局 `local` only，`getSyncType` 判出来是 `'local'` —— 那压根不是可推送仓库，
    // 只是因为旧实现漏掉资格判定才走到适配器那一步。改成实体自带 full sync、全局只有
    // local，与 `pull-repository.spec.ts` 的同名用例对称。
    const harness = createValidationHarness({
      entities: [PushContractMetadataFull],
      sync: { type: SyncType.None, local: { adapter: 'local' } }
    });

    await expect(
      pushRepository(harness.vm, 'public', 'PushContractMetadataFull', { includeRelated: false })
    ).rejects.toThrow('Remote adapter not configured.');
    expect(harness.dispatchEvent.mock.calls.at(-1)?.[0]).toBeInstanceOf(RepositorySyncErrorEvent);
  });
});
