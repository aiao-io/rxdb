/**
 * @fileoverview `rxdb.workingTree.checkouts` 的可写检出位（US-314 B1.5）：一笔主库事务的编排、认领与回收。
 *
 * @remarks
 * 建表集、播种与挂载换成替身，这里只验编排：持有分支与建表集在同一笔事务里、失败不留登记行也不占锁、
 * 认领握着锁、挂在它上面时先挂回主检出位、回收不靠快照库。真后端上的语义由 `worktreeConformanceSuite` 验。
 */

import type { EntityType, IRxDBChange, LocalRxDBAdapter, RxDB as RxDBInstance, TransactionExecutor } from '@aiao/rxdb';
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  getRxDBChangeKey,
  RxDB,
  RxDBBranch,
  RxDBChange,
  SyncType,
  uuid,
  WorktreeBranchHeldError,
  WorktreeTableSet
} from '@aiao/rxdb';
import { compute_switch_branch_actions, get_branch_max_change } from '@aiao/rxdb-plugin-history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import { holdWorktreeLock, worktreeLockName } from '../../checkout/worktree-locks.js';
import { WorktreeManager, type WorktreeTransactionRunner } from '../../checkout/worktree-manager.js';
import { tableSetSuffixOf } from '../../checkout/worktree-writable.js';
import { Worktree } from '../../checkout/worktree.entity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { classifyBranchMaterialization } from '../../working-tree/branch-materialization.js';
import { assertSwitchTargetIntact } from '../../working-tree/switch-branch-options.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

vi.mock('@aiao/rxdb-plugin-history', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-history')>()),
  compute_switch_branch_actions: vi.fn(),
  get_branch_max_change: vi.fn()
}));

vi.mock('../../working-tree/switch-branch-options.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/switch-branch-options.js')>()),
  assertSwitchTargetIntact: vi.fn()
}));

vi.mock('../../working-tree/branch-materialization.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/branch-materialization.js')>()),
  classifyBranchMaterialization: vi.fn()
}));

@Entity({ name: 'WritableNote' })
class WritableNote extends EntityBase {}

type Row = Record<string, unknown>;

const matches = (row: Row, where: { rules: { field: string; value: unknown }[] }): boolean =>
  where.rules.every(rule => row[rule.field] === rule.value);

const databases: RxDBInstance[] = [];
let rows: Worktree[];
/** 每套表的激活态行（US-314 B2.2）：与登记行分开收 */
let activations: WorkingTreeActivationState[];
let branches: Row[];
let createWorktreeTableSet: ReturnType<typeof vi.fn>;
let dropWorktreeTableSet: ReturnType<typeof vi.fn>;
let runEnabled: WorktreeTransactionRunner;
let main: RxDBInstance;
let mounted: WorktreeTableSet;

