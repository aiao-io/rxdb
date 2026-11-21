import { assertUsableBranchId, type RxDBBranch } from '@aiao/rxdb';
import type { MergePreview } from '@aiao/rxdb-plugin-history';

/** 校验后台允许创建的本地配置分支标识。 */
export function normalizeAdminConfigBranchId(value: string): string {
  const branchId = value.trim();
  try {
    assertUsableBranchId(branchId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '分支标识不符合工作树规则。';
    throw new Error(`分支名称无效：${reason}`, { cause: error });
  }
  if (branchId === 'main') throw new Error('主分支不能通过此入口创建。');
  return branchId;
}

/** 把合并预览中的冲突条目数量转换为 UI 可用的阻塞计数。 */
export function mergeAdminConfigConflictCount(preview: MergePreview | null): number {
  return preview?.entries.filter(entry => entry.conflict !== null).length ?? 0;
}

/** 把合并预览转换为管理员可直接理解的状态文案。 */
export function describeAdminConfigMerge(preview: MergePreview): string {
  const conflicts = mergeAdminConfigConflictCount(preview);
  return conflicts > 0 ? `发现 ${conflicts} 项冲突，解决后才能合并和发布。` : `预览通过，没有冲突，可合并 ${preview.merged} 项变更。`;
}

/** 分支列表中供配置页展示的稳定字段。 */
export interface AdminConfigBranchView {
  readonly id: string;
  readonly parentId: string | null;
  readonly activated: boolean;
  readonly local: boolean;
  readonly remote: boolean;
  readonly createdAt: Date | null;
}

/** 从 RxDB 系统分支行提取不会暴露系统关系的展示模型。 */
export function toAdminConfigBranchView(branch: RxDBBranch): AdminConfigBranchView {
  return {
    id: branch.id,
    parentId: branch.parentId ?? null,
    activated: branch.activated,
    local: branch.local,
    remote: branch.remote,
    createdAt: branch.createdAt ?? null
  };
}
