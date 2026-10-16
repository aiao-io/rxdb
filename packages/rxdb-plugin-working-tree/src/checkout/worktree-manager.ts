/**
 * @fileoverview `rxdb.workingTree.checkouts`：只读检出位的入口（US-313）。
 *
 * @remarks
 * 打开一个检出位：先拿下它的 Web Lock，再是三笔主库事务夹着快照库的建立——
 *
 * 1. 校验目标、写登记行（`building`）——先登记再建库，崩在后面任何一步，回收时都按登记行找得到库；
 * 2. 连上快照实例（建表在这一步，不占着主库）；主库一笔事务里算增量、读业务表、写进快照库；
 *    快照库封成只读；
 * 3. 登记行转 `ready`，记下主库当时停在哪。
 *
 * 关闭是反过来：断开快照实例、删快照库、删登记行，最后还锁。锁一直握在打开它的上下文手里，
 * 于是「锁没人持有」就是「没人在用」：`prune()` 只回收拿得到锁的会话归属检出位与没建完的检出位。
 *
 * 主库事务都经工作树门面的受管事务（`WorkingTreeManager.runEnabled`）：与工作树的其它命令同一道门禁，
 * 未启用的库上拒绝。
 */

import type { EntityType, LocalRxDBAdapter, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { computeRxDBSchemaFingerprint, RxDBBranch, RxDBError, sha256Hex, uuid } from '@aiao/rxdb';
import { createCommitWriteContext } from '../commit/commit-context.js';
import { classifyBranchMaterialization } from '../working-tree/branch-materialization.js';
import { planCommitView } from './worktree-commit-view.js';
import { worktreeCopiedEntities, worktreeDeclaredEntities, worktreeEntityOf } from './worktree-entities.js';
import { WorktreeUnavailableError } from './worktree-errors.js';
import { holdWorktreeLock, worktreeLockName, type WorktreeLockRelease } from './worktree-locks.js';
import type { WorktreeOptions } from './worktree-options.js';
import {
  assertSnapshotSource,
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
  sealSnapshot
} from './worktree-snapshot.js';
import { isWorktreeCommitTarget, type WorktreeTarget } from './worktree-target.js';
import { Worktree, type WorktreeOwner } from './worktree.entity.js';

/** {@link WorktreeManager.open} 的选项。 */
export interface WorktreeOpenOptions {
  /**
   * 归属，缺省 `session`。
   *
   * @remarks
   * `session`：打开它的标签页（或 Node 进程）一结束，任何一处的 `prune()` 都能回收它。
   * `persistent`：刷新之后仍在登记里，用 {@link WorktreeManager.attach} 再打开；不用了显式 `close()`。
   */
  readonly owner?: WorktreeOwner;
}

/** 一个打开着的只读检出位。 */
export interface WorktreeView {
  /** 检出位 id，即登记行的主键 */
  readonly id: string;
  /** 打开时给的 HEAD */
  readonly target: WorktreeTarget;
  /** 归属 */
  readonly owner: WorktreeOwner;
  /**
   * 只读实例。
   *
   * @remarks
   * 公开写入口抛 `RxDBReadOnlyError`。实体类是主实例的克隆：查询要用 {@link WorktreeView.entityOf} 换过的类。
   */
  readonly rxdb: RxDB;
  /**
   * 主实例的实体类在只读实例上的对应类。
   *
   * @param EntityClass - 主实例上的实体类
   * @returns 同命名空间、同名的克隆类
   * @throws {@link WorktreeUnavailableError} `incomplete_entities`：快照里没有这个实体
   */
  entityOf<T extends EntityType>(EntityClass: T): T;
  /**
   * 按主库现状重建，归属不变。
   *
   * @returns 新的视图；本视图随之关闭
   */
  refresh(): Promise<WorktreeView>;
  /** 关闭只读实例、删快照库与登记行；重复调用无副作用 */
  close(): Promise<void>;
  /**
   * 只关本处的只读实例、还锁，快照库与登记行留着。
   *
   * @remarks
   * 持久归属的检出位之后用 {@link WorktreeManager.attach} 再打开；会话归属的留给 `prune()` 回收。
   */
  release(): Promise<void>;
}

/**
 * 工作树门面的受管事务：读能力位、过门禁，再把执行器与本纪元的适配器交给命令体。
 *
 * @param run - 命令体
 * @returns 命令体的返回值
 */
export type WorktreeTransactionRunner = <T>(
  run: (executor: TransactionExecutor, adapter: LocalRxDBAdapter) => Promise<T>
) => Promise<T>;

/** 只读检出位的入口：`rxdb.workingTree.checkouts`。 */
export class WorktreeManager {
  readonly #rxdb: RxDB;
  readonly #runEnabled: WorktreeTransactionRunner;
  readonly #options: WorktreeOptions | undefined;

  /**
   * 由工作树门面构造，一个 RxDB 实例一个。
   *
   * @param rxdb - 主实例
   * @param runEnabled - 门面的受管事务；主库事务都经它的门禁
   * @param options - 插件的 `worktrees` 选项
   */
  constructor(rxdb: RxDB, runEnabled: WorktreeTransactionRunner, options: WorktreeOptions | undefined) {
    this.#rxdb = rxdb;
    this.#runEnabled = runEnabled;
    this.#options = options;
  }

  /**
   * 以只读方式打开另一条分支，或当前分支上一个可达提交的完整数据；不切换分支、不动工作树。
   *
   * @param target - `{ branchId }` 分支视图，`{ commitId }` 提交视图
   * @param options - 见 {@link WorktreeOpenOptions}
   * @returns 打开着的视图；用完 {@link WorktreeView.close}
   * @throws {@link WorktreeUnavailableError} 没配置快照库、后端不支持、运行时没有 Web Locks；分支不存在或本地只有
   * metadata；提交不可达、路径上有认不出的实体、或有进行中的恢复（与 `restore()` 同一口径）
   */
  async open(target: WorktreeTarget, options: WorktreeOpenOptions = {}): Promise<WorktreeView> {
    const worktrees = this.#requireOptions();
    const owner = options.owner ?? 'session';
    const copied = worktreeCopiedEntities(this.#rxdb);
    const id = uuid();
    const dbName = snapshotDbNameOf(this.#rxdb.config.dbName, id);
    // 新 id 上的锁不会被别人占着；登记行写下之前就握住，别处的 prune() 才不会把建到一半的库回收掉
    const release = (await holdWorktreeLock(this.#lockName(id)))!;
    try {
      const mainAdapter = await this.#runEnabled(async (executor, adapter) => {
        assertSnapshotSource(adapter);
        const branchId = await readableBranchOf(executor, adapter, target);
        await executor.saveMany([this.#record({ id, target, branchId, dbName, owner }, copied)]);
        return adapter;
      });
      return await this.#build({ id, target, owner, dbName }, mainAdapter, worktrees, release);
    } catch (error) {
      await release();
      throw error;
    }
  }

  /**
   * 再打开一个持久归属的检出位，不重建快照。
   *
   * @param id - 检出位 id（{@link WorktreeManager.list} 里那一行）
   * @returns 打开着的视图
   * @throws {@link WorktreeUnavailableError} `in_use`：它正在别处打开着；`not_found`：没有这个持久、已建完的检出位；
   * `schema_mismatch`：建它之后应用的实体结构变了，要重新打开一个
   */
  async attach(id: string): Promise<WorktreeView> {
    const worktrees = this.#requireOptions();
    const release = await holdWorktreeLock(this.#lockName(id), true);
    if (!release) throw new WorktreeUnavailableError('in_use', `检出位 ${id} 正在别处打开着`);
    let snapshot: RxDB | undefined;
    try {
      const { record, mainAdapter } = await this.#runEnabled(async (executor, adapter) => ({
        record: (await findRecords(executor, id))[0],
        mainAdapter: adapter
      }));
      if (!record || record.owner !== 'persistent' || record.state !== 'ready') {
        throw new WorktreeUnavailableError('not_found', `没有持久归属、已建完的检出位 ${id}`);
      }
      const copied = worktreeCopiedEntities(this.#rxdb);
      if (record.schemaFingerprint !== computeRxDBSchemaFingerprint(copied)) {
        throw new WorktreeUnavailableError('schema_mismatch', `检出位 ${id} 建好之后应用的实体结构变了`);
      }
      snapshot = createSnapshotDatabase(
        mainAdapter,
        record.dbName,
        worktreeDeclaredEntities(this.#rxdb, copied),
        worktrees
      );
      const snapshotAdapter = await connectSnapshotDatabase(snapshot);
      await sealSnapshot(snapshotAdapter);
      await this.#runEnabled(async executor => {
        await executor.getRepository(Worktree).update(await findRecord(executor, id), { lastAccessedAt: new Date() });
      });
      const target: WorktreeTarget =
        record.kind === 'commit' && record.commitId !== null ?
          { commitId: record.commitId }
        : { branchId: record.branchId };
      return this.#view({ id, target, owner: 'persistent', dbName: record.dbName }, snapshot, snapshotAdapter, release);
    } catch (error) {
      await snapshot?.disconnectAll();
      await release();
      throw error;
    }
  }

  /**
   * 本库登记着的全部检出位，按登记时间排序。
   *
   * @returns 登记行
   */
  list(): Promise<Worktree[]> {
    return this.#runEnabled(executor =>
      executor.getRepository(Worktree).find({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'createdAt', sort: 'asc' }]
      })
    );
  }

  /**
   * 回收没人在用的检出位：会话归属的，与没建完的（`building`）。持久归属且已建完的留着。
   *
   * @returns 回收掉的检出位 id
   * @throws AggregateError 有检出位没回收掉；其余的照常回收
   *
   * @remarks
   * 只碰拿得到锁的：别的标签页（或本页）正打开着的检出位，锁在它们手里。删库之前先用空实体集连一次快照库，
   * 标记迁移在不是快照库的已有库上会当场失败——工厂配错、指到了主库存储时，这里报错而不是把主库删掉。
   * 每个连接纪元第一次连上本地适配器后，插件在后台跑一次。
   */
  async prune(): Promise<readonly string[]> {
    const worktrees = this.#requireOptions();
    const { records, mainAdapter } = await this.#runEnabled(async (executor, adapter) => ({
      records: await executor.getRepository(Worktree).find({ where: { combinator: 'and', rules: [] } }),
      mainAdapter: adapter
    }));
    const pruned: string[] = [];
    const failures: unknown[] = [];
    for (const record of records) {
      if (record.owner === 'persistent' && record.state === 'ready') continue;
      const release = await holdWorktreeLock(this.#lockName(record.id), true);
      if (!release) continue;
      try {
        await this.#reclaim(record, mainAdapter, worktrees);
        pruned.push(record.id);
      } catch (error) {
        failures.push(error);
      } finally {
        await release();
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, `${failures.length} 个只读检出位没回收掉`);
    return pruned;
  }

  #requireOptions(): WorktreeOptions {
    if (this.#options) return this.#options;
    throw new WorktreeUnavailableError('not_configured', '装工作树插件时没给 worktrees.adapter');
  }

  #lockName(id: string): string {
    return worktreeLockName(this.#rxdb.config.dbName, id);
  }

  async #build(
    identity: WorktreeViewIdentity,
    mainAdapter: LocalRxDBAdapter,
    worktrees: WorktreeOptions,
    release: WorktreeLockRelease
  ): Promise<WorktreeView> {
    const copied = worktreeCopiedEntities(this.#rxdb);
    let snapshot: RxDB | undefined;
    let snapshotAdapter: LocalRxDBAdapter | undefined;
    try {
      snapshot = createSnapshotDatabase(
        mainAdapter,
        identity.dbName,
        worktreeDeclaredEntities(this.#rxdb, copied),
        worktrees
      );
      snapshotAdapter = await connectSnapshotDatabase(snapshot);
      const built = snapshot;
      const source = await this.#runEnabled((executor, adapter) =>
        importSnapshot(executor, adapter, built, copied, identity.target)
      );
      await sealSnapshot(snapshotAdapter);
      await this.#runEnabled(async executor => {
        const record = await findRecord(executor, identity.id);
        await executor.getRepository(Worktree).update(record, { ...source, state: 'ready' });
      });
      return this.#view(identity, built, snapshotAdapter, release);
    } catch (error) {
      // 清理失败不盖住原错：没清掉的登记行与快照库在下次 prune() 时按登记行回收。
      // 没连上的快照库一个字节都不删：连接失败可能正是标记迁移发现它不是快照库
      await Promise.allSettled([this.#discard(identity.id, snapshot, snapshotAdapter)]);
      throw error;
    }
  }

  #view(
    identity: WorktreeViewIdentity,
    snapshot: RxDB,
    snapshotAdapter: LocalRxDBAdapter,
    releaseLock: WorktreeLockRelease
  ): WorktreeView {
    let settled = false;
    const settle = async (discard: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        if (discard) await this.#discard(identity.id, snapshot, snapshotAdapter);
        else await snapshot.disconnectAll();
      } finally {
        await releaseLock();
      }
    };
    return {
      id: identity.id,
      target: identity.target,
      owner: identity.owner,
      rxdb: snapshot,
      entityOf: EntityClass => worktreeEntityOf(snapshot, EntityClass),
      refresh: async () => {
        const next = await this.open(identity.target, { owner: identity.owner });
        await settle(true);
        return next;
      },
      close: () => settle(true),
      release: () => settle(false)
    };
  }

  /** 断开快照实例、删快照库、删登记行：先删库再删登记。没连上的快照库不删。 */
  async #discard(id: string, snapshot: RxDB | undefined, snapshotAdapter: LocalRxDBAdapter | undefined): Promise<void> {
    await snapshot?.disconnectAll();
    if (snapshotAdapter) await snapshotAdapter.dropStorage!();
    await this.#unregister(id);
  }

  /** 回收一个没人在用的检出位：先确认它是快照库，再删库、删登记行。 */
  async #reclaim(record: Worktree, mainAdapter: LocalRxDBAdapter, worktrees: WorktreeOptions): Promise<void> {
    const snapshot = createSnapshotDatabase(mainAdapter, record.dbName, [], worktrees);
    const snapshotAdapter = await connectSnapshotDatabase(snapshot);
    await this.#discard(record.id, snapshot, snapshotAdapter);
  }

  #record(identity: WorktreeRecordIdentity, copied: readonly EntityType[]): Worktree {
    const { id, target, branchId, dbName, owner } = identity;
    const now = new Date();
    const record = this.#rxdb.entityManager.instantiate(Worktree);
    Object.assign(record, {
      id,
      kind: isWorktreeCommitTarget(target) ? 'commit' : 'branch',
      branchId,
      commitId: isWorktreeCommitTarget(target) ? target.commitId : null,
      sourceBranchId: null,
      sourceChangeId: null,
      targetChangeId: null,
      dbName,
      owner,
      state: 'building',
      schemaFingerprint: computeRxDBSchemaFingerprint(copied),
      createdAt: now,
      lastAccessedAt: now
    } satisfies Worktree);
    return record;
  }

  async #unregister(id: string): Promise<void> {
    await this.#runEnabled(async executor => {
      const [record] = await findRecords(executor, id);
      if (record) await executor.getRepository(Worktree).remove(record);
    });
  }
}

