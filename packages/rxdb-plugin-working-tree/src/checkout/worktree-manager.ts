/**
 * @fileoverview `rxdb.workingTree.checkouts`：检出位的入口，只读检出位（US-313）与可写检出位（US-314）。
 *
 * @remarks
 * 打开一个只读检出位：先拿下它的 Web Lock，再是三笔主库事务夹着快照库的建立——
 *
 * 1. 校验目标、写登记行（`building`）——先登记再建库，崩在后面任何一步，回收时都按登记行找得到库；
 * 2. 连上快照实例（建表在这一步，不占着主库）；主库一笔事务里算增量、读业务表、写进快照库；
 *    快照库里写下建完的哨兵（`attach()` 靠它认出「库已经不在、连上的是新建的空库」），再封成只读；
 * 3. 登记行转 `ready`，记下主库当时停在哪。
 *
 * 关闭是反过来：断开快照实例、删快照库、删登记行，最后还锁。锁一直握在打开它的上下文手里，
 * 于是「锁没人持有」就是「没人在用」：`prune()` 只回收拿得到锁的会话归属检出位与没建完的检出位。
 *
 * 可写检出位是同一个库里的一套影子表，动词照 GitHub Desktop 的 worktree：`add()` 登记、持有分支、建表、播种，一笔主库事务做完；
 * `mount()` 让主实例挂上它读写、提交，`mountMain()` 挂回主检出位；`remove()` 一笔事务删表、放持有键、删登记，未提交的改动留在分支上。
 * 认领用同一把锁：`add()` 与 `mount()` 拿下、`release()` 与 `remove()` 还掉，握在认领它的上下文手里，别处 `mount()` 报 `in_use`。
 *
 * 主库事务都经工作树门面的受管事务（`WorkingTreeManager.runEnabled`）：与工作树的其它命令同一道门禁，
 * 未启用的库上拒绝。
 */

import type { EntityType, LocalRxDBAdapter, RxDB, TransactionExecutor } from '@aiao/rxdb';
import {
  computeRxDBSchemaFingerprint,
  RxDBBranch,
  RxDBChange,
  RxDBError,
  sha256Hex,
  uuid,
  WorktreeTableSet
} from '@aiao/rxdb';
import {
  compute_switch_branch_actions,
  get_branch_max_change,
  keep_table_set_actions
} from '@aiao/rxdb-plugin-history';
import { createCommitWriteContext } from '../commit/commit-context.js';
import { classifyBranchMaterialization } from '../working-tree/branch-materialization.js';
import { assertSwitchTargetIntact } from '../working-tree/switch-branch-options.js';
import { planCommitView } from './worktree-commit-view.js';
import {
  worktreeCopiedEntities,
  worktreeDeclaredEntities,
  worktreeEntityOf,
  worktreeTableSetMembers
} from './worktree-entities.js';
import { WorktreeUnavailableError } from './worktree-errors.js';
import { holdWorktreeLock, worktreeLockName, type WorktreeLockRelease } from './worktree-locks.js';
import type { WorktreeOptions } from './worktree-options.js';
import {
  assertSnapshotSource,
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
  isSnapshotComplete,
  markSnapshotComplete,
  sealSnapshot
} from './worktree-snapshot.js';
import { isPrunable, readHeldKeys } from './worktree-startup-reclaim.js';
import { isWorktreeCommitTarget, type WorktreeTarget } from './worktree-target.js';
import {
  assertCheckoutName,
  defaultCheckoutName,
  dropActivationRow,
  holdBranch,
  openActivationRow,
  releaseBranch,
  tableSetHostOf,
  tableSetSuffixOf
} from './worktree-writable.js';
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