/** 主实例：装了工作树插件，不连接；换挂换成记下挂了哪一套 */
const createMain = (): RxDBInstance => {
  const database = new RxDB({
    dbName: `checkout-writable-${Math.random().toString(36).slice(2)}`,
    entities: [WritableNote],
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  database.adapter('mock', db => createMockAdapter(db));
  database.use(rxDBPluginWorkingTree);
  database.init();
  databases.push(database);
  vi.spyOn(database, 'worktreeTableSet', 'get').mockImplementation(() => mounted);
  vi.spyOn(database, 'mountWorktreeTableSet').mockImplementation(async tableSet => {
    mounted = tableSet;
  });
  return database;
};

const noteKey = (id: string): string => {
  const { namespace, name } = getEntityMetadata(WritableNote);
  return getRxDBChangeKey({ namespace, entity: name, entityId: id } as IRxDBChange);
};

beforeEach(() => {
  rows = [];
  activations = [];
  mounted = WorktreeTableSet.MAIN;
  branches = [
    { id: 'main', activated: true, activeKey: '*active*' },
    { id: 'feature', activated: false, activeKey: null }
  ];
  const executor = {
    saveMany: vi.fn(async (entities: (Worktree | WorkingTreeActivationState)[]) => {
      for (const entity of entities) {
        if (entity instanceof WorkingTreeActivationState) activations.push(entity);
        else rows.push(entity);
      }
      return entities;
    }),
    getRepository: (EntityClass: EntityType) => {
      if (EntityClass === RxDBBranch) {
        return {
          find: async ({ where }: { where: never }) => branches.filter(row => matches(row, where)),
          update: async (row: Row, patch: Row) => Object.assign(row, patch)
        };
      }
      if (EntityClass === RxDBChange) return { find: async () => [] };
      if (EntityClass === WorkingTreeActivationState) {
        return {
          find: async ({ where }: { where: never }) => activations.filter(row => matches(row as unknown as Row, where)),
          remove: async (row: WorkingTreeActivationState) => {
            activations.splice(activations.indexOf(row), 1);
            return row;
          }
        };
      }
      return {
        find: async ({ where }: { where: never }) => rows.filter(row => matches(row as unknown as Row, where)),
        update: async (row: Worktree, patch: Partial<Worktree>) => Object.assign(row, patch),
        remove: async (row: Worktree) => {
          rows.splice(rows.indexOf(row), 1);
          return row;
        }
      };
    }
  } as unknown as TransactionExecutor;
  createWorktreeTableSet = vi.fn(async () => undefined);
  dropWorktreeTableSet = vi.fn(async () => undefined);
  const adapter = { name: 'mock', createWorktreeTableSet, dropWorktreeTableSet } as unknown as LocalRxDBAdapter;
  runEnabled = run => run(executor, adapter);
  main = createMain();
  vi.mocked(classifyBranchMaterialization).mockResolvedValue({ kind: 'materialized', ref: {} as never });
  vi.mocked(assertSwitchTargetIntact).mockResolvedValue(undefined);
  vi.mocked(get_branch_max_change).mockImplementation(async (_repository, branchId) =>
    branchId === 'main' ? ({ id: 4 } as RxDBChange) : ({ id: 9 } as RxDBChange)
  );
  vi.mocked(compute_switch_branch_actions).mockResolvedValue({
    inserts: new Map([
      [noteKey('n1'), { patch: { id: 'n1' }, inversePatch: null }],
      [
        getRxDBChangeKey({ namespace: 'rxdb', entity: 'RxDBBranch', entityId: 'x' } as IRxDBChange),
        { patch: {}, inversePatch: null }
      ]
    ]),
    updates: new Map(),
    deletes: new Map()
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) await database.disconnectAll();
});

const managerOf = (configured = false): WorktreeManager =>
  new WorktreeManager(
    main,
    run => runEnabled(run),
    configured ? { adapter: () => ({}) as LocalRxDBAdapter } : undefined
  );

/** 锁此刻有没有人握着：试拿一次，拿到就马上还 */
const isLocked = async (id: string): Promise<boolean> => {
  const release = await holdWorktreeLock(worktreeLockName(main.config.dbName, id), true);
  if (!release) return true;
  await release();
  return false;
};

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(WorktreeUnavailableError);
  return (error as WorktreeUnavailableError).reason;
};

describe('tableSetSuffixOf', () => {
  // uuid v7 的前 12 位十六进制是毫秒时间戳：直接截的话，同一毫秒开的两个检出位撞后缀
  it('同一毫秒生成的两个 id 也推出不同的后缀，形状合乎表集后缀', () => {
    const [first, second] = [uuid(), uuid()];

    expect(tableSetSuffixOf(first)).toMatch(/^wt_[0-9a-f]{12}$/);
    expect(tableSetSuffixOf(first)).not.toBe(tableSetSuffixOf(second));
  });
});

describe('WorktreeManager.add', () => {
  it('一笔事务里持有分支、按成员播种、写 ready 的登记行；建好不挂，锁留在本上下文', async () => {
    const manager = managerOf();

    const worktree = await manager.add('feature', { name: '特性' });

    const suffix = tableSetSuffixOf(worktree.id);
    expect(worktree).toMatchObject({
      mode: 'writable',
      kind: 'branch',
      branchId: 'feature',
      name: '特性',
      owner: 'persistent',
      state: 'ready',
      dbName: null,
      tableSetSuffix: suffix,
      sourceBranchId: 'main',
      sourceChangeId: 4,
      targetChangeId: 9
    });
    expect(rows).toEqual([worktree]);
    expect(branches.find(row => row.id === 'feature')).toMatchObject({ activeKey: `*worktree:${suffix}*` });
    const [, tableSet, seed] = createWorktreeTableSet.mock.calls[0];
    expect((tableSet as WorktreeTableSet).suffix).toBe(suffix);
    expect([...(seed as { actions: { inserts: Map<string, unknown> } }).actions.inserts.keys()]).toEqual([
      noteKey('n1')
    ]);
    expect(compute_switch_branch_actions).toHaveBeenCalledWith(expect.anything(), 'feature', 'main');
    expect(mounted.isMain).toBe(true);
    expect(await isLocked(worktree.id)).toBe(true);
  });

  // 插件在业务表上的附属对象（全文索引）也要给影子表建一份（US-314 B2.5）
  it('建完表集之后、在同一笔事务里调插件的建表集钩子', async () => {
    const notify = vi.spyOn(main, 'notifyWorktreeTableSetCreated');

    await managerOf().add('feature');

    const [executorUsed, tableSet] = createWorktreeTableSet.mock.calls[0];
    expect(notify).toHaveBeenCalledWith(executorUsed, tableSet);
    expect(notify.mock.invocationCallOrder[0]).toBeGreaterThan(createWorktreeTableSet.mock.invocationCallOrder[0]);
  });

  it('分支已被持有（主检出位正停在它上面）：拒绝，不建表、不写登记行，锁还掉', async () => {
    const manager = managerOf();

    await expect(manager.add('main')).rejects.toBeInstanceOf(WorktreeBranchHeldError);

    expect(createWorktreeTableSet).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
    expect(branches.find(row => row.id === 'main')).toMatchObject({ activeKey: '*active*' });
  });

  it('适配器建不了表集：unsupported_adapter', async () => {
    const bare = { name: 'bare' } as unknown as LocalRxDBAdapter;
    const executor = await new Promise<TransactionExecutor>(resolve => void runEnabled(async e => resolve(e)));
    runEnabled = run => run(executor, bare);

    expect(await reasonOf(managerOf().add('feature'))).toBe('unsupported_adapter');
  });

  it('分支不存在：branch_not_found', async () => {
    expect(await reasonOf(managerOf().add('missing'))).toBe('branch_not_found');
  });
});

describe('WorktreeManager.mount / release / remove', () => {
  it('remove() 挂回主表集失败时保留当前认领，随后仍可 release()', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.mount(worktree.id);
    vi.mocked(main.mountWorktreeTableSet).mockRejectedValueOnce(new Error('换挂失败'));

    await expect(manager.remove(worktree.id)).rejects.toThrow('换挂失败');
    expect(mounted.suffix).toBe(worktree.tableSetSuffix);
    expect(await isLocked(worktree.id)).toBe(true);
    expect(dropWorktreeTableSet).not.toHaveBeenCalled();

    await manager.release(worktree.id);
    expect(mounted.isMain).toBe(true);
    expect(await isLocked(worktree.id)).toBe(false);
  });

  it('mount() 挂上登记行那套表；已经挂在它上面时不再换挂', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');

    await manager.mount(worktree.id);
    await manager.mount(worktree.id);

    expect(mounted.suffix).toBe(worktree.tableSetSuffix);
    expect(main.mountWorktreeTableSet).toHaveBeenCalledTimes(1);
  });

  it('mount()：别处握着锁报 in_use；只读检出位报 not_found 并还锁', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.release(worktree.id);
    const elsewhere = (await holdWorktreeLock(worktreeLockName(main.config.dbName, worktree.id)))!;

    expect(await reasonOf(manager.mount(worktree.id))).toBe('in_use');
    await elsewhere();

    Object.assign(rows[0], { mode: 'read_only' });
    expect(await reasonOf(manager.mount(worktree.id))).toBe('not_found');
    expect(await isLocked(worktree.id)).toBe(false);
  });

  it('mount()：指纹不符就在挂载那笔事务里删表、重建、记下新指纹（US-314 B2.6）；持有的分支不在了报 not_found', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    const { schemaFingerprint } = worktree;
    await manager.release(worktree.id);
    createWorktreeTableSet.mockClear();

    Object.assign(rows[0], { schemaFingerprint: 'stale' });
    await manager.mount(worktree.id);

    expect((dropWorktreeTableSet.mock.calls[0][1] as WorktreeTableSet).suffix).toBe(worktree.tableSetSuffix);
    expect(createWorktreeTableSet).toHaveBeenCalledTimes(1);
    expect(dropWorktreeTableSet.mock.invocationCallOrder[0]).toBeLessThan(
      createWorktreeTableSet.mock.invocationCallOrder[0]
    );
    expect(rows[0].schemaFingerprint).toBe(schemaFingerprint);
    await manager.release(worktree.id);

    Object.assign(
      branches.find(row => row.id === 'feature')!,
      { activeKey: null }
    );
    expect(await reasonOf(manager.mount(worktree.id))).toBe('not_found');
  });

  it('mount()：重建失败报 schema_rebuild_failed、带着原始错误，登记行的指纹不动、锁还掉', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.release(worktree.id);
    const boom = new Error('新结构上的表建不出来');
    createWorktreeTableSet.mockRejectedValueOnce(boom);

    Object.assign(rows[0], { schemaFingerprint: 'stale' });
    const failed = await manager.mount(worktree.id).catch((error: unknown) => error);

    expect(failed).toBeInstanceOf(WorktreeUnavailableError);
    expect((failed as WorktreeUnavailableError).reason).toBe('schema_rebuild_failed');
    expect((failed as WorktreeUnavailableError).cause).toBe(boom);
    expect(rows[0].schemaFingerprint).toBe('stale');
    expect(await isLocked(worktree.id)).toBe(false);
  });

  it('mount()：持有的分支不在了报 not_found', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    const { schemaFingerprint } = worktree;

    Object.assign(rows[0], { schemaFingerprint });
    Object.assign(
      branches.find(row => row.id === 'feature')!,
      { activeKey: null }
    );
    expect(await reasonOf(manager.mount(worktree.id))).toBe('not_found');
  });

  it('release()：挂在它上面就先挂回主检出位，再还锁；表集、持有键、登记行都留着', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.mount(worktree.id);

    await manager.release(worktree.id);

    expect(mounted.isMain).toBe(true);
    expect(await isLocked(worktree.id)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(dropWorktreeTableSet).not.toHaveBeenCalled();
  });

  it('remove()：挂在它上面就先挂回主检出位，一笔事务删表集、放持有键、删登记行，再还锁', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.mount(worktree.id);

    await manager.remove(worktree.id);

    expect(mounted.isMain).toBe(true);
    expect((dropWorktreeTableSet.mock.calls[0][1] as WorktreeTableSet).suffix).toBe(worktree.tableSetSuffix);
    expect(branches.find(row => row.id === 'feature')).toMatchObject({ activeKey: null });
    expect(rows).toEqual([]);
    expect(await isLocked(worktree.id)).toBe(false);
    await manager.remove(worktree.id);
  });

  it('remove() 只读检出位：not_found，提示用视图的 close()', async () => {
    const manager = managerOf();
    const worktree = await manager.add('feature');
    await manager.release(worktree.id);
    Object.assign(rows[0], { mode: 'read_only' });

    expect(await reasonOf(manager.remove(worktree.id))).toBe('not_found');
    expect(rows).toHaveLength(1);
  });
});

