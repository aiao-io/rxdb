import { NEVER } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { create_branch } from '../../version/create-branch.js';
import { remove_branch } from '../../version/remove-branch.js';
import { syncBranches } from '../../version/sync-branches.js';
import { VersionManager } from '../../version/VersionManager.js';

/**
 * RXD-059 + RXD-037 —— 分支拓扑写入的原子性。
 *
 * 两条 finding 共用同一个绊线套件，因为它们是同一个缺陷的两面：
 *
 * - `remove_branch` 的「查子分支 → 查 change → 删」之间没有事务边界，
 *   检查与删除之间新建的子分支会漏判，留下 `parentId` 指向不存在分支的孤儿（RXD-059）。
 * - `getCurrentBranch` 的「查 active → 查 main → create」之间没有互斥，
 *   并发调用会双双走到 create，第二次撞主键抛错（RXD-037）。
 *
 * 修法也共用一套：改走 executor 作用域的仓库，在**同一个事务窗口**内完成读与写。
 * 而这正是危险所在 —— 事务体内经普通仓库（绑在适配器上）的读写会重新入队，
 * 排在自己这个事务后面，队列并发度 1 即永久挂起。所以本文件的假适配器带一根
 * 「死锁绊线」：事务窗口内任何经队列的调用直接抛错，而不是把 CI 挂到超时。
 */

interface BranchRow {
  id: string;
  activated: boolean;
  parentId: string | null;
  local?: boolean;
  remote?: boolean;
  fromChangeId?: number | null;
}

interface ChangeRow {
  id: number;
  branchId: string;
  revertChangeId: number | null;
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

/** 只支持本套件用到的 `=` / `!=`，多了反而会掩盖被测代码换了查询形状。 */
const matches = (row: Record<string, unknown>, rule: FindRule): boolean => {
  const actual = row[rule.field] ?? null;
  const expected = rule.value ?? null;
  if (rule.operator === '=') return actual === expected;
  if (rule.operator === '!=') return actual !== expected;
  throw new RxDBError(`假仓储没实现 operator "${rule.operator}"`);
};

const select = <T extends Record<string, unknown>>(rows: T[], query: FindQuery): T[] => {
  const rules = query.where?.rules ?? [];
  const hit = rows.filter(row => rules.every(rule => matches(row, rule)));
  return query.limit === undefined ? hit : hit.slice(0, query.limit);
};

/**
 * 并发度 1 的假本地适配器。
 *
 * 队列是真的（先到先得、一次一个），因此「事务持槽期间外部写入只能排队」这件事
 * 由机制本身保证，不靠断言约定。
 */
class FakeLocalDatabase {
  #busy = false;
  readonly #waiting: Array<() => void> = [];
  #inTransaction = false;
  #barrierArmed = false;
  #barrierRunning = false;

  readonly branches: BranchRow[] = [];
  readonly changes: ChangeRow[] = [];
  /** 经队列的调用轨迹，用来看清交错顺序。 */
  readonly queued: string[] = [];
  transactionCount = 0;
  /** 打开后：事务窗口内任何经队列的调用立刻抛错（否则真实实现是挂死）。 */
  tripwire = false;
  /**
   * barrier：一旦「按 parentId 查子分支」发生过，就在**下一次入队之前**跑一遍它，跑完再继续。
   *
   * 挂在入队之前而不是任务内部，是因为任务内部还持着唯一的槽位 —— 在那里等一个同样要入队的
   * 并发写，等到的只会是死锁。挂在入队之前，并发写能自由取用槽位并完整落库，
   * 于是「检查已过时、删除还没发生」这个窗口被稳定地撑开，不靠调度巧合。
   */
  onBarrier: (() => Promise<unknown>) | undefined = undefined;

  get adapter(): Pick<FakeLocalDatabase, 'transaction' | 'removeMany'> {
    return { transaction: fun => this.transaction(fun), removeMany: rows => this.removeMany(rows) };
  }

  /** `getLocalRepositories()` 交出去的那一份：绑在适配器上，走队列。 */
  branchRepository(): IRepository<typeof RxDBBranch> {
    return this.#branchRepository(false);
  }

  changeRepository(): IRepository<typeof RxDBChange> {
    return this.#changeRepository(false);
  }

