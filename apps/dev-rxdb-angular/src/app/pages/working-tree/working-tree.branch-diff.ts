import type {
  BranchComparison,
  BranchDiffEntry,
  BranchDiffOperation,
  MergePreview,
  MergePreviewConflict,
  MergePreviewEntry
} from '@aiao/rxdb-plugin-history';
import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { formatFieldValue } from './working-tree.diff-format';
import { gdEntryPath } from './working-tree.gd';

/**
 * @fileoverview 分支对比与合并预览的列表排版（纯函数，三端同名移植）。
 *
 * @remarks
 * 两个对话框共用这一份：对比列出 `compareBranches()` 的条目，合并预览列出 `previewMerge()` 的条目并多一行覆盖说明。
 * 条目的 `patch` 是新值、`inversePatch` 是旧值，与工作树差异同一个语义，所以复用它的取值排版与图标。
 */

/** 列表里不展示的列：主键、审计与簿记字段。 */
const HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'remoteId'
]);

/** 缺失侧（新增前、删除后）的占位符。 */
const MISSING = '—';

/** 对话框里一次只读请求的三态；页面持有，对话框只做展示。 */
export type BranchDiffLoad<T> =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'success'; readonly value: T };

/** 一个字段的前后值，已排成展示文本。 */
export interface BranchDiffField {
  readonly key: string;
  readonly before: string;
  readonly after: string;
}

/** 列表里的一行。 */
export interface BranchDiffRow {
  /** 列表 key：`namespace:entity:entityId` */
  readonly key: string;
  /** 与工作树差异同一套操作名，图标、颜色、文案直接复用 */
  readonly operation: WorkingTreeDiffEntry['operation'];
  /** 展示路径：`schema/表名/实体id` */
  readonly path: string;
  /** 写入或删掉的业务字段 */
  readonly fields: readonly BranchDiffField[];
  /** 覆盖说明；没有覆盖时为 `null` */
  readonly conflict: string | null;
}

/** 历史插件的大写操作名 → 工作树差异的小写操作名。 */
export const toEntryOperation = (operation: BranchDiffOperation): WorkingTreeDiffEntry['operation'] =>
  operation === 'INSERT' ? 'insert'
  : operation === 'DELETE' ? 'delete'
  : 'update';

/**
 * 覆盖标注 → 一句话说明。
 *
 * @param conflict - 预览条目上的标注
 * @param target - 合并的目标分支（当前分支），说明里点名改动是谁的
 */
export const conflictText = (conflict: MergePreviewConflict, target: string): string => {
  switch (conflict.kind) {
    case 'overwrite':
      return `Overwrites ${target}'s changes to ${conflict.fields.join(', ')}`;
    case 'delete_edited':
      return `Deletes it, discarding ${target}'s changes to ${conflict.fields.join(', ')}`;
    case 'update_deleted':
      // 目标里没有这一行：分叉以来删了它，或者它是两边分开之后由源的上游分支建的——两种情形合并都落空
      return `${target} doesn't have it, so these changes are dropped`;
    case 'revive_deleted':
      return `${target} deleted it; merging brings it back`;
  }
};

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * 合并预览的一句话摘要。
 *
 * @remarks
 * 计数用 `merged`（与随后 `mergeBranch()` 返回的一致，跟着策略变）；撞上目标分支改动的按实体数另起一句。
 */
export const mergePreviewSummary = (preview: MergePreview): string => {
  if (preview.merged === 0) return `Nothing to merge from ${preview.sourceBranchId}.`;
  const merging = `Merges ${counted(preview.merged, 'change', 'changes')} from ${preview.sourceBranchId} into ${preview.targetBranchId}.`;
  const overlapping = preview.entries.filter(entry => entry.conflict !== null).length;
  if (overlapping === 0) return merging;
  return `${merging} ${counted(overlapping, 'entity overlaps', 'entities overlap')} with changes made on ${preview.targetBranchId}.`;
};

/** 分支对比的一句话摘要。 */
export const comparisonSummary = (comparison: BranchComparison): string => {
  const between = `between ${comparison.fromBranchId} and ${comparison.toBranchId}.`;
  if (comparison.entries.length === 0) return `No differences ${between}`;
  return `${counted(comparison.entries.length, 'entity differs', 'entities differ')} ${between}`;
};

const sideText = (row: Record<string, unknown> | null, key: string): string =>
  row !== null && Object.hasOwn(row, key) ? formatFieldValue(row[key]) : MISSING;

/**
 * 一个对比或预览条目 → 列表行。
 *
 * @param entry - `compareBranches()` 或 `previewMerge()` 的条目
 * @param target - 合并的目标分支；只有预览条目的覆盖说明用得到
 */
export const branchDiffRow = (entry: BranchDiffEntry | MergePreviewEntry, target: string): BranchDiffRow => {
  const written = entry.patch ?? entry.inversePatch ?? {};
  const fields = Object.keys(written)
    .filter(key => !HIDDEN_FIELDS.has(key))
    .map(key => ({ key, before: sideText(entry.inversePatch, key), after: sideText(entry.patch, key) }));
  const conflict = 'conflict' in entry && entry.conflict !== null ? conflictText(entry.conflict, target) : null;
  return {
    key: `${entry.namespace}:${entry.entity}:${String(entry.entityId)}`,
    operation: toEntryOperation(entry.operation),
    path: gdEntryPath({ namespace: entry.namespace, entity: entry.entity, entityId: String(entry.entityId) }),
    fields,
    conflict
  };
};