/**
 * 快照库的逻辑库名：`wt-` 加 24 位十六进制，由主库库名与检出位 id 算出。
 *
 * @remarks
 * 不把主库库名原样拼进去：wa-sqlite 的 VFS 把库名限在 49 字节以内（含 RxDB 追加的版本后缀），
 * Electron 宿主只认 `[A-Za-z0-9._@-]`。哈希里带着主库库名，同一个存储命名空间里的两个主库不会撞名；
 * 登记行记着这个名字，回收时按登记行找库，不靠从名字反推。
 */
const snapshotDbNameOf = (mainDbName: string, id: string): string =>
  `wt-${sha256Hex(new TextEncoder().encode(`${mainDbName}\u0000${id}`)).slice(0, 24)}`;

/** 视图要记的那几样。 */
interface WorktreeViewIdentity {
  readonly id: string;
  readonly target: WorktreeTarget;
  readonly owner: WorktreeOwner;
  readonly dbName: string;
}

/** 登记行里由打开参数决定的那几列。 */
interface WorktreeRecordIdentity extends WorktreeViewIdentity {
  /** 分支视图是目标分支，提交视图是提交所在的 active 分支 */
  readonly branchId: string;
}

/**
 * 检出位的分支：校验目标读得出来，交回登记行要记的分支。
 *
 * @throws {@link WorktreeUnavailableError} 见 {@link WorktreeManager.open}
 */
