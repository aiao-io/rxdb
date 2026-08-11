import { RxDBBranch } from '@aiao/rxdb';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 创建分支
 *
 * 从当前分支或指定变更点创建新分支
 *
 * @param adapter - PGlite 适配器实例
 * @param branchId - 新分支 ID
 * @param fromChangeId - 可选，从指定变更点创建分支
 * @returns 创建的分支实体
 *
 * @example
 * ```typescript
 * // 从当前分支创建新分支
 * const branch = await rxdb_adapter_create_branch(adapter, 'feature-01');
 *
 * // 从指定变更点创建分支
 * const branch = await rxdb_adapter_create_branch(adapter, 'feature-02', 42);
 * ```
 */
export default async (
  adapter: RxDBAdapterPGlite,
  branchId: string,
  fromChangeId?: number
): Promise<InstanceType<typeof RxDBBranch>> => {
  const localRxDBBranch = adapter.localRxDBBranch();
  const localRxDBChange = adapter.localRxDBChange();

  // 检查分支 ID 是否已存在
  const existingBranches = await localRxDBBranch.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: branchId }]
    },
    limit: 1
  });

  if (existingBranches.length > 0) {
    throw new RxdbAdapterPGliteError(`Branch ID (${branchId}) already exists`);
  }

  // 确定源分支
  let fromBranch: InstanceType<typeof RxDBBranch> | undefined;

  if (fromChangeId) {
    // 从指定变更点创建分支 - 需要找到包含该变更的分支
    const changeRecord = await localRxDBChange.get(fromChangeId);
    if (!changeRecord) {
      throw new RxdbAdapterPGliteError(`Change ID (${fromChangeId}) not found`);
    }
    if (!changeRecord.branchId) {
      throw new RxdbAdapterPGliteError(`Change record (${fromChangeId}) has no branchId`);
    }
    fromBranch = await localRxDBBranch.get(changeRecord.branchId);
  } else {
    // 从当前活跃分支创建
    const activeBranches = await localRxDBBranch.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      },
      limit: 1
    });
    fromBranch = activeBranches[0];
  }

  if (!fromBranch) {
    throw new RxdbAdapterPGliteError('Source branch not found');
  }

  // 找出源分支的最后一个变更记录（如果没有指定 fromChangeId）
  if (!fromChangeId) {
    const lastChanges = await localRxDBChange.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: fromBranch.id },
          { field: 'revertChangeId', operator: '=', value: null }
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }],
      limit: 1
    });
    fromChangeId = lastChanges[0]?.id ?? null;
  }

  // 创建新分支
  const branch = new RxDBBranch();
  branch.id = branchId;
  branch.activated = false;
  branch.local = true;
  branch.remote = false;
  branch.fromChangeId = fromChangeId ?? null;
  branch.parentId = fromBranch.id;

  return await localRxDBBranch.create(branch);
};
