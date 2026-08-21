/**
 * @fileoverview 恢复被删除实体的纯逻辑
 *
 * 从 {@link VersionManager.restoreEntity} 抽出的独立实现，遵循
 * `create_branch` / `merge_branch` 的「接收 VersionManager 实例」模式。
 */

import { EntityType } from '../entity/entity.interface.js';
import { RestoreEntityOptions } from '../rxdb-adapter.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
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
  await adapter.switchBranch({ branchId: currentBranch.id, actions });

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
