import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import {
  RepositorySyncBeginEvent,
  RepositorySyncCompleteEvent,
  RepositorySyncErrorEvent,
  type RxDBEvent
} from '../../rxdb-events.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { RemoteChange } from '../../system/system.interface.js';
import {
  pullRepository,
  type PullRepositoryOptions,
  type PullRepositoryResult
} from '../../version/pull-repository.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';

const FULL_SYNC: SyncOptions = {
  type: SyncType.Full,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'remote' }
};

@Entity({
  name: 'PullContractItem',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractItem extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractNone',
  sync: {
    type: SyncType.None,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'remote' }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractNone extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractLocal',
  sync: {
    type: SyncType.None,
    local: { adapter: 'sqlite' }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractLocal extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractMetadataFull',
  sync: FULL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractMetadataFull extends EntityBase {
  value!: string;
}

const filterFailure = new Error('metadata filter failed');
const throwingMetadataFilter = vi.fn((): RuleGroup => {
  throw filterFailure;
});
const invalidMetadataFilter = vi.fn(
  (): RuleGroup =>
    ({
      combinator: 'xor',
      rules: []
    }) as unknown as RuleGroup
);

@Entity({
  name: 'PullContractThrowFilter',
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'remote', filter: throwingMetadataFilter }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractThrowFilter extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractCascadeChild',
  sync: FULL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullContractThrowFilter',
      mappedProperty: 'children',
      mappedNamespace: 'public',
      columnName: 'parent_id',
      nullable: true
    }
  ]
})
class PullContractCascadeChild extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractInvalidFilter',
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'remote', filter: invalidMetadataFilter }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullContractInvalidFilter extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullContractCascadeInvalidChild',
  sync: FULL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullContractInvalidFilter',
      mappedProperty: 'children',
      mappedNamespace: 'public',
      columnName: 'parent_id',
      nullable: true
    }
  ]
})
class PullContractCascadeInvalidChild extends EntityBase {
  value!: string;
}

interface HarnessOptions {
  entities?: EntityType[];
  sync?: SyncOptions;
  syncRecords?: RxDBSync[];
}

type PullChanges = (
  sinceId: number,
  limit: number,
  repositoryFilter?: string[],
  filter?: RuleGroup,
  branchId?: string
) => Promise<RemoteChange[]>;

type MergeChanges = (actions: SwitchVersionActions, localChanges?: unknown, disableTriggers?: boolean) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRuleValue(options: unknown, field: string): unknown {
  if (!isRecord(options) || !isRecord(options['where'])) return undefined;
  const rules = options['where']['rules'];
  if (!Array.isArray(rules)) return undefined;

  for (const rule of rules) {
    if (isRecord(rule) && rule['field'] === field) return rule['value'];
  }

  return undefined;
}

function createSyncRecord(entity: string): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = `public:${entity}:main`;
  record.namespace = 'public';
  record.entity = entity;
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

function createHarness(options: HarnessOptions = {}) {
  const entities = options.entities ?? [PullContractItem];
  const sync = 'sync' in options ? options.sync : FULL_SYNC;
  const syncRecords =
    options.syncRecords ?
      [...options.syncRecords]
    : entities.map(EntityType => createSyncRecord(getEntityMetadata(EntityType).name));

  const syncRepository = {
    find: vi.fn(async (query: unknown): Promise<RxDBSync[]> => {
      const id = readRuleValue(query, 'id');
      return typeof id === 'string' ? syncRecords.filter(record => record.id === id) : [];
    }),
    count: vi.fn(async (): Promise<number> => syncRecords.length),
    create: vi.fn(async (record: RxDBSync): Promise<RxDBSync> => {
      syncRecords.push(record);
      return record;
    }),
    update: vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>): Promise<RxDBSync> => {
      Object.assign(record, patch);
      return record;
    }),
    remove: vi.fn(async (record: RxDBSync): Promise<RxDBSync> => record)
  };
  const changeRepository = {
    find: vi.fn(async (): Promise<RxDBChange[]> => []),
    count: vi.fn(async (): Promise<number> => 0),
    create: vi.fn(async (change: RxDBChange): Promise<RxDBChange> => change),
    update: vi.fn(async (change: RxDBChange, patch: Partial<RxDBChange>): Promise<RxDBChange> => {
      Object.assign(change, patch);
      return change;
    }),
    remove: vi.fn(async (change: RxDBChange): Promise<RxDBChange> => change)
  };
  const mergeChanges = vi.fn<MergeChanges>(async () => undefined);
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      if (EntityClass === RxDBChange) return changeRepository;
      throw new Error('Unexpected local repository request');
    }),
    mergeChanges
  };
  const pullChanges = vi.fn<PullChanges>(async () => []);
  const remoteAdapter = { pullChanges };
  const dispatchEvent = vi.fn<(event: RxDBEvent) => void>();

  const vm = {
    rxdb: {
      config: { entities, sync },
      context: { clientId: 'contract-client' },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: 'main' }))
  } as unknown as VersionManager;

  return { vm, pullChanges, mergeChanges, syncRecords, syncRepository, dispatchEvent };
}

