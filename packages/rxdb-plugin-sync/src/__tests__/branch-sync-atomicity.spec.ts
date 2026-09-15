/**
 * @fileoverview 远端分支落库的原子性与拓扑顺序（RXD-035）
 *
 * US-025 阶段 D 之前这组用例是历史包 `branch-topology-atomicity.spec.ts` 的第四段
 * ——与 `remove_branch` / `create_branch` / `getCurrentBranch` 共用一套假适配器。
 * `syncBranches` 随同步插件搬进本包之后它跟着走，留在那边的三段仍守分支拓扑的写入窗口。
 *
 * 假适配器是**重写**而不是整份复制：那边的窗口套件要 barrier、要 `removeMany`、要
 * 变更表的删除语义，`syncBranches` 一样都不碰。照搬过来的话，本文件会多出一堆
 * 没有任何用例走到的分支，看起来像在守什么，其实一行都没执行。
 *
 * 但有两条必须是真的，缺了红基线就立不住：
 *
 * - **主键与自引用外键**：RXD-035 的子分支先于父分支落库，撞的就是外键；
 *   重试时撞的是主键。假库不实现它们，「顺序错了」这件事在断言里根本看不出来。
 * - **事务回滚**：没有回滚，「部分提交」这个缺陷会退化成「反正行都还在」。
 */

import { type EntityType, type IRepository, type RxDB, RxDBBranch, RxDBChange, RxDBError } from '@aiao/rxdb';
import type { TransactionExecutor } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { syncBranches } from '../sync-branches.js';
import { SyncManager } from '../SyncManager.js';

interface BranchRow {
  id: string;
  activated: boolean;
  parentId: string | null;
  local?: boolean;
  remote?: boolean;
  fromChangeId?: number | null;
}

interface FindRule {
  field: string;
  operator: string;
  value: unknown;
}

interface FindQuery {
  where?: { rules?: FindRule[] };
  limit?: number;
}

/** 只支持本套件用到的 `=`，多了反而会掩盖被测代码换了查询形状。 */
const select = <T extends Record<string, unknown>>(rows: T[], query: FindQuery): T[] => {
  const rules = query.where?.rules ?? [];
  return rows.filter(row =>
    rules.every(rule => {
      if (rule.operator !== '=') throw new RxDBError(`假仓储没实现 operator "${rule.operator}"`);
      return (row[rule.field] ?? null) === (rule.value ?? null);
    })
  );
};

/**
 * 并发度 1 的假本地适配器。
 *
 * 队列是真的（一次一个），因此「事务持槽期间外部写入只能排队」由机制本身保证。
 * `tripwire` 打开后，事务体内任何经队列的调用直接抛错 —— 真实实现在那里是挂死，
 * 判红比把 CI 挂到超时有用得多。
 */
class FakeLocalDatabase {
  #busy = false;
  readonly #waiting: Array<() => void> = [];
  #inTransaction = false;

  readonly branches: BranchRow[] = [];
  readonly changes: Array<{ id: number; remoteId: number }> = [];
  transactionCount = 0;
  tripwire = false;

  get adapter(): Pick<FakeLocalDatabase, 'transaction'> {
    return { transaction: fun => this.transaction(fun) };
  }

  async transaction<T>(fun: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    return this.#queued('transaction', async () => {
      this.transactionCount += 1;
      this.#inTransaction = true;
      const snapshot = this.branches.map(row => ({ ...row }));
      try {
        return await fun(this.#executor());
      } catch (error) {
        this.branches.splice(0, this.branches.length, ...snapshot);
        throw error;
      } finally {
        this.#inTransaction = false;
      }
    });
  }

  /** 库里是否存在 `parentId` 指向已不存在分支的孤儿。 */
  orphans(): BranchRow[] {
    return this.branches.filter(row => row.parentId !== null && !this.branches.some(p => p.id === row.parentId));
  }

  #executor(): TransactionExecutor {
    const executor = {
      id: 'fake-executor',
      state: 'active' as const,
      getRepository: (EntityType: EntityType) => {
        if ((EntityType as unknown) === RxDBBranch) return this.#branchRepository();
        if ((EntityType as unknown) === RxDBChange) return this.#changeRepository();
        throw new RxDBError(`假 executor 没有 ${String(EntityType)} 的仓库`);
      }
    };
    return executor as unknown as TransactionExecutor;
  }

  #branchRepository(): IRepository<typeof RxDBBranch> {
    const repository = {
      find: (query: FindQuery) =>
        Promise.resolve(select(this.branches as unknown as Record<string, unknown>[], query) as BranchRow[]),
      create: (row: BranchRow) => Promise.resolve(this.#insertBranch(row)),
      update: (row: BranchRow, patch: Partial<BranchRow>) => Promise.resolve(Object.assign(row, patch))
    };
    return repository as unknown as IRepository<typeof RxDBBranch>;
  }

  #changeRepository(): IRepository<typeof RxDBChange> {
    const repository = {
      find: (query: FindQuery) =>
        Promise.resolve(select(this.changes as unknown as Record<string, unknown>[], query))
    };
    return repository as unknown as IRepository<typeof RxDBChange>;
  }

  #insertBranch(row: BranchRow): BranchRow {
    if (this.branches.some(existed => existed.id === row.id)) {
      throw new RxDBError(`duplicate branch id '${row.id}'`);
    }
    const parentId = row.parentId ?? null;
    if (parentId !== null && !this.branches.some(existed => existed.id === parentId)) {
      throw new RxDBError(`foreign key violation: branch '${row.id}' references missing parent '${parentId}'`);
    }
    this.branches.push(row);
    return row;
  }

  async #queued<T>(label: string, task: () => T | Promise<T>): Promise<T> {
    if (this.tripwire && this.#inTransaction) {
      throw new RxDBError(`死锁绊线：事务体内经队列调用了 ${label}（并发度 1，会排在自己这个事务后面）`);
    }
    await this.#acquire();
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(): Promise<void> {
    if (!this.#busy) {
      this.#busy = true;
      return;
    }
    await new Promise<void>(resolve => this.#waiting.push(resolve));
  }

  #release(): void {
    const next = this.#waiting.shift();
    if (next) {
      next();
      return;
    }
    this.#busy = false;
  }
}

