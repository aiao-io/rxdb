/**
 * @fileoverview 恢复被删除实体的纯逻辑
 *
 * 从 {@link VersionManager.restoreEntity} 抽出的独立实现，遵循
 * `create_branch` / `merge_branch` 的「接收 VersionManager 实例」模式。
 */

import {
  declareTrustedWrite,
  EntityType,
  getEntityMetadata,
  RestoreEntityOptions,
  RxDBError,
  TrustedWriteIntent
} from '@aiao/rxdb';
import { get_switch_version_actions } from './switch-branch-actions.js';
import type { VersionManager } from './VersionManager.js';

/**
 * 恢复被删除的实体。
 *
 * 根据 RxDBChange 记录中的 inversePatch 重新插入实体，
 * 恢复操作本身会生成新的 RxDBChange 记录（可被 push 到远程）。
 *
 * @param vm - 版本管理器实例
 * @param entity - 被删除的实体实例（需要包含 metadata 信息）
 * @param options - 恢复选项，包含 changeId（DELETE 类型的 RxDBChange 记录 ID）
 * @returns 恢复后的实体实例
 */
export async function restore_entity<T extends EntityType>(
  vm: VersionManager,
  entity: InstanceType<T>,
  options: RestoreEntityOptions
): Promise<InstanceType<T>> {
  const { changeRepository, adapter } = await vm.getLocalRepositories();

  const changes = await changeRepository.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: Number(options.changeId) }]
    },
    limit: 1
  });

  if (changes.length === 0) {
    throw new RxDBError(`RxDBChange not found: ${options.changeId}`);
  }

  const change = changes[0];

  if (change.type !== 'DELETE') {
    throw new RxDBError(`Cannot restore from non-DELETE change (type=${change.type})`);
  }

  if (!change.inversePatch) {
    throw new RxDBError(`RxDBChange ${options.changeId} has no inversePatch`);
  }

  const EntityType = entity.constructor as T;
  const metadata = getEntityMetadata(EntityType);
  const currentBranch = await vm.getCurrentBranch();

  // 身份校验必须在写入之前：只校验 changeId/type/inversePatch 时，传 A 的实体配 B 的 changeId
  // 会真的把 B 恢复出来，再用 A 的 constructor 去查 —— 返回 undefined，而返回类型声明是非空的
  // InstanceType<T>。分支同理：别的分支的 change 不能应用到当前分支。
  if (change.namespace !== metadata.namespace || change.entity !== metadata.name) {
    throw new RxDBError(
      `RxDBChange ${options.changeId} belongs to ${change.namespace}:${change.entity}, ` +
        `not ${metadata.namespace}:${metadata.name}`
    );
  }
  if (change.branchId != null && change.branchId !== currentBranch.id) {
    throw new RxDBError(
      `RxDBChange ${options.changeId} belongs to branch '${change.branchId}', current branch is '${currentBranch.id}'`
    );
  }

  const actions = get_switch_version_actions([change], false);
  // 不能走 switchBranch：各适配器的 switch_branch 第一步就是 remove_all_triggers_sql
  // （见 sqlite-core / pglite 的 version/switch_branch.ts），恢复出来的行不会产生任何 change 行——
  // 本函数的 TSDoc 说「恢复操作本身会生成新的 RxDBChange 记录（可被 push 到远程）」直接落空，
  // 远端永远停在「已删除」，本地与远端静默分叉。
  // 改走 mergeChanges(actions, undefined, false)：与 merge_branch 的 squash 出口同路，
  // disableTriggers=false 让数据库触发器照常记账。
  // 恢复是重算领域状态，不是一次新的用户编辑。
  //
  // 只有一次写，本来不需要事务。开事务是为了**拿到一个执行器当声明的作用域**：声明存在一个
  // WeakMap 里，每个作用域只存一条（`trusted-write-scope.ts`），而工作树的
  // `interceptMergeChanges()` 是排队拿到事务之后才取声明的（`capture-hook.ts`）。绑在适配器
  // 实例上时，一次恢复与一次并发的压缩合并会互相覆盖：先执行的取到后声明者的意图，
  // 后执行的取不到声明被当作未知入口拒绝（`merge-branch.ts` 的压缩出口同理，两边的并发用例在
  // `__tests__/trusted-write-concurrency.spec.ts`）。执行器是「这一次写」独有的对象。
  //
  // 第二个参数（transactionLog）显式传 false，理由同 `merge-branch.ts` 的压缩出口：这一层只借
  // 执行器当声明作用域。默认 true 会给这次写出的 change 行盖上 transactionId，
  // `history-item-builder.ts` 于是把这条恢复显示成 `'TRANSACTION'` 而不是它自己的类型（如
  // INSERT）——TSDoc 承诺的是一条普通的 RxDBChange 记录，不是被特殊分组的事务记录。
  await adapter.transaction(async executor => {
    declareTrustedWrite(executor, {
      file: 'restore-entity.ts',
      symbol: 'restore_entity',
      intent: TrustedWriteIntent.restore_entity
    });
    await executor.mergeChanges(actions, undefined, false);
  }, false);

  const repo = adapter.getRepository(EntityType);
  const restored = await repo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: change.entityId }]
    },
    limit: 1
  });

  // 返回类型是非空的 InstanceType<T>，恢复不出行时必须抛错而不是让 undefined 冒充实体
  if (!restored[0]) {
    throw new RxDBError(
      `Restore produced no row for ${metadata.namespace}:${metadata.name} id=${String(change.entityId)}`
    );
  }

  return restored[0] as InstanceType<T>;
}
