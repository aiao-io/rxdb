import { describe, expect, it, vi } from 'vitest';
import type { EntityType, RxDBEntityId } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { OperatorName, RuleGroup } from '../../repository/query.interface.js';
import { METADATA } from '../../rxdb.private.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';
import { RxDBChange } from '../../system/change.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { cleanupExpired } from '../../version/cleanup-expired.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

interface CleanupRecord {
  id: RxDBEntityId;
}

interface CleanupHarnessOptions {
  records?: CleanupRecord[];
  sync?: SyncOptions;
  /** 模拟仍未推送的 RxDBChange 记录（remoteId 为 null） */
  unpushedChanges?: { entityId: RxDBEntityId }[];
}

type FindExpired = (options: { where: RuleGroup }) => Promise<CleanupRecord[]>;
type MergeChanges = (actions: SwitchVersionActions, localChanges?: unknown, disableTriggers?: boolean) => Promise<void>;

const createFilterSync = (filter: () => RuleGroup): SyncOptions => ({
  type: SyncType.Filter,
  local: { adapter: 'local' },
  remote: { adapter: 'remote', filter }
});

const createHarness = (options: CleanupHarnessOptions = {}) => {
  class Order {
    id = '';
  }

  const Entity = Order as EntityType<object, CleanupRecord>;
  const metadata = {
    name: 'Order',
    namespace: 'public',
    sync: options.sync
  } as unknown as EntityMetadata;
  Object.defineProperty(Entity, METADATA, { value: metadata });

  let inTransaction = false;
  const findInTransaction: boolean[] = [];
  const find = vi.fn<FindExpired>(async () => {
    findInTransaction.push(inTransaction);
    return options.records ?? [];
  });
  const repository = { find };
  // RxDBChange 仓库单列：cleanup 必须先确认候选实体没有未推送变更
  const changeFind = vi.fn(async () => options.unpushedChanges ?? []);
  const changeRepository = { find: changeFind };
  const getRepository = vi.fn((EntityType: unknown) => (EntityType === RxDBChange ? changeRepository : repository));
  const mergeChanges = vi.fn<MergeChanges>(async () => undefined);
  // 事务回调收到 executor（C2）。替身把 getRepository / mergeChanges 转发回本 mock 适配器，
  // 因此下面那些「断言事务内读写」的用例语义不变。
  const transaction = vi.fn(async (fn: (executor: TransactionExecutor) => Promise<unknown>) => {
    inTransaction = true;
    try {
      return await fn(createTransactionExecutorStub({ getRepository, mergeChanges }));
    } finally {
      inTransaction = false;
    }
  });
  const adapter = { getRepository, mergeChanges, transaction };
  const getLocalRepositories = vi.fn(async () => ({ adapter }));
  const vm = {
    rxdb: {
      config: {
        entities: [Entity],
        sync: undefined
      }
    },
    getLocalRepositories
  } as unknown as VersionManager;

  return {
    Entity,
    changeFind,
    find,
    findInTransaction,
    getLocalRepositories,
    getRepository,
    mergeChanges,
    transaction,
    vm
  };
};

const createRule = (operator: string): Record<string, unknown> => {
  if (operator === 'null' || operator === 'notNull') {
    return { field: 'deletedAt', operator };
  }
  if (operator === 'exists' || operator === 'notExists') {
    return { field: 'children', operator };
  }
  if (operator === 'in' || operator === 'notIn') {
    return { field: 'status', operator, value: ['active', 'pending'] };
  }
  if (operator === 'between' || operator === 'notBetween') {
    return { field: 'score', operator, value: [1, 10] };
  }
  return { field: 'status', operator, value: 'active' };
};

const createFilter = (operator: string): RuleGroup =>
  ({
    combinator: 'and',
    rules: [createRule(operator)]
  }) as unknown as RuleGroup;

const OPERATOR_INVERSIONS: ReadonlyArray<readonly [OperatorName, OperatorName]> = [
  ['=', '!='],
  ['!=', '='],
  ['<', '>='],
  ['<=', '>'],
  ['>', '<='],
  ['>=', '<'],
  ['in', 'notIn'],
  ['notIn', 'in'],
  ['contains', 'notContains'],
  ['notContains', 'contains'],
  ['startsWith', 'notStartsWith'],
  ['notStartsWith', 'startsWith'],
  ['endsWith', 'notEndsWith'],
  ['notEndsWith', 'endsWith'],
  ['between', 'notBetween'],
  ['notBetween', 'between'],
  ['exists', 'notExists'],
  ['notExists', 'exists'],
  ['null', 'notNull'],
  ['notNull', 'null']
];

