import { IRxDBChange } from '../system/system.interface.js';
import { SwitchVersionActions } from './VersionManager.interface.js';
import { getRxDBChangeKey } from './VersionManager.utils.js';

/**
 * 压缩变更列表为 SwitchVersionActions（专用于 Push 场景）
 *
 * 使用状态机逻辑处理变更压缩，针对 Push 场景特化：
 * - 本地新建后删除的数据（INSERT → DELETE 且 inversePatch 为 null）不需要 push
 * - 远程已有数据的删除（inversePatch 不为 null）必须 push DELETE
 *
 * @param changes - 原始变更列表（会自动按 id 排序）
 * @returns 压缩后的操作集合
 *
 * @example
 * ```typescript
 * // 场景1：本地新建后删除（不需要 push）
 * const changes1 = [
 *   { type: 'INSERT', entityId: '1', patch: { name: 'Alice' }, inversePatch: null },
 *   { type: 'DELETE', entityId: '1', patch: null, inversePatch: null }
 * ];
 * const actions1 = compactChanges(changes1);
 * // actions1.deletes.size === 0（本地数据，服务器从未见过，不需要通知删除）
 *
 * // 场景2：远程数据被删除（必须 push DELETE）
 * const changes2 = [
 *   { type: 'UPDATE', entityId: '1', patch: { name: 'Bob' }, inversePatch: { name: 'Alice' } },
 *   { type: 'DELETE', entityId: '1', patch: null, inversePatch: { name: 'Bob' } }
 * ];
 * const actions2 = compactChanges(changes2);
 * // actions2.deletes.size === 1（服务器有这条数据，必须通知删除）
 * ```
 *
 * @remarks
 * **压缩规则（Push 专用）**：
 * - `INSERT → DELETE` + `inversePatch === null` → 抵消（本地新建，服务器从未见过）
 * - `INSERT → DELETE` + `inversePatch !== null` → 保留 DELETE（服务器已有旧数据）
 * - `INSERT → UPDATE*` → 合并为 INSERT（一次性插入最终状态）
 * - `UPDATE → UPDATE*` → 合并为 UPDATE（合并所有 patch）
 * - `UPDATE → DELETE` → 保留 DELETE（服务器必须知道数据被删除）
 *
 * **与 `get_switch_version_actions` 的区别**：
 * - `get_switch_version_actions`：分支切换场景，`INSERT → DELETE` 完全抵消
 * - `compactChanges`：Push 场景，基于 `inversePatch` 判断是否需要通知服务器
 */
export function compactChanges<T extends IRxDBChange>(
  changes: T[],
  actions: SwitchVersionActions = {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  }
): SwitchVersionActions {
  // 按 id 正序排序，确保变更顺序正确
  const sortedChanges = [...changes].sort((a, b) => a.id - b.id);

  for (const change of sortedChanges) {
    const changeKey = getRxDBChangeKey(change);
    switch (change.type) {
      case 'INSERT':
        // 清除同 key 之前的 DELETE：显式复用已删除实体 id 重新创建时，
        // 一个 key 不能同时挂在 deletes 和 inserts 两个 Map 里，
        // 否则下游 push 批次会把同一批原始变更计入两次（重复 sourceChanges）
        actions.deletes.delete(changeKey);
        actions.updates.delete(changeKey);
        // 浅拷贝：actions 不得持有源 change.patch 的引用，否则后续 Object.assign 合并
        // 会原地改写源 change（可能是 EntityManager 缓存实例），污染缓存
        actions.inserts.set(changeKey, {
          patch: { ...change.patch! },
          inversePatch: change.inversePatch ? { ...change.inversePatch } : null
        });
        break;

      case 'UPDATE':
        {
          const existingInsert = actions.inserts.get(changeKey);
          const existingUpdate = actions.updates.get(changeKey);
          if (existingInsert) {
            // 合并到 INSERT：只更新 patch，不修改 inversePatch
            // inversePatch 必须保持原始的 INSERT inversePatch（表示服务器上的初始状态）
            if (existingInsert.patch && change.patch) {
              Object.assign(existingInsert.patch, change.patch);
            }
            // 注意：不修改 existingInsert.inversePatch
            // 如果 INSERT 的 inversePatch 是 null，说明是本地新建，必须保持 null
          } else if (existingUpdate) {
            // 合并到 UPDATE
            if (change.patch) {
              if (existingUpdate.patch) {
                // 两者都存在，合并
                Object.assign(existingUpdate.patch, change.patch);
              } else {
                // 旧的是 null，直接替换（拷贝避免持有源引用）
                existingUpdate.patch = { ...change.patch };
              }
            }
            // 处理 inversePatch：已跟踪字段保留最早值（批次开始前的真实旧值），
            // 只补上尚未跟踪的新字段 —— 顺序不能反，否则 change.inversePatch 里
            // 批内中间态会覆盖 existingUpdate 里更原始的值，破坏 revert 语义
            if (existingUpdate.inversePatch === null && change.inversePatch) {
              existingUpdate.inversePatch = { ...change.inversePatch };
            } else if (existingUpdate.inversePatch && change.inversePatch) {
              existingUpdate.inversePatch = { ...change.inversePatch, ...existingUpdate.inversePatch };
            }
          } else {
            // 新建 UPDATE
            actions.updates.set(changeKey, {
              patch: { ...change.patch! },
              inversePatch: change.inversePatch ? { ...change.inversePatch } : (change.inversePatch as never)
            });
          }
        }
        break;

      case 'DELETE':
        {
          // 关键判断：是否需要 push DELETE
          const previousInsert = actions.inserts.get(changeKey);

          // 清除所有之前的操作
          actions.inserts.delete(changeKey);
          actions.updates.delete(changeKey);

          // 判断规则：
          // 1. 如果之前有 INSERT 且 inversePatch 为 null → 本地新建后删除，不需要 push
          // 2. 如果之前有 INSERT 但 inversePatch 不为 null → 服务器有旧数据，需要 push DELETE
          // 3. 如果之前有 UPDATE → 服务器必定有数据，需要 push DELETE
          // 4. 如果之前什么都没有 → 直接删除远程数据，需要 push DELETE
          const isLocalOnlyInsert = previousInsert && previousInsert.inversePatch === null;

          if (!isLocalOnlyInsert) {
            // 非"本地新建"场景，需要通知服务器删除
            actions.deletes.set(changeKey, {
              patch: null,
              inversePatch: change.inversePatch!
            });
          }
          // else: 本地新建后删除，完全抵消，不在任何 Map 中
        }
        break;
    }
  }

  return actions;
}