const readableBranchOf = async (
  executor: TransactionExecutor,
  adapter: LocalRxDBAdapter,
  target: WorktreeTarget
): Promise<string> => {
  if (isWorktreeCommitTarget(target)) {
    return (await planCommitView(executor, createCommitWriteContext(adapter).codec, target.commitId)).branchId;
  }
  await assertBranchReadable(executor, target.branchId);
  return target.branchId;
};

const findRecords = (executor: TransactionExecutor, id: string): Promise<Worktree[]> =>
  executor.getRepository(Worktree).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] },
    limit: 1
  });

const findRecord = async (executor: TransactionExecutor, id: string): Promise<Worktree> => {
  const [record] = await findRecords(executor, id);
  if (!record) throw new RxDBError(`检出位 ${id} 的登记行在建快照期间被删了`);
  return record;
};

/**
 * 目标分支在本地读得出完整数据吗。
 *
 * @throws {@link WorktreeUnavailableError} `branch_not_found` / `branch_not_materialized`
 */
const assertBranchReadable = async (executor: TransactionExecutor, branchId: string): Promise<void> => {
  const [branch] = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!branch) throw new WorktreeUnavailableError('branch_not_found', `分支 ${branchId} 不存在`);
  const state = await classifyBranchMaterialization(executor, branchId);
  if (state.kind === 'metadata_only') {
    throw new WorktreeUnavailableError(
      'branch_not_materialized',
      `分支 ${branchId} 本地只有 metadata：先切过去一次，把远端快照物化下来`
    );
  }
};