describe('WorktreeManager.prune：可写检出位', () => {
  it('不靠快照库：会话归属的与丢了持有键的回收，持久归属且持有着分支的留着；只读检出位没配快照库时跳过', async () => {
    const manager = managerOf(false);
    branches.push({ id: 'kept', activated: false, activeKey: null }, { id: 'gone', activated: false, activeKey: null });
    const session = await manager.add('feature', { owner: 'session' });
    const kept = await manager.add('kept');
    const lost = await manager.add('gone');
    for (const id of [session.id, kept.id, lost.id]) await manager.release(id);
    Object.assign(
      branches.find(row => row.id === 'gone')!,
      { activeKey: null }
    );
    const readOnly = Object.assign(new Worktree(), {
      id: 'ro-1',
      mode: 'read_only',
      owner: 'session',
      state: 'ready',
      tableSetSuffix: null
    });
    rows.push(readOnly as Worktree);

    const pruned = await manager.prune();

    expect([...pruned].sort()).toEqual([session.id, lost.id].sort());
    expect(rows.map(row => row.id).sort()).toEqual([kept.id, 'ro-1'].sort());
    // 被回收的连这套表的激活态行一起删（US-314 B2.2）
    expect(activations.map(row => row.id)).toEqual([WorktreeTableSet.of(kept.tableSetSuffix!, []).holderKey]);
    expect(branches.find(row => row.id === 'feature')).toMatchObject({ activeKey: null });
  });

  it('认领着的（锁在本上下文）不回收', async () => {
    const manager = managerOf(false);
    await manager.add('feature', { owner: 'session' });

    expect(await manager.prune()).toEqual([]);
  });
});

