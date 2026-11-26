/**
 * 待推数按记录数：一个事务一条，不在事务里的变更各一条。
 *
 * 批量添加 10 条是一次 `saveMany()`、一个事务，操作历史里是一条「事务: 创建10条」，
 * Push 上的待推数也该是 1，不是 10。
 */
import {
  createEntitySyncResolver,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  SyncType,
  WorktreeTableSet,
  type CountOptions,
  type RxDB,
  type RxDBChangeRuleGroup
} from '@aiao/rxdb';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { buildPendingPushWhere, updatePushableCount, type UndoRedoApplyHost } from '../undo-redo-apply.js';
import { User } from './fixtures/test-entities.js';

type ChangeCountOptions = CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>;

/** 计数查询按 `groupBy` 区分：分组计数给事务数，普通计数给不在事务里的变更数 */
const createHost = (counts: { standalone: number; transactions: number }) => {
  const count = vi.fn((options: ChangeCountOptions) => of(options.groupBy ? counts.transactions : counts.standalone));
  const rxdb = {
    config: { entities: [User] },
    entitySync: createEntitySyncResolver({
      type: SyncType.Full,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }),
    connected$: of(true),
    worktreeTableSet: WorktreeTableSet.MAIN,
    localAdapter$: of({
      getRepository: vi.fn((entity: unknown) => (entity === RxDBSync ? { find: vi.fn(async () => []) } : null))
    }),
    entityManager: {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === RxDBBranch) return { findOne: vi.fn(() => of({ id: 'main', activated: true })) };
        if (entity === RxDBChange) return { count };
        return null;
      })
    }
  } as unknown as RxDB;
  const host = {
    rxdb,
    destroyed: false,
    pushableGeneration: 0,
    pushableCount$: new BehaviorSubject(0),
    errors$: new Subject<Error>()
  } as unknown as UndoRedoApplyHost;
  return { count, host };
};

describe('updatePushableCount：按记录数', () => {
  it('一次 saveMany 写下的 10 条变更同属一个事务，待推数是 1', async () => {
    const { host } = createHost({ standalone: 0, transactions: 1 });

    await updatePushableCount(host);

    expect(host.pushableCount$.value).toBe(1);
  });

  it('不在事务里的变更各算一条，与事务数相加', async () => {
    const { host } = createHost({ standalone: 3, transactions: 2 });

    await updatePushableCount(host);

    expect(host.pushableCount$.value).toBe(5);
  });

  it('两次计数都在同一批待推变更里数：分支、未回滚、未推送、可推送仓库', async () => {
    const { count, host } = createHost({ standalone: 0, transactions: 1 });

    await updatePushableCount(host);

    expect(count).toHaveBeenCalledTimes(2);
    const grouped = count.mock.calls.map(([options]) => options).find(options => options.groupBy);
    expect(grouped?.groupBy).toEqual(['transactionId']);
    const [pending] = grouped!.where.rules as RxDBChangeRuleGroup[];
    expect(pending.rules).toContainEqual({ field: 'branchId', operator: '=', value: 'main' });
    expect(pending.rules).toContainEqual({ field: 'revertChangeId', operator: '=', value: null });
    expect(pending.rules).toContainEqual({ field: 'remoteId', operator: '=', value: null });
    expect(pending.rules).toContainEqual(expect.objectContaining({ combinator: 'or' }));
  });
});

describe('buildPendingPushWhere（US-317：计数与清单共用的待推条件）', () => {
  const rxdbOf = (host: UndoRedoApplyHost, overrides: Record<string, unknown>) =>
    ({ ...host.rxdb, ...overrides }) as unknown as RxDB;

  it('连着、挂在主检出位、有可推送的仓库：给出分支、未回滚、未推送与仓库规则', async () => {
    const { host } = createHost({ standalone: 0, transactions: 0 });

    const where = await buildPendingPushWhere(host.rxdb);

    expect(where?.rules).toContainEqual({ field: 'branchId', operator: '=', value: 'main' });
    expect(where?.rules).toContainEqual(expect.objectContaining({ combinator: 'or' }));
  });

  it('没连上、挂在可写检出位上、或没有可推送的仓库时为 null（待推为空）', async () => {
    const { host } = createHost({ standalone: 0, transactions: 0 });

    await expect(buildPendingPushWhere(rxdbOf(host, { connected$: of(false) }))).resolves.toBeNull();
    await expect(
      buildPendingPushWhere(rxdbOf(host, { worktreeTableSet: { ...WorktreeTableSet.MAIN, isMain: false } }))
    ).resolves.toBeNull();
    await expect(buildPendingPushWhere(rxdbOf(host, { config: { entities: [] } }))).resolves.toBeNull();
  });
});