  async transaction<T>(fun: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    return this.#queued('transaction', async () => {
      this.transactionCount += 1;
      this.#inTransaction = true;
      // 回滚是真的：事务体抛错时整段写入撤销。没有这一条，「部分提交」这个缺陷
      // 在假库上就永远看不出来 —— 断言会变成「反正行都还在」。
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

  async removeMany(rows: unknown[]): Promise<unknown[]> {
    return this.#queued('adapter.removeMany', () => this.#delete(rows));
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
        if ((EntityType as unknown) === RxDBBranch) return this.#branchRepository(true);
        if ((EntityType as unknown) === RxDBChange) return this.#changeRepository(true);
        throw new RxDBError(`假 executor 没有 ${String(EntityType)} 的仓库`);
      },
      removeMany: (rows: unknown[]) => Promise.resolve(this.#delete(rows)),
      saveMany: (rows: unknown[]) => Promise.resolve(rows),
      query: () => Promise.resolve({ rowsAffected: 0, rows: [], columns: [] }),
      mutations: () => Promise.resolve([]),
      mergeChanges: () => Promise.resolve(),
      run: (fun: (inner: TransactionExecutor) => Promise<unknown>) => fun(executor as unknown as TransactionExecutor)
    };
    return executor as unknown as TransactionExecutor;
  }

  #branchRepository(direct: boolean): IRepository<typeof RxDBBranch> {
    const repository = {
      find: (query: FindQuery) =>
        this.#run(direct, 'branch.find', () => {
          const rows = select(this.branches as unknown as Record<string, unknown>[], query);
          // 只有**经队列**的那次子分支检查才布防：窗口的定义就是「两次入队之间」。
          // 检查发生在事务内（`direct`）时窗口根本不存在，此时布防只会让后来者
          // 在 barrier 里等一个正等着它的 promise，把测试挂死而不是判红。
          if (!direct && query.where?.rules?.some(rule => rule.field === 'parentId')) this.#barrierArmed = true;
          return rows;
        }),
      create: (row: BranchRow) => this.#run(direct, 'branch.create', () => this.#insertBranch(row)),
      update: (row: BranchRow, patch: Partial<BranchRow>) =>
        this.#run(direct, 'branch.update', () => Object.assign(row, patch)),
      remove: (row: BranchRow) => this.#run(direct, 'branch.remove', () => this.#delete([row])[0])
    };
    return repository as unknown as IRepository<typeof RxDBBranch>;
  }

  #changeRepository(direct: boolean): IRepository<typeof RxDBChange> {
    const repository = {
      find: (query: FindQuery) =>
        this.#run(direct, 'change.find', () => select(this.changes as unknown as Record<string, unknown>[], query))
    };
    return repository as unknown as IRepository<typeof RxDBChange>;
  }

  #insertBranch(row: BranchRow): BranchRow {
    // 主键约束是真的：RXD-037 里第二次 create 撞的就是它。
    if (this.branches.some(existed => existed.id === row.id)) {
      throw new RxDBError(`duplicate branch id '${row.id}'`);
    }
    // 自引用外键也是真的：`rxdb_branch.parentId → rxdb_branch.id`。
    // RXD-035 的子分支先于父分支落库，撞的正是这一条。
    const parentId = row.parentId ?? null;
    if (parentId !== null && !this.branches.some(existed => existed.id === parentId)) {
      throw new RxDBError(`foreign key violation: branch '${row.id}' references missing parent '${parentId}'`);
    }
    this.branches.push(row);
    return row;
  }

  #delete(rows: unknown[]): unknown[] {
    for (const row of rows) {
      const branchIndex = this.branches.indexOf(row as BranchRow);
      if (branchIndex >= 0) this.branches.splice(branchIndex, 1);
      const changeIndex = this.changes.indexOf(row as ChangeRow);
      if (changeIndex >= 0) this.changes.splice(changeIndex, 1);
    }
    return rows;
  }

  #run<T>(direct: boolean, label: string, task: () => T): Promise<T> {
    return direct ? Promise.resolve(task()) : this.#queued(label, task);
  }

  async #queued<T>(label: string, task: () => T | Promise<T>): Promise<T> {
    if (this.tripwire && this.#inTransaction) {
      throw new RxDBError(`死锁绊线：事务体内经队列调用了 ${label}（并发度 1，会排在自己这个事务后面）`);
    }
    // 重入保护：barrier 自己发出的入队不能再次触发 barrier，否则就是等自己。
    if (this.#barrierArmed && !this.#barrierRunning && this.onBarrier !== undefined) {
      this.#barrierArmed = false;
      this.#barrierRunning = true;
      try {
        await this.onBarrier();
      } catch {
        // barrier 那一侧的成败由用例自己判定，这里只负责把它跑完
      } finally {
        this.#barrierRunning = false;
      }
    }
    await this.#acquire();
    this.queued.push(label);
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
 * @param remoteBranches - 给 `syncBranches` 用的远端分支数组，**按给定顺序原样交回**。
 *   顺序是这套用例的被测面之一，所以这里绝不排序。
 */