/**
 * @param remoteBranches - 远端分支数组，**按给定顺序原样交回**。
 *   顺序是这套用例的被测面之一，所以这里绝不排序。
 */
const createSyncManager = (db: FakeLocalDatabase, remoteBranches: BranchRow[]): SyncManager => {
  const rxdb = { config: { sync: {} }, localAdapter$: of(db.adapter) } as unknown as RxDB;
  // 历史桥在这条路径上一次都不会被碰：`syncBranches` 不结算计数、不动 undo 栈。
  // 给一张空桌子比给一组假成员诚实 —— 真有谁碰了它，`undefined is not a function` 就是答案。
  const sm = new SyncManager(rxdb, {} as unknown as SyncManager['history']);
  sm.getLocalRepositories = () =>
    Promise.resolve({ adapter: db.adapter } as unknown as Awaited<ReturnType<SyncManager['getLocalRepositories']>>);
  sm.getRemoteRepositories = () =>
    Promise.resolve({
      adapter: { pullBranches: () => Promise.resolve(remoteBranches) }
    } as unknown as Awaited<ReturnType<SyncManager['getRemoteRepositories']>>);
  return sm;
};

/**
 * RXD-035 —— 远端分支落库既无拓扑排序也无事务。
 *
 * 两个子缺陷叠在一起才是完整的伤害面：
 * - 无拓扑排序 → 子先父后必失败；
 * - 无事务 → 失败前已 create 的分支留在库里，重试时又撞主键，同步就此卡死。
 */
describe('syncBranches 的原子性与拓扑顺序（RXD-035）', () => {
  it('远端按子先父后的顺序返回时，仍要全部落库且不留孤儿', async () => {
    const db = new FakeLocalDatabase();
    // 绊线：事务体内不得再碰绑在适配器上的仓库（并发度 1 会自锁）。
    db.tripwire = true;
    // 刻意倒序：孙 → 子 → 父。远端不保证顺序，被测代码必须自己排。
    const sm = createSyncManager(db, [
      { id: 'grand', activated: false, parentId: 'child' },
      { id: 'child', activated: false, parentId: 'root' },
      { id: 'root', activated: false, parentId: null }
    ]);

    const result = await syncBranches(sm);

    expect(result).toMatchObject({ created: 3, updated: 0, total: 3 });
    expect(db.branches.map(row => row.id).sort()).toEqual(['child', 'grand', 'root']);
    expect(db.orphans()).toEqual([]);
    // 三条 create 必须共处一个事务窗口：否则中途失败就是「部分提交」。
    expect(db.transactionCount).toBe(1);
  });

  it('已存在的本地分支只标记 remote，不重复创建', async () => {
    const db = new FakeLocalDatabase();
    db.tripwire = true;
    db.branches.push({ id: 'root', activated: true, parentId: null, local: true, remote: false });
    const sm = createSyncManager(db, [
      { id: 'child', activated: false, parentId: 'root' },
      { id: 'root', activated: false, parentId: null }
    ]);

    const result = await syncBranches(sm);

    expect(result).toMatchObject({ created: 1, updated: 1, total: 2 });
    expect(db.branches.find(row => row.id === 'root')?.remote).toBe(true);
    expect(db.branches.filter(row => row.id === 'root')).toHaveLength(1);
    expect(db.orphans()).toEqual([]);
  });

  /**
   * 原子性：远端数组里混进一条父分支查无此人的记录（远端删了父、子还挂着，
   * 或者分页把父分支切到了下一页），整批必须原地回滚 —— 不能留下半批已提交的分支，
   * 否则下次重试撞主键，同步永久卡死。
   */
  it('批中有一条外键无法满足时，本地分支表整体不变', async () => {
    const db = new FakeLocalDatabase();
    db.branches.push({ id: 'main', activated: true, parentId: null, local: true, remote: false });
    const sm = createSyncManager(db, [
      { id: 'root', activated: false, parentId: null },
      { id: 'child', activated: false, parentId: 'root' },
      { id: 'lost', activated: false, parentId: 'never-existed' }
    ]);

    await expect(syncBranches(sm)).rejects.toThrow(/missing parent/);

    // 一条都不能留：`root` / `child` 在失败前本来是能建成功的。
    expect(db.branches.map(row => row.id)).toEqual(['main']);
    expect(db.orphans()).toEqual([]);
  });

  /**
   * 成环与「父缺失」要能分开报 —— 两者的处置完全不同：父缺失通常是分页/删除的时序问题，
   * 重试可能就好了；成环是远端数据本身坏了，重试多少次都一样。报错分不清就只能靠猜。
   */
  it('远端分支互相成环时整批放弃，且错因报成 cycle 而非 missing parent', async () => {
    const db = new FakeLocalDatabase();
    db.branches.push({ id: 'main', activated: true, parentId: null, local: true, remote: false });
    const sm = createSyncManager(db, [
      { id: 'a', activated: false, parentId: 'b' },
      { id: 'b', activated: false, parentId: 'a' }
    ]);

    await expect(syncBranches(sm)).rejects.toThrow(/cycle/);

    expect(db.branches.map(row => row.id)).toEqual(['main']);
  });
});
