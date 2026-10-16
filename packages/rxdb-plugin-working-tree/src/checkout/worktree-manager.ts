/**
 * @fileoverview `rxdb.workingTree.checkouts`：只读检出位的入口（US-313）。
 *
 * @remarks
 * 打开一个检出位是三笔主库事务夹着快照库的建立：
 *
 * 1. 校验目标、写登记行（`building`）——先登记再建库，崩在后面任何一步，回收时都按登记行找得到库；
 * 2. 连上快照实例（建表在这一步，不占着主库）；主库一笔事务里算增量、读业务表、写进快照库；
 *    快照库封成只读；
 * 3. 登记行转 `ready`，记下主库当时停在哪。
 *
 * 三笔都经工作树门面的受管事务（`WorkingTreeManager.runEnabled`）：与工作树的其它命令同一道门禁，
 * 未启用的库上拒绝。
 */

import type { EntityType, LocalRxDBAdapter, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { computeRxDBSchemaFingerprint, RxDBBranch, RxDBError, uuid } from '@aiao/rxdb';
import { classifyBranchMaterialization } from '../working-tree/branch-materialization.js';
import { worktreeCopiedEntities, worktreeDeclaredEntities, worktreeEntityOf } from './worktree-entities.js';
import { WorktreeUnavailableError } from './worktree-errors.js';
import type { WorktreeOptions } from './worktree-options.js';
import {
  assertSnapshotSource,
  connectSnapshotDatabase,
  createSnapshotDatabase,
  importSnapshot,
  sealSnapshot
} from './worktree-snapshot.js';
import { Worktree } from './worktree.entity.js';

/** 检出位的 HEAD：一条分支。 */
export interface WorktreeBranchTarget {
  /** 目标分支 id；可以是 active 分支自己 */
  readonly branchId: string;
}

/** 检出位的 HEAD。 */
export type WorktreeTarget = WorktreeBranchTarget;

/** 一个打开着的只读检出位。 */
export interface WorktreeView {
  /** 检出位 id，即登记行的主键 */
  readonly id: string;
  /** 打开时给的 HEAD */
  readonly target: WorktreeTarget;
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
   * 按主库现状重建。
   *
   * @returns 新的视图；本视图随之关闭
   */
  refresh(): Promise<WorktreeView>;
  /** 关闭只读实例并撤销登记；重复调用无副作用 */
  close(): Promise<void>;
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
   * @param runEnabled - 门面的受管事务；三笔事务都经它的门禁
   * @param options - 插件的 `worktrees` 选项
   */
  constructor(rxdb: RxDB, runEnabled: WorktreeTransactionRunner, options: WorktreeOptions | undefined) {
    this.#rxdb = rxdb;
    this.#runEnabled = runEnabled;
    this.#options = options;
  }

  /**
   * 以只读方式打开一条分支的完整数据，不切换分支、不动工作树。
   *
   * @param target - 目标分支
   * @returns 打开着的视图；用完 {@link WorktreeView.close}
   * @throws {@link WorktreeUnavailableError} 没配置快照库、后端不支持、分支不存在或本地只有 metadata
   */
  async open(target: WorktreeTarget): Promise<WorktreeView> {
    const options = this.#options;
    if (!options) {
      throw new WorktreeUnavailableError('not_configured', '装工作树插件时没给 worktrees.adapter');
    }
    const copied = worktreeCopiedEntities(this.#rxdb);
    const id = uuid();
    const dbName = `${this.#rxdb.config.dbName}~wt~${id}`;
    const mainAdapter = await this.#runEnabled(async (executor, adapter) => {
      assertSnapshotSource(adapter);
      await assertBranchReadable(executor, target.branchId);
      await executor.saveMany([this.#record(id, target, dbName, copied)]);
      return adapter;
    });

    let snapshot: RxDB | undefined;
    try {
      snapshot = createSnapshotDatabase(mainAdapter, dbName, worktreeDeclaredEntities(this.#rxdb, copied), options);
      const snapshotAdapter = await connectSnapshotDatabase(snapshot);
      const built = snapshot;
      const source = await this.#runEnabled((executor, adapter) =>
        importSnapshot(executor, adapter, built, copied, target.branchId)
      );
      await sealSnapshot(snapshotAdapter);
      await this.#runEnabled(async executor => {
        const record = await findRecord(executor, id);
        await executor.getRepository(Worktree).update(record, { ...source, state: 'ready' });
      });
      return this.#view(id, target, built);
    } catch (error) {
      // 清理失败不盖住原错：留下的登记行与快照库在回收时按登记行找得到
      await Promise.allSettled([snapshot?.disconnectAll(), this.#unregister(id)]);
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

  #record(id: string, target: WorktreeTarget, dbName: string, copied: readonly EntityType[]): Worktree {
    const now = new Date();
    const record = this.#rxdb.entityManager.instantiate(Worktree);
    Object.assign(record, {
      id,
      kind: 'branch',
      branchId: target.branchId,
      commitId: null,
      sourceBranchId: null,
      sourceChangeId: null,
      targetChangeId: null,
      dbName,
      owner: 'session',
      state: 'building',
      schemaFingerprint: computeRxDBSchemaFingerprint(copied),
      createdAt: now,
      lastAccessedAt: now
    } satisfies Worktree);
    return record;
  }

  #view(id: string, target: WorktreeTarget, snapshot: RxDB): WorktreeView {
    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await snapshot.disconnectAll();
      await this.#unregister(id);
    };
    return {
      id,
      target,
      rxdb: snapshot,
      entityOf: EntityClass => worktreeEntityOf(snapshot, EntityClass),
      refresh: async () => {
        const next = await this.open(target);
        await close();
        return next;
      },
      close
    };
  }

  async #unregister(id: string): Promise<void> {
    await this.#runEnabled(async executor => {
      const [record] = await findRecords(executor, id);
      if (record) await executor.getRepository(Worktree).remove(record);
    });
  }
}

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