const createVersionManager = (db: FakeLocalDatabase, remoteBranches?: BranchRow[]): VersionManager => {
  const rxdb = {
    config: { sync: {} },
    connected$: NEVER,
    addEventListener: () => () => undefined,
    removeEventListener: () => undefined,
    entityManager: {
      // `new VersionManager()` 会连带构造 `HistoryManager`，后者在构造函数里就订阅了
      // 当前分支流。这里给的是**响应式**仓库（`findOne` / `findAll`），与本文件测的
      // 命令式仓库不是同一套；`NEVER` 让那条流永不发射，历史逻辑不参与本套件。
      getRepository: () => ({ findOne: () => NEVER, findAll: () => NEVER }),
      // `save()` 必须真的能用且**走队列** —— 真实实体的 `save()` 经 entityManager 打到适配器上，
      // 正是事务体内不能碰的那条路。给个空壳会让被测代码在 `save()` 处炸掉，
      // 红基线就变成「因为替身不全而失败」，锁不住缺陷本身。
      instantiate: (EntityType: EntityType) => {
        const entity = Object.create(EntityType.prototype) as BranchRow & { save: () => Promise<unknown> };
        entity.save = () => db.branchRepository().create(entity as never) as Promise<unknown>;
        return entity;
      }
    }
  } as unknown as RxDB;
  const version = new VersionManager(rxdb);
  version.getLocalRepositories = () =>
    Promise.resolve({
      branchRepository: db.branchRepository(),
      changeRepository: db.changeRepository(),
      adapter: db.adapter
    } as unknown as Awaited<ReturnType<VersionManager['getLocalRepositories']>>);
  version.getRemoteRepositories = () =>
    Promise.resolve({
      adapter: { pullBranches: () => Promise.resolve(remoteBranches ?? []) }
    } as unknown as Awaited<ReturnType<VersionManager['getRemoteRepositories']>>);
  return version;
};

