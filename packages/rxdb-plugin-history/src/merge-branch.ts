import {
  declareTrustedWrite,
  getRxDBChangeKey,
  MergeBranchOptions,
  MergeBranchResult,
  RxDBError,
  SwitchVersionActions,
  TrustedWriteIntent
} from '@aiao/rxdb';
import { VersionManager } from './VersionManager.js';
import { remove_branch } from './remove-branch.js';
import { get_switch_version_actions } from './switch-branch-actions.js';

/**
 * 合并分支
 *
 * 将源分支的变更合并到当前激活分支（目标分支）。
 *
 * 支持两种策略：
 * - `squash`（默认）：将源分支所有变更压缩为最小操作集后应用，过滤幽灵操作（源分支内
 *   INSERT 后又 DELETE 的实体不会影响目标分支）
 * - `normal`：逐条应用源分支变更，每条变更在目标分支产生独立的变更记录，不过滤幽灵操作
 *
 * 合并后可选删除源分支。
 *
 * @param version - VersionManager 实例
 * @param sourceBranchId - 源分支 ID
 * @param currentBranchId - 当前激活分支 ID（由调用方提供，避免重复查询）
 * @param options - 合并选项
 * @returns 合并结果
 */
export const merge_branch = async (
  version: VersionManager,
  sourceBranchId: string,
  currentBranchId: string,
  options?: MergeBranchOptions
): Promise<MergeBranchResult> => {
  const strategy = options?.strategy ?? 'squash';
  const deleteSource = options?.deleteSource ?? false;

  const { branchRepository, changeRepository, adapter } = await version.getLocalRepositories();

  // 验证：源分支不能是目标分支
  if (sourceBranchId === currentBranchId) {
    throw new RxDBError(`Cannot merge branch '${sourceBranchId}' into itself`);
  }

  // 验证：源分支必须存在
  const sourceBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: sourceBranchId }]
      },
      limit: 1
    })
  )[0];

  if (!sourceBranch) {
    throw new RxDBError(`Branch '${sourceBranchId}' not found`);
  }

  // 查询源分支从 fromChangeId 之后的所有有效变更
  const sourceChanges = await changeRepository.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: sourceBranchId },
        { field: 'revertChangeId', operator: '=', value: null },
        ...(sourceBranch.fromChangeId != null ?
          [{ field: 'id' as const, operator: '>' as const, value: sourceBranch.fromChangeId }]
        : [])
      ]
    },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });

  /**
   * 删源分支：合并落库之后的收尾动作。
   *
   * 失败不上抛 —— 合并已经落库且触发器已生成目标分支的变更记录，把它判成整体失败会让
   * 调用方重试，normal 策略下就是二次合并。这里只如实返回「没删成」与原因。
   */
  const doDeleteSource = async (): Promise<{ deleted: boolean; error?: Error }> => {
    if (!deleteSource) return { deleted: false };
    try {
      await remove_branch(version, sourceBranchId);
      return { deleted: true };
    } catch (error) {
      return { deleted: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  };

  const toResult = (mergedCount: number, deleteResult: { deleted: boolean; error?: Error }): MergeBranchResult => ({
    merged: mergedCount,
    strategy,
    sourceDeleted: deleteResult.deleted,
    ...(deleteResult.error ? { sourceDeleteError: deleteResult.error } : {})
  });

  // 空分支：无变更需要合并
  if (sourceChanges.length === 0) {
    return toResult(0, await doDeleteSource());
  }

  let merged: number;

  if (strategy === 'normal') {
    // normal 策略：逐条应用源分支变更，每条变更在目标分支产生独立的变更记录。
    //
    // 整个循环必须在**一个**事务里：单次 mergeChanges 在适配器内部虽已是事务，
    // 但 N 次就是 N 个独立事务 —— 第 k 条失败时前 k-1 条已落库、触发器也已在目标分支
    // 生成对应 RxDBChange，留下「合了一半」的状态。
    //
    // 循环内必须调 `executor.mergeChanges` 而非 `adapter.mergeChanges`：持有 executor 才算
    // 在本事务内。旧写法靠适配器的环境态推断「已在事务中就复用」，那正是 C2 要拆掉的东西 ——
    // 翻转后它会从「复用当前事务」变成「重新排队」，排在自己身后直接自锁。
    await adapter.transaction(async executor => {
      for (const change of sourceChanges) {
        const singleActions: SwitchVersionActions = {
          deletes: new Map(),
          updates: new Map(),
          inserts: new Map()
        };
        const key = getRxDBChangeKey(change);
        if (change.type === 'INSERT') {
          singleActions.inserts.set(key, { patch: change.patch!, inversePatch: null });
        } else if (change.type === 'UPDATE') {
          singleActions.updates.set(key, { patch: change.patch!, inversePatch: change.inversePatch! });
        } else if (change.type === 'DELETE') {
          singleActions.deletes.set(key, { patch: null, inversePatch: change.inversePatch! });
        }
        // 声明写在循环体内：声明是取用即清除的，提到循环外只有第一条变更带得上身份。
        declareTrustedWrite(executor, {
          file: 'merge-branch.ts',
          symbol: 'merge_branch',
          intent: TrustedWriteIntent.merge_per_change
        });
        await executor.mergeChanges(singleActions, undefined, false);
      }
    });
    merged = sourceChanges.length;
  } else {
    // squash 策略：压缩为目标分支最终状态的最小操作集
    const actions = get_switch_version_actions(sourceChanges, true);

    // 过滤幽灵删除：在源分支内创建后又删除的实体，对目标分支无净贡献
    const createdInSource = new Set(sourceChanges.filter(c => c.type === 'INSERT').map(c => getRxDBChangeKey(c)));
    for (const key of createdInSource) {
      if (actions.deletes.has(key)) {
        actions.deletes.delete(key);
      }
    }

    merged = actions.inserts.size + actions.updates.size + actions.deletes.size;

    if (merged === 0) {
      return toResult(0, await doDeleteSource());
    }

    // 应用变更到当前分支的实体表
    // disableTriggers=false：让数据库触发器自动生成目标分支的 RxDBChange 记录
    //
    // 压缩只有一次写，本来不需要事务。开事务是为了**拿到一个执行器当声明的作用域**：
    // 声明存在一个 WeakMap 里，每个作用域只存一条（`trusted-write-scope.ts`），而工作树的
    // `interceptMergeChanges()` 是排队拿到事务之后才取声明的（`capture-hook.ts`）。绑在
    // 适配器实例上时，两个并发的适配器级写会互相覆盖：先执行的取到后声明者的意图，
    // 后执行的取不到声明被当作未知入口拒绝（`__tests__/trusted-write-concurrency.spec.ts`）。
    // 执行器是「这一次写」独有的对象，于是并发与否都不会串台。
    //
    // 与逐条出口同一个符号、不同意图：登记表把它们分成两行，因为压缩与逐条的判定不同，
    // 合成一行会让其中一条策略失去登记。
    //
    // 第二个参数（transactionLog）显式传 false：这一层只借执行器当声明作用域，不该把合并记成
    // 一次事务化的历史条目。默认 true 会为本次事务启用一个 transactionId（SQLite 系后端按分支
    // 重建全部触发器，PGlite 设一个事务局部变量），写出的每条 change 行都盖上它，
    // `history-item-builder.ts` 的 `type = transactionId ? 'TRANSACTION' : first_change.type`
    // 随即把 squash 产生的多条 change 折叠成一条 `'TRANSACTION'`——undo 粒度从「按实体」
    // 变成「整次合并一起撤销」。传 false，历史记账与不包这层事务时一致（调用契约锁在
    // `__tests__/merge-branch.spec.ts`，分组结果锁在 pglite 的 `version/merge_branch.spec.ts`）。
    await adapter.transaction(async executor => {
      declareTrustedWrite(executor, {
        file: 'merge-branch.ts',
        symbol: 'merge_branch',
        intent: TrustedWriteIntent.merge_squash
      });
      await executor.mergeChanges(actions, undefined, false);
    }, false);
  }

  return toResult(merged, await doDeleteSource());
};