describe('cleanupExpired', () => {
  it('优先使用显式 filter，不执行实体 filter callback', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => createFilter('!='));
    const explicitFilter = createFilter('=');
    const { find, vm } = createHarness({ sync: createFilterSync(metadataFilter) });

    await cleanupExpired(vm, 'public', 'Order', { filter: explicitFilter });

    expect(metadataFilter).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({
      where: {
        combinator: 'or',
        rules: [{ field: 'status', operator: '!=', value: 'active' }]
      }
    });
  });

  it('没有显式 filter 时，每次从实体 metadata 执行 filter callback', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => createFilter('>='));
    const { find, vm } = createHarness({ sync: createFilterSync(metadataFilter) });

    await cleanupExpired(vm, 'public', 'Order');
    await cleanupExpired(vm, 'public', 'Order');

    expect(metadataFilter).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenLastCalledWith({
      where: {
        combinator: 'or',
        rules: [{ field: 'status', operator: '<', value: 'active' }]
      }
    });
  });

  it('包装实体 filter callback 抛出的错误并阻止查询', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => {
      throw new Error('dynamic window failed');
    });
    const { find, vm } = createHarness({ sync: createFilterSync(metadataFilter) });

    await expect(cleanupExpired(vm, 'public', 'Order')).rejects.toThrow(
      'Filter function failed for public:Order: dynamic window failed'
    );
    expect(find).not.toHaveBeenCalled();
  });

  it('保留非 Error filter callback 的失败信息', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => {
      throw 'non-error failure';
    });
    const { find, vm } = createHarness({ sync: createFilterSync(metadataFilter) });

    await expect(cleanupExpired(vm, 'public', 'Order')).rejects.toThrow(
      'Filter function failed for public:Order: non-error failure'
    );
    expect(find).not.toHaveBeenCalled();
  });

  it('实体不存在时抛出明确错误', async () => {
    const { getRepository, vm } = createHarness();

    await expect(cleanupExpired(vm, 'public', 'Missing', { filter: createFilter('=') })).rejects.toThrow(
      'Entity not found: public:Missing'
    );
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('没有任何 filter 来源时抛出明确错误', async () => {
    const { getRepository, vm } = createHarness();

    await expect(cleanupExpired(vm, 'public', 'Order')).rejects.toThrow(
      'No filter provided and entity public:Order does not have a Filter sync configuration.'
    );
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('Filter sync 缺失 callback 时不执行查询', async () => {
    const sync = {
      type: SyncType.Filter,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    } as unknown as SyncOptions;
    const { getRepository, vm } = createHarness({ sync });

    await expect(cleanupExpired(vm, 'public', 'Order')).rejects.toThrow(
      'No filter provided and entity public:Order does not have a Filter sync configuration.'
    );
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('空查询结果返回零且不执行 mergeChanges', async () => {
    const { mergeChanges, vm } = createHarness();

    await expect(cleanupExpired(vm, 'public', 'Order', { filter: createFilter('=') })).resolves.toEqual({
      removed: 0,
      removedIds: []
    });
    expect(mergeChanges).not.toHaveBeenCalled();
  });

  it('dryRun 返回命中 ID 且不执行 mergeChanges', async () => {
    const records = [{ id: 'old-1' }, { id: 'old-2' }];
    const { mergeChanges, vm } = createHarness({ records });

    await expect(cleanupExpired(vm, 'public', 'Order', { filter: createFilter('='), dryRun: true })).resolves.toEqual({
      removed: 2,
      removedIds: ['old-1', 'old-2']
    });
    expect(mergeChanges).not.toHaveBeenCalled();
  });

  it('真实清理通过 mergeChanges(actions, undefined, true) 禁用变更触发器', async () => {
    const records = [{ id: 'old-1' }, { id: 'old-2' }];
    const { Entity, getRepository, mergeChanges, vm } = createHarness({ records });

    await expect(cleanupExpired(vm, 'public', 'Order', { filter: createFilter('=') })).resolves.toEqual({
      removed: 2,
      removedIds: ['old-1', 'old-2']
    });

    expect(getRepository).toHaveBeenCalledWith(Entity);
    expect(mergeChanges).toHaveBeenCalledTimes(1);
    const [actions, localChanges, disableTriggers] = mergeChanges.mock.calls[0];
    expect([...actions.deletes]).toEqual([
      [`public:Order:${getRxDBEntityIdentityKey('old-1')}`, { patch: null, inversePatch: null }],
      [`public:Order:${getRxDBEntityIdentityKey('old-2')}`, { patch: null, inversePatch: null }]
    ]);
    expect(actions.updates.size).toBe(0);
    expect(actions.inserts.size).toBe(0);
    expect(localChanges).toBeUndefined();
    expect(disableTriggers).toBe(true);
  });

  it('递归应用 AND/OR 的 De Morgan 反转', async () => {
    const filter = {
      combinator: 'and',
      rules: [
        { field: 'status', operator: '=', value: 'active' },
        {
          combinator: 'or',
          rules: [
            { field: 'score', operator: '>', value: 10 },
            { field: 'label', operator: 'contains', value: 'vip' }
          ]
        }
      ]
    } as unknown as RuleGroup;
    const { find, vm } = createHarness();

    await cleanupExpired(vm, 'public', 'Order', { filter });

    expect(find).toHaveBeenCalledWith({
      where: {
        combinator: 'or',
        rules: [
          { field: 'status', operator: '!=', value: 'active' },
          {
            combinator: 'and',
            rules: [
              { field: 'score', operator: '<=', value: 10 },
              { field: 'label', operator: 'notContains', value: 'vip' }
            ]
          }
        ]
      }
    });
  });

  it.each(OPERATOR_INVERSIONS)('%s 应反转为 %s', async (operator, invertedOperator) => {
    const inputRule = createRule(operator);
    const { find, vm } = createHarness();

    await cleanupExpired(vm, 'public', 'Order', { filter: createFilter(operator) });

    expect(find).toHaveBeenCalledWith({
      where: {
        combinator: 'or',
        rules: [{ ...inputRule, operator: invertedOperator }]
      }
    });
  });

  it('拒绝无法反转的非法 operator', async () => {
    const { find, vm } = createHarness();

    await expect(cleanupExpired(vm, 'public', 'Order', { filter: createFilter('regex') })).rejects.toThrow(
      'Cannot invert operator: regex'
    );
    expect(find).not.toHaveBeenCalled();
  });
});

// cleanup 原先在**事务外**查一次候选，随后关掉 trigger、按旧快照无条件删除。
// 两个后果：
//  1. 查询后若用户更新记录使其重新满足 filter，仍会被删 —— 稳定的数据破坏；
//  2. 不检查候选是否还有未推送的 INSERT/UPDATE。删除又不生成 change，
//     远端会永久保留幽灵记录，本地/远端永久分叉。
describe('cleanupExpired 数据安全', () => {
  const filter = (): RuleGroup => ({ combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'active' }] });

  it('删除必须发生在同一本地事务内', async () => {
    const harness = createHarness({ records: [{ id: 'a' }], sync: createFilterSync(filter) });

    await cleanupExpired(harness.vm, 'public', 'Order');

    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('候选实体仍有未推送变更时绝不删除', async () => {
    const harness = createHarness({
      records: [{ id: 'a' }, { id: 'b' }],
      sync: createFilterSync(filter),
      unpushedChanges: [{ entityId: 'a' }]
    });

    const result = await cleanupExpired(harness.vm, 'public', 'Order');

    expect(harness.changeFind).toHaveBeenCalled();
    const actions = harness.mergeChanges.mock.calls[0]?.[0];
    const deletedKeys = [...(actions?.deletes.keys() ?? [])];
    expect(deletedKeys).toEqual([`public:Order:${getRxDBEntityIdentityKey('b')}`]);
    expect(result.removed).toBe(1);
    expect(result.removedIds).toEqual(['b']);
  });

  it('按主键运行时类型区分未推送变更', async () => {
    const harness = createHarness({
      records: [{ id: 1 }, { id: 1n }, { id: '1' }],
      sync: createFilterSync(filter),
      unpushedChanges: [{ entityId: 1n }]
    });

    const result = await cleanupExpired(harness.vm, 'public', 'Order');

    expect(result.removedIds).toEqual([1, '1']);
  });

  it('全部候选都有未推送变更时完全不调用 mergeChanges', async () => {
    const harness = createHarness({
      records: [{ id: 'a' }],
      sync: createFilterSync(filter),
      unpushedChanges: [{ entityId: 'a' }]
    });

    const result = await cleanupExpired(harness.vm, 'public', 'Order');

    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
  });

  // 陈旧快照被结构性消除：驱动删除的那次候选查询本身就在事务内，
  // 因此不存在「查询后被并发更新、却仍按旧快照删除」的窗口。
  it('驱动删除的候选查询发生在事务内，不存在陈旧快照窗口', async () => {
    const harness = createHarness({ records: [{ id: 'a' }], sync: createFilterSync(filter) });

    await cleanupExpired(harness.vm, 'public', 'Order');

    expect(harness.findInTransaction).toEqual([true]);
  });

  it('dryRun 也要扣除有未推送变更的候选，报数必须诚实', async () => {
    const harness = createHarness({
      records: [{ id: 'a' }, { id: 'b' }],
      sync: createFilterSync(filter),
      unpushedChanges: [{ entityId: 'a' }]
    });

    const result = await cleanupExpired(harness.vm, 'public', 'Order', { dryRun: true });

    expect(result.removed).toBe(1);
    expect(result.removedIds).toEqual(['b']);
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });
});
