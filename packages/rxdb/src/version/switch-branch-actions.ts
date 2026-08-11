import { EntityStaticType } from '../entity/entity.interface.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBChange } from '../system/change.js';
import { LocalRxDBChangeRepository } from '../system/types.local.js';
import { find_switch_branch_step } from './find-switch-branch-step.js';
import { SwitchVersionActions } from './VersionManager.interface.js';
import { VersionManager } from './VersionManager.js';
import { getRxDBChangeKey } from './VersionManager.utils.js';

/**
 * 计算切换分支所需的操作
 * @param version
 * @param branchId 要切换到的分支ID
 * @returns 返回切换分支所需的操作序列
 */
export const switch_branch_actions = async (version: VersionManager, branchId: string) => {
  const { branchRepository, changeRepository } = await version.getLocalRepositories();
  const current_branch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      },
      limit: 1
    })
  )[0];
  if (!current_branch) throw new RxDBError('Current branch not found');
  const all_branches = await branchRepository.find({
    where: {
      combinator: 'and',
      rules: []
    }
  });
  const next_branch = all_branches.find(b => b.id === branchId);
  if (!next_branch) throw new RxDBError(`Branch (${branchId}) not found`);
  if (current_branch.id === next_branch.id) {
    throw new RxDBError('Cannot switch to the same branch');
  }

  const currentChange = await get_branch_max_change(changeRepository, current_branch.id);
  const nextChange = await get_branch_max_change(changeRepository, next_branch.id);

  const steps = find_switch_branch_step({
    branches: all_branches,
    currentBranch: current_branch,
    currentChangeId: currentChange ? currentChange.id : null,
    nextBranch: next_branch,
    nextChangeId: nextChange ? nextChange.id : null
  });

  const actions: SwitchVersionActions = {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  };

  for (let i = 0; i < steps.length; i++) {
    const { branch, fromChangeId, toChangeId } = steps[i];
    const is_patch = fromChangeId < toChangeId;
    const is_inverse_patch = fromChangeId > toChangeId;

    // 构建查询条件：查询 fromChangeId 和 toChangeId 之间的变更
    // 注意：区间是开区间 (min, max]，不包含起点但包含终点
    // 因为起点代表的状态已经存在，只需要应用之后的变更
    const minId = Math.min(fromChangeId, toChangeId);
    const maxId = Math.max(fromChangeId, toChangeId);

    const options: EntityStaticType<typeof RxDBChange, 'findAllOptions'> = {
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: branch.id },
          { field: 'id', operator: '>', value: minId },
          { field: 'id', operator: '<=', value: maxId },
          { field: 'revertChangeId', operator: '=', value: null }
        ]
      }
    };

    // 对于子分支，需要额外限制：不处理 branch.fromChangeId 及之前的变更
    // 因为这些变更属于父分支的历史，不属于当前子分支的变更范围
    // 注意：这个限制对 is_patch 和 is_inverse_patch 都适用
    if (branch.fromChangeId) {
      // 已经通过 minId > branch.fromChangeId 限制过了
      // 所以这里不需要额外处理，minId 已经确保大于 branch.fromChangeId
      // 但为了代码清晰，明确检查一下
      if (minId < branch.fromChangeId) {
        options.where.rules.push({ field: 'id', operator: '>', value: branch.fromChangeId });
      }
    }
    const changes = await changeRepository.find(options);
    if (is_inverse_patch) {
      inverse_patch_all(changes, actions);
    } else if (is_patch) {
      patch_all(changes, actions);
    }
  }
  return actions;
};

/**
 * 应用所有补丁
 * @param changes 需要计算的 changes
 * @param actions 现有的操作结果
 */
const patch_all = (changes: RxDBChange[], actions?: SwitchVersionActions) =>
  get_switch_version_actions(changes, true, actions);

/**
 * 反向应用所有补丁
 * @param changes 需要计算的 changes
 * @param actions 现有的操作结果
 */