describe('销毁时收尾可写检出位', () => {
  it('停止时也中止仍在等待本地适配器的命令', async () => {
    const database = new RxDB({
      dbName: `pending-checkout-${uuid()}`,
      entities: [WritableNote],
      multiInstance: false,
      sync: { local: { adapter: 'mock' }, type: SyncType.None }
    });
    database.adapter('mock', db => createMockAdapter(db));
    database.use(rxDBPluginWorkingTree);
    databases.push(database);
    let settled = false;
    const adding = database.workingTree.checkouts.add('feature').catch(() => {
      settled = true;
    });
    await vi.waitFor(async () => {
      const locks = await navigator.locks.query();
      expect(locks.held?.some(lock => lock.name?.startsWith(`rxdb-worktree:${database.config.dbName}:`))).toBe(true);
    });
    database.workingTree.checkouts.stop();
    try {
      await vi.waitFor(() => expect(settled).toBe(true));
    } finally {
      if (!settled) database.init();
      await adding;
      await database.destroy();
    }
    const locks = await navigator.locks.query();
    expect(locks.held?.some(lock => lock.name?.startsWith(`rxdb-worktree:${database.config.dbName}:`))).toBe(false);
  });

  it('停止新命令后归还全部认领锁，不删除持久检出位', async () => {
    branches.push({ id: 'second', activated: false, activeKey: null });
    const manager = managerOf();
    const first = await manager.add('feature');
    const second = await manager.add('second');
    expect(await isLocked(first.id)).toBe(true);
    expect(await isLocked(second.id)).toBe(true);

    manager.stop();
    await expect(manager.add('feature')).rejects.toThrow('已销毁');
    await expect(manager.mountMain()).rejects.toThrow('已销毁');
    await expect(manager.list()).rejects.toThrow('已销毁');
    await manager.dispose();
    await manager.dispose();

    expect(await isLocked(first.id)).toBe(false);
    expect(await isLocked(second.id)).toBe(false);
    expect(rows.map(row => row.id)).toEqual([first.id, second.id]);
    expect(dropWorktreeTableSet).not.toHaveBeenCalled();
  });

  it('取消排队命令，等已执行的新增完成后再归还其认领锁', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    createWorktreeTableSet.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const manager = managerOf();
    const adding = manager.add('feature');
    await entered.promise;
    const queued = expect(manager.add('second')).rejects.toThrow('Task cancelled');
    manager.stop();
    let disposed = false;
    const disposing = manager.dispose().then(() => {
      disposed = true;
    });
    await queued;
    expect(disposed).toBe(false);

    release.resolve();
    const record = await adding;
    await disposing;
    expect(await isLocked(record.id)).toBe(false);
    expect(rows).toHaveLength(1);
  });
});