describe('分支拓扑写入的原子性（RXD-059 / RXD-037）', () => {
  describe('remove_branch', () => {
    it('读与删必须在同一个事务窗口内完成', async () => {
      const db = new FakeLocalDatabase();
      // 绊线：一旦事务体里还用着绑在适配器上的仓库，这里直接抛错而不是挂死。
      db.tripwire = true;
      db.branches.push({ id: 'main', activated: true, parentId: null });
      db.branches.push({ id: 'feature', activated: false, parentId: 'main' });
      db.changes.push({ id: 500, branchId: 'feature', revertChangeId: null });

      await remove_branch(createVersionManager(db), 'feature');

      expect(db.transactionCount).toBe(1);
      expect(db.branches.map(row => row.id)).toEqual(['main']);
      expect(db.changes).toEqual([]);
    });

    /**
     * 评审要求的那条：用 barrier 在「查子分支」与「删」之间插入一次并发建分支，
     * 验证只能有一方成功。
     *
     * 没有事务边界时两边都会成功 —— 子分支落库，父分支同时被删掉，
     * 留下 `parentId` 指向不存在分支的孤儿；而孤儿又会被切分支时的
     * 「父节点缺失即当作到根」静默吞掉（RXD-058），损坏无声。
     */
    it('与并发 create_branch 交错时只能有一方成功，且不留孤儿', async () => {
      const db = new FakeLocalDatabase();
      db.branches.push({ id: 'main', activated: true, parentId: null });
      db.branches.push({ id: 'feature', activated: false, parentId: 'main' });
      db.changes.push({ id: 500, branchId: 'feature', revertChangeId: null });

      const version = createVersionManager(db);
      let create: Promise<unknown> | undefined;
      /** 幂等启动：barrier 里抢先跑最好；barrier 没机会触发时，remove 结束后再跑。 */
      const startCreate = (): Promise<unknown> => {
        create ??= create_branch(version, 'child', 500).catch((error: unknown) => Promise.reject(error));
        create.catch(() => undefined); // 防未处理拒绝；判定在下面
        return create;
      };
      // 检查已经做过、删除还没发生 —— 把并发建分支整个塞进这个窗口。
      // 修好之后这个窗口根本不存在（检查与删除同处一个事务），barrier 不会触发，
      // create 就退化成 remove 之后再跑：那时父分支已不在，它自己会失败。
      db.onBarrier = startCreate;

      const settle = (promise: Promise<unknown>): Promise<'fulfilled' | 'rejected'> =>
        promise.then(
          () => 'fulfilled' as const,
          () => 'rejected' as const
        );

      const removeOutcome = await settle(remove_branch(version, 'feature'));
      const createOutcome = await settle(startCreate());

      expect([removeOutcome, createOutcome].filter(outcome => outcome === 'fulfilled')).toHaveLength(1);
      expect(db.orphans()).toEqual([]);
    });
  });

  describe('create_branch', () => {
    /** 查重与建分支必须同窗口，否则 `remove_branch` 那侧的互斥无从谈起。 */
    it('查重与写入在同一个事务窗口内，且事务体内不再碰绑在适配器上的仓库', async () => {
      const db = new FakeLocalDatabase();
      db.tripwire = true;
      db.branches.push({ id: 'main', activated: true, parentId: null });
      db.changes.push({ id: 500, branchId: 'main', revertChangeId: null });

      await create_branch(createVersionManager(db), 'child', 500);

      expect(db.branches.map(row => row.id)).toEqual(['main', 'child']);
      expect(db.transactionCount).toBe(1);
    });
  });

  describe('getCurrentBranch', () => {
    /** RXD-037：并发调用不能双双走到 create，第二次撞主键就是「并发即报错」。 */
    it('并发调用只建一个 main，且都拿到同一个分支', async () => {
      const db = new FakeLocalDatabase();
      const version = createVersionManager(db);

      const settled = await Promise.allSettled([version.getCurrentBranch(), version.getCurrentBranch()]);

      expect(settled.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(db.branches.filter(row => row.id === 'main')).toHaveLength(1);
      expect(db.branches.every(row => row.activated)).toBe(true);
    });

    it('建 main 的那条路径在事务内完成，且事务体内不再碰绑在适配器上的仓库', async () => {
      const db = new FakeLocalDatabase();
      db.tripwire = true;

      const branch = await createVersionManager(db).getCurrentBranch();

      expect(branch.id).toBe('main');
      expect(db.transactionCount).toBe(1);
      expect(db.branches).toHaveLength(1);
    });

    /**
     * 回归护栏（改之前也是绿的）：`getCurrentBranch` 在同步链路里是每条远端事件都要调的热路径
     * （`sync-listeners` 的 `filterByBranch`）。已有激活分支时不得为它开写事务 ——
     * 把整段包进事务能修好并发，但会让每次读都去抢并发度 1 的队列槽位。
     */
    it('已有激活分支时不开事务（热路径不抢写队列）', async () => {
      const db = new FakeLocalDatabase();
      db.branches.push({ id: 'main', activated: true, parentId: null });

      const branch = await createVersionManager(db).getCurrentBranch();

      expect(branch.id).toBe('main');
      expect(db.transactionCount).toBe(0);
    });
  });

  /**
   * RXD-035 残留：远端分支落库既没有拓扑排序，也没有事务边界。
   *
   * `pullBranches()` 交回来的是一个**没有顺序保证**的数组 —— 远端按 `updatedAt`、
   * 按主键、按任何它高兴的顺序返回都合法。而 `rxdb_branch.parentId` 是指向自己的外键，
   * 子分支排在父分支前面时，逐条 create 的第一条就撞 FK。
   *
   * 两个子缺陷叠在一起才是完整的伤害面：
   * - 无拓扑排序 → 子先父后必失败；
   * - 无事务 → 失败前已 create 的分支留在库里，重试时又撞主键，同步就此卡死。
   */
  describe('syncBranches', () => {
    it('远端按子先父后的顺序返回时，仍要全部落库且不留孤儿', async () => {
      const db = new FakeLocalDatabase();
      // 绊线：事务体内不得再碰绑在适配器上的仓库（并发度 1 会自锁）。
      db.tripwire = true;
      // 刻意倒序：孙 → 子 → 父。远端不保证顺序，被测代码必须自己排。
      const version = createVersionManager(db, [
        { id: 'grand', activated: false, parentId: 'child' },
        { id: 'child', activated: false, parentId: 'root' },
        { id: 'root', activated: false, parentId: null }
      ]);

      const result = await syncBranches(version);

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
      const version = createVersionManager(db, [
        { id: 'child', activated: false, parentId: 'root' },
        { id: 'root', activated: false, parentId: null }
      ]);

      const result = await syncBranches(version);

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
      const version = createVersionManager(db, [
        { id: 'root', activated: false, parentId: null },
        { id: 'child', activated: false, parentId: 'root' },
        { id: 'lost', activated: false, parentId: 'never-existed' }
      ]);

      await expect(syncBranches(version)).rejects.toThrow(/missing parent/);

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
      const version = createVersionManager(db, [
        { id: 'a', activated: false, parentId: 'b' },
        { id: 'b', activated: false, parentId: 'a' }
      ]);

      await expect(syncBranches(version)).rejects.toThrow(/cycle/);

      expect(db.branches.map(row => row.id)).toEqual(['main']);
    });
  });
});