const inverse_patch_all = (changes: RxDBChange[], actions?: SwitchVersionActions) =>
  get_switch_version_actions(changes, false, actions);

/**
 * 计算切换版本所需的操作
 * @param changes 需要计算的 changes
 * @param options
 */
export const get_switch_version_actions = (
  changes: RxDBChange[],
  isPatch: boolean,
  actions: SwitchVersionActions = {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  }
): SwitchVersionActions => {
  if (isPatch) {
    const need_changes = [...changes].sort((a, b) => a.id - b.id);
    for (const change of need_changes) {
      const changeKey = getRxDBChangeKey(change);
      switch (change.type) {
        case 'INSERT':
          // 浅拷贝：actions 不得持有 change.patch 的引用，否则后续 Object.assign 合并会原地
          // 改写源 change（可能是 EntityManager 缓存实例），污染缓存
          actions.inserts.set(changeKey, {
            patch: { ...change.patch! },
            inversePatch: null
          });
          break;
        case 'UPDATE':
          {
            const existing = actions.inserts.get(changeKey) || actions.updates.get(changeKey);
            if (existing) {
              // 合并补丁：正向补丁累加，反向补丁保持最早的
              if (existing.patch && change.patch) {
                Object.assign(existing.patch, change.patch);
              }
              if (existing.inversePatch === null && change.inversePatch) {
                existing.inversePatch = { ...change.inversePatch };
              } else if (existing.inversePatch && change.inversePatch) {
                Object.assign(existing.inversePatch, change.inversePatch);
              }
            } else {
              actions.updates.set(changeKey, {
                patch: { ...change.patch! },
                inversePatch: { ...change.inversePatch! }
              });
            }
          }
          break;
        case 'DELETE':
          actions.deletes.set(changeKey, {
            patch: null,
            inversePatch: { ...change.inversePatch! }
          });
          actions.inserts.delete(changeKey);
          actions.updates.delete(changeKey);
          break;
      }
    }
  } else {
    const need_changes = [...changes].sort((a, b) => b.id - a.id);
    for (const change of need_changes) {
      const changeKey = getRxDBChangeKey(change);
      switch (change.type) {
        case 'INSERT':
          // 浅拷贝的理由同正向分支：actions 不得持有 change 的补丁引用，
          // 否则后续 Object.assign 合并会原地改写源 change（可能是 EntityManager 缓存实例）
          actions.deletes.set(changeKey, {
            patch: null,
            inversePatch: { ...change.patch! }
          });
          actions.inserts.delete(changeKey);
          actions.updates.delete(changeKey);
          break;
        case 'UPDATE':
          {
            // 同时查 inserts：逆向按 id 降序处理，撤销 DELETE 会先落一条 inserts，
            // 紧接着更早的 UPDATE 必须并进那条 inserts。只查 updates 会让同一实体
            // 同时出现在 inserts 与 updates 两张表里。
            const existing = actions.inserts.get(changeKey) || actions.updates.get(changeKey);
            if (existing) {
              // 反向合并：正向补丁用 inversePatch，反向补丁用 patch
              if (existing.patch && change.inversePatch) {
                Object.assign(existing.patch, change.inversePatch);
              }
              if (existing.inversePatch && change.patch) {
                Object.assign(existing.inversePatch, change.patch);
              }
            } else {
              actions.updates.set(changeKey, {
                patch: { ...change.inversePatch! },
                inversePatch: { ...change.patch! }
              });
            }
          }
          break;
        case 'DELETE':
          actions.inserts.set(changeKey, {
            patch: { ...change.inversePatch! },
            inversePatch: null
          });
          break;
      }
    }
  }
  return actions;
};

const get_branch_max_change = async (changeRepository: LocalRxDBChangeRepository, branchId: string) => {
  const changes = await changeRepository.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: branchId },
        { field: 'revertChangeId', operator: '=', value: null }
      ]
    },
    orderBy: [{ field: 'id', sort: 'desc' }],
    limit: 1
  });
  return changes[0];
};