describe('pullRepository contract', () => {
  it('导出的真实函数满足公开签名并按默认选项返回完整结果', async () => {
    const api: (
      vm: VersionManager,
      namespace: string,
      entity: string,
      options?: PullRepositoryOptions
    ) => Promise<PullRepositoryResult> = pullRepository;
    const harness = createHarness();

    const result = await api(harness.vm, 'public', 'PullContractItem');

    expect(harness.pullChanges).toHaveBeenCalledWith(0, 1000, ['public:PullContractItem'], undefined, 'main');
    expect(result).toEqual({
      repository: { namespace: 'public', entity: 'PullContractItem' },
      success: true,
      pulled: 0,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: false,
      historyInvalidated: false,
      relatedResults: [],
      // RXD-030：`failures` 是必填字段，没有失败时是空数组而不是缺字段
      failures: []
    });
    expect(harness.syncRecords).toHaveLength(1);
    expect(harness.syncRecords[0]?.lastPulledAt).toBeInstanceOf(Date);

    const events = harness.dispatchEvent.mock.calls.map(call => call[0]);
    expect(events[0]).toBeInstanceOf(RepositorySyncBeginEvent);
    expect(events[0]).toMatchObject({ direction: 'pull', includeRelated: true });
    expect(events[1]).toBeInstanceOf(RepositorySyncCompleteEvent);
    expect(events[1]).toMatchObject({
      direction: 'pull',
      result: { pulled: 0, compacted: 0, conflictsResolved: 0, conflictsDeferred: 0 }
    });
  });

  it('显式 filter 覆盖元数据 filter 并原样传给远端适配器', async () => {
    throwingMetadataFilter.mockClear();
    const harness = createHarness({ entities: [PullContractThrowFilter] });
    const filter: RuleGroup = {
      combinator: 'or',
      rules: [{ field: 'value', operator: '=', value: 'explicit' }]
    };

    await pullRepository(harness.vm, 'public', 'PullContractThrowFilter', {
      includeRelated: false,
      limit: 25,
      fetchAll: true,
      filter
    });

    expect(throwingMetadataFilter).not.toHaveBeenCalled();
    expect(harness.pullChanges).toHaveBeenCalledWith(0, 25, ['public:PullContractThrowFilter'], filter, 'main');
  });

  it('不存在的仓库抛出真实错误并派发同一个 error 实例', async () => {
    const harness = createHarness();
    const promise = pullRepository(harness.vm, 'public', 'MissingEntity', { includeRelated: false });

    await expect(promise).rejects.toThrow('Entity not found: public:MissingEntity');

    const errorEvent = harness.dispatchEvent.mock.calls
      .map(call => call[0])
      .find((event): event is RepositorySyncErrorEvent => event instanceof RepositorySyncErrorEvent);
    expect(errorEvent).toBeInstanceOf(RepositorySyncErrorEvent);
    await promise.catch(error => {
      expect(errorEvent?.error).toBe(error);
    });
    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  it("syncType='none' 拒绝 pull 且不访问适配器", async () => {
    const harness = createHarness({ entities: [PullContractNone] });

    await expect(pullRepository(harness.vm, 'public', 'PullContractNone', { includeRelated: false })).rejects.toThrow(
      "Cannot pull repository public:PullContractNone: syncType is 'none'."
    );

    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  it("syncType='local' 拒绝 pull 且不访问适配器", async () => {
    const harness = createHarness({ entities: [PullContractLocal] });

    await expect(pullRepository(harness.vm, 'public', 'PullContractLocal', { includeRelated: false })).rejects.toThrow(
      "Cannot pull repository public:PullContractLocal: syncType is 'local' (no remote)."
    );

    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  it('实体允许远端同步但全局未配置远端适配器时明确失败', async () => {
    const harness = createHarness({
      entities: [PullContractMetadataFull],
      sync: {
        type: SyncType.None,
        local: { adapter: 'sqlite' }
      }
    });

    await expect(
      pullRepository(harness.vm, 'public', 'PullContractMetadataFull', { includeRelated: false })
    ).rejects.toThrow('Remote adapter not configured.');

    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  it('元数据 filter 抛错时包装上下文且不访问远端', async () => {
    throwingMetadataFilter.mockClear();
    const harness = createHarness({ entities: [PullContractThrowFilter] });

    await expect(
      pullRepository(harness.vm, 'public', 'PullContractThrowFilter', { includeRelated: false })
    ).rejects.toThrow('Filter function failed for public:PullContractThrowFilter: metadata filter failed');

    expect(throwingMetadataFilter).toHaveBeenCalledTimes(1);
    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  // 级联路径（includeRelated: true 逐个依赖仓库提取 filter）此前只 console.warn，
  // 然后把 entityFilter 置为 undefined —— 于是该仓库以**无过滤**请求远端，拉回全部行。
  // filter 表达的是租户/用户数据边界，配置错误必须终止该仓库同步，不能以「无过滤」兜底。
  //
  // 注意断言的是安全属性本身（绝不出现 filter 为 undefined 的远端请求），而不是「整体抛错」：
  // 依赖失败按既有契约是把该仓库标记 success: false 并跳过其子仓，不冒泡成异常。
  describe('级联 filter 必须 fail-closed', () => {
    it('依赖仓库的 filter 抛错时不以无过滤请求远端', async () => {
      throwingMetadataFilter.mockClear();
      const harness = createHarness({ entities: [PullContractThrowFilter, PullContractCascadeChild] });

      // RXD-030：依赖失败后目标仓一条都没同步，必须 reject 而不是 resolve 一个
      // `success: false` 的结果 —— 后者要求调用方主动去查字段才能发现同步没发生。
      const error = await pullRepository(harness.vm, 'public', 'PullContractCascadeChild', {
        includeRelated: true
      }).then(
        () => {
          throw new Error('expected pullRepository to reject');
        },
        (thrown: unknown) => thrown as RxDBPartialSyncError<PullRepositoryResult>
      );

      expect(error).toBeInstanceOf(RxDBPartialSyncError);
      expect(throwingMetadataFilter).toHaveBeenCalled();
      // 核心：任何落到远端的请求都必须带 filter
      for (const call of harness.pullChanges.mock.calls) {
        expect(call[3]).toBeDefined();
      }
      // 父仓库带出明确的 filter 错误，而不是静默降级后「成功」
      const result = error.result;
      const parent = result.relatedResults?.find(r => r.repository.entity === 'PullContractThrowFilter');
      expect(parent?.success).toBe(false);
      expect(parent?.error?.message).toContain('Filter function failed for public:PullContractThrowFilter');
      // 依赖失败 → 目标仓库被跳过，不会带着残缺数据算成功
      expect(result.success).toBe(false);
    });

    it('依赖仓库的 filter 返回非法 RuleGroup 时不以无过滤请求远端', async () => {
      invalidMetadataFilter.mockClear();
      const harness = createHarness({ entities: [PullContractInvalidFilter, PullContractCascadeInvalidChild] });

      const error = await pullRepository(harness.vm, 'public', 'PullContractCascadeInvalidChild', {
        includeRelated: true
      }).then(
        () => {
          throw new Error('expected pullRepository to reject');
        },
        (thrown: unknown) => thrown as RxDBPartialSyncError<PullRepositoryResult>
      );

      expect(error).toBeInstanceOf(RxDBPartialSyncError);
      for (const call of harness.pullChanges.mock.calls) {
        expect(call[3]).toBeDefined();
      }
      const result = error.result;
      const parent = result.relatedResults?.find(r => r.repository.entity === 'PullContractInvalidFilter');
      expect(parent?.success).toBe(false);
      expect(parent?.error?.message).toContain(
        'Invalid RuleGroup returned by filter function for public:PullContractInvalidFilter'
      );
      expect(result.success).toBe(false);
    });
  });

  it('元数据 filter 返回无效 RuleGroup 时明确失败', async () => {
    invalidMetadataFilter.mockClear();
    const harness = createHarness({ entities: [PullContractInvalidFilter] });

    await expect(
      pullRepository(harness.vm, 'public', 'PullContractInvalidFilter', { includeRelated: false })
    ).rejects.toThrow(
      "Invalid RuleGroup returned by filter function for public:PullContractInvalidFilter: RuleGroup must have 'combinator' ('and' | 'or') and 'rules' array properties."
    );

    expect(invalidMetadataFilter).toHaveBeenCalledTimes(1);
    expect(harness.pullChanges).not.toHaveBeenCalled();
  });
});