/** {@link WorktreeManager.add} 的选项。 */
export interface WorktreeAddOptions {
  /** 名字（GitHub Desktop 的 Worktree name），缺省用分支 id */
  readonly name?: string;
  /**
   * 归属，缺省 `persistent`。
   *
   * @remarks
   * `persistent`：与 git、GitHub Desktop 一致，重启之后还在，分支一直被占到 {@link WorktreeManager.remove}。
   * `session`：认领它的标签页（或 Node 进程）一结束，任何一处的 `prune()` 都能回收它；未提交的改动留在分支上。
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

/** 检出位的入口：`rxdb.workingTree.checkouts`。 */
export class WorktreeManager {
  readonly #rxdb: RxDB;
  readonly #runEnabled: WorktreeTransactionRunner;
  readonly #options: WorktreeOptions | undefined;
  /** 本上下文认领着的可写检出位：id → 它的锁与表集后缀 */
  readonly #claims = new Map<string, WritableClaim>();

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
   * @throws {@link WorktreeUnavailableError} `in_use`：它正在别处打开着；`not_found`：没有这个持久、已建完的检出位，
   * 或者登记行还在、快照库却已经不在了（此时连带回收登记行）；`schema_mismatch`：建它之后应用的实体结构变了，要重新打开一个
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
      if (
        !record ||
        record.mode !== 'read_only' ||
        record.dbName === null ||
        record.owner !== 'persistent' ||
        record.state !== 'ready'
      ) {
        throw new WorktreeUnavailableError('not_found', `没有持久归属、已建完的只读检出位 ${id}`);
      }
      const { dbName } = record;
      const copied = worktreeCopiedEntities(this.#rxdb);
      if (record.schemaFingerprint !== computeRxDBSchemaFingerprint(copied)) {
        throw new WorktreeUnavailableError('schema_mismatch', `检出位 ${id} 建好之后应用的实体结构变了`);
      }
      snapshot = createSnapshotDatabase(mainAdapter, dbName, worktreeDeclaredEntities(this.#rxdb, copied), worktrees);
      const snapshotAdapter = await connectSnapshotDatabase(snapshot);
      if (!(await isSnapshotComplete(snapshotAdapter))) {
        // 连上的是这一刻才建出来的空库：快照库已经不在了。连同登记行一起回收，免得下一次 attach() 又交回一张张空表；
        // 回收失败不盖住这句报错，登记行留给下一次 attach() 再收
        await Promise.allSettled([this.#discard(id, snapshot, snapshotAdapter)]);
        throw new WorktreeUnavailableError('not_found', `检出位 ${id} 的快照库已经不在了`);
      }
      await sealSnapshot(snapshotAdapter);
      await this.#runEnabled(async executor => {
        await executor.getRepository(Worktree).update(await findRecord(executor, id), { lastAccessedAt: new Date() });
      });
      const target: WorktreeTarget =
        record.kind === 'commit' && record.commitId !== null ?
          { commitId: record.commitId }
        : { branchId: record.branchId };
      return this.#view({ id, target, owner: 'persistent', dbName }, snapshot, snapshotAdapter, release);
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
   * 回收没人在用的检出位：会话归属的，没建完的（`building`），以及持有的分支已经不在了的可写检出位。持久归属且已建完的留着。
   *
   * @returns 回收掉的检出位 id
   * @throws AggregateError 有检出位没回收掉；其余的照常回收
   *
   * @remarks
   * 只碰拿得到锁的：别的标签页（或本页）正打开着、认领着的检出位，锁在它们手里。删库之前先用空实体集连一次快照库，
   * 标记迁移在不是快照库的已有库上会当场失败——工厂配错、指到了主库存储时，这里报错而不是把主库删掉。
   * 没配快照库时只读检出位跳过（它们的库连不上）；可写检出位的表在主库里，照常回收。
   * 连接期判定有孤儿（判据同上、且锁没人持有）时，插件在连上之后跑一次，见 `worktree-startup-reclaim.ts`。
   */
  async prune(): Promise<readonly string[]> {
    const { records, heldKeys, mainAdapter } = await this.#runEnabled(async (executor, adapter) => ({
      records: await executor.getRepository(Worktree).find({ where: { combinator: 'and', rules: [] } }),
      heldKeys: await readHeldKeys(executor),
      mainAdapter: adapter
    }));
    const pruned: string[] = [];
    const failures: unknown[] = [];
    for (const record of records) {
      if (!isPrunable(record, heldKeys, this.#options !== undefined)) continue;
      const release = await holdWorktreeLock(this.#lockName(record.id), true);
      if (!release) continue;
      try {
        if (record.mode === 'writable') await this.#dropWritable(record.id);
        else await this.#reclaim(record, mainAdapter, this.#requireOptions());
        pruned.push(record.id);
      } catch (error) {
        failures.push(error);
      } finally {
        await release();
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, `${failures.length} 个检出位没回收掉`);
    return pruned;
  }

  /**
   * 开一个可写检出位：登记、持有分支、建那套影子表、播种，一笔主库事务做完；建好不挂，本上下文认领它。
   *
   * @param branchId - 要在检出位里检出的分支；本地要有完整数据
   * @param options - 见 {@link WorktreeAddOptions}
   * @returns 登记行
   * @throws {@link WorktreeUnavailableError} `unsupported_adapter`：主库适配器建不了表集；`branch_not_found` /
   * `branch_not_materialized`；`invalid_name` / `name_taken`：给的名字是空的或已被另一个可写检出位用了；
   * 运行时没有 Web Locks（`locks_unavailable`）
   * @throws {@link WorktreeBranchHeldError} 分支已被持有：主检出位正停在它上面，或另一个可写检出位持有它（git：`already used by worktree`）
   *
   * @remarks
   * 播种 = 主表集的行原样复制，再叠上「主检出位所在分支 → 这条分支」的增量，与切过去读到的逐行一致；都不记进变更日志。
   * 不推进激活态：主检出位的工作树、当前分支与 `activationRevision` 一处不动；这套表自己的激活态行在同一笔事务里建
   * （检出位里切分支只推进它，B2.2）。没给名字时取分支 id，被占了就加 `-2`、`-3`。
   * GitHub Desktop 建完会切过去，对应 {@link WorktreeManager.mount}。
   */
  async add(branchId: string, options: WorktreeAddOptions = {}): Promise<Worktree> {
    const id = uuid();
    const members = worktreeTableSetMembers(this.#rxdb);
    const tableSet = WorktreeTableSet.of(tableSetSuffixOf(id), members);
    // 新 id 上的锁不会被别人占着；登记行写下之前就握住，别处的 prune() 才不会把建好的检出位当孤儿收走
    const release = (await holdWorktreeLock(this.#lockName(id)))!;
    try {
      const record = await this.#runEnabled(async (executor, adapter) => {
        const host = tableSetHostOf(adapter);
        const name =
          options.name === undefined ?
            await defaultCheckoutName(executor, branchId)
          : await assertCheckoutName(executor, options.name);
        await assertBranchReadable(executor, branchId);
        await holdBranch(executor, branchId, tableSet);
        await assertSwitchTargetIntact(executor, branchId);
        const branchRepository = executor.getRepository(RxDBBranch);
        const changeRepository = executor.getRepository(RxDBChange);
        const [main] = await branchRepository.find({ where: WorktreeTableSet.MAIN.heldBranchWhere, limit: 1 });
        if (!main) throw new RxDBError('主检出位没有 active 分支：开不了可写检出位');
        const actions = await compute_switch_branch_actions({ branchRepository, changeRepository }, branchId, main.id);
        await host.createWorktreeTableSet(executor, tableSet, {
          branchId,
          actions: keep_table_set_actions(this.#rxdb, actions, tableSet)
        });
        const row = this.#writableRecord({
          id,
          branchId,
          name,
          owner: options.owner ?? 'persistent',
          tableSet,
          schemaFingerprint: computeRxDBSchemaFingerprint(members),
          sourceBranchId: main.id,
          sourceChangeId: (await get_branch_max_change(changeRepository, main.id))?.id ?? null,
          targetChangeId: (await get_branch_max_change(changeRepository, branchId))?.id ?? null
        });
        await executor.saveMany([row]);
        await openActivationRow(executor, this.#rxdb.entityManager, tableSet);
        return row;
      });
      this.#claims.set(id, { release, suffix: tableSet.suffix });
      return record;
    } catch (error) {
      await release();
      throw error;
    }
  }

  /**
   * 让主实例挂上一个可写检出位：此后读写都落在那套影子表上，捕获、提交记在它持有的分支上。
   *
   * @param id - 检出位 id（{@link WorktreeManager.list} 里那一行）
   * @throws {@link WorktreeUnavailableError} `in_use`：它被别处认领着；`not_found`：不是已建好的可写检出位，或它持有的分支已经不在了；
   * `schema_mismatch`：建它之后应用的实体结构变了
   *
   * @remarks
   * 没认领的先认领（拿下它的锁），挂不上就还掉。换挂换的是整个实例：实体缓存清空、活查询全部重跑、撤销栈跟着换到那条分支。
   * 已经挂在它上面时什么也不做。
   */
  async mount(id: string): Promise<void> {
    const release = this.#claims.has(id) ? undefined : await this.#acquire(id);
    try {
      const tableSet = await this.#runEnabled(async executor => {
        const [record] = await findRecords(executor, id);
        if (!record || record.mode !== 'writable' || record.state !== 'ready' || record.tableSetSuffix === null) {
          throw new WorktreeUnavailableError('not_found', `没有已建好的可写检出位 ${id}`);
        }
        const members = worktreeTableSetMembers(this.#rxdb);
        if (record.schemaFingerprint !== computeRxDBSchemaFingerprint(members)) {
          throw new WorktreeUnavailableError('schema_mismatch', `可写检出位 ${id} 建好之后应用的实体结构变了`);
        }
        const set = WorktreeTableSet.of(record.tableSetSuffix, members);
        const [held] = await executor.getRepository(RxDBBranch).find({ where: set.heldBranchWhere, limit: 1 });
        if (!held) throw new WorktreeUnavailableError('not_found', `可写检出位 ${id} 持有的分支已经不在了`);
        await executor.getRepository(Worktree).update(record, { lastAccessedAt: new Date() });
        return set;
      });
      if (release) this.#claims.set(id, { release, suffix: tableSet.suffix });
      if (this.#rxdb.worktreeTableSet.suffix !== tableSet.suffix) await this.#rxdb.mountWorktreeTableSet(tableSet);
    } catch (error) {
      if (release) {
        this.#claims.delete(id);
        await release();
      }
      throw error;
    }
  }

  /** 让主实例挂回主检出位；认领着的可写检出位照旧认领着。 */
  async mountMain(): Promise<void> {
    await this.#rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
  }

  /**
   * 交出对一个可写检出位的认领：挂在它上面就先挂回主检出位，再还锁。表集、持有键与登记行都留着。
   *
   * @param id - 检出位 id；本上下文没认领它时什么也不做
   *
   * @remarks
   * 持久归属的之后任何一处都能再 {@link WorktreeManager.mount}；会话归属的留给 `prune()` 回收。
   */
  async release(id: string): Promise<void> {
    const claim = this.#claims.get(id);
    if (!claim) return;
    if (this.#rxdb.worktreeTableSet.suffix === claim.suffix) await this.mountMain();
    this.#claims.delete(id);
    await claim.release();
  }

  /**
   * 删掉一个可写检出位：挂在它上面就先挂回主检出位，再一笔事务删表集、放开持有的分支、删登记行。
   *
   * @param id - 检出位 id；登记行已经不在时什么也不做
   * @throws {@link WorktreeUnavailableError} `in_use`：它被别处认领着；`not_found`：它是只读检出位（用视图的 `close()`）
   *
   * @remarks
   * 未提交的改动留在分支上：检出位里的写都记进了那条分支的变更日志，之后切过去照样读得到（git 删 worktree 时它们会丢，这里不会）。
   */
  async remove(id: string): Promise<void> {
    const release = this.#claims.get(id)?.release ?? (await this.#acquire(id));
    try {
      const [record] = await this.#runEnabled(executor => findRecords(executor, id));
      if (!record) return;
      if (record.mode !== 'writable') {
        throw new WorktreeUnavailableError('not_found', `检出位 ${id} 是只读检出位：用视图的 close() 关掉它`);
      }
      if (this.#rxdb.worktreeTableSet.suffix === record.tableSetSuffix) await this.mountMain();
      await this.#dropWritable(id);
    } finally {
      this.#claims.delete(id);
      await release();
    }
  }

  /**
   * 给一个可写检出位改名（GitHub Desktop 的 Rename…）。
   *
   * @param id - 检出位 id
   * @param name - 新名字：去掉首尾空白后不能为空，不能与另一个可写检出位重名
   * @returns 改名之后的登记行
   * @throws {@link WorktreeUnavailableError} `invalid_name` / `name_taken`；`not_found`：没有这个检出位，或它是只读检出位
   *
   * @remarks
   * 主检出位没有登记行，改不了名。名字只是给人看的标签：表集、持有键与锁都按 id 走，改名不碰它们，也不用认领。
   */
  async rename(id: string, name: string): Promise<Worktree> {
    return this.#runEnabled(async executor => {
      const [record] = await findRecords(executor, id);
      if (record?.mode !== 'writable') throw new WorktreeUnavailableError('not_found', `没有可写检出位 ${id}`);
      const trimmed = await assertCheckoutName(executor, name, id);
      return executor.getRepository(Worktree).update(record, { name: trimmed });
    });
  }

  /** 拿下一个检出位的锁；拿不到就是别处认领着。 */
  async #acquire(id: string): Promise<WorktreeLockRelease> {
    const release = await holdWorktreeLock(this.#lockName(id), true);
    if (!release) throw new WorktreeUnavailableError('in_use', `检出位 ${id} 正在别处打开着`);
    return release;
  }

  /** 一笔事务删掉一个可写检出位：表集、持有键、这套表的激活态行、登记行；登记行已经不在就什么都不做。 */
  async #dropWritable(id: string): Promise<void> {
    await this.#runEnabled(async (executor, adapter) => {
      const [record] = await findRecords(executor, id);
      if (!record) return;
      if (record.tableSetSuffix === null) throw new RxDBError(`可写检出位 ${id} 的登记行没有表集后缀`);
      const tableSet = WorktreeTableSet.of(record.tableSetSuffix, []);
      await tableSetHostOf(adapter).dropWorktreeTableSet(executor, tableSet);
      await releaseBranch(executor, tableSet);
      await dropActivationRow(executor, tableSet);
      await executor.getRepository(Worktree).remove(record);
    });
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
      await markSnapshotComplete(built, snapshotAdapter);
      await sealSnapshot(snapshotAdapter);
      await this.#runEnabled(async executor => {
        const record = await findRecord(executor, identity.id);
        await executor.getRepository(Worktree).update(record, { ...source, state: 'ready' });
      });
      return this.#view(identity, built, snapshotAdapter, release);
    } catch (error) {
      // 清理失败不盖住原错：没清掉的登记行与快照库在下次 prune() 时按登记行回收
      await Promise.allSettled([this.#abandon(identity.id, snapshot, snapshotAdapter)]);
      throw error;
    }
  }

  /**
   * 没建成的检出位怎么收尾：连上过的照常删库、删登记行；没连上的只断开，登记行留作 `building`。
   *
   * @remarks
   * 没连上的快照库一个字节都不删：连接失败可能正是标记迁移发现它不是快照库。可存储也可能已经建出来了——
   * 适配器在连接期建库，迁移或建表失败时库已落盘。这时再删登记行，就是先删登记、后（不）删库，
   * 留下一个谁也找不到的库（见 `worktree.entity.ts` 的顺序不变量）。登记行留着，下一次 `prune()` 按它重连：
   * 标记迁移要么证明那是快照库（删掉），要么报 `adapter_mismatch`（不是快照库，不删，行留着等人处理）。
   */
  async #abandon(id: string, snapshot: RxDB | undefined, snapshotAdapter: LocalRxDBAdapter | undefined): Promise<void> {
    if (snapshot && snapshotAdapter) return this.#discard(id, snapshot, snapshotAdapter);
    await snapshot?.disconnectAll();
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
        try {
          await settle(true);
        } catch (error) {
          // 旧视图没收干净（删库撞上占用等）：新视图交不出去，调用方拿不到也关不掉它，一并关掉再报错。
          // 关它失败不盖住原错：锁已放开，会话归属的留给 prune() 回收，持久归属的还能 attach() 再打开
          await Promise.allSettled([next.close()]);
          throw error;
        }
        return next;
      },
      close: () => settle(true),
      release: () => settle(false)
    };
  }

  /** 断开快照实例、删快照库、删登记行：先删库再删登记。只收连上过的快照库，没连上的见 `#abandon`。 */
  async #discard(id: string, snapshot: RxDB, snapshotAdapter: LocalRxDBAdapter): Promise<void> {
    await snapshot.disconnectAll();
    await snapshotAdapter.dropStorage!();
    await this.#unregister(id);
  }

  /** 回收一个没人在用的只读检出位：先确认它是快照库，再删库、删登记行。 */
  async #reclaim(record: Worktree, mainAdapter: LocalRxDBAdapter, worktrees: WorktreeOptions): Promise<void> {
    if (record.dbName === null) throw new RxDBError(`只读检出位 ${record.id} 的登记行没有快照库名`);
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
      mode: 'read_only',
      kind: isWorktreeCommitTarget(target) ? 'commit' : 'branch',
      branchId,
      commitId: isWorktreeCommitTarget(target) ? target.commitId : null,
      sourceBranchId: null,
      sourceChangeId: null,
      targetChangeId: null,
      dbName,
      tableSetSuffix: null,
      name: null,
      owner,
      state: 'building',
      schemaFingerprint: computeRxDBSchemaFingerprint(copied),
      createdAt: now,
      lastAccessedAt: now
    } satisfies Worktree);
    return record;
  }

  #writableRecord(identity: WritableRecordIdentity): Worktree {
    const now = new Date();
    const record = this.#rxdb.entityManager.instantiate(Worktree);
    Object.assign(record, {
      id: identity.id,
      mode: 'writable',
      kind: 'branch',
      branchId: identity.branchId,
      commitId: null,
      sourceBranchId: identity.sourceBranchId,
      sourceChangeId: identity.sourceChangeId,
      targetChangeId: identity.targetChangeId,
      dbName: null,
      tableSetSuffix: identity.tableSet.suffix,
      name: identity.name,
      owner: identity.owner,
      state: 'ready',
      schemaFingerprint: identity.schemaFingerprint,
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

/** 本上下文对一个可写检出位的认领：握着的锁，与它那套表的后缀（判断此刻挂没挂在它上面）。 */
interface WritableClaim {
  readonly release: WorktreeLockRelease;
  readonly suffix: string | null;
}

/** 可写检出位登记行里由打开流程决定的那几列。 */
interface WritableRecordIdentity {
  readonly id: string;
  readonly branchId: string;
  readonly name: string;
  readonly owner: WorktreeOwner;
  readonly tableSet: WorktreeTableSet;
  readonly schemaFingerprint: string;
  readonly sourceBranchId: string;
  readonly sourceChangeId: number | null;
  readonly targetChangeId: number | null;
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
